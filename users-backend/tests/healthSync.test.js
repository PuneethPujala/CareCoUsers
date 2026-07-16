process.env.NODE_ENV = 'test';

const request = require('supertest');
const mongoose = require('mongoose');

const mockFixedDate = new Date('2026-07-08T00:00:00.000Z');

// Helpers for fake ids
function mockFakeId(val) {
  const s = String(val);
  return {
    toString: () => s,
    toJSON: () => s,
    equals: (o) => s === String(o?._id ?? o),
  };
}

const mockAuthState = {
  user: { id: 'test-patient', supabaseUid: 'test-patient' },
  profile: {
    _id: mockFakeId('patient123'),
    role: 'patient',
    supabase_uid: 'test-patient',
    organization_id: mockFakeId('org123'),
    is_active: true,
  },
};

// ─── Mock Middlewares ────────────────────────────────────────────────────────
jest.mock('../src/middleware/authenticate', () => ({
  authenticate: (req, res, next) => {
    req.user = mockAuthState.user;
    req.profile = mockAuthState.profile;
    req.patientId = mockAuthState.profile._id.toString();
    next();
  },
  authenticateSession: (req, res, next) => {
    req.user = mockAuthState.user;
    req.profile = mockAuthState.profile;
    req.patientId = mockAuthState.profile._id.toString();
    next();
  },
  requireRole:
    (...allowed) =>
    (req, res, next) =>
      next(),
}));

jest.mock(
  '../src/middleware/requireSubscription',
  () => (req, res, next) => next()
);

// ─── Mock Models ─────────────────────────────────────────────────────────────
jest.mock('../src/models/Patient', () => {
  const mockPatientModel = {
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'patient123',
          name: 'John Doe',
          height_cm: 180,
          weight_kg: 75,
          expo_push_token: 'test-token',
          timezone: 'Asia/Kolkata',
        }),
      }),
    }),
    findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    findOne: jest.fn().mockImplementation((query) => {
      if (query.supabase_uid === 'test-patient') {
        return Promise.resolve({
          _id: {
            toString: () => 'patient123',
            toJSON: () => 'patient123',
            equals: (o) => 'patient123' === String(o?._id ?? o),
          },
          name: 'John Doe',
          supabase_uid: 'test-patient',
          is_active: true,
        });
      }
      return Promise.resolve(null);
    }),
  };
  return mockPatientModel;
});

jest.mock('../src/models/VitalLog', () => {
  const mockVitalLogModel = {
    insertMany: jest.fn().mockResolvedValue({ insertedCount: 5 }),
    countDocuments: jest.fn().mockResolvedValue(5),
    findOne: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            date: mockFixedDate,
            source: 'health_connect',
          }),
        }),
      }),
    }),
  };
  return mockVitalLogModel;
});

jest.mock('../src/models/ActivityLog', () => {
  const mockActivityLogModel = {
    findOneAndUpdate: jest.fn().mockImplementation((query, doc, options) => {
      const data = doc.$set || doc;
      return Promise.resolve(data);
    }),
    findOne: jest.fn().mockResolvedValue(null),
  };
  return mockActivityLogModel;
});

jest.mock('../src/models/BodyCompositionLog', () => {
  const mockBodyCompositionLogModel = {
    findOneAndUpdate: jest.fn().mockImplementation((query, doc, options) => {
      const data = doc.$set || doc;
      return Promise.resolve({
        date: mockFixedDate,
        weight_kg: data.weight_kg,
        height_cm: data.height_cm,
      });
    }),
    findOne: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            date: mockFixedDate,
            weight_kg: 75,
            height_cm: 180,
          }),
        }),
      }),
    }),
  };
  return mockBodyCompositionLogModel;
});

jest.mock('../src/models/HealthSyncState', () => {
  const mockHealthSyncStateModel = {
    findOneAndUpdate: jest.fn().mockResolvedValue({}),
    findOne: jest.fn().mockResolvedValue({
      platform: 'android',
      health_provider: 'health_connect',
      permissions_granted: ['HeartRate', 'Steps'],
    }),
  };
  return mockHealthSyncStateModel;
});

jest.mock('../src/models/Notification', () => ({
  create: jest.fn().mockResolvedValue({}),
}));

jest.mock('../src/utils/pushNotifications', () => ({
  sendPush: jest.fn().mockResolvedValue({}),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────
const app = require('../src/server');
const VitalLog = require('../src/models/VitalLog');
const ActivityLog = require('../src/models/ActivityLog');
const BodyCompositionLog = require('../src/models/BodyCompositionLog');
const HealthSyncState = require('../src/models/HealthSyncState');
const Patient = require('../src/models/Patient');
const VitalsIngestionService = require('../src/services/vitalsIngestionService');
const ActivityIngestionService = require('../src/services/ActivityIngestionService');
const BodyCompositionService = require('../src/services/BodyCompositionService');
const HealthSyncOrchestrator = require('../src/services/HealthSyncOrchestrator');

describe('Health Integration Sync System tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Vitals Ingestion Pipeline', () => {
    it('handles optional heart rate and successfully ingests blood glucose / respiratory rate', async () => {
      const readings = [
        {
          timestamp: new Date().toISOString(),
          blood_glucose: 95,
          respiratory_rate: 14,
          metadata: { device_name: 'Samsung Galaxy Watch' },
        },
      ];

      const result = await VitalsIngestionService.processBatch(
        'patient123',
        readings,
        'health_connect'
      );

      expect(result.invalid).toBe(0);
      expect(result.anomalies.length).toBe(0);
      expect(VitalLog.insertMany).toHaveBeenCalled();
    });

    it('triggers alerts when clinical thresholds are breached', async () => {
      const readings = [
        {
          timestamp: new Date().toISOString(),
          heart_rate: 195, // critically high
          blood_glucose: 45, // critically low
        },
      ];

      const result = await VitalsIngestionService.processBatch(
        'patient123',
        readings,
        'health_connect'
      );

      expect(result.anomalies.length).toBe(1);
      expect(result.anomalies[0].alerts.length).toBe(2);
    });
  });

  describe('Activity Ingestion Service', () => {
    it('upserts daily aggregate activity data and appends exercise sessions correctly', async () => {
      const activityData = {
        date: new Date().toISOString(),
        steps: 8500,
        active_calories: 320,
        exercises: [
          {
            type: 'running',
            duration_minutes: 30,
            source_id: 'workout-123',
          },
        ],
      };

      const result = await ActivityIngestionService.processDaily(
        'patient123',
        activityData,
        'health_connect'
      );

      expect(result.accepted).toBe(true);
      expect(ActivityLog.findOneAndUpdate).toHaveBeenCalled();
    });
  });

  describe('Body Composition Service', () => {
    it('upserts bodycomposition log, auto-computes BMI, and caches latest to Patient profile', async () => {
      const bodyData = {
        date: new Date().toISOString(),
        weight_kg: 81,
        height_cm: 180,
      };

      const result = await BodyCompositionService.processSnapshot(
        'patient123',
        bodyData,
        'health_connect'
      );

      expect(result.accepted).toBe(true);
      expect(BodyCompositionLog.findOneAndUpdate).toHaveBeenCalled();
      expect(Patient.findByIdAndUpdate).toHaveBeenCalledWith(
        'patient123',
        expect.objectContaining({ weight_kg: 81, height_cm: 180 })
      );
    });
  });

  describe('Health Sync Orchestrator', () => {
    it('processes single unified payload sections and updates HealthSyncState', async () => {
      const payload = {
        vitals: [{ timestamp: new Date().toISOString(), heart_rate: 72 }],
        activity: {
          date: new Date().toISOString(),
          steps: 4000,
        },
        body: {
          date: new Date().toISOString(),
          weight_kg: 74,
        },
        source: 'health_connect',
        platform: 'android',
        metadata: {
          device_name: 'Pixel Watch 2',
          permissions_granted: ['HeartRate', 'Steps'],
        },
      };

      const result = await HealthSyncOrchestrator.processSync(
        'patient123',
        payload
      );

      expect(result.success).toBe(true);
      expect(HealthSyncState.findOneAndUpdate).toHaveBeenCalled();
    });
  });

  describe('POST /api/health/sync Unified Endpoint', () => {
    it('successfully registers route and returns sync ingestion results', async () => {
      const payload = {
        vitals: [{ timestamp: new Date().toISOString(), heart_rate: 72 }],
        activity: {
          date: new Date().toISOString(),
          steps: 4000,
        },
        source: 'health_connect',
        platform: 'android',
      };

      const res = await request(app)
        .post('/api/health/sync')
        .send(payload)
        .set('Authorization', 'Bearer mock-token');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/health/sync/state Tracker', () => {
    it('returns active sync state config', async () => {
      const res = await request(app)
        .get('/api/health/sync/state')
        .set('Authorization', 'Bearer mock-token');

      expect(res.statusCode).toBe(200);
      expect(res.body.health_provider).toBe('health_connect');
    });
  });
});
