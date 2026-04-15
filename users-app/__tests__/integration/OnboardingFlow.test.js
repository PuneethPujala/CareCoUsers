/**
 * OnboardingFlow.test.js — Integration tests for the onboarding step machine
 *
 * Tests the full flow logic: resolveOnboardingStep + AuthContext's onboardingComplete
 * derivation + AppNavigator routing decisions.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from '../../src/navigation/AppNavigator';
import { resolveOnboardingStep, normaliseStatus } from '../../src/utils/authUtils';

// ── Mock all screens ────────────────────────────────────────────────────────
jest.mock('../../src/screens/onboarding/PatientSignupScreen', () => () => <mock-signup />);
jest.mock('../../src/screens/onboarding/LoginScreen', () => () => <mock-login />);
jest.mock('../../src/screens/onboarding/ResetPasswordScreen', () => () => <mock-reset />);
jest.mock('../../src/screens/onboarding/VerifyEmailScreen', () => () => <mock-verify />);
jest.mock('../../src/screens/patient/HomeScreen', () => () => <mock-home />);
jest.mock('../../src/screens/patient/MyCallerScreen', () => () => <mock-caller />);
jest.mock('../../src/screens/patient/MedicationsScreen', () => () => <mock-medications />);
jest.mock('../../src/screens/patient/HealthProfileScreen', () => () => <mock-profile />);
jest.mock('../../src/screens/patient/NotificationsScreen', () => () => <mock-notifications />);
jest.mock('../../src/screens/patient/ProfileScreen', () => () => <mock-patient-profile />);
jest.mock('../../src/screens/patient/SubscribePlansScreen', () => () => <mock-subscribe />);
jest.mock('../../src/screens/patient/PaymentScreen', () => () => <mock-payment />);
jest.mock('../../src/screens/patient/WaitingScreen', () => () => <mock-waiting />);
jest.mock('../../src/screens/patient/VitalsHistoryScreen', () => () => <mock-vitals />);
jest.mock('../../src/screens/patient/LocationSearchScreen', () => () => <mock-location />);
jest.mock('../../src/screens/patient/AddAddressScreen', () => () => <mock-address />);
jest.mock('../../src/screens/patient/HealthConnectSetupScreen', () => () => <mock-health-connect />);

jest.mock('../../src/lib/api', () => ({
    apiService: {
        patients: { updateMe: jest.fn().mockResolvedValue({}) },
    },
}));

import { useAuth } from '../../src/context/AuthContext';
jest.mock('../../src/context/AuthContext', () => ({
    useAuth: jest.fn(),
}));

const renderNav = () =>
    render(
        <NavigationContainer>
            <AppNavigator />
        </NavigationContainer>
    );

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Onboarding step state machine (pure logic)
// ─────────────────────────────────────────────────────────────────────────────

describe('Onboarding Step State Machine', () => {
    describe('fresh account (deleted from DB and re-created)', () => {
        it('starts at Step 1 when profile and patient are both null', () => {
            expect(resolveOnboardingStep(null, null)).toBe(1);
        });

        it('starts at Step 1 when profile and patient are both undefined', () => {
            expect(resolveOnboardingStep(undefined, undefined)).toBe(1);
        });
    });

    describe('Step 2: City Selection', () => {
        it('returns 2 when profile has no city', () => {
            expect(resolveOnboardingStep({ name: 'X' }, { fullName: 'X' })).toBe(2);
        });

        it('returns 2 when profile.city is empty string', () => {
            expect(resolveOnboardingStep({ city: '' }, { city: '' })).toBe(2);
        });

        it('advances past 2 when patient has city', () => {
            const result = resolveOnboardingStep(
                { city: 'Hyderabad', subscription: {} },
                { city: 'Hyderabad' }
            );
            expect(result).toBe(3); // No plan yet
        });
    });

    describe('Step 3: Plan Selection & Payment', () => {
        it('returns 3 when subscription plan is missing', () => {
            expect(
                resolveOnboardingStep(
                    { city: 'Mumbai', subscription: {} },
                    { city: 'Mumbai' }
                )
            ).toBe(3);
        });

        it('returns 3 when subscription is null', () => {
            expect(
                resolveOnboardingStep(
                    { city: 'Mumbai', subscription: null },
                    { city: 'Mumbai' }
                )
            ).toBe(3);
        });

        it('returns 3 when plan exists but status is none (UNPAID)', () => {
            expect(
                resolveOnboardingStep(
                    { city: 'Mumbai', subscription: { plan: 'basic', status: 'none' } },
                    { city: 'Mumbai' }
                )
            ).toBe(3);
        });

        it('returns 3 when plan exists but status is undefined (UNPAID)', () => {
            expect(
                resolveOnboardingStep(
                    { city: 'Mumbai', subscription: { plan: 'basic' } },
                    { city: 'Mumbai' }
                )
            ).toBe(3);
        });

        it('returns 3 when plan exists but status is garbage string (UNPAID)', () => {
            expect(
                resolveOnboardingStep(
                    { city: 'Mumbai', subscription: { plan: 'basic', status: 'pending_review' } },
                    { city: 'Mumbai' }
                )
            ).toBe(3);
        });
    });

    describe('Onboarding Complete (returns null)', () => {
        it('returns null when status is active', () => {
            expect(
                resolveOnboardingStep(
                    { city: 'Delhi', subscription: { plan: 'basic', status: 'active' } },
                    { city: 'Delhi' }
                )
            ).toBeNull();
        });

        it('returns null when status is expired (renewal handled elsewhere)', () => {
            expect(
                resolveOnboardingStep(
                    { city: 'Delhi', subscription: { plan: 'premium', status: 'expired' } },
                    { city: 'Delhi' }
                )
            ).toBeNull();
        });

        it('returns null when status is past_due (treated as expired)', () => {
            expect(
                resolveOnboardingStep(
                    { city: 'Delhi', subscription: { plan: 'basic', status: 'past_due' } },
                    { city: 'Delhi' }
                )
            ).toBeNull();
        });

        it('returns null when status is cancelled (treated as expired)', () => {
            expect(
                resolveOnboardingStep(
                    { city: 'Delhi', subscription: { plan: 'basic', status: 'cancelled' } },
                    { city: 'Delhi' }
                )
            ).toBeNull();
        });
    });

    describe('normaliseStatus edge cases for subscription routing', () => {
        it.each([
            ['active', 'active'],
            ['expired', 'expired'],
            ['past_due', 'expired'],
            ['cancelled', 'expired'],
            ['none', 'none'],
            [undefined, 'none'],
            [null, 'none'],
            ['', 'none'],
            ['trial', 'none'],
            ['pending', 'none'],
        ])('normaliseStatus(%s) === %s', (input, expected) => {
            expect(normaliseStatus(input)).toBe(expected);
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: AppNavigator routing for the "deleted account re-signup" scenario
// ─────────────────────────────────────────────────────────────────────────────

describe('AppNavigator: Deleted Account Re-Signup Flow', () => {
    afterEach(() => jest.clearAllMocks());

    it('routes to Signup when user exists but onboarding is incomplete', () => {
        // Simulates: user deleted from DB, re-signed up, profile exists but no city/plan
        useAuth.mockReturnValue({
            isBootstrapping: false,
            user: { id: 'new-user' },
            onboardingComplete: false,
            subscriptionStatus: 'none',
        });

        const { UNSAFE_getAllByType } = renderNav();
        expect(UNSAFE_getAllByType('mock-signup').length).toBeGreaterThan(0);
    });

    it('routes to Paywall if onboarding complete but subscription expired', () => {
        useAuth.mockReturnValue({
            isBootstrapping: false,
            user: { id: 'returning-user' },
            profile: { id: 'p1' },
            onboardingComplete: true,
            subscriptionStatus: 'expired',
        });

        const { UNSAFE_getAllByType } = renderNav();
        expect(UNSAFE_getAllByType('mock-subscribe').length).toBeGreaterThan(0);
    });

    it('routes to Dashboard when everything is active', () => {
        useAuth.mockReturnValue({
            isBootstrapping: false,
            user: { id: 'active-user' },
            profile: { id: 'p1' },
            onboardingComplete: true,
            subscriptionStatus: 'active',
        });

        const { UNSAFE_getAllByType } = renderNav();
        expect(UNSAFE_getAllByType('mock-home').length).toBeGreaterThan(0);
    });

    it('shows splash/loading while bootstrapping (no premature routing)', () => {
        useAuth.mockReturnValue({
            isBootstrapping: true,
            user: null,
        });

        const { UNSAFE_getAllByType } = renderNav();
        // Nothing should render from auth or app stacks
        expect(() => UNSAFE_getAllByType('mock-login')).toThrow();
        expect(() => UNSAFE_getAllByType('mock-signup')).toThrow();
        expect(() => UNSAFE_getAllByType('mock-home')).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Subscription status → navigation mapping
// ─────────────────────────────────────────────────────────────────────────────

describe('AppNavigator: Subscription Status Routing', () => {
    afterEach(() => jest.clearAllMocks());

    it.each([
        ['none', 'mock-subscribe', 'routes to paywall'],
        ['expired', 'mock-subscribe', 'routes to paywall'],
    ])('when subscriptionStatus is "%s", %s', (status, expectedType) => {
        useAuth.mockReturnValue({
            isBootstrapping: false,
            user: { id: 'u1' },
            profile: { id: 'p1' },
            onboardingComplete: true,
            subscriptionStatus: status,
        });

        const { UNSAFE_getAllByType } = renderNav();
        expect(UNSAFE_getAllByType(expectedType).length).toBeGreaterThan(0);
    });

    it('routes to main app when subscriptionStatus is active', () => {
        useAuth.mockReturnValue({
            isBootstrapping: false,
            user: { id: 'u1' },
            profile: { id: 'p1' },
            onboardingComplete: true,
            subscriptionStatus: 'active',
        });

        const { UNSAFE_getAllByType } = renderNav();
        expect(UNSAFE_getAllByType('mock-home').length).toBeGreaterThan(0);
    });
});
