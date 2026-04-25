import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors, Shadows } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

/* Dashboards */
import FloatingBottomNav from '../components/premium/FloatingBottomNav';
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
import OrganizationsListScreen from '../screens/tabs/OrganizationsListScreen';
import AdminSearchScreen from '../screens/tabs/AdminSearchScreen';
import ProfileScreen from '../screens/ProfileScreen';

/* Detail Screens */
import PatientDetailScreen from '../screens/details/PatientDetailScreen';
import CallerDetailScreen from '../screens/details/CallerDetailScreen';
import OrgDetailScreen from '../screens/details/OrgDetailScreen';
import ManagerDetailScreen from '../screens/details/ManagerDetailScreen';
import ActiveCallScreen from '../screens/details/ActiveCallScreen';
import NotificationsScreen from '../screens/details/NotificationsScreen';
import EmergencyScreen from '../screens/details/EmergencyScreen';
import OrgAdminDetailScreen from '../screens/details/OrgAdminDetailScreen';

/* Create User / Change Password */
import CreateUserScreen from '../screens/CreateUserScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import CreateOrganizationScreen from '../screens/CreateOrganizationScreen';

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
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4 }}>
            <Feather 
                name={icon} 
                size={22} 
                color={focused ? Colors.primary : Colors.textMuted} 
            />
        </View>
    );
}

function DashboardTabs() {
    const { profile } = useAuth();
    const currentRole = profile?.role || 'caller';
    const DashboardComponent = dashboardMap[currentRole] || CallerDashboard;

    const tabConfigs = {
        caller: [
            { name: 'Home', icon: 'home', component: DashboardComponent },
            { name: 'Patients', icon: 'users', component: PatientsListScreen },
            { name: 'History', icon: 'clipboard', component: CallHistoryScreen },
            { name: 'Profile', icon: 'user', component: ProfileScreen },
        ],
        care_manager: [
            { name: 'Dashboard', icon: 'pie-chart', component: DashboardComponent },
            { name: 'Team', icon: 'users', component: TeamListScreen },
            { name: 'Reports', icon: 'trending-up', component: ReportsScreen },
            { name: 'Profile', icon: 'user', component: ProfileScreen },
        ],
        org_admin: [
            { name: 'Dashboard', icon: 'grid', component: DashboardComponent },
            { name: 'Patients', icon: 'activity', component: PatientsListScreen },
            { name: 'Team', icon: 'briefcase', component: TeamListScreen },
            { name: 'Profile', icon: 'user', component: ProfileScreen },
        ],
        default: [
            { name: 'Dashboard', icon: 'home', component: DashboardComponent },
            { name: 'Activity', icon: 'activity', component: ActivityScreen },
            { name: 'Profile', icon: 'user', component: ProfileScreen },
        ],
    };

    const tabs = tabConfigs[currentRole] || tabConfigs.default;

    return (
        <Tab.Navigator
            tabBar={props => <FloatingBottomNav {...props} />}
            screenOptions={{
                headerShown: false,
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
            <Stack.Screen name="OrgAdminDetail" component={OrgAdminDetailScreen} />
            <Stack.Screen name="ActiveCall" component={ActiveCallScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Emergency" component={EmergencyScreen} />
            <Stack.Screen name="CreateUser" component={CreateUserScreen} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            <Stack.Screen name="CreateOrganization" component={CreateOrganizationScreen} />
            <Stack.Screen name="PatientsList" component={PatientsListScreen} />
            <Stack.Screen name="TeamList" component={TeamListScreen} />
            <Stack.Screen name="OrganizationsList" component={OrganizationsListScreen} />
            <Stack.Screen name="AdminSearch" component={AdminSearchScreen} />
        </Stack.Navigator>
    );
}
