process.env.NODE_ENV = 'test';

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
const { mockProfile, mockPatient, mockOrganization } = require('./helpers/mockModels');

// ─── Chain builders ───────────────────────────────────────────────────────────

/** Profile.findOne({...}).populate() */
function findOnePopulateChain(resolvedValue) {
    return { populate: jest.fn().mockResolvedValue(resolvedValue) };
}

/** Profile.findById(id).populate() */
function findByIdPopulateChain(resolvedValue) {
    return { populate: jest.fn().mockResolvedValue(resolvedValue) };
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
            expect(res.body.error).toMatch(/missing required fields/i);
        });



        it('returns 400 when email already exists', async () => {
            // Early check: Patient.findOne returns an existing patient → 400 before Supabase
            Patient.findOne = jest.fn().mockResolvedValueOnce({ _id: 'existing', email: 'dupe@careco.in' });

            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: 'dupe@careco.in', fullName: 'Test', password: 'Pass123', city: 'Hyderabad' });

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
                .send({ email: 'test@example.com', fullName: 'Test', password: 'Pass123', city: 'UnknownCity' });

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
                .send({ email: 'test@example.com', fullName: 'Test', password: 'Pass123', city: 'Hyderabad' });

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

            mockSupabase.auth.admin.createUser.mockResolvedValue({
                data:  { user: { id: 'sup-uid-123', email: 'dupe@example.com' } },
                error: null,
            });

            const dupeError = Object.assign(new Error('Duplicate'), { code: 11000, keyValue: { email: 1 } });
            Patient.prototype.save = jest.fn().mockRejectedValue(dupeError);

            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: 'dupe@example.com', fullName: 'Test', password: 'Pass123', city: 'Hyderabad' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/already exists/i);
        });

        it('registers successfully and creates Patient only (no Profile)', async () => {
            const org = mockOrganization({ _id: 'org123' });
            Patient.findOne                = jest.fn().mockResolvedValue(null);
            Organization.findOne          = jest.fn().mockResolvedValue(org);
            Organization.findById         = jest.fn().mockResolvedValue(org);
            Organization.findByIdAndUpdate = jest.fn().mockResolvedValue({});

            mockSupabase.auth.admin.createUser.mockResolvedValue({
                data:  { user: { id: 'sup-uid-123', email: 'new@example.com' } },
                error: null,
            });

            Patient.prototype._id  = 'patient-auto-id';
            Patient.prototype.save = jest.fn().mockResolvedValue({});

            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: 'new@example.com', fullName: 'New User', password: 'Pass123', city: 'Hyderabad' });

            expect(res.status).toBe(201);
            expect(res.body.message).toBe('Registration successful');
            expect(Patient.prototype.save).toHaveBeenCalled();
            // Profile should NOT be created
            expect(Profile.prototype.save).not.toHaveBeenCalled();
            expect(Organization.findByIdAndUpdate).toHaveBeenCalledWith(
                expect.anything(),
                { $inc: { 'counts.patients': 1 } }
            );
            expect(logEvent).toHaveBeenCalledWith(
                'sup-uid-123',
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
            expect(res.body.error).toMatch(/email and password are required/i);
        });

        it('returns 400 when role is missing', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'test@example.com', password: 'Pass123' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/select a role/i);
        });

        it('returns 403 with ROLE_MISMATCH when email exists under a different role', async () => {
            // Staff login: Call 1: Profile.findOne({email, role:'caller', isActive}).populate() → null
            // Call 2: Profile.findOne({email, isActive}) → profile with role 'care_manager'
            const existingProfile = mockProfile({ role: 'care_manager' });
            Profile.findOne = jest.fn()
                .mockReturnValueOnce(findOnePopulateChain(null))
                .mockResolvedValueOnce(existingProfile);

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'test@example.com', password: 'Pass123', role: 'caller' });

            expect(res.status).toBe(403);
            expect(res.body.code).toBe('ROLE_MISMATCH');
        });

        it('returns 403 with PROFILE_NOT_FOUND when patient email does not exist', async () => {
            Patient.findOne = jest.fn().mockResolvedValueOnce(null);

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'ghost@example.com', password: 'Pass123', role: 'patient' });

            expect(res.status).toBe(403);
            expect(res.body.code).toBe('PROFILE_NOT_FOUND');
        });

        it('returns 401 when Supabase rejects credentials', async () => {
            const profile = mockProfile({ role: 'caller', failedLoginAttempts: 0 });
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
                .send({ email: 'caller@careco.in', password: 'Pass123', role: 'caller' });

            expect(res.status).toBe(423);
            expect(res.body.code).toBe('ACCOUNT_LOCKED');
        });

        it('logs in patient successfully and returns session + profile', async () => {
            const patient = mockPatient({ _id: 'patient123', email: 'patient@careco.in', failedLoginAttempts: 0 });
            Object.defineProperty(patient, 'isLocked', { get: () => false });
            Patient.findOne = jest.fn().mockResolvedValue(patient);

            mockSupabase.auth.signInWithPassword.mockResolvedValue({
                data: {
                    user:    { id: 'sup-uid-123', email: 'patient@careco.in', email_confirmed_at: new Date().toISOString() },
                    session: { access_token: 'acc-tok', refresh_token: 'ref-tok', expires_in: 3600 },
                },
                error: null,
            });

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'patient@careco.in', password: 'Pass123', role: 'patient' });

            expect(res.status).toBe(200);
            expect(res.body.session.access_token).toBe('acc-tok');
            expect(res.body.profile.role).toBe('patient');
            expect(res.body.profile.subscription_status).toBe('active');
            expect(logEvent).toHaveBeenCalledWith(
                'sup-uid-123',
                'login',
                'patient',
                patient._id,
                expect.any(Object),
                expect.any(Object)
            );
        });

        it('logs in staff successfully and returns session + profile', async () => {
            const profile = mockProfile({ role: 'caller', failedLoginAttempts: 0 });
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
                .send({ email: 'caller@careco.in', password: 'Pass123', role: 'caller' });

            expect(res.status).toBe(200);
            expect(res.body.session.access_token).toBe('acc-tok');
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

        it('logs out successfully and signs out Supabase session', async () => {
            const profile = mockProfile({ _id: 'profile123', supabaseUid: 'sup-uid-123' });
            mockAuthState.user    = { id: 'sup-uid-123' };
            mockAuthState.profile = profile;

            mockSupabase.auth.admin.signOut.mockResolvedValue({ error: null });

            const res = await request(app).post('/api/auth/logout');

            expect(res.status).toBe(200);
            expect(mockSupabase.auth.admin.signOut).toHaveBeenCalledWith('sup-uid-123', 'global');
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
            expect(res.body.error).toMatch(/refresh token is required/i);
        });

        it('returns 401 when Supabase rejects the refresh token', async () => {
            mockSupabase.auth.refreshSession.mockResolvedValue({
                data:  null,
                error: { message: 'Invalid refresh token' },
            });

            const res = await request(app)
                .post('/api/auth/refresh')
                .send({ refresh_token: 'invalid-token' });

            expect(res.status).toBe(401);
            expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
        });

        it('returns new tokens and profile on successful refresh', async () => {
            mockSupabase.auth.refreshSession.mockResolvedValue({
                data: {
                    user:    { id: 'sup-uid-123', email: 'staff@careco.in' },
                    session: { access_token: 'new-acc', refresh_token: 'new-ref', expires_in: 3600 },
                },
                error: null,
            });

            const profile = mockProfile({ _id: 'profile123', supabaseUid: 'sup-uid-123' });
            Profile.findOne = jest.fn().mockReturnValue(findOnePopulateChain(profile));

            const res = await request(app)
                .post('/api/auth/refresh')
                .send({ refresh_token: 'valid-refresh-token' });

            expect(res.status).toBe(200);
            expect(res.body.session.access_token).toBe('new-acc');
            expect(res.body.profile.role).toBe(profile.role);
        });

        it('returns 403 when refreshed user has no profile or patient', async () => {
            mockSupabase.auth.refreshSession.mockResolvedValue({
                data: {
                    user:    { id: 'sup-uid-orphan' },
                    session: { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 },
                },
                error: null,
            });

            Profile.findOne = jest.fn().mockReturnValue(findOnePopulateChain(null));
            Patient.findOne = jest.fn().mockResolvedValue(null);

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

            const res = await request(app).get('/api/auth/me');

            expect(res.status).toBe(200);
            expect(res.body.profile.email).toBe('staff@careco.in');
            expect(res.body.profile.role).toBe('care_manager');
        });

        it('returns subscription_status for patient role', async () => {
            const patient = mockPatient({ _id: 'patient123', role: 'patient', subscription: { status: 'active', plan: 'basic' } });
            mockAuthState.user    = { id: 'sup-uid-123', email: 'patient@careco.in', email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString() };
            mockAuthState.profile = patient;

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

        beforeEach(() => {
            mockAuthState.profile = {
                _id:            'admin123',
                supabaseUid:    'admin-user',
                role:           'org_admin',
                organizationId: 'org123',
            };
        });

        it('returns 400 when required fields are missing', async () => {
            const res = await request(app)
                .post('/api/auth/create-user')
                .send({ email: 'new@careco.in' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/missing required fields/i);
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
                counts: { patients: 0, callers: 50, managers: 0 },
                limits: { max_patients: 500, max_callers: 50, max_managers: 10 },
            });
            Organization.findById = jest.fn().mockResolvedValue(org);

            const res = await request(app)
                .post('/api/auth/create-user')
                .send({ email: 'new@careco.in', fullName: 'New Caller', role: 'caller', organizationId: 'org123' });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('CAPACITY_LIMIT_REACHED');
        });

        it('creates caller successfully and sends temp password email', async () => {
            const org = mockOrganization({ _id: 'org123' });
            Organization.findById          = jest.fn().mockResolvedValue(org);
            Organization.findByIdAndUpdate = jest.fn().mockResolvedValue({});
            Profile.findOne                = jest.fn().mockResolvedValue(null);
            Profile.prototype.save         = jest.fn().mockResolvedValue({});

            mockSupabase.auth.admin.createUser.mockResolvedValue({
                data:  { user: { id: 'sup-uid-new' } },
                error: null,
            });

            const res = await request(app)
                .post('/api/auth/create-user')
                .send({ email: 'newcaller@careco.in', fullName: 'New Caller', role: 'caller', organizationId: 'org123' });

            expect(res.status).toBe(201);
            expect(sendTempPasswordEmail).toHaveBeenCalled();
            expect(Organization.findByIdAndUpdate).toHaveBeenCalledWith(
                expect.anything(),
                { $inc: { 'counts.callers': 1 } }
            );
        });
    });
});