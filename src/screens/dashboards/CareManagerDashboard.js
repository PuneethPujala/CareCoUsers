import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';

import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import SkeletonLoader from '../../components/common/SkeletonLoader';

const STATS = [
    { label: 'Active Cases', value: '142', icon: '📊', color: Colors.primary },
    { label: 'Adherence', value: '87%', icon: '✅', color: Colors.success },
    { label: 'Call Volume', value: '328', icon: '📞', color: '#7C3AED' },
    { label: 'Alerts', value: '5', icon: '⚠️', color: Colors.warning },
];

const PERFORMERS = [
    { id: 'c1', name: 'Sarah Johnson', score: 96, calls: 28, status: 'active' },
    { id: 'c2', name: 'Mike Chen', score: 91, calls: 24, status: 'active' },
    { id: 'c3', name: 'Emily Davis', score: 88, calls: 22, status: 'break' },
];

const ACTIVITIES = [
    { id: 1, icon: '📞', text: 'Sarah completed call with Robert Williams', time: '5 min ago', type: 'call' },
    { id: 2, icon: '⚠️', text: 'Missed call alert for Margaret Chen', time: '15 min ago', type: 'alert' },
    { id: 3, icon: '✅', text: 'Mike achieved 100% adherence check', time: '30 min ago', type: 'success' },
    { id: 4, icon: '📋', text: 'New patient assigned to Emily Davis', time: '1 hour ago', type: 'info' },
];

function PerformerRow({ item, navigation }) {
    return (
        <TouchableOpacity onPress={() => navigation.navigate('CallerDetail', { callerId: item.id })}
            activeOpacity={0.7} style={s.perfRow}>
            <View style={s.perfAvatar}><Text style={s.perfAvatarText}>{item.name.charAt(0)}</Text></View>
            <View style={{ flex: 1 }}>
                <Text style={s.perfName}>{item.name}</Text>
                <Text style={s.perfSub}>{item.calls} calls today</Text>
            </View>
            <View style={s.perfScoreWrap}>
                <Text style={s.perfScore}>{item.score}</Text>
            </View>
            <StatusBadge label={item.status} variant={item.status === 'active' ? 'success' : 'warning'} />
        </TouchableOpacity>
    );
}

export default function CareManagerDashboard({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);


return (
        <View style={s.container}>
            <GradientHeader
                title={`${user?.name?.split(' ')[0] || 'Manager'} Dashboard`}
                subtitle="Care Manager Overview"
                colors={Colors.roleGradient.care_manager}
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
                                    <View style={[s.statDot, { backgroundColor: item.color }]} />
                                    <Text style={s.statValue}>{item.value}</Text>
                                    <Text style={s.statLabel}>{item.label}</Text>
                                </PremiumCard>
                            ))}
                        </View>

                        <View>
                            <View style={s.sectionHeader}>
                                <Text style={s.sectionTitle}>Top Performers</Text>
                                <TouchableOpacity><Text style={s.viewAll}>View All</Text></TouchableOpacity>
                            </View>
                            <PremiumCard style={{ padding: 0 }}>
                                {PERFORMERS.map((p, i) => (
                                    <React.Fragment key={p.id}>
                                        {i > 0 && <View style={s.divider} />}
                                        <PerformerRow item={p} navigation={navigation} />
                                    </React.Fragment>
                                ))}
                            </PremiumCard>
                        </View>

                        <View>
                            <View style={s.sectionHeader}>
                                <Text style={s.sectionTitle}>Recent Activity</Text>
                                <TouchableOpacity><Text style={s.viewAll}>View All</Text></TouchableOpacity>
                            </View>
                            <PremiumCard style={{ padding: 0 }}>
                                {ACTIVITIES.map((a, i) => (
                                    <React.Fragment key={a.id}>
                                        {i > 0 && <View style={s.divider} />}
                                        <View style={s.actRow}>
                                            <Text style={s.actIcon}>{a.icon}</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.actText}>{a.text}</Text>
                                                <Text style={s.actTime}>{a.time}</Text>
                                            </View>
                                        </View>
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
    // Stats
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
    statCard: { width: '48%', alignItems: 'center', paddingVertical: Spacing.md },
    statDot: { width: 8, height: 8, borderRadius: 4, marginBottom: Spacing.sm },
    statValue: { ...Typography.h2, color: Colors.textPrimary },
    statLabel: { ...Typography.tiny, color: Colors.textMuted, marginTop: Spacing.xs },
    // Section
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.md },
    sectionTitle: { ...Typography.h3, color: Colors.textPrimary },
    viewAll: { ...Typography.caption, color: Colors.primary, fontWeight: '600' },
    divider: { height: 1, backgroundColor: Colors.borderLight },
    // Performer
    perfRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    perfAvatar: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    perfAvatarText: { ...Typography.bodySemibold, color: Colors.primary },
    perfName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    perfSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    perfScoreWrap: { backgroundColor: Colors.surfaceAlt, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs, borderRadius: Radius.sm },
    perfScore: { ...Typography.captionBold, color: Colors.primary },
    // Activity
    actRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    actIcon: { fontSize: 20, marginTop: 2 },
    actText: { ...Typography.body, color: Colors.textPrimary, fontSize: 14 },
    actTime: { ...Typography.tiny, color: Colors.textMuted, marginTop: Spacing.xs },
});
