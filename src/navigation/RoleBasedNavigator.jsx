import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { ProtectedRoute } from '../components/ProtectedRoute';

// Import your screen components
// These would be your actual screen components
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import RoleSelectionScreen from '../screens/auth/RoleSelectionScreen';
import EmailVerificationScreen from '../screens/auth/EmailVerificationScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

// Super Admin screens
import SuperAdminDashboard from '../screens/superAdmin/DashboardScreen';
import SuperAdminOrganizations from '../screens/superAdmin/OrganizationsScreen';
import SuperAdminUsers from '../screens/superAdmin/UsersScreen';
import SuperAdminReports from '../screens/superAdmin/ReportsScreen';
import SuperAdminSettings from '../screens/superAdmin/SettingsScreen';

// Org Admin screens
import OrgAdminDashboard from '../screens/orgAdmin/DashboardScreen';
import OrgAdminUsers from '../screens/orgAdmin/UsersScreen';
import OrgAdminPatients from '../screens/orgAdmin/PatientsScreen';
import OrgAdminReports from '../screens/orgAdmin/ReportsScreen';
import OrgAdminSettings from '../screens/orgAdmin/SettingsScreen';

// Care Manager screens
import CareManagerDashboard from '../screens/careManager/DashboardScreen';
import CareManagerCaretakers from '../screens/careManager/CaretakersScreen';
import CareManagerPatients from '../screens/careManager/PatientsScreen';
import CareManagerAssignments from '../screens/careManager/AssignmentsScreen';
import CareManagerReports from '../screens/careManager/ReportsScreen';

// Caretaker screens
import CaretakerDashboard from '../screens/caretaker/DashboardScreen';
import CaretakerPatients from '../screens/caretaker/PatientsScreen';
import CaretakerCalls from '../screens/caretaker/CallsScreen';
import CaretakerProfile from '../screens/caretaker/ProfileScreen';

// Patient Mentor screens
import MentorDashboard from '../screens/mentor/DashboardScreen';
import MentorPatients from '../screens/mentor/PatientsScreen';
import MentorMedications from '../screens/mentor/MedicationsScreen';
import MentorJournal from '../screens/mentor/JournalScreen';
import MentorProfile from '../screens/mentor/ProfileScreen';

// Patient screens
import PatientDashboard from '../screens/patient/DashboardScreen';
import PatientMedications from '../screens/patient/MedicationsScreen';
import PatientCalls from '../screens/patient/CallsScreen';
import PatientMentors from '../screens/patient/MentorsScreen';
import PatientProfile from '../screens/patient/ProfileScreen';

// Shared auth screens
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import CreateUserScreen from '../screens/CreateUserScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Auth Navigator - handles login/signup flow
const AuthNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
      <Stack.Screen name="EmailVerification" component={EmailVerificationScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
};

// Super Admin Navigator
const SuperAdminNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1F2937',
          borderTopColor: '#374151',
        },
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: '#9CA3AF',
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={SuperAdminDashboard}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            // Add your icon component here
            null
          ),
        }}
      />
      <Tab.Screen
        name="Organizations"
        component={SuperAdminOrganizations}
        options={{
          tabBarLabel: 'Organizations',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Users"
        component={SuperAdminUsers}
        options={{
          tabBarLabel: 'Users',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Reports"
        component={SuperAdminReports}
        options={{
          tabBarLabel: 'Reports',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SuperAdminSettings}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
    </Tab.Navigator>
  );
};

// Org Admin Navigator
const OrgAdminNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1F2937',
          borderTopColor: '#374151',
        },
        tabBarActiveTintColor: '#10B981',
        tabBarInactiveTintColor: '#9CA3AF',
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={OrgAdminDashboard}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Users"
        component={OrgAdminUsers}
        options={{
          tabBarLabel: 'Users',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Patients"
        component={OrgAdminPatients}
        options={{
          tabBarLabel: 'Patients',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Reports"
        component={OrgAdminReports}
        options={{
          tabBarLabel: 'Reports',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={OrgAdminSettings}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
    </Tab.Navigator>
  );
};

// Care Manager Navigator
const CareManagerNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1F2937',
          borderTopColor: '#374151',
        },
        tabBarActiveTintColor: '#8B5CF6',
        tabBarInactiveTintColor: '#9CA3AF',
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={CareManagerDashboard}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Caretakers"
        component={CareManagerCaretakers}
        options={{
          tabBarLabel: 'Caretakers',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Patients"
        component={CareManagerPatients}
        options={{
          tabBarLabel: 'Patients',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Assignments"
        component={CareManagerAssignments}
        options={{
          tabBarLabel: 'Assignments',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Reports"
        component={CareManagerReports}
        options={{
          tabBarLabel: 'Reports',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
    </Tab.Navigator>
  );
};

// Caretaker Navigator
const CaretakerNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1F2937',
          borderTopColor: '#374151',
        },
        tabBarActiveTintColor: '#F59E0B',
        tabBarInactiveTintColor: '#9CA3AF',
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={CaretakerDashboard}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Patients"
        component={CaretakerPatients}
        options={{
          tabBarLabel: 'Patients',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Calls"
        component={CaretakerCalls}
        options={{
          tabBarLabel: 'Calls',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={CaretakerProfile}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
    </Tab.Navigator>
  );
};

// Patient Mentor Navigator
const MentorNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1F2937',
          borderTopColor: '#374151',
        },
        tabBarActiveTintColor: '#EC4899',
        tabBarInactiveTintColor: '#9CA3AF',
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={MentorDashboard}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Patients"
        component={MentorPatients}
        options={{
          tabBarLabel: 'Patients',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Medications"
        component={MentorMedications}
        options={{
          tabBarLabel: 'Medications',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Journal"
        component={MentorJournal}
        options={{
          tabBarLabel: 'Journal',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={MentorProfile}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
    </Tab.Navigator>
  );
};

// Patient Navigator
const PatientNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1F2937',
          borderTopColor: '#374151',
        },
        tabBarActiveTintColor: '#06B6D4',
        tabBarInactiveTintColor: '#9CA3AF',
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={PatientDashboard}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Medications"
        component={PatientMedications}
        options={{
          tabBarLabel: 'Medications',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Calls"
        component={PatientCalls}
        options={{
          tabBarLabel: 'Calls',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Mentors"
        component={PatientMentors}
        options={{
          tabBarLabel: 'Mentors',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={PatientProfile}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => null,
        }}
      />
    </Tab.Navigator>
  );
};

// Main Role-Based Navigator
const RoleBasedNavigator = () => {
  const { profile, initializing, loading, mustChangePassword } = useAuth();

  // Show loading screen while initializing
  if (initializing || loading) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="Loading"
          component={() => (
            <View className="flex-1 justify-center items-center bg-gray-50">
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text className="mt-4 text-gray-600 font-medium">Loading...</Text>
            </View>
          )}
        />
      </Stack.Navigator>
    );
  }

  // If no profile, show auth navigator
  if (!profile) {
    return <AuthNavigator />;
  }

  // Intercept: force password change before any dashboard access
  if (mustChangePassword) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="ForcedPasswordChange"
          component={ChangePasswordScreen}
          initialParams={{ forced: true }}
        />
      </Stack.Navigator>
    );
  }

  // Return appropriate navigator based on role
  switch (profile.role) {
    case 'super_admin':
      return (
        <ProtectedRoute>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="SuperAdminTabs" component={SuperAdminNavigator} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            <Stack.Screen name="CreateUser" component={CreateUserScreen} />
          </Stack.Navigator>
        </ProtectedRoute>
      );

    case 'org_admin':
      return (
        <ProtectedRoute allowedRoles={['org_admin']}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="OrgAdminTabs" component={OrgAdminNavigator} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            <Stack.Screen name="CreateUser" component={CreateUserScreen} />
          </Stack.Navigator>
        </ProtectedRoute>
      );

    case 'care_manager':
      return (
        <ProtectedRoute allowedRoles={['care_manager']}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="CareManagerTabs" component={CareManagerNavigator} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            <Stack.Screen name="CreateUser" component={CreateUserScreen} />
          </Stack.Navigator>
        </ProtectedRoute>
      );

    case 'caretaker':
    case 'caller':
      return (
        <ProtectedRoute allowedRoles={['caretaker', 'caller']}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="CaretakerTabs" component={CaretakerNavigator} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
          </Stack.Navigator>
        </ProtectedRoute>
      );

    case 'patient_mentor':
    case 'mentor':
      return (
        <ProtectedRoute allowedRoles={['patient_mentor', 'mentor']}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="MentorTabs" component={MentorNavigator} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
          </Stack.Navigator>
        </ProtectedRoute>
      );

    case 'patient':
      return (
        <ProtectedRoute allowedRoles={['patient']}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="PatientTabs" component={PatientNavigator} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
          </Stack.Navigator>
        </ProtectedRoute>
      );

    default:
      // Unknown role - show role selection or error
      return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="RoleSelection"
            component={RoleSelectionScreen}
          />
        </Stack.Navigator>
      );
  }
};

export default RoleBasedNavigator;
