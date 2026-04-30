import React, { useState, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Platform, Pressable,
    ActivityIndicator, Animated, StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
    X, Pill, Heart, Calendar, AlertCircle, MessageSquare,
    BellOff, PhoneMissed, CheckCheck, Bell,
} from 'lucide-react-native';
import { apiService } from '../../lib/api';

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
    primary: '#6366F1',
    dark: '#0F172A',
    mid: '#334155',
    muted: '#94A3B8',
    light: '#CBD5E1',
    border: '#F1F5F9',
    borderMid: '#E2E8F0',
    danger: '#F43F5E',
    success: '#22C55E',
    warning: '#F59E0B',
    info: '#3B82F6',
    pageBg: '#FFFFFF',
    contentBg: '#F8FAFC',
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
    const [activeTab, setActiveTab] = useState('all');
    const [loading, setLoading] = useState(true);
    const [markingAll, setMarkingAll] = useState(false);
    const [notifications, setNotifications] = useState([]);
    // Ref so we can check staleness inside async callbacks without stale closures
    const notificationsRef = useRef([]);

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
                    color: b.is_read ? C.muted : C.primary,
                    bg: b.is_read ? C.border : '#EEF2FF',
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
                morning: '09:00', afternoon: '14:00', evening: '18:00', night: '20:00',
            };

            medicines.forEach(m => {
                if (!m.taken) {
                    const timeKey = m.scheduled_time || m.type || 'morning';
                    const timePref = prefs[timeKey] || (
                        timeKey === 'morning' ? '09:00' :
                        timeKey === 'afternoon' ? '14:00' :
                        timeKey === 'evening' ? '18:00' : '20:00'
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
                            color: diffHours < -0.5 ? C.danger : C.info,
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
                        color: C.warning,
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
        }
    }, []);

    // ─── Focus effect — stable, no infinite loop ──────────────────────────────
    useFocusEffect(
        useCallback(() => {
            fetchContext();
        }, [fetchContext])
    );

    // ─── Mark a single backend notification as read, then navigate ────────────
    const handleNotificationPress = useCallback(async (item) => {
        if (item.isBackend && !item.isRead) {
            // Optimistic update first for snappy UI
            setNotifications(prev =>
                prev.map(n =>
                    n.id === item.id
                        ? { ...n, isRead: true, color: C.muted, bg: C.border, actionTxt: 'Open' }
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
                            ? { ...n, isRead: false, color: C.primary, bg: '#EEF2FF', actionTxt: 'View' }
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
                        ? { ...n, isRead: true, color: C.muted, bg: C.border, actionTxt: 'Open' }
                        : n
                )
            );
        } catch (err) {
            console.warn('[NotificationsScreen] markAllRead failed:', err.message);
        } finally {
            setMarkingAll(false);
        }
    }, [notifications, markingAll]);

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
            <StatusBar barStyle="dark-content" backgroundColor={C.pageBg} />

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
                        <X size={20} color={C.dark} strokeWidth={2.5} />
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
            >
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
                    GROUP_ORDER.map(group => {
                        const groupItems = notifications.filter(n => n.group === group);
                        const filtered = getFilteredItems(groupItems);
                        if (filtered.length === 0) return null;

                        return (
                            <View key={group} style={s.groupSection}>
                                <Text style={s.groupHeader}>{group.toUpperCase()}</Text>
                                {filtered.map(item => (
                                    <NotificationCard
                                        key={item.id}
                                        item={item}
                                        onPress={handleNotificationPress}
                                    />
                                ))}
                            </View>
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
    container: { flex: 1, backgroundColor: C.pageBg },

    // ── Header ──
    header: {
        flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 60 : 44,
        paddingHorizontal: 24,
        paddingBottom: 20,
        backgroundColor: C.pageBg,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
    },
    headerLabel: { fontSize: 11, fontWeight: '800', color: C.muted, letterSpacing: 2, marginBottom: 4 },
    headerTitle: { fontSize: 28, fontWeight: '900', color: C.dark, letterSpacing: -0.8 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 2 },
    markAllBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: 12, borderWidth: 1, borderColor: '#C7D2FE',
    },
    markAllTxt: { fontSize: 12, fontWeight: '700', color: C.primary },
    closeBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: C.contentBg, borderWidth: 1, borderColor: C.borderMid,
        alignItems: 'center', justifyContent: 'center',
    },

    // ── Tabs ──
    tabsWrap: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 },
    tabsBg: { flexDirection: 'row', backgroundColor: C.contentBg, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: C.borderMid },
    tab: { flex: 1, flexDirection: 'row', paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 12, gap: 6 },
    tabActive: { backgroundColor: C.pageBg, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
    tabText: { fontSize: 13, fontWeight: '600', color: C.muted },
    tabTextActive: { color: C.dark, fontWeight: '800' },
    tabBadge: { backgroundColor: C.primary, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    tabBadgeTxt: { fontSize: 10, fontWeight: '800', color: '#FFF' },

    // ── List ──
    list: { flex: 1 },
    listContent: { paddingHorizontal: 20, paddingTop: 16, minHeight: '100%' },

    skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },

    groupSection: { marginBottom: 32 },
    groupHeader: { fontSize: 11, fontWeight: '800', color: C.muted, marginBottom: 12, letterSpacing: 1.5 },

    // ── Card ──
    card: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: C.pageBg, borderRadius: 18,
        padding: 14, marginBottom: 10,
        borderWidth: 1, borderColor: C.border,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03, shadowRadius: 6, elevation: 1,
    },
    unreadDot: {
        position: 'absolute', top: 14, left: 8,
        width: 6, height: 6, borderRadius: 3,
        backgroundColor: C.primary,
    },
    iconAvatar: {
        width: 44, height: 44, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
        marginRight: 12, flexShrink: 0,
    },
    cardBody: { flex: 1, marginRight: 10 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
    cardName: { fontSize: 13, fontWeight: '600', color: C.mid, flex: 1, marginRight: 6 },
    cardNameUnread: { fontWeight: '800', color: C.dark },
    cardAction: { fontSize: 12, fontWeight: '500', color: C.muted, lineHeight: 17 },
    timeTxt: { fontSize: 10, fontWeight: '700', color: C.light, flexShrink: 0 },
    actionBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, flexShrink: 0 },
    actionBtnTxt: { fontSize: 11, fontWeight: '800' },

    // ── Empty State ──
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, marginTop: 80 },
    emptyIconWrap: {
        width: 96, height: 96, borderRadius: 48,
        backgroundColor: C.contentBg, borderWidth: 1, borderColor: C.borderMid,
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: C.dark, marginBottom: 8, textAlign: 'center' },
    emptyBody: { fontSize: 14, fontWeight: '500', color: C.muted, textAlign: 'center', lineHeight: 22 },
});
