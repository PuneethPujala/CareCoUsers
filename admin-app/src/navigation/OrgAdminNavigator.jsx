import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import OrgAdminDashboard from '../screens/dashboards/OrgAdminDashboard';
import TeamListScreen from '../screens/tabs/TeamListScreen';
import PatientsListScreen from '../screens/tabs/PatientsListScreen';
import ManagerDetail from '../screens/dashboards/ManagerDetail';
import CallerDetail from '../screens/dashboards/CallerDetail';
import MentorDetail from '../screens/dashboards/MentorDetail';
import PatientDetail from '../screens/dashboards/PatientDetail';
import NotificationsScreen from '../screens/details/NotificationsScreen';
import ActivityScreen from '../screens/tabs/ActivityScreen';
import ProfileScreen from '../screens/ProfileScreen';
import CreateUserScreen from '../screens/CreateUserScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import AdminSearchScreen from '../screens/tabs/AdminSearchScreen';
import OrgDetailScreen from '../screens/details/OrgDetailScreen';

const Stack = createNativeStackNavigator();

export default function OrgAdminNavigator() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="OrgAdminDashboard" component={OrgAdminDashboard} />
            <Stack.Screen name="TeamList" component={TeamListScreen} />
            <Stack.Screen name="PatientsList" component={PatientsListScreen} />
            <Stack.Screen name="ManagerDetail" component={ManagerDetail} />
            <Stack.Screen name="CallerDetail" component={CallerDetail} />
            <Stack.Screen name="MentorDetail" component={MentorDetail} />
            <Stack.Screen name="PatientDetail" component={PatientDetail} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Activity" component={ActivityScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="CreateUser" component={CreateUserScreen} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            <Stack.Screen name="AdminSearch" component={AdminSearchScreen} />
            <Stack.Screen name="OrgDetail" component={OrgDetailScreen} />
        </Stack.Navigator>
    );
}
