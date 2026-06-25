process.env.NODE_ENV = "test";

function fakeId(val) {
  const s = String(val);
  return {
    toString: () => s,
    toJSON: () => s,
    equals: (o) => s === String(o?._id ?? o),
  };
}

// Shared mutable auth state
const mockAuthState = {
  user: { id: "companion-user", supabaseUid: "companion-user" },
  profile: {
    _id: fakeId("companion-profile-id"),
    supabaseUid: "companion-user",
    role: "companion",
  },
};

// Mocks
jest.mock("../src/middleware/authenticate", () => ({
  authenticate: (req, res, next) => {
    req.user = mockAuthState.user;
    req.profile = mockAuthState.profile;
    req.auth = {
      userId: mockAuthState.profile?._id,
      userType:
        mockAuthState.profile?.role === "companion" ? "Companion" : "Patient",
    };
    next();
  },
  authenticateSession: (req, res, next) => {
    req.user = mockAuthState.user;
    req.profile = mockAuthState.profile;
    req.auth = {
      userId: mockAuthState.profile?._id,
      userType:
        mockAuthState.profile?.role === "companion" ? "Companion" : "Patient",
    };
    next();
  },
  requireRole:
    (...allowed) =>
    (req, res, next) => {
      if (!allowed.includes(req.profile.role))
        return res
          .status(403)
          .json({
            error: "Insufficient role permissions",
            code: "INSUFFICIENT_ROLE",
          });
      next();
    },
}));

jest.mock("../src/middleware/authorize", () => ({
  authorize: () => (req, res, next) => next(),
  authorizeResource: () => (req, res, next) => next(),
  authorizeAny: () => (req, res, next) => next(),
  authorizeAll: () => (req, res, next) => next(),
}));

jest.mock("../src/services/auditService", () => ({
  logEvent: jest.fn().mockResolvedValue(undefined),
  logSecurityEvent: jest.fn().mockResolvedValue(undefined),
  autoLogAccess: jest.fn(() => (req, res, next) => next()),
  getUserActivitySummary: jest.fn(),
  getSecurityIncidents: jest.fn(),
}));

jest.mock("../src/services/tokenService", () => ({
  issueTokenPair: jest.fn().mockResolvedValue({
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    expires_in: 900,
    expires_at: Math.floor(Date.now() / 1000) + 900,
  }),
  revokeAllForUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../src/models/Patient");
jest.mock("../src/models/Profile");
jest.mock("../src/models/Companion");
jest.mock("../src/models/CompanionAccess");
jest.mock("../src/models/MedicineLog");
jest.mock("../src/models/VitalLog");
jest.mock("../src/models/Alert");
jest.mock("../src/models/Notification");
jest.mock("../src/models/Medication");
jest.mock("../src/models/RiskTransition");
jest.mock("../src/models/SleepLog");
jest.mock("../src/models/PatientHealthStateHistory");
jest.mock("../src/models/AchievementEvent");
jest.mock("../src/models/CompanionAiInsight");
jest.mock("../src/utils/pushNotifications", () => ({
  sendPush: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock("../src/services/interventionEngineService", () => ({
  generateInterventions: jest.fn(),
  completeIntervention: jest.fn(),
}));
jest.mock("../src/services/companionAiService", () => ({
  getOrGenerateInsights: jest.fn().mockResolvedValue({}),
}));

const request = require("supertest");
const app = require("../src/server");
const Patient = require("../src/models/Patient");
const Profile = require("../src/models/Profile");
const Companion = require("../src/models/Companion");
const CompanionAccess = require("../src/models/CompanionAccess");
const MedicineLog = require("../src/models/MedicineLog");
const VitalLog = require("../src/models/VitalLog");
const Alert = require("../src/models/Alert");
const Medication = require("../src/models/Medication");
const Notification = require("../src/models/Notification");
const PushNotificationService = require("../src/utils/pushNotifications");
const RiskTransition = require("../src/models/RiskTransition");
const SleepLog = require("../src/models/SleepLog");
const PatientHealthStateHistory = require("../src/models/PatientHealthStateHistory");
const AchievementEvent = require("../src/models/AchievementEvent");
const CompanionAiInsight = require("../src/models/CompanionAiInsight");
const {
  generateInterventions,
  completeIntervention,
} = require("../src/services/interventionEngineService");
const { getOrGenerateInsights } = require("../src/services/companionAiService");

describe("Companion Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = {
      id: "companion-user",
      supabaseUid: "companion-user",
    };
    mockAuthState.profile = {
      _id: fakeId("companion-profile-id"),
      supabaseUid: "companion-user",
      role: "companion",
    };
    RiskTransition.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    SleepLog.findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    SleepLog.find = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });
    PatientHealthStateHistory.findOne = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
    PatientHealthStateHistory.findOneAndUpdate = jest
      .fn()
      .mockResolvedValue({});
    PatientHealthStateHistory.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    AchievementEvent.find = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });
    CompanionAiInsight.find = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });
  });

  describe("POST /api/companion/join", () => {
    it("returns 400 when required fields are missing", async () => {
      const res = await request(app)
        .post("/api/companion/join")
        .send({ email: "new@companion.in" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });

    it("returns 400 when invite code is invalid or expired", async () => {
      Patient.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      const res = await request(app).post("/api/companion/join").send({
        invite_code: "EXPIREDCODE",
        email: "new@companion.in",
        password: "Password123",
        fullName: "Companion Name",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid or expired/i);
    });

    it("allows registration when email belongs to an existing Patient", async () => {
      const mockPatientObj = {
        _id: fakeId("patient-123"),
        trusted_contacts: [],
        save: jest.fn().mockResolvedValue({}),
      };
      const mockSelect = jest.fn().mockResolvedValue(mockPatientObj);
      Patient.findOne = jest.fn().mockImplementation((query) => {
        if (query.invite_code) return { select: mockSelect };
        if (query.email) return mockPatientObj;
        return null;
      });

      Companion.findOne = jest.fn().mockResolvedValue(null);
      Companion.create = jest.fn().mockResolvedValue({
        _id: fakeId("new-companion-id"),
        email: "patient@companion.in",
        fullName: "Companion Name",
        role: "companion",
        supabaseUid: "cmp_123",
      });

      const res = await request(app).post("/api/companion/join").send({
        invite_code: "VALIDCODE",
        email: "patient@companion.in",
        password: "Password123",
        fullName: "Companion Name",
      });

      expect(res.status).toBe(201);
      expect(res.body.profile.email).toBe("patient@companion.in");
    });

    it("re-uses existing companion Profile and links successfully", async () => {
      const mockPatientObj = {
        _id: fakeId("patient-123"),
        trusted_contacts: [],
        save: jest.fn().mockResolvedValue({}),
      };
      const mockSelect = jest.fn().mockResolvedValue(mockPatientObj);

      Patient.findOne = jest.fn().mockImplementation((query) => {
        if (query.invite_code) return { select: mockSelect };
        return null;
      });

      const bcrypt = require("bcryptjs");
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash("Password123", salt);

      const existingProfileObj = {
        _id: fakeId("companion-profile-id"),
        email: "companion@careco.in",
        role: "companion",
        passwordHash,
        save: jest.fn().mockResolvedValue({}),
      };
      Profile.findOne = jest.fn().mockResolvedValue(null);
      Companion.findOne = jest.fn().mockResolvedValue(existingProfileObj);

      CompanionAccess.findOne = jest.fn().mockResolvedValue(null);
      CompanionAccess.create = jest
        .fn()
        .mockResolvedValue({ _id: "access-123" });

      const res = await request(app).post("/api/companion/join").send({
        invite_code: "VALIDCODE",
        email: "companion@careco.in",
        password: "Password123",
        fullName: "Companion Name",
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/linked to new patient/i);
      expect(CompanionAccess.create).toHaveBeenCalled();
      expect(Companion.prototype.save).not.toHaveBeenCalled();
    });

    it("saves compliance versions and acceptance timestamp when creating companion", async () => {
      const mockPatientObj = {
        _id: fakeId("patient-123"),
        trusted_contacts: [],
        save: jest.fn().mockResolvedValue({}),
      };
      const mockSelect = jest.fn().mockResolvedValue(mockPatientObj);
      Patient.findOne = jest.fn().mockImplementation((query) => {
        if (query.invite_code) return { select: mockSelect };
        return null;
      });

      Companion.findOne = jest.fn().mockResolvedValue(null);
      Companion.create = jest.fn().mockResolvedValue({
        _id: fakeId("new-companion-id"),
        email: "test@companion.in",
        fullName: "Companion Name",
        role: "companion",
        supabaseUid: "cmp_123",
      });

      await request(app).post("/api/companion/join").send({
        invite_code: "VALIDCODE",
        email: "test@companion.in",
        password: "Password123",
        fullName: "Companion Name",
        acceptedTermsVersion: "1.0",
        acceptedPrivacyVersion: "1.0",
        acceptedAt: "2026-05-30T12:00:00.000Z",
      });

      expect(Companion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          acceptedTermsVersion: "1.0",
          acceptedPrivacyVersion: "1.0",
          acceptedAt: "2026-05-30T12:00:00.000Z",
        }),
      );
    });
  });

  describe("GET /api/companion/patient-status", () => {
    it("returns 403 if user role is not companion", async () => {
      mockAuthState.profile.role = "patient";

      const res = await request(app).get("/api/companion/patient-status");
      expect(res.status).toBe(403);
    });

    it("returns 200 with empty state if no linked patients are found", async () => {
      CompanionAccess.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue([]),
      });

      const res = await request(app).get("/api/companion/patient-status");
      expect(res.status).toBe(200);
      expect(res.body.patient).toBeNull();
      expect(res.body.linked_patients).toEqual([]);
    });

    it("successfully retrieves dashboard data for default linked patient", async () => {
      const mockPatientObj = {
        _id: fakeId("patient-123"),
        name: "Jane Patient",
        email: "jane@patient.in",
        gamification: { streak: 5 },
      };
      const mockAccess = {
        companion_id: fakeId("companion-profile-id"),
        patient_id: mockPatientObj,
        is_active: true,
        status: "accepted",
      };

      CompanionAccess.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue([mockAccess]),
      });

      Patient.findById = jest.fn().mockResolvedValue(mockPatientObj);
      MedicineLog.find = jest.fn().mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue([
            { medicines: [{ name: "Aspirin", taken: true, is_active: true }] },
          ]),
      });
      VitalLog.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ systolic: 120, diastolic: 80 }),
        }),
      });
      Alert.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      Medication.find = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: "med-123",
            name: "Aspirin",
            dosage: "100mg",
            times: ["morning"],
            refillInfo: { remainingDoses: 10, alertThreshold: 5 },
          },
          {
            _id: "med-456",
            name: "Lipitor",
            dosage: "20mg",
            times: ["night"],
            isActive: false,
            is_active: false,
            refillInfo: { remainingDoses: 10, alertThreshold: 5 },
          },
        ]),
      });
      VitalLog.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest
            .fn()
            .mockResolvedValue([{ date: new Date(), heart_rate: 72 }]),
        }),
      });
      MedicineLog.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          medicines: [
            {
              medicine_name: "Aspirin",
              scheduled_time: "morning",
              taken: true,
            },
          ],
        }),
      });

      const res = await request(app).get("/api/companion/patient-status");

      expect(res.status).toBe(200);
      expect(res.body.patient.name).toBe("Jane Patient");
      expect(res.body.patient.adherence_rate).toBe(100);
      expect(res.body.latest_vital.systolic).toBe(120);
      expect(res.body.medication_schedule).toHaveLength(1);
      expect(res.body.vitals_history).toHaveLength(1);
    });

    it("selects requested patientId from multiple linked patients", async () => {
      const mockPatient1 = { _id: fakeId("patient-1"), name: "Jane Patient" };
      const mockPatient2 = { _id: fakeId("patient-2"), name: "John Patient" };

      const accesses = [
        {
          companion_id: fakeId("companion-profile-id"),
          patient_id: mockPatient1,
          is_active: true,
          status: "accepted",
        },
        {
          companion_id: fakeId("companion-profile-id"),
          patient_id: mockPatient2,
          is_active: true,
          status: "accepted",
        },
      ];

      CompanionAccess.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(accesses),
      });

      Patient.findById = jest.fn().mockResolvedValue(mockPatient2);
      MedicineLog.find = jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      VitalLog.findOne = jest
        .fn()
        .mockReturnValue({
          sort: jest
            .fn()
            .mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
        });
      Alert.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      Medication.find = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });
      VitalLog.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });
      MedicineLog.findOne = jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      const res = await request(app)
        .get("/api/companion/patient-status")
        .query({ patientId: "patient-2" });

      expect(res.status).toBe(200);
      expect(res.body.patient.name).toBe("John Patient");
      expect(res.body.linked_patients).toHaveLength(2);
    });
  });

  describe("GET /api/companion/linked-patients", () => {
    it("returns 403 if user role is not companion", async () => {
      mockAuthState.profile.role = "patient";

      const res = await request(app).get("/api/companion/linked-patients");
      expect(res.status).toBe(403);
    });

    it("returns 200 with empty array if no linked patients are found", async () => {
      CompanionAccess.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue([]),
      });

      const res = await request(app).get("/api/companion/linked-patients");
      expect(res.status).toBe(200);
      expect(res.body.linked_patients).toEqual([]);
    });

    it("successfully retrieves basic metadata of linked patients", async () => {
      const mockPatientObj = {
        _id: fakeId("patient-123"),
        name: "Jane Patient",
        email: "jane@patient.in",
        phone: "1234567890",
        avatar_url: "http://avatar.url",
        healthScoreCache: 85,
        gamification: { current_streak: 3 },
        risk_level: "medium",
      };
      const mockAccess = {
        companion_id: fakeId("companion-profile-id"),
        patient_id: mockPatientObj,
        is_active: true,
        status: "accepted",
      };

      CompanionAccess.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue([mockAccess]),
      });

      const res = await request(app).get("/api/companion/linked-patients");

      expect(res.status).toBe(200);
      expect(res.body.linked_patients).toHaveLength(1);
      const p = res.body.linked_patients[0];
      expect(p.id).toBe("patient-123");
      expect(p.name).toBe("Jane Patient");
      expect(p.phone).toBe("1234567890");
      expect(p.avatar_url).toBe("http://avatar.url");
      expect(p.avatarUrl).toBe("http://avatar.url");
      expect(p.health_score).toBe(85);
      expect(p.healthScore).toBe(85);
      expect(p.current_streak).toBe(3);
      expect(p.streak).toBe(3);
      expect(p.risk_level).toBe("medium");
      expect(p.riskLevel).toBe("medium");
    });
  });

  describe("GET /api/companion/interventions", () => {
    it("returns 403 if user role is not companion", async () => {
      mockAuthState.profile.role = "patient";
      const res = await request(app).get("/api/companion/interventions");
      expect(res.status).toBe(403);
    });

    it("returns active interventions and completed feed for a companion", async () => {
      const mockAccess = {
        companion_id: fakeId("companion-profile-id"),
        patient_id: fakeId("patient-123"),
        is_active: true,
        status: "accepted",
      };
      CompanionAccess.findOne = jest.fn().mockResolvedValue(mockAccess);
      generateInterventions.mockResolvedValue([
        { _id: "int-123", type: "medication_reminder", status: "generated" },
      ]);

      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest
          .fn()
          .mockResolvedValue([
            { _id: "int-completed", type: "bp_request", status: "completed" },
          ]),
      });
      const Intervention = require("../src/models/Intervention");
      Intervention.find = mockFind;

      const res = await request(app)
        .get("/api/companion/interventions")
        .query({ patientId: "patient-123" });

      expect(res.status).toBe(200);
      expect(res.body.active_interventions).toHaveLength(1);
      expect(res.body.completed_feed).toHaveLength(1);
    });
  });

  describe("POST /api/companion/interventions", () => {
    it("returns 403 if user role is not companion", async () => {
      mockAuthState.profile.role = "patient";
      const res = await request(app).post("/api/companion/interventions");
      expect(res.status).toBe(403);
    });

    it("returns 400 if interventionId is missing", async () => {
      const res = await request(app)
        .post("/api/companion/interventions")
        .send({});
      expect(res.status).toBe(400);
    });

    it("returns 404 if intervention not found", async () => {
      const Intervention = require("../src/models/Intervention");
      Intervention.findById = jest.fn().mockResolvedValue(null);

      const res = await request(app)
        .post("/api/companion/interventions")
        .send({ interventionId: "nonexistent" });
      expect(res.status).toBe(404);
    });

    it("completes intervention successfully", async () => {
      const mockIntervention = {
        _id: "int-123",
        patient_id: fakeId("patient-123"),
        type: "medication_reminder",
        status: "generated",
      };
      const Intervention = require("../src/models/Intervention");
      Intervention.findById = jest.fn().mockResolvedValue(mockIntervention);

      const mockAccess = {
        companion_id: fakeId("companion-profile-id"),
        patient_id: fakeId("patient-123"),
        is_active: true,
        status: "accepted",
      };
      CompanionAccess.findOne = jest.fn().mockResolvedValue(mockAccess);
      completeIntervention.mockResolvedValue(mockIntervention);

      const mockPatientObj = {
        _id: fakeId("patient-123"),
        name: "Jane Patient",
        expo_push_token: "ExponentPushToken[some-token]",
      };
      Patient.findById = jest.fn().mockResolvedValue(mockPatientObj);
      Notification.create = jest.fn().mockResolvedValue({});

      const res = await request(app)
        .post("/api/companion/interventions")
        .send({ interventionId: "int-123" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(completeIntervention).toHaveBeenCalledWith(
        "int-123",
        mockAuthState.profile._id,
      );
    });

    it("completes escalation_contact intervention successfully and triggers notifications/alerts", async () => {
      const mockIntervention = {
        _id: "int-456",
        patient_id: fakeId("patient-123"),
        type: "escalation_contact",
        status: "generated",
      };
      const Intervention = require("../src/models/Intervention");
      Intervention.findById = jest.fn().mockResolvedValue(mockIntervention);

      const mockAccess = {
        companion_id: fakeId("companion-profile-id"),
        patient_id: fakeId("patient-123"),
        is_active: true,
        status: "accepted",
      };
      CompanionAccess.findOne = jest.fn().mockResolvedValue(mockAccess);
      completeIntervention.mockResolvedValue(mockIntervention);

      const mockPatientObj = {
        _id: fakeId("patient-123"),
        name: "Jane Patient",
        expo_push_token: "ExponentPushToken[patient-token]",
        assigned_caller_id: fakeId("caller-123"),
        organization_id: fakeId("org-123"),
      };
      Patient.findById = jest.fn().mockResolvedValue(mockPatientObj);
      Patient.findOne = jest
        .fn()
        .mockResolvedValue({
          expo_push_token: "ExponentPushToken[caller-token]",
        });

      const mockCallerObj = {
        _id: fakeId("caller-123"),
        name: "Caretaker Jim",
        supabase_uid: "sup-uid-caller-123",
        expo_push_token: "ExponentPushToken[caller-token]",
      };
      const Caller = require("../src/models/Caller");
      Caller.findById = jest.fn().mockResolvedValue(mockCallerObj);

      const Alert = require("../src/models/Alert");
      Alert.create = jest.fn().mockResolvedValue({});
      Notification.create = jest.fn().mockResolvedValue({});

      const res = await request(app)
        .post("/api/companion/interventions")
        .send({ interventionId: "int-456" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(completeIntervention).toHaveBeenCalledWith(
        "int-456",
        mockAuthState.profile._id,
      );
      expect(Notification.create).toHaveBeenCalled();
      expect(Alert.create).toHaveBeenCalled();
      expect(PushNotificationService.sendPush).toHaveBeenCalled();
    });
  });

  describe("POST /api/companion/alerts/:id/acknowledge", () => {
    it("returns 403 if user role is not companion", async () => {
      mockAuthState.profile.role = "patient";

      const res = await request(app).post(
        "/api/companion/alerts/alert123/acknowledge",
      );

      expect(res.status).toBe(403);
    });

    it("successfully acknowledges and dismisses alert for companion", async () => {
      Alert.updateOne = jest.fn().mockResolvedValue({ nModified: 1 });

      const res = await request(app).post(
        "/api/companion/alerts/alert123/acknowledge",
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Alert.updateOne).toHaveBeenCalledWith(
        { _id: "alert123" },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: "acknowledged",
            acknowledged_by: expect.anything(),
          }),
        }),
      );
    });
  });

  describe("POST /api/companion/nudge", () => {
    it("returns 403 if user role is not companion", async () => {
      mockAuthState.profile.role = "patient";

      const res = await request(app)
        .post("/api/companion/nudge")
        .send({ patientId: "patient-123" });

      expect(res.status).toBe(403);
    });

    it("returns 400 if no linked patients exist and none provided", async () => {
      CompanionAccess.findOne = jest.fn().mockResolvedValue(null);

      const res = await request(app).post("/api/companion/nudge").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/No linked patients found/i);
    });

    it("returns 403 if companion does not have active access to the patient", async () => {
      CompanionAccess.findOne = jest.fn().mockResolvedValue(null);

      const res = await request(app)
        .post("/api/companion/nudge")
        .send({ patientId: "patient-123" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/active access/i);
    });

    it("successfully nudges patient with push notification when token exists", async () => {
      const mockAccess = {
        companion_id: fakeId("companion-profile-id"),
        patient_id: fakeId("patient-123"),
        is_active: true,
        status: "accepted",
      };
      CompanionAccess.findOne = jest.fn().mockResolvedValue(mockAccess);

      const mockPatientObj = {
        _id: fakeId("patient-123"),
        name: "Jane Patient",
        expo_push_token: "ExponentPushToken[some-token]",
      };
      Patient.findById = jest.fn().mockResolvedValue(mockPatientObj);
      Notification.create = jest
        .fn()
        .mockResolvedValue({ _id: "notification-123" });

      const res = await request(app)
        .post("/api/companion/nudge")
        .send({ patientId: "patient-123" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: mockPatientObj._id,
          type: "reminders",
          title: expect.stringMatching(/Reminded by family/i),
        }),
      );
      expect(PushNotificationService.sendPush).toHaveBeenCalledWith(
        "ExponentPushToken[some-token]",
        expect.any(String),
        expect.any(String),
        expect.any(Object),
      );
    });
  });

  describe("POST /api/companion/request-bp", () => {
    it("successfully requests BP from patient", async () => {
      const mockAccess = {
        companion_id: fakeId("companion-profile-id"),
        patient_id: fakeId("patient-123"),
        is_active: true,
        status: "accepted",
      };
      CompanionAccess.findOne = jest.fn().mockResolvedValue(mockAccess);

      const mockPatientObj = {
        _id: fakeId("patient-123"),
        name: "Jane Patient",
        expo_push_token: "ExponentPushToken[some-token]",
      };
      Patient.findById = jest.fn().mockResolvedValue(mockPatientObj);
      Notification.create = jest
        .fn()
        .mockResolvedValue({ _id: "notification-123" });

      const res = await request(app)
        .post("/api/companion/request-bp")
        .send({ patientId: "patient-123" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: mockPatientObj._id,
          type: "reminders",
          title: expect.stringMatching(/Blood Pressure Request/i),
        }),
      );
    });
  });

  describe("PUT /api/companion/profile", () => {
    it("returns 403 if user role is not companion", async () => {
      mockAuthState.profile.role = "patient";

      const res = await request(app)
        .put("/api/companion/profile")
        .send({ fullName: "Updated Companion" });

      expect(res.status).toBe(403);
    });

    it("successfully updates companion profile fields and compliance", async () => {
      Companion.updateOne = jest.fn().mockResolvedValue({ nModified: 1 });
      Companion.findById = jest.fn().mockResolvedValue({
        _id: mockAuthState.profile._id,
        fullName: "Updated Companion",
        acceptedTermsVersion: "1.1",
      });

      const res = await request(app).put("/api/companion/profile").send({
        fullName: "Updated Companion",
        acceptedTermsVersion: "1.1",
        acceptedPrivacyVersion: "1.1",
        acceptedAt: "2026-05-30T13:00:00.000Z",
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/updated successfully/i);
      expect(Companion.updateOne).toHaveBeenCalledWith(
        { _id: mockAuthState.profile._id },
        {
          $set: {
            fullName: "Updated Companion",
            acceptedTermsVersion: "1.1",
            acceptedPrivacyVersion: "1.1",
            acceptedAt: "2026-05-30T13:00:00.000Z",
          },
        },
      );
      expect(res.body.profile.fullName).toBe("Updated Companion");
    });
  });

  describe("POST /api/companion/link-patient", () => {
    it("returns 400 when invite code is missing", async () => {
      const res = await request(app)
        .post("/api/companion/link-patient")
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });

    it("successfully links companion to patient using invite code", async () => {
      const mockPatientObj = {
        _id: fakeId("patient-123"),
        name: "Jane Patient",
        trusted_contacts: [],
        save: jest.fn().mockResolvedValue({}),
      };
      const mockSelect = jest.fn().mockResolvedValue(mockPatientObj);
      Patient.findOne = jest.fn().mockReturnValue({ select: mockSelect });

      const mockCompanionObj = {
        _id: fakeId("companion-profile-id"),
        email: "companion@careco.in",
        fullName: "Companion Name",
      };
      Companion.findById = jest.fn().mockResolvedValue(mockCompanionObj);

      CompanionAccess.findOne = jest.fn().mockResolvedValue(null);
      CompanionAccess.create = jest
        .fn()
        .mockResolvedValue({ _id: "access-123" });

      const res = await request(app)
        .post("/api/companion/link-patient")
        .send({ invite_code: "FNYBWB" });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/linked patient/i);
      expect(CompanionAccess.create).toHaveBeenCalled();
      expect(mockPatientObj.save).toHaveBeenCalled();
    });
  });

  describe("POST /api/companion/patients/:patientId/invite-code", () => {
    it("returns 403 if userType is not Companion", async () => {
      const originalRole = mockAuthState.profile.role;
      mockAuthState.profile.role = "patient";

      const res = await request(app).post(
        "/api/companion/patients/patient-123/invite-code",
      );

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Only caregiver companions/i);

      mockAuthState.profile.role = originalRole;
    });

    it("returns 403 if companion does not have active CompanionAccess to the patient", async () => {
      CompanionAccess.findOne = jest.fn().mockResolvedValue(null);

      const res = await request(app).post(
        "/api/companion/patients/patient-123/invite-code",
      );

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/active care circle permission/i);
    });

    it("successfully generates invite code and updates Patient document", async () => {
      const mockAccess = {
        companion_id: fakeId("companion-profile-id"),
        patient_id: fakeId("patient-123"),
        is_active: true,
        status: "accepted",
      };
      CompanionAccess.findOne = jest.fn().mockResolvedValue(mockAccess);

      const mockPatientObj = {
        _id: fakeId("patient-123"),
        name: "Jane Patient",
      };
      Patient.findOne = jest.fn().mockResolvedValue(null); // for invite code uniqueness check
      Patient.updateOne = jest.fn().mockResolvedValue({ nModified: 1 });

      const res = await request(app).post(
        "/api/companion/patients/patient-123/invite-code",
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.invite_code).toHaveLength(6);
      expect(Patient.updateOne).toHaveBeenCalledWith(
        { _id: "patient-123" },
        expect.objectContaining({
          $set: expect.objectContaining({
            invite_code: res.body.invite_code,
            invite_code_expires_at: expect.any(Date),
          }),
        }),
      );
    });
  });
});
