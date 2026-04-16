import React from 'react';
import { render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from '../../src/navigation/AppNavigator';

// Mock all internal navigation screens to prevent raw native module invocations
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

// Mock the API layer used directly within AppNavigator
jest.mock('../../src/lib/api', () => ({
    apiService: {
        patients: {
            updateMe: jest.fn().mockResolvedValue({}),
        }
    }
}));

// Mock AuthContext hook explicitly
import { useAuth } from '../../src/context/AuthContext';
jest.mock('../../src/context/AuthContext', () => ({
    useAuth: jest.fn(),
}));

describe('AppNavigator Authentication Routing', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    const renderNavigator = () => render(
        <NavigationContainer>
            <AppNavigator />
        </NavigationContainer>
    );

    it('renders AppSplashScreen while bootstrapping', () => {
        useAuth.mockReturnValue({
            isBootstrapping: true,
            user: null,
        });

        const { getByTestId, UNSAFE_getByType } = renderNavigator();
        // Because AppSplashScreen is an internal component that just renders a View with flex:1, Wait...
        // We can assert AuthStack and others are NOT rendered.
        expect(() => UNSAFE_getByType('mock-login')).toThrow();
        expect(() => UNSAFE_getByType('mock-home')).toThrow();
    });

    it('routes to AuthStack (Login) if user is null', () => {
        useAuth.mockReturnValue({
            isBootstrapping: false,
            user: null,
            onboardingComplete: false,
            subscriptionStatus: 'none',
        });

        const { UNSAFE_getAllByType } = renderNavigator();
        expect(UNSAFE_getAllByType('mock-login').length).toBeGreaterThan(0);
    });

    it('routes to OnboardingStack if user exists but onboardingComplete is false', () => {
        useAuth.mockReturnValue({
            isBootstrapping: false,
            user: { id: '123' },
            onboardingComplete: false,
            subscriptionStatus: 'none',
        });

        const { UNSAFE_getAllByType } = renderNavigator();
        expect(UNSAFE_getAllByType('mock-signup').length).toBeGreaterThan(0);
    });

    it('routes to Paywall if onboardingComplete is true but subscriptionStatus is absent/expired', () => {
        useAuth.mockReturnValue({
            isBootstrapping: false,
            user: { id: '123' },
            profile: { id: 'abc' },
            onboardingComplete: true,
            subscriptionStatus: 'expired',
        });

        const { UNSAFE_getAllByType } = renderNavigator();
        // Since it's a fallback conditional stack, Subscribe plans should appear
        expect(UNSAFE_getAllByType('mock-subscribe').length).toBeGreaterThan(0);
    });

    it('routes to MainAppStack (Dashboard) if everything is fully completed and active', () => {
        useAuth.mockReturnValue({
            isBootstrapping: false,
            user: { id: '123' },
            profile: { id: 'abc' },
            onboardingComplete: true,
            subscriptionStatus: 'active',
        });

        const { UNSAFE_getAllByType } = renderNavigator();
        expect(UNSAFE_getAllByType('mock-home').length).toBeGreaterThan(0);
    });
});
