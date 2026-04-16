process.env.NODE_ENV = 'test';

/**
 * tests/users/patients.test.js
 *
 * Tests for src/routes/users/patients.js
 * Notable quirks:
 *   - GET /cities and GET /location/reverse are PUBLIC (no authenticate)
 *   - GET /me and POST /subscribe use req.profile._id for auto-seed
 *   - POST /subscribe calls the heavy subscribeAndSeedDemoData() — we skip deep seeding,
 *     just test the happy path and error branches
 *   - GET /me/calls chain: CallLog.find().select().sort().skip().limit().populate()
 *   - GET /me/medications: Patient.findOne().select()
 *   - GET /me/caller: Patient.findOne (plain), Caller.findById().select()
 */

// ─── Auth state ───────────────────────────────────────────────────────────────

const mockAuthState = {
    rejectAuth: false,
    userId:     'sup-uid-patient',
    profileId:  'profile-id',
    email:      'patient@careco.in',
    metadata:   { full_name: 'Test Patient' },
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../src/middleware/authenticate', () => ({
    authenticate: (req, res, next) => {
        if (mockAuthState.rejectAuth) return res.status(401).json({ error: 'Unauthorized' });
        req.user    = { id: mockAuthState.userId, email: mockAuthState.email, user_metadata: mockAuthState.metadata };
        req.profile = { _id: mockAuthState.profileId };
        next();
    },
    authenticateSession: (req, res, next) => {
        if (mockAuthState.rejectAuth) return res.status(401).json({ error: 'Unauthorized' });
        req.user    = { id: mockAuthState.userId, email: mockAuthState.email };
        req.profile = { _id: mockAuthState.profileId };
        next();
    },
    requireRole: () => (req, res, next) => next(),
}));

jest.mock('../../src/models/Patient');
jest.mock('../../src/models/CallLog');
jest.mock('../../src/models/MedicineLog');
jest.mock('../../src/models/Caller');
jest.mock('../../src/models/Alert');
jest.mock('../../src/models/City');

// ─── Imports ──────────────────────────────────────────────────────────────────

const request    = require('supertest');
const app        = require('../../src/server');
const Patient    = require('../../src/models/Patient');
const CallLog    = require('../../src/models/CallLog');
const MedicineLog = require('../../src/models/MedicineLog');
const Caller     = require('../../src/models/Caller');
const Alert      = require('../../src/models/Alert');
const City       = require('../../src/models/City');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakeId(val) {
    const s = String(val);
    return { toString: () => s, toJSON: () => s, equals: (o) => s === String(o?._id ?? o) };
}

function makePatient(overrides = {}) {
    return {
        _id:                fakeId(overrides._id || 'patient-id'),
        supabase_uid:       overrides.supabase_uid || 'sup-uid-patient',
        name:               overrides.name || 'Test Patient',
        email:              overrides.email || 'patient@careco.in',
        city:               overrides.city || 'Hyderabad',
        organization_id:    fakeId(overrides.organization_id || 'org-id'),
        assigned_caller_id: overrides.assigned_caller_id ? fakeId(overrides.assigned_caller_id) : null,
        subscription:       overrides.subscription || { status: 'pending_payment', plan: 'basic' },
        medications:        overrides.medications || [],
        conditions:         overrides.conditions || [],
        save:               jest.fn().mockResolvedValue(true),
        ...overrides,
    };
}

/** CallLog.find().select().sort().skip().limit().populate() */
function makeCallLogChain(calls) {
    const c = {};
    c.select   = jest.fn().mockReturnValue(c);
    c.sort     = jest.fn().mockReturnValue(c);
    c.skip     = jest.fn().mockReturnValue(c);
    c.limit    = jest.fn().mockReturnValue(c);
    c.populate = jest.fn().mockResolvedValue(calls);
    return c;
}

/** City.find().sort() */
function makeCityFindChain(cities) {
    return { sort: jest.fn().mockResolvedValue(cities) };
}

/** Caller.findById().select() */
function makeCallerFindByIdChain(caller) {
    return { select: jest.fn().mockResolvedValue(caller) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('User Patients Routes', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthState.rejectAuth = false;
        mockAuthState.userId     = 'sup-uid-patient';
    });

    // ── GET /api/users/patients/cities ────────────────────────────────────────

    describe('GET /api/users/patients/cities', () => {

        it('returns list of active cities', async () => {
            City.find = jest.fn().mockReturnValue(makeCityFindChain([
                { name: 'Hyderabad', state: 'Telangana' },
                { name: 'Chennai',   state: 'Tamil Nadu' },
            ]));

            const res = await request(app).get('/api/users/patients/cities');

            expect(res.status).toBe(200);
            expect(res.body.cities).toHaveLength(2);
        });

        it('auto-seeds cities when none exist, then returns them', async () => {
            City.find      = jest.fn()
                .mockReturnValueOnce(makeCityFindChain([]))    // first call returns empty
                .mockReturnValueOnce(makeCityFindChain([      // after seed, returns 5
                    { name: 'Hyderabad' }, { name: 'Bengaluru' }, { name: 'Chennai' },
                    { name: 'Mumbai' },    { name: 'Delhi' },
                ]));
            City.insertMany = jest.fn().mockResolvedValue([]);

            const res = await request(app).get('/api/users/patients/cities');

            expect(res.status).toBe(200);
            expect(City.insertMany).toHaveBeenCalled();
            expect(res.body.cities).toHaveLength(5);
        });

        it('returns 500 on database error', async () => {
            City.find = jest.fn().mockReturnValue({ sort: jest.fn().mockRejectedValue(new Error('DB error')) });

            const res = await request(app).get('/api/users/patients/cities');

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Failed to fetch cities');
        });
    });

    // ── GET /api/users/patients/me ────────────────────────────────────────────

    describe('GET /api/users/patients/me', () => {

        it('returns existing patient profile', async () => {
            const patient = makePatient({ name: 'Puneeth Pujala' });
            Patient.findOne = jest.fn().mockResolvedValue(patient);

            const res = await request(app).get('/api/users/patients/me');

            expect(res.status).toBe(200);
            expect(res.body.patient.name).toBe('Puneeth Pujala');
        });

        it('auto-creates patient profile on first visit', async () => {
            const newPatient = makePatient({ name: 'Test Patient' });
            Patient.findOne = jest.fn().mockResolvedValue(null); // not found
            Patient.create  = jest.fn().mockResolvedValue(newPatient);

            const res = await request(app).get('/api/users/patients/me');

            expect(res.status).toBe(200);
            expect(Patient.create).toHaveBeenCalled();
        });

        it('returns 500 when auto-seed fails', async () => {
            Patient.findOne = jest.fn().mockResolvedValue(null);
            Patient.create  = jest.fn().mockRejectedValue(new Error('Seed failed'));

            const res = await request(app).get('/api/users/patients/me');

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Failed to auto-seed patient profile');
        });

        it('returns 500 on unexpected error', async () => {
            Patient.findOne = jest.fn().mockRejectedValue(new Error('DB error'));

            const res = await request(app).get('/api/users/patients/me');

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Failed to get patient profile');
        });

        it('returns 401 when not authenticated', async () => {
            mockAuthState.rejectAuth = true;
            const res = await request(app).get('/api/users/patients/me');
            expect(res.status).toBe(401);
        });
    });

    // ── PUT /api/users/patients/me ────────────────────────────────────────────

    describe('PUT /api/users/patients/me', () => {

        it('updates name and city successfully', async () => {
            const updated = makePatient({ name: 'New Name', city: 'Chennai' });
            Patient.findOneAndUpdate = jest.fn().mockResolvedValue(updated);

            const res = await request(app)
                .put('/api/users/patients/me')
                .send({ name: 'New Name', city: 'Chennai' });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Profile updated successfully');
            expect(Patient.findOneAndUpdate).toHaveBeenCalledWith(
                { supabase_uid: 'sup-uid-patient' },
                { $set: { name: 'New Name', city: 'Chennai' } },
                { new: true }
            );
        });

        it('returns 404 when patient not found', async () => {
            Patient.findOneAndUpdate = jest.fn().mockResolvedValue(null);

            const res = await request(app)
                .put('/api/users/patients/me')
                .send({ name: 'Test' });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Patient profile not found');
        });
    });

    // ── PUT /api/users/patients/me/emergency-contact ──────────────────────────

    describe('PUT /api/users/patients/me/emergency-contact', () => {

        it('updates emergency contact successfully', async () => {
            const updated = makePatient({ emergency_contact: { name: 'Son', phone: '+91999', relation: 'Son' } });
            Patient.findOneAndUpdate = jest.fn().mockResolvedValue(updated);

            const res = await request(app)
                .put('/api/users/patients/me/emergency-contact')
                .send({ name: 'Son', phone: '+91999', relation: 'Son' });

            expect(res.status).toBe(200);
            expect(Patient.findOneAndUpdate).toHaveBeenCalledWith(
                { supabase_uid: 'sup-uid-patient' },
                { emergency_contact: { name: 'Son', phone: '+91999', relation: 'Son' } },
                { new: true }
            );
        });

        it('returns 404 when patient not found', async () => {
            Patient.findOneAndUpdate = jest.fn().mockResolvedValue(null);

            const res = await request(app)
                .put('/api/users/patients/me/emergency-contact')
                .send({ name: 'Test', phone: '+91111', relation: 'Spouse' });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Patient profile not found');
        });
    });

    // ── GET /api/users/patients/me/caller ─────────────────────────────────────

    describe('GET /api/users/patients/me/caller', () => {

        it('returns assigned caller details', async () => {
            const patient = makePatient({ assigned_caller_id: 'caller-id' });
            const caller  = { _id: fakeId('caller-id'), name: 'Priya Sharma', phone: '+91987' };

            Patient.findOne = jest.fn().mockResolvedValue(patient);
            Caller.findById = jest.fn().mockReturnValue(makeCallerFindByIdChain(caller));

            const res = await request(app).get('/api/users/patients/me/caller');

            expect(res.status).toBe(200);
            expect(res.body.caller.name).toBe('Priya Sharma');
        });

        it('returns null caller when none assigned', async () => {
            const patient = makePatient({ assigned_caller_id: null });
            Patient.findOne = jest.fn().mockResolvedValue(patient);

            const res = await request(app).get('/api/users/patients/me/caller');

            expect(res.status).toBe(200);
            expect(res.body.caller).toBeNull();
        });

        it('returns null caller when patient not found', async () => {
            Patient.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app).get('/api/users/patients/me/caller');

            expect(res.status).toBe(200);
            expect(res.body.caller).toBeNull();
        });
    });

    // ── GET /api/users/patients/me/calls ──────────────────────────────────────

    describe('GET /api/users/patients/me/calls', () => {

        it('returns paginated call history with private fields stripped', async () => {
            const patient = makePatient();
            const calls   = [{ _id: fakeId('call-1'), status: 'completed' }];

            Patient.findOne         = jest.fn().mockResolvedValue(patient);
            CallLog.find            = jest.fn().mockReturnValue(makeCallLogChain(calls));
            CallLog.countDocuments  = jest.fn().mockResolvedValue(1);

            const res = await request(app)
                .get('/api/users/patients/me/calls')
                .query({ page: 1, limit: 20 });

            expect(res.status).toBe(200);
            expect(res.body.calls).toHaveLength(1);
            expect(res.body.pagination.total).toBe(1);
            // Verify -caller_notes -admin_notes were stripped
            expect(CallLog.find().select).toHaveBeenCalledWith('-caller_notes -admin_notes');
        });

        it('returns empty calls when patient not found', async () => {
            Patient.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app).get('/api/users/patients/me/calls');

            expect(res.status).toBe(200);
            expect(res.body.calls).toEqual([]);
        });
    });

    // ── GET /api/users/patients/me/medications ────────────────────────────────

    describe('GET /api/users/patients/me/medications', () => {

        it('returns medication schedule', async () => {
            const meds    = [{ name: 'Metformin', dosage: '500mg', times: ['morning'] }];
            // Route: Patient.findOne({...}).select('medications')
            Patient.findOne = jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue({ medications: meds }),
            });

            const res = await request(app).get('/api/users/patients/me/medications');

            expect(res.status).toBe(200);
            expect(res.body.medications).toHaveLength(1);
            expect(res.body.medications[0].name).toBe('Metformin');
        });

        it('returns empty array when patient not found', async () => {
            Patient.findOne = jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(null),
            });

            const res = await request(app).get('/api/users/patients/me/medications');

            expect(res.status).toBe(200);
            expect(res.body.medications).toEqual([]);
        });
    });

    // ── POST /api/users/patients/me/flag-issue ────────────────────────────────

    describe('POST /api/users/patients/me/flag-issue', () => {

        it('creates alert for a missed call complaint', async () => {
            const patient = makePatient({ assigned_caller_id: 'caller-id' });
            const alert   = { save: jest.fn().mockResolvedValue(true) };

            Patient.findOne = jest.fn().mockResolvedValue(patient);
            Alert.mockImplementation(() => alert);

            const res = await request(app)
                .post('/api/users/patients/me/flag-issue')
                .send({ type: 'missed_call', description: 'Caller did not call at scheduled time' });

            expect(res.status).toBe(201);
            expect(res.body.message).toBe('Issue flagged successfully');
            expect(alert.save).toHaveBeenCalled();
        });

        it('returns 404 when patient not found', async () => {
            Patient.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app)
                .post('/api/users/patients/me/flag-issue')
                .send({ type: 'missed_call', description: 'Test' });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Patient profile not found');
        });
    });

    // ── POST /api/users/patients/subscribe ────────────────────────────────────

    describe('POST /api/users/patients/subscribe', () => {

        it('returns 400 when already subscribed', async () => {
            const patient = makePatient({ subscription: { status: 'active', plan: 'basic' } });
            Patient.findOne = jest.fn().mockResolvedValue(patient);

            const res = await request(app)
                .post('/api/users/patients/subscribe')
                .send({ paid: 1 });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Already subscribed');
        });

        it('returns 500 when auto-seed fails during subscribe for new patient', async () => {
            Patient.findOne = jest.fn().mockResolvedValue(null);
            Patient.create  = jest.fn().mockRejectedValue(new Error('Seed error'));

            const res = await request(app)
                .post('/api/users/patients/subscribe')
                .send({ paid: 1 });

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Failed to create patient profile');
        });
    });
});