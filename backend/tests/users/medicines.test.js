process.env.NODE_ENV = 'test';

/**
 * tests/users/medicines.test.js
 *
 * Tests for src/routes/users/medicines.js
 * Routes use authenticate → req.user.id only (no req.profile needed).
 * MedicineLog is used as both a constructor (new MedicineLog()) and static methods.
 */

// ─── Auth state ───────────────────────────────────────────────────────────────

const mockAuthState = { rejectAuth: false };

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../src/middleware/authenticate', () => ({
    authenticate: (req, res, next) => {
        if (mockAuthState.rejectAuth) return res.status(401).json({ error: 'Unauthorized' });
        req.user    = { id: 'sup-uid-patient' };
        next();
    },
    authenticateSession: (req, res, next) => {
        if (mockAuthState.rejectAuth) return res.status(401).json({ error: 'Unauthorized' });
        req.user    = { id: 'sup-uid-patient' };
        next();
    },
    requireRole: () => (req, res, next) => next(),
}));

jest.mock('../../src/models/Patient');
jest.mock('../../src/models/MedicineLog');

// ─── Imports ──────────────────────────────────────────────────────────────────

const request    = require('supertest');
const app        = require('../../src/server');
const Patient    = require('../../src/models/Patient');
const MedicineLog = require('../../src/models/MedicineLog');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakeId(val) {
    const s = String(val);
    return { toString: () => s, toJSON: () => s, equals: (o) => s === String(o?._id ?? o) };
}

function makePatient(overrides = {}) {
    return {
        _id:         fakeId(overrides._id || 'patient-id'),
        supabase_uid: overrides.supabase_uid || 'sup-uid-patient',
        medications: overrides.medications || [],
        ...overrides,
    };
}

function makeLog(overrides = {}) {
    const obj = {
        _id:      fakeId(overrides._id || 'log-id'),
        patient_id: fakeId(overrides.patient_id || 'patient-id'),
        date:     overrides.date || new Date(),
        medicines: overrides.medicines || [],
        ...overrides,
    };
    return {
        ...obj,
        save:     jest.fn().mockResolvedValue(true),
        toObject: () => obj,
    };
}

/** MedicineLog.find().sort() chain */
function makeFindSortChain(logs) {
    return { sort: jest.fn().mockResolvedValue(logs) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('User Medicines Routes', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthState.rejectAuth = false;
    });

    // ── GET /api/users/medicines/today ─────────────────────────────────────────

    describe('GET /api/users/medicines/today', () => {

        it('returns existing log for today', async () => {
            const patient = makePatient();
            const log = makeLog({
                medicines: [
                    { medicine_name: 'Metformin', scheduled_time: 'morning', taken: false },
                    { medicine_name: 'Amlodipine', scheduled_time: 'afternoon', taken: false },
                ],
            });
            Patient.findOne    = jest.fn().mockResolvedValue(patient);
            MedicineLog.findOne = jest.fn().mockResolvedValue(log);

            const res = await request(app).get('/api/users/medicines/today');

            expect(res.status).toBe(200);
            expect(res.body.log.medicines).toHaveLength(2);
        });

        it('auto-creates log from medication schedule when none exists', async () => {
            const patient = makePatient({
                medications: [
                    { name: 'Metformin',  times: ['morning'] },
                    { name: 'Amlodipine', times: ['afternoon'] },
                ],
            });
            const newLog = makeLog({
                medicines: [
                    { medicine_name: 'Metformin',  scheduled_time: 'morning',   taken: false },
                    { medicine_name: 'Amlodipine', scheduled_time: 'afternoon', taken: false },
                ],
            });

            Patient.findOne    = jest.fn().mockResolvedValue(patient);
            MedicineLog.findOne = jest.fn().mockResolvedValue(null);
            // Route: new MedicineLog({...}) then .save()
            MedicineLog.mockImplementation(() => newLog);

            const res = await request(app).get('/api/users/medicines/today');

            expect(res.status).toBe(200);
            expect(newLog.save).toHaveBeenCalled();
        });

        it('returns empty medicines when no log and no medications scheduled', async () => {
            const patient = makePatient({ medications: [] });
            Patient.findOne    = jest.fn().mockResolvedValue(patient);
            MedicineLog.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app).get('/api/users/medicines/today');

            expect(res.status).toBe(200);
            expect(res.body.log.medicines).toEqual([]);
        });

        it('returns 404 when patient not found', async () => {
            Patient.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app).get('/api/users/medicines/today');

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Patient profile not found');
        });

        it('returns 401 when not authenticated', async () => {
            mockAuthState.rejectAuth = true;
            const res = await request(app).get('/api/users/medicines/today');
            expect(res.status).toBe(401);
        });
    });

    // ── PUT /api/users/medicines/mark ─────────────────────────────────────────

    describe('PUT /api/users/medicines/mark', () => {

        it('marks a medicine as taken and sets taken_at', async () => {
            const patient = makePatient();
            const log = makeLog({
                medicines: [
                    { medicine_name: 'Metformin', scheduled_time: 'morning', taken: false, taken_at: null },
                ],
            });
            Patient.findOne    = jest.fn().mockResolvedValue(patient);
            MedicineLog.findOne = jest.fn().mockResolvedValue(log);

            const res = await request(app)
                .put('/api/users/medicines/mark')
                .send({ medicine_name: 'Metformin', scheduled_time: 'morning', taken: true });

            expect(res.status).toBe(200);
            expect(log.medicines[0].taken).toBe(true);
            expect(log.medicines[0].taken_at).toBeDefined();
            expect(log.save).toHaveBeenCalled();
        });

        it('marks a medicine as not taken and clears taken_at', async () => {
            const patient = makePatient();
            const log = makeLog({
                medicines: [
                    { medicine_name: 'Metformin', scheduled_time: 'morning', taken: true, taken_at: new Date() },
                ],
            });
            Patient.findOne    = jest.fn().mockResolvedValue(patient);
            MedicineLog.findOne = jest.fn().mockResolvedValue(log);

            const res = await request(app)
                .put('/api/users/medicines/mark')
                .send({ medicine_name: 'Metformin', scheduled_time: 'morning', taken: false });

            expect(res.status).toBe(200);
            expect(log.medicines[0].taken).toBe(false);
            expect(log.medicines[0].taken_at).toBeNull();
        });

        it('returns 404 when patient not found', async () => {
            Patient.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app)
                .put('/api/users/medicines/mark')
                .send({ medicine_name: 'Metformin', scheduled_time: 'morning', taken: true });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Patient profile not found');
        });

        it('returns 404 when no log exists for today', async () => {
            Patient.findOne    = jest.fn().mockResolvedValue(makePatient());
            MedicineLog.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app)
                .put('/api/users/medicines/mark')
                .send({ medicine_name: 'Metformin', scheduled_time: 'morning', taken: true });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('No medicine log found for today');
        });

        it('returns 404 when medicine not found in schedule', async () => {
            const log = makeLog({
                medicines: [{ medicine_name: 'Amlodipine', scheduled_time: 'morning', taken: false }],
            });
            Patient.findOne    = jest.fn().mockResolvedValue(makePatient());
            MedicineLog.findOne = jest.fn().mockResolvedValue(log);

            const res = await request(app)
                .put('/api/users/medicines/mark')
                .send({ medicine_name: 'Metformin', scheduled_time: 'morning', taken: true });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Medicine not found in schedule');
        });
    });

    // ── GET /api/users/medicines/adherence/weekly ─────────────────────────────

    describe('GET /api/users/medicines/adherence/weekly', () => {

        it('returns weekly adherence data for each day', async () => {
            Patient.findOne  = jest.fn().mockResolvedValue(makePatient());
            MedicineLog.find = jest.fn().mockReturnValue(makeFindSortChain([
                { date: new Date(), medicines: [{ taken: true }, { taken: true }, { taken: false }] },
                { date: new Date(), medicines: [{ taken: true }, { taken: true }, { taken: true }] },
            ]));

            const res = await request(app).get('/api/users/medicines/adherence/weekly');

            expect(res.status).toBe(200);
            expect(res.body.adherence).toHaveLength(2);
            expect(res.body.adherence[0]).toMatchObject({ total: 3, taken: 2, missed: 1, rate: 67 });
            expect(res.body.adherence[1]).toMatchObject({ total: 3, taken: 3, missed: 0, rate: 100 });
        });

        it('returns empty array when no logs exist', async () => {
            Patient.findOne  = jest.fn().mockResolvedValue(makePatient());
            MedicineLog.find = jest.fn().mockReturnValue(makeFindSortChain([]));

            const res = await request(app).get('/api/users/medicines/adherence/weekly');

            expect(res.status).toBe(200);
            expect(res.body.adherence).toEqual([]);
        });

        it('returns 404 when patient not found', async () => {
            Patient.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app).get('/api/users/medicines/adherence/weekly');

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Patient profile not found');
        });
    });

    // ── GET /api/users/medicines/adherence/monthly ────────────────────────────

    describe('GET /api/users/medicines/adherence/monthly', () => {

        it('returns aggregated monthly adherence stats', async () => {
            Patient.findOne  = jest.fn().mockResolvedValue(makePatient());
            // monthly route: MedicineLog.find({...}) — plain, no chain
            MedicineLog.find = jest.fn().mockResolvedValue([
                { medicines: [{ taken: true }, { taken: false }, { taken: true }] },
                { medicines: [{ taken: true }, { taken: true }] },
                { medicines: [{ taken: false }] },
            ]);

            const res = await request(app).get('/api/users/medicines/adherence/monthly');

            expect(res.status).toBe(200);
            // 6 total (3+2+1), 4 taken (2+2+0) = 67%
            expect(res.body.monthly).toMatchObject({ total: 6, taken: 4, rate: 67, days_tracked: 3 });
        });

        it('returns 0% rate when no logs exist', async () => {
            Patient.findOne  = jest.fn().mockResolvedValue(makePatient());
            MedicineLog.find = jest.fn().mockResolvedValue([]);

            const res = await request(app).get('/api/users/medicines/adherence/monthly');

            expect(res.status).toBe(200);
            expect(res.body.monthly).toMatchObject({ total: 0, taken: 0, rate: 0, days_tracked: 0 });
        });

        it('returns 404 when patient not found', async () => {
            Patient.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app).get('/api/users/medicines/adherence/monthly');

            expect(res.status).toBe(404);
        });
    });
});