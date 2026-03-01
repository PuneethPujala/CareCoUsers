import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, View } from 'react-native';
import { Colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

/* Dashboards */
import SuperAdminDashboard from '../screens/dashboards/SuperAdminDashboard';
import OrgAdminDashboard from '../screens/dashboards/OrgAdminDashboard';
import CareManagerDashboard from '../screens/dashboards/CareManagerDashboard';
import CallerDashboard from '../screens/dashboards/CallerDashboard';
import MentorDashboard from '../screens/dashboards/MentorDashboard';
import PatientDashboard from '../screens/dashboards/PatientDashboard';

/* Tab Screens */
import PatientsListScreen from '../screens/tabs/PatientsListScreen';
import CallHistoryScreen from '../screens/tabs/CallHistoryScreen';
import TeamListScreen from '../screens/tabs/TeamListScreen';
import ReportsScreen from '../screens/tabs/ReportsScreen';
import ActivityScreen from '../screens/tabs/ActivityScreen';
import ProfileScreen from '../screens/ProfileScreen';

/* Detail Screens */
import PatientDetailScreen from '../screens/details/PatientDetailScreen';
import CallerDetailScreen from '../screens/details/CallerDetailScreen';
import OrgDetailScreen from '../screens/details/OrgDetailScreen';
import ManagerDetailScreen from '../screens/details/ManagerDetailScreen';
import ActiveCallScreen from '../screens/details/ActiveCallScreen';
import NotificationsScreen from '../screens/details/NotificationsScreen';
import EmergencyScreen from '../screens/details/EmergencyScreen';

/* Create User / Change Password */
import CreateUserScreen from '../screens/CreateUserScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const dashboardMap = {
    super_admin: SuperAdminDashboard,
    org_admin: OrgAdminDashboard,
    care_manager: CareManagerDashboard,
    caller: CallerDashboard,
    mentor: MentorDashboard,
    patient: PatientDashboard,
};

function TabIcon({ icon, focused }) {
    return (
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{icon}</Text>
        </View>
    );
}

function DashboardTabs() {
    const { profile } = useAuth();
    const currentRole = profile?.role || 'caller';
    const DashboardComponent = dashboardMap[currentRole] || CallerDashboard;

    const tabConfigs = {
        caller: [
            { name: 'Home', icon: '🏠', component: DashboardComponent },
            { name: 'Patients', icon: '👥', component: PatientsListScreen },
            { name: 'History', icon: '📋', component: CallHistoryScreen },
            { name: 'Profile', icon: '👤', component: ProfileScreen },
        ],
        care_manager: [
            { name: 'Dashboard', icon: '📊', component: DashboardComponent },
            { name: 'Team', icon: '👥', component: TeamListScreen },
            { name: 'Reports', icon: '📈', component: ReportsScreen },
            { name: 'Profile', icon: '👤', component: ProfileScreen },
        ],
        default: [
            { name: 'Dashboard', icon: '🏠', component: DashboardComponent },
            { name: 'Activity', icon: '📋', component: ActivityScreen },
            { name: 'Profile', icon: '👤', component: ProfileScreen },
        ],
    };

    const tabs = tabConfigs[currentRole] || tabConfigs.default;

    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: Colors.white,
                    borderTopWidth: 1,
                    borderTopColor: Colors.borderLight,
                    height: 64,
                    paddingBottom: 8,
                    paddingTop: 8,
                },
                tabBarActiveTintColor: Colors.primary,
                tabBarInactiveTintColor: Colors.textMuted,
                tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
            }}
        >
            {tabs.map((tab) => (
                <Tab.Screen
                    key={tab.name}
                    name={tab.name}
                    component={tab.component}
                    options={{ tabBarIcon: ({ focused }) => <TabIcon icon={tab.icon} focused={focused} /> }}
                />
            ))}
        </Tab.Navigator>
    );
}

export default function DashboardNavigator() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="DashboardTabs" component={DashboardTabs} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Activity" component={ActivityScreen} />
            <Stack.Screen name="PatientDetail" component={PatientDetailScreen} />
            <Stack.Screen name="CallerDetail" component={CallerDetailScreen} />
            <Stack.Screen name="OrgDetail" component={OrgDetailScreen} />
            <Stack.Screen name="ManagerDetail" component={ManagerDetailScreen} />
            <Stack.Screen name="ActiveCall" component={ActiveCallScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Emergency" component={EmergencyScreen} />
            <Stack.Screen name="CreateUser" component={CreateUserScreen} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
        </Stack.Navigator>
    );
}
