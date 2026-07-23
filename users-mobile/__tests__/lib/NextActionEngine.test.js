import { NextActionEngine } from '../../src/lib/NextActionEngine';

describe('NextActionEngine Priority Order', () => {
    it('returns P1 Alert as highest priority when active severe alerts exist', () => {
        const result = NextActionEngine.evaluatePriority({
            alerts: [{ name: 'Severe Hypertension', severity: 'severe', status: 'active' }],
            meds: [{ name: 'Metformin', time: '08:00', taken: false }],
        });

        expect(result.rank).toBe('P1');
        expect(result.type).toBe('alert');
        expect(result.bannerTitle).toBe('Action Required');
    });

    it('returns P2 Overdue when missed medications exist', () => {
        const result = NextActionEngine.evaluatePriority({
            alerts: [],
            meds: [
                { name: 'Aspirin', time: '06:00', taken: false },
            ],
        });

        expect(result.rank).toBe('P2');
        expect(result.type).toBe('overdue');
        expect(result.bannerDescription).toContain('missed today');
    });

    it('returns P3 Medication Due when untaken slots exist', () => {
        const result = NextActionEngine.evaluatePriority({
            alerts: [],
            meds: [
                { name: 'Vitamin D', time: '23:59', taken: false },
            ],
        });

        expect(result.rank).toBe('P3');
        expect(result.type).toBe('medication');
        expect(result.bannerTitle).toBe("What's Next?");
    });

    it('returns P4 Quick Setup when profile completeness is under 70%', () => {
        const result = NextActionEngine.evaluatePriority({
            alerts: [],
            meds: [{ name: 'Stat', time: '23:59', taken: true }],
            completionPct: 40,
        });

        expect(result.rank).toBe('P4');
        expect(result.type).toBe('profile');
    });
});
