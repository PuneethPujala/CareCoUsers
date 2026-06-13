const { calculateConsistency } = require('../../src/services/adherenceConsistencyService');
const { calculateRiskTrends } = require('../../src/services/riskTrendService');
const { detectRecovery } = require('../../src/services/recoveryDetectionService');
const { forecastTrajectory, calculateSlope } = require('../../src/services/trajectoryForecastService');
const { calculateMomentum } = require('../../src/services/healthMomentumService');

describe('Predictive Health Intelligence Services', () => {

    describe('adherenceConsistencyService', () => {
        it('should calculate high consistency for stable, low-variance adherence habits', () => {
            const history = [
                { adherence: { today: 90 } },
                { adherence: { today: 89 } },
                { adherence: { today: 88 } },
                { adherence: { today: 92 } },
                { adherence: { today: 91 } }
            ];
            const result = calculateConsistency(history);
            expect(result.adherence_average).toBe(90);
            expect(result.adherence_consistency).toBeGreaterThan(90); // ~97
        });

        it('should calculate low consistency for high-variance, erratic compliance habits', () => {
            const history = [
                { adherence: { today: 100 } },
                { adherence: { today: 10 } },
                { adherence: { today: 100 } },
                { adherence: { today: 20 } },
                { adherence: { today: 100 } }
            ];
            const result = calculateConsistency(history);
            expect(result.adherence_average).toBe(66);
            expect(result.adherence_consistency).toBeLessThan(30); // volatile
        });

        it('should return default consistency values if history is empty', () => {
            const result = calculateConsistency([]);
            expect(result.adherence_average).toBe(0);
            expect(result.adherence_consistency).toBe(100);
        });
    });

    describe('riskTrendService', () => {
        it('should compute zero velocity and acceleration for stable risk score history', () => {
            const history = [
                { risk: 'medium' },
                { risk: 'medium' },
                { risk: 'medium' }
            ];
            const result = calculateRiskTrends(history, 50);
            expect(result.velocity).toBe(0);
            expect(result.acceleration).toBe(0);
        });

        it('should compute positive velocity when risk score is rising', () => {
            const history = [
                { risk: 'low' },    // 20
                { risk: 'medium' }, // 50
                { risk: 'medium' }  // 50
            ];
            // transition series: 20 -> 50 -> 50 -> 80 (high)
            const result = calculateRiskTrends(history, 80);
            expect(result.velocity).toBeGreaterThan(0);
        });

        it('should compute negative velocity when risk score is falling', () => {
            const history = [
                { risk: 'high' },   // 80
                { risk: 'medium' }, // 50
                { risk: 'medium' }  // 50
            ];
            // transition series: 80 -> 50 -> 50 -> 20 (low)
            const result = calculateRiskTrends(history, 20);
            expect(result.velocity).toBeLessThan(0);
        });
    });

    describe('recoveryDetectionService', () => {
        it('should detect recovery when risk has decreased consecutively without warnings', () => {
            const history = [
                { risk: 'high', adherence: { today: 90 } },
                { risk: 'medium', adherence: { today: 90 } },
                { risk: 'medium', adherence: { today: 90 } }
            ];
            // risk: 80 -> 50 -> 50 -> 20 (low risk today, decrease streak)
            const result = detectRecovery(history, 20, [], 100);
            expect(result.recovery_status).toBe(true);
            expect(result.recovery_days).toBeGreaterThan(0);
            expect(result.confidence).toBeGreaterThan(80);
        });

        it('should reject recovery if there are recent critical vital alerts', () => {
            const history = [
                { risk: 'high', adherence: { today: 90 } },
                { risk: 'medium', adherence: { today: 90 } },
                { risk: 'medium', adherence: { today: 90 } }
            ];
            const recentAlerts = [
                { type: 'critical_vital', severity: 'critical', created_at: new Date() }
            ];
            const result = detectRecovery(history, 20, recentAlerts, 100);
            expect(result.recovery_status).toBe(false);
        });

        it('should reject recovery if average adherence is low', () => {
            const history = [
                { risk: 'high', adherence: { today: 40 } },
                { risk: 'medium', adherence: { today: 40 } },
                { risk: 'medium', adherence: { today: 40 } }
            ];
            const result = detectRecovery(history, 20, [], 100);
            expect(result.recovery_status).toBe(false);
        });
    });

    describe('trajectoryForecastService', () => {
        it('should project a positive trajectory for rising health score values', () => {
            const history = [
                { score: 70 },
                { score: 72 },
                { score: 74 },
                { score: 76 }
            ];
            const result = forecastTrajectory(history, 80);
            expect(result.trajectory).toBe('positive');
            expect(result.projected_score_14d).toBeGreaterThan(80);
        });

        it('should project a negative trajectory for falling health score values', () => {
            const history = [
                { score: 85 },
                { score: 82 },
                { score: 80 },
                { score: 78 }
            ];
            const result = forecastTrajectory(history, 75);
            expect(result.trajectory).toBe('negative');
            expect(result.projected_score_14d).toBeLessThan(75);
        });

        it('should project stable trajectory for minor fluctuations', () => {
            const history = [
                { score: 80 },
                { score: 81 },
                { score: 80 },
                { score: 79 }
            ];
            const result = forecastTrajectory(history, 80);
            expect(result.trajectory).toBe('stable');
            expect(result.projected_score_14d).toBe(80);
        });
    });

    describe('healthMomentumService', () => {
        it('should return improving momentum for positive 30d changes', () => {
            const history = [
                { score: 70, adherence: { today: 80, streak: 2 }, mood: 'okay' }
            ];
            const currentState = {
                score: 85,
                adherence: { today: 95, streak: 6 },
                mood: 'great'
            };
            const result = calculateMomentum(history, currentState);
            expect(result.momentum_direction).toBe('improving');
            expect(result.momentum_score).toBeGreaterThan(60);
        });

        it('should return declining momentum for negative 30d changes', () => {
            const history = [
                { score: 90, adherence: { today: 95, streak: 12 }, mood: 'great' }
            ];
            const currentState = {
                score: 70,
                adherence: { today: 60, streak: 2 },
                mood: 'sad'
            };
            const result = calculateMomentum(history, currentState);
            expect(result.momentum_direction).toBe('declining');
            expect(result.momentum_score).toBeLessThan(40);
        });
    });
});
