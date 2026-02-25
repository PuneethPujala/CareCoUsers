import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import SkeletonLoader from '../../components/common/SkeletonLoader';

const STATS = [
    {
        label: "Today's Calls", value: '8', icon: '📞', trend: '+2'
    },
    { label: 'Calls Done', value: '5', icon: '✅', trend: null },
    { label: 'Pending', value: '3', icon: '⏳', trend: null },
    { label: 'Avg Duration', value: '12m', icon: '⏱️', trend: '-1m' },
];

const CALLS = [
    { id: 1, name: 'Robert Williams', tags: ['Diabetes', 'Follow-up'], time: '9:30 AM', meds: 4, overdue: false, patientId: 'p1' },
    { id: 2, name: 'Margaret Chen', tags: ['Hypertension', 'Overdue'], time: '10:00 AM', meds: 3, overdue: true, patientId: 'p2' },
    { id: 3, name: 'James Wilson', tags: ['Post-Surgery'], time: '11:00 AM', meds: 6, overdue: false, patientId: 'p3' },
];

function StatCard({ item, index }) {
return (
        <View style={s.statCard}>
            <PremiumCard style={s.statInner}>
                <Text style={s.statIcon}>{item.icon}</Text>
                <Text style={s.statValue}>{item.value}</Text>
                <Text style={s.statLabel}>{item.label}</Text>
                {item.trend && <Text style={[s.statTrend, item.trend.startsWith('+') ? s.trendUp : s.trendDown]}>{item.trend}</Text>}
            </PremiumCard>
        </View>
    );
}

function CallCard({ item, navigation }) {
    return (
        <PremiumCard style={s.callCard}>
            <TouchableOpacity style={s.callHeader} activeOpacity={0.7}
                onPress={() => navigation.navigate('PatientDetail', { patientId: item.patientId })}>
                <View style={[s.callAvatar, item.overdue && { backgroundColor: Colors.errorLight }]}>
                    <Text style={s.callAvatarText}>{item.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={s.callName}>{item.name}</Text>
                    <View style={s.tagRow}>
                        {item.tags.map((t, i) => (
                            <StatusBadge key={i} label={t} variant={t === 'Overdue' ? 'error' : 'primary'} />
                        ))}
                    </View>
                </View>
            </TouchableOpacity>
            <View style={s.callMeta}>
                <Text style={s.callTime}>🕐 {item.time}</Text>
                <Text style={s.callMeds}>💊 {item.meds} medications</Text>
            </View>
            {item.overdue && (
                <View style={s.overdueBanner}>
                    <Text style={s.overdueText}>⏱ Call overdue — please call now</Text>
                </View>
            )}
            <TouchableOpacity style={s.callNowBtn} activeOpacity={0.8}
                onPress={() => navigation.navigate('ActiveCall', { patient: { name: item.name, meds: Array(item.meds).fill('Medication') } })}>
                <Text style={s.callNowIcon}>📞</Text>
                <Text style={s.callNowText}>Call Now</Text>
            </TouchableOpacity>
        </PremiumCard>
    );
}

export default function CallerDashboard({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        setTimeout(() => setRefreshing(false), 800);
    }, []);

    const handleEmergencySOS = () => {
        Alert.alert(
            'Emergency SOS',
            'Are you sure you want to trigger emergency assistance?',
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: 'Call Emergency', 
                    style: 'destructive',
                    onPress: () => navigation.navigate('Emergency')
                }
            ]
        );
    };

    return (
        <View style={s.container}>
            <GradientHeader
                title={`Hi, ${user?.name?.split(' ')[0] || 'there'} 👋`}
                subtitle="Today's Schedule"
                rightAction={
                    <TouchableOpacity style={s.bellBtn} onPress={() => navigation.navigate('Notifications')}>
                        <Text style={{ fontSize: 20 }}>🔔</Text>
                        <View style={s.bellDot} />
                    </TouchableOpacity>
                }
            />

            <ScrollView
                style={s.body}
                contentContainerStyle={{ paddingBottom: 32 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
            >
                {loading ? (
                    <View style={s.skeletonArea}>
                        <View style={s.skeletonStats}>{[0, 1, 2, 3].map(i => <SkeletonLoader key={i} variant="stat" />)}</View>
                        <SkeletonLoader variant="card" style={{ marginTop: Spacing.md }} />
                        <SkeletonLoader variant="card" style={{ marginTop: Spacing.md }} />
                    </View>
                ) : (
                    <>
                        {/* Stats Grid */}
                        <View style={s.statsGrid}>
                            {STATS.map((item, i) => (
                                <View key={i} style={s.statCard}>
                                    <PremiumCard style={s.statInner}>
                                        <Text style={s.statIcon}>{item.icon}</Text>
                                        <Text style={s.statValue}>{item.value}</Text>
                                        <Text style={s.statLabel}>{item.label}</Text>
                                        {item.trend && <Text style={[s.statTrend, item.trend.startsWith('+') ? s.trendUp : s.trendDown]}>{item.trend}</Text>}
                                    </PremiumCard>
                                </View>
                            ))}
                        </View>

                        {/* Calls */}
                        <View style={s.sectionHeader}>
                            <Text style={s.sectionTitle}>Today's Calls</Text>
                            <StatusBadge label={`${CALLS.length} remaining`} variant="info" />
                        </View>
                        <View style={{ gap: Spacing.md }}>
                            {CALLS.map((call) => <CallCard key={call.id} item={call} navigation={navigation} />)}
                        </View>

                        {/* Emergency SOS */}
                        <View>
                            <TouchableOpacity style={s.emergencyBtn} activeOpacity={0.8}
                                onPress={handleEmergencySOS}>
                                <LinearGradient colors={['#DC2626', '#EF4444']} style={s.emergencyGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                                    <Text style={s.emergencyIcon}>🚨</Text>
                                    <View>
                                        <Text style={s.emergencyTitle}>Emergency SOS</Text>
                                        <Text style={s.emergencySub}>Tap to call for immediate help</Text>
                                    </View>
                                </LinearGradient>
                            </TouchableOpacity>
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
    // Bell
    bellBtn: { width: 44, height: 44, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    bellDot: { position: 'absolute', top: 10, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.error, borderWidth: 2, borderColor: '#fff' },
    // Stats
    statsGrid: { 
        flexDirection: 'row', 
        flexWrap: 'wrap', 
        marginTop: Spacing.md,
        justifyContent: 'space-between'
    },
    statCard: { 
        width: '48%', 
        marginBottom: Spacing.md,
        height: 130
    },
    statInner: { 
        alignItems: 'center', 
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.xs,
        height: 130,
        justifyContent: 'center'
    },
    statIcon: { fontSize: 24, marginBottom: Spacing.xs },
    statValue: { ...Typography.h2, color: Colors.textPrimary },
    statLabel: { ...Typography.tiny, color: Colors.textMuted, marginTop: Spacing.xs, textAlign: 'center' },
    statTrend: { ...Typography.tiny, marginTop: Spacing.xs, textAlign: 'center' },
    trendUp: { color: Colors.success },
    trendDown: { color: Colors.info },
    // Section
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.md },
    sectionTitle: { ...Typography.h3, color: Colors.textPrimary },
    // Call Card
    callCard: { padding: 0 },
    callHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, paddingBottom: Spacing.sm },
    callAvatar: { width: 48, height: 48, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    callAvatarText: { ...Typography.h3, color: Colors.primary },
    callName: { ...Typography.bodySemibold, color: Colors.textPrimary, marginBottom: Spacing.xs },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    callMeta: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
    callTime: { ...Typography.caption, color: Colors.textSecondary },
    callMeds: { ...Typography.caption, color: Colors.textSecondary },
    overdueBanner: { backgroundColor: Colors.errorLight, marginHorizontal: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.sm },
    overdueText: { ...Typography.tiny, color: Colors.error },
    callNowBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, margin: Spacing.md, marginTop: Spacing.sm, paddingVertical: Spacing.sm + 4, borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt },
    callNowIcon: { fontSize: 16 },
    callNowText: { ...Typography.bodySemibold, color: Colors.primary, fontSize: 14 },
    // Emergency SOS
    emergencyBtn: { marginTop: Spacing.xl, borderRadius: Radius.lg, overflow: 'hidden', ...Shadows.lg },
    emergencyGrad: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg, paddingHorizontal: Spacing.lg },
    emergencyIcon: { fontSize: 32 },
    emergencyTitle: { ...Typography.h3, color: '#fff' },
    emergencySub: { ...Typography.caption, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    // Skeleton
    skeletonArea: { paddingTop: Spacing.md },
    skeletonStats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});
