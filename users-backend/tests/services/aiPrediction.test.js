/**
 * Tests for AIPredictionService
 * Covers: streak logic, alert frequency, AI service integration, push notifications
 */

const axios = require('axios');
const mongoose = require('mongoose');

// Mock dependencies before requiring the service
jest.mock('axios');
jest.mock('../../src/models/VitalLog');
jest.mock('../../src/models/AIVitalPrediction');
jest.mock('../../src/models/Notification');
jest.mock('../../src/models/Patient');
jest.mock('../../src/models/Caller');
jest.mock('../../src/utils/pushNotifications');

const AIPredictionService = require('../../src/services/aiPredictionService');
const VitalLog = require('../../src/models/VitalLog');
const AIVitalPrediction = require('../../src/models/AIVitalPrediction');
const Notification = require('../../src/models/Notification');
const Patient = require('../../src/models/Patient');
const Caller = require('../../src/models/Caller');
const PushNotificationService = require('../../src/utils/pushNotifications');

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeVitalDocs(count) {
  const docs = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - (count - 1 - i));
    docs.push({
      date,
      heart_rate: 72,
      blood_pressure: { systolic: 120, diastolic: 80 },
      oxygen_saturation: 98,
      hydration: 55,
    });
  }
  return docs;
}

function makeMockPredictionDoc(overrides = {}) {
  return {
    patient_id: new mongoose.Types.ObjectId(),
    health_label: 'Normal',
    consecutive_critical_days: 0,
    predictions: [],
    updated_at: new Date(),
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AIPredictionService', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. STREAK CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════
  describe('calculateStreak', () => {
    it('should increment streak when label is Critical', () => {
      const doc = makeMockPredictionDoc({ consecutive_critical_days: 3 });
      expect(AIPredictionService.calculateStreak(doc, 'Critical')).toBe(4);
    });

    it('should reset streak to 0 when label is Normal', () => {
      const doc = makeMockPredictionDoc({ consecutive_critical_days: 5 });
      expect(AIPredictionService.calculateStreak(doc, 'Normal')).toBe(0);
    });

    it('should reset streak to 0 when label is Warning', () => {
      const doc = makeMockPredictionDoc({ consecutive_critical_days: 2 });
      expect(AIPredictionService.calculateStreak(doc, 'Warning')).toBe(0);
    });

    it('should start streak at 1 for first Critical day', () => {
      const doc = makeMockPredictionDoc({ consecutive_critical_days: 0 });
      expect(AIPredictionService.calculateStreak(doc, 'Critical')).toBe(1);
    });

    it('should handle null/undefined existing doc gracefully', () => {
      expect(AIPredictionService.calculateStreak(null, 'Critical')).toBe(1);
      expect(AIPredictionService.calculateStreak(undefined, 'Critical')).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ALERT FREQUENCY LOGIC
  // ═══════════════════════════════════════════════════════════════════════════
  describe('shouldSendAlert', () => {
    it('should NOT alert on Day 1 Critical (streak=1)', () => {
      expect(AIPredictionService.shouldSendAlert(1, 'Critical')).toBe(false);
    });

    it('should alert on Day 2 Critical (streak=2)', () => {
      expect(AIPredictionService.shouldSendAlert(2, 'Critical')).toBe(true);
    });

    it('should NOT alert on Day 3 Critical (streak=3)', () => {
      expect(AIPredictionService.shouldSendAlert(3, 'Critical')).toBe(false);
    });

    it('should alert on Day 4 Critical (streak=4)', () => {
      expect(AIPredictionService.shouldSendAlert(4, 'Critical')).toBe(true);
    });

    it('should NOT alert on Day 5 Critical (streak=5)', () => {
      expect(AIPredictionService.shouldSendAlert(5, 'Critical')).toBe(false);
    });

    it('should NOT alert on Day 6 Critical (streak=6)', () => {
      expect(AIPredictionService.shouldSendAlert(6, 'Critical')).toBe(false);
    });

    it('should alert on Day 7 Critical (streak=7) — 3-day gap from Day 4', () => {
      expect(AIPredictionService.shouldSendAlert(7, 'Critical')).toBe(true);
    });

    it('should alert on Day 10 Critical (streak=10)', () => {
      expect(AIPredictionService.shouldSendAlert(10, 'Critical')).toBe(true);
    });

    it('should alert on Day 13 Critical (streak=13)', () => {
      expect(AIPredictionService.shouldSendAlert(13, 'Critical')).toBe(true);
    });

    it('should NOT alert on any Normal label regardless of streak', () => {
      expect(AIPredictionService.shouldSendAlert(2, 'Normal')).toBe(false);
      expect(AIPredictionService.shouldSendAlert(7, 'Normal')).toBe(false);
    });

    it('should NOT alert on Warning label', () => {
      expect(AIPredictionService.shouldSendAlert(2, 'Warning')).toBe(false);
    });

    it('should NOT alert on streak=0', () => {
      expect(AIPredictionService.shouldSendAlert(0, 'Critical')).toBe(false);
    });

    // Full matrix validation for 15 days
    it('should follow exact alert matrix for 15 consecutive critical days', () => {
      const expected = {
        1: false, 2: true, 3: false, 4: true, 5: false,
        6: false, 7: true, 8: false, 9: false, 10: true,
        11: false, 12: false, 13: true, 14: false, 15: false,
      };
      for (const [day, shouldAlert] of Object.entries(expected)) {
        expect(AIPredictionService.shouldSendAlert(Number(day), 'Critical'))
          .toBe(shouldAlert);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. processPatientPrediction (Integration with mocked deps)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('processPatientPrediction', () => {
    const patientId = new mongoose.Types.ObjectId();

    it('should return failure when fewer than 7 vitals exist', async () => {
      VitalLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(makeVitalDocs(5)),
        }),
      });

      const result = await AIPredictionService.processPatientPrediction(patientId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Not enough historical data');
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should call AI service and save prediction for valid data', async () => {
      // Mock VitalLog to return 8 valid records
      VitalLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(makeVitalDocs(8)),
        }),
      });

      // Mock AI service response
      axios.post.mockResolvedValue({
        data: {
          health_label: 'Normal',
          predictions: [
            { date: '2024-01-09', heart_rate: 72, blood_pressure: { systolic: 120, diastolic: 80 }, oxygen_saturation: 98, hydration: 55 },
            { date: '2024-01-10', heart_rate: 73, blood_pressure: { systolic: 121, diastolic: 81 }, oxygen_saturation: 97, hydration: 54 },
            { date: '2024-01-11', heart_rate: 71, blood_pressure: { systolic: 119, diastolic: 79 }, oxygen_saturation: 98, hydration: 56 },
          ],
        },
      });

      // Mock existing prediction doc
      const mockDoc = makeMockPredictionDoc();
      AIVitalPrediction.findOne.mockResolvedValue(mockDoc);

      const result = await AIPredictionService.processPatientPrediction(patientId);

      expect(result.success).toBe(true);
      expect(result.health_label).toBe('Normal');
      expect(result.currentStreak).toBe(0);
      expect(result.notified).toBe(false);
      expect(mockDoc.save).toHaveBeenCalled();
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('should create new prediction doc if none exists', async () => {
      VitalLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(makeVitalDocs(8)),
        }),
      });

      axios.post.mockResolvedValue({
        data: {
          health_label: 'Normal',
          predictions: [
            { date: '2024-01-09', heart_rate: 72, blood_pressure: { systolic: 120, diastolic: 80 }, oxygen_saturation: 98, hydration: 55 },
          ],
        },
      });

      // No existing prediction doc
      AIVitalPrediction.findOne.mockResolvedValue(null);

      // Mock the constructor
      const mockNewDoc = makeMockPredictionDoc();
      AIVitalPrediction.mockImplementation(() => mockNewDoc);

      const result = await AIPredictionService.processPatientPrediction(patientId);

      expect(result.success).toBe(true);
      expect(mockNewDoc.save).toHaveBeenCalled();
    });

    it('should trigger notification on Day 2 Critical', async () => {
      VitalLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(makeVitalDocs(8)),
        }),
      });

      axios.post.mockResolvedValue({
        data: {
          health_label: 'Critical',
          predictions: [
            { date: '2024-01-09', heart_rate: 130, blood_pressure: { systolic: 170, diastolic: 100 }, oxygen_saturation: 90, hydration: 30 },
          ],
        },
      });

      // Simulate streak was already 1 (Day 1 was Critical)
      const mockDoc = makeMockPredictionDoc({ consecutive_critical_days: 1, health_label: 'Critical' });
      AIVitalPrediction.findOne.mockResolvedValue(mockDoc);

      // Mock the patient lookup in triggerCriticalPushAlert
      const mockPatient = {
        _id: patientId,
        name: 'Test Patient',
        expo_push_token: 'ExponentPushToken[test]',
        push_notifications_enabled: true,
        assigned_caller_id: null,
      };
      Patient.findById.mockResolvedValue(mockPatient);
      Notification.create.mockResolvedValue({});
      PushNotificationService.sendCriticalVitalAlert.mockResolvedValue({ success: true });

      const result = await AIPredictionService.processPatientPrediction(patientId);

      expect(result.success).toBe(true);
      expect(result.currentStreak).toBe(2);
      expect(result.notified).toBe(true);
      expect(Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: patientId,
          type: 'alert',
          title: expect.stringContaining('Critical'),
        })
      );
      expect(PushNotificationService.sendCriticalVitalAlert).toHaveBeenCalled();
    });

    it('should NOT trigger notification on Day 1 Critical', async () => {
      VitalLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(makeVitalDocs(8)),
        }),
      });

      axios.post.mockResolvedValue({
        data: {
          health_label: 'Critical',
          predictions: [
            { date: '2024-01-09', heart_rate: 130, blood_pressure: { systolic: 170, diastolic: 100 }, oxygen_saturation: 90, hydration: 30 },
          ],
        },
      });

      // Streak starts at 0 → becomes 1
      const mockDoc = makeMockPredictionDoc({ consecutive_critical_days: 0 });
      AIVitalPrediction.findOne.mockResolvedValue(mockDoc);

      const result = await AIPredictionService.processPatientPrediction(patientId);

      expect(result.success).toBe(true);
      expect(result.currentStreak).toBe(1);
      expect(result.notified).toBe(false);
      expect(Notification.create).not.toHaveBeenCalled();
    });

    it('should handle AI service timeout/error gracefully', async () => {
      VitalLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(makeVitalDocs(8)),
        }),
      });

      axios.post.mockRejectedValue(new Error('ECONNREFUSED: AI service is offline'));

      const result = await AIPredictionService.processPatientPrediction(patientId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
    });

    it('should notify caller when patient has assigned_caller_id', async () => {
      VitalLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(makeVitalDocs(8)),
        }),
      });

      axios.post.mockResolvedValue({
        data: {
          health_label: 'Critical',
          predictions: [
            { date: '2024-01-09', heart_rate: 130, blood_pressure: { systolic: 170, diastolic: 100 }, oxygen_saturation: 90, hydration: 30 },
          ],
        },
      });

      const callerId = new mongoose.Types.ObjectId();
      const mockDoc = makeMockPredictionDoc({ consecutive_critical_days: 1, health_label: 'Critical' });
      AIVitalPrediction.findOne.mockResolvedValue(mockDoc);

      const mockPatient = {
        _id: patientId,
        name: 'Test Patient',
        expo_push_token: 'ExponentPushToken[test123]',
        push_notifications_enabled: true,
        assigned_caller_id: callerId,
      };
      Patient.findById.mockResolvedValue(mockPatient);

      const mockCaller = {
        _id: callerId,
        name: 'Test Caller',
        expo_push_token: 'ExponentPushToken[caller]',
      };
      Caller.findById.mockResolvedValue(mockCaller);

      Notification.create.mockResolvedValue({});
      PushNotificationService.sendCriticalVitalAlert.mockResolvedValue({ success: true });
      PushNotificationService.sendCallerCriticalAlert.mockResolvedValue({ success: true });

      const result = await AIPredictionService.processPatientPrediction(patientId);

      expect(result.notified).toBe(true);
      expect(PushNotificationService.sendCallerCriticalAlert).toHaveBeenCalledWith(
        mockCaller, mockPatient, expect.any(Object)
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. PUSH NOTIFICATION SERVICE (Unit)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('PushNotificationService (imported utility)', () => {
    // These test the real utility, not the mock
    const RealPushService = jest.requireActual('../../src/utils/pushNotifications');

    it('should validate correct Expo push token format', () => {
      expect(RealPushService.isValidExpoPushToken('ExponentPushToken[abc123]')).toBe(true);
      expect(RealPushService.isValidExpoPushToken('ExpoPushToken[xyz]')).toBe(true);
    });

    it('should reject invalid push token formats', () => {
      expect(RealPushService.isValidExpoPushToken(null)).toBe(false);
      expect(RealPushService.isValidExpoPushToken('')).toBe(false);
      expect(RealPushService.isValidExpoPushToken('random-string')).toBe(false);
      expect(RealPushService.isValidExpoPushToken('fcm:token123')).toBe(false);
    });

    it('should return failure when no token is provided', async () => {
      const result = await RealPushService.sendPush(null, 'Title', 'Body');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('no_token');
    });

    it('should return failure for invalid token format', async () => {
      const result = await RealPushService.sendPush('bad-token', 'Title', 'Body');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('invalid_token');
    });
  });
});
