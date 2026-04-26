import React, { useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from "@react-navigation/native";
import * as Notifications from 'expo-notifications';
import * as ScreenCapture from 'expo-screen-capture';
import * as SplashScreen from 'expo-splash-screen';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    ActivityIndicator,
    TouchableOpacity,
    Pressable,
    Image,
} from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
    LayoutDashboard,
    Users,
    Pill,
    ShieldPlus,
    UserCircle,
} from "lucide-react-native";
import { useAuth } from "../context/AuthContext";
import { sendDailyWelcomeNotification, registerForPushNotificationsAsync, sendSeamlessExperienceNotification } from "../utils/notifications";
import { apiService } from "../lib/api";
import { colors } from "../theme";
import usePatientStore from '../store/usePatientStore';


// Onboarding screens
// SplashScreen removed — native splash handles the transition now
import PatientSignupScreen from "../screens/onboarding/PatientSignupScreen";
import LoginScreen from "../screens/onboarding/LoginScreen";
import ResetPasswordScreen from "../screens/onboarding/ResetPasswordScreen";
import VerifyEmailScreen from "../screens/onboarding/VerifyEmailScreen";
import MFAVerifyScreen from "../screens/auth/MFAVerifyScreen";
import MFASetupScreen from "../screens/settings/MFASetupScreen";

// Patient screens
import PatientHomeScreen from "../screens/patient/HomeScreen";
import MyCallerScreen from "../screens/patient/MyCallerScreen";
import MedicationsScreen from "../screens/patient/MedicationsScreen";
import HealthProfileScreen from "../screens/patient/HealthProfileScreen";
import NotificationsScreen from "../screens/patient/NotificationsScreen";
import PatientProfileScreen from "../screens/patient/ProfileScreen";

import PaymentScreen from "../screens/patient/PaymentScreen";
import WaitingScreen from "../screens/patient/WaitingScreen";
import VitalsHistoryScreen from "../screens/patient/VitalsHistoryScreen";
import LocationSearchScreen from "../screens/patient/LocationSearchScreen";
import AddAddressScreen from "../screens/patient/AddAddressScreen";
import HealthConnectSetupScreen from "../screens/patient/HealthConnectSetupScreen";
import AdherenceScreen from "../screens/patient/AdherenceScreen";

// Caller screens — removed: this is a patient-only app

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_BOTTOM = 8; // Reduced base padding for tighter look
export const TAB_BAR_CLEARANCE = TAB_BAR_HEIGHT + TAB_BAR_BOTTOM + 12;

// ── Fully custom tab bar — bypasses RN Navigation's internal layout ──
function CustomTabBar({ state, descriptors, navigation }) {
    const insets = useSafeAreaInsets();
    const dynamicBottom = insets.bottom > 0 ? insets.bottom : TAB_BAR_BOTTOM;
    return (
        <View style={[styles.tabBarContainer, { bottom: dynamicBottom }]}>
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
                        testID={`tab-${route.name}`}
                        accessibilityLabel={route.name}
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
        <Stack.Screen name="MFAVerify" component={MFAVerifyScreen} />
    </Stack.Navigator>
);

const PatientOnboardingStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen
            name="PatientSignupOnboarding"
            component={PatientSignupScreen}
        />
    </Stack.Navigator>
);

const MainAppStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
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
        <Stack.Screen
            name="HealthConnectSetup"
            component={HealthConnectSetupScreen}
            options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
            name="AdherenceDetails"
            component={AdherenceScreen}
            options={{ presentation: "modal", animation: "slide_from_bottom", headerShown: false }}
        />

        <Stack.Screen name="Payment" component={PaymentScreen} />
        <Stack.Screen name="WaitingRoom" component={WaitingScreen} />
        <Stack.Screen
            name="MFASetup"
            component={MFASetupScreen}
            options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
    </Stack.Navigator>
);

function AppSplashScreen() {
    return (
        <View style={styles.splashContainer}>
            <Image
                source={require('../../assets/logo.png')}
                style={styles.splashLogo}
                resizeMode="contain"
            />
            <ActivityIndicator size="small" color="#FFFFFF" style={styles.splashLoader} />
        </View>
    );
}

export default function AppNavigator() {
    const { isBootstrapping, onboardingComplete, subscriptionStatus, user, profile, signOut } = useAuth();
    const navigation = useNavigation();
    const patient = usePatientStore(state => state.patient);

    const notificationListener = useRef();
    const responseListener = useRef();
    const hasNotified = useRef(false);

    useEffect(() => {
        if (!isBootstrapping) {
            // Guarantee layout is mounted before hiding the native splash cover
            setTimeout(() => {
                SplashScreen.hideAsync().catch(() => {});
            }, 100);
        }
    }, [isBootstrapping]);

    // ── Global Screenshot Prevention Hook ──
    useEffect(() => {
        if (user) {
            // Block screenshots by default for safety, allow only if setting is explicitly true
            if (patient?.allow_screenshots === true) {
                ScreenCapture.allowScreenCaptureAsync().catch(err => console.warn('AppNavigator: allowScreenCaptureAsync failed', err));
            } else {
                ScreenCapture.preventScreenCaptureAsync().catch(err => console.warn('AppNavigator: preventScreenCaptureAsync failed', err));
            }
        } else {
            // Allow screenshots on public/auth screens
            ScreenCapture.allowScreenCaptureAsync().catch(() => {});
        }
    }, [user, patient?.allow_screenshots]);

    useEffect(() => {
        // Listen for incoming notifications while app is foregrounded
        notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
            console.log('🔔 Notification received:', notification.request.content.title);
        });

        // Listen for user tapping on a notification (Background state)
        responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
            const actionId = response.actionIdentifier;
            const content = response.notification.request.content;

            if (actionId === 'TAKEN') {
                console.log('✅ Background Action: MARKED TAKEN');
                // Tick the box natively using the store!
                const slotKey = content.data?.slot;
                if (slotKey) {
                    usePatientStore.getState().optimisticMarkSlotTaken(slotKey);
                }
                return;
            } else if (actionId === 'SNOOZE') {
                console.log('⏳ Background Action: SNOOZED (+10m)');
                // 10 minutes exact delay natively scheduled
                Notifications.scheduleNotificationAsync({
                    content,
                    trigger: { seconds: 10 * 60, channelId: 'meds' },
                });
                return;
            }

            const screen = content.data?.screen;
            if (screen) {
                console.log('📲 Navigate to:', screen);
                // Important: Ensure we use the right stack router ref. AppNavigator wraps <NavigationContainer> inside the root.
                // Assuming `navigation` is the ref from `<NavigationContainer ref={navigationRef}>`
                if (navigation && typeof navigation.navigate === 'function') {
                    navigation.navigate(screen);
                }
            }
        });

        // Handle KILLED state: app was launched by tapping a notification
        // This catches the case where the app was fully closed
        Notifications.getLastNotificationResponseAsync().then(response => {
            if (response) {
                const screen = response.notification.request.content.data?.screen;
                if (screen) {
                    console.log('🚀 Launched from notification, routing to:', screen);
                    // Small delay to let the navigation tree mount
                    setTimeout(() => navigation.navigate(screen), 500);
                }
            }
        });

        return () => {
            if (notificationListener.current) {
                notificationListener.current.remove();
            }
            if (responseListener.current) {
                responseListener.current.remove();
            }
        };
    }, []);

    // Handle push registration and welcome notification when authenticated
    useEffect(() => {
        const setupNotifications = async () => {
            if (user && onboardingComplete && !hasNotified.current) {
                hasNotified.current = true;
                // 1. Request push permissions for ALL users on login
                try {
                    const { token, granted, isNewGrant } = await registerForPushNotificationsAsync();

                    // Save push token to backend (patients only — they have the Patient model)
                    if (token) {
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
                        sendDailyWelcomeNotification(name);
                    }
                } catch (err) {
                    console.warn('Notification setup failed:', err.message);
                }
            }
        };

        console.log('[AppNavigator] State:', { isBootstrapping, user: !!user, profile: !!profile, onboardingComplete, subscriptionStatus });
        setupNotifications();
    }, [onboardingComplete, user, profile]);

    if (isBootstrapping) return <AppSplashScreen />;
    if (!user) return <AuthStack />;
    
    // User exists, check granular flags
    if (!onboardingComplete) return <PatientOnboardingStack />;
    
    // Profile is onboardingComplete, check subscription
    if (subscriptionStatus !== 'active') {
        return (
            <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>

                <Stack.Screen name="Payment" component={PaymentScreen} />
            </Stack.Navigator>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            <MainAppStack />
        </View>
    );
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

    // ── Soft Lock Overlay (elderly-friendly) ──
    lockOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        elevation: 9999,
    },
    lockCard: {
        backgroundColor: '#1E293B',
        borderRadius: 32,
        padding: 40,
        alignItems: 'center',
        marginHorizontal: 32,
        borderWidth: 1,
        borderColor: 'rgba(99, 102, 241, 0.3)',
    },
    lockIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(99, 102, 241, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    lockTitle: {
        color: '#F8FAFC',
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 10,
    },
    lockSubtitle: {
        color: '#94A3B8',
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 24,
    },
    lockHint: {
        marginTop: 24,
        backgroundColor: 'rgba(34, 197, 94, 0.12)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    lockHintText: {
        color: '#22C55E',
        fontSize: 13,
        fontWeight: '600',
    },
    splashContainer: {
        flex: 1,
        backgroundColor: '#0A2463',
        justifyContent: 'center',
        alignItems: 'center',
    },
    splashLogo: {
        width: 140,
        height: 140,
    },
    splashLoader: {
        marginTop: 24,
    },
});
