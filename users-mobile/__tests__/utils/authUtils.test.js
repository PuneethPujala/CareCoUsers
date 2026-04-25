import { normaliseStatus, resolveOnboardingStep, isRecoveryExpired } from '../../src/utils/authUtils';

describe('Auth Utilities', () => {
    describe('normaliseStatus', () => {
        it('returns active for exactly active', () => {
            expect(normaliseStatus('active')).toBe('active');
        });

        it('returns expired for expired equivalents', () => {
            expect(normaliseStatus('expired')).toBe('expired');
            expect(normaliseStatus('past_due')).toBe('expired');
            expect(normaliseStatus('cancelled')).toBe('expired');
        });

        it('returns none for null, undefined, or garbage strings', () => {
            expect(normaliseStatus(null)).toBe('none');
            expect(normaliseStatus(undefined)).toBe('none');
            expect(normaliseStatus('garbage')).toBe('none');
            expect(normaliseStatus('')).toBe('none');
        });
    });

    describe('resolveOnboardingStep', () => {
        it('returns 1 if both profile and patient are null', () => {
            expect(resolveOnboardingStep(null, null)).toBe(1);
        });

        it('returns 2 if identity exists but city is missing', () => {
            const profile = { fullName: 'Test User' };
            const patient = { name: 'Test User' };
            expect(resolveOnboardingStep(patient, profile)).toBe(2);
            
            // Check fallback logic across both objects
            expect(resolveOnboardingStep(null, profile)).toBe(2);
            expect(resolveOnboardingStep(patient, null)).toBe(2);
        });

        it('returns 3 if city exists but subscription plan is missing', () => {
            const profile = { city: 'London' };
            const patient = { city: 'London', subscription: {} };
            expect(resolveOnboardingStep(patient, profile)).toBe(3);
        });

        it('returns 3 (stays on payment screen) if plan exists but payment status is none', () => {
            const profile = { city: 'London' };
            const patient = { 
                city: 'London', 
                subscription: { plan: 'premium', status: 'none' } 
            };
            expect(resolveOnboardingStep(patient, profile)).toBe(3);
        });

        it('returns null (Complete) if all steps are satisfied', () => {
            const profile = { city: 'London' };
            const patient = { 
                city: 'London', 
                subscription: { plan: 'premium', status: 'active' } 
            };
            expect(resolveOnboardingStep(patient, profile)).toBeNull();

            // Expired users are legally complete with onboarding, AppNavigator handles paywall routing
            const patientExpired = { 
                city: 'London', 
                subscription: { plan: 'premium', status: 'expired' } 
            };
            expect(resolveOnboardingStep(patientExpired, profile)).toBeNull();
        });
    });

    describe('isRecoveryExpired', () => {
        beforeAll(() => {
            jest.useFakeTimers();
        });

        afterAll(() => {
            jest.useRealTimers();
        });

        it('returns true if recoverySessionAt is undefined or null', () => {
            expect(isRecoveryExpired(undefined)).toBe(true);
            expect(isRecoveryExpired(null)).toBe(true);
        });

        it('returns false for timestamps within 10 minutes', () => {
            const now = Date.now();
            jest.setSystemTime(now);

            // 5 minutes ago = 5 * 60 * 1000 = 300000ms
            const validTime = now - 300000;
            expect(isRecoveryExpired(validTime)).toBe(false);
            
            // 9m59s
            const exactEdge = now - 599000;
            expect(isRecoveryExpired(exactEdge)).toBe(false);
        });

        it('returns true for timestamps exceeding 10 minutes', () => {
            const now = Date.now();
            jest.setSystemTime(now);

            // 11 minutes ago = 11 * 60 * 1000 = 660000ms
            const invalidTime = now - 660000;
            expect(isRecoveryExpired(invalidTime)).toBe(true);

            // 10m01s
            const exactEdge = now - 601000;
            expect(isRecoveryExpired(exactEdge)).toBe(true);
        });
    });
});
