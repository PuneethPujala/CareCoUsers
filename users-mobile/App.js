import { StatusBar } from 'expo-status-bar';
import { LogBox, Platform, AppState, View, StyleSheet, Text } from 'react-native';
import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react-native';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, Inter_900Black } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';

// §SEC: Sentry crash reporting (Audit 9.2) — must init before other code
let Sentry = null;
try {
    Sentry = require('@sentry/react-native');
    const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
    if (SENTRY_DSN) {
        Sentry.init({
            dsn: SENTRY_DSN,
            environment: __DEV__ ? 'development' : 'production',
            tracesSampleRate: __DEV__ ? 1.0 : 0.2,
            // Strip PII from crash reports (Audit 9.2)
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

// Ignore specific warnings caused by react-native-chart-kit on Web
LogBox.ignoreLogs([
    'Invalid DOM property `transform-origin`',
    'Unknown event handler property',
    'TouchableMixin is deprecated',
]);
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './src/context/AuthContext';
import { NetworkProvider } from './src/context/NetworkContext';
import SecurityProvider from './src/providers/SecurityProvider';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import analytics from './src/utils/analytics';
import * as Linking from 'expo-linking';

// §15: Initialize analytics on app start
analytics.init();

// §7+§6: Deep link configuration for password reset and email verification
const linking = {
    prefixes: [Linking.createURL('/'), 'careco-app://'],
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

    useEffect(() => {
        if (fontsLoaded) {
            SplashScreen.hideAsync().catch(() => {});
        }
    }, [fontsLoaded]);

    if (!fontsLoaded) return null;

    const showPrivacyOverlay = appState !== 'active';

    return (
        <SafeAreaProvider>
            <ErrorBoundary>
            <SecurityProvider>
                <NetworkProvider>
                    <AuthProvider>
                        <NavigationContainer linking={linking}>
                            <AppNavigator />
                            <StatusBar style="light" />
                        </NavigationContainer>
                    </AuthProvider>
                </NetworkProvider>
            </SecurityProvider>
                
                {/* SEC-FIX-8: Task Switcher Data Privacy Overlay */}
                {showPrivacyOverlay && (
                    <View style={StyleSheet.absoluteFill}>
                        <View style={{flex: 1, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center'}}>
                            <ShieldCheck color="#3B82F6" size={64} />
                            <Text style={{color: '#FFFFFF', fontSize: 22, marginTop: 16, fontWeight: '700'}}>CareCo Secure View</Text>
                            <Text style={{color: '#94A3B8', fontSize: 14, marginTop: 8}}>Protecting your health data</Text>
                        </View>
                    </View>
                )}
            </ErrorBoundary>
        </SafeAreaProvider>
    );
}
