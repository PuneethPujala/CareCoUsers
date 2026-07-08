process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/server');
const Patient = require('../src/models/Patient');
const Notification = require('../src/models/Notification');

// Shared mutable auth state
const mockAuthState = {
  user: {
    id: 'test-user',
    supabaseUid: 'test-user',
    email_confirmed_at: new Date().toISOString(),
  },
  profile: { _id: 'test-profile', supabaseUid: 'test-user', role: 'patient' },
  userType: 'Patient',
  rejectAuth: false,
};

// Mock authenticate middleware
jest.mock('../src/middleware/authenticate', () => ({
  authenticate: (req, res, next) => {
    if (mockAuthState.rejectAuth) {
      return res
        .status(401)
        .json({ error: 'Unauthorized', code: 'INVALID_TOKEN' });
    }
    req.user = mockAuthState.user;
    req.profile = mockAuthState.profile;
    req.auth = {
      kind: 'jwt',
      subject: mockAuthState.user.supabaseUid,
      userId: mockAuthState.profile._id,
      userType: mockAuthState.userType,
    };
    next();
  },
  optionalAuthenticate: (req, res, next) => next(),
  authenticateSession: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
}));

jest.mock('../src/models/Patient');
jest.mock('../src/models/Notification');
jest.mock('../src/models/AIChatLog', () => ({
  countDocuments: jest.fn().mockResolvedValue(0),
}));
jest.mock('../src/models/AuditLog', () => ({
  countDocuments: jest.fn().mockResolvedValue(0),
}));

describe('Observability Routes - System Health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.rejectAuth = false;
    mockAuthState.userType = 'Patient';
    mockAuthState.profile = {
      _id: 'patient-123',
      supabaseUid: 'test-user',
      role: 'patient',
    };
  });

  it('returns 401 when authentication fails', async () => {
    mockAuthState.rejectAuth = true;

    const res = await request(app)
      .get('/api/admin/observability/system-health')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns patient-scoped metrics when authenticated as Patient', async () => {
    Notification.countDocuments = jest.fn().mockImplementation((query) => {
      // Assert query parameters
      expect(query.patient_id).toBe('patient-123');
      if (query.push_delivered === true) return Promise.resolve(5);
      if (query.push_delivered === false) return Promise.resolve(2);
      return Promise.resolve(7); // total
    });

    Patient.countDocuments = jest.fn().mockImplementation((query) => {
      expect(query._id).toBe('patient-123');
      if (query.last_token_update && query.last_token_update.$gte) {
        return Promise.resolve(1); // active
      }
      return Promise.resolve(0); // stale
    });

    const res = await request(app)
      .get('/api/admin/observability/system-health')
      .set('Authorization', 'Bearer valid-patient-token');

    expect(res.status).toBe(200);
    expect(res.body.is_patient_scoped).toBe(true);
    expect(res.body.notifications_7d.total_attempted).toBe(7);
    expect(res.body.notifications_7d.delivered).toBe(5);
    expect(res.body.notifications_7d.failed).toBe(2);
    expect(res.body.notifications_7d.success_rate).toBe('71.4%');
    expect(res.body.tokens.active).toBe(1);
    expect(res.body.tokens.stale).toBe(0);
  });

  it('returns global metrics when authenticated as a non-Patient (e.g., care_manager)', async () => {
    mockAuthState.userType = 'Profile';
    mockAuthState.profile = {
      _id: 'staff-456',
      supabaseUid: 'staff-user',
      role: 'care_manager',
    };

    Notification.countDocuments = jest.fn().mockImplementation((query) => {
      // Global queries should NOT filter by patient_id
      expect(query.patient_id).toBeUndefined();
      if (query.push_delivered === true) return Promise.resolve(100);
      if (query.push_delivered === false) return Promise.resolve(10);
      return Promise.resolve(110); // total
    });

    Patient.countDocuments = jest.fn().mockImplementation((query) => {
      expect(query._id).toBeUndefined();
      if (query.last_token_update && query.last_token_update.$gte) {
        return Promise.resolve(20); // active
      }
      return Promise.resolve(5); // stale
    });

    Patient.aggregate = jest.fn().mockResolvedValue([
      { _id: 'android', count: 15 },
      { _id: 'ios', count: 10 },
    ]);

    const res = await request(app)
      .get('/api/admin/observability/system-health')
      .set('Authorization', 'Bearer valid-staff-token');

    expect(res.status).toBe(200);
    expect(res.body.is_patient_scoped).toBe(false);
    expect(res.body.notifications_7d.total_attempted).toBe(110);
    expect(res.body.notifications_7d.delivered).toBe(100);
    expect(res.body.notifications_7d.failed).toBe(10);
    expect(res.body.notifications_7d.success_rate).toBe('90.9%');
    expect(res.body.tokens.active).toBe(20);
    expect(res.body.tokens.stale).toBe(5);
    expect(res.body.platforms).toEqual({ android: 15, ios: 10 });
  });
});
