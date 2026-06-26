process.env.NODE_ENV = "test";

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

jest.mock("../../src/middleware/authenticate", () => ({
  authenticate: (req, res, next) => {
    if (mockAuthState.rejectAuth)
      return res.status(401).json({ error: "Unauthorized" });
    req.user = { id: "sup-uid-patient" };
    next();
  },
  authenticateSession: (req, res, next) => {
    if (mockAuthState.rejectAuth)
      return res.status(401).json({ error: "Unauthorized" });
    req.user = { id: "sup-uid-patient" };
    next();
  },
  requireRole: () => (req, res, next) => next(),
}));

jest.mock("../../src/models/Patient");
jest.mock("../../src/models/MedicineLog");
jest.mock("../../src/models/Medication");
jest.mock("../../src/models/Notification");
jest.mock("../../src/models/TempMedication");
jest.mock("../../src/models/VitalLog");
jest.mock("../../src/services/medicineAIService", () => ({
  lookupMedicine: jest.fn().mockResolvedValue({
    riskTier: "safe",
    genericName: "Paracetamol",
    aiSummary: "Safe OTC medicine.",
    sideEffects: [],
    warnings: [],
    interactions: [],
  }),
}));
jest.mock("../../src/services/patientHealthStateService", () => ({
  recomputeAndCacheHealthState: jest.fn().mockResolvedValue({}),
  getCachedHealthState: jest.fn().mockResolvedValue({}),
  enqueueHealthStateRecompute: jest.fn().mockResolvedValue({}),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

const request = require("supertest");
const app = require("../../src/server");
const Patient = require("../../src/models/Patient");
const MedicineLog = require("../../src/models/MedicineLog");
const Medication = require("../../src/models/Medication");
const Notification = require("../../src/models/Notification");
const TempMedication = require("../../src/models/TempMedication");
const VitalLog = require("../../src/models/VitalLog");
const { lookupMedicine } = require("../../src/services/medicineAIService");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakeId(val) {
  const s = String(val);
  return {
    toString: () => s,
    toJSON: () => s,
    equals: (o) => s === String(o?._id ?? o),
  };
}

function makePatient(overrides = {}) {
  const obj = {
    _id: fakeId(overrides._id || "patient-id"),
    supabase_uid: overrides.supabase_uid || "sup-uid-patient",
    medications: overrides.medications || [],
    ...overrides,
  };
  return {
    ...obj,
    save: jest.fn().mockResolvedValue(true),
  };
}

function makeLog(overrides = {}) {
  const obj = {
    _id: fakeId(overrides._id || "log-id"),
    patient_id: fakeId(overrides.patient_id || "patient-id"),
    date: overrides.date || new Date(),
    medicines: overrides.medicines || [],
    ...overrides,
  };
  return {
    ...obj,
    save: jest.fn().mockResolvedValue(true),
    toObject: () => obj,
  };
}

/** MedicineLog.find().sort() chain */
function makeFindSortChain(logs) {
  return { sort: jest.fn().mockResolvedValue(logs) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("User Medicines Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.rejectAuth = false;

    // Default mock setups
    Patient.create = jest
      .fn()
      .mockImplementation((data) => Promise.resolve(makePatient(data)));
    Patient.findById = jest.fn().mockReturnValue({
      select: jest
        .fn()
        .mockImplementation(() => Promise.resolve(makePatient())),
    });
    Patient.updateOne = jest.fn().mockImplementation(() => ({
      catch: jest.fn().mockImplementation((cb) => {
        // Return a chainable object/promise to prevent crashes
        return Promise.resolve();
      }),
    }));

    Medication.find = jest.fn().mockResolvedValue([]);
    Medication.findOne = jest.fn().mockResolvedValue(null);
    Notification.create = jest.fn().mockResolvedValue([]);
  });

  // ── GET /api/users/medicines/today ─────────────────────────────────────────

  describe("GET /api/users/medicines/today", () => {
    it("returns existing log for today", async () => {
      const patient = makePatient();
      const log = makeLog({
        medicines: [
          {
            medicine_name: "Metformin",
            scheduled_time: "morning",
            taken: false,
          },
          {
            medicine_name: "Amlodipine",
            scheduled_time: "afternoon",
            taken: false,
          },
        ],
      });
      Patient.findOne = jest.fn().mockResolvedValue(patient);
      MedicineLog.findOne = jest.fn().mockResolvedValue(log);

      const res = await request(app).get("/api/users/medicines/today");

      expect(res.status).toBe(200);
      expect(res.body.log.medicines).toHaveLength(2);
    });

    it("auto-creates log from medication schedule when none exists", async () => {
      const patient = makePatient({
        medications: [
          { name: "Metformin", times: ["morning"] },
          { name: "Amlodipine", times: ["afternoon"] },
        ],
      });
      const newLog = makeLog({
        medicines: [
          {
            medicine_name: "Metformin",
            scheduled_time: "morning",
            taken: false,
          },
          {
            medicine_name: "Amlodipine",
            scheduled_time: "afternoon",
            taken: false,
          },
        ],
      });

      Patient.findOne = jest.fn().mockResolvedValue(patient);
      MedicineLog.findOne = jest.fn().mockResolvedValue(null);
      // Route: new MedicineLog({...}) then .save()
      MedicineLog.mockImplementation(() => newLog);

      const res = await request(app).get("/api/users/medicines/today");

      expect(res.status).toBe(200);
      expect(newLog.save).toHaveBeenCalled();
    });

    it("returns empty medicines when no log and no medications scheduled", async () => {
      const patient = makePatient({ medications: [] });
      Patient.findOne = jest.fn().mockResolvedValue(patient);
      MedicineLog.findOne = jest.fn().mockResolvedValue(null);

      const res = await request(app).get("/api/users/medicines/today");

      expect(res.status).toBe(200);
      expect(res.body.log.medicines).toEqual([]);
    });

    it("returns 500 when database operation fails", async () => {
      Patient.findOne = jest.fn().mockRejectedValue(new Error("DB error"));

      const res = await request(app).get("/api/users/medicines/today");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get today's medicines");
    });

    it("returns 401 when not authenticated", async () => {
      mockAuthState.rejectAuth = true;
      const res = await request(app).get("/api/users/medicines/today");
      expect(res.status).toBe(401);
    });

    it("supports markdown content negotiation with Accept: text/markdown", async () => {
      const patient = makePatient();
      const log = makeLog({
        medicines: [
          {
            medicine_name: "Metformin",
            scheduled_time: "morning",
            taken: true,
          },
        ],
      });
      Patient.findOne = jest.fn().mockResolvedValue(patient);
      MedicineLog.findOne = jest.fn().mockResolvedValue(log);

      const res = await request(app)
        .get("/api/users/medicines/today")
        .set("Accept", "text/markdown");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/markdown");
      expect(res.headers["vary"]).toContain("Accept");
      expect(res.text).toContain("Today's Medication Schedule");
      expect(res.text).toContain("Metformin");
    });

    it("defaults to JSON when Accept is */*", async () => {
      const patient = makePatient();
      const log = makeLog({
        medicines: [
          {
            medicine_name: "Metformin",
            scheduled_time: "morning",
            taken: true,
          },
        ],
      });
      Patient.findOne = jest.fn().mockResolvedValue(patient);
      MedicineLog.findOne = jest.fn().mockResolvedValue(log);

      const res = await request(app)
        .get("/api/users/medicines/today")
        .set("Accept", "*/*");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.headers["vary"]).toContain("Accept");
      expect(res.body.log).toBeDefined();
    });
  });

  // ── PUT /api/users/medicines/mark ─────────────────────────────────────────

  describe("PUT /api/users/medicines/mark", () => {
    it("marks a medicine as taken and sets taken_at", async () => {
      const patient = makePatient();
      const log = makeLog({
        medicines: [
          {
            medicine_name: "Metformin",
            scheduled_time: "morning",
            taken: false,
            taken_at: null,
          },
        ],
      });
      Patient.findOne = jest.fn().mockResolvedValue(patient);
      MedicineLog.findOne = jest.fn().mockResolvedValue(log);

      const res = await request(app).put("/api/users/medicines/mark").send({
        medicine_name: "Metformin",
        scheduled_time: "morning",
        taken: true,
      });

      expect(res.status).toBe(200);
      expect(log.medicines[0].taken).toBe(true);
      expect(log.medicines[0].taken_at).toBeDefined();
      expect(log.save).toHaveBeenCalled();
    });

    it("marks a medicine as not taken and clears taken_at", async () => {
      const patient = makePatient();
      const log = makeLog({
        medicines: [
          {
            medicine_name: "Metformin",
            scheduled_time: "morning",
            taken: true,
            taken_at: new Date(),
          },
        ],
      });
      Patient.findOne = jest.fn().mockResolvedValue(patient);
      MedicineLog.findOne = jest.fn().mockResolvedValue(log);

      const res = await request(app).put("/api/users/medicines/mark").send({
        medicine_name: "Metformin",
        scheduled_time: "morning",
        taken: false,
      });

      expect(res.status).toBe(200);
      expect(log.medicines[0].taken).toBe(false);
      expect(log.medicines[0].taken_at).toBeNull();
    });

    it("returns 500 when database operation fails", async () => {
      Patient.findOne = jest.fn().mockRejectedValue(new Error("DB error"));

      const res = await request(app).put("/api/users/medicines/mark").send({
        medicine_name: "Metformin",
        scheduled_time: "morning",
        taken: true,
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to mark medicine");
    });

    it("auto-creates a log from schedule when no log exists for today", async () => {
      const patient = makePatient({
        medications: [{ name: "Metformin", times: ["morning"] }],
      });
      const newLog = makeLog({
        medicines: [
          {
            medicine_name: "Metformin",
            scheduled_time: "morning",
            taken: false,
          },
        ],
      });
      Patient.findOne = jest.fn().mockResolvedValue(patient);
      MedicineLog.findOne = jest.fn().mockResolvedValue(null);
      MedicineLog.mockImplementation(() => newLog);

      const res = await request(app).put("/api/users/medicines/mark").send({
        medicine_name: "Metformin",
        scheduled_time: "morning",
        taken: true,
      });

      expect(res.status).toBe(200);
      expect(newLog.save).toHaveBeenCalled();
    });

    it("returns 404 when medicine not found in schedule", async () => {
      const log = makeLog({
        medicines: [
          {
            medicine_name: "Amlodipine",
            scheduled_time: "morning",
            taken: false,
          },
        ],
      });
      Patient.findOne = jest.fn().mockResolvedValue(makePatient());
      MedicineLog.findOne = jest.fn().mockResolvedValue(log);

      const res = await request(app).put("/api/users/medicines/mark").send({
        medicine_name: "Metformin",
        scheduled_time: "morning",
        taken: true,
      });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Medicine not found in schedule");
    });
  });

  // ── GET /api/users/medicines/adherence/weekly ─────────────────────────────

  describe("GET /api/users/medicines/adherence/weekly", () => {
    it("returns weekly adherence data for each day", async () => {
      Patient.findOne = jest.fn().mockResolvedValue(makePatient());
      MedicineLog.find = jest.fn().mockReturnValue(
        makeFindSortChain([
          {
            date: new Date(),
            medicines: [{ taken: true }, { taken: true }, { taken: false }],
          },
          {
            date: new Date(),
            medicines: [{ taken: true }, { taken: true }, { taken: true }],
          },
        ]),
      );

      const res = await request(app).get(
        "/api/users/medicines/adherence/weekly",
      );

      expect(res.status).toBe(200);
      expect(res.body.adherence).toHaveLength(2);
      expect(res.body.adherence[0]).toMatchObject({
        total: 3,
        taken: 2,
        missed: 1,
        rate: 67,
      });
      expect(res.body.adherence[1]).toMatchObject({
        total: 3,
        taken: 3,
        missed: 0,
        rate: 100,
      });
    });

    it("returns empty array when no logs exist", async () => {
      Patient.findOne = jest.fn().mockResolvedValue(makePatient());
      MedicineLog.find = jest.fn().mockReturnValue(makeFindSortChain([]));

      const res = await request(app).get(
        "/api/users/medicines/adherence/weekly",
      );

      expect(res.status).toBe(200);
      expect(res.body.adherence).toEqual([]);
    });

    it("returns 500 when database operation fails", async () => {
      Patient.findOne = jest.fn().mockRejectedValue(new Error("DB error"));

      const res = await request(app).get(
        "/api/users/medicines/adherence/weekly",
      );

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get weekly adherence");
    });
  });

  // ── GET /api/users/medicines/adherence/monthly ────────────────────────────

  describe("GET /api/users/medicines/adherence/monthly", () => {
    it("returns aggregated monthly adherence stats", async () => {
      Patient.findOne = jest.fn().mockResolvedValue(makePatient());
      // monthly route: MedicineLog.find({...}) — plain, no chain
      MedicineLog.find = jest
        .fn()
        .mockResolvedValue([
          { medicines: [{ taken: true }, { taken: false }, { taken: true }] },
          { medicines: [{ taken: true }, { taken: true }] },
          { medicines: [{ taken: false }] },
        ]);

      const res = await request(app).get(
        "/api/users/medicines/adherence/monthly",
      );

      expect(res.status).toBe(200);
      // 6 total (3+2+1), 4 taken (2+2+0) = 67%
      expect(res.body.monthly).toMatchObject({
        total: 6,
        taken: 4,
        rate: 67,
        days_tracked: 3,
      });
    });

    it("returns 0% rate when no logs exist", async () => {
      Patient.findOne = jest.fn().mockResolvedValue(makePatient());
      MedicineLog.find = jest.fn().mockResolvedValue([]);

      const res = await request(app).get(
        "/api/users/medicines/adherence/monthly",
      );

      expect(res.status).toBe(200);
      expect(res.body.monthly).toMatchObject({
        total: 0,
        taken: 0,
        rate: 0,
        days_tracked: 0,
      });
    });

    it("returns 500 when database operation fails", async () => {
      Patient.findOne = jest.fn().mockRejectedValue(new Error("DB error"));

      const res = await request(app).get(
        "/api/users/medicines/adherence/monthly",
      );

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get monthly adherence");
    });
  });

  // ── Temporary Medications ──────────────────────────────────────────────────

  describe("Temporary Medications Routes", () => {
    beforeEach(() => {
      const mockPatientObj = makePatient({
        organization_id: "mock-org-id",
        name: "Mock Patient",
      });
      Patient.findOne = jest.fn().mockResolvedValue(mockPatientObj);
    });

    describe("GET /api/users/medicines/temp-meds", () => {
      it("returns active temporary medications", async () => {
        const mockMeds = [
          {
            _id: "med1",
            name: "Paracetamol",
            shift: "morning",
            isActive: true,
          },
        ];
        TempMedication.find = jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockMeds),
          }),
        });

        const res = await request(app).get("/api/users/medicines/temp-meds");

        expect(res.status).toBe(200);
        expect(res.body.tempMedications).toEqual(mockMeds);
      });
    });

    describe("POST /api/users/medicines/temp-meds", () => {
      it("creates a new temporary medication", async () => {
        const mockSave = jest.fn().mockResolvedValue(true);
        TempMedication.mockImplementation(() => ({
          save: mockSave,
          toObject: () => ({ name: "Paracetamol", shift: "morning" }),
        }));

        const res = await request(app)
          .post("/api/users/medicines/temp-meds")
          .send({
            name: "Paracetamol",
            dosage: "500mg",
            frequency: "As needed",
            reason: "Fever",
            shift: "morning",
          });

        expect(res.status).toBe(201);
        expect(mockSave).toHaveBeenCalled();
      });

      it("returns 400 if name is missing", async () => {
        const res = await request(app)
          .post("/api/users/medicines/temp-meds")
          .send({ shift: "morning" });

        expect(res.status).toBe(400);
      });
    });

    describe("DELETE /api/users/medicines/temp-meds/:medId", () => {
      it("soft deletes the temporary medication", async () => {
        const mockMedId = "507f1f77bcf86cd799439011";
        TempMedication.findOneAndUpdate = jest.fn().mockResolvedValue({
          _id: mockMedId,
          isActive: false,
          deletedAt: new Date(),
        });

        const res = await request(app).delete(
          `/api/users/medicines/temp-meds/${mockMedId}`,
        );

        expect(res.status).toBe(200);
        expect(TempMedication.findOneAndUpdate).toHaveBeenCalled();
      });
    });
  });

  // ── Adherence Dynamic Gap-Filling ──────────────────────────────────────────
  describe("Adherence Dynamic Gap-Filling", () => {
    const moment = require("moment-timezone");

    it("backfills past date gaps with missed entries and respects medication active range", async () => {
      // Patient created 3 days ago (e.g. yesterday - 2 days)
      const timezone = "Asia/Kolkata";
      const yesterdayStr = moment()
        .tz(timezone)
        .subtract(1, "day")
        .format("YYYY-MM-DD");
      const twoDaysAgoStr = moment()
        .tz(timezone)
        .subtract(2, "days")
        .format("YYYY-MM-DD");
      const threeDaysAgoStr = moment()
        .tz(timezone)
        .subtract(3, "days")
        .format("YYYY-MM-DD");
      const fourDaysAgoStr = moment()
        .tz(timezone)
        .subtract(4, "days")
        .format("YYYY-MM-DD");

      const createdDate = moment().tz(timezone).subtract(3, "days").toDate();
      const patient = makePatient({
        created_at: createdDate,
        timezone,
        medications: [
          {
            name: "Metformin",
            times: ["morning"],
            startDate: moment().tz(timezone).subtract(2, "days").toDate(), // active starting 2 days ago
            endDate: null,
            is_active: true,
          },
        ],
      });

      Patient.findOne = jest.fn().mockResolvedValue(patient);

      // Only 1 log exists (two days ago perfect log)
      // Yesterday has no log, so it should be backfilled as missed
      // 3 days ago had no log, but Metformin hadn't started yet, so it should be 'no_medications'
      // 4 days ago is before patient creation date, so it shouldn't be backfilled or should be 'no_medications' if queried
      const logTwoDaysAgo = {
        date: new Date(`${twoDaysAgoStr}T00:00:00.000Z`),
        medicines: [
          {
            medicine_name: "Metformin",
            scheduled_time: "morning",
            taken: true,
            is_active: true,
          },
        ],
      };

      MedicineLog.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue([logTwoDaysAgo]),
      });
      VitalLog.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue([]),
      });

      const res = await request(app).get(
        "/api/users/medicines/adherence/details",
      );

      expect(res.status).toBe(200);

      const dailyLog = res.body.daily_log;

      // Two days ago should be complete
      const entryTwoDaysAgo = dailyLog.find((d) => d.date === twoDaysAgoStr);
      expect(entryTwoDaysAgo).toBeDefined();
      expect(entryTwoDaysAgo.status).toBe("complete");
      expect(entryTwoDaysAgo.rate).toBe(100);

      // Yesterday should be backfilled as missed
      const entryYesterday = dailyLog.find((d) => d.date === yesterdayStr);
      expect(entryYesterday).toBeDefined();
      expect(entryYesterday.status).toBe("missed");
      expect(entryYesterday.rate).toBe(0);
      expect(entryYesterday.medicines).toHaveLength(1);
      expect(entryYesterday.medicines[0].name).toBe("Metformin");

      // Three days ago should be no_medications (Metformin not started yet)
      const entryThreeDaysAgo = dailyLog.find(
        (d) => d.date === threeDaysAgoStr,
      );
      if (entryThreeDaysAgo) {
        expect(entryThreeDaysAgo.status).toBe("no_medications");
        expect(entryThreeDaysAgo.total).toBe(0);
      }
    });
  });

  describe("GET /api/users/medicines/adherence/details content negotiation", () => {
    it("supports markdown content negotiation with Accept: text/markdown", async () => {
      const patient = makePatient({ created_at: new Date() });
      Patient.findOne = jest.fn().mockResolvedValue(patient);
      MedicineLog.find = jest.fn().mockReturnValue(makeFindSortChain([]));
      VitalLog.find = jest
        .fn()
        .mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });

      const res = await request(app)
        .get("/api/users/medicines/adherence/details")
        .set("Accept", "text/markdown");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/markdown");
      expect(res.headers["vary"]).toContain("Accept");
      expect(res.text).toContain("Medication Adherence & Health Summary");
      expect(res.text).toContain("Disclaimer");
    });

    it("defaults to JSON when Accept is */*", async () => {
      const patient = makePatient({ created_at: new Date() });
      Patient.findOne = jest.fn().mockResolvedValue(patient);
      MedicineLog.find = jest.fn().mockReturnValue(makeFindSortChain([]));
      VitalLog.find = jest
        .fn()
        .mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });

      const res = await request(app)
        .get("/api/users/medicines/adherence/details")
        .set("Accept", "*/*");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.body.score).toBeDefined();
    });
  });

  // ── POST /api/users/medicines/:name/refill ──────────────────────────────
  describe("POST /api/users/medicines/:name/refill", () => {
    it("successfully refills an embedded medication supply", async () => {
      const patient = makePatient({
        medications: [
          {
            name: "Metformin",
            refillInfo: {
              totalDoses: 30,
              remainingDoses: 10,
              alertThreshold: 5,
              lastRefillDate: new Date(),
            },
          },
        ],
      });
      Patient.findOne = jest.fn().mockResolvedValue(patient);

      const res = await request(app)
        .post("/api/users/medicines/Metformin/refill")
        .send({ newTotal: 15 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(patient.medications[0].refillInfo.remainingDoses).toBe(25);
      expect(patient.medications[0].refillInfo.totalDoses).toBe(45);
      expect(patient.save).toHaveBeenCalled();
    });

    it("successfully performs multiple sequential refills", async () => {
      const patient = makePatient({
        medications: [
          {
            name: "Metformin",
            refillInfo: {
              totalDoses: 30,
              remainingDoses: 5,
              alertThreshold: 5,
              lastRefillDate: new Date(),
              history: [],
            },
          },
        ],
      });
      Patient.findOne = jest.fn().mockResolvedValue(patient);

      // Refill 20
      const res1 = await request(app)
        .post("/api/users/medicines/Metformin/refill")
        .send({ purchasedDoses: 20 });

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(patient.medications[0].refillInfo.remainingDoses).toBe(25);
      expect(patient.medications[0].refillInfo.totalDoses).toBe(50);
      expect(patient.medications[0].refillInfo.history).toHaveLength(1);
      expect(patient.medications[0].refillInfo.history[0].quantity).toBe(20);

      // Refill 15
      const res2 = await request(app)
        .post("/api/users/medicines/Metformin/refill")
        .send({ purchasedDoses: 15 });

      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);
      expect(patient.medications[0].refillInfo.remainingDoses).toBe(40);
      expect(patient.medications[0].refillInfo.totalDoses).toBe(65);
      expect(patient.medications[0].refillInfo.history).toHaveLength(2);
      expect(patient.medications[0].refillInfo.history[1].quantity).toBe(15);
    });

    it("rejects invalid refill quantities", async () => {
      const patient = makePatient({
        medications: [
          {
            name: "Metformin",
            refillInfo: {
              totalDoses: 30,
              remainingDoses: 10,
              alertThreshold: 5,
              lastRefillDate: new Date(),
            },
          },
        ],
      });
      Patient.findOne = jest.fn().mockResolvedValue(patient);

      // Test decimal
      const resDec = await request(app)
        .post("/api/users/medicines/Metformin/refill")
        .send({ purchasedDoses: 12.5 });
      expect(resDec.status).toBe(400);

      // Test zero
      const resZero = await request(app)
        .post("/api/users/medicines/Metformin/refill")
        .send({ purchasedDoses: 0 });
      expect(resZero.status).toBe(400);

      // Test negative
      const resNeg = await request(app)
        .post("/api/users/medicines/Metformin/refill")
        .send({ purchasedDoses: -5 });
      expect(resNeg.status).toBe(400);

      // Test > 10000
      const resLarge = await request(app)
        .post("/api/users/medicines/Metformin/refill")
        .send({ purchasedDoses: 15000 });
      expect(resLarge.status).toBe(400);

      // Test invalid string
      const resStr = await request(app)
        .post("/api/users/medicines/Metformin/refill")
        .send({ purchasedDoses: "abc" });
      expect(resStr.status).toBe(400);
    });

    it("returns 404 when medication is not found", async () => {
      const patient = makePatient({ medications: [] });
      Patient.findOne = jest.fn().mockResolvedValue(patient);
      Medication.findOne = jest.fn().mockResolvedValue(null);

      const res = await request(app)
        .post("/api/users/medicines/UnknownMed/refill")
        .send({ newTotal: 15 });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Medication not found.");
    });
  });
});
