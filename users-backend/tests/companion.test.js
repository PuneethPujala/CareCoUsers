process.env.NODE_ENV = 'test';

function fakeId(val) {
    const s = String(val);
    return { toString: () => s, toJSON: () => s, equals: (o) => s === String(o?._id ?? o) };
}

// Shared mutable auth state
const mockAuthState = {
    user:    { id: 'companion-user', supabaseUid: 'companion-user' },
    profile: {
        _id:         fakeId('companion-profile-id'),
        supabaseUid: 'companion-user',
        role:        'companion',
    },
};

// Mocks
jest.mock('../src/middleware/authenticate', () => ({
    authenticate: (req, res, next) => { req.user = mockAuthState.user; req.profile = mockAuthState.profile; next(); },
    authenticateSession: (req, res, next) => { req.user = mockAuthState.user; req.profile = mockAuthState.profile; next(); },
    requireRole: (...allowed) => (req, res, next) => {
        if (!allowed.includes(req.profile.role)) return res.status(403).json({ error: 'Insufficient role permissions', code: 'INSUFFICIENT_ROLE' });
        next();
    },
}));

jest.mock('../src/middleware/authorize', () => ({
    authorize:         () => (req, res, next) => next(),
    authorizeResource: () => (req, res, next) => next(),
    authorizeAny:      () => (req, res, next) => next(),
    authorizeAll:      () => (req, res, next) => next(),
}));

jest.mock('../src/services/auditService', () => ({
    logEvent:               jest.fn().mockResolvedValue(undefined),
    logSecurityEvent:       jest.fn().mockResolvedValue(undefined),
    autoLogAccess:          jest.fn(() => (req, res, next) => next()),
    getUserActivitySummary: jest.fn(),
    getSecurityIncidents:   jest.fn(),
}));

jest.mock('../src/services/tokenService', () => ({
    issueTokenPair: jest.fn().mockResolvedValue({
        access_token:  'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in:    900,
        expires_at:    Math.floor(Date.now() / 1000) + 900,
    }),
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/models/Patient');
jest.mock('../src/models/Profile');
jest.mock('../src/models/CompanionAccess');
jest.mock('../src/models/MedicineLog');
jest.mock('../src/models/VitalLog');
jest.mock('../src/models/Alert');

const request = require('supertest');
const app = require('../src/server');
const Patient = require('../src/models/Patient');
const Profile = require('../src/models/Profile');
const CompanionAccess = require('../src/models/CompanionAccess');
const MedicineLog = require('../src/models/MedicineLog');
const VitalLog = require('../src/models/VitalLog');
const Alert = require('../src/models/Alert');

describe('Companion Routes', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthState.user = { id: 'companion-user', supabaseUid: 'companion-user' };
        mockAuthState.profile = {
            _id:         fakeId('companion-profile-id'),
            supabaseUid: 'companion-user',
            role:        'companion',
        };
    });

    describe('POST /api/companion/join', () => {

        it('returns 400 when required fields are missing', async () => {
            const res = await request(app)
                .post('/api/companion/join')
                .send({ email: 'new@companion.in' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/Invite code/i);
        });

        it('returns 400 when invite code is invalid or expired', async () => {
            Patient.findOne = jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(null)
            });

            const res = await request(app)
                .post('/api/companion/join')
                .send({
                    invite_code: 'EXPIREDCODE',
                    email: 'new@companion.in',
                    password: 'Password123',
                    fullName: 'Companion Name'
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/Invalid or expired/i);
        });

        it('returns 400 when email belongs to an existing Patient', async () => {
            const mockSelect = jest.fn().mockResolvedValue({ _id: 'patient-123' });
            Patient.findOne = jest.fn().mockImplementation((query) => {
                if (query.invite_code) return { select: mockSelect };
                if (query.email) return { _id: 'patient-123', email: query.email };
                return null;
            });

            const res = await request(app)
                .post('/api/companion/join')
                .send({
                    invite_code: 'VALIDCODE',
                    email: 'patient@companion.in',
                    password: 'Password123',
                    fullName: 'Companion Name'
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/Patient account/i);
        });

        it('re-uses existing companion Profile and links successfully', async () => {
            const mockPatientObj = {
                _id: fakeId('patient-123'),
                trusted_contacts: [],
                save: jest.fn().mockResolvedValue({})
            };
            const mockSelect = jest.fn().mockResolvedValue(mockPatientObj);
            
            Patient.findOne = jest.fn().mockImplementation((query) => {
                if (query.invite_code) return { select: mockSelect };
                return null;
            });

            const existingProfileObj = {
                _id: fakeId('companion-profile-id'),
                email: 'companion@careco.in',
                role: 'companion',
                save: jest.fn().mockResolvedValue({})
            };
            Profile.findOne = jest.fn().mockResolvedValue(existingProfileObj);

            CompanionAccess.findOne = jest.fn().mockResolvedValue(null);
            CompanionAccess.create = jest.fn().mockResolvedValue({ _id: 'access-123' });

            const res = await request(app)
                .post('/api/companion/join')
                .send({
                    invite_code: 'VALIDCODE',
                    email: 'companion@careco.in',
                    password: 'Password123',
                    fullName: 'Companion Name'
                });

            expect(res.status).toBe(200);
            expect(res.body.message).toMatch(/linked to new patient/i);
            expect(CompanionAccess.create).toHaveBeenCalled();
            expect(Profile.prototype.save).not.toHaveBeenCalled();
        });
    });

    describe('GET /api/companion/patient-status', () => {

        it('returns 403 if user role is not companion', async () => {
            mockAuthState.profile.role = 'patient';

            const res = await request(app).get('/api/companion/patient-status');
            expect(res.status).toBe(403);
        });

        it('returns 404 if no linked patients are found', async () => {
            CompanionAccess.find = jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue([])
            });

            const res = await request(app).get('/api/companion/patient-status');
            expect(res.status).toBe(404);
        });

        it('successfully retrieves dashboard data for default linked patient', async () => {
            const mockPatientObj = {
                _id: fakeId('patient-123'),
                name: 'Jane Patient',
                email: 'jane@patient.in',
                gamification: { streak: 5 }
            };
            const mockAccess = {
                companion_id: fakeId('companion-profile-id'),
                patient_id: mockPatientObj,
                is_active: true,
                status: 'accepted'
            };

            CompanionAccess.find = jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue([mockAccess])
            });

            Patient.findById = jest.fn().mockResolvedValue(mockPatientObj);
            MedicineLog.find = jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { medicines: [{ name: 'Aspirin', taken: true, is_active: true }] }
                ])
            });
            VitalLog.findOne = jest.fn().mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue({ systolic: 120, diastolic: 80 })
                })
            });
            Alert.find = jest.fn().mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                        lean: jest.fn().mockResolvedValue([])
                    })
                })
            });

            const res = await request(app).get('/api/companion/patient-status');

            expect(res.status).toBe(200);
            expect(res.body.patient.name).toBe('Jane Patient');
            expect(res.body.patient.adherence_rate).toBe(100);
            expect(res.body.latest_vital.systolic).toBe(120);
        });

        it('selects requested patientId from multiple linked patients', async () => {
            const mockPatient1 = { _id: fakeId('patient-1'), name: 'Jane Patient' };
            const mockPatient2 = { _id: fakeId('patient-2'), name: 'John Patient' };
            
            const accesses = [
                { companion_id: fakeId('companion-profile-id'), patient_id: mockPatient1, is_active: true, status: 'accepted' },
                { companion_id: fakeId('companion-profile-id'), patient_id: mockPatient2, is_active: true, status: 'accepted' }
            ];

            CompanionAccess.find = jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue(accesses)
            });

            Patient.findById = jest.fn().mockResolvedValue(mockPatient2);
            MedicineLog.find = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
            VitalLog.findOne = jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });
            Alert.find = jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) });

            const res = await request(app)
                .get('/api/companion/patient-status')
                .query({ patientId: 'patient-2' });

            expect(res.status).toBe(200);
            expect(res.body.patient.name).toBe('John Patient');
            expect(res.body.linked_patients).toHaveLength(2);
        });
    });

    describe('POST /api/companion/alerts/:id/acknowledge', () => {

        it('returns 403 if user role is not companion', async () => {
            mockAuthState.profile.role = 'patient';

            const res = await request(app)
                .post('/api/companion/alerts/alert123/acknowledge');

            expect(res.status).toBe(403);
        });

        it('successfully acknowledges and dismisses alert for companion', async () => {
            Alert.updateOne = jest.fn().mockResolvedValue({ nModified: 1 });

            const res = await request(app)
                .post('/api/companion/alerts/alert123/acknowledge');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Alert.updateOne).toHaveBeenCalledWith(
                { _id: 'alert123' },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        status: 'acknowledged',
                        acknowledged_by: expect.anything()
                    })
                })
            );
        });
    });
});
