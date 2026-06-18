/**
 * Tests for CompanionAiService
 * Covers: deterministic risk engine, visibility score breakdown, vital predictions, stable streaks, priority action severity, queue debouncing
 */

const axios = require('axios');
const mongoose = require('mongoose');

// Mock dependencies
jest.mock('axios');
jest.mock('../../src/models/Patient');
jest.mock('../../src/models/CompanionAiInsight');
jest.mock('../../src/models/CompanionAiInsightHistory');
jest.mock('../../src/models/PatientHealthStateHistory');
jest.mock('../../src/models/RiskTransition');
jest.mock('../../src/models/AIVitalPrediction');
jest.mock('../../src/models/VitalLog');
jest.mock('../../src/models/MedicineLog');
jest.mock('../../src/services/aiContextService', () => ({
    buildPatientContext: jest.fn()
}));
jest.mock('../../src/jobs/jobQueues', () => ({
    companionInsightsQueue: {
        getJob: jest.fn(),
        add: jest.fn(),
    },
}));

const companionAiService = require('../../src/services/companionAiService');
const Patient = require('../../src/models/Patient');
const CompanionAiInsight = require('../../src/models/CompanionAiInsight');
const CompanionAiInsightHistory = require('../../src/models/CompanionAiInsightHistory');
const PatientHealthStateHistory = require('../../src/models/PatientHealthStateHistory');
const RiskTransition = require('../../src/models/RiskTransition');
const AIVitalPrediction = require('../../src/models/AIVitalPrediction');
const VitalLog = require('../../src/models/VitalLog');
const MedicineLog = require('../../src/models/MedicineLog');
const { buildPatientContext } = require('../../src/services/aiContextService');
const { companionInsightsQueue } = require('../../src/jobs/jobQueues');

describe('CompanionAiService', () => {
    const patientId = new mongoose.Types.ObjectId();
    let mockPatient;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPatient = {
            _id: patientId,
            name: 'John Doe',
            timezone: 'Asia/Kolkata',
            lifestyle: { device_sync_status: 'apple_health' },
            moodHistory: [],
            save: jest.fn().mockResolvedValue(true),
        };
        Patient.findById.mockResolvedValue(mockPatient);

        // Mock PatientHealthStateHistory chained query functions
        PatientHealthStateHistory.find.mockReturnValue({
            sort: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue([])
                })
            })
        });

        // Mock RiskTransition create and query functions
        RiskTransition.create.mockResolvedValue({ id: 'transition_123' });
        RiskTransition.find.mockReturnValue({
            sort: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            })
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. Queue Debouncing (enqueueCompanionInsights)
    // ═══════════════════════════════════════════════════════════════════════════
    describe('enqueueCompanionInsights', () => {
        it('should remove existing delayed job and add a new delayed job', async () => {
            const mockJob = { remove: jest.fn().mockResolvedValue(true) };
            companionInsightsQueue.getJob.mockResolvedValue(mockJob);
            companionInsightsQueue.add.mockResolvedValue({ id: 'job_123' });

            await companionAiService.enqueueCompanionInsights(patientId);

            expect(companionInsightsQueue.getJob).toHaveBeenCalledWith(`companion-insights-${patientId}`);
            expect(mockJob.remove).toHaveBeenCalled();
            expect(companionInsightsQueue.add).toHaveBeenCalledWith(
                'generate',
                { patientId },
                {
                    jobId: `companion-insights-${patientId}`,
                    delay: 120000,
                }
            );
        });

        it('should fall back to synchronous execution if queue add throws', async () => {
            companionInsightsQueue.getJob.mockResolvedValue(null);
            companionInsightsQueue.add.mockRejectedValue(new Error('Redis Connection Failure'));

            // Setup mock for generateAndCacheInsights fallback
            AIVitalPrediction.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(null)
            });
            VitalLog.countDocuments.mockResolvedValue(0);
            VitalLog.exists.mockResolvedValue(false);
            MedicineLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });
            VitalLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });
            buildPatientContext.mockResolvedValue({
                today_status: { total_scheduled: 0, taken: 0, missed: 0 }
            });
            CompanionAiInsight.findOne.mockResolvedValue(null);
            CompanionAiInsight.findOneAndUpdate.mockResolvedValue({ id: 'insight_123' });

            await companionAiService.enqueueCompanionInsights(patientId);

            expect(companionInsightsQueue.add).toHaveBeenCalled();
            expect(Patient.findById).toHaveBeenCalledWith(patientId);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. Care Visibility Calculations
    // ═══════════════════════════════════════════════════════════════════════════
    describe('Care Visibility Score & Breakdown', () => {
        beforeEach(() => {
            AIVitalPrediction.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(null)
            });
            VitalLog.countDocuments.mockResolvedValue(0);
            VitalLog.exists.mockResolvedValue(false);
            MedicineLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });
            CompanionAiInsight.findOne.mockResolvedValue(null);
            CompanionAiInsight.findOneAndUpdate.mockImplementation((query, update) => update);
        });

        it('should score max points when everything is synced today', async () => {
            // Meds: scheduled 2, logged 2 (taken/missed) => 35 pts
            // Vitals: synced within 24 hours => 35 pts
            // Wearable: connected => 15 pts
            // Mood: tracked within 24 hours => 15 pts
            // Total: 35 + 35 + 15 + 15 = 100 pts (High)

            mockPatient.lifestyle.device_sync_status = 'apple_health';
            mockPatient.moodHistory = [{ date: new Date(), value: 'happy' }];

            buildPatientContext.mockResolvedValue({
                today_status: { total_scheduled: 2, taken: 1, missed: 1 }
            });

            // Mock latest vital today
            VitalLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([{ date: new Date() }])
            });

            const result = await companionAiService.generateAndCacheInsights(patientId);

            expect(result.visibility_score).toBe(100);
            expect(result.visibility_label).toBe('High');
            expect(result.visibility_breakdown).toEqual({
                medications: 35,
                vitals: 35,
                wearable: 15,
                mood: 15
            });
        });

        it('should deduct points when logging is missed', async () => {
            // Meds: scheduled 4, logged 2 => 2/4 * 35 = 18 pts
            // Vitals: synced between 24 and 48 hours ago => 20 pts
            // Wearable: disconnected => 0 pts
            // Mood: tracked yesterday => 7 pts
            // Total: 18 + 20 + 0 + 7 = 45 pts (Low)

            mockPatient.lifestyle.device_sync_status = 'disconnected';
            const yesterday = new Date(Date.now() - 30 * 60 * 60 * 1000); // 30 hours ago
            mockPatient.moodHistory = [{ date: yesterday, value: 'neutral' }];

            buildPatientContext.mockResolvedValue({
                today_status: { total_scheduled: 4, taken: 1, missed: 1 }
            });

            VitalLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([{ date: yesterday }])
            });

            const result = await companionAiService.generateAndCacheInsights(patientId);

            expect(result.visibility_score).toBe(45);
            expect(result.visibility_label).toBe('Low');
            expect(result.visibility_breakdown).toEqual({
                medications: 18,
                vitals: 20,
                wearable: 0,
                mood: 7
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. Forecast Confidence Score
    // ═══════════════════════════════════════════════════════════════════════════
    describe('Forecast Confidence Scoring', () => {
        beforeEach(() => {
            AIVitalPrediction.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(null)
            });
            VitalLog.exists.mockResolvedValue(true);
            MedicineLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });
            VitalLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });
            buildPatientContext.mockResolvedValue({
                today_status: { total_scheduled: 0, taken: 0, missed: 0 }
            });
            CompanionAiInsight.findOne.mockResolvedValue(null);
            CompanionAiInsight.findOneAndUpdate.mockImplementation((query, update) => update);
        });

        it('should return High confidence (95%) when there are >= 10 logs in 14 days', async () => {
            VitalLog.countDocuments.mockResolvedValue(12);

            const result = await companionAiService.generateAndCacheInsights(patientId);

            expect(result.confidence_score).toBe(95);
            expect(result.confidence_label).toBe('High');
        });

        it('should return Medium confidence (75%) when there are 7-9 logs in 14 days', async () => {
            VitalLog.countDocuments.mockResolvedValue(8);

            const result = await companionAiService.generateAndCacheInsights(patientId);

            expect(result.confidence_score).toBe(75);
            expect(result.confidence_label).toBe('Medium');
        });

        it('should return Low confidence (40%) when there are < 7 logs in 14 days', async () => {
            VitalLog.countDocuments.mockResolvedValue(4);

            const result = await companionAiService.generateAndCacheInsights(patientId);

            expect(result.confidence_score).toBe(40);
            expect(result.confidence_label).toBe('Low');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. Deterministic Risk Engine
    // ═══════════════════════════════════════════════════════════════════════════
    describe('Deterministic Risk Level & Factors Mapping', () => {
        beforeEach(() => {
            AIVitalPrediction.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(null)
            });
            VitalLog.countDocuments.mockResolvedValue(10);
            VitalLog.exists.mockResolvedValue(true);
            MedicineLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });
            VitalLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });
            CompanionAiInsight.findOne.mockResolvedValue(null);
            CompanionAiInsight.findOneAndUpdate.mockImplementation((query, update) => update);
        });

        it('should classify as High Risk if today adherence is < 60%', async () => {
            buildPatientContext.mockResolvedValue({
                today_status: { total_scheduled: 0, taken: 0, missed: 0 },
                patient_health_state: { adherence: { today: 45 }, vitals: { status: 'stable' } }
            });

            const result = await companionAiService.generateAndCacheInsights(patientId);

            expect(result.risk_level).toBe('high');
            expect(result.risk_score).toBeGreaterThanOrEqual(70);
            expect(result.risk_factors).toContain("Today's medication adherence is critical (45%)");
        });

        it('should classify as High Risk if vital status is critical', async () => {
            buildPatientContext.mockResolvedValue({
                today_status: { total_scheduled: 0, taken: 0, missed: 0 },
                patient_health_state: { adherence: { today: 100 }, vitals: { status: 'critical' } }
            });

            const result = await companionAiService.generateAndCacheInsights(patientId);

            expect(result.risk_level).toBe('high');
            expect(result.risk_factors).toContain("Latest vital log indicates critical biometrics");
        });

        it('should classify as Medium Risk if today adherence is between 60% and 75%', async () => {
            buildPatientContext.mockResolvedValue({
                today_status: { total_scheduled: 0, taken: 0, missed: 0 },
                patient_health_state: { adherence: { today: 68 }, vitals: { status: 'stable' } }
            });

            const result = await companionAiService.generateAndCacheInsights(patientId);

            expect(result.risk_level).toBe('medium');
            expect(result.risk_factors).toContain("Today's medication adherence is below target (68%)");
        });

        it('should classify as Medium Risk if no BP sync exists in last 3 days', async () => {
            VitalLog.exists.mockResolvedValue(false); // No logs in last 3 days
            buildPatientContext.mockResolvedValue({
                today_status: { total_scheduled: 0, taken: 0, missed: 0 },
                patient_health_state: { adherence: { today: 100 }, vitals: { status: 'stable' } }
            });

            const result = await companionAiService.generateAndCacheInsights(patientId);

            expect(result.risk_level).toBe('medium');
            expect(result.risk_factors).toContain("No blood pressure or heart rate sync in over 3 days");
        });

        it('should calculate trend_delta compared to previous cached values', async () => {
            CompanionAiInsight.findOne.mockResolvedValue({
                risk_level: 'medium',
                risk_score: 50,
                visibility_score: 60,
                confidence_score: 80
            });
            buildPatientContext.mockResolvedValue({
                today_status: { total_scheduled: 0, taken: 0, missed: 0 },
                patient_health_state: { adherence: { today: 45 }, vitals: { status: 'stable' } }
            });

            const result = await companionAiService.generateAndCacheInsights(patientId);

            expect(result.trend_delta).toEqual({
                risk_score: 20,
                visibility_score: -10,
                confidence_score: 15
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. Stable Streaks Calculations
    // ═══════════════════════════════════════════════════════════════════════════
    describe('Last Seen Healthy Stable Streak', () => {
        beforeEach(() => {
            AIVitalPrediction.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(null)
            });
            VitalLog.countDocuments.mockResolvedValue(10);
            VitalLog.exists.mockResolvedValue(true);
            buildPatientContext.mockResolvedValue({
                today_status: { total_scheduled: 0, taken: 0, missed: 0 }
            });
            CompanionAiInsight.findOne.mockResolvedValue(null);
            CompanionAiInsight.findOneAndUpdate.mockImplementation((query, update) => update);
        });

        it('should identify a consecutive stable streak', async () => {
            // Setup 3 consecutive stable days (today, yesterday, day before)
            const todayStr = new Date().toISOString().slice(0, 10);
            const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            const dayBeforeStr = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().slice(0, 10);

            // MedicineLog matching 100% adherence
            MedicineLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { date: todayStr, medicines: [{ medicine_name: 'Aspirin', taken: true }] },
                    { date: yesterdayStr, medicines: [{ medicine_name: 'Aspirin', taken: true }] },
                    { date: dayBeforeStr, medicines: [{ medicine_name: 'Aspirin', taken: true }] }
                ])
            });

            // Vitals logs within normal ranges
            VitalLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { date: todayStr, heart_rate: 70, blood_pressure: { systolic: 120, diastolic: 80 } },
                    { date: yesterdayStr, heart_rate: 72, blood_pressure: { systolic: 118, diastolic: 78 } },
                    { date: dayBeforeStr, heart_rate: 74, blood_pressure: { systolic: 122, diastolic: 82 } }
                ])
            });

            const result = await companionAiService.generateAndCacheInsights(patientId);

            expect(result.last_stable.currently_stable).toBe(true);
            expect(result.last_stable.stable_days).toBeGreaterThanOrEqual(3);
        });

        it('should find last stable date if currently unstable', async () => {
            // Today is unstable (critical BP), but yesterday was stable
            const todayStr = new Date().toISOString().slice(0, 10);
            const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

            MedicineLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { date: todayStr, medicines: [{ medicine_name: 'Aspirin', taken: true }] },
                    { date: yesterdayStr, medicines: [{ medicine_name: 'Aspirin', taken: true }] }
                ])
            });

            VitalLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { date: todayStr, heart_rate: 110, blood_pressure: { systolic: 160, diastolic: 100 } }, // Critical today
                    { date: yesterdayStr, heart_rate: 72, blood_pressure: { systolic: 120, diastolic: 80 } }  // Stable yesterday
                ])
            });

            const result = await companionAiService.generateAndCacheInsights(patientId);

            expect(result.last_stable.currently_stable).toBe(false);
            expect(result.last_stable.stable_days).toBe(0);
            expect(result.last_stable.last_stable_at).toBeDefined();
            expect(result.last_stable.unstable_since).toBeDefined();
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. Priority Actions
    // ═══════════════════════════════════════════════════════════════════════════
    describe('Priority Action Queue Severity & Priority', () => {
        beforeEach(() => {
            AIVitalPrediction.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(null)
            });
            VitalLog.countDocuments.mockResolvedValue(10);
            VitalLog.exists.mockResolvedValue(true);
            MedicineLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });
            VitalLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });
            CompanionAiInsight.findOne.mockResolvedValue(null);
            CompanionAiInsight.findOneAndUpdate.mockImplementation((query, update) => update);
        });

        it('should compile critical vital actions when status is critical', async () => {
            buildPatientContext.mockResolvedValue({
                today_status: { total_scheduled: 0, taken: 0, missed: 0 },
                patient_health_state: { adherence: { today: 100 }, vitals: { status: 'critical' } }
            });

            const result = await companionAiService.generateAndCacheInsights(patientId);

            expect(result.priority_actions).toContainEqual(
                expect.objectContaining({
                    action_type: 'critical_vital',
                    priority: 1,
                    severity: 'critical'
                })
            );
        });

        it('should compile medication warnings when adherence drops', async () => {
            buildPatientContext.mockResolvedValue({
                today_status: { total_scheduled: 0, taken: 0, missed: 0 },
                patient_health_state: { adherence: { today: 65 }, vitals: { status: 'stable' } }
            });

            const result = await companionAiService.generateAndCacheInsights(patientId);

            expect(result.priority_actions).toContainEqual(
                expect.objectContaining({
                    action_type: 'medication',
                    priority: 2,
                    severity: 'warning'
                })
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 7. Companion AI Insight History Snapshotting
    // ═══════════════════════════════════════════════════════════════════════════
    describe('Historical Snapshot Archiving', () => {
        beforeEach(() => {
            AIVitalPrediction.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(null)
            });
            VitalLog.countDocuments.mockResolvedValue(10);
            VitalLog.exists.mockResolvedValue(true);
            MedicineLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });
            VitalLog.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });
            buildPatientContext.mockResolvedValue({
                today_status: { total_scheduled: 0, taken: 0, missed: 0 }
            });
            CompanionAiInsight.findOne.mockResolvedValue(null);
            CompanionAiInsight.findOneAndUpdate.mockImplementation((query, update) => update);
            CompanionAiInsightHistory.create.mockResolvedValue({ id: 'history_123' });
        });

        it('should save a historical snapshot containing risk, visibility, and confidence score', async () => {
            await companionAiService.generateAndCacheInsights(patientId);

            expect(CompanionAiInsightHistory.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    patient_id: patientId,
                    schema_version: 1,
                    risk_level: expect.any(String),
                    risk_score: expect.any(Number),
                    risk_breakdown: expect.objectContaining({
                        adherence: expect.any(Number),
                        vitals: expect.any(Number),
                        mood: expect.any(Number),
                        visibility: expect.any(Number)
                    }),
                    visibility_score: expect.any(Number),
                    confidence_score: expect.any(Number),
                    generated_at: expect.any(Date),
                    expires_at: expect.any(Date)
                })
            );
        });
    });
});
