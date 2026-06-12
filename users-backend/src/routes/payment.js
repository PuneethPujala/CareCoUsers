const express = require('express');
const crypto = require('crypto');
const logger = require('../utils/logger');
const Patient = require('../models/Patient');
const ProcessedWebhook = require('../models/ProcessedWebhook');
const AuditLog = require('../models/AuditLog');
const { activateSubscription } = require('./users/patients');

const router = express.Router();

router.post('/webhook', async (req, res) => {
    try {
        const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
        
        let provider = req.query.provider;
        if (!provider) {
            if (req.headers['stripe-signature']) {
                provider = 'stripe';
            } else if (req.headers['x-razorpay-signature']) {
                provider = 'razorpay';
            }
        }

        if (!provider) {
            return res.status(400).json({ error: 'Webhook provider could not be determined.' });
        }

        // 1. Verify Signature
        const isTest = process.env.NODE_ENV === 'test';
        if (provider === 'stripe') {
            const sigHeader = req.headers['stripe-signature'];
            if (!sigHeader) {
                return res.status(400).json({ error: 'Missing stripe-signature header' });
            }
            const secret = process.env.STRIPE_WEBHOOK_SECRET || 'test_stripe_secret';
            
            // For testing and security, manually verify the stripe signature to avoid extra dependencies
            try {
                const parts = sigHeader.split(',');
                const tPart = parts.find(p => p.startsWith('t='));
                const v1Part = parts.find(p => p.startsWith('v1='));
                if (!tPart || !v1Part) {
                    throw new Error('Invalid stripe-signature format');
                }

                const timestamp = tPart.split('=')[1];
                const signature = v1Part.split('=')[1];

                // Verify timestamp tolerance if not in test env
                if (!isTest) {
                    const tolerance = 300; // 5 minutes
                    const now = Math.floor(Date.now() / 1000);
                    if (Math.abs(now - parseInt(timestamp, 10)) > tolerance) {
                        throw new Error('Webhook timestamp out of tolerance');
                    }
                }

                const expectedData = `${timestamp}.${rawBody}`;
                const expectedSignature = crypto
                    .createHmac('sha256', secret)
                    .update(expectedData)
                    .digest('hex');

                if (signature !== expectedSignature) {
                    throw new Error('Invalid signature');
                }
            } catch (err) {
                logger.warn('Stripe webhook signature verification failed', { error: err.message });
                try {
                    await AuditLog.createLog({
                        supabaseUid: 'system_webhook',
                        action: 'webhook_signature_verification_failed',
                        resourceType: 'system',
                        outcome: 'failure',
                        details: { provider: 'stripe', error: err.message, ip: req.ip },
                        securityFlags: [{
                            type: 'compliance_violation',
                            severity: 'critical',
                            description: `Stripe webhook signature verification failed: ${err.message}`
                        }]
                    });
                    
                    const { triggerSystemAlert } = require('../services/observabilityService');
                    await triggerSystemAlert('Critical', 'Stripe Webhook Signature Verification Failed', `Stripe signature check failed: ${err.message}. IP: ${req.ip}`);
                } catch (e) {
                    logger.error('Failed to log Stripe signature verification failure:', e);
                }
                return res.status(400).json({ error: `Signature verification failed: ${err.message}` });
            }

        } else if (provider === 'razorpay') {
            const signature = req.headers['x-razorpay-signature'];
            if (!signature) {
                return res.status(400).json({ error: 'Missing x-razorpay-signature header' });
            }
            const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_razorpay_secret';

            const expectedSignature = crypto
                .createHmac('sha256', secret)
                .update(rawBody)
                .digest('hex');

            if (signature !== expectedSignature) {
                logger.warn('Razorpay webhook signature verification failed');
                try {
                    await AuditLog.createLog({
                        supabaseUid: 'system_webhook',
                        action: 'webhook_signature_verification_failed',
                        resourceType: 'system',
                        outcome: 'failure',
                        details: { provider: 'razorpay', ip: req.ip },
                        securityFlags: [{
                            type: 'compliance_violation',
                            severity: 'critical',
                            description: 'Razorpay webhook signature verification failed'
                        }]
                    });

                    const { triggerSystemAlert } = require('../services/observabilityService');
                    await triggerSystemAlert('Critical', 'Razorpay Webhook Signature Verification Failed', `Razorpay signature check failed. IP: ${req.ip}`);
                } catch (e) {
                    logger.error('Failed to log Razorpay signature verification failure:', e);
                }
                return res.status(400).json({ error: 'Signature verification failed' });
            }
        } else {
            return res.status(400).json({ error: `Unsupported provider: ${provider}` });
        }

        // 2. Parse Event Details
        let eventObj;
        try {
            eventObj = JSON.parse(rawBody);
        } catch (err) {
            return res.status(400).json({ error: 'Invalid JSON payload' });
        }

        let eventId;
        let eventType;
        let patientId;
        let planId = 'basic';

        if (provider === 'stripe') {
            eventId = eventObj.id;
            eventType = eventObj.type;
            
            if (eventType === 'checkout.session.completed') {
                const sessionObj = eventObj.data?.object;
                patientId = sessionObj?.client_reference_id || sessionObj?.metadata?.patientId;
                planId = sessionObj?.metadata?.planId || 'basic';
            }
        } else if (provider === 'razorpay') {
            eventId = eventObj.id || eventObj.payload?.payment?.entity?.id || req.headers['x-razorpay-signature'];
            eventType = eventObj.event;
            
            if (eventType === 'payment.captured') {
                const paymentObj = eventObj.payload?.payment?.entity;
                patientId = paymentObj?.notes?.patientId;
                planId = paymentObj?.notes?.planId || 'basic';
            }
        }

        if (!eventId || !eventType) {
            return res.status(400).json({ error: 'Missing event ID or event type' });
        }

        // 3. Idempotency Check
        try {
            await ProcessedWebhook.create({ eventId, provider, type: eventType });
        } catch (err) {
            if (err.code === 11000) {
                logger.info('Duplicate webhook event ignored', { eventId, provider });
                return res.status(200).json({ received: true, duplicate: true });
            }
            throw err;
        }

        // 4. Handle Activation Events
        const activationEvents = ['checkout.session.completed', 'payment.captured'];
        if (activationEvents.includes(eventType)) {
            if (!patientId) {
                logger.warn('Patient ID missing in webhook metadata', { eventId, eventType });
                return res.status(400).json({ error: 'Patient ID missing in webhook metadata' });
            }

            const patient = await Patient.findById(patientId);
            if (!patient) {
                logger.error('Patient not found for webhook activation', { patientId, eventId });
                // Log failure to audit log
                await AuditLog.createLog({
                    supabaseUid: 'system_webhook',
                    action: 'payment_activation_failed',
                    resourceType: 'patient',
                    outcome: 'failure',
                    details: { eventId, provider, type: eventType, reason: 'Patient profile not found', patientId }
                });
                return res.status(400).json({ error: 'Patient profile not found.' });
            }

            // Activate/extend subscription
            const updatedPatient = await activateSubscription(patient, planId);

            // Log success to audit log
            await AuditLog.createLog({
                supabaseUid: updatedPatient.supabase_uid || 'system_webhook',
                action: 'payment_activation_success',
                resourceType: 'patient',
                resourceId: updatedPatient._id,
                outcome: 'success',
                details: { eventId, provider, type: eventType, planId }
            });

            logger.info('Webhook subscription activation successful', { patientId: updatedPatient._id, eventId });
        } else {
            logger.info('Non-activation webhook event processed', { eventId, eventType });
        }

        return res.status(200).json({ received: true });
    } catch (error) {
        logger.error('Webhook error', { error: error.message });
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
