process.env.NODE_ENV = 'test';

/**
 * tests/users/callers.test.js
 *
 * Tests for src/routes/users/callers.js
 * All routes authenticate → req.user.id.
 * CallLog is used as constructor AND has static methods.
 */

// ─── Auth state ───────────────────────────────────────────────────────────────

const mockAuthState = { rejectAuth: false };

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../src/middleware/authenticate', () => ({
    authenticate: (req, res, next) => {
        if (mockAuthState.rejectAuth) return res.status(401).json({ error: 'Unauthorized' });
        req.user = { id: 'sup-uid-caller' };
        next();
    },
    authenticateSession: (req, res, next) => {
        if (mockAuthState.rejectAuth) return res.status(401).json({ error: 'Unauthorized' });
        req.user = { id: 'sup-uid-caller' };
        next();
    },
    requireRole: () => (req, res, next) => next(),
}));

jest.mock('../../src/models/Caller');
jest.mock('../../src/models/Patient');
// CallLog used as constructor + statics — mock as class
jest.mock('../../src/models/CallLog');
jest.mock('../../src/models/Alert');

// ─── Imports ──────────────────────────────────────────────────────────────────

const request = require('supertest');
const app     = require('../../src/server');
const Caller  = require('../../src/models/Caller');
const Patient = require('../../src/models/Patient');
const CallLog = require('../../src/models/CallLog');
const Alert   = require('../../src/models/Alert');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakeId(val) {
    const s = String(val);
    return { toString: () => s, toJSON: () => s, equals: (o) => s === String(o?._id ?? o) };
}

function makeCaller(overrides = {}) {
    return {
        _id:            fakeId(overrides._id || 'caller-id'),
        supabase_uid:   'sup-uid-caller',
        name:           overrides.name || 'Priya Sharma',
        email:          'caller@careco.in',
        organization_id: fakeId(overrides.organization_id || 'org-id'),
        manager_id:     overrides.manager_id ? fakeId(overrides.manager_id) : fakeId('manager-id'),
        patient_ids:    overrides.patient_ids !== undefined ? overrides.patient_ids : ['patient-id'],
        performance:    overrides.performance || { calls_this_week: 12, adherence_rate: 94, escalations: 0 },
        is_active:      true,
        ...overrides,
    };
}

function makePatient(overrides = {}) {
    const id = fakeId(overrides._id || 'patient-id');
    return {
        _id:         id,
        name:        overrides.name || 'Test Patient',
        email:       'patient@careco.in',
        city:        'Hyderabad',
        conditions:  [],
        medications: [],
        toJSON:      function () { return { ...this, _id: id.toString() }; },
        ...overrides,
    };
}

/** CallLog.find().select().sort().limit() — used by GET /me/patients/:id */
function makeCallLogChain(calls) {
    const c = {};
    c.select = jest.fn().mockReturnValue(c);
    c.sort   = jest.fn().mockReturnValue(c);
    c.limit  = jest.fn().mockResolvedValue(calls);
    return c;
}

/** Patient.find().select() */
function makePatientFindChain(patients) {
    return { select: jest.fn().mockResolvedValue(patients) };
}

/** CallLog.find() — used by GET /me/patients/today (plain resolve) */

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('User Callers Routes', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthState.rejectAuth = false;
    });

    // ── GET /api/users/callers/me ──────────────────────────────────────────────

    describe('GET /api/users/callers/me', () => {

        it('returns own caller profile', async () => {
            Caller.findOne = jest.fn().mockResolvedValue(makeCaller({ name: 'Priya Sharma' }));

            const res = await request(app).get('/api/users/callers/me');

            expect(res.status).toBe(200);
            expect(res.body.caller.name).toBe('Priya Sharma');
        });

        it('returns 404 when caller not found', async () => {
            Caller.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app).get('/api/users/callers/me');

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Caller profile not found');
        });

        it('returns 500 on database error', async () => {
            Caller.findOne = jest.fn().mockRejectedValue(new Error('DB error'));

            const res = await request(app).get('/api/users/callers/me');

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Failed to get caller profile');
        });
    });

    // ── GET /api/users/callers/me/patients/today ───────────────────────────────

    describe('GET /api/users/callers/me/patients/today', () => {

        it('returns today patient list with call status', async () => {
            const caller   = makeCaller({ patient_ids: ['patient-1', 'patient-2'] });
            const patients = [
                makePatient({ _id: 'patient-1', name: 'Alpha' }),
                makePatient({ _id: 'patient-2', name: 'Beta' }),
            ];
            // One completed call for patient-1
            const todayCalls = [{ patient_id: 'patient-1', status: 'completed', _id: fakeId('call-1') }];

            Caller.findOne = jest.fn().mockResolvedValue(caller);
            Patient.find   = jest.fn().mockReturnValue(makePatientFindChain(patients));
            CallLog.find   = jest.fn().mockResolvedValue(todayCalls);

            const res = await request(app).get('/api/users/callers/me/patients/today');

            expect(res.status).toBe(200);
            expect(res.body.patients).toHaveLength(2);
            expect(res.body.summary.total).toBe(2);
            expect(res.body.summary.called).toBe(1);
        });

        it('sorts patients: pending before completed', async () => {
            const caller   = makeCaller({ patient_ids: ['p1', 'p2'] });
            const patients = [
                makePatient({ _id: 'p1', name: 'Completed' }),
                makePatient({ _id: 'p2', name: 'Pending' }),
            ];
            // Only p1 has a completed call
            const todayCalls = [{ patient_id: 'p1', status: 'completed', _id: fakeId('call-1') }];

            Caller.findOne = jest.fn().mockResolvedValue(caller);
            Patient.find   = jest.fn().mockReturnValue(makePatientFindChain(patients));
            CallLog.find   = jest.fn().mockResolvedValue(todayCalls);

            const res = await request(app).get('/api/users/callers/me/patients/today');

            expect(res.status).toBe(200);
            // pending (p2) comes before completed (p1)
            expect(res.body.patients[0].name).toBe('Pending');
            expect(res.body.patients[1].name).toBe('Completed');
        });

        it('returns 404 when caller not found', async () => {
            Caller.findOne = jest.fn().mockResolvedValue(null);
            const res = await request(app).get('/api/users/callers/me/patients/today');
            expect(res.status).toBe(404);
        });
    });

    // ── POST /api/users/callers/me/calls ──────────────────────────────────────

    describe('POST /api/users/callers/me/calls', () => {

        it('logs a completed call successfully', async () => {
            const caller  = makeCaller({ patient_ids: ['patient-id'] });
            const callLog = { _id: fakeId('call-1'), save: jest.fn().mockResolvedValue(true) };

            Caller.findOne = jest.fn().mockResolvedValue(caller);
            CallLog.mockImplementation(() => callLog);
            CallLog.countDocuments = jest.fn().mockResolvedValue(0);

            const res = await request(app)
                .post('/api/users/callers/me/calls')
                .send({ patient_id: 'patient-id', status: 'completed', call_duration_seconds: 300 });

            expect(res.status).toBe(201);
            expect(res.body.message).toBe('Call logged successfully');
            expect(callLog.save).toHaveBeenCalled();
        });

        it('returns 403 when patient not assigned to caller', async () => {
            Caller.findOne = jest.fn().mockResolvedValue(makeCaller({ patient_ids: ['other-patient'] }));

            const res = await request(app)
                .post('/api/users/callers/me/calls')
                .send({ patient_id: 'unassigned-patient', status: 'completed' });

            expect(res.status).toBe(403);
            expect(res.body.error).toBe('Patient not assigned to you');
        });

        it('creates alert after 3 consecutive missed calls', async () => {
            const caller  = makeCaller({ patient_ids: ['patient-id'] });
            const callLog = { _id: fakeId('call-1'), save: jest.fn().mockResolvedValue(true) };
            const alert   = { save: jest.fn().mockResolvedValue(true) };

            Caller.findOne         = jest.fn().mockResolvedValue(caller);
            CallLog.mockImplementation(() => callLog);
            CallLog.countDocuments  = jest.fn().mockResolvedValue(3); // 3 misses
            Alert.mockImplementation(() => alert);

            await request(app)
                .post('/api/users/callers/me/calls')
                .send({ patient_id: 'patient-id', status: 'missed' });

            expect(alert.save).toHaveBeenCalled();
        });

        it('does not create alert when missed calls < 3', async () => {
            const caller  = makeCaller({ patient_ids: ['patient-id'] });
            const callLog = { _id: fakeId('call-1'), save: jest.fn().mockResolvedValue(true) };
            const alert   = { save: jest.fn().mockResolvedValue(true) };

            Caller.findOne         = jest.fn().mockResolvedValue(caller);
            CallLog.mockImplementation(() => callLog);
            CallLog.countDocuments  = jest.fn().mockResolvedValue(2); // only 2 misses
            Alert.mockImplementation(() => alert);

            await request(app)
                .post('/api/users/callers/me/calls')
                .send({ patient_id: 'patient-id', status: 'missed' });

            expect(alert.save).not.toHaveBeenCalled();
        });

        it('creates alert after 3 medicine refusals', async () => {
            const caller  = makeCaller({ patient_ids: ['patient-id'] });
            const callLog = { _id: fakeId('call-1'), save: jest.fn().mockResolvedValue(true) };
            const alert   = { save: jest.fn().mockResolvedValue(true) };

            Caller.findOne         = jest.fn().mockResolvedValue(caller);
            CallLog.mockImplementation(() => callLog);
            CallLog.countDocuments  = jest.fn().mockResolvedValue(3); // 3 refusals
            Alert.mockImplementation(() => alert);

            await request(app)
                .post('/api/users/callers/me/calls')
                .send({ patient_id: 'patient-id', status: 'refused' });

            expect(alert.save).toHaveBeenCalled();
        });

        it('returns 404 when caller not found', async () => {
            Caller.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app)
                .post('/api/users/callers/me/calls')
                .send({ patient_id: 'patient-id', status: 'completed' });

            expect(res.status).toBe(404);
        });
    });

    // ── GET /api/users/callers/me/patients/:patientId ─────────────────────────

    describe('GET /api/users/callers/me/patients/:patientId', () => {

        it('returns patient profile and call history', async () => {
            const caller  = makeCaller({ patient_ids: ['patient-id'] });
            const patient = makePatient({ _id: 'patient-id', name: 'Test Patient' });
            const calls   = [{ _id: fakeId('call-1'), status: 'completed' }];

            Caller.findOne  = jest.fn().mockResolvedValue(caller);
            Patient.findById = jest.fn().mockResolvedValue(patient);
            CallLog.find     = jest.fn().mockReturnValue(makeCallLogChain(calls));

            const res = await request(app).get('/api/users/callers/me/patients/patient-id');

            expect(res.status).toBe(200);
            expect(res.body.patient.name).toBe('Test Patient');
            expect(res.body.calls).toHaveLength(1);
        });

        it('returns 403 when patient not assigned to caller', async () => {
            Caller.findOne = jest.fn().mockResolvedValue(makeCaller({ patient_ids: ['other-patient'] }));

            const res = await request(app).get('/api/users/callers/me/patients/patient-id');

            expect(res.status).toBe(403);
            expect(res.body.error).toBe('Patient not assigned to you');
        });

        it('returns 404 when patient not found', async () => {
            Caller.findOne   = jest.fn().mockResolvedValue(makeCaller({ patient_ids: ['patient-id'] }));
            Patient.findById = jest.fn().mockResolvedValue(null);
            CallLog.find     = jest.fn().mockReturnValue(makeCallLogChain([]));

            const res = await request(app).get('/api/users/callers/me/patients/patient-id');

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Patient not found');
        });
    });

    // ── GET /api/users/callers/me/stats ───────────────────────────────────────

    describe('GET /api/users/callers/me/stats', () => {

        it('returns caller performance stats with live week count', async () => {
            const caller = makeCaller({
                patient_ids: ['p1', 'p2', 'p3'],
                performance: { calls_this_week: 0, adherence_rate: 92, escalations: 1 },
            });
            Caller.findOne         = jest.fn().mockResolvedValue(caller);
            CallLog.countDocuments  = jest.fn().mockResolvedValue(10);

            const res = await request(app).get('/api/users/callers/me/stats');

            expect(res.status).toBe(200);
            // Route overwrites calls_this_week with live count
            expect(res.body.performance.calls_this_week).toBe(10);
            expect(res.body.performance.adherence_rate).toBe(92);
            expect(res.body.patient_count).toBe(3);
        });

        it('returns 404 when caller not found', async () => {
            Caller.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app).get('/api/users/callers/me/stats');

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Caller profile not found');
        });
    });
});