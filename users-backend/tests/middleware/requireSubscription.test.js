const requireSubscription = require('../../src/middleware/requireSubscription');
const Patient = require('../../src/models/Patient');

jest.mock('../../src/models/Patient');

describe('requireSubscription Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            auth: {
                userType: 'Patient',
                userId: 'patient-123',
                subject: 'sub-123'
            },
            profile: {
                constructor: { modelName: 'Patient' },
                _id: 'patient-123',
                subscription: {
                    status: 'active',
                    expires_at: new Date(Date.now() + 86400000) // tomorrow
                }
            }
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    it('allows patient with active subscription to access route', async () => {
        await requireSubscription(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('blocks patient with expired subscription (returns 402)', async () => {
        req.profile.subscription.expires_at = new Date(Date.now() - 86400000); // yesterday
        await requireSubscription(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(402);
        expect(res.json).toHaveBeenCalledWith({
            error: 'Active subscription required to access this feature.',
            code: 'SUBSCRIPTION_REQUIRED'
        });
    });

    it('blocks patient with pending_payment status (returns 402)', async () => {
        req.profile.subscription.status = 'pending_payment';
        await requireSubscription(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(402);
    });

    it('bypasses subscription check for Companions', async () => {
        req.auth.userType = 'Companion';
        req.profile.constructor.modelName = 'Companion';
        req.profile.role = 'companion';
        await requireSubscription(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('bypasses subscription check for Profile/Staff', async () => {
        req.auth.userType = 'Profile';
        req.profile.constructor.modelName = 'Profile';
        req.profile.role = 'manager';
        await requireSubscription(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('loads patient profile if not pre-populated but auth exists', async () => {
        req.profile = null;
        const mockPatient = {
            constructor: { modelName: 'Patient' },
            _id: 'patient-123',
            subscription: {
                status: 'active',
                expires_at: new Date(Date.now() + 86400000)
            }
        };
        Patient.findOne = jest.fn().mockResolvedValue(mockPatient);

        await requireSubscription(req, res, next);

        expect(Patient.findOne).toHaveBeenCalledWith({ supabase_uid: 'sub-123' });
        expect(req.profile).toBe(mockPatient);
        expect(next).toHaveBeenCalled();
    });
});
