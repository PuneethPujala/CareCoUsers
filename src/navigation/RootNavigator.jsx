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
    const { isAuthenticated, isLoading, user } = useAuth();

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.white }}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!isAuthenticated ? (
                <Stack.Screen name="Auth" component={AuthNavigator} />
            ) : user?.role === 'org_admin' ? (
                <Stack.Screen name="OrgAdmin" component={OrgAdminNavigator} />
            ) : (
                <Stack.Screen name="Dashboard" component={DashboardNavigator} />
            )}
        </Stack.Navigator>
    );
}
