process.env.NODE_ENV = 'test';

function fakeId(val) {
    const s = String(val);
    return { toString: () => s, toJSON: () => s, equals: (o) => s === String(o?._id ?? o) };
}

const mockAuthState = {
    user:    { id: 'patient-user', supabaseUid: 'patient-user' },
    profile: {
        _id:         fakeId('patient-profile-id'),
        supabaseUid: 'patient-user',
        role:        'patient',
        subscription: { status: 'active', expires_at: new Date(Date.now() + 86400000) }
    },
};

// Mock authentication
jest.mock('../../src/middleware/authenticate', () => ({
    authenticate: (req, res, next) => {
        req.user = mockAuthState.user;
        req.profile = mockAuthState.profile;
        req.auth = { 
            userId: mockAuthState.profile?._id, 
            userType: 'Patient'
        };
        next();
    },
    authenticateSession: (req, res, next) => next(),
    optionalAuthenticate: (req, res, next) => next(),
    requireRole: (...allowed) => (req, res, next) => next(),
    requireOrganization: () => (req, res, next) => next(),
    requireOwnership: () => (req, res, next) => next(),
}));

// Mock rate limiters
jest.mock('../../src/middleware/rateLimiter', () => ({
    otpRateLimiter: (req, res, next) => next(),
    aiChatRateLimiter: (req, res, next) => next(),
    aiChatIpRateLimiter: (req, res, next) => next(),
    aiChatPatientRateLimiter: (req, res, next) => next(),
    aiChatSessionRateLimiter: (req, res, next) => next(),
}));

// Mock Mongoose models
jest.mock('../../src/models/AIChatSession');
jest.mock('../../src/models/AuditLog');

const request = require('supertest');
const app = require('../../src/server');
const AIChatSession = require('../../src/models/AIChatSession');

describe('Chatbot Sessions Route Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/chatbot/sessions', () => {
        it('returns active sessions list for the authenticated patient', async () => {
            const mockSessions = [
                { _id: 'session-1', title: 'Diabetes Query', message_count: 5, created_at: new Date().toISOString() }
            ];
            
            AIChatSession.find = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    sort: jest.fn().mockResolvedValue(mockSessions)
                })
            });

            const res = await request(app).get('/api/chatbot/sessions');
            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockSessions);
            expect(AIChatSession.find).toHaveBeenCalledWith(
                expect.objectContaining({ patient_id: mockAuthState.profile._id, is_active: true })
            );
        });
    });

    describe('POST /api/chatbot/sessions', () => {
        it('creates a new chat session when active count is less than 10', async () => {
            AIChatSession.countDocuments = jest.fn().mockResolvedValue(4);
            const mockCreatedSession = {
                _id: 'session-new',
                title: 'New Chat',
                is_active: true,
                message_count: 1,
                messages: [{ role: 'assistant', text: 'Disclaimer text' }]
            };
            AIChatSession.create = jest.fn().mockResolvedValue(mockCreatedSession);

            const res = await request(app).post('/api/chatbot/sessions');
            expect(res.status).toBe(201);
            expect(res.body).toEqual(mockCreatedSession);
            expect(AIChatSession.countDocuments).toHaveBeenCalledWith({
                patient_id: mockAuthState.profile._id,
                is_active: true
            });
            expect(AIChatSession.create).toHaveBeenCalled();
        });

        it('returns 400 when active sessions count is 10 or more', async () => {
            AIChatSession.countDocuments = jest.fn().mockResolvedValue(10);

            const res = await request(app).post('/api/chatbot/sessions');
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Limit reached');
            expect(AIChatSession.create).not.toHaveBeenCalled();
        });
    });

    describe('GET /api/chatbot/sessions/:id', () => {
        it('returns session details if found and matches patient context', async () => {
            const mockSession = {
                _id: 'session-1',
                title: 'Existing Chat',
                messages: [{ role: 'assistant', text: 'Disclaimer' }, { role: 'user', text: 'Hello' }]
            };
            AIChatSession.findOne = jest.fn().mockResolvedValue(mockSession);

            const res = await request(app).get('/api/chatbot/sessions/session-1');
            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockSession);
            expect(AIChatSession.findOne).toHaveBeenCalledWith({
                _id: 'session-1',
                patient_id: mockAuthState.profile._id,
                is_active: true
            });
        });

        it('returns 404 if session is not found', async () => {
            AIChatSession.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app).get('/api/chatbot/sessions/missing-session');
            expect(res.status).toBe(404);
        });
    });

    describe('DELETE /api/chatbot/sessions/:id', () => {
        it('soft deletes the session successfully', async () => {
            AIChatSession.updateOne = jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

            const res = await request(app).delete('/api/chatbot/sessions/session-1');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(AIChatSession.updateOne).toHaveBeenCalledWith(
                { _id: 'session-1', patient_id: mockAuthState.profile._id, is_active: true },
                { $set: { is_active: false } }
            );
        });

        it('returns 404 if session is not matched or already deleted', async () => {
            AIChatSession.updateOne = jest.fn().mockResolvedValue({ matchedCount: 0 });

            const res = await request(app).delete('/api/chatbot/sessions/deleted-session');
            expect(res.status).toBe(404);
        });
    });
});
