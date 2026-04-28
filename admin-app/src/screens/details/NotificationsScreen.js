import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    ActivityIndicator, RefreshControl, StatusBar,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Shadows } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import { apiService } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

// ── Type → Icon + Color ──────────────────────────────────────
const CFG = {
    call_overdue:        { icon: 'phone-missed', color: '#EF4444', bg: '#FEF2F2' },
    call_reminder:       { icon: 'phone-call',   color: '#3B82F6', bg: '#EFF6FF' },
    shift_reminder:      { icon: 'clock',        color: '#F59E0B', bg: '#FFFBEB' },
    medication_alert:    { icon: 'heart',         color: '#EC4899', bg: '#FDF2F8' },
    escalation_alert:    { icon: 'alert-triangle',color: '#EF4444', bg: '#FEF2F2' },
    sla_breach:          { icon: 'shield-off',    color: '#DC2626', bg: '#FEF2F2' },
    low_adherence_alert: { icon: 'trending-down', color: '#F97316', bg: '#FFF7ED' },
    compliance_alert:    { icon: 'activity',      color: '#EA580C', bg: '#FFF7ED' },
    patient_reassigned:  { icon: 'repeat',        color: '#10B981', bg: '#F0FDF4' },
    assignment_change:   { icon: 'users',         color: '#6366F1', bg: '#EEF2FF' },
    patient_update:      { icon: 'user-check',    color: '#3B82F6', bg: '#EFF6FF' },
    new_user_added:      { icon: 'user-plus',     color: '#7C3AED', bg: '#F5F3FF' },
    schedule_change:     { icon: 'calendar',      color: '#2563EB', bg: '#EFF6FF' },
    weekly_summary:      { icon: 'bar-chart-2',   color: '#6366F1', bg: '#EEF2FF' },
    report_ready:        { icon: 'file-text',     color: '#059669', bg: '#F0FDF4' },
    invoice_generated:   { icon: 'credit-card',   color: '#D97706', bg: '#FFFBEB' },
    payment_received:    { icon: 'check-circle',  color: '#10B981', bg: '#F0FDF4' },
    system_announcement: { icon: 'radio',         color: '#64748B', bg: '#F1F5F9' },
    account_activity:    { icon: 'shield',        color: '#64748B', bg: '#F1F5F9' },
    password_change:     { icon: 'lock',          color: '#64748B', bg: '#F1F5F9' },
};
const cfg = (t) => CFG[t] || { icon: 'bell', color: '#94A3B8', bg: '#F8FAFC' };

// ── Category bucket ──────────────────────────────────────────
const CAT = {
    call_overdue:'alerts',call_reminder:'alerts',shift_reminder:'alerts',medication_alert:'alerts',
    escalation_alert:'alerts',sla_breach:'alerts',low_adherence_alert:'alerts',compliance_alert:'alerts',
    patient_reassigned:'updates',assignment_change:'updates',patient_update:'updates',
    new_user_added:'updates',schedule_change:'updates',
    weekly_summary:'reports',report_ready:'reports',invoice_generated:'reports',payment_received:'reports',
    system_announcement:'system',account_activity:'system',password_change:'system',
};

// ── Helpers ──────────────────────────────────────────────────
const ago = (d) => {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 172800) return 'Yesterday';
    return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' });
};
const isToday = (d) => d && new Date(d).toDateString() === new Date().toDateString();

export default function NotificationsScreen({ navigation }) {
    const { profile } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [tab, setTab] = useState('all');

    const load = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const r = await apiService.notifications.getAll({ limit: 50 });
            setData(r.data?.data || []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const onRead = async (id, done) => {
        if (done) return;
        setData(p => p.map(n => (n._id || n.id) === id ? { ...n, status: 'read', isRead: true } : n));
        try { await apiService.notifications.markRead(id); } catch { load(true); }
    };

    const onReadAll = async () => {
        setData(p => p.map(n => ({ ...n, status: 'read', isRead: true })));
        try { await apiService.notifications.markAllRead(); } catch { load(true); }
    };

    const unread = data.filter(n => n.status !== 'read' && !n.isRead).length;
    const filtered = tab === 'all' ? data : data.filter(n => (CAT[n.type] || 'system') === tab);
    const today = filtered.filter(n => isToday(n.createdAt));
    const earlier = filtered.filter(n => !isToday(n.createdAt));

    const TABS = [
        { k: 'all',     l: 'All',     c: data.length },
        { k: 'alerts',  l: 'Alerts',  c: data.filter(n => (CAT[n.type]) === 'alerts').length },
        { k: 'updates', l: 'Updates', c: data.filter(n => (CAT[n.type]) === 'updates').length },
        { k: 'reports', l: 'Reports', c: data.filter(n => (CAT[n.type]) === 'reports').length },
        { k: 'system',  l: 'System',  c: data.filter(n => (CAT[n.type]) === 'system').length },
    ];

    // ── Single notification row (matches queue item pattern) ──
    const Row = ({ n, last }) => {
        const id = n._id || n.id;
        const read = n.status === 'read' || n.isRead;
        const c = cfg(n.type);
        const urgent = n.priority === 'urgent';
        const high = n.priority === 'high';

        return (
            <View>
                <TouchableOpacity
                    style={[s.row, !read && s.rowUnread]}
                    activeOpacity={0.7}
                    onPress={() => onRead(id, read)}
                >
                    {/* Icon square */}
                    <View style={[s.iconWrap, { backgroundColor: c.bg }]}>
                        <Feather name={c.icon} size={16} color={c.color} />
                    </View>
                    {/* Content */}
                    <View style={s.rowBody}>
                        <Text style={[s.rowTitle, !read && s.rowTitleBold]} numberOfLines={1}>{n.title}</Text>
                        <Text style={s.rowDesc} numberOfLines={2}>{n.body}</Text>
                        <View style={s.rowMeta}>
                            <View style={[s.metaTimePill]}>
                                <Feather name="clock" size={9} color="#94A3B8" />
                                <Text style={s.metaTime}>{ago(n.createdAt)}</Text>
                            </View>
                        </View>
                    </View>
                    {/* Priority / Status */}
                    <View style={s.rowRight}>
                        {urgent && <View style={[s.prioBadge, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}><Text style={[s.prioBadgeText, { color: '#EF4444' }]}>URGENT</Text></View>}
                        {high && !urgent && <View style={[s.prioBadge, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}><Text style={[s.prioBadgeText, { color: '#EA580C' }]}>HIGH</Text></View>}
                        {!read ? (
                            <View style={[s.unreadDot, { backgroundColor: urgent ? '#EF4444' : high ? '#F97316' : '#2563EB' }]} />
                        ) : (
                            <View style={s.readCheck}><Feather name="check" size={12} color="#CBD5E1" /></View>
                        )}
                    </View>
                </TouchableOpacity>
                {!last && <View style={s.divider} />}
            </View>
        );
    };

    const Section = ({ title, items }) => (
        <View style={s.section}>
            <View style={s.sectionRow}>
                <Text style={s.sectionTitle}>{title}</Text>
                <View style={s.sectionCountBadge}><Text style={s.sectionCountText}>{items.length} {items.length === 1 ? 'NOTIFICATION' : 'NOTIFICATIONS'}</Text></View>
            </View>
            <View style={s.listCard}>
                {items.map((n, i) => <Row key={n._id || n.id} n={n} last={i === items.length - 1} />)}
            </View>
        </View>
    );

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <GradientHeader
                title="Notifications"
                subtitle="Real-time Alerts & Updates"
                onBack={() => navigation.goBack()}
                rightAction={unread > 0 ? (
                    <TouchableOpacity style={s.headerBtn} onPress={onReadAll}>
                        <Feather name="check-circle" size={18} color="#FFF" />
                    </TouchableOpacity>
                ) : null}
            />

            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.content}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor="#4F46E5" />}
            >
                {/* ── KPI Strip ── */}
                {!loading && (
                    <View style={s.kpiRow}>
                        <View style={s.kpiBlock}>
                            <Ionicons name="notifications" size={36} color="#F1F5F9" style={s.kpiBg} />
                            <View style={[s.kpiIcon, { backgroundColor: '#EEF2FF' }]}><Feather name="inbox" size={14} color="#4F46E5" /></View>
                            <Text style={s.kpiVal}>{data.length}</Text>
                            <Text style={s.kpiLbl}>Total</Text>
                        </View>
                        <View style={s.kpiBlock}>
                            <Ionicons name="ellipse" size={36} color="#F1F5F9" style={s.kpiBg} />
                            <View style={[s.kpiIcon, { backgroundColor: unread > 0 ? '#FEF2F2' : '#F0FDF4' }]}><Feather name={unread > 0 ? 'bell' : 'check'} size={14} color={unread > 0 ? '#EF4444' : '#10B981'} /></View>
                            <Text style={s.kpiVal}>{unread}</Text>
                            <Text style={s.kpiLbl}>Unread</Text>
                        </View>
                        <View style={s.kpiBlock}>
                            <Ionicons name="today" size={36} color="#F1F5F9" style={s.kpiBg} />
                            <View style={[s.kpiIcon, { backgroundColor: '#F0FDF4' }]}><Feather name="sun" size={14} color="#10B981" /></View>
                            <Text style={s.kpiVal}>{data.filter(n => isToday(n.createdAt)).length}</Text>
                            <Text style={s.kpiLbl}>Today</Text>
                        </View>
                    </View>
                )}

                {/* ── Filter Tabs ── */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={s.tabContainer}>
                    {TABS.map(t => (
                        <TouchableOpacity key={t.k} style={[s.tabChip, tab === t.k && s.tabChipActive]} onPress={() => setTab(t.k)} activeOpacity={0.7}>
                            <Text style={[s.tabChipText, tab === t.k && s.tabChipTextActive]}>{t.l}</Text>
                            {t.c > 0 && <View style={[s.tabChipBadge, tab === t.k && s.tabChipBadgeActive]}><Text style={[s.tabChipBadgeText, tab === t.k && s.tabChipBadgeTextActive]}>{t.c}</Text></View>}
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* ── Content ── */}
                {loading && !refreshing ? (
                    <View style={{ gap: 16, marginTop: 8 }}>
                        <SkeletonLoader variant="card" style={{ height: 100 }} />
                        <SkeletonLoader variant="card" style={{ height: 140 }} />
                        <SkeletonLoader variant="card" style={{ height: 100 }} />
                    </View>
                ) : filtered.length === 0 ? (
                    <View style={s.emptyCard}>
                        <View style={s.emptyIconWrap}><Feather name={tab === 'all' ? 'bell-off' : 'inbox'} size={28} color="#94A3B8" /></View>
                        <Text style={s.emptyTitle}>{tab === 'all' ? 'All Caught Up' : 'No Results'}</Text>
                        <Text style={s.emptySub}>{tab === 'all' ? 'Notifications relevant to your role will appear here as events occur.' : 'No notifications in this category. Try a different filter.'}</Text>
                    </View>
                ) : (
                    <View>
                        {today.length > 0 && <Section title="Today" items={today} />}
                        {earlier.length > 0 && <Section title="Earlier" items={earlier} />}
                    </View>
                )}

            </ScrollView>
        </View>
    );
}

// ════════════════════════════════════════════════════════════
// HD Premium Aesthetic — matching CallerDashboard patterns
// ════════════════════════════════════════════════════════════
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F4F7F9' },
    scroll: { flex: 1 },
    content: { padding: 20, paddingBottom: 140 },

    // Header button
    headerBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center', alignItems: 'center',
    },

    // ── KPI Row ──
    kpiRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    kpiBlock: {
        flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16,
        borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.sm, overflow: 'hidden',
    },
    kpiBg: { position: 'absolute', bottom: -8, right: -8, opacity: 0.5 },
    kpiIcon: { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    kpiVal: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
    kpiLbl: { fontSize: 10, fontWeight: '700', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },

    // ── Tabs ──
    tabScroll: { marginBottom: 20, maxHeight: 42 },
    tabContainer: { gap: 8 },
    tabChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 9,
        borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0',
    },
    tabChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
    tabChipText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
    tabChipTextActive: { color: '#FFFFFF' },
    tabChipBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 6, minWidth: 20, alignItems: 'center', paddingVertical: 1, borderRadius: 6 },
    tabChipBadgeActive: { backgroundColor: 'rgba(255,255,255,0.15)' },
    tabChipBadgeText: { fontSize: 10, fontWeight: '800', color: '#94A3B8' },
    tabChipBadgeTextActive: { color: '#FFFFFF' },

    // ── Sections ──
    section: { marginBottom: 28 },
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A', textTransform: 'uppercase', letterSpacing: 1, paddingLeft: 4 },
    sectionCountBadge: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#EEF2FF', borderRadius: 8, borderWidth: 1, borderColor: '#E0E7FF' },
    sectionCountText: { fontSize: 10, fontWeight: '800', color: '#4F46E5', letterSpacing: 0.5 },

    // ── List Card ──
    listCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, paddingVertical: 6,
        borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.md,
    },

    // ── Row ──
    row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingVertical: 16 },
    rowUnread: { backgroundColor: '#FAFCFF' },

    // Icon
    iconWrap: {
        width: 44, height: 44, borderRadius: 14,
        justifyContent: 'center', alignItems: 'center', marginRight: 14,
    },

    // Body
    rowBody: { flex: 1, marginRight: 12 },
    rowTitle: { fontSize: 15, fontWeight: '600', color: '#334155', marginBottom: 3 },
    rowTitleBold: { fontWeight: '800', color: '#0F172A' },
    rowDesc: { fontSize: 13, fontWeight: '400', color: '#64748B', lineHeight: 19, marginBottom: 6 },
    rowMeta: { flexDirection: 'row', alignItems: 'center' },
    metaTimePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F8FAFC', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    metaTime: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.2 },

    // Right side
    rowRight: { alignItems: 'flex-end', gap: 6 },
    prioBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
        borderWidth: 1,
    },
    prioBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
    unreadDot: { width: 10, height: 10, borderRadius: 5 },
    readCheck: {
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center',
    },

    // Divider
    divider: { height: 1, backgroundColor: '#F1F5F9', marginLeft: 78, marginRight: 20 },

    // ── Empty ──
    emptyCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 40, alignItems: 'center',
        borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.md, marginTop: 8,
    },
    emptyIconWrap: {
        width: 64, height: 64, borderRadius: 20,
        backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 6 },
    emptySub: { fontSize: 13, fontWeight: '500', color: '#64748B', textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
});
