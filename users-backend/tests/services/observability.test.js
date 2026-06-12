process.env.NODE_ENV = 'test';

const axios = require('axios');
const { sendEmail } = require('../../src/services/emailService');
const { triggerSystemAlert, checkSystemHealth } = require('../../src/services/observabilityService');
const AuditLog = require('../../src/models/AuditLog');
const AIChatLog = require('../../src/models/AIChatLog');

jest.mock('axios');
jest.mock('../../src/services/emailService', () => ({
    sendEmail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
}));
jest.mock('../../src/models/AuditLog', () => ({
    countDocuments: jest.fn(),
    createLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/models/AIChatLog', () => ({
    countDocuments: jest.fn(),
}));

describe('Observability & System Health Service', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        process.env.ADMIN_EMAIL = 'ops@caremymed.com';
        process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/test';
        process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/test';
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe('triggerSystemAlert', () => {
        it('should send an email and post webhook messages to Slack/Discord on critical/warning alert', async () => {
            axios.post.mockResolvedValue({ status: 200 });

            await triggerSystemAlert('Critical', 'Database Failure', 'MongoDB is not reachable');

            expect(sendEmail).toHaveBeenCalledWith(
                'ops@caremymed.com',
                expect.stringContaining('[CRITICAL]'),
                expect.stringContaining('MongoDB is not reachable')
            );

            expect(axios.post).toHaveBeenCalledWith(
                'https://discord.com/api/webhooks/test',
                expect.objectContaining({
                    content: expect.stringContaining('Database Failure')
                }),
                expect.any(Object)
            );

            expect(axios.post).toHaveBeenCalledWith(
                'https://hooks.slack.com/services/test',
                expect.objectContaining({
                    text: expect.stringContaining('Database Failure')
                }),
                expect.any(Object)
            );
        });

        it('should bypass Discord/Slack webhooks if their environment variables are missing', async () => {
            delete process.env.DISCORD_WEBHOOK_URL;
            delete process.env.SLACK_WEBHOOK_URL;

            await triggerSystemAlert('Warning', 'Minor Hiccup', 'Something small happened');

            expect(sendEmail).toHaveBeenCalled();
            expect(axios.post).not.toHaveBeenCalled();
        });
    });

    describe('checkSystemHealth', () => {
        it('should trigger an alert if chatbot error/fallback rate exceeds 5% of requests', async () => {
            // Simulate 10 total chatbot requests in the last 15 minutes, with 2 errors (20% error rate > 5%)
            AIChatLog.countDocuments
                .mockResolvedValueOnce(10)  // Total
                .mockResolvedValueOnce(2);   // Failed/Fallback

            AuditLog.countDocuments
                .mockResolvedValueOnce(0)   // OCR Total
                .mockResolvedValueOnce(0)   // OCR Failed
                .mockResolvedValueOnce(0)   // Payment Total
                .mockResolvedValueOnce(0);  // Payment Failed

            // Mock triggerSystemAlert inner service
            const observability = require('../../src/services/observabilityService');
            const spyAlert = jest.spyOn(observability, 'triggerSystemAlert').mockImplementation(() => {});

            await checkSystemHealth();

            expect(spyAlert).toHaveBeenCalledWith(
                'Warning',
                'High Chatbot Failure/Fallback Rate',
                expect.stringContaining('20.0%')
            );
        });

        it('should not trigger a chatbot alert if total requests are too low (< 5)', async () => {
            AIChatLog.countDocuments
                .mockResolvedValueOnce(4)   // Total
                .mockResolvedValueOnce(1);   // Failed/Fallback

            AuditLog.countDocuments
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0);

            const observability = require('../../src/services/observabilityService');
            const spyAlert = jest.spyOn(observability, 'triggerSystemAlert').mockImplementation(() => {});

            await checkSystemHealth();

            expect(spyAlert).not.toHaveBeenCalled();
        });

        it('should trigger an alert if OCR failure rate exceeds 10%', async () => {
            AIChatLog.countDocuments
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0);

            // Simulate 5 total OCR requests, with 1 failure (20% failure rate > 10%)
            AuditLog.countDocuments
                .mockResolvedValueOnce(5)   // OCR Total
                .mockResolvedValueOnce(1)   // OCR Failed
                .mockResolvedValueOnce(0)   // Payment Total
                .mockResolvedValueOnce(0);  // Payment Failed

            const observability = require('../../src/services/observabilityService');
            const spyAlert = jest.spyOn(observability, 'triggerSystemAlert').mockImplementation(() => {});

            await checkSystemHealth();

            expect(spyAlert).toHaveBeenCalledWith(
                'Warning',
                'High OCR Extraction Failure Rate',
                expect.stringContaining('20.0%')
            );
        });

        it('should trigger an alert if payment success rate falls below 90%', async () => {
            AIChatLog.countDocuments
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0);

            AuditLog.countDocuments
                .mockResolvedValueOnce(0)   // OCR Total
                .mockResolvedValueOnce(0)   // OCR Failed
                // Simulate 5 total payments, 1 failed (80% success rate < 90%)
                .mockResolvedValueOnce(5)   // Payment Total
                .mockResolvedValueOnce(1);  // Payment Failed

            const observability = require('../../src/services/observabilityService');
            const spyAlert = jest.spyOn(observability, 'triggerSystemAlert').mockImplementation(() => {});

            await checkSystemHealth();

            expect(spyAlert).toHaveBeenCalledWith(
                'Warning',
                'Low Payment Activation Success Rate',
                expect.stringContaining('80.0%')
            );
        });
    });
});
