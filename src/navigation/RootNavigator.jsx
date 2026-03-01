import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';
import { Colors } from '../theme/colors';

import AuthNavigator from './AuthNavigator';
import DashboardNavigator from './DashboardNavigator';
import OrgAdminNavigator from './OrgAdminNavigator';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
    const { profile, initializing, loading } = useAuth();

    if (initializing || loading) {
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
            ) : profile.role === 'org_admin' ? (
                <Stack.Screen name="OrgAdmin" component={OrgAdminNavigator} />
            ) : (
                <Stack.Screen name="Dashboard" component={DashboardNavigator} />
            )}
        </Stack.Navigator>
    );
}
