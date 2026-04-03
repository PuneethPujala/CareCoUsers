import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, Pressable, Animated, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LayoutDashboard, Users, Pill, ShieldPlus, UserCircle, Menu, Bell } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

// Onboarding screens
import SplashScreen from '../screens/onboarding/SplashScreen';
import PatientSignupScreen from '../screens/onboarding/PatientSignupScreen';
import LoginScreen from '../screens/onboarding/LoginScreen';
import ResetPasswordScreen from '../screens/onboarding/ResetPasswordScreen';
import VerifyEmailScreen from '../screens/onboarding/VerifyEmailScreen';

// Patient screens
import PatientHomeScreen from '../screens/patient/HomeScreen';
import MyCallerScreen from '../screens/patient/MyCallerScreen';
import MedicationsScreen from '../screens/patient/MedicationsScreen';
import HealthProfileScreen from '../screens/patient/HealthProfileScreen';
import NotificationsScreen from '../screens/patient/NotificationsScreen';
import PatientProfileScreen from '../screens/patient/ProfileScreen';
import SubscribePlansScreen from '../screens/patient/SubscribePlansScreen';
import PaymentScreen from '../screens/patient/PaymentScreen';
import WaitingScreen from '../screens/patient/WaitingScreen';
import VitalsHistoryScreen from '../screens/patient/VitalsHistoryScreen';
import LocationSearchScreen from '../screens/patient/LocationSearchScreen';
import AddAddressScreen from '../screens/patient/AddAddressScreen';

// Caller screens
import CallerHomeScreen from '../screens/caller/HomeScreen';
import CallerPatientsScreen from '../screens/caller/PatientsScreen';
import ActivityFeedScreen from '../screens/caller/ActivityFeedScreen';
import CallerProfileScreen from '../screens/caller/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TabIconWrapper = ({ focused, IconConfig }) => {
    const scaleAnim = useRef(new Animated.Value(focused ? 1 : 0.9)).current;

    useEffect(() => {
        Animated.spring(scaleAnim, {
            toValue: focused ? 1 : 0.9,
            friction: 6,
            useNativeDriver: true,
        }).start();
    }, [focused]);

    return (
        <Animated.View style={[
            styles.tabSlot,
            focused && styles.tabSlotActive,
            { transform: [{ scale: scaleAnim }] }
        ]}>
            <IconConfig
                color={focused ? '#FFFFFF' : '#94A3B8'}
                size={24}
                strokeWidth={focused ? 2.5 : 2}
            />
        </Animated.View>
    );
};

const tabScreenOptions = {
    headerShown: false,
    tabBarShowLabel: false,
    tabBarStyle: {
        backgroundColor: '#FFFFFF',
        position: 'absolute',
        bottom: 24,
        marginHorizontal: '7.5%', // Center the floating pill (100% - 85%) / 2
        borderRadius: 32,
        borderTopWidth: 0,
        height: 64,
        elevation: 12,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        borderWidth: 1,
        borderColor: '#F1F5F9', // Slightly softer border
        paddingBottom: 0,
        paddingTop: 0,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center', // Center the content group
    },
};


function PatientTabNavigator() {
    return (
        <Tab.Navigator screenOptions={tabScreenOptions}>
            <Tab.Screen name="PatientHome" component={PatientHomeScreen} options={{ tabBarIcon: ({ focused }) => <TabIconWrapper focused={focused} IconConfig={LayoutDashboard} /> }} />
            <Tab.Screen name="MyCaller" component={MyCallerScreen} options={{ tabBarIcon: ({ focused }) => <TabIconWrapper focused={focused} IconConfig={Users} /> }} />
            <Tab.Screen name="Medications" component={MedicationsScreen} options={{ tabBarIcon: ({ focused }) => <TabIconWrapper focused={focused} IconConfig={Pill} /> }} />
            <Tab.Screen name="HealthProfile" component={HealthProfileScreen} options={{ tabBarIcon: ({ focused }) => <TabIconWrapper focused={focused} IconConfig={ShieldPlus} /> }} />
            <Tab.Screen name="Profile" component={PatientProfileScreen} options={{ tabBarIcon: ({ focused }) => <TabIconWrapper focused={focused} IconConfig={UserCircle} /> }} />
        </Tab.Navigator>
    );
}

function CallerTabNavigator() {
    return (
        <Tab.Navigator screenOptions={tabScreenOptions}>
            <Tab.Screen name="CallerHome" component={CallerHomeScreen} options={{ tabBarIcon: ({ focused }) => <TabIconWrapper focused={focused} IconConfig={LayoutDashboard} /> }} />
            <Tab.Screen name="CallerPatients" component={CallerPatientsScreen} options={{ tabBarIcon: ({ focused }) => <TabIconWrapper focused={focused} IconConfig={Users} /> }} />
            <Tab.Screen name="ActivityFeed" component={ActivityFeedScreen} options={{ tabBarIcon: ({ focused }) => <TabIconWrapper focused={focused} IconConfig={ShieldPlus} /> }} />
            <Tab.Screen name="CallerProfile" component={CallerProfileScreen} options={{ tabBarIcon: ({ focused }) => <TabIconWrapper focused={focused} IconConfig={Menu} /> }} />
        </Tab.Navigator>
    );
}

function LoadingScreen() {
    return (
        <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Configuring your experience...</Text>
        </View>
    );
}

// 1. Logged out flow
const AuthStack = () => (
    <Stack.Navigator
        screenOptions={{
            headerShown: false,
            animation: 'fade',
            animationDuration: 300,
        }}
        initialRouteName="Login"
    >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="PatientSignup" component={PatientSignupScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
    </Stack.Navigator>
);


// 2. Patient already has account but needs setup/payment
const PatientOnboardingStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="PatientSignupOnboarding" component={PatientSignupScreen} initialParams={{ step: 2 }} />
    </Stack.Navigator>
);

// 3. Fully authenticated dashboard
const MainAppStack = ({ isCaller }) => (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {isCaller ? (
            <Stack.Screen name="CallerTabs" component={CallerTabNavigator} />
        ) : (
            <>
                <Stack.Screen name="PatientTabs" component={PatientTabNavigator} />
                <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ presentation: 'modal' }} />
                <Stack.Screen name="VitalsHistory" component={VitalsHistoryScreen} />
                <Stack.Screen name="LocationSearch" component={LocationSearchScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                <Stack.Screen name="AddAddress" component={AddAddressScreen} options={{ presentation: 'modal' }} />
                <Stack.Screen name="SubscribePlans" component={SubscribePlansScreen} />
                <Stack.Screen name="Payment" component={PaymentScreen} />
                <Stack.Screen name="WaitingRoom" component={WaitingScreen} />
            </>
        )}
    </Stack.Navigator>
);

export default function AppNavigator() {
    const { initializing, isAuthenticated, userRole, user, profile } = useAuth();
    const isCaller = userRole === 'caretaker' || userRole === 'caller';
    const [splashDone, setSplashDone] = useState(false);

    if (!splashDone) {
        return <SplashScreen onFinish={() => setSplashDone(true)} />;
    }

    if (initializing) {
        return <LoadingScreen />;
    }

    // Branch 1: No User -> Auth Flow
    if (!user) {
        return <AuthStack />;
    }

    // Branch 2: User is set but profile not loaded yet (e.g. mid-Google-auth, or fetching profile)
    // Just show loading — the auth flow handles rejection of unregistered users
    if (!profile) {
        return <LoadingScreen />;
    }

    // Branch 3: Patient in Onboarding/Payment flow
    // isAuthenticated is true ONLY if !isOnboarding
    if (!isAuthenticated && userRole === 'patient') {
        return <PatientOnboardingStack />;
    }

    // Branch 4: Ready for Dashboard
    return <MainAppStack isCaller={isCaller} />;
}

const styles = StyleSheet.create({
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    loadingText: { color: colors.primary, marginTop: 12, fontSize: 16, fontWeight: '500' },

    tabSlot: {
        width: 50,
        height: 50,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 8, // Ensure spacing between centered items
    },
    tabSlotActive: {
        backgroundColor: '#3A86FF',
        shadowColor: '#3A86FF',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 10,
    },
});

