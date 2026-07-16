process.env.NODE_ENV = 'test';

const ActivityIngestionService = require('../src/services/ActivityIngestionService');
const BodyCompositionService = require('../src/services/BodyCompositionService');
const ActivityLog = require('../src/models/ActivityLog');
const BodyCompositionLog = require('../src/models/BodyCompositionLog');

// Mock Models
jest.mock('../src/models/ActivityLog', () => ({
  findOneAndUpdate: jest.fn().mockImplementation((query, doc, options) => {
    return Promise.resolve(doc);
  }),
  findOne: jest.fn().mockResolvedValue(null),
}));

jest.mock('../src/models/BodyCompositionLog', () => ({
  findOneAndUpdate: jest.fn().mockImplementation((query, doc, options) => {
    return Promise.resolve({
      date: query.date,
      weight_kg: doc.weight_kg,
      height_cm: doc.height_cm,
    });
  }),
  findOne: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue({
      date: new Date('2026-07-08T00:00:00.000Z'),
      weight_kg: 75,
      height_cm: 180,
    }),
  }),
}));

let mockTimezone = 'Asia/Kolkata';

jest.mock('../src/models/Patient', () => ({
  findById: jest.fn().mockReturnValue({
    select: jest.fn().mockImplementation((fields) => {
      if (fields === 'timezone') {
        return {
          lean: jest.fn().mockResolvedValue({ timezone: mockTimezone }),
        };
      }
      return {
        lean: jest.fn().mockResolvedValue({
          _id: 'patient123',
          height_cm: 180,
          weight_kg: 75,
        }),
      };
    }),
  }),
  findByIdAndUpdate: jest.fn().mockResolvedValue({}),
}));

describe('Activity and Body Ingestion Timezone and Date Normalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const patientId = 'patient123';

  describe('ActivityIngestionService Ingestion Dates', () => {
    it('normalizes UTC timestamps to UTC midnight correctly', async () => {
      mockTimezone = 'UTC';
      const data = {
        date: '2026-07-16T14:35:00.000Z', // UTC 2:35 PM
        steps: 5000,
      };

      await ActivityIngestionService.processDaily(patientId, data, 'health_connect');

      expect(ActivityLog.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: patientId,
          date: new Date('2026-07-16T00:00:00.000Z'), // Must be exact UTC midnight
        }),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('normalizes local-time/IST-offset timestamps to UTC midnight of their local day', async () => {
      mockTimezone = 'Asia/Kolkata';
      // 2026-07-16T01:30:00.000+05:30 -> in UTC is 2026-07-15T20:00:00.000Z.
      // In local day it is July 16. In UTC day it is July 15.
      // Activity data represents the local day July 16, so it must normalize to UTC midnight of July 16.
      const data = {
        date: '2026-07-16T01:30:00+05:30',
        steps: 8000,
      };

      await ActivityIngestionService.processDaily(patientId, data, 'health_connect');

      expect(ActivityLog.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          date: new Date('2026-07-16T00:00:00.000Z'),
        }),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('normalizes US Eastern offset (GMT-4) correctly', async () => {
      mockTimezone = 'America/New_York';
      const data = {
        date: '2026-07-16T22:30:00-04:00', // UTC 2026-07-17T02:30:00.000Z
        steps: 9000,
      };

      await ActivityIngestionService.processDaily(patientId, data, 'health_connect');

      expect(ActivityLog.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          date: new Date('2026-07-16T00:00:00.000Z'),
        }),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('handles Leap Year day boundaries (Feb 29th) correctly', async () => {
      mockTimezone = 'UTC';
      // 2024 is a leap year. Let's test Feb 29th.
      const data = {
        date: '2024-02-29T10:15:30Z',
        steps: 12000,
      };

      await ActivityIngestionService.processDaily(patientId, data, 'health_connect');

      expect(ActivityLog.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          date: new Date('2024-02-29T00:00:00.000Z'),
        }),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('BodyCompositionService Ingestion Dates', () => {
    it('normalizes snapshot dates to UTC midnight correctly', async () => {
      const data = {
        date: '2026-07-16T18:45:00.000Z',
        weight_kg: 80,
      };

      await BodyCompositionService.processSnapshot(patientId, data, 'health_connect');

      expect(BodyCompositionLog.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: patientId,
          date: new Date('2026-07-16T00:00:00.000Z'),
        }),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });
});
