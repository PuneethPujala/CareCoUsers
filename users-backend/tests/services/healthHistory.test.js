/**
 * Tests for Patient Health State History, Deltas, Backfills, and Achievements
 */

const mongoose = require('mongoose');
const moment = require('moment-timezone');

// Mock models
jest.mock('../../src/models/Patient');
jest.mock('../../src/models/MedicineLog');
jest.mock('../../src/models/VitalLog');
jest.mock('../../src/models/SleepLog');
jest.mock('../../src/models/PatientHealthStateHistory');
jest.mock('../../src/models/AchievementEvent');
jest.mock('../../src/models/Medication');
jest.mock('../../src/jobs/jobQueues', () => ({
  healthHistoryBackfillQueue: {
    add: jest.fn(),
  },
}));

const Patient = require('../../src/models/Patient');
const MedicineLog = require('../../src/models/MedicineLog');
const VitalLog = require('../../src/models/VitalLog');
const SleepLog = require('../../src/models/SleepLog');
const PatientHealthStateHistory = require('../../src/models/PatientHealthStateHistory');
const AchievementEvent = require('../../src/models/AchievementEvent');
const Medication = require('../../src/models/Medication');
const { healthHistoryBackfillQueue } = require('../../src/jobs/jobQueues');

const {
  getHealthHistory,
  backfillHealthStateHistory,
  recomputeAndCacheHealthState,
} = require('../../src/services/patientHealthStateService');

describe('Patient Health State History, Deltas, and Backfills', () => {
  const patientId = new mongoose.Types.ObjectId();
  let mockPatient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPatient = {
      _id: patientId,
      timezone: 'Asia/Kolkata',
      unlockedAchievements: [],
      moodHistory: [],
      save: jest.fn().mockResolvedValue(true),
    };
    Patient.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(mockPatient),
    });
    Medication.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });
  });

  describe('getHealthHistory', () => {
    it('should trigger background backfill if historical records are low (< 5)', async () => {
      const lowHistory = [
        { date: new Date(), score: 85, adherence: { today: 90 } },
      ];
      PatientHealthStateHistory.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(lowHistory),
        }),
      });
      healthHistoryBackfillQueue.add.mockResolvedValue({ id: 'job_backfill' });

      const result = await getHealthHistory(patientId, 'Asia/Kolkata');

      expect(result.history).toEqual(lowHistory);
      expect(healthHistoryBackfillQueue.add).toHaveBeenCalledWith(
        'backfill',
        { patientId, timezone: 'Asia/Kolkata' },
        {
          jobId: `backfill-${patientId}`,
          priority: 25,
        }
      );
    });

    it('should correctly calculate deltas (7d, 30d score and adherence) when history is present', async () => {
      const today = new Date();
      const date7dAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const date30dAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      const mockHistoryList = [
        {
          date: new Date(today.getTime() - 35 * 24 * 60 * 60 * 1000),
          score: 60,
          adherence: { today: 65 },
          patient_id: patientId,
        },
        {
          date: date30dAgo,
          score: 70,
          adherence: { today: 75 },
          patient_id: patientId,
        },
        {
          date: new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000),
          score: 75,
          adherence: { today: 80 },
          patient_id: patientId,
        },
        {
          date: date7dAgo,
          score: 80,
          adherence: { today: 85 },
          patient_id: patientId,
        },
        {
          date: today,
          score: 90,
          adherence: { today: 95 },
          patient_id: patientId,
        },
      ];

      PatientHealthStateHistory.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockHistoryList),
        }),
      });

      const result = await getHealthHistory(patientId, 'Asia/Kolkata');

      expect(healthHistoryBackfillQueue.add).not.toHaveBeenCalled();
      expect(result.history).toEqual(mockHistoryList);
      expect(result.deltas.score_delta_7d).toBe(10); // 90 - 80
      expect(result.deltas.score_delta_30d).toBe(20); // 90 - 70
      expect(result.deltas.adherence_delta_30d).toBe(20); // 95 - 75
    });
  });

  describe('backfillHealthStateHistory', () => {
    it('should sequentially trigger recomputation for the last 30 days', async () => {
      // Mock findById for 31 iterations
      Patient.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockPatient),
      });
      VitalLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });
      MedicineLog.findOne.mockResolvedValue(null);
      MedicineLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });
      SleepLog.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      PatientHealthStateHistory.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      });
      PatientHealthStateHistory.findOneAndUpdate.mockResolvedValue({});

      await backfillHealthStateHistory(patientId, 'Asia/Kolkata');

      // 31 days (30 days ago to today)
      expect(PatientHealthStateHistory.findOneAndUpdate).toHaveBeenCalledTimes(
        31
      );
    }, 20000);
  });

  describe('Future data leakage prevention tests', () => {
    it('should bound VitalLog queries with $lte: todayEndUtc to prevent future vitals leakage', async () => {
      const targetDateStr = '2026-06-05';

      VitalLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });
      MedicineLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });
      SleepLog.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      PatientHealthStateHistory.findOneAndUpdate.mockResolvedValue({});

      await recomputeAndCacheHealthState(patientId, targetDateStr);

      // Verify VitalLog.find calls include date bounds with $lte
      expect(VitalLog.find).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: patientId,
          date: expect.objectContaining({
            $gte: expect.any(Date),
            $lte: expect.any(Date),
          }),
        })
      );

      // Specifically verify the value of $lte is the end of targetDateStr
      const expectedEndDate = moment
        .tz(targetDateStr, 'YYYY-MM-DD', 'Asia/Kolkata')
        .endOf('day')
        .toDate();
      const vitalLogCalls = VitalLog.find.mock.calls;
      // Let's find the history query call
      const historyCall = vitalLogCalls.find(
        (call) => call[0].date && call[0].date.$lte
      );
      expect(historyCall).toBeDefined();
      expect(historyCall[0].date.$lte.getTime()).toBe(
        expectedEndDate.getTime()
      );
    });

    it('should bound MedicineLog queries with $lte: todayEndUtc to prevent future medicine logs leakage', async () => {
      const targetDateStr = '2026-06-05';

      VitalLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });
      MedicineLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });
      SleepLog.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      PatientHealthStateHistory.findOneAndUpdate.mockResolvedValue({});

      await recomputeAndCacheHealthState(patientId, targetDateStr);

      // Verify MedicineLog.find calls include date bounds with $lte
      expect(MedicineLog.find).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: patientId,
          date: expect.objectContaining({
            $gte: expect.any(Date),
            $lte: expect.any(Date),
          }),
        })
      );

      const expectedEndDate = moment
        .tz(targetDateStr, 'YYYY-MM-DD', 'Asia/Kolkata')
        .endOf('day')
        .toDate();
      const medicineLogCalls = MedicineLog.find.mock.calls;
      const historyCall = medicineLogCalls.find(
        (call) => call[0].date && call[0].date.$lte
      );
      expect(historyCall).toBeDefined();
      expect(historyCall[0].date.$lte.getTime()).toBe(
        expectedEndDate.getTime()
      );
    });

    it('should filter mood history to ignore entries after todayEndUtc', async () => {
      const targetDateStr = '2026-06-05';

      // Mood history contains a past entry and a future entry relative to targetDateStr
      mockPatient.moodHistory = [
        { date: new Date('2026-06-04T12:00:00.000Z'), mood: 'great' },
        { date: new Date('2026-06-06T12:00:00.000Z'), mood: 'sad' }, // Future, should be ignored
      ];

      VitalLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });
      MedicineLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });
      SleepLog.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      PatientHealthStateHistory.findOneAndUpdate.mockResolvedValue({});

      const result = await recomputeAndCacheHealthState(
        patientId,
        targetDateStr
      );

      // Mood trend should be stable since we only have 1 valid mood entry after filtering out the future one
      expect(result.mood.trend).toBe('stable');
    });

    it('should prevent future data from leaking in E2E integration scenario (past vs future leakage)', async () => {
      const day1Str = '2026-06-01';
      const day5Str = '2026-06-05';
      const timezone = 'Asia/Kolkata';

      const day1Utc = new Date(`${day1Str}T00:00:00.000Z`);
      const day5Utc = new Date(`${day5Str}T00:00:00.000Z`);

      // Day 1: normal vitals, all meds taken, great mood
      // Day 5: critical vitals, meds missed, sad mood
      const day1Vitals = {
        date: day1Utc,
        systolic: 120,
        diastolic: 80,
        heart_rate: 72,
        oxygen_saturation: 98,
      };
      const day5Vitals = {
        date: day5Utc,
        systolic: 170,
        diastolic: 105,
        heart_rate: 130,
        oxygen_saturation: 88,
      }; // Critical

      const day1MedLog = {
        date: day1Utc,
        medicines: [
          { medicine_name: 'MedA', scheduled_time: 'morning', taken: true },
        ],
      };
      const day5MedLog = {
        date: day5Utc,
        medicines: [
          { medicine_name: 'MedA', scheduled_time: 'morning', taken: false },
        ],
      }; // Missed

      mockPatient.moodHistory = [
        { date: day1Utc, mood: 'great' },
        { date: day5Utc, mood: 'sad' },
      ];

      // Mock medication list so buildMergedMeds returns MedA
      Medication.find.mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue([
            { name: 'MedA', isActive: true, times: ['morning'] },
          ]),
      });

      // Mock MedicineLog.findOne for the target recompute day (Day 1)
      MedicineLog.findOne.mockImplementation((filter) => {
        if (filter.date && filter.date.getTime() === day1Utc.getTime()) {
          return Promise.resolve(day1MedLog);
        }
        return Promise.resolve(null);
      });

      // When recomputing Day 1, the mock queries must return logs including the future Day 5 data to simulate Mongoose output.
      // Our code should correctly filter out Day 5.
      VitalLog.find.mockImplementation((filter) => {
        const results = [day1Vitals, day5Vitals].filter((v) => {
          const matchGte = !filter.date.$gte || v.date >= filter.date.$gte;
          const matchLte = !filter.date.$lte || v.date <= filter.date.$lte;
          return matchGte && matchLte;
        });
        return {
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(results),
          }),
        };
      });

      MedicineLog.find.mockImplementation((filter) => {
        const results = [day1MedLog, day5MedLog].filter((m) => {
          const matchGte = !filter.date.$gte || m.date >= filter.date.$gte;
          const matchLte = !filter.date.$lte || m.date <= filter.date.$lte;
          return matchGte && matchLte;
        });
        return {
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(results),
          }),
        };
      });

      SleepLog.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      PatientHealthStateHistory.findOneAndUpdate.mockResolvedValue({});

      // Recompute Day 1
      const resultDay1 = await recomputeAndCacheHealthState(patientId, day1Str);

      // Day 1 score should be stable/excellent, not critical, because Day 5 leakage was blocked
      expect(resultDay1.vitals.status).toBe('stable'); // Not critical (Day 5 BP/HR/SpO2 ignored)
      expect(resultDay1.mood.trend).toBe('stable'); // Not declining (Day 5 sad mood ignored)
      expect(resultDay1.adherence.today).toBe(100); // Meds taken
    });
  });
});
