import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import OrgAdminDashboard from '../screens/dashboards/OrgAdminDashboard';
import CareManagersList from '../screens/dashboards/CareManagersList';
import CallersList from '../screens/dashboards/CallersList';
import PatientMentorsList from '../screens/dashboards/PatientMentorsList';
import PatientsList from '../screens/dashboards/PatientsList';
import ManagerDetail from '../screens/dashboards/ManagerDetail';
import CallerDetail from '../screens/dashboards/CallerDetail';
import MentorDetail from '../screens/dashboards/MentorDetail';
import PatientDetail from '../screens/dashboards/PatientDetail';
import NotificationsScreen from '../screens/details/NotificationsScreen';
import ActivityScreen from '../screens/tabs/ActivityScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Stack = createNativeStackNavigator();

export default function OrgAdminNavigator() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="OrgAdminDashboard" component={OrgAdminDashboard} />
            <Stack.Screen name="CareManagersList" component={CareManagersList} />
            <Stack.Screen name="CallersList" component={CallersList} />
            <Stack.Screen name="PatientMentorsList" component={PatientMentorsList} />
            <Stack.Screen name="PatientsList" component={PatientsList} />
            <Stack.Screen name="ManagerDetail" component={ManagerDetail} />
            <Stack.Screen name="CallerDetail" component={CallerDetail} />
            <Stack.Screen name="MentorDetail" component={MentorDetail} />
            <Stack.Screen name="PatientDetail" component={PatientDetail} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Activity" component={ActivityScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
        </Stack.Navigator>
    );
}
