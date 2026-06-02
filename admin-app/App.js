import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { LogBox, View, Text } from 'react-native';
import Toast, { BaseToast, ErrorToast } from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import SplashScreen from './src/screens/SplashScreen';
import { setupNotificationListeners, removeNotificationListeners } from './src/services/pushNotifications';

// Try to use expo-splash-screen but don't crash if it fails
try {
  const ExpoSplash = require('expo-splash-screen');
  ExpoSplash.preventAutoHideAsync().catch(() => {});
} catch (e) {
  // expo-splash-screen not available — safe to ignore
}

LogBox.ignoreLogs([
  'AuthApiError: Invalid Refresh Token',
  'AuthApiError: Invalid Refresh Token: Refresh Token Not Found',
  'Encountered two children with the same key'
]);

// Error boundary to catch any crash and show fallback instead of closing
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A1628', padding: 24 }}>
          <Text style={{ color: '#EF4444', fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Something went wrong</Text>
          <Text style={{ color: '#94A3B8', fontSize: 14, textAlign: 'center' }}>{String(this.state.error?.message || 'Unknown error')}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ── Custom Toast Configuration ──
const toastConfig = {
  success: (props) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: '#10B981', backgroundColor: '#0F172A', borderRadius: 16, height: 'auto', paddingVertical: 12, shadowColor: '#10B981', shadowOpacity: 0.2, shadowRadius: 10, elevation: 5, minHeight: 70 }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{ fontSize: 16, fontWeight: '800', color: '#F8FAFC', marginBottom: 4 }}
      text2Style={{ fontSize: 14, fontWeight: '500', color: '#CBD5E1' }}
      text1NumberOfLines={2}
      text2NumberOfLines={3}
    />
  ),
  error: (props) => (
    <ErrorToast
      {...props}
      style={{ borderLeftColor: '#EF4444', backgroundColor: '#0F172A', borderRadius: 16, height: 'auto', paddingVertical: 12, shadowColor: '#EF4444', shadowOpacity: 0.3, shadowRadius: 10, elevation: 5, minHeight: 70 }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{ fontSize: 16, fontWeight: '800', color: '#F8FAFC', marginBottom: 4 }}
      text2Style={{ fontSize: 14, fontWeight: '500', color: '#CBD5E1' }}
      text1NumberOfLines={2}
      text2NumberOfLines={3}
    />
  ),
  info: (props) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: '#6366F1', backgroundColor: '#0F172A', borderRadius: 16, height: 'auto', paddingVertical: 12, shadowColor: '#6366F1', shadowOpacity: 0.2, shadowRadius: 10, elevation: 5, minHeight: 70 }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{ fontSize: 16, fontWeight: '800', color: '#F8FAFC', marginBottom: 4 }}
      text2Style={{ fontSize: 14, fontWeight: '500', color: '#CBD5E1' }}
      text1NumberOfLines={2}
      text2NumberOfLines={3}
    />
  )
};

export default function App() {
  const navigationRef = useRef(null);

  useEffect(() => {
    // Hide native splash when our custom one mounts
    try {
      const ExpoSplash = require('expo-splash-screen');
      ExpoSplash.hideAsync().catch(() => {});
    } catch (e) {}
  }, []);

  // Set up push notification tap listener
  useEffect(() => {
    setupNotificationListeners(navigationRef);
    return () => removeNotificationListeners();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer ref={navigationRef}>
            <RootNavigator />
            <StatusBar style="auto" />
          </NavigationContainer>
        </AuthProvider>
        <Toast config={toastConfig} />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
