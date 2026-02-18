import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import SkeletonLoader from '../../components/common/SkeletonLoader';

const STATS = [
    { label: 'Managers', value: '8', icon: '📋' },
    { label: 'Callers', value: '42', icon: '📞' },
    { label: 'Patients', value: '420', icon: '👥' },
    { label: 'Adherence', value: '91%', icon: '✅' },
];

const QUEUE = [
    { id: 'q1', patient: 'Robert Williams', priority: 'high', waitTime: '15 min' },
    { id: 'q2', patient: 'Margaret Chen', priority: 'medium', waitTime: '8 min' },
    { id: 'q3', patient: 'James Wilson', priority: 'low', waitTime: '3 min' },
];

const MANAGERS = [
    { id: 'm1', name: 'Alice Manager', callers: 12, patients: 85, load: 78 },
    { id: 'm2', name: 'Bob Director', callers: 8, patients: 62, load: 55 },
    { id: 'm3', name: 'Carol Lead', callers: 15, patients: 110, load: 92 },
];

function ManagerRow({ item, navigation }) {
    const loadColor = item.load > 85 ? Colors.error : item.load > 65 ? Colors.warning : Colors.success;
    return (
        <TouchableOpacity onPress={() => navigation.navigate('ManagerDetail', { managerId: item.id })}
            activeOpacity={0.7} style={s.mgrRow}>
            <View style={s.mgrAvatar}><Text style={s.mgrAvatarText}>{item.name.charAt(0)}</Text></View>
            <View style={{ flex: 1 }}>
                <Text style={s.mgrName}>{item.name}</Text>
                <Text style={s.mgrSub}>{item.callers} callers · {item.patients} patients</Text>
                <View style={s.loadBar}><View style={[s.loadFill, { width: `${item.load}%`, backgroundColor: loadColor }]} /></View>
            </View>
            <Text style={[s.loadPct, { color: loadColor }]}>{item.load}%</Text>
        </TouchableOpacity>
    );
}

export default function OrgAdminDashboard({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);


const handleAssign = (patient) => {
        Alert.alert('Assign Patient', `Assign ${patient} to:`, [
            ...MANAGERS.map(m => ({ text: m.name, onPress: () => Alert.alert('Assigned', `${patient} assigned to ${m.name}`) })),
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    return (
        <View style={s.container}>
            <GradientHeader
                title="Organization"
                subtitle="Admin Dashboard"
                colors={Colors.roleGradient.org_admin}
                rightAction={
                    <TouchableOpacity style={s.bellBtn} onPress={() => navigation.navigate('Notifications')}>
                        <Text style={{ fontSize: 20 }}>🔔</Text>
                    </TouchableOpacity>
                }
            />

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
                {loading ? (
                    <View style={{ paddingTop: Spacing.md }}>
                        <View style={s.statsGrid}>{[0, 1, 2, 3].map(i => <SkeletonLoader key={i} variant="stat" />)}</View>
                        <SkeletonLoader variant="card" style={{ marginTop: Spacing.lg }} />
                    </View>
                ) : (
                    <>
                        <View style={s.statsGrid}>
                            {STATS.map((item, i) => (
                                <PremiumCard key={i} style={s.statCard}>
                                    <Text style={s.statIcon}>{item.icon}</Text>
                                    <Text style={s.statValue}>{item.value}</Text>
                                    <Text style={s.statLabel}>{item.label}</Text>
                                </PremiumCard>
                            ))}
                        </View>

                        <View>
                            <View style={s.sectionHeader}>
                                <Text style={s.sectionTitle}>Routing Queue</Text>
                                <StatusBadge label={`${QUEUE.length} pending`} variant="warning" />
                            </View>
                            <PremiumCard style={{ padding: 0 }}>
                                {QUEUE.map((q, i) => (
                                    <React.Fragment key={q.id}>
                                        {i > 0 && <View style={s.divider} />}
                                        <View style={s.queueRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.queueName}>{q.patient}</Text>
                                                <Text style={s.queueWait}>Waiting {q.waitTime}</Text>
                                            </View>
                                            <StatusBadge label={q.priority} variant={q.priority === 'high' ? 'error' : q.priority === 'medium' ? 'warning' : 'neutral'} />
                                            <TouchableOpacity style={s.assignBtn} onPress={() => handleAssign(q.patient)}>
                                                <Text style={s.assignText}>Assign</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </React.Fragment>
                                ))}
                            </PremiumCard>
                        </View>

                        <View>
                            <View style={s.sectionHeader}>
                                <Text style={s.sectionTitle}>Manager Workload</Text>
                            </View>
                            <PremiumCard style={{ padding: 0 }}>
                                {MANAGERS.map((m, i) => (
                                    <React.Fragment key={m.id}>
                                        {i > 0 && <View style={s.divider} />}
                                        <ManagerRow item={m} navigation={navigation} />
                                    </React.Fragment>
                                ))}
                            </PremiumCard>
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    body: { flex: 1, paddingHorizontal: Spacing.md },
    bellBtn: { width: 44, height: 44, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
    statCard: { width: '48%', alignItems: 'center', paddingVertical: Spacing.md },
    statIcon: { fontSize: 28, marginBottom: Spacing.sm },
    statValue: { ...Typography.h2, color: Colors.textPrimary },
    statLabel: { ...Typography.tiny, color: Colors.textMuted, marginTop: Spacing.xs },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.md },
    sectionTitle: { ...Typography.h3, color: Colors.textPrimary },
    divider: { height: 1, backgroundColor: Colors.borderLight },
    // Queue
    queueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    queueName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    queueWait: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    assignBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.sm, backgroundColor: Colors.surfaceAlt },
    assignText: { ...Typography.tiny, color: Colors.primary, fontWeight: '700' },
    // Manager
    mgrRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    mgrAvatar: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    mgrAvatarText: { ...Typography.bodySemibold, color: Colors.primary },
    mgrName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    mgrSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    loadBar: { height: 4, backgroundColor: Colors.borderLight, borderRadius: 2, marginTop: Spacing.sm, width: '100%' },
    loadFill: { height: 4, borderRadius: 2 },
    loadPct: { ...Typography.captionBold, minWidth: 36, textAlign: 'right' },
});
