import React, { useEffect, useRef, useState } from "react";
import * as Notifications from 'expo-notifications';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    ActivityIndicator,
    TouchableOpacity,
} from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
    LayoutDashboard,
    Users,
    Pill,
    ShieldPlus,
    UserCircle,
    Menu,
} from "lucide-react-native";
import { useAuth } from "../context/AuthContext";
import { sendDailyWelcomeNotification, registerForPushNotificationsAsync, sendSeamlessExperienceNotification } from "../utils/notifications";
import { apiService } from "../lib/api";
import { colors } from "../theme";

// Onboarding screens
import SplashScreen from "../screens/onboarding/SplashScreen";
import PatientSignupScreen from "../screens/onboarding/PatientSignupScreen";
import LoginScreen from "../screens/onboarding/LoginScreen";
import ResetPasswordScreen from "../screens/onboarding/ResetPasswordScreen";
import VerifyEmailScreen from "../screens/onboarding/VerifyEmailScreen";

// Patient screens
import PatientHomeScreen from "../screens/patient/HomeScreen";
import MyCallerScreen from "../screens/patient/MyCallerScreen";
import MedicationsScreen from "../screens/patient/MedicationsScreen";
import HealthProfileScreen from "../screens/patient/HealthProfileScreen";
import NotificationsScreen from "../screens/patient/NotificationsScreen";
import PatientProfileScreen from "../screens/patient/ProfileScreen";
import SubscribePlansScreen from "../screens/patient/SubscribePlansScreen";
import PaymentScreen from "../screens/patient/PaymentScreen";
import WaitingScreen from "../screens/patient/WaitingScreen";
import VitalsHistoryScreen from "../screens/patient/VitalsHistoryScreen";
import LocationSearchScreen from "../screens/patient/LocationSearchScreen";
import AddAddressScreen from "../screens/patient/AddAddressScreen";

// Caller screens
import CallerHomeScreen from "../screens/caller/HomeScreen";
import CallerPatientsScreen from "../screens/caller/PatientsScreen";
import ActivityFeedScreen from "../screens/caller/ActivityFeedScreen";
import CallerProfileScreen from "../screens/caller/ProfileScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_BOTTOM = 24;
export const TAB_BAR_CLEARANCE = TAB_BAR_HEIGHT + TAB_BAR_BOTTOM + 16;

// ── Fully custom tab bar — bypasses RN Navigation's internal layout ──
function CustomTabBar({ state, descriptors, navigation }) {
    return (
        <View style={styles.tabBarContainer}>
            {state.routes.map((route, index) => {
                const { options } = descriptors[route.key];
                const focused = state.index === index;

                const onPress = () => {
                    const event = navigation.emit({
                        type: "tabPress",
                        target: route.key,
                        canPreventDefault: true,
                    });
                    if (!focused && !event.defaultPrevented) {
                        navigation.navigate(route.name);
                    }
                };

                const IconComponent = options.tabBarIconComponent;

                return (
                    <TouchableOpacity
                        key={route.key}
                        onPress={onPress}
                        style={styles.tabItem}
                        activeOpacity={0.7}
                    >
                        <TabSlot focused={focused} IconConfig={IconComponent} />
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

function TabSlot({ focused, IconConfig }) {
    const scaleAnim = useRef(new Animated.Value(focused ? 1 : 0.9)).current;

    useEffect(() => {
        Animated.spring(scaleAnim, {
            toValue: focused ? 1 : 0.9,
            friction: 6,
            useNativeDriver: true,
        }).start();
    }, [focused]);

    return (
        <Animated.View
            style={[
                styles.tabSlot,
                focused && styles.tabSlotActive,
                { transform: [{ scale: scaleAnim }] },
            ]}
        >
            <IconConfig
                color={focused ? "#FFFFFF" : "#94A3B8"}
                size={20}
                strokeWidth={focused ? 2.5 : 2}
            />
        </Animated.View>
    );
}

function PatientTabNavigator() {
    return (
        <Tab.Navigator
            tabBar={(props) => <CustomTabBar {...props} />}
            screenOptions={{ headerShown: false }}
        >
            <Tab.Screen
                name="PatientHome"
                component={PatientHomeScreen}
                options={{ tabBarIconComponent: LayoutDashboard }}
            />
            <Tab.Screen
                name="MyCaller"
                component={MyCallerScreen}
                options={{ tabBarIconComponent: Users }}
            />
            <Tab.Screen
                name="Medications"
                component={MedicationsScreen}
                options={{ tabBarIconComponent: Pill }}
            />
            <Tab.Screen
                name="HealthProfile"
                component={HealthProfileScreen}
                options={{ tabBarIconComponent: ShieldPlus }}
            />
            <Tab.Screen
                name="Profile"
                component={PatientProfileScreen}
                options={{ tabBarIconComponent: UserCircle }}
            />
        </Tab.Navigator>
    );
}

function CallerTabNavigator() {
    return (
        <Tab.Navigator
            tabBar={(props) => <CustomTabBar {...props} />}
            screenOptions={{ headerShown: false }}
        >
            <Tab.Screen
                name="CallerHome"
                component={CallerHomeScreen}
                options={{ tabBarIconComponent: LayoutDashboard }}
            />
            <Tab.Screen
                name="CallerPatients"
                component={CallerPatientsScreen}
                options={{ tabBarIconComponent: Users }}
            />
            <Tab.Screen
                name="ActivityFeed"
                component={ActivityFeedScreen}
                options={{ tabBarIconComponent: ShieldPlus }}
            />
            <Tab.Screen
                name="CallerProfile"
                component={CallerProfileScreen}
                options={{ tabBarIconComponent: Menu }}
            />
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

const AuthStack = () => (
    <Stack.Navigator
        screenOptions={{ headerShown: false, animation: "fade", animationDuration: 300 }}
        initialRouteName="Login"
    >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="PatientSignup" component={PatientSignupScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
    </Stack.Navigator>
);

const PatientOnboardingStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen
            name="PatientSignupOnboarding"
            component={PatientSignupScreen}
            initialParams={{ step: 2 }}
        />
    </Stack.Navigator>
);

const MainAppStack = ({ isCaller }) => (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
        {isCaller ? (
            <Stack.Screen name="CallerTabs" component={CallerTabNavigator} />
        ) : (
            <>
                <Stack.Screen name="PatientTabs" component={PatientTabNavigator} />
                <Stack.Screen
                    name="Notifications"
                    component={NotificationsScreen}
                    options={{ presentation: "modal" }}
                />
                <Stack.Screen name="VitalsHistory" component={VitalsHistoryScreen} />
                <Stack.Screen
                    name="LocationSearch"
                    component={LocationSearchScreen}
                    options={{ presentation: "modal", animation: "slide_from_bottom" }}
                />
                <Stack.Screen
                    name="AddAddress"
                    component={AddAddressScreen}
                    options={{ presentation: "modal" }}
                />
                <Stack.Screen name="SubscribePlans" component={SubscribePlansScreen} />
                <Stack.Screen name="Payment" component={PaymentScreen} />
                <Stack.Screen name="WaitingRoom" component={WaitingScreen} />
            </>
        )}
    </Stack.Navigator>
);

export default function AppNavigator() {
    const { initializing, isAuthenticated, userRole, user, profile } = useAuth();
    const isCaller = userRole === "caretaker" || userRole === "caller";
    const [splashDone, setSplashDone] = useState(false);

    const notificationListener = useRef();
    const responseListener = useRef();

    useEffect(() => {
        // Listen for incoming notifications while app is foregrounded
        notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
            console.log('🔔 Notification received:', notification.request.content.title);
        });

        // Listen for user tapping on a notification
        responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
            const screen = response.notification.request.content.data?.screen;
            if (screen) {
                console.log('📲 Navigate to:', screen);
                // Navigation can be handled here via a navigation ref if needed
            }
        });

        return () => {
            if (notificationListener.current) {
                Notifications.removeNotificationSubscription(notificationListener.current);
            }
            if (responseListener.current) {
                Notifications.removeNotificationSubscription(responseListener.current);
            }
        };
    }, []);

    // Handle push registration and welcome notification when authenticated
    useEffect(() => {
        const setupNotifications = async () => {
            if (isAuthenticated && user) {
                // 1. Request push permissions for ALL users on login
                try {
                    const { token, granted, isNewGrant } = await registerForPushNotificationsAsync();

                    // Save push token to backend (patients only — they have the Patient model)
                    if (token && userRole === 'patient') {
                        await apiService.patients.updateMe({ 
                            push_notifications_enabled: true,
                            expo_push_token: token 
                        });
                    }

                    // 2. Fire the right notification based on permission state
                    if (isNewGrant) {
                        // First time allowing → show onboarding notification
                        sendSeamlessExperienceNotification();
                    } else if (granted) {
                        // Already allowed → show welcome back notification
                        const name = profile?.fullName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there';
                        sendDailyWelcomeNotification(name, true);
                    }
                } catch (err) {
                    console.warn('Notification setup failed:', err.message);
                }
            }
        };

        setupNotifications();
    }, [isAuthenticated, user, userRole, profile]);

    if (!splashDone) return <SplashScreen onFinish={() => setSplashDone(true)} />;
    if (initializing) return <LoadingScreen />;
    if (!user) return <AuthStack />;
    if (!profile) return <LoadingScreen />;
    if (!isAuthenticated && userRole === "patient") return <PatientOnboardingStack />;

    return <MainAppStack isCaller={isCaller} />;
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: colors.background,
    },
    loadingText: {
        color: colors.primary,
        marginTop: 12,
        fontSize: 16,
        fontWeight: "500",
    },
    // ── Custom tab bar ──
    tabBarContainer: {
        position: "absolute",
        bottom: TAB_BAR_BOTTOM,
        left: 24,
        right: 24,
        height: TAB_BAR_HEIGHT,
        backgroundColor: "#FFFFFF",
        borderRadius: 32,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 12,
    },
    tabItem: {
        width: 44,
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
    },
    tabSlot: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    tabSlotActive: {
        backgroundColor: "#2563EB",
        shadowColor: "#2563EB",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 8,
    },
});