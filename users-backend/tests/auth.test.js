process.env.NODE_ENV = 'test';
process.env.AUTH_ENABLE_SUPABASE_FALLBACK = 'true';

/**
 * auth.test.js — fixed
 *
 * Three bug categories fixed vs previous version:
 *
 * 1. LOGIN 500s — Profile.findOne returns a .populate() chain on the first call.
 *    Route: Profile.findOne({email,role,isActive}).populate('organizationId','name city')
 *    Previous mock used mockResolvedValue(x) → route crashed calling .populate() on a
 *    plain resolved value.  Fix: mockReturnValue({populate: jest.fn().mockResolvedValue(x)})
 *    The second findOne (email-only fallback) has no .populate() so it stays as mockResolvedValueOnce.
 *
 * 2. REGISTER logEvent 4th arg undefined — Profile auto-mock constructor never sets _id.
 *    Fix: Profile.prototype._id = known value before the test, use expect.anything() in assertion.
 *
 * 3. 401 tests — mod.authenticate = x doesn't work. Routes capture the function reference
 *    at import time; mutating the module object after the fact has no effect.
 *    Fix: mockAuthState.rejectAuth flag — the mock closure reads it on every request.
 */

// ─── Shared mutable auth state ────────────────────────────────────────────────

const mockAuthState = {
    user:       { id: 'test-user', supabaseUid: 'test-user', email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString() },
    profile:    { _id: 'test-profile', supabaseUid: 'test-user', role: 'care_manager', organizationId: 'org123', email: 'staff@careco.in', fullName: 'Test Staff' },
    rejectAuth: false,   // set true to make authenticate return 401
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSupabase = {
    auth: {
        admin: {
            createUser:     jest.fn(),
            signOut:        jest.fn(),
            updateUserById: jest.fn(),
            deleteUser:     jest.fn(),
        },
        signInWithPassword:    jest.fn(),
        getUser:               jest.fn(),
        refreshSession:        jest.fn(),
        resetPasswordForEmail: jest.fn(),
    },
};

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => mockSupabase),
}));

jest.mock('../src/models/Profile');
jest.mock('../src/models/Patient');
jest.mock('../src/models/Organization');
jest.mock('../src/models/AuditLog', () => ({
    createLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/auditService', () => ({
    logEvent:               jest.fn().mockResolvedValue(undefined),
    logSecurityEvent:       jest.fn().mockResolvedValue(undefined),
    autoLogAccess:          jest.fn(() => (req, res, next) => next()),
    getUserActivitySummary: jest.fn(),
    getSecurityIncidents:   jest.fn(),
}));

jest.mock('../src/services/emailService', () => ({
    sendTempPasswordEmail:    jest.fn(),
    sendPasswordChangedEmail: jest.fn(),
}));

jest.mock('../src/middleware/authenticate', () => ({
    authenticate: (req, res, next) => {
        if (mockAuthState.rejectAuth) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        req.user    = mockAuthState.user;
        req.profile = mockAuthState.profile;
        next();
    },
    authenticateSession: (req, res, next) => {
        if (mockAuthState.rejectAuth) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        req.user    = mockAuthState.user;
        req.profile = mockAuthState.profile;
        next();
    },
    requireRole: () => (req, res, next) => next(),
}));

jest.mock('../src/middleware/authorize', () => ({
    authorize:         () => (req, res, next) => next(),
    authorizeResource: () => (req, res, next) => next(),
}));

jest.mock('../src/middleware/checkPasswordChange', () => ({
    checkPasswordChange: (req, res, next) => next(),
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

jest.mock('../src/models/RefreshToken', () => ({
    hashToken: jest.fn(() => 'hashed-test-refresh'),
    findOne:   jest.fn(),
}));

jest.mock('../src/middleware/scopeFilter', () => ({
    scopeFilter: () => (req, res, next) => { req.scopeFilter = {}; next(); },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

const request      = require('supertest');
const app          = require('../src/server');
const Profile      = require('../src/models/Profile');
const Patient      = require('../src/models/Patient');
const Organization = require('../src/models/Organization');
const { logEvent, logSecurityEvent } = require('../src/services/auditService');
const { sendTempPasswordEmail }      = require('../src/services/emailService');
const tokenService = require('../src/services/tokenService');
const RefreshToken = require('../src/models/RefreshToken');
const { mockProfile, mockPatient, mockOrganization } = require('./helpers/mockModels');
const crypto = require('crypto');

// ─── Chain builders ───────────────────────────────────────────────────────────

/** Profile.findOne({...}).select().populate() */
function findOnePopulateChain(resolvedValue) {
    return {
        select:   jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(resolvedValue),
    };
}

/** Profile.findById(id).select().populate() */
function findByIdPopulateChain(resolvedValue) {
    return {
        select: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(resolvedValue),
        }),
        populate: jest.fn().mockResolvedValue(resolvedValue),
    };
}

/** Patient.findOne({...}).select('+passwordHash') */
function patientSelectChain(resolvedValue) {
    return {
        select: jest.fn().mockResolvedValue(resolvedValue),
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Auth Routes', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthState.rejectAuth = false;
        mockAuthState.user    = { id: 'test-user', supabaseUid: 'test-user', email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString() };
        mockAuthState.profile = { _id: 'test-profile', supabaseUid: 'test-user', role: 'care_manager', organizationId: 'org123', email: 'staff@careco.in', fullName: 'Test Staff' };
    });

    // ── POST /api/auth/register ────────────────────────────────────────────────

    describe('POST /api/auth/register', () => {

        it('returns 400 when required fields are missing', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: 'test@example.com' });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('VALIDATION');
        });



        it('returns 400 when email already exists', async () => {
            // Early check: Patient.findOne returns an existing patient → 400 before Supabase
            Patient.findOne = jest.fn().mockResolvedValueOnce({ _id: 'existing', email: 'dupe@careco.in' });

            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: 'dupe@careco.in', fullName: 'Test', password: 'Pass12345', city: 'Hyderabad' });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
            // Supabase should NOT have been called
            expect(mockSupabase.auth.admin.createUser).not.toHaveBeenCalled();
        });

        it('returns 400 when no active org is found for city', async () => {
            Patient.findOne      = jest.fn().mockResolvedValue(null);
            Organization.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: 'test@example.com', fullName: 'Test', password: 'Pass12345', city: 'UnknownCity' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/no active organisation/i);
        });

        it('returns 400 when org is at patient capacity', async () => {
            const org = mockOrganization({
                _id:    'org123',
                counts: { patients: 500, callers: 0, managers: 0 },
                limits: { max_patients: 500, max_callers: 50, max_managers: 10 },
            });
            Patient.findOne       = jest.fn().mockResolvedValue(null);
            Organization.findOne  = jest.fn().mockResolvedValue(org);
            Organization.findById = jest.fn().mockResolvedValue(org);

            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: 'test@example.com', fullName: 'Test', password: 'Pass12345', city: 'Hyderabad' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/capacity/i);
        });

        it('returns 400 for duplicate email (MongoDB 11000 fallback for race conditions)', async () => {
            const org = mockOrganization({ _id: 'org123' });
            // Patient.findOne must return null to pass the early duplicate check
            // (simulating a race condition where the email slips through to the DB level)
            Patient.findOne       = jest.fn().mockResolvedValue(null);
            Organization.findOne  = jest.fn().mockResolvedValue(org);
            Organization.findById = jest.fn().mockResolvedValue(org);

            const dupeError = Object.assign(new Error('Duplicate'), { code: 11000, keyValue: { email: 1 } });
            Patient.prototype.save = jest.fn().mockRejectedValue(dupeError);

            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: 'dupe@example.com', fullName: 'Test', password: 'Pass12345', city: 'Hyderabad' });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
        });

        it('registers successfully and creates Patient only (no Profile)', async () => {
            const fixedSubject = '11111111-1111-1111-1111-111111111111';
            jest.spyOn(crypto, 'randomUUID').mockReturnValue(fixedSubject);

            const org = mockOrganization({ _id: 'org123' });
            Patient.findOne                = jest.fn().mockResolvedValue(null);
            Organization.findOne          = jest.fn().mockResolvedValue(org);
            Organization.findById         = jest.fn().mockResolvedValue(org);
            Organization.findByIdAndUpdate = jest.fn().mockResolvedValue({});

            Patient.prototype._id  = 'patient-auto-id';
            Patient.prototype.save = jest.fn().mockResolvedValue({});

            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: 'new@example.com', fullName: 'New User', password: 'Pass12345', city: 'Hyderabad' });

            expect(res.status).toBe(201);
            expect(res.body.message).toBe('Registration successful');
            expect(mockSupabase.auth.admin.createUser).not.toHaveBeenCalled();
            expect(Patient.prototype.save).toHaveBeenCalled();
            expect(Profile.prototype.save).not.toHaveBeenCalled();
            expect(Organization.findByIdAndUpdate).toHaveBeenCalledWith(
                expect.anything(),
                { $inc: { 'counts.patients': 1 } }
            );
            expect(logEvent).toHaveBeenCalledWith(
                fixedSubject,
                'patient_created',
                'patient',
                expect.anything(),
                expect.any(Object),
                expect.any(Object)
            );
        });
    });

    // ── POST /api/auth/login ───────────────────────────────────────────────────

    describe('POST /api/auth/login', () => {

        it('returns 400 when email or password missing', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'test@example.com' });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('VALIDATION');
        });

        it('returns 400 when role is missing', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'test@example.com', password: 'Pass12345' });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('VALIDATION');
        });

        it('returns 401 with INVALID_CREDENTIALS when email exists under a different role (user enumeration prevention)', async () => {
            // SEC-FIX-1: no longer reveals role mismatch — returns generic 401
            const existingProfile = mockProfile({ role: 'care_manager' });
            Profile.findOne = jest.fn()
                .mockReturnValueOnce(findOnePopulateChain(null))
                .mockResolvedValueOnce(existingProfile);

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'test@example.com', password: 'Pass12345', role: 'caller' });

            expect(res.status).toBe(401);
            expect(res.body.code).toBe('INVALID_CREDENTIALS');
        });

        it('returns 401 with INVALID_CREDENTIALS when patient email does not exist (user enumeration prevention)', async () => {
            // SEC-FIX-1: no longer reveals whether account exists
            Patient.findOne = jest.fn().mockReturnValue(patientSelectChain(null));

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'ghost@example.com', password: 'Pass12345', role: 'patient' });

            expect(res.status).toBe(401);
            expect(res.body.code).toBe('INVALID_CREDENTIALS');
        });

        it('returns 401 when Supabase rejects credentials', async () => {
            const profile = mockProfile({ role: 'caller', failedLoginAttempts: 0, passwordHash: '$2a$10$fakehash' });
            Object.defineProperty(profile, 'isLocked', { get: () => false });
            Profile.findOne = jest.fn().mockReturnValue(findOnePopulateChain(profile));

            mockSupabase.auth.signInWithPassword.mockResolvedValue({
                data:  null,
                error: { message: 'Invalid login credentials' },
            });

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'caller@careco.in', password: 'wrongpass', role: 'caller' });

            expect(res.status).toBe(401);
            expect(res.body.code).toBe('INVALID_CREDENTIALS');
            expect(logSecurityEvent).toHaveBeenCalledWith(
                'anonymous', 'login_failed', 'medium', expect.any(String), expect.any(Object)
            );
        });

        it('returns 423 when account is locked', async () => {
            const profile = mockProfile({ role: 'caller', accountLockedUntil: new Date(Date.now() + 60_000) });
            Object.defineProperty(profile, 'isLocked', { get: () => true });
            Profile.findOne = jest.fn().mockReturnValue(findOnePopulateChain(profile));

            mockSupabase.auth.signInWithPassword.mockResolvedValue({
                data:  { user: { id: 'sup-uid-123' }, session: { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 } },
                error: null,
            });

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'caller@careco.in', password: 'Pass12345', role: 'caller' });

            expect(res.status).toBe(423);
            expect(res.body.code).toBe('ACCOUNT_LOCKED');
        });

        it('logs in patient successfully and returns session + profile', async () => {
            const patient = mockPatient({
                _id:          'patient123',
                email:        'patient@careco.in',
                supabase_uid: 'sup-uid-pat-stable',
                failedLoginAttempts: 0,
            });
            Object.defineProperty(patient, 'isLocked', { get: () => false });
            Patient.findOne = jest.fn().mockReturnValue(patientSelectChain(patient));

            mockSupabase.auth.signInWithPassword.mockResolvedValue({
                data: {
                    user:    { id: 'sup-uid-123', email: 'patient@careco.in', email_confirmed_at: new Date().toISOString() },
                    session: { access_token: 'acc-tok', refresh_token: 'ref-tok', expires_in: 3600 },
                },
                error: null,
            });

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'patient@careco.in', password: 'Pass12345', role: 'patient' });

            expect(res.status).toBe(200);
            expect(res.body.session.access_token).toBe('mock-access-token');
            expect(res.body.profile.role).toBe('patient');
            expect(res.body.profile.subscription_status).toBe('active');
            expect(logEvent).toHaveBeenCalledWith(
                'sup-uid-pat-stable',
                'login',
                'patient',
                patient._id,
                expect.any(Object),
                expect.any(Object)
            );
        });

        it('logs in staff successfully and returns session + profile', async () => {
            const profile = mockProfile({ role: 'caller', supabaseUid: 'sup-uid-123', failedLoginAttempts: 0 });
            Object.defineProperty(profile, 'isLocked', { get: () => false });
            Profile.findOne = jest.fn().mockReturnValue(findOnePopulateChain(profile));

            mockSupabase.auth.signInWithPassword.mockResolvedValue({
                data: {
                    user:    { id: 'sup-uid-123', email: 'caller@careco.in', email_confirmed_at: new Date().toISOString() },
                    session: { access_token: 'acc-tok', refresh_token: 'ref-tok', expires_in: 3600 },
                },
                error: null,
            });

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'caller@careco.in', password: 'Pass12345', role: 'caller' });

            expect(res.status).toBe(200);
            expect(res.body.session.access_token).toBe('mock-access-token');
            expect(res.body.profile.role).toBe('caller');
            expect(logEvent).toHaveBeenCalledWith(
                'sup-uid-123',
                'login',
                'profile',
                profile._id,
                expect.any(Object),
                expect.any(Object)
            );
        });
    });

    // ── POST /api/auth/logout ──────────────────────────────────────────────────

    describe('POST /api/auth/logout', () => {

        it('returns 401 when not authenticated', async () => {
            mockAuthState.rejectAuth = true;

            const res = await request(app).post('/api/auth/logout');

            expect(res.status).toBe(401);
        });

        it('logs out successfully and revokes refresh tokens', async () => {
            const profile = mockProfile({ _id: 'profile123', supabaseUid: 'sup-uid-123' });
            mockAuthState.user    = { id: 'sup-uid-123' };
            mockAuthState.profile = profile;

            const res = await request(app).post('/api/auth/logout');

            expect(res.status).toBe(200);
            expect(tokenService.revokeAllForUser).toHaveBeenCalledWith(profile._id, 'Profile');
            expect(logEvent).toHaveBeenCalledWith(
                'sup-uid-123',
                'logout',
                'profile',
                profile._id,
                expect.any(Object)
            );
        });
    });

    // ── POST /api/auth/refresh ─────────────────────────────────────────────────

    describe('POST /api/auth/refresh', () => {

        it('returns 400 when refresh_token is missing', async () => {
            const res = await request(app)
                .post('/api/auth/refresh')
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('VALIDATION');
        });

        it('returns 401 when refresh token document is not found', async () => {
            RefreshToken.findOne.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/auth/refresh')
                .send({ refresh_token: 'invalid-token' });

            expect(res.status).toBe(401);
            expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
        });

        it('returns new tokens and profile on successful refresh', async () => {
            const profile = mockProfile({ _id: 'profile123', supabaseUid: 'sup-uid-123' });
            const doc = {
                userId:    profile._id,
                userType:  'Profile',
                revokedAt: null,
                save:      jest.fn().mockResolvedValue(undefined),
            };
            RefreshToken.findOne.mockResolvedValue(doc);
            Profile.findById = jest.fn().mockReturnValue(findByIdPopulateChain(profile));

            const res = await request(app)
                .post('/api/auth/refresh')
                .send({ refresh_token: 'valid-refresh-token' });

            expect(res.status).toBe(200);
            expect(res.body.session.access_token).toBe('mock-access-token');
            expect(res.body.profile.role).toBe(profile.role);
            expect(doc.save).toHaveBeenCalled();
        });

        it('returns 403 when account no longer exists', async () => {
            const doc = {
                userId:    'deleted-profile-id',
                userType:  'Profile',
                revokedAt: null,
                save:      jest.fn().mockResolvedValue(undefined),
            };
            RefreshToken.findOne.mockResolvedValue(doc);
            Profile.findById = jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue(null),
            });

            const res = await request(app)
                .post('/api/auth/refresh')
                .send({ refresh_token: 'orphan-token' });

            expect(res.status).toBe(403);
            expect(res.body.code).toBe('PROFILE_NOT_FOUND');
        });
    });

    // ── GET /api/auth/me ───────────────────────────────────────────────────────

    describe('GET /api/auth/me', () => {

        it('returns current user profile', async () => {
            const profile = mockProfile({ _id: 'profile123', email: 'staff@careco.in', role: 'care_manager' });
            mockAuthState.user    = { id: 'sup-uid-123', email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString() };
            mockAuthState.profile = profile;

            Profile.findById = jest.fn().mockReturnValue(findByIdPopulateChain(profile));

            // Mock Caller.findOne (used by /me for caller role check)
            const Caller = require('../src/models/Caller');
            Caller.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app).get('/api/auth/me');

            expect(res.status).toBe(200);
            expect(res.body.profile.email).toBe('staff@careco.in');
            expect(res.body.profile.role).toBe('care_manager');
        });

        it('returns subscription_status for patient role', async () => {
            const patient = mockPatient({ _id: 'patient123', role: 'patient', subscription: { status: 'active', plan: 'basic' } });
            mockAuthState.user    = { id: 'sup-uid-123', email: 'patient@careco.in', email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString() };
            mockAuthState.profile = patient;

            // me() calls Patient.findById(id).select('+passwordHash') for patients
            Patient.findById = jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(patient),
            });

            const res = await request(app).get('/api/auth/me');

            expect(res.status).toBe(200);
            expect(res.body.profile.subscription_status).toBe('active');
            expect(res.body.profile.role).toBe('patient');
        });

        it('returns 401 when not authenticated', async () => {
            mockAuthState.rejectAuth = true;

            const res = await request(app).get('/api/auth/me');

            expect(res.status).toBe(401);
        });
    });

    // ── POST /api/auth/create-user ─────────────────────────────────────────────

    describe('POST /api/auth/create-user', () => {

        const testOrgId = '507f1f77bcf86cd799439011';

        beforeEach(() => {
            mockAuthState.profile = {
                _id:            'admin123',
                supabaseUid:    'admin-user',
                role:           'org_admin',
                organizationId: testOrgId,
            };
        });

        it('returns 400 when required fields are missing', async () => {
            const res = await request(app)
                .post('/api/auth/create-user')
                .send({ email: 'new@careco.in' });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('VALIDATION');
        });

        it('returns 403 when role hierarchy is violated (org_admin cannot create org_admin)', async () => {
            const res = await request(app)
                .post('/api/auth/create-user')
                .send({ email: 'new@careco.in', fullName: 'New Admin', role: 'org_admin' });

            expect(res.status).toBe(403);
            expect(res.body.code).toBe('ROLE_HIERARCHY_VIOLATION');
        });

        it('returns 400 when org is at caller capacity', async () => {
            const org = mockOrganization({
                _id:    testOrgId,
                counts: { patients: 0, callers: 50, managers: 0 },
                limits: { max_patients: 500, max_callers: 50, max_managers: 10 },
            });
            Organization.findById = jest.fn().mockResolvedValue(org);

            const res = await request(app)
                .post('/api/auth/create-user')
                .send({ email: 'new@careco.in', fullName: 'New Caller', role: 'caller', organizationId: testOrgId });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('CAPACITY_LIMIT_REACHED');
        });

        it('creates caller successfully and sends temp password email', async () => {
            const org = mockOrganization({ _id: testOrgId });
            Organization.findById          = jest.fn().mockResolvedValue(org);
            Organization.findByIdAndUpdate = jest.fn().mockResolvedValue({});
            Profile.findOne                = jest.fn().mockResolvedValue(null);
            Patient.findOne                = jest.fn().mockResolvedValue(null); // Cross-collection check
            Profile.prototype.save         = jest.fn().mockResolvedValue({});

            const res = await request(app)
                .post('/api/auth/create-user')
                .send({ email: 'newcaller@careco.in', fullName: 'New Caller', role: 'caller', organizationId: testOrgId });

            expect(res.status).toBe(201);
            expect(mockSupabase.auth.admin.createUser).not.toHaveBeenCalled();
            expect(sendTempPasswordEmail).toHaveBeenCalled();
            expect(Organization.findByIdAndUpdate).toHaveBeenCalledWith(
                expect.anything(),
                { $inc: { 'counts.callers': 1 } }
            );
        });
    });
});