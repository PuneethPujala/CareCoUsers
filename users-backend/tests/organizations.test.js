process.env.NODE_ENV = 'test';

/**
 * organizations.test.js — rewritten against actual route
 *
 * Key facts read from src/routes/organizations.js:
 *
 * GET /
 *   - requireRole('super_admin') then authorize then autoLogAccess
 *   - find().sort().limit().skip()  — no populate
 *   - city query  → { $regex: city, $options: 'i' }  NOT exact match
 *   - isActive default from query string is the string 'true', route does
 *     isActive === 'true' ? true : false — so default query has isActive:false
 *     (because we don't send ?isActive — req.query.isActive is undefined)
 *     Correction: destructuring default is `isActive = true` but it's a query
 *     string so it arrives as string 'true'. The comparison isActive === 'true'
 *     evaluates to true when passed explicitly. Default value `true` (boolean)
 *     is used when param absent — boolean true === 'true' is FALSE → isActive:false.
 *     Test must send ?isActive=true to get isActive:true in query.
 *
 * POST /
 *   - Organization.prototype.save() — _id undefined in auto-mock, use expect.anything()
 *   - logEvent: organization_created, 4th arg = organization._id
 *
 * PUT /:id
 *   - NO findById first; goes straight to findByIdAndUpdate
 *   - findByIdAndUpdate returns null → 404
 *   - org_admin path calls req.profile.organizationId.equals(organizationId)
 *     → organizationId must be a fakeId object
 *   - super_admin: canUpdate=true, no .equals() call
 *   - logEvent 4th arg = organizationId string (from req.params.id)
 *
 * DELETE /:id
 *   - requireRole('super_admin')
 *   - Profile.countDocuments({organizationId, isActive:true}) MUST return 0
 *     or route returns 400
 *   - logEvent: 'organization_deleted' (NOT 'organization_deactivated')
 *   - org.save() ✓
 */

// ─── Shared mutable auth state ────────────────────────────────────────────────

function fakeId(val) {
    const s = String(val);
    return { toString: () => s, toJSON: () => s, equals: (o) => s === String(o?._id ?? o) };
}

const mockAuthState = {
    user:    { id: 'super-admin', supabaseUid: 'super-admin' },
    profile: { _id: 'super-profile', supabaseUid: 'super-admin', role: 'super_admin', organizationId: null },
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../src/middleware/authenticate', () => ({
    authenticate:        (req, res, next) => { req.user = mockAuthState.user; req.profile = mockAuthState.profile; next(); },
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

jest.mock('../src/models/Organization');
jest.mock('../src/models/Profile');

// ─── Imports ──────────────────────────────────────────────────────────────────

const request      = require('supertest');
const app          = require('../src/server');
const Organization = require('../src/models/Organization');
const Profile      = require('../src/models/Profile');
const { logEvent, autoLogAccess } = require('../src/services/auditService');
const { mockOrganization, mockProfile } = require('./helpers/mockModels');

// ─── Chain builders ───────────────────────────────────────────────────────────

// GET / — find().sort().limit().skip()
function makeListChain(orgs) {
    const c = {};
    c.sort  = jest.fn().mockReturnValue(c);
    c.limit = jest.fn().mockReturnValue(c);
    c.skip  = jest.fn().mockResolvedValue(orgs);
    return c;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Organizations Routes', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthState.user    = { id: 'super-admin', supabaseUid: 'super-admin' };
        mockAuthState.profile = { _id: 'super-profile', supabaseUid: 'super-admin', role: 'super_admin', organizationId: null };
    });

    // ── GET /api/organizations ─────────────────────────────────────────────────

    describe('GET /api/organizations', () => {

        it('returns paginated org list for super_admin', async () => {
            const orgs = [mockOrganization({ _id: 'org1' }), mockOrganization({ _id: 'org2' })];
            Organization.find          = jest.fn().mockReturnValue(makeListChain(orgs));
            Organization.countDocuments = jest.fn().mockResolvedValue(2);

            const res = await request(app).get('/api/organizations').query({ page: 1, limit: 20 });

            expect(res.status).toBe(200);
            expect(res.body.organizations).toHaveLength(2);
            expect(res.body.pagination.total).toBe(2);
            // autoLogAccess factory is called at route registration (server startup),
            // not per-request, so it fires before clearAllMocks() and cannot be asserted
            // per-test. The middleware chain correctness is validated by the 200 response.
        });

        it('returns 403 for non-super_admin', async () => {
            mockAuthState.profile = { _id: 'cm-profile', supabaseUid: 'cm-user', role: 'care_manager', organizationId: 'org123' };
            const res = await request(app).get('/api/organizations');
            expect(res.status).toBe(403);
        });

        it('applies search filter across name, email, city', async () => {
            Organization.find          = jest.fn().mockReturnValue(makeListChain([]));
            Organization.countDocuments = jest.fn().mockResolvedValue(0);

            await request(app).get('/api/organizations').query({ search: 'Hyd' });

            expect(Organization.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    $or: [
                        { name:  { $regex: 'Hyd', $options: 'i' } },
                        { email: { $regex: 'Hyd', $options: 'i' } },
                        { city:  { $regex: 'Hyd', $options: 'i' } },
                    ],
                })
            );
        });

        it('applies city filter as a regex (not exact match)', async () => {
            // Route does: query.city = { $regex: city, $options: 'i' }
            Organization.find          = jest.fn().mockReturnValue(makeListChain([]));
            Organization.countDocuments = jest.fn().mockResolvedValue(0);

            await request(app).get('/api/organizations').query({ city: 'Hyderabad' });

            expect(Organization.find).toHaveBeenCalledWith(
                expect.objectContaining({ city: { $regex: 'Hyderabad', $options: 'i' } })
            );
        });
    });

    // ── POST /api/organizations ────────────────────────────────────────────────

    describe('POST /api/organizations', () => {

        it('returns 400 when required fields are missing', async () => {
            const res = await request(app).post('/api/organizations').send({ email: 'a@b.com' });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/missing required fields/i);
        });

        it('returns 400 when an org with the same city already exists', async () => {
            Organization.findOne = jest.fn().mockResolvedValue(mockOrganization({ city: 'Hyderabad' }));
            const res = await request(app).post('/api/organizations').send({ name: 'New Org', city: 'Hyderabad' });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/already exists/i);
        });

        it('returns 403 for non-super_admin', async () => {
            mockAuthState.profile = { _id: 'admin-profile', supabaseUid: 'admin-user', role: 'org_admin', organizationId: 'org123' };
            const res = await request(app).post('/api/organizations').send({ name: 'New Org', city: 'Chennai' });
            expect(res.status).toBe(403);
        });

        it('creates organization successfully', async () => {
            Organization.findOne = jest.fn().mockResolvedValue(null);
            // _id will be undefined from auto-mock — set on prototype so logEvent gets a truthy value
            Organization.prototype._id  = 'new-org-id';
            Organization.prototype.save = jest.fn().mockResolvedValue({});

            const res = await request(app)
                .post('/api/organizations')
                .send({ name: 'New Org', city: 'Chennai', email: 'admin@neworg.in' });

            expect(res.status).toBe(201);
            expect(logEvent).toHaveBeenCalledWith(
                'super-admin',
                'organization_created',
                'organization',
                expect.anything(),  // organization._id from prototype mock
                expect.any(Object),
                expect.any(Object)
            );
        });
    });

    // ── GET /api/organizations/:id ─────────────────────────────────────────────

    describe('GET /api/organizations/:id', () => {

        it('allows super_admin to read any org', async () => {
            Organization.findById = jest.fn().mockResolvedValue(mockOrganization({ _id: 'org123' }));
            const res = await request(app).get('/api/organizations/org123');
            expect(res.status).toBe(200);
        });

        it('allows org_admin to read their own org', async () => {
            mockAuthState.profile = {
                _id: 'admin-profile', supabaseUid: 'admin-user', role: 'org_admin',
                organizationId: fakeId('org123'),
            };
            Organization.findById = jest.fn().mockResolvedValue(mockOrganization({ _id: 'org123' }));
            const res = await request(app).get('/api/organizations/org123');
            expect(res.status).toBe(200);
        });

        it('returns 403 when org_admin accesses a different org', async () => {
            mockAuthState.profile = {
                _id: 'admin-profile', supabaseUid: 'admin-user', role: 'org_admin',
                organizationId: fakeId('org456'),
            };
            Organization.findById = jest.fn().mockResolvedValue(mockOrganization({ _id: 'org123' }));
            const res = await request(app).get('/api/organizations/org123');
            expect(res.status).toBe(403);
        });

        it('returns 404 when org does not exist', async () => {
            Organization.findById = jest.fn().mockResolvedValue(null);
            const res = await request(app).get('/api/organizations/nonexistent');
            expect(res.status).toBe(404);
        });
    });

    // ── PUT /api/organizations/:id ─────────────────────────────────────────────

    describe('PUT /api/organizations/:id', () => {

        it('allows super_admin to update an org', async () => {
            const updated = mockOrganization({ _id: 'org123', name: 'New Name' });
            // Route: findByIdAndUpdate directly — no findById first
            Organization.findByIdAndUpdate = jest.fn().mockResolvedValue(updated);

            const res = await request(app)
                .put('/api/organizations/org123')
                .send({ name: 'New Name', city: 'New City' });

            expect(res.status).toBe(200);
            expect(Organization.findByIdAndUpdate).toHaveBeenCalledWith(
                'org123',
                expect.objectContaining({ name: 'New Name', city: 'New City' }),
                expect.objectContaining({ new: true, runValidators: true })
            );
            // logEvent 4th arg = req.params.id (string), not org._id object
            expect(logEvent).toHaveBeenCalledWith(
                'super-admin', 'organization_updated', 'organization', 'org123',
                expect.any(Object), expect.any(Object)
            );
        });

        it('returns 403 for org_admin updating a different org', async () => {
            mockAuthState.profile = {
                _id: 'admin-profile', supabaseUid: 'admin-user', role: 'org_admin',
                organizationId: fakeId('org456'),  // ≠ org123
            };
            const res = await request(app).put('/api/organizations/org123').send({ phone: '999' });
            expect(res.status).toBe(403);
        });

        it('returns 404 when findByIdAndUpdate returns null', async () => {
            // Route goes straight to findByIdAndUpdate — returns null → 404
            Organization.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
            const res = await request(app).put('/api/organizations/nonexistent').send({ name: 'X' });
            expect(res.status).toBe(404);
        });
    });

    // ── DELETE /api/organizations/:id ──────────────────────────────────────────

    describe('DELETE /api/organizations/:id', () => {

        it('soft-deletes org via org.save() with isActive=false', async () => {
            const org = mockOrganization({ _id: 'org123', name: 'Test Org', city: 'Hyderabad', isActive: true });
            Organization.findById = jest.fn().mockResolvedValue(org);
            // Route checks Profile.countDocuments FIRST — must return 0 or route returns 400
            Profile.countDocuments = jest.fn().mockResolvedValue(0);

            const res = await request(app).delete('/api/organizations/org123');

            expect(res.status).toBe(200);
            expect(org.save).toHaveBeenCalled();
            expect(org.isActive).toBe(false);
            // Route logs 'organization_deleted' — not 'organization_deactivated'
            expect(logEvent).toHaveBeenCalledWith(
                'super-admin', 'organization_deleted', 'organization', 'org123',
                expect.any(Object), expect.any(Object)
            );
        });

        it('returns 400 when active users still exist', async () => {
            const org = mockOrganization({ _id: 'org123' });
            Organization.findById = jest.fn().mockResolvedValue(org);
            Profile.countDocuments = jest.fn().mockResolvedValue(5);  // 5 active users

            const res = await request(app).delete('/api/organizations/org123');

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/active users/i);
        });

        it('returns 403 for non-super_admin', async () => {
            mockAuthState.profile = { _id: 'admin-profile', supabaseUid: 'admin-user', role: 'org_admin', organizationId: 'org123' };
            const res = await request(app).delete('/api/organizations/org123');
            expect(res.status).toBe(403);
        });

        it('returns 404 when org does not exist', async () => {
            Organization.findById  = jest.fn().mockResolvedValue(null);
            Profile.countDocuments = jest.fn().mockResolvedValue(0);
            const res = await request(app).delete('/api/organizations/nonexistent');
            expect(res.status).toBe(404);
        });
    });
});