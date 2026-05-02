import { StatusBar } from 'expo-status-bar';
import { LogBox, AppState, View, StyleSheet, Text } from 'react-native';
import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react-native';
import {
    useFonts,
    DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
    Inter_700Bold, Inter_800ExtraBold, Inter_900Black,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import './src/i18n'; // Initialize i18n


// Sentry — must init before anything else
let Sentry = null;
try {
    Sentry = require('@sentry/react-native');
    const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
    if (SENTRY_DSN) {
        Sentry.init({
            dsn: SENTRY_DSN,
            environment: __DEV__ ? 'development' : 'production',
            tracesSampleRate: __DEV__ ? 1.0 : 0.2,
            beforeSend(event) {
                if (event.user) {
                    delete event.user.email;
                    delete event.user.ip_address;
                }
                return event;
            },
        });
    }
} catch (e) {
    if (__DEV__) console.warn('[Sentry] Not available:', e.message);
}

SplashScreen.preventAutoHideAsync();

LogBox.ignoreLogs([
    'Invalid DOM property `transform-origin`',
    'Unknown event handler property',
    'TouchableMixin is deprecated',
]);

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/context/AuthContext';
import { NetworkProvider } from './src/context/NetworkContext';
import SecurityProvider from './src/providers/SecurityProvider';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import analytics from './src/utils/analytics';
import * as Linking from 'expo-linking';
import { navigationRef } from './src/lib/navigationRef';

analytics.init();

const linking = {
    prefixes: [Linking.createURL('/'), 'CareMyMed-app://'],
    config: {
        screens: {
            ResetPassword: 'reset-password',
            VerifyEmail: 'verify-email',
            Login: 'login',
        },
    },
};

export default function App() {
    const [fontsLoaded] = useFonts({
        DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold,
        Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
        Inter_700Bold, Inter_800ExtraBold, Inter_900Black,
    });

    const [appState, setAppState] = useState(AppState.currentState);

    useEffect(() => {
        const sub = AppState.addEventListener('change', state => setAppState(state));
        return () => sub.remove();
    }, []);

    // Last-resort fail-safe: if the native splash is somehow never hidden
    // (e.g. AppNavigator doesn't mount, auth hangs beyond its own 6s timeout),
    // we force-hide it after 12 seconds so the user always sees something.
    // AppNavigator is the PRIMARY controller of SplashScreen.hideAsync().
    // This is purely a safety net — do not move splash hide logic here.
    useEffect(() => {
        const timer = setTimeout(() => {
            SplashScreen.hideAsync().catch(() => { });
        }, 12000);
        return () => clearTimeout(timer);
    }, []);

    // DO NOT return null here while fonts load.
    // Returning null prevents AuthProvider and AppNavigator from mounting,
    // which means AuthContext.init() never runs, isBootstrapping never becomes
    // false, and AppNavigator never calls SplashScreen.hideAsync() — the native
    // splash stays forever. The app tree must mount immediately regardless of
    // font state. If fonts aren't ready, RN falls back to system fonts briefly.
    // The native splash screen covers the UI until hideAsync() is called anyway.

    // Privacy overlay: only when fully backgrounded (task switcher).
    // 'inactive' fires on iOS when control center is pulled down — that's still
    // "in app" from the user's perspective, so we don't cover the UI then.
    const showPrivacyOverlay = appState === 'background';

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <ErrorBoundary>
                    <SecurityProvider>
                        <NetworkProvider>
                            <AuthProvider>
                                <NavigationContainer linking={linking} ref={navigationRef}>
                                    <AppNavigator fontsLoaded={fontsLoaded} />
                                    <StatusBar style="light" />
                                </NavigationContainer>
                            </AuthProvider>
                        </NetworkProvider>
                    </SecurityProvider>

                    {showPrivacyOverlay && (
                        <View style={StyleSheet.absoluteFill}>
                            <View style={styles.privacyOverlay}>
                                <ShieldCheck size={48} color="#FFFFFF" strokeWidth={1.5} />
                                <Text style={styles.privacyTitle}>CareMyMed Secure View</Text>
                                <Text style={styles.privacySubtitle}>Protecting your health data</Text>
                            </View>
                        </View>
                    )}
                </ErrorBoundary>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    privacyOverlay: {
        flex: 1,
        backgroundColor: '#0F172A',
        alignItems: 'center',
        justifyContent: 'center',
    },
    privacyTitle: {
        color: '#FFFFFF',
        fontSize: 22,
        marginTop: 16,
        fontWeight: '700',
    },
    privacySubtitle: {
        color: '#94A3B8',
        fontSize: 14,
        marginTop: 8,
    },
});