process.env.NODE_ENV = 'test';

/**
 * patients.test.js — rewritten against actual route
 *
 * Key facts from src/routes/patients.js:
 *
 * canReadPatient:
 *   org_admin/care_manager: patient.organization_id?.equals(profile.organizationId)
 *   caller:                 patient.assigned_caller_id?.equals(profile._id)
 *   → BOTH sides need .equals(). mockPatient fields and mockAuthState.profile
 *     must use fakeId objects.
 *
 * GET /     → find().populate()x3.sort().limit().skip() + countDocuments in Promise.all
 * GET /:id  → findById().populate()x3, then canReadPatient
 * PUT /:id  → findById (plain, no populate), canReadPatient, findByIdAndUpdate().populate()x3
 * DELETE /  → requireRole('super_admin','org_admin'), findById, canReadPatient,
 *             patient.save(), Organization.findByIdAndUpdate,
 *             logEvent: 'patient_deactivated'
 */

// ─── fakeId helper ────────────────────────────────────────────────────────────

function fakeId(val) {
    const s = String(val);
    return { toString: () => s, toJSON: () => s, equals: (o) => s === String(o?._id ?? o) };
}

// ─── Shared mutable auth state ────────────────────────────────────────────────

const mockAuthState = {
    user:    { id: 'cm-user', supabaseUid: 'cm-user' },
    profile: {
        _id:            fakeId('cm-profile'),
        supabaseUid:    'cm-user',
        role:           'care_manager',
        organizationId: fakeId('org123'),
    },
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

jest.mock('../src/middleware/scopeFilter', () => ({
    scopeFilter: () => (req, res, next) => { req.scopeFilter = {}; next(); },
}));

jest.mock('../src/services/auditService', () => ({
    logEvent:               jest.fn().mockResolvedValue(undefined),
    logSecurityEvent:       jest.fn().mockResolvedValue(undefined),
    autoLogAccess:          jest.fn(() => (req, res, next) => next()),
    getUserActivitySummary: jest.fn(),
    getSecurityIncidents:   jest.fn(),
}));

jest.mock('../src/models/Patient');
jest.mock('../src/models/Organization');

// ─── Imports ──────────────────────────────────────────────────────────────────

const request      = require('supertest');
const app          = require('../src/server');
const Patient      = require('../src/models/Patient');
const Organization = require('../src/models/Organization');
const { logEvent } = require('../src/services/auditService');
const { mockPatient, mockOrganization } = require('./helpers/mockModels');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a patient whose organization_id and assigned_caller_id have .equals()
 * so canReadPatient() works correctly.
 */
function makePatient(overrides = {}) {
    const orgId    = overrides.organization_id    || 'org123';
    const callerId = overrides.assigned_caller_id || 'cm-profile';
    const base = mockPatient({ ...overrides });
    return {
        ...base,
        organization_id:    fakeId(orgId),
        assigned_caller_id: fakeId(callerId),
    };
}

// GET / — find().populate()x3.sort().limit().skip()
function makeListChain(patients) {
    const c = {};
    c.populate = jest.fn().mockReturnValue(c);
    c.sort     = jest.fn().mockReturnValue(c);
    c.limit    = jest.fn().mockReturnValue(c);
    c.skip     = jest.fn().mockResolvedValue(patients);
    return c;
}

// GET /:id — findById().populate()x3
function makeFindByIdChain(patient) {
    const c = { populate: jest.fn() };
    c.populate
        .mockReturnValueOnce(c)
        .mockReturnValueOnce(c)
        .mockResolvedValueOnce(patient);
    return c;
}

// PUT — findByIdAndUpdate().populate()x3
function makeUpdateChain(patient) {
    const c = { populate: jest.fn() };
    c.populate
        .mockReturnValueOnce(c)
        .mockReturnValueOnce(c)
        .mockResolvedValueOnce(patient);
    return c;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Patients Routes', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthState.user    = { id: 'cm-user', supabaseUid: 'cm-user' };
        mockAuthState.profile = {
            _id:            fakeId('cm-profile'),
            supabaseUid:    'cm-user',
            role:           'care_manager',
            organizationId: fakeId('org123'),
        };
    });

    // ── GET /api/patients ──────────────────────────────────────────────────────

    describe('GET /api/patients', () => {

        it('returns paginated list for care_manager', async () => {
            const patients = [makePatient({ _id: 'p1' }), makePatient({ _id: 'p2' })];
            Patient.find           = jest.fn().mockReturnValue(makeListChain(patients));
            Patient.countDocuments = jest.fn().mockResolvedValue(2);

            const res = await request(app).get('/api/patients').query({ page: 1, limit: 20 });

            expect(res.status).toBe(200);
            expect(res.body.patients).toHaveLength(2);
        });

        it('returns scoped list for caller (assigned patients only)', async () => {
            mockAuthState.profile = {
                _id:            fakeId('caller-profile'),
                supabaseUid:    'caller-user',
                role:           'caller',
                organizationId: fakeId('org123'),
            };
            const patients = [makePatient({ assigned_caller_id: 'caller-profile' })];
            Patient.find           = jest.fn().mockReturnValue(makeListChain(patients));
            Patient.countDocuments = jest.fn().mockResolvedValue(1);

            const res = await request(app).get('/api/patients');

            expect(res.status).toBe(200);
            expect(Patient.find).toHaveBeenCalledWith(
                expect.objectContaining({ assigned_caller_id: expect.anything() })
            );
        });

        it('applies search filter across name, email, phone, city', async () => {
            Patient.find           = jest.fn().mockReturnValue(makeListChain([]));
            Patient.countDocuments = jest.fn().mockResolvedValue(0);

            await request(app).get('/api/patients').query({ search: 'Ravi' });

            expect(Patient.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    $or: [
                        { name:  { $regex: 'Ravi', $options: 'i' } },
                        { email: { $regex: 'Ravi', $options: 'i' } },
                        { phone: { $regex: 'Ravi', $options: 'i' } },
                        { city:  { $regex: 'Ravi', $options: 'i' } },
                    ],
                })
            );
        });

        it('applies risk_level filter', async () => {
            Patient.find           = jest.fn().mockReturnValue(makeListChain([]));
            Patient.countDocuments = jest.fn().mockResolvedValue(0);

            await request(app).get('/api/patients').query({ risk_level: 'high' });

            expect(Patient.find).toHaveBeenCalledWith(
                expect.objectContaining({ risk_level: 'high' })
            );
        });
    });

    // ── GET /api/patients/:id ──────────────────────────────────────────────────

    describe('GET /api/patients/:id', () => {

        it('allows super_admin to read any patient', async () => {
            mockAuthState.profile = { _id: fakeId('super'), supabaseUid: 'super', role: 'super_admin', organizationId: null };
            const patient = makePatient({ _id: 'patient123', organization_id: 'other-org' });
            Patient.findById = jest.fn().mockReturnValue(makeFindByIdChain(patient));

            const res = await request(app).get('/api/patients/patient123');
            expect(res.status).toBe(200);
        });

        it('allows org_admin to read a patient in their org', async () => {
            mockAuthState.profile = { _id: fakeId('admin'), supabaseUid: 'admin', role: 'org_admin', organizationId: fakeId('org123') };
            const patient = makePatient({ _id: 'patient123', organization_id: 'org123' });
            Patient.findById = jest.fn().mockReturnValue(makeFindByIdChain(patient));

            const res = await request(app).get('/api/patients/patient123');
            expect(res.status).toBe(200);
        });

        it('allows caller to read their assigned patient', async () => {
            mockAuthState.profile = { _id: fakeId('caller-id'), supabaseUid: 'caller', role: 'caller', organizationId: fakeId('org123') };
            const patient = makePatient({ _id: 'patient123', assigned_caller_id: 'caller-id' });
            Patient.findById = jest.fn().mockReturnValue(makeFindByIdChain(patient));

            const res = await request(app).get('/api/patients/patient123');
            expect(res.status).toBe(200);
        });

        it('returns 403 when caller tries to read an unassigned patient', async () => {
            mockAuthState.profile = { _id: fakeId('caller-id'), supabaseUid: 'caller', role: 'caller', organizationId: fakeId('org123') };
            // assigned to a different caller
            const patient = makePatient({ _id: 'patient123', assigned_caller_id: 'other-caller' });
            Patient.findById = jest.fn().mockReturnValue(makeFindByIdChain(patient));

            const res = await request(app).get('/api/patients/patient123');
            expect(res.status).toBe(403);
        });

        it('returns 404 when patient does not exist', async () => {
            Patient.findById = jest.fn().mockReturnValue(makeFindByIdChain(null));
            const res = await request(app).get('/api/patients/nonexistent');
            expect(res.status).toBe(404);
        });
    });

    // ── PUT /api/patients/:id ──────────────────────────────────────────────────

    describe('PUT /api/patients/:id', () => {

        it('allows care_manager to update permitted fields', async () => {
            // care_manager allowed: risk_level, notes, care_instructions, assigned_caller_id, preferred_call_times, call_frequency_days
            const patient = makePatient({ _id: 'patient123', organization_id: 'org123' });
            const updated = makePatient({ _id: 'patient123', risk_level: 'high', notes: 'Needs attention' });

            // PUT route: findById (plain) then findByIdAndUpdate().populate()x3
            Patient.findById          = jest.fn().mockResolvedValue(patient);
            Patient.findByIdAndUpdate = jest.fn().mockReturnValue(makeUpdateChain(updated));

            const res = await request(app)
                .put('/api/patients/patient123')
                .send({ risk_level: 'high', notes: 'Needs attention' });

            expect(res.status).toBe(200);
            expect(Patient.findByIdAndUpdate).toHaveBeenCalledWith(
                'patient123',
                expect.objectContaining({ risk_level: 'high', notes: 'Needs attention' }),
                expect.objectContaining({ new: true, runValidators: true })
            );
        });

        it('returns 400 when care_manager sends only restricted fields', async () => {
            // 'name' is NOT in care_manager's allowed list → no valid fields → 400
            const patient = makePatient({ _id: 'patient123', organization_id: 'org123' });
            Patient.findById = jest.fn().mockResolvedValue(patient);

            const res = await request(app)
                .put('/api/patients/patient123')
                .send({ name: 'New Name' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/no valid fields/i);
        });

        it('returns 404 when patient does not exist', async () => {
            Patient.findById = jest.fn().mockResolvedValue(null);
            const res = await request(app).put('/api/patients/nonexistent').send({ notes: 'test' });
            expect(res.status).toBe(404);
        });

        it('logs audit event on successful update', async () => {
            const patient = makePatient({ _id: 'patient123', organization_id: 'org123' });
            const updated = makePatient({ _id: 'patient123' });
            Patient.findById          = jest.fn().mockResolvedValue(patient);
            Patient.findByIdAndUpdate = jest.fn().mockReturnValue(makeUpdateChain(updated));

            await request(app).put('/api/patients/patient123').send({ notes: 'Follow up needed' });

            expect(logEvent).toHaveBeenCalledWith(
                'cm-user',          // req.profile.supabaseUid
                'patient_updated',
                'patient',
                'patient123',       // req.params.id
                expect.any(Object),
                expect.any(Object)
            );
        });
    });

    // ── DELETE /api/patients/:id ───────────────────────────────────────────────

    describe('DELETE /api/patients/:id', () => {

        beforeEach(() => {
            // DELETE requires org_admin or super_admin
            mockAuthState.profile = {
                _id:            fakeId('admin-profile'),
                supabaseUid:    'admin-user',
                role:           'org_admin',
                organizationId: fakeId('org123'),
            };
        });

        it('soft-deletes patient by calling patient.save() with is_active=false', async () => {
            const patient = makePatient({ _id: 'patient123', organization_id: 'org123', is_active: true });
            Patient.findById = jest.fn().mockResolvedValue(patient);
            Organization.findByIdAndUpdate = jest.fn().mockResolvedValue(null);

            const res = await request(app).delete('/api/patients/patient123');

            expect(res.status).toBe(200);
            expect(patient.save).toHaveBeenCalled();
            expect(patient.is_active).toBe(false);
        });

        it('decrements org counts.patients counter on delete', async () => {
            const patient = makePatient({ _id: 'patient123', organization_id: 'org123' });
            Patient.findById = jest.fn().mockResolvedValue(patient);
            Organization.findByIdAndUpdate = jest.fn().mockResolvedValue(null);

            await request(app).delete('/api/patients/patient123');

            expect(Organization.findByIdAndUpdate).toHaveBeenCalledWith(
                expect.anything(),
                { $inc: { 'counts.patients': -1 } }
            );
        });

        it('returns 404 when patient does not exist', async () => {
            Patient.findById = jest.fn().mockResolvedValue(null);
            const res = await request(app).delete('/api/patients/nonexistent');
            expect(res.status).toBe(404);
        });

        it('returns 403 when care_manager tries to delete (requireRole blocks)', async () => {
            mockAuthState.profile = { _id: fakeId('cm'), supabaseUid: 'cm', role: 'care_manager', organizationId: fakeId('org123') };
            const res = await request(app).delete('/api/patients/patient123');
            expect(res.status).toBe(403);
        });

        it('logs patient_deactivated event on successful delete', async () => {
            const patient = makePatient({ _id: 'patient123', organization_id: 'org123', email: 'p@careco.in' });
            Patient.findById = jest.fn().mockResolvedValue(patient);
            Organization.findByIdAndUpdate = jest.fn().mockResolvedValue(null);

            await request(app).delete('/api/patients/patient123');

            expect(logEvent).toHaveBeenCalledWith(
                'admin-user',
                'patient_deactivated',
                'patient',
                'patient123',
                expect.any(Object),
                expect.any(Object)
            );
        });
    });
});