import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';
import { Colors } from '../theme/colors';

import AuthNavigator from './AuthNavigator';
import DashboardNavigator from './DashboardNavigator';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import PhoneVerificationScreen from '../screens/PhoneVerificationScreen';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
    const { profile, initializing, mustChangePassword, mustVerifyPhone } = useAuth();

    if (initializing) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.white }}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!profile ? (
                <Stack.Screen name="Auth" component={AuthNavigator} />
            ) : mustVerifyPhone ? (
                /* Gate 1: Phone verification first (session stays alive) */
                <Stack.Screen 
                    name="ForcePhoneVerification" 
                    component={PhoneVerificationScreen} 
                />
            ) : mustChangePassword ? (
                /* Gate 2: Password change second (Supabase auto-invalidates token → auto-logout) */
                <Stack.Screen 
                    name="ForceChangePassword" 
                    component={ChangePasswordScreen} 
                    initialParams={{ forced: true }}
                />
            ) : (
                <Stack.Screen name="Dashboard" component={DashboardNavigator} />
            )}
        </Stack.Navigator>
    );
}
