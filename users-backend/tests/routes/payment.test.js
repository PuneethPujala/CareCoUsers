process.env.NODE_ENV = 'test';

const request = require('supertest');
const crypto = require('crypto');
const app = require('../../src/server');
const Patient = require('../../src/models/Patient');
const ProcessedWebhook = require('../../src/models/ProcessedWebhook');
const AuditLog = require('../../src/models/AuditLog');
const patientsRouter = require('../../src/routes/users/patients');

jest.mock('../../src/models/Patient');
jest.mock('../../src/models/ProcessedWebhook');
jest.mock('../../src/models/AuditLog', () => ({
    createLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/observabilityService', () => ({
    triggerSystemAlert: jest.fn().mockResolvedValue(undefined),
    checkSystemHealth: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/routes/users/patients', () => {
    const express = require('express');
    const router = express.Router();
    router.activateSubscription = jest.fn();
    router.subscribeAndSeedDemoData = jest.fn();
    return router;
});

describe('Payment Webhook API', () => {
    const stripeSecret = 'test_stripe_secret';
    const razorpaySecret = 'test_razorpay_secret';

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.STRIPE_WEBHOOK_SECRET = stripeSecret;
        process.env.RAZORPAY_WEBHOOK_SECRET = razorpaySecret;
    });

    describe('Stripe Webhook Verification & Processing', () => {
        it('should return 400 if stripe-signature header is missing', async () => {
            const res = await request(app)
                .post('/api/payment/webhook?provider=stripe')
                .send({ id: 'evt_123' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Missing stripe-signature header');
        });

        it('should return 400 if signature is invalid', async () => {
            const res = await request(app)
                .post('/api/payment/webhook?provider=stripe')
                .set('stripe-signature', 't=123,v1=wrongsignature')
                .send({ id: 'evt_123' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Signature verification failed');
        });

        it('should successfully process valid Stripe checkout.session.completed and activate subscription', async () => {
            const patientMock = {
                _id: '507f1f77bcf86cd799439011',
                email: 'test@caremymed.in',
                supabase_uid: 'sup-patient-123',
            };

            Patient.findById.mockResolvedValue(patientMock);
            ProcessedWebhook.create.mockResolvedValue({});
            patientsRouter.activateSubscription.mockResolvedValue(patientMock);

            const payloadObj = {
                id: 'evt_stripe_ok_123',
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: 'cs_test_123',
                        client_reference_id: '507f1f77bcf86cd799439011',
                        metadata: {
                            planId: 'premium_monthly'
                        }
                    }
                }
            };
            const payloadStr = JSON.stringify(payloadObj);
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const expectedData = `${timestamp}.${payloadStr}`;
            const signature = crypto.createHmac('sha256', stripeSecret).update(expectedData).digest('hex');
            const sigHeader = `t=${timestamp},v1=${signature}`;

            const res = await request(app)
                .post('/api/payment/webhook?provider=stripe')
                .set('stripe-signature', sigHeader)
                .set('Content-Type', 'application/json')
                .send(payloadStr);

            expect(res.status).toBe(200);
            expect(res.body.received).toBe(true);

            expect(ProcessedWebhook.create).toHaveBeenCalledWith({
                eventId: 'evt_stripe_ok_123',
                provider: 'stripe',
                type: 'checkout.session.completed'
            });

            expect(Patient.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
            expect(patientsRouter.activateSubscription).toHaveBeenCalledWith(patientMock, 'premium_monthly');
            expect(AuditLog.createLog).toHaveBeenCalledWith(expect.objectContaining({
                supabaseUid: 'sup-patient-123',
                action: 'payment_activation_success',
                outcome: 'success'
            }));
        });

        it('should return 200 OK and short-circuit (idempotency) if event has already been processed', async () => {
            const duplicateError = new Error('Duplicate key');
            duplicateError.code = 11000;
            ProcessedWebhook.create.mockRejectedValue(duplicateError);

            const payloadObj = {
                id: 'evt_stripe_duplicate',
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: 'cs_test_123',
                        client_reference_id: '507f1f77bcf86cd799439011'
                    }
                }
            };
            const payloadStr = JSON.stringify(payloadObj);
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const expectedData = `${timestamp}.${payloadStr}`;
            const signature = crypto.createHmac('sha256', stripeSecret).update(expectedData).digest('hex');
            const sigHeader = `t=${timestamp},v1=${signature}`;

            const res = await request(app)
                .post('/api/payment/webhook?provider=stripe')
                .set('stripe-signature', sigHeader)
                .set('Content-Type', 'application/json')
                .send(payloadStr);

            expect(res.status).toBe(200);
            expect(res.body.duplicate).toBe(true);
            
            // Should stop processing immediately after ProcessedWebhook.create fails
            expect(Patient.findById).not.toHaveBeenCalled();
            expect(patientsRouter.activateSubscription).not.toHaveBeenCalled();
        });

        it('should return 400 Bad Request if patient does not exist', async () => {
            Patient.findById.mockResolvedValue(null);
            ProcessedWebhook.create.mockResolvedValue({});

            const payloadObj = {
                id: 'evt_stripe_missing_patient',
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: 'cs_test_123',
                        client_reference_id: '507f1f77bcf86cd799439011'
                    }
                }
            };
            const payloadStr = JSON.stringify(payloadObj);
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const expectedData = `${timestamp}.${payloadStr}`;
            const signature = crypto.createHmac('sha256', stripeSecret).update(expectedData).digest('hex');
            const sigHeader = `t=${timestamp},v1=${signature}`;

            const res = await request(app)
                .post('/api/payment/webhook?provider=stripe')
                .set('stripe-signature', sigHeader)
                .set('Content-Type', 'application/json')
                .send(payloadStr);

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Patient profile not found.');

            expect(AuditLog.createLog).toHaveBeenCalledWith(expect.objectContaining({
                supabaseUid: 'system_webhook',
                action: 'payment_activation_failed',
                outcome: 'failure'
            }));
        });
    });

    describe('Razorpay Webhook Verification & Processing', () => {
        it('should return 400 if x-razorpay-signature header is missing', async () => {
            const res = await request(app)
                .post('/api/payment/webhook?provider=razorpay')
                .send({ event: 'payment.captured' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Missing x-razorpay-signature header');
        });

        it('should return 400 if Razorpay signature is invalid', async () => {
            const res = await request(app)
                .post('/api/payment/webhook?provider=razorpay')
                .set('x-razorpay-signature', 'wrongsignature')
                .send({ event: 'payment.captured' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Signature verification failed');
        });

        it('should successfully process valid Razorpay payment.captured and activate subscription', async () => {
            const patientMock = {
                _id: '507f1f77bcf86cd799439011',
                email: 'test@caremymed.in',
                supabase_uid: 'sup-patient-123',
            };

            Patient.findById.mockResolvedValue(patientMock);
            ProcessedWebhook.create.mockResolvedValue({});
            patientsRouter.activateSubscription.mockResolvedValue(patientMock);

            const payloadObj = {
                id: 'evt_rzp_ok_123',
                event: 'payment.captured',
                payload: {
                    payment: {
                        entity: {
                            id: 'pay_rzp_123',
                            amount: 49900,
                            notes: {
                                patientId: '507f1f77bcf86cd799439011',
                                planId: 'premium_annual'
                            }
                        }
                    }
                }
            };
            const payloadStr = JSON.stringify(payloadObj);
            const signature = crypto.createHmac('sha256', razorpaySecret).update(payloadStr).digest('hex');

            const res = await request(app)
                .post('/api/payment/webhook?provider=razorpay')
                .set('x-razorpay-signature', signature)
                .set('Content-Type', 'application/json')
                .send(payloadStr);

            expect(res.status).toBe(200);
            expect(res.body.received).toBe(true);

            expect(ProcessedWebhook.create).toHaveBeenCalledWith({
                eventId: 'evt_rzp_ok_123',
                provider: 'razorpay',
                type: 'payment.captured'
            });

            expect(Patient.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
            expect(patientsRouter.activateSubscription).toHaveBeenCalledWith(patientMock, 'premium_annual');
            expect(AuditLog.createLog).toHaveBeenCalledWith(expect.objectContaining({
                supabaseUid: 'sup-patient-123',
                action: 'payment_activation_success',
                outcome: 'success'
            }));
        });
    });
});
