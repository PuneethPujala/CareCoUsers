import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import SkeletonLoader from '../../components/common/SkeletonLoader';

const STATS = [
    { label: 'Organizations', value: '12', icon: '🏥' },
    { label: 'Total Patients', value: '2.4K', icon: '👥' },
    { label: 'Active Callers', value: '156', icon: '📞' },
    { label: 'System Health', value: '99.2%', icon: '💚' },
];

const ORGS = [
    { id: 'o1', name: 'City General Hospital', patients: 420, adherence: 91, status: 'active' },
    { id: 'o2', name: 'Valley Health Center', patients: 285, adherence: 87, status: 'active' },
    { id: 'o3', name: 'Sunrise Medical', patients: 190, adherence: 78, status: 'warning' },
    { id: 'o4', name: 'Coastal Care Network', patients: 340, adherence: 93, status: 'active' },
];

const ESCALATIONS = [
    { id: 1, text: '3 missed calls at Sunrise Medical', time: '10 min ago', severity: 'error' },
    { id: 2, text: 'Low adherence alert: Valley Health', time: '25 min ago', severity: 'warning' },
    { id: 3, text: 'New org onboarding: Pacific Care', time: '1 hour ago', severity: 'info' },
];

function OrgRow({ item, navigation }) {
    return (
        <TouchableOpacity onPress={() => navigation.navigate('OrgDetail', { orgId: item.id })}
            activeOpacity={0.7} style={s.orgRow}>
            <View style={s.orgAvatar}><Text style={{ fontSize: 20 }}>🏥</Text></View>
            <View style={{ flex: 1 }}>
                <Text style={s.orgName}>{item.name}</Text>
                <Text style={s.orgSub}>{item.patients} patients · {item.adherence}% adherence</Text>
            </View>
            <StatusBadge label={item.status === 'active' ? 'Active' : 'Alert'} variant={item.status === 'active' ? 'success' : 'warning'} />
        </TouchableOpacity>
    );
}

export default function SuperAdminDashboard({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);


    return (
        <View style={s.container}>
            <GradientHeader
                title="System Overview"
                subtitle="Super Admin"
                colors={Colors.roleGradient.super_admin}
                rightAction={
                    <TouchableOpacity style={s.bellBtn} onPress={() => navigation.navigate('Notifications')}>
                        <Text style={{ fontSize: 20 }}>🔔</Text>
                        <View style={s.bellDot} />
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

                        {/* Create Organization */}
                        <TouchableOpacity
                            style={{ marginTop: Spacing.md, backgroundColor: '#059669', borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', ...Shadows.md }}
                            activeOpacity={0.85}
                            onPress={() => navigation.navigate('CreateOrganization')}
                        >
                            <Text style={{ ...Typography.button, color: '#fff' }}>+ Create Organization</Text>
                        </TouchableOpacity>

                        {/* Create Org Admin */}
                        <TouchableOpacity
                            style={{ marginTop: Spacing.sm, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', ...Shadows.md }}
                            activeOpacity={0.85}
                            onPress={() => navigation.navigate('CreateUser', { allowedRole: 'org_admin' })}
                        >
                            <Text style={{ ...Typography.button, color: '#fff' }}>+ Create Org Admin</Text>
                        </TouchableOpacity>

                        <View>
                            <View style={s.sectionHeader}>
                                <Text style={s.sectionTitle}>Organizations</Text>
                                <StatusBadge label={`${ORGS.length} total`} variant="primary" />
                            </View>
                            <PremiumCard style={{ padding: 0 }}>
                                {ORGS.map((o, i) => (
                                    <React.Fragment key={o.id}>
                                        {i > 0 && <View style={s.divider} />}
                                        <OrgRow item={o} navigation={navigation} />
                                    </React.Fragment>
                                ))}
                            </PremiumCard>
                        </View>

                        <View>
                            <View style={s.sectionHeader}>
                                <Text style={s.sectionTitle}>Escalations</Text>
                                <StatusBadge label={`${ESCALATIONS.length} active`} variant="warning" />
                            </View>
                            <PremiumCard style={{ padding: 0 }}>
                                {ESCALATIONS.map((e, i) => (
                                    <React.Fragment key={e.id}>
                                        {i > 0 && <View style={s.divider} />}
                                        <View style={s.escRow}>
                                            <View style={[s.escDot, { backgroundColor: Colors[e.severity] || Colors.info }]} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.escText}>{e.text}</Text>
                                                <Text style={s.escTime}>{e.time}</Text>
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
    bellDot: { position: 'absolute', top: 10, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.error, borderWidth: 2, borderColor: '#fff' },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
    statCard: { width: '48%', alignItems: 'center', paddingVertical: Spacing.md },
    statIcon: { fontSize: 28, marginBottom: Spacing.sm },
    statValue: { ...Typography.h2, color: Colors.textPrimary },
    statLabel: { ...Typography.tiny, color: Colors.textMuted, marginTop: Spacing.xs },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.md },
    sectionTitle: { ...Typography.h3, color: Colors.textPrimary },
    divider: { height: 1, backgroundColor: Colors.borderLight },
    // Org
    orgRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    orgAvatar: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    orgName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    orgSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    // Escalation
    escRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    escDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
    escText: { ...Typography.body, color: Colors.textPrimary, fontSize: 14 },
    escTime: { ...Typography.tiny, color: Colors.textMuted, marginTop: Spacing.xs },
});
