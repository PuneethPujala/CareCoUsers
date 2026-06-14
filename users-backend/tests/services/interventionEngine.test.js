const mongoose = require('mongoose');

jest.mock('../../src/models/Patient');
jest.mock('../../src/models/VitalLog');
jest.mock('../../src/models/Intervention');
jest.mock('../../src/models/CompanionAiInsight');
jest.mock('../../src/services/companionAiService', () => ({
    getOrGenerateInsights: jest.fn()
}));

const Patient = require('../../src/models/Patient');
const VitalLog = require('../../src/models/VitalLog');
const Intervention = require('../../src/models/Intervention');
const { getOrGenerateInsights } = require('../../src/services/companionAiService');

const {
    generateInterventions,
    completeIntervention
} = require('../../src/services/interventionEngineService');

describe('Intervention Engine Service', () => {
    const patientId = new mongoose.Types.ObjectId();
    const companionId = new mongoose.Types.ObjectId();
    
    beforeEach(() => {
        jest.clearAllMocks();
        const mockQuery = {
            sort: jest.fn().mockReturnThis(),
            then: jest.fn((resolve) => resolve(null))
        };
        Intervention.findOne.mockReturnValue(mockQuery);
    });

    describe('generateInterventions', () => {
        it('should recommend medication reminder if adherence < 75%', async () => {
            Patient.findById.mockResolvedValue({
                _id: patientId,
                adherence_rate: 70,
                timezone: 'Asia/Kolkata'
            });
            getOrGenerateInsights.mockResolvedValue({
                risk_level: 'low',
                risk_factors: []
            });
            VitalLog.exists.mockResolvedValue(true);
            Intervention.find.mockReturnValue({
                sort: jest.fn().mockResolvedValue([{ type: 'medication_reminder' }])
            });

            const result = await generateInterventions(patientId);

            expect(Intervention.create).toHaveBeenCalledWith(expect.objectContaining({
                type: 'medication_reminder',
                status: 'generated',
                priority_score: 70
            }));
        });

        it('should request BP log if no recent logs exist in 3 days', async () => {
            Patient.findById.mockResolvedValue({
                _id: patientId,
                adherence_rate: 90,
                timezone: 'Asia/Kolkata'
            });
            getOrGenerateInsights.mockResolvedValue({
                risk_level: 'low',
                risk_factors: []
            });
            VitalLog.exists.mockResolvedValue(false);
            Intervention.find.mockReturnValue({
                sort: jest.fn().mockResolvedValue([{ type: 'bp_request' }])
            });

            await generateInterventions(patientId);

            expect(Intervention.create).toHaveBeenCalledWith(expect.objectContaining({
                type: 'bp_request',
                status: 'generated',
                priority_score: 80
            }));
        });

        it('should recommend escalation if patient is high risk and declining', async () => {
            Patient.findById.mockResolvedValue({
                _id: patientId,
                adherence_rate: 90,
                timezone: 'Asia/Kolkata'
            });
            getOrGenerateInsights.mockResolvedValue({
                risk_level: 'high',
                predictive_health: {
                    forecast: { trajectory: 'declining' }
                },
                risk_factors: []
            });
            VitalLog.exists.mockResolvedValue(true);
            Intervention.find.mockReturnValue({
                sort: jest.fn().mockResolvedValue([{ type: 'escalation_contact' }])
            });

            await generateInterventions(patientId);

            expect(Intervention.create).toHaveBeenCalledWith(expect.objectContaining({
                type: 'escalation_contact',
                status: 'generated',
                priority_score: 95
            }));
        });
    });

    describe('completeIntervention', () => {
        it('should mark intervention completed and create a new history record', async () => {
            const interventionId = new mongoose.Types.ObjectId();
            const mockIntervention = {
                _id: interventionId,
                patient_id: patientId,
                type: 'medication_reminder',
                priority_score: 70,
                reason: 'Weekly adherence rate is below target',
                save: jest.fn().mockResolvedValue(true)
            };

            Intervention.findById.mockResolvedValue(mockIntervention);
            Intervention.create.mockResolvedValue({});

            const result = await completeIntervention(interventionId, companionId);

            expect(result).toBeDefined();
            expect(mockIntervention.status).toBe('completed');
            expect(mockIntervention.companion_id).toBe(companionId);
            expect(Intervention.create).toHaveBeenCalledWith(expect.objectContaining({
                source: 'companion',
                status: 'completed',
                companion_id: companionId
            }));
        });
    });
});
