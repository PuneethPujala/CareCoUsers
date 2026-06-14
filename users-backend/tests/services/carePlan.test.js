const mongoose = require('mongoose');

jest.mock('../../src/models/Patient');
jest.mock('../../src/models/SleepLog');
jest.mock('../../src/models/CarePlanHistory');
jest.mock('../../src/routes/users/medicines', () => ({
    buildMergedMeds: jest.fn()
}));

const Patient = require('../../src/models/Patient');
const SleepLog = require('../../src/models/SleepLog');
const CarePlanHistory = require('../../src/models/CarePlanHistory');
const { buildMergedMeds } = require('../../src/routes/users/medicines');

const {
    getOrGenerateCarePlan,
    computeSleepTarget,
    getWeekRange
} = require('../../src/services/carePlanService');

describe('Care Plan Service', () => {
    const patientId = new mongoose.Types.ObjectId();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('computeSleepTarget', () => {
        it('should return the 14-day average if 10 or more logs exist', async () => {
            const mockLogs = Array.from({ length: 12 }, () => ({ hours: 8 }));
            SleepLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue(mockLogs)
            });

            const target = await computeSleepTarget(patientId, 'Asia/Kolkata');
            expect(target).toBe(8);
        });

        it('should fallback to 7-day average if 14-day logs are fewer than 10 but 7-day logs are 3 or more', async () => {
            // 5 logs in the last 14 days (all of which are in the last 7 days)
            const mockLogs = Array.from({ length: 5 }, () => ({ hours: 7, date: new Date() }));
            SleepLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue(mockLogs)
            });

            const target = await computeSleepTarget(patientId, 'Asia/Kolkata');
            expect(target).toBe(7);
        });

        it('should fallback to default 7.5 hours if logs are fewer than 3', async () => {
            SleepLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });

            const target = await computeSleepTarget(patientId, 'Asia/Kolkata');
            expect(target).toBe(7.5);
        });
    });

    describe('getOrGenerateCarePlan', () => {
        it('should generate a version 1 care plan if no active plan exists', async () => {
            Patient.findById.mockResolvedValue({
                _id: patientId,
                health_score: 80,
                timezone: 'Asia/Kolkata'
            });
            CarePlanHistory.findOne.mockResolvedValue(null);
            buildMergedMeds.mockResolvedValue([
                { name: 'Amlodipine', times: ['morning'], is_active: true }
            ]);
            SleepLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });
            CarePlanHistory.create.mockResolvedValue({
                patient_id: patientId,
                version: 1,
                active: true
            });

            const plan = await getOrGenerateCarePlan(patientId);

            expect(plan).toBeDefined();
            expect(CarePlanHistory.create).toHaveBeenCalledWith(expect.objectContaining({
                patient_id: patientId,
                version: 1,
                target_health_score: 85,
                vitals_target: 'BP check every 2 days',
                active: true
            }));
        });

        it('should increment version and toggle active flags if targets have changed', async () => {
            const existingPlan = {
                patient_id: patientId,
                version: 1,
                active: true,
                medication_tasks: [{ name: 'Amlodipine', time_slot: 'morning' }],
                sleep_hours_goal: 7.5,
                target_health_score: 85,
                save: jest.fn().mockResolvedValue(true)
            };

            Patient.findById.mockResolvedValue({
                _id: patientId,
                health_score: 80,
                timezone: 'Asia/Kolkata'
            });
            CarePlanHistory.findOne.mockResolvedValue(existingPlan);
            
            // Med changed
            buildMergedMeds.mockResolvedValue([
                { name: 'Metformin', times: ['morning', 'night'], is_active: true }
            ]);
            SleepLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });
            CarePlanHistory.create.mockResolvedValue({
                patient_id: patientId,
                version: 2,
                active: true
            });

            const plan = await getOrGenerateCarePlan(patientId);

            expect(existingPlan.active).toBe(false);
            expect(existingPlan.save).toHaveBeenCalled();
            expect(CarePlanHistory.create).toHaveBeenCalledWith(expect.objectContaining({
                patient_id: patientId,
                version: 2,
                active: true
            }));
        });
    });
});
