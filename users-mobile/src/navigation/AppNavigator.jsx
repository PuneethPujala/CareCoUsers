import React, { useEffect, useRef, useState, useCallback } from "react";
import CustomAlert from '../components/ui/CustomAlert';
import AlertManager from '../utils/AlertManager';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as ScreenCapture from 'expo-screen-capture';
import * as SplashScreen from 'expo-splash-screen';

import {
    View, Text, StyleSheet, Animated, ActivityIndicator,
    TouchableOpacity, Pressable, Image, Platform, DeviceEventEmitter
} from "react-native";
import Constants from 'expo-constants';
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { LayoutDashboard, Users, Pill, ShieldPlus, UserCircle, Bell, MessageSquare } from "lucide-react-native";
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
import { routeNotification, flushPendingNotifications } from '../utils/NotificationRouter';
import GlobalSyncBanner from '../components/ui/GlobalSyncBanner';
import AchievementCelebration from '../components/adherence/AchievementCelebration';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';

import PatientSignupScreen from "../screens/onboarding/PatientSignupScreen";
import LoginScreen from "../screens/onboarding/LoginScreen";
import ResetPasswordScreen from "../screens/onboarding/ResetPasswordScreen";
import VerifyEmailScreen from "../screens/onboarding/VerifyEmailScreen";
import MFAVerifyScreen from "../screens/auth/MFAVerifyScreen";
import MFASetupScreen from "../screens/settings/MFASetupScreen";
import DeveloperObservabilityScreen from "../screens/settings/DeveloperObservabilityScreen";
import PatientDiagnosticsScreen from "../screens/settings/PatientDiagnosticsScreen";
import CompanionSignupScreen from '../screens/onboarding/CompanionSignupScreen';

import CompanionHomeScreen from '../screens/app/CompanionHomeScreen';
import CompanionDashboardScreen from '../screens/app/CompanionDashboardScreen';
import CompanionAlertsScreen from '../screens/app/CompanionAlertsScreen';
import CompanionProfileScreen from '../screens/app/CompanionProfileScreen';
import CompanionChatListScreen from '../screens/app/CompanionChatListScreen';
import CompanionAnalyticsScreen from '../screens/app/CompanionAnalyticsScreen';
import CareCircleScreen from '../screens/app/CareCircleScreen';

import PatientHomeScreen from "../screens/patient/HomeScreen";
import MyCallerScreen from "../screens/patient/MyCallerScreen";
import MedicationsScreen from "../screens/patient/MedicationsScreen";
import HealthProfileScreen from "../screens/patient/HealthProfileScreen";
import NotificationsScreen from "../screens/patient/NotificationsScreen";
import PatientProfileScreen from "../screens/patient/ProfileScreen";
import WaitingScreen from "../screens/patient/WaitingScreen";
import VitalsHistoryScreen from "../screens/patient/VitalsHistoryScreen";
import LocationSearchScreen from "../screens/patient/LocationSearchScreen";
import AddAddressScreen from "../screens/patient/AddAddressScreen";
import HealthConnectSetupScreen from "../screens/patient/HealthConnectSetupScreen";
import AdherenceScreen from "../screens/patient/AdherenceScreen";
import ChatbotScreen from "../screens/patient/ChatbotScreen";
import ChatHistoryScreen from "../screens/patient/ChatHistoryScreen";
import CallHistoryScreen from "../screens/patient/CallHistoryScreen";
import PremiumShowcaseScreen from "../screens/patient/PremiumShowcaseScreen";
import PrescriptionVerificationScreen from "../screens/patient/PrescriptionVerificationScreen";
import ChatFAB from "../components/ui/ChatFAB";
import HealthCopilotScreen from "../screens/patient/HealthCopilotScreen";
import InterventionCenterScreen from "../screens/app/InterventionCenterScreen";
import BottomSheetProvider from "../components/ui/BottomSheetProvider";

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
    const insets = useSafeAreaInsets();
    const dynamicBottom = insets.bottom > 0 ? insets.bottom : layout.TAB_BAR_BOTTOM;
    const fabBottom = dynamicBottom + layout.TAB_BAR_HEIGHT + 16;
    return (
        <View style={{ flex: 1 }}>
            <Tab.Navigator tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false, sceneContainerStyle: { backgroundColor: colors.background } }}>
                <Tab.Screen name="PatientHome" component={PatientHomeScreen} options={{ tabBarIconComponent: LayoutDashboard }} />
                <Tab.Screen name="MyCaller" component={MyCallerScreen} options={{ tabBarIconComponent: Users }} />
                <Tab.Screen name="Medications" component={MedicationsScreen} options={{ tabBarIconComponent: Pill }} />
                <Tab.Screen name="HealthProfile" component={HealthProfileScreen} options={{ tabBarIconComponent: ShieldPlus }} />
                <Tab.Screen name="Profile" component={PatientProfileScreen} options={{ tabBarIconComponent: UserCircle }} />
            </Tab.Navigator>
            <ChatFAB onPress={() => navigate('ChatHistory')} bottomOffset={fabBottom} />
        </View>
    );
}

function CompanionTabNavigator() {
    return (
        <Tab.Navigator tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false, sceneContainerStyle: { backgroundColor: colors.background } }}>
            <Tab.Screen name="CompanionDashboard" component={CompanionDashboardScreen} options={{ tabBarIconComponent: LayoutDashboard }} />
            <Tab.Screen name="CompanionAlerts" component={CompanionAlertsScreen} options={{ tabBarIconComponent: Bell }} />
            <Tab.Screen name="CompanionChatList" component={CompanionChatListScreen} options={{ tabBarIconComponent: MessageSquare }} />
            <Tab.Screen name="Profile" component={CompanionProfileScreen} options={{ tabBarIconComponent: UserCircle }} />
        </Tab.Navigator>
    );
}

const CompanionMainStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "fade" }}>
        <Stack.Screen name="CompanionHome" component={CompanionHomeScreen} />
        <Stack.Screen name="CompanionTabs" component={CompanionTabNavigator} />
        <Stack.Screen name="CompanionAnalytics" component={CompanionAnalyticsScreen} />
        <Stack.Screen name="CareCircle" component={CareCircleScreen} />
        <Stack.Screen name="ChatHistory" component={ChatHistoryScreen} options={{ presentation: "modal", animation: "slide_from_bottom", headerShown: false }} />
        <Stack.Screen name="Chatbot" component={ChatbotScreen} options={{ presentation: "modal", animation: "slide_from_bottom", headerShown: false }} />
        <Stack.Screen name="InterventionCenter" component={InterventionCenterScreen} />
    </Stack.Navigator>
);

const AuthStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "fade", animationDuration: 300 }} initialRouteName="Login">
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="PatientSignup" component={PatientSignupScreen} />
        <Stack.Screen name="CompanionSignup" component={CompanionSignupScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        <Stack.Screen name="MFAVerify" component={MFAVerifyScreen} />
    </Stack.Navigator>
);

const PatientOnboardingStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "fade" }}>
        <Stack.Screen name="PatientSignupOnboarding" component={PatientSignupScreen} />
    </Stack.Navigator>
);

const MainAppStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "slide_from_right", animationDuration: 250 }}>
        <Stack.Screen name="PatientTabs" component={PatientTabNavigator} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="VitalsHistory" component={VitalsHistoryScreen} options={{ animation: "fade_from_bottom" }} />
        <Stack.Screen name="LocationSearch" component={LocationSearchScreen} options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="AddAddress" component={AddAddressScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="HealthConnectSetup" component={HealthConnectSetupScreen} options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="AdherenceDetails" component={AdherenceScreen} options={{ presentation: "modal", animation: "slide_from_bottom", headerShown: false }} />
        <Stack.Screen name="ChatHistory" component={ChatHistoryScreen} options={{ presentation: "modal", animation: "slide_from_bottom", headerShown: false }} />
        <Stack.Screen name="Chatbot" component={ChatbotScreen} options={{ presentation: "modal", animation: "slide_from_bottom", headerShown: false }} />
        <Stack.Screen name="PrescriptionVerification" component={PrescriptionVerificationScreen} options={{ presentation: "modal", animation: "slide_from_bottom", headerShown: false }} />
        <Stack.Screen name="CallHistory" component={CallHistoryScreen} />
        <Stack.Screen name="PremiumShowcase" component={PremiumShowcaseScreen} />
        <Stack.Screen name="WaitingRoom" component={WaitingScreen} />
        <Stack.Screen name="MFASetup" component={MFASetupScreen} options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="DeveloperObservability" component={DeveloperObservabilityScreen} options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="PatientDiagnostics" component={PatientDiagnosticsScreen} options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="HealthCopilot" component={HealthCopilotScreen} />
    </Stack.Navigator>
);

export default function AppNavigator({ fontsLoaded }) {
    const { isBootstrapping, onboardingComplete, subscriptionStatus, user, profile, signOut, isSwitching } = useAuth();
    const patient = usePatientStore(state => state.patient);

    // BUG 6 FIX: hasNotified must reset when the user signs out and back in.
    const hasNotifiedForUserRef = useRef(null); // stores the userId that was notified

    // Debounced dashboard refresh to prevent rapid duplicate calls when syncing
    const debounceTimeoutRef = useRef(null);
    const refreshDashboardDebounced = useCallback((sourceInfo) => {
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }
        if (__DEV__) {
            console.log(`[AppNavigator] Queueing debounced dashboard fetch (source: ${sourceInfo?.source || 'unknown'})`);
        }
        debounceTimeoutRef.current = setTimeout(async () => {
            if (__DEV__) {
                console.log('[AppNavigator] Executing debounced dashboard fetch for widget sync');
            }
            try {
                await usePatientStore.getState().fetchDashboard(true);
            } catch (err) {
                console.warn('[AppNavigator] Debounced dashboard fetch failed:', err);
            }
        }, 800); // 800ms debounce
    }, []);

    useEffect(() => {
        if (!user || profile?.role === 'companion') return;

        const sub = DeviceEventEmitter.addListener('VITALS_UPDATED', (eventData) => {
            refreshDashboardDebounced(eventData);
        });

        return () => {
            sub.remove();
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, [user, profile, refreshDashboardDebounced]);

    useEffect(() => {
        const initLanguage = async () => {
            try {
                const savedLang = await AsyncStorage.getItem('@user_preferred_language');
                if (savedLang) {
                    await i18n.changeLanguage(savedLang);
                }
            } catch (e) {
                console.warn('[AppNavigator] Failed to load local preferred language:', e);
            }
        };
        initLanguage();
    }, []);

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

    // Hide the native splash screen once bootstrapping is done.
    // This is the ONLY place SplashScreen.hideAsync() should be called
    // (App.js has a 12s failsafe but this is the primary controller).
    useEffect(() => {
        if (!isBootstrapping && fontsLoaded) {
            setTimeout(() => {
                SplashScreen.hideAsync().catch(() => { });
            }, 100);
        }
    }, [isBootstrapping, fontsLoaded]);

    useEffect(() => {
        let isMounted = true;
        const applyCaptureSetting = async () => {
            // Defer setting the secure capture flag slightly to prevent the window redraw from clashing with settings screen transitions/modal animations
            await new Promise(resolve => setTimeout(resolve, 800));
            if (!isMounted) return;

            if (user) {
                if (patient?.allow_screenshots === false) {
                    await ScreenCapture.preventScreenCaptureAsync().catch(err => console.warn('preventScreenCaptureAsync failed', err));
                } else {
                    await ScreenCapture.allowScreenCaptureAsync().catch(err => console.warn('allowScreenCaptureAsync failed', err));
                }
            } else {
                await ScreenCapture.allowScreenCaptureAsync().catch(() => { });
            }
        };

        applyCaptureSetting();

        return () => {
            isMounted = false;
        };
    }, [user, patient?.allow_screenshots]);

    useEffect(() => {
        notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
            const title = notification.request.content.title;
            const type = notification.request.content.data?.type;
            console.log(`🔔 Foreground notification received: ${title} (type: ${type})`);
            
            try {
                const patientStore = usePatientStore.getState();
                switch (type) {
                    case 'companion_nudge':
                    case 'medication_reminder':
                        patientStore.fetchMedications();
                        patientStore.fetchDashboard(true);
                        break;
                    case 'companion_request_bp':
                    case 'bp_request':
                    case 'critical_vital_alert':
                        patientStore.fetchDashboard(true);
                        break;
                    default:
                        patientStore.fetchDashboard(true);
                        break;
                }
            } catch (err) {
                console.warn('[AppNavigator] Foreground notification dispatch failed:', err.message);
            }
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
                Notifications.scheduleNotificationAsync({
                    content,
                    trigger: { type: 'timeInterval', seconds: 10 * 60, channelId: 'meds' },
                });
                return;
            }

            const data = content.data;
            if (data) {
                console.log('📲 Navigate via NotificationRouter:', data);
                routeNotification(data);
            }
        });

        // BUG 12 FIX: reject stale notifications older than STALE_NOTIFICATION_MS.
        Notifications.getLastNotificationResponseAsync().then(response => {
            if (response && !isStaleNotification(response)) {
                const data = response.notification.request.content.data;
                if (data) {
                    console.log('🚀 Launched from notification, routing via Router:', data);
                    setTimeout(() => routeNotification(data), 500);
                }
            }
        });

        // Handle token rotation (silent refresh by FCM/APNs)
        const tokenListener = Notifications.addPushTokenListener(async (tokenData) => {
            console.log('🔄 Push token rotated in background:', tokenData.data);
            try {
                const patientStore = usePatientStore.getState();
                if (patientStore.patient?._id) {
                    await apiService.patients.updateMe({
                        expo_push_token: tokenData.data,
                        device_platform: Platform.OS,
                        device_name: Constants.deviceName,
                        app_version: Constants.expoConfig?.version || '1.0.0'
                    });
                    console.log('✅ Rotated token successfully synced to backend');
                }
            } catch (err) {
                console.error('❌ Failed to sync rotated token:', err);
            }
        });

        return () => {
            notificationListener.current?.remove();
            responseListener.current?.remove();
            tokenListener?.remove();
        };
    }, []);

    // BUG 6 FIX: Track notification setup per userId.
    useEffect(() => {
        const setupNotifications = async () => {
            if (!user || !onboardingComplete) return;
            // Only register push tokens for patients — companions use a different API
            if (profile?.role === 'companion') return;
            const setupKey = `${user.id}_${profile?.role || 'patient'}`;
            if (hasNotifiedForUserRef.current === setupKey) return;

            hasNotifiedForUserRef.current = setupKey;

            try {
                const { token, granted, isNewGrant } = await registerForPushNotificationsAsync();

                if (token) {
                    const updates = { expo_push_token: token };
                    if (isNewGrant) {
                        updates.push_notifications_enabled = true;
                    }
                    await apiService.patients.updateMe(updates);
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

    // Flush pending notifications once navigator mounts and auth settles
    useEffect(() => {
        if (user) {
            console.log('[AppNavigator] User authenticated, flushing pending notifications');
            flushPendingNotifications();
        }
    }, [user, onboardingComplete]);

    const alertRef = useCallback((ref) => {
        if (ref) AlertManager.setRef(ref);
    }, []);

    // During bootstrapping, render nothing visible — the native splash screen
    // (configured in app.json) is covering the UI. We still mount CustomAlert
    // so AlertManager has its ref ready as soon as the app becomes interactive.
    if (isBootstrapping) return <CustomAlert ref={alertRef} />;

    if (isSwitching) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
                <Text style={styles.loadingText}>Switching workspace...</Text>
                <CustomAlert ref={alertRef} />
            </View>
        );
    }

    if (!user) return (
        <>
            <AuthStack />
            <CustomAlert ref={alertRef} />
        </>
    );
    if (!onboardingComplete && profile?.role !== 'companion') return (
        <>
            <PatientOnboardingStack />
            <CustomAlert ref={alertRef} />
        </>
    );

    // Companions bypass subscription check
    if (profile?.role === 'companion') {
        return (
            <View style={{ flex: 1 }}>
                <CompanionMainStack />
                <CustomAlert ref={alertRef} />
            </View>
        );
    }

    if (subscriptionStatus !== 'active') {
        return (
            <>
                <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
                    <Stack.Screen name="Payment" component={PremiumShowcaseScreen} />
                    <Stack.Screen name="WaitingRoom" component={WaitingScreen} />
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
        <BottomSheetProvider>
            <View style={{ flex: 1 }}>
                <GlobalSyncBanner />
                <MainAppStack />
                <CustomAlert ref={alertRef} />
                <AchievementCelebration />
            </View>
        </BottomSheetProvider>
    );
}

const styles = StyleSheet.create({
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
        backgroundColor: "#7C3AED",
        shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35, shadowRadius: 8, elevation: 8,
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: colors.background,
        alignItems: "center",
        justifyContent: "center",
    },
    loadingText: {
        fontSize: 16,
        fontFamily: "Inter_600SemiBold",
        color: colors.textSecondary,
    },
});