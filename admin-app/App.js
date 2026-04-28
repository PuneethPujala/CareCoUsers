import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { LogBox, View, Text } from 'react-native';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import SplashScreen from './src/screens/SplashScreen';

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

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Hide native splash when our custom one mounts
    try {
      const ExpoSplash = require('expo-splash-screen');
      ExpoSplash.hideAsync().catch(() => {});
    } catch (e) {}
  }, []);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  if (showSplash) {
    return (
      <ErrorBoundary>
        <SplashScreen onFinish={handleSplashFinish} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer>
            <RootNavigator />
            <StatusBar style="auto" />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
