/**
 * Tests for Patient Health State History, Deltas, Backfills, and Achievements
 */

const mongoose = require('mongoose');

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
                { date: new Date(), score: 85, adherence: { today: 90 } }
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
                { jobId: `backfill-${patientId}` }
            );
        });

        it('should correctly calculate deltas (7d, 30d score and adherence) when history is present', async () => {
            const today = new Date();
            const date7dAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            const date30dAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

            const mockHistoryList = [
                { date: new Date(today.getTime() - 35 * 24 * 60 * 60 * 1000), score: 60, adherence: { today: 65 }, patient_id: patientId },
                { date: date30dAgo, score: 70, adherence: { today: 75 }, patient_id: patientId },
                { date: new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000), score: 75, adherence: { today: 80 }, patient_id: patientId },
                { date: date7dAgo, score: 80, adherence: { today: 85 }, patient_id: patientId },
                { date: today, score: 90, adherence: { today: 95 }, patient_id: patientId }
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
                lean: jest.fn().mockResolvedValue(null)
            });
            PatientHealthStateHistory.findOne.mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue(null),
                }),
            });
            PatientHealthStateHistory.findOneAndUpdate.mockResolvedValue({});

            await backfillHealthStateHistory(patientId, 'Asia/Kolkata');

            // 31 days (30 days ago to today)
            expect(PatientHealthStateHistory.findOneAndUpdate).toHaveBeenCalledTimes(31);
        }, 20000);
    });
});
