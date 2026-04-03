process.env.NODE_ENV = 'test';

/**
 * reports.test.js — rewritten against actual route
 *
 * Key facts from src/routes/reports.js:
 *
 * GET /user-activity
 *   - Profile.findOne({ supabaseUid: userId }) — plain await, no .populate()
 *   - org check: user.organizationId.equals(req.profile.organizationId)
 *     → returned user's organizationId needs .equals(); profile.organizationId needs .equals()
 *   - caller/other roles: check userId !== req.profile.supabaseUid (string compare, no .equals())
 *
 * GET /organization-stats
 *   - new mongoose.Types.ObjectId(targetOrgId) — orgId MUST be a valid 24-char hex string
 *   - AuditLog.aggregate must be mocked
 *   - response: { organization: { id, name, city, counts, limits }, userStats: {role: count}, recentActivity }
 *     userStats is reduce()d to plain object — test mock returns array and route reduces it
 *   - org_admin cross-org: string compare organizationId !== req.profile.organizationId.toString()
 *
 * GET /security-incidents
 *   - requireRole('super_admin', 'org_admin')
 *   - getSecurityIncidents(filters) — SINGLE argument, a filters object
 *   - org_admin: Profile.find({organizationId}).select('supabaseUid') — chain mock needed
 *   - super_admin: no Profile.find, passes filters with no userIds
 */

// ─── fakeId helper ────────────────────────────────────────────────────────────

function fakeId(val) {
    const s = String(val);
    return { toString: () => s, toJSON: () => s, equals: (o) => s === String(o?._id ?? o) };
}

// Valid 24-char hex ObjectId strings for use with new mongoose.Types.ObjectId()
const VALID_ORG_ID = '507f1f77bcf86cd799439011';

// ─── Shared mutable auth state ────────────────────────────────────────────────

const mockAuthState = {
    user:    { id: 'super-admin', supabaseUid: 'super-admin' },
    profile: { _id: 'super-profile', supabaseUid: 'super-admin', role: 'super_admin', organizationId: null },
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../src/middleware/authenticate', () => ({
    authenticate: (req, res, next) => { req.user = mockAuthState.user; req.profile = mockAuthState.profile; next(); },
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

jest.mock('../src/models/Profile');
jest.mock('../src/models/Organization');
jest.mock('../src/models/AuditLog', () => ({
    aggregate:  jest.fn(),
    createLog:  jest.fn().mockResolvedValue(undefined),
    find:       jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

const request      = require('supertest');
const app          = require('../src/server');
const Profile      = require('../src/models/Profile');
const Organization = require('../src/models/Organization');
const AuditLog     = require('../src/models/AuditLog');
const { getUserActivitySummary, getSecurityIncidents } = require('../src/services/auditService');
const { mockProfile, mockOrganization } = require('./helpers/mockModels');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Reports Routes', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthState.user    = { id: 'super-admin', supabaseUid: 'super-admin' };
        mockAuthState.profile = { _id: 'super-profile', supabaseUid: 'super-admin', role: 'super_admin', organizationId: null };
    });

    // ── GET /api/reports/user-activity ────────────────────────────────────────

    describe('GET /api/reports/user-activity', () => {

        it('returns 400 when super_admin omits userId', async () => {
            const res = await request(app).get('/api/reports/user-activity');
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/userId is required for super admin/i);
        });

        it('returns activity for super_admin with valid userId', async () => {
            // super_admin path: no Profile.findOne call, just getUserActivitySummary
            const summary = { totalLogins: 15, totalActions: 45 };
            getUserActivitySummary.mockResolvedValue(summary);

            const res = await request(app)
                .get('/api/reports/user-activity')
                .query({ userId: 'target-user-123', days: 30 });

            expect(res.status).toBe(200);
            expect(res.body.userId).toBe('target-user-123');
            expect(getUserActivitySummary).toHaveBeenCalledWith('target-user-123', 30);
        });

        it('returns activity for org_admin defaulting to own supabaseUid', async () => {
            mockAuthState.profile = {
                _id: 'admin-profile', supabaseUid: 'admin-123', role: 'org_admin',
                organizationId: fakeId(VALID_ORG_ID),
            };
            const summary = { totalLogins: 8 };
            getUserActivitySummary.mockResolvedValue(summary);

            const res = await request(app).get('/api/reports/user-activity').query({ days: 30 });

            expect(res.status).toBe(200);
            expect(res.body.userId).toBe('admin-123');
            expect(getUserActivitySummary).toHaveBeenCalledWith('admin-123', 30);
        });

        it('returns 403 when org_admin requests a user from a different org', async () => {
            mockAuthState.profile = {
                _id: 'admin-profile', supabaseUid: 'admin-123', role: 'org_admin',
                organizationId: fakeId(VALID_ORG_ID),
            };

            // Route: Profile.findOne({ supabaseUid: userId }) — plain, no populate
            // user.organizationId.equals(req.profile.organizationId) must return false
            const targetUser = {
                supabaseUid:    'target-user-123',
                organizationId: fakeId('aaaaaaaaaaaaaaaaaaaaaaaa'),  // different org
            };
            Profile.findOne = jest.fn().mockResolvedValue(targetUser);

            const res = await request(app)
                .get('/api/reports/user-activity')
                .query({ userId: 'target-user-123' });

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/access denied/i);
        });

        it('returns activity for caller requesting own userId', async () => {
            mockAuthState.profile = { _id: 'caller-profile', supabaseUid: 'caller-123', role: 'caller', organizationId: 'org123' };
            getUserActivitySummary.mockResolvedValue({ totalLogins: 5 });

            const res = await request(app)
                .get('/api/reports/user-activity')
                .query({ userId: 'caller-123' });

            expect(res.status).toBe(200);
        });

        it('returns 403 when caller requests another user', async () => {
            mockAuthState.profile = { _id: 'caller-profile', supabaseUid: 'caller-123', role: 'caller', organizationId: 'org123' };

            const res = await request(app)
                .get('/api/reports/user-activity')
                .query({ userId: 'other-user-456' });

            expect(res.status).toBe(403);
        });
    });

    // ── GET /api/reports/organization-stats ───────────────────────────────────

    describe('GET /api/reports/organization-stats', () => {

        it('returns 400 when super_admin omits organizationId', async () => {
            const res = await request(app).get('/api/reports/organization-stats');
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/organizationId is required for super admin/i);
        });

        it('returns stats for super_admin with valid organizationId', async () => {
            // orgId MUST be a valid 24-char hex for new mongoose.Types.ObjectId()
            const org = mockOrganization({ _id: VALID_ORG_ID, name: 'Test Org', city: 'Hyderabad' });
            Organization.findById = jest.fn().mockResolvedValue(org);

            // Profile.aggregate returns array; route reduces to { role: count }
            Profile.aggregate  = jest.fn().mockResolvedValue([
                { _id: 'org_admin', count: 2 },
                { _id: 'caller',    count: 8 },
            ]);
            AuditLog.aggregate = jest.fn().mockResolvedValue([]);

            const res = await request(app)
                .get('/api/reports/organization-stats')
                .query({ organizationId: VALID_ORG_ID });

            expect(res.status).toBe(200);
            // Route returns organization.id (not ._id)
            expect(res.body.organization.id).toBeTruthy();
            // userStats is reduced to plain object
            expect(res.body.userStats).toMatchObject({ org_admin: 2, caller: 8 });
        });

        it('returns stats for org_admin defaulting to own org', async () => {
            // IMPORTANT: route does targetOrgId = req.profile.organizationId then passes
            // it directly to new mongoose.Types.ObjectId(targetOrgId).
            // A fakeId object is not a valid ObjectId argument — must be a plain hex string.
            mockAuthState.profile = {
                _id: 'admin-profile', supabaseUid: 'admin-123', role: 'org_admin',
                organizationId: VALID_ORG_ID,   // plain string, not fakeId()
            };

            const org = mockOrganization({ _id: VALID_ORG_ID });
            Organization.findById = jest.fn().mockResolvedValue(org);
            Profile.aggregate     = jest.fn().mockResolvedValue([{ _id: 'caller', count: 5 }]);
            AuditLog.aggregate    = jest.fn().mockResolvedValue([]);

            const res = await request(app).get('/api/reports/organization-stats');

            expect(res.status).toBe(200);
            expect(Profile.aggregate).toHaveBeenCalled();
        });

        it('returns 403 when org_admin requests a different org', async () => {
            mockAuthState.profile = {
                _id: 'admin-profile', supabaseUid: 'admin-123', role: 'org_admin',
                organizationId: fakeId(VALID_ORG_ID),
            };

            const res = await request(app)
                .get('/api/reports/organization-stats')
                .query({ organizationId: 'bbbbbbbbbbbbbbbbbbbbbbbb' });  // different org

            expect(res.status).toBe(403);
        });

        it('returns 404 when organization does not exist', async () => {
            Organization.findById = jest.fn().mockResolvedValue(null);
            const res = await request(app)
                .get('/api/reports/organization-stats')
                .query({ organizationId: VALID_ORG_ID });
            expect(res.status).toBe(404);
        });

        it('returns 403 for caller role', async () => {
            mockAuthState.profile = { _id: 'caller', supabaseUid: 'caller', role: 'caller', organizationId: 'org123' };
            const res = await request(app).get('/api/reports/organization-stats');
            expect(res.status).toBe(403);
        });
    });

    // ── GET /api/reports/security-incidents ───────────────────────────────────

    describe('GET /api/reports/security-incidents', () => {

        it('returns incidents for super_admin with single filters arg', async () => {
            const incidents = [{ action: 'login_failed' }, { action: 'unauthorized_access' }];
            getSecurityIncidents.mockResolvedValue(incidents);

            const res = await request(app).get('/api/reports/security-incidents');

            expect(res.status).toBe(200);
            expect(res.body.incidents).toHaveLength(2);
            // Route calls getSecurityIncidents(filters) — ONE arg, a plain object
            // super_admin: no userIds key in filters
            expect(getSecurityIncidents).toHaveBeenCalledWith(
                expect.not.objectContaining({ userIds: expect.anything() })
            );
        });

        it('returns incidents for org_admin scoped via Profile.find().select()', async () => {
            mockAuthState.profile = {
                _id: 'admin-profile', supabaseUid: 'admin-123', role: 'org_admin',
                organizationId: fakeId(VALID_ORG_ID),
            };

            // org_admin path: Profile.find({organizationId}).select('supabaseUid')
            const orgUsers = [{ supabaseUid: 'u1' }, { supabaseUid: 'u2' }];
            Profile.find = jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(orgUsers),
            });

            const incidents = [{ action: 'login_failed' }];
            getSecurityIncidents.mockResolvedValue(incidents);

            const res = await request(app).get('/api/reports/security-incidents');

            expect(res.status).toBe(200);
            expect(res.body.incidents).toHaveLength(1);
            // filters object should include userIds from org users
            expect(getSecurityIncidents).toHaveBeenCalledWith(
                expect.objectContaining({ userIds: ['u1', 'u2'] })
            );
        });

        it('returns 403 for caller role', async () => {
            mockAuthState.profile = { _id: 'c', supabaseUid: 'c', role: 'caller', organizationId: 'org123' };
            const res = await request(app).get('/api/reports/security-incidents');
            expect(res.status).toBe(403);
        });

        it('returns 403 for care_manager role', async () => {
            mockAuthState.profile = { _id: 'c', supabaseUid: 'c', role: 'care_manager', organizationId: 'org123' };
            const res = await request(app).get('/api/reports/security-incidents');
            expect(res.status).toBe(403);
        });

        it('returns 403 for patient role', async () => {
            mockAuthState.profile = { _id: 'p', supabaseUid: 'p', role: 'patient', organizationId: 'org123' };
            const res = await request(app).get('/api/reports/security-incidents');
            expect(res.status).toBe(403);
        });
    });
});