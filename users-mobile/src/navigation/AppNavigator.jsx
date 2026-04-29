import React, { useEffect, useRef, useState, useCallback } from "react";
import CustomAlert from '../components/ui/CustomAlert';
import AlertManager from '../utils/AlertManager';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as ScreenCapture from 'expo-screen-capture';
import * as SplashScreen from 'expo-splash-screen';
import {
    View, Text, StyleSheet, Animated, ActivityIndicator,
    TouchableOpacity, Pressable, Image,
} from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { LayoutDashboard, Users, Pill, ShieldPlus, UserCircle } from "lucide-react-native";
import { useAuth } from "../context/AuthContext";
import {
    sendDailyWelcomeNotification,
    registerForPushNotificationsAsync,
    sendSeamlessExperienceNotification,
} from "../utils/notifications";
import { apiService } from "../lib/api";
import { colors, layout } from "../theme";
import usePatientStore from '../store/usePatientStore';
import NetInfo from '@react-native-community/netinfo';
import OfflineSyncService from '../lib/OfflineSyncService';
import { navigate } from '../lib/navigationRef';

import PatientSignupScreen from "../screens/onboarding/PatientSignupScreen";
import LoginScreen from "../screens/onboarding/LoginScreen";
import ResetPasswordScreen from "../screens/onboarding/ResetPasswordScreen";
import VerifyEmailScreen from "../screens/onboarding/VerifyEmailScreen";
import MFAVerifyScreen from "../screens/auth/MFAVerifyScreen";
import MFASetupScreen from "../screens/settings/MFASetupScreen";

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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

export const TAB_BAR_HEIGHT = layout.TAB_BAR_HEIGHT;
export const TAB_BAR_BOTTOM = layout.TAB_BAR_BOTTOM;
export const TAB_BAR_CLEARANCE = layout.TAB_BAR_CLEARANCE;

// ── Stale notification threshold: ignore responses older than 30 seconds ──
// BUG 12 FIX: getLastNotificationResponseAsync() is called on every mount.
// If the app is already running (not in killed state), this returns a stale
// old notification and causes a spurious navigate() call. We reject any
// response whose notification was delivered more than 30 seconds ago.
const STALE_NOTIFICATION_MS = 30_000;

function isStaleNotification(response) {
    if (!response) return true;
    const deliveredAt = response.notification.date * 1000; // Expo gives seconds
    return Date.now() - deliveredAt > STALE_NOTIFICATION_MS;
}

function CustomTabBar({ state, descriptors, navigation }) {
    const insets = useSafeAreaInsets();
    const dynamicBottom = insets.bottom > 0 ? insets.bottom : layout.TAB_BAR_BOTTOM;
    return (
        <View style={[styles.tabBarContainer, { bottom: dynamicBottom }]}>
            {state.routes.map((route, index) => {
                const { options } = descriptors[route.key];
                const focused = state.index === index;
                const onPress = () => {
                    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
                };
                const IconComponent = options.tabBarIconComponent;
                return (
                    <TouchableOpacity
                        key={route.key} onPress={onPress} style={styles.tabItem}
                        activeOpacity={0.7} testID={`tab-${route.name}`} accessibilityLabel={route.name}
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
        Animated.spring(scaleAnim, { toValue: focused ? 1 : 0.9, friction: 6, useNativeDriver: true }).start();
    }, [focused]);
    return (
        <Animated.View style={[styles.tabSlot, focused && styles.tabSlotActive, { transform: [{ scale: scaleAnim }] }]}>
            <IconConfig color={focused ? "#FFFFFF" : "#94A3B8"} size={20} strokeWidth={focused ? 2.5 : 2} />
        </Animated.View>
    );
}

function PatientTabNavigator() {
    return (
        <Tab.Navigator tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
            <Tab.Screen name="PatientHome" component={PatientHomeScreen} options={{ tabBarIconComponent: LayoutDashboard }} />
            <Tab.Screen name="MyCaller" component={MyCallerScreen} options={{ tabBarIconComponent: Users }} />
            <Tab.Screen name="Medications" component={MedicationsScreen} options={{ tabBarIconComponent: Pill }} />
            <Tab.Screen name="HealthProfile" component={HealthProfileScreen} options={{ tabBarIconComponent: ShieldPlus }} />
            <Tab.Screen name="Profile" component={PatientProfileScreen} options={{ tabBarIconComponent: UserCircle }} />
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
    <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade", animationDuration: 300 }} initialRouteName="Login">
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="PatientSignup" component={PatientSignupScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        <Stack.Screen name="MFAVerify" component={MFAVerifyScreen} />
    </Stack.Navigator>
);

const PatientOnboardingStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen name="PatientSignupOnboarding" component={PatientSignupScreen} />
    </Stack.Navigator>
);

const MainAppStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen name="PatientTabs" component={PatientTabNavigator} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="VitalsHistory" component={VitalsHistoryScreen} />
        <Stack.Screen name="LocationSearch" component={LocationSearchScreen} options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="AddAddress" component={AddAddressScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="HealthConnectSetup" component={HealthConnectSetupScreen} options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="AdherenceDetails" component={AdherenceScreen} options={{ presentation: "modal", animation: "slide_from_bottom", headerShown: false }} />
        <Stack.Screen name="Payment" component={PaymentScreen} />
        <Stack.Screen name="WaitingRoom" component={WaitingScreen} />
        <Stack.Screen name="MFASetup" component={MFASetupScreen} options={{ presentation: "modal", animation: "slide_from_bottom" }} />
    </Stack.Navigator>
);

function AppSplashScreen() {
    return (
        <LinearGradient
            colors={['#1A0533', '#2D1B69', '#3B2FA0', '#2563EB', '#1D4ED8']}
            style={styles.splashContainer}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
        >
            <Image source={require('../../assets/logo.png')} style={styles.splashLogo} resizeMode="contain" />
            <ActivityIndicator size="small" color="#FFFFFF" style={styles.splashLoader} />
        </LinearGradient>
    );
}

export default function AppNavigator() {
    const { isBootstrapping, onboardingComplete, subscriptionStatus, user, profile, signOut } = useAuth();
    const patient = usePatientStore(state => state.patient);

    // BUG 6 FIX: hasNotified must reset when the user signs out and back in.
    // Previously it was a plain ref that survived sign-out, so setupNotifications
    // was permanently skipped on subsequent logins — push token never re-registered.
    // Now it's derived from the user's id: when user changes, the effect re-runs.
    const hasNotifiedForUserRef = useRef(null); // stores the userId that was notified

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            if (state.isConnected && state.isInternetReachable !== false) {
                if (__DEV__) console.log('[OfflineSync] Network restored, flushing queue...');
                OfflineSyncService.flushQueue();
            }
        });
        NetInfo.fetch().then(state => { if (state.isConnected) OfflineSyncService.flushQueue(); });
        return () => unsubscribe();
    }, []);

    const notificationListener = useRef();
    const responseListener = useRef();

    useEffect(() => {
        if (!isBootstrapping) {
            setTimeout(() => { SplashScreen.hideAsync().catch(() => { }); }, 100);
        }
    }, [isBootstrapping]);

    useEffect(() => {
        if (user) {
            if (patient?.allow_screenshots === false) {
                ScreenCapture.preventScreenCaptureAsync().catch(err => console.warn('preventScreenCaptureAsync failed', err));
            } else {
                ScreenCapture.allowScreenCaptureAsync().catch(err => console.warn('allowScreenCaptureAsync failed', err));
            }
        } else {
            ScreenCapture.allowScreenCaptureAsync().catch(() => { });
        }
    }, [user, patient?.allow_screenshots]);

    useEffect(() => {
        notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
            console.log('🔔 Notification received:', notification.request.content.title);
        });

        responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
            const actionId = response.actionIdentifier;
            const content = response.notification.request.content;

            if (actionId === 'TAKEN') {
                console.log('✅ Background Action: MARKED TAKEN');
                const slotKey = content.data?.slot;
                if (slotKey) {
                    usePatientStore.getState().optimisticMarkSlotTaken(slotKey);
                }
                return;
            }

            if (actionId === 'SNOOZE') {
                console.log('⏳ Background Action: SNOOZED (+10m)');
                // BUG 14 FIX: Expo SDK 50+ requires explicit type field on trigger.
                // { seconds: 600, channelId: 'meds' } silently fails — must be:
                // { type: 'timeInterval', seconds: 600, channelId: 'meds' }
                Notifications.scheduleNotificationAsync({
                    content,
                    trigger: { type: 'timeInterval', seconds: 10 * 60, channelId: 'meds' },
                });
                return;
            }

            const screen = content.data?.screen;
            if (screen) {
                console.log('📲 Navigate to:', screen);
                navigate(screen);
            }
        });

        // BUG 12 FIX: getLastNotificationResponseAsync() is called on every mount.
        // Without a freshness check, a stale notification from a previous session
        // would fire navigate() spuriously every time the component mounts
        // (e.g. on sign-out/sign-in, on hot reload in dev). Now we reject any
        // response older than STALE_NOTIFICATION_MS (30 seconds).
        Notifications.getLastNotificationResponseAsync().then(response => {
            if (response && !isStaleNotification(response)) {
                const screen = response.notification.request.content.data?.screen;
                if (screen) {
                    console.log('🚀 Launched from notification, routing to:', screen);
                    setTimeout(() => navigate(screen), 500);
                }
            }
        });

        return () => {
            notificationListener.current?.remove();
            responseListener.current?.remove();
        };
    }, []);

    // BUG 6 FIX: Track notification setup per userId instead of a one-shot boolean.
    // When user logs out (user becomes null) and back in as a different or same user,
    // the ref no longer matches and setup runs again, re-registering the push token.
    useEffect(() => {
        const setupNotifications = async () => {
            if (!user || !onboardingComplete) return;
            if (hasNotifiedForUserRef.current === user.id) return; // already done for this session

            hasNotifiedForUserRef.current = user.id;

            try {
                const { token, granted, isNewGrant } = await registerForPushNotificationsAsync();

                if (token) {
                    await apiService.patients.updateMe({
                        push_notifications_enabled: true,
                        expo_push_token: token,
                    });
                }

                if (isNewGrant) {
                    sendSeamlessExperienceNotification();
                } else if (granted) {
                    const name = profile?.fullName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there';
                    sendDailyWelcomeNotification(name);
                }
            } catch (err) {
                console.warn('Notification setup failed:', err.message);
            }
        };

        setupNotifications();
    }, [onboardingComplete, user, profile]);

    const alertRef = useCallback((ref) => {
        if (ref) AlertManager.setRef(ref);
    }, []);

    if (isBootstrapping) return (
        <>
            <AppSplashScreen />
            <CustomAlert ref={alertRef} />
        </>
    );
    if (!user) return (
        <>
            <AuthStack />
            <CustomAlert ref={alertRef} />
        </>
    );
    if (!onboardingComplete) return (
        <>
            <PatientOnboardingStack />
            <CustomAlert ref={alertRef} />
        </>
    );

    if (subscriptionStatus !== 'active') {
        return (
            <>
                <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
                    <Stack.Screen name="Payment" component={PaymentScreen} />
                    <Stack.Screen
                        name="Profile"
                        component={PatientProfileScreen}
                        options={{ presentation: "modal" }}
                    />
                </Stack.Navigator>
                <CustomAlert ref={alertRef} />
            </>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            <MainAppStack />
            <CustomAlert ref={alertRef} />
        </View>
    );
}

const styles = StyleSheet.create({
    loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
    loadingText: { color: colors.primary, marginTop: 12, fontSize: 16, fontWeight: "500" },
    tabBarContainer: {
        position: "absolute", left: 24, right: 24,
        height: TAB_BAR_HEIGHT, backgroundColor: "#FFFFFF",
        borderRadius: 32, flexDirection: "row", alignItems: "center",
        justifyContent: "space-between", paddingHorizontal: 10,
        borderWidth: 1, borderColor: "#E2E8F0",
        shadowColor: "#0F172A", shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12, shadowRadius: 16, elevation: 12,
    },
    tabItem: { width: 44, alignItems: "center", justifyContent: "center", height: "100%" },
    tabSlot: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    tabSlotActive: {
        backgroundColor: "#2563EB",
        shadowColor: "#2563EB", shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35, shadowRadius: 8, elevation: 8,
    },
    splashContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    splashLogo: { width: 200, height: 200 },
    splashLoader: { marginTop: 24 },
});