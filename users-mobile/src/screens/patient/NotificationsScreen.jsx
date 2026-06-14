import React, { useState, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Platform, Pressable,
    ActivityIndicator, Animated, StatusBar, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
    X, Pill, Heart, Calendar, AlertCircle, MessageSquare,
    BellOff, PhoneMissed, CheckCheck, Bell, ShieldAlert,
} from 'lucide-react-native';
import { colors, motion, useReduceMotion } from '../../theme';
import { apiService } from '../../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as IntentLauncher from 'expo-intent-launcher';

// ─── Skeleton Loader ──────────────────────────────────────────
const SkeletonItem = ({ width, height, borderRadius = 8, style }) => {
    const anim = useRef(new Animated.Value(0.3)).current;
    React.useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
            ])
        ).start();
    }, [anim]);
    return <Animated.View style={[{ width, height, borderRadius, backgroundColor: '#E2E8F0', opacity: anim }, style]} />;
};



const C = {
    bg: colors.background,
    surface: colors.surface,
    primary: colors.primary,
    primaryDark: colors.primaryMid,
    primarySoft: colors.primarySoft,
    dark: colors.textPrimary,
    mid: colors.textSecondary,
    muted: colors.textMuted,
    danger: colors.danger,
    border: colors.borderLight,
    success: colors.success,
    successSoft: colors.successLight,
    light: colors.textMuted,
};

const FONT = {
    regular: { fontFamily: 'Inter_400Regular' },
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

const GROUP_ORDER = ["Today's Activity", 'Messages & Updates', 'Upcoming', 'System Alerts'];

export default function NotificationsScreen({ navigation }) {
    const reduceMotion = useReduceMotion();
    const [activeTab, setActiveTab] = useState('all');
    const [loading, setLoading] = useState(true);
    const [markingAll, setMarkingAll] = useState(false);
    const [notifications, setNotifications] = useState([]);
    // Ref so we can check staleness inside async callbacks without stale closures
    const notificationsRef = useRef([]);
    const [showBatteryPrompt, setShowBatteryPrompt] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // ── Staggered group entrance ──
    const STAGGER_COUNT = 6;
    const staggerAnims = useRef([...Array(STAGGER_COUNT)].map(() => new Animated.Value(0))).current;
    const hasStaggered = useRef(false);

    const runStagger = useCallback(() => {
        if (hasStaggered.current) return;
        hasStaggered.current = true;
        if (reduceMotion) {
            staggerAnims.forEach(a => a.setValue(1));
            return;
        }
        Animated.stagger(80,
            staggerAnims.map(a =>
                Animated.spring(a, { toValue: 1, ...motion.springSoft, useNativeDriver: true })
            )
        ).start();
    }, [staggerAnims, reduceMotion]);

    const groupAnim = (i) => ({
        opacity: staggerAnims[Math.min(i, STAGGER_COUNT - 1)],
        transform: reduceMotion ? [] : [{ translateY: staggerAnims[Math.min(i, STAGGER_COUNT - 1)].interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
    });

    // ─── Fetch all notification data ─────────────────────────────────────────
    const fetchContext = useCallback(async () => {
        setLoading(true);
        try {
            const [pRes, medsRes, notifRes, callsRes] = await Promise.all([
                apiService.patients.getMe(),
                apiService.medicines.getToday(),
                apiService.patients.getNotifications(),
                apiService.patients.getMyCalls({ limit: 10 }),
            ]);

            const patient = pRes.data.patient;
            const medicines = medsRes.data.log?.medicines || [];
            const backendNotifs = notifRes.data.notifications || [];
            const recentCalls = callsRes.data.calls || [];

            // Fetch today's vitals
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);

            let todayVitals = null;
            try {
                const vRes = await apiService.patients.getVitals({
                    start_date: todayStart.toISOString(),
                    end_date: todayEnd.toISOString(),
                });
                todayVitals = vRes.data.vitals;
            } catch (_) { /* non-critical */ }

            const newNotifs = [];
            let nId = 1;

            // ── 1. Persistent Backend Notifications ───────────────────────
            backendNotifs.forEach(b => {
                const createdDate = new Date(b.created_at);
                const isToday = new Date().toDateString() === createdDate.toDateString();
                const timeStr = isToday
                    ? createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : createdDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

                // Remap backend screen names to navigator screen names
                let target = b.target_screen || 'PatientHome';
                if (target === 'HomeScreen') target = 'PatientHome';
                if (target === 'MedicationsScreen') target = 'Medications';
                if (target === 'WellnessScreen' || target === 'ActivityScreen') target = 'PatientHome';

                let Icon = MessageSquare;
                if (b.type === 'critical_alerts') Icon = AlertCircle;
                else if (b.type === 'reminders') Icon = Bell;
                else if (b.type === 'activity') Icon = Heart;

                newNotifs.push({
                    id: b._id,
                    isBackend: true,
                    isTransient: false,
                    isRead: b.is_read,
                    group: 'Messages & Updates',
                    name: b.title,
                    action: b.message,
                    time: timeStr,
                    Icon,
                    color: b.is_read ? colors.textMuted : colors.primary,
                    bg: b.is_read ? '#F1F5F9' : '#EEF2FF',
                    target,
                    actionTxt: b.is_read ? 'Open' : 'View',
                });
            });

            // ── 2. Vitals Contextual Alert ────────────────────────────────
            const vitalsLogged = Array.isArray(todayVitals)
                ? todayVitals.length > 0
                : !!todayVitals?.heart_rate;

            if (!vitalsLogged) {
                newNotifs.push({
                    id: `transient-${nId++}`,
                    isBackend: false,
                    isTransient: true,
                    isRead: false,
                    group: "Today's Activity",
                    name: 'Log Your Vitals',
                    action: 'Your vitals (Heart rate, BP) have not been logged today. Keep your health record updated.',
                    time: 'Now',
                    Icon: Heart,
                    color: C.danger,
                    bg: '#FFE4E6',
                    target: 'PatientHome',
                    actionTxt: 'Log Now',
                });
            }

            // ── 3. Medication Alerts ──────────────────────────────────────
            const currentTime = new Date();
            const prefs = patient.medication_call_preferences || {
                morning: '09:00', afternoon: '14:00', evening: '17:00', night: '20:00',
            };

            medicines.forEach(m => {
                if (!m.taken) {
                    const timeKey = m.scheduled_time || m.type || 'morning';
                    const timePref = prefs[timeKey] || (
                        timeKey === 'morning' ? '09:00' :
                        timeKey === 'afternoon' ? '14:00' :
                        timeKey === 'evening' ? '17:00' : '20:00'
                    );
                    const [h, min] = timePref.split(':').map(Number);
                    const medTime = new Date();
                    medTime.setHours(h, min, 0, 0);

                    const diffHours = (medTime - currentTime) / (1000 * 60 * 60);

                    // Alert if overdue or coming up within 2 hours
                    if (diffHours <= 2) {
                        const slot = timeKey.charAt(0).toUpperCase() + timeKey.slice(1);
                        const timeLabel = diffHours < -0.5 ? 'Overdue' : 'Soon';

                        newNotifs.push({
                            id: `transient-${nId++}`,
                            isBackend: false,
                            isTransient: true,
                            isRead: false,
                            group: "Today's Activity",
                            name: `${slot} Medication`,
                            action: `Time to take ${m.medicine_name || m.name}. Scheduled at ${timePref}.`,
                            time: timeLabel,
                            Icon: Pill,
                            color: diffHours < -0.5 ? colors.danger : '#3B82F6',
                            bg: diffHours < -0.5 ? '#FFE4E6' : '#DBEAFE',
                            target: 'Medications',
                            actionTxt: 'View',
                        });
                    }
                }
            });

            // ── 4. Missed Calls Alert ─────────────────────────────────────
            const todaysCalls = recentCalls.filter(c => new Date(c.call_date) >= todayStart);
            const missedCalls = todaysCalls.filter(c => c.status === 'missed');
            if (missedCalls.length > 0) {
                newNotifs.push({
                    id: `transient-${nId++}`,
                    isBackend: false,
                    isTransient: true,
                    isRead: false,
                    group: "Today's Activity",
                    name: `Missed Call${missedCalls.length > 1 ? 's' : ''}`,
                    action: `Your caregiver tried to reach you ${missedCalls.length > 1 ? `${missedCalls.length} times` : ''} today. Please call them back.`,
                    time: 'Missed',
                    Icon: PhoneMissed,
                    color: C.danger,
                    bg: '#FFE4E6',
                    target: 'MyCaller',
                    actionTxt: 'Call Back',
                });
            }

            // ── 5. Appointment Alert (within 7 days) ─────────────────────
            const upcoming = (patient.appointments || []).filter(a => a.status === 'upcoming');
            upcoming.forEach(a => {
                const daysUntil = Math.ceil((new Date(a.date) - new Date()) / (1000 * 60 * 60 * 24));
                if (daysUntil >= 0 && daysUntil <= 7) {
                    newNotifs.push({
                        id: `transient-${nId++}`,
                        isBackend: false,
                        isTransient: true,
                        isRead: false,
                        group: 'Upcoming',
                        name: 'Upcoming Appointment',
                        action: `Visit with ${a.doctor_name} on ${new Date(a.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.`,
                        time: daysUntil === 0 ? 'Today' : `${daysUntil}d`,
                        Icon: Calendar,
                        color: '#8B5CF6',
                        bg: '#EDE9FE',
                        target: 'HealthProfile',
                        actionTxt: 'View',
                    });
                }
            });

            // ── 6. Subscription Alert (within 7 days) ────────────────────
            if (patient.subscription?.expires_at) {
                const daysLeft = Math.ceil(
                    (new Date(patient.subscription.expires_at) - new Date()) / (1000 * 60 * 60 * 24)
                );
                if (daysLeft >= 0 && daysLeft <= 7) {
                    newNotifs.push({
                        id: `transient-${nId++}`,
                        isBackend: false,
                        isTransient: true,
                        isRead: false,
                        group: 'System Alerts',
                        name: 'Subscription Expiring',
                        action: `Your premium plan expires in ${daysLeft === 0 ? 'today' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}. Renew to keep full access.`,
                        time: daysLeft === 0 ? 'Today' : `${daysLeft}d`,
                        Icon: AlertCircle,
                        color: colors.warning,
                        bg: '#FEF3C7',
                        target: 'PatientHome',
                        actionTxt: 'Renew',
                    });
                }
            }

            notificationsRef.current = newNotifs;
            setNotifications(newNotifs);
        } catch (err) {
            console.warn('[NotificationsScreen] Fetch failed:', err.message);
        } finally {
            setLoading(false);
            runStagger();
        }
    }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchContext();
        setRefreshing(false);
    }, [fetchContext]);

    const checkBatteryPrompt = useCallback(async () => {
        if (Platform.OS !== 'android') return;
        try {
            const dismissed = await AsyncStorage.getItem('@battery_prompt_dismissed');
            if (!dismissed) {
                setShowBatteryPrompt(true);
            }
        } catch (e) {}
    }, []);

    // ─── Focus effect — stable, no infinite loop ──────────────────────────────
    useFocusEffect(
        useCallback(() => {
            fetchContext();
            checkBatteryPrompt();
        }, [fetchContext, checkBatteryPrompt])
    );

    // ─── Mark a single backend notification as read, then navigate ────────────
    const handleNotificationPress = useCallback(async (item) => {
        if (item.isBackend && !item.isRead) {
            // Optimistic update first for snappy UI
            setNotifications(prev =>
                prev.map(n =>
                    n.id === item.id
                        ? { ...n, isRead: true, color: colors.textMuted, bg: '#F1F5F9', actionTxt: 'Open' }
                        : n
                )
            );
            try {
                await apiService.patients.markNotificationRead(item.id);
            } catch (err) {
                // Revert on failure
                setNotifications(prev =>
                    prev.map(n =>
                        n.id === item.id
                            ? { ...n, isRead: false, color: colors.primary, bg: '#EEF2FF', actionTxt: 'View' }
                            : n
                    )
                );
                console.warn('[NotificationsScreen] markRead failed:', err.message);
                return;
            }
        }
        // Always navigate to the target screen
        try {
            navigation.navigate('PatientTabs', { screen: item.target });
        } catch (_) {
            navigation.navigate('PatientHome');
        }
    }, [navigation]);

    // ─── Mark all backend notifications as read ───────────────────────────────
    const handleMarkAllRead = useCallback(async () => {
        const hasUnread = notifications.some(n => n.isBackend && !n.isRead);
        if (!hasUnread || markingAll) return;

        setMarkingAll(true);
        try {
            await apiService.patients.markAllNotificationsRead();
            setNotifications(prev =>
                prev.map(n =>
                    n.isBackend
                        ? { ...n, isRead: true, color: colors.textMuted, bg: '#F1F5F9', actionTxt: 'Open' }
                        : n
                )
            );
        } catch (err) {
            console.warn('[NotificationsScreen] markAllRead failed:', err.message);
        } finally {
            setMarkingAll(false);
        }
    }, [notifications, markingAll]);

    // ─── Battery Optimization Action ──────────────────────────────────────────
    const handleBatteryAction = async () => {
        try {
            await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
        } catch (e) {
            console.warn('Failed to open battery settings:', e);
        }
    };

    const handleDismissBatteryPrompt = async () => {
        setShowBatteryPrompt(false);
        try {
            await AsyncStorage.setItem('@battery_prompt_dismissed', 'true');
        } catch (e) {}
    };

    // ─── Derived data ─────────────────────────────────────────────────────────
    const unreadBackendCount = notifications.filter(n => n.isBackend && !n.isRead).length;
    const hasUnreadBackend = unreadBackendCount > 0;

    const getFilteredItems = useCallback((groupNotifs) => {
        if (activeTab === 'unread') {
            // Unread tab: only backend notifications that haven't been read
            return groupNotifs.filter(n => n.isBackend && !n.isRead);
        }
        return groupNotifs; // all tab: show everything
    }, [activeTab]);

    const isEmpty = useCallback(() => {
        if (activeTab === 'unread') return !hasUnreadBackend;
        return notifications.length === 0;
    }, [activeTab, hasUnreadBackend, notifications.length]);

    return (
        <View style={s.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

            {/* ── Header ── */}
            <View style={s.header}>
                <View>
                    <Text style={s.headerLabel}>NOTIFICATIONS</Text>
                    <Text style={s.headerTitle}>Updates</Text>
                </View>
                <View style={s.headerActions}>
                    {hasUnreadBackend && (
                        <Pressable
                            style={s.markAllBtn}
                            onPress={handleMarkAllRead}
                            disabled={markingAll}
                        >
                            {markingAll
                                ? <ActivityIndicator size="small" color={C.primary} />
                                : <CheckCheck size={16} color={C.primary} strokeWidth={2.5} />
                            }
                            <Text style={s.markAllTxt}>Mark all read</Text>
                        </Pressable>
                    )}
                    <Pressable style={s.closeBtn} onPress={() => navigation.goBack()}>
                        <X size={20} color={colors.textPrimary} strokeWidth={2.5} />
                    </Pressable>
                </View>
            </View>

            {/* ── Tabs ── */}
            <View style={s.tabsWrap}>
                <View style={s.tabsBg}>
                    <Pressable
                        style={[s.tab, activeTab === 'all' && s.tabActive]}
                        onPress={() => setActiveTab('all')}
                    >
                        <Text style={[s.tabText, activeTab === 'all' && s.tabTextActive]}>
                            All Activity
                        </Text>
                    </Pressable>
                    <Pressable
                        style={[s.tab, activeTab === 'unread' && s.tabActive]}
                        onPress={() => setActiveTab('unread')}
                    >
                        <Text style={[s.tabText, activeTab === 'unread' && s.tabTextActive]}>
                            Unread
                        </Text>
                        {unreadBackendCount > 0 && (
                            <View style={s.tabBadge}>
                                <Text style={s.tabBadgeTxt}>
                                    {unreadBackendCount > 99 ? '99+' : unreadBackendCount}
                                </Text>
                            </View>
                        )}
                    </Pressable>
                </View>
            </View>

            {/* ── Content ── */}
            <ScrollView
                style={s.list}
                contentContainerStyle={s.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#6366F1"
                        colors={["#6366F1"]}
                    />
                }
            >
                {/* ── Battery Optimization Banner (Android Only) ── */}
                {showBatteryPrompt && (
                    <View style={s.batteryBanner}>
                        <View style={s.batteryBannerTop}>
                            <View style={s.batteryIconWrap}>
                                <ShieldAlert size={20} color="#EA580C" strokeWidth={2.5} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.batteryTitle}>Ensure Reminders Fire On Time</Text>
                                <Text style={s.batteryDesc}>Android may delay or block your medication reminders to save battery. Tap below to disable battery optimization for CareMyMed.</Text>
                            </View>
                            <Pressable style={s.batteryClose} onPress={handleDismissBatteryPrompt} hitSlop={15}>
                                <X size={16} color="#9A3412" />
                            </Pressable>
                        </View>
                        <Pressable style={s.batteryBtn} onPress={handleBatteryAction}>
                            <Text style={s.batteryBtnTxt}>Open Settings</Text>
                        </Pressable>
                    </View>
                )}

                {loading ? (
                    <View style={{ marginTop: 8 }}>
                        {[1, 2, 3, 4, 5].map(i => (
                            <View key={i} style={s.skeletonRow}>
                                <SkeletonItem width={44} height={44} borderRadius={22} style={{ marginRight: 14 }} />
                                <View style={{ flex: 1 }}>
                                    <SkeletonItem width="75%" height={14} borderRadius={7} style={{ marginBottom: 8 }} />
                                    <SkeletonItem width="50%" height={11} borderRadius={6} />
                                </View>
                                <SkeletonItem width={52} height={28} borderRadius={8} style={{ marginLeft: 8 }} />
                            </View>
                        ))}
                    </View>
                ) : isEmpty() ? (
                    <View style={s.emptyWrap}>
                        <View style={s.emptyIconWrap}>
                            <BellOff size={48} color={C.light} strokeWidth={1.5} />
                        </View>
                        <Text style={s.emptyTitle}>
                            {activeTab === 'unread' ? 'All caught up!' : 'No notifications yet'}
                        </Text>
                        <Text style={s.emptyBody}>
                            {activeTab === 'unread'
                                ? 'You have no unread messages.'
                                : "You'll see health tips, medication alerts, and updates here."}
                        </Text>
                    </View>
                ) : (
                    GROUP_ORDER.map((group, groupIdx) => {
                        const groupItems = notifications.filter(n => n.group === group);
                        const filtered = getFilteredItems(groupItems);
                        if (filtered.length === 0) return null;

                        return (
                            <Animated.View key={group} style={[s.groupSection, groupAnim(groupIdx)]}>
                                <Text style={s.groupHeader}>{group.toUpperCase()}</Text>
                                {filtered.map(item => (
                                    <NotificationCard
                                        key={item.id}
                                        item={item}
                                        onPress={handleNotificationPress}
                                    />
                                ))}
                            </Animated.View>
                        );
                    })
                )}
                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

// ─── Notification Card ─────────────────────────────────────────────────────
const NotificationCard = React.memo(({ item, onPress }) => (
    <Pressable
        style={({ pressed }) => [s.card, pressed && { opacity: 0.75 }]}
        onPress={() => onPress(item)}
    >
        {/* Unread dot for backend notifications */}
        {item.isBackend && !item.isRead && <View style={s.unreadDot} />}

        <View style={[s.iconAvatar, { backgroundColor: item.bg }]}>
            <item.Icon size={20} color={item.color} strokeWidth={2.5} />
        </View>

        <View style={s.cardBody}>
            <View style={s.cardTopRow}>
                <Text style={[s.cardName, item.isBackend && !item.isRead && s.cardNameUnread]} numberOfLines={1}>
                    {item.name}
                </Text>
                <Text style={s.timeTxt}>{item.time}</Text>
            </View>
            <Text style={s.cardAction} numberOfLines={2}>{item.action}</Text>
        </View>

        <View style={[s.actionBtn, { backgroundColor: item.bg }]}>
            <Text style={[s.actionBtnTxt, { color: item.color }]}>{item.actionTxt}</Text>
        </View>
    </Pressable>
));

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },

    // ── Header ──
    header: {
        flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 60 : 44,
        paddingHorizontal: 24,
        paddingBottom: 20,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    headerLabel: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 2, marginBottom: 4 },
    headerTitle: { fontSize: 28, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.8 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 2 },
    markAllBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: 12, borderWidth: 1, borderColor: '#C7D2FE',
    },
    markAllTxt: { fontSize: 12, fontWeight: '700', color: colors.primary },
    closeBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight,
        alignItems: 'center', justifyContent: 'center',
    },

    // ── Tabs ──
    tabsWrap: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 },
    tabsBg: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: colors.borderLight },
    tab: { flex: 1, flexDirection: 'row', paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 12, gap: 6 },
    tabActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
    tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
    tabTextActive: { color: colors.textPrimary, fontWeight: '800' },
    tabBadge: { backgroundColor: colors.primary, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    tabBadgeTxt: { fontSize: 10, fontWeight: '800', color: '#FFF' },

    // ── List ──
    list: { flex: 1 },
    listContent: { paddingHorizontal: 20, paddingTop: 16, minHeight: '100%' },

    skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },

    groupSection: { marginBottom: 32 },
    groupHeader: { fontSize: 11, fontWeight: '800', color: colors.textMuted, marginBottom: 12, letterSpacing: 1.5 },

    // ── Card ──
    card: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FFFFFF', borderRadius: 18,
        padding: 14, marginBottom: 10,
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03, shadowRadius: 6, elevation: 1,
    },
    unreadDot: {
        position: 'absolute', top: 14, left: 8,
        width: 6, height: 6, borderRadius: 3,
        backgroundColor: colors.primary,
    },
    iconAvatar: {
        width: 44, height: 44, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
        marginRight: 12, flexShrink: 0,
    },
    cardBody: { flex: 1, marginRight: 10 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
    cardName: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, flex: 1, marginRight: 6 },
    cardNameUnread: { fontWeight: '800', color: colors.textPrimary },
    cardAction: { fontSize: 12, fontWeight: '500', color: colors.textMuted, lineHeight: 17 },
    timeTxt: { fontSize: 10, fontWeight: '700', color: '#CBD5E1', flexShrink: 0 },
    actionBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, flexShrink: 0 },
    actionBtnTxt: { fontSize: 11, fontWeight: '800' },

    // ── Empty State ──
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, marginTop: 80 },
    emptyIconWrap: {
        width: 96, height: 96, borderRadius: 48,
        backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderLight,
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
    emptyBody: { fontSize: 14, fontWeight: '500', color: colors.textMuted, textAlign: 'center', lineHeight: 22 },

    // ── Battery Banner ──
    batteryBanner: {
        backgroundColor: '#FFF7ED',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#FED7AA',
    },
    batteryBannerTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    batteryIconWrap: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center',
        marginRight: 12,
    },
    batteryTitle: { fontSize: 14, fontWeight: '800', color: '#9A3412', marginBottom: 4 },
    batteryDesc: { fontSize: 12, fontWeight: '500', color: '#C2410C', lineHeight: 18, paddingRight: 8 },
    batteryClose: { padding: 4 },
    batteryBtn: {
        backgroundColor: '#EA580C',
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
    },
    batteryBtnTxt: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
});
