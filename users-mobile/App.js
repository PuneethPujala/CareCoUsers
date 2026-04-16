import { StatusBar } from 'expo-status-bar';
import { LogBox, Platform } from 'react-native';
import React, { useEffect } from 'react';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, Inter_900Black } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';

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
import AppNavigator from './src/navigation/AppNavigator';
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

    useEffect(() => {
        if (fontsLoaded) {
            SplashScreen.hideAsync().catch(() => {});
        }
    }, [fontsLoaded]);

    if (!fontsLoaded) return null;

    return (
        <SafeAreaProvider>
            <NetworkProvider>
                <AuthProvider>
                    <NavigationContainer linking={linking}>
                        <AppNavigator />
                        <StatusBar style="light" />
                    </NavigationContainer>
                </AuthProvider>
            </NetworkProvider>
        </SafeAreaProvider>
    );
}
