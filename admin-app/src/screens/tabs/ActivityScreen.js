import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, StatusBar, ActivityIndicator, Animated } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Theme } from '../../theme/theme';
import { Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import { apiService } from '../../lib/api';

const FILTERS = ['All', 'Calls', 'System', 'Alerts'];
const FILTER_MAP = { All: null, Calls: 'call', System: 'system', Alerts: 'alert' };

const ENTITY_SCREENS = {
    patient: 'PatientDetail',
    caller: 'CallerDetail',
    org: 'OrgDetail',
    manager: 'ManagerDetail',
};

const ENTITY_PARAMS = {
    patient: 'patientId',
    caller: 'callerId',
    org: 'orgId',
    manager: 'managerId',
};

const getActionType = (action) => {
    if (action.includes('call_log') || action.includes('call')) return 'call';
    if (action.includes('escalation') || action.includes('alert')) return 'alert';
    if (action.includes('patient') || action.includes('medication')) return 'patient';
    return 'system';
};

function ActivityItem({ item, navigation, isLast, index }) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 450, delay: index * 60, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 450, delay: index * 60, useNativeDriver: true })
        ]).start();
    }, []);

    const navigateToEntity = () => {
        const screen = ENTITY_SCREENS[item.entityType];
        const paramKey = ENTITY_PARAMS[item.entityType];
        if (screen && paramKey) {
            navigation.navigate(screen, { [paramKey]: item.entityId });
        }
    };

    const isError = item.status === 'error';
    const isWarning = item.type === 'alert';
    const sColors = isError 
        ? { dot: '#EF4444', line: '#FECACA', bg: '#FEF2F2', border: '#FECACA' }
        : isWarning 
        ? { dot: '#F59E0B', line: '#FDE68A', bg: '#FFFBEB', border: '#FDE68A' }
        : { dot: '#3B82F6', line: '#BFDBFE', bg: '#EFF6FF', border: '#BFDBFE' };

    return (
        <Animated.View style={[s.timelineItem, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <View style={s.timelineLeft}>
                <View style={[s.timelineIconWrap, { backgroundColor: sColors.bg, borderColor: sColors.border }]}>
                    <Feather name={item.iconName} size={18} color={sColors.dot} />
                </View>
                {!isLast && <View style={[s.timelineLine, { backgroundColor: sColors.line }]} />}
            </View>

            <TouchableOpacity style={s.timelineContent} activeOpacity={0.8} onPress={navigateToEntity}>
                <View style={[s.actCardInner, isError && s.actCardInnerError, isWarning && s.actCardInnerWarning]}>
                    <View style={s.actHeader}>
                        <Text style={s.actTitle}>{item.title}</Text>
                        <View style={s.actTimeBox}>
                            <Feather name="clock" size={10} color="#94A3B8" />
                            <Text style={s.actTime}>{item.time}</Text>
                        </View>
                    </View>
                    
                    <Text style={s.actEntity}>{item.entity}</Text>
                    
                    <View style={s.actFooter}>
                        <Text style={s.actDesc} numberOfLines={2}>{item.desc}</Text>
                        {item.status !== 'info' && (
                            <View style={[s.statusPill, { backgroundColor: sColors.bg, borderColor: sColors.border }]}>
                                <Text style={[s.statusLabel, { color: sColors.dot }]}>{item.status.toUpperCase()}</Text>
                            </View>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

export default function ActivityScreen({ navigation }) {
    const [filter, setFilter] = useState('All');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activities, setActivities] = useState([]);

    const fetchActivities = useCallback(async (isRefresh = false) => {
        try {
            if (!isRefresh) setLoading(true);
            const res = await apiService.reports.getSystemActivity({ days: 7 });
            const logs = Array.isArray(res.data?.activity) ? res.data.activity : (Array.isArray(res.data) ? res.data : []);
            
            const feedItems = logs.map((log, i) => {
                const type = getActionType(log.action || '');
                let iconName = 'info';
                if (type === 'call') iconName = 'phone-call';
                if (type === 'alert') iconName = 'alert-octagon';
                if (type === 'patient') iconName = 'user';
                
                return {
                    id: log._id || i,
                    type,
                    iconName,
                    title: (log.action || 'Event').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    entity: log.resourceType || 'System Protocol',
                    entityType: log.resourceType || 'system',
                    entityId: log.resourceId,
                    time: new Date(log.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    status: log.outcome === 'success' ? 'success' : log.outcome === 'failure' ? 'error' : 'info',
                    desc: log.details ? JSON.stringify(log.details).replace(/"/g, '') : 'Executed routine automated background system action log protocol and saved telemetry.',
                };
            });
            setActivities(feedItems);
        } catch (error) {
            console.error('[ActivityScreen] Failed to fetch:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchActivities(); }, [fetchActivities]);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchActivities(true); }, [fetchActivities]);

    const filtered = filter === 'All' ? activities : activities.filter(a => a.type === FILTER_MAP[filter]);
    
    return (
        <View style={s.container}>
            <StatusBar barStyle="light-content" />
            <GradientHeader 
                title="Activity Timeline" 
                subtitle="Live comprehensive global event log" 
                onBack={() => navigation.goBack()} 
            />

            {/* ── Filter Module ── */}
            <View style={s.filterContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
                    {FILTERS.map((f) => {
                        const isActive = filter === f;
                        return (
                            <TouchableOpacity
                                key={f}
                                onPress={() => setFilter(f)}
                                style={[s.filterTab, isActive && s.filterTabActive]}
                                activeOpacity={0.8}
                            >
                                <Text style={[s.filterText, isActive && s.filterTextActive]}>{f}</Text>
                                {isActive && <Feather name="check" size={12} color="#FFFFFF" style={{ marginLeft: 6 }} />}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            <ScrollView 
                style={s.body} 
                contentContainerStyle={s.scrollContent} 
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
            >
                {loading && !refreshing ? (
                    <View style={s.centerBox}>
                        <ActivityIndicator size="large" color="#4F46E5" />
                        <Text style={s.loadingText}>Fetching timeline streams...</Text>
                    </View>
                ) : filtered.length === 0 ? (
                    <View style={s.emptyBoxCard}>
                        <Ionicons name="documents-outline" size={80} color="#F1F5F9" style={s.emptyBgIcon} />
                        <View style={s.emptyIconWrap}>
                            <Feather name="activity" size={32} color="#94A3B8" />
                        </View>
                        <Text style={s.emptyTitle}>Log is clear</Text>
                        <Text style={s.emptySubtitle}>{`No ${filter.toLowerCase()} telemetry frames recorded in this 7-day query block.`}</Text>
                    </View>
                ) : (
                    <View style={s.timelineGroup}>
                        <View style={s.timelineBackdropCard}>
                            {filtered.map((item, i) => (
                                <ActivityItem key={item.id} item={item} index={i} navigation={navigation} isLast={i === filtered.length - 1} />
                            ))}
                        </View>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

// ══════════════════════════════════════════
// Solid HD Premium Aesthetic
// ══════════════════════════════════════════
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F7F9' },
    body: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 140 }, // Breathing room
    
    // Filters
    filterContainer: {
        paddingVertical: 16,
        backgroundColor: 'transparent',
    },
    filterRow: { paddingHorizontal: 20, gap: 10 },
    filterTab: { 
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 18, paddingVertical: 10, 
        borderRadius: 14, 
        backgroundColor: '#FFFFFF',
        borderWidth: 1, borderColor: '#F1F5F9',
        ...Shadows.sm, shadowColor: '#94A3B8', shadowOpacity: 0.1
    },
    filterTabActive: { 
        backgroundColor: '#0F172A',
        borderColor: '#0F172A',
        ...Shadows.md, shadowColor: '#0F172A', shadowOpacity: 0.3
    },
    filterText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
    filterTextActive: { color: '#FFFFFF' },
    
    // Timeline Module
    timelineGroup: { paddingTop: 10 },
    timelineBackdropCard: { 
        backgroundColor: '#FFFFFF',
        padding: 24, paddingRight: 20,
        borderRadius: 28,
        ...Shadows.lg, shadowColor: '#64748B', shadowOpacity: 0.08,
        borderWidth: 1, borderColor: '#F1F5F9',
    },

    timelineItem: { flexDirection: 'row' },
    timelineLeft: { width: 50, alignItems: 'center', marginRight: 16 },
    timelineIconWrap: { 
        width: 48, height: 48, borderRadius: 16, 
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 1,
        zIndex: 2,
    },
    timelineLine: { width: 2, flex: 1, marginVertical: 8, opacity: 0.5 },
    
    timelineContent: { flex: 1, paddingBottom: 32, paddingTop: 2 },
    
    // Individual Cards internal
    actCardInner: {
        backgroundColor: '#F8FAFC', padding: 18, borderRadius: 20,
        borderWidth: 1, borderColor: '#F1F5F9',
    },
    actCardInnerError: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
    actCardInnerWarning: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },

    actHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    actTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2, lineHeight: 22, marginRight: 8 },
    actTimeBox: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#F1F5F9' },
    actTime: { fontSize: 11, color: '#64748B', fontWeight: '700' },
    
    actEntity: { fontSize: 11, fontWeight: '800', color: '#4F46E5', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 0.5 },
    
    actFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
    actDesc: { flex: 1, fontSize: 13, color: '#64748B', lineHeight: 20, fontWeight: '500' },
    
    statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
    statusLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },

    // States
    centerBox: { paddingTop: 60, alignItems: 'center', gap: 16 },
    loadingText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
    
    emptyBoxCard: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.md, marginTop: 20, overflow: 'hidden' },
    emptyBgIcon: { position: 'absolute', left: -20, top: -20, transform: [{rotate: '-20deg'}] },
    emptyIconWrap: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, fontWeight: '500' }
});
