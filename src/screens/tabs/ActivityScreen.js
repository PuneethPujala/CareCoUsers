import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';

const FILTERS = ['All', 'Calls', 'Patients', 'Alerts'];

const ACTIVITIES = [
    { id: 1, type: 'call', icon: '📞', title: 'Call completed', entity: 'Robert Williams', entityType: 'patient', entityId: 'p1', time: '5 min ago', status: 'success', desc: '12 min call — all meds reviewed' },
    { id: 2, type: 'alert', icon: '⚠️', title: 'Missed call alert', entity: 'Margaret Chen', entityType: 'patient', entityId: 'p2', time: '15 min ago', status: 'error', desc: 'Patient was unavailable' },
    { id: 3, type: 'call', icon: '✅', title: 'Adherence check passed', entity: 'Sarah Johnson', entityType: 'caller', entityId: 'c1', time: '30 min ago', status: 'success', desc: '100% adherence rate this week' },
    { id: 4, type: 'patient', icon: '👤', title: 'New patient assigned', entity: 'James Wilson', entityType: 'patient', entityId: 'p3', time: '1 hour ago', status: 'info', desc: 'Post-surgery care plan activated' },
    { id: 5, type: 'alert', icon: '🚨', title: 'Escalation raised', entity: 'City General Hospital', entityType: 'org', entityId: 'o1', time: '2 hours ago', status: 'warning', desc: 'Manager review requested' },
    { id: 6, type: 'call', icon: '📞', title: 'Scheduled call', entity: 'Alice Manager', entityType: 'manager', entityId: 'm1', time: '3 hours ago', status: 'info', desc: 'Team coordination call' },
    { id: 7, type: 'patient', icon: '💊', title: 'Medication updated', entity: 'Robert Williams', entityType: 'patient', entityId: 'p1', time: '4 hours ago', status: 'info', desc: 'Dosage adjusted by physician' },
];

const FILTER_MAP = { All: null, Calls: 'call', Patients: 'patient', Alerts: 'alert' };

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

function ActivityItem({ item, navigation, isLast }) {
    const navigateToEntity = () => {
        const screen = ENTITY_SCREENS[item.entityType];
        const paramKey = ENTITY_PARAMS[item.entityType];
        if (screen && paramKey) {
            navigation.navigate(screen, { [paramKey]: item.entityId });
        }
    };

    return (
        <View style={s.timelineItem}>
            {/* Timeline connector */}
            <View style={s.timelineLeft}>
                <View style={[s.timelineDot, { backgroundColor: Colors[item.status] || Colors.info }]} />
                {!isLast && <View style={s.timelineLine} />}
            </View>

            {/* Content */}
            <TouchableOpacity style={s.timelineContent} activeOpacity={0.7}
                onPress={navigateToEntity}>
                <PremiumCard style={s.actCard}>
                    <View style={s.actHeader}>
                        <Text style={s.actIcon}>{item.icon}</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={s.actTitle}>{item.title}</Text>
                            <Text style={s.actEntity}>{item.entity}</Text>
                        </View>
                        <StatusBadge label={item.status} variant={item.status} />
                    </View>
                    <Text style={s.actDesc}>{item.desc}</Text>
                    <Text style={s.actTime}>{item.time}</Text>
                </PremiumCard>
            </TouchableOpacity>
        </View>
    );
}

export default function ActivityScreen({ navigation }) {
    const [filter, setFilter] = useState('All');
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);

    const filtered = filter === 'All' ? ACTIVITIES : ACTIVITIES.filter(a => a.type === FILTER_MAP[filter]);
return (
        <View style={s.container}>
            <GradientHeader title="Activity" subtitle="Recent Updates" />

            {/* Filter Tabs */}
            <View style={s.filterRow}>
                {FILTERS.map((f) => (
                    <TouchableOpacity
                        key={f}
                        onPress={() => setFilter(f)}
                        style={[s.filterTab, filter === f && s.filterTabActive]}
                        activeOpacity={0.8}
                    >
                        <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
                <View>
                    {filtered.length === 0 ? (
                        <EmptyState icon="📭" title="No activity" subtitle={`No ${filter.toLowerCase()} activity to show`} />
                    ) : (
                        <View style={s.timeline}>
                            {filtered.map((item, i) => (
                                <ActivityItem key={item.id} item={item} navigation={navigation} isLast={i === filtered.length - 1} />
                            ))}
                        </View>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    body: { flex: 1, paddingHorizontal: Spacing.md },
    // Filters
    filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: Spacing.sm, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
    filterTab: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.background },
    filterTabActive: { backgroundColor: Colors.primary },
    filterText: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '600' },
    filterTextActive: { color: '#fff' },
    // Timeline
    timeline: { paddingTop: Spacing.md },
    timelineItem: { flexDirection: 'row', marginBottom: 0 },
    timelineLeft: { width: 28, alignItems: 'center' },
    timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 20, zIndex: 1 },
    timelineLine: { width: 2, flex: 1, backgroundColor: Colors.borderLight, marginTop: -2 },
    timelineContent: { flex: 1, paddingLeft: Spacing.sm, paddingBottom: Spacing.sm },
    // Activity Card
    actCard: { padding: Spacing.md },
    actHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
    actIcon: { fontSize: 20, marginTop: 2 },
    actTitle: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    actEntity: { ...Typography.caption, color: Colors.primary, fontWeight: '600', marginTop: 2 },
    actDesc: { ...Typography.body, color: Colors.textSecondary, fontSize: 13, marginBottom: Spacing.sm },
    actTime: { ...Typography.tiny, color: Colors.textMuted },
});
