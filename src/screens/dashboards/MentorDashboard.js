import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';

import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import SkeletonLoader from '../../components/common/SkeletonLoader';

const PATIENTS = [
    { id: 'p1', name: 'Robert Williams', status: 'stable', adherence: 92, lastCall: 'Today, 9:30 AM' },
    { id: 'p2', name: 'Margaret Chen', status: 'attention', adherence: 68, lastCall: 'Yesterday' },
    { id: 'p3', name: 'James Wilson', status: 'stable', adherence: 85, lastCall: 'Today, 11:00 AM' },
];

const HISTORY = [
    { id: 1, patient: 'Robert Williams', date: 'Today', time: '9:30 AM', duration: '12 min', mood: '😊', outcome: 'Good' },
    { id: 2, patient: 'Margaret Chen', date: 'Yesterday', time: '2:00 PM', duration: '18 min', mood: '😐', outcome: 'Concern raised' },
];

const SUMMARY = { calls: 24, avgDuration: '14 min', adherence: '82%', concerns: 2 };

export default function MentorDashboard({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);



    return (
        <View style={s.container}>
            <GradientHeader
                title={`Hi, ${user?.name?.split(' ')[0] || 'Mentor'}`}
                subtitle="Patient Mentor"
                colors={Colors.roleGradient.mentor}
                rightAction={
                    <TouchableOpacity style={s.bellBtn} onPress={() => navigation.navigate('Notifications')}>
                        <Text style={{ fontSize: 20 }}>🔔</Text>
                    </TouchableOpacity>
                }
            />

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
                {loading ? (
                    <View style={{ paddingTop: Spacing.md, gap: Spacing.md }}>
                        <SkeletonLoader variant="card" />
                        <SkeletonLoader variant="card" />
                    </View>
                ) : (
                    <>
                        {/* Weekly Summary */}
                        <View>
                            <PremiumCard style={s.summaryCard}>
                                <Text style={s.summaryTitle}>Weekly Summary</Text>
                                <View style={s.summaryGrid}>
                                    <View style={s.summaryItem}><Text style={s.sumVal}>{SUMMARY.calls}</Text><Text style={s.sumLabel}>Calls</Text></View>
                                    <View style={s.summaryItem}><Text style={s.sumVal}>{SUMMARY.avgDuration}</Text><Text style={s.sumLabel}>Avg Duration</Text></View>
                                    <View style={s.summaryItem}><Text style={s.sumVal}>{SUMMARY.adherence}</Text><Text style={s.sumLabel}>Adherence</Text></View>
                                    <View style={s.summaryItem}><Text style={s.sumVal}>{SUMMARY.concerns}</Text><Text style={s.sumLabel}>Concerns</Text></View>
                                </View>
                            </PremiumCard>
                        </View>

                        {/* Patients */}
                        <View>
                            <View style={s.sectionHeader}>
                                <Text style={s.sectionTitle}>My Patients</Text>
                                <StatusBadge label={`${PATIENTS.length} assigned`} variant="primary" />
                            </View>
                            <PremiumCard style={{ padding: 0 }}>
                                {PATIENTS.map((p, i) => (
                                    <React.Fragment key={p.id}>
                                        {i > 0 && <View style={s.divider} />}
                                        <TouchableOpacity style={s.patRow} activeOpacity={0.7}
                                            onPress={() => navigation.navigate('PatientDetail', { patientId: p.id })}>
                                            <View style={s.patAvatar}><Text style={s.patAvatarText}>{p.name.charAt(0)}</Text></View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.patName}>{p.name}</Text>
                                                <Text style={s.patSub}>Last call: {p.lastCall}</Text>
                                            </View>
                                            <StatusBadge label={p.status === 'stable' ? 'Stable' : 'Attention'} variant={p.status === 'stable' ? 'success' : 'warning'} />
                                        </TouchableOpacity>
                                    </React.Fragment>
                                ))}
                            </PremiumCard>
                        </View>

                        {/* Call History */}
                        <View>
                            <View style={s.sectionHeader}>
                                <Text style={s.sectionTitle}>Recent Calls</Text>
                            </View>
                            <PremiumCard style={{ padding: 0 }}>
                                {HISTORY.map((h, i) => (
                                    <React.Fragment key={h.id}>
                                        {i > 0 && <View style={s.divider} />}
                                        <View style={s.histRow}>
                                            <Text style={s.histMood}>{h.mood}</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.histName}>{h.patient}</Text>
                                                <Text style={s.histSub}>{h.date} · {h.time} · {h.duration}</Text>
                                            </View>
                                            <StatusBadge label={h.outcome} variant={h.outcome === 'Good' ? 'success' : 'warning'} />
                                        </View>
                                    </React.Fragment>
                                ))}
                            </PremiumCard>
                        </View>

                        {/* Actions */}
                        <View style={s.actionRow}>
                            <TouchableOpacity style={s.actionBtn} activeOpacity={0.8}
                                onPress={() => Alert.alert('Message Sent', 'Your manager has been notified.')}>
                                <Text style={s.actionIcon}>💬</Text>
                                <Text style={s.actionText}>Message Manager</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.actionBtn, s.actionBtnAlt]} activeOpacity={0.8}
                                onPress={() => Alert.alert('Concern Submitted', 'Your concern has been recorded.')}>
                                <Text style={s.actionIcon}>🚨</Text>
                                <Text style={[s.actionText, { color: Colors.warning }]}>Submit Concern</Text>
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
    bellBtn: { width: 44, height: 44, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    // Summary
    summaryCard: { marginTop: Spacing.md },
    summaryTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.md },
    summaryGrid: { flexDirection: 'row', justifyContent: 'space-between' },
    summaryItem: { alignItems: 'center' },
    sumVal: { ...Typography.h2, color: Colors.textPrimary },
    sumLabel: { ...Typography.tiny, color: Colors.textMuted, marginTop: Spacing.xs },
    // Section
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.md },
    sectionTitle: { ...Typography.h3, color: Colors.textPrimary },
    divider: { height: 1, backgroundColor: Colors.borderLight },
    // Patient
    patRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    patAvatar: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    patAvatarText: { ...Typography.bodySemibold, color: Colors.primary },
    patName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    patSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    // History
    histRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    histMood: { fontSize: 24 },
    histName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    histSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    // Actions
    actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.surfaceAlt },
    actionBtnAlt: { backgroundColor: Colors.warningLight },
    actionIcon: { fontSize: 18 },
    actionText: { ...Typography.bodySemibold, color: Colors.primary, fontSize: 14 },
});
