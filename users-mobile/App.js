import { StatusBar } from 'expo-status-bar';
import { LogBox, Platform, AppState, View, StyleSheet, Text } from 'react-native';
import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react-native';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, Inter_900Black } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';

// §SEC: Sentry crash reporting — must init before other code
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
    console.warn('[Sentry] Not available:', e.message);
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
        DMSans_400Regular,
        DMSans_500Medium,
        DMSans_600SemiBold,
        DMSans_700Bold,
        Inter_400Regular,
        Inter_500Medium,
        Inter_600SemiBold,
        Inter_700Bold,
        Inter_800ExtraBold,
        Inter_900Black,
    });

    const [appState, setAppState] = useState(AppState.currentState);

    useEffect(() => {
        const sub = AppState.addEventListener('change', state => setAppState(state));
        return () => sub.remove();
    }, []);

    if (!fontsLoaded) return null;

    // BUG 9 FIX: The original used appState !== 'active', which also matched
    // 'inactive'. On iOS, 'inactive' fires briefly when the control center or
    // notification shade is pulled down — the user is still in the app and sees
    // the privacy overlay flash unexpectedly. 'background' is the correct state
    // for when the app is genuinely hidden in the task switcher.
    const showPrivacyOverlay = appState === 'background';

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <ErrorBoundary>
                    <SecurityProvider>
                        <NetworkProvider>
                            <AuthProvider>
                                <NavigationContainer linking={linking} ref={navigationRef}>
                                    <AppNavigator />
                                    <StatusBar style="light" />
                                </NavigationContainer>
                            </AuthProvider>
                        </NetworkProvider>
                    </SecurityProvider>

                    {/* SEC-FIX-8: Task Switcher Data Privacy Overlay.
                        Only shown when appState === 'background' (not 'inactive') so
                        pulling down the iOS control center doesn't flash this screen. */}
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