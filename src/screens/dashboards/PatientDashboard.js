import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import SkeletonLoader from '../../components/common/SkeletonLoader';

const MEDS = [
    { id: 1, name: 'Metformin 500mg', time: '8:00 AM', taken: true },
    { id: 2, name: 'Lisinopril 10mg', time: '8:00 AM', taken: true },
    { id: 3, name: 'Atorvastatin 20mg', time: '9:00 PM', taken: false },
    { id: 4, name: 'Aspirin 81mg', time: '12:00 PM', taken: false },
];

export default function PatientDashboard({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [meds, setMeds] = useState(MEDS);

    useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);

    const toggleMed = (id) => setMeds(prev => prev.map(m => m.id === id ? { ...m, taken: !m.taken } : m));
    const takenCount = meds.filter(m => m.taken).length;


return (
        <View style={s.container}>
            <GradientHeader
                title={`Hello, ${user?.name?.split(' ')[0] || 'there'} 💙`}
                subtitle="Your Health Dashboard"
                colors={Colors.roleGradient.patient}
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
                        {/* Next Call */}
                        <View>
                            <PremiumCard style={s.nextCallCard}>
                                <View style={s.nextCallHeader}>
                                    <Text style={s.nextCallLabel}>Next Scheduled Call</Text>
                                    <StatusBadge label="Today" variant="success" />
                                </View>
                                <Text style={s.nextCallTime}>📞 2:00 PM — Sarah Johnson</Text>
                                <Text style={s.nextCallNote}>Regular check-in call</Text>
                            </PremiumCard>
                        </View>

                        {/* Medications */}
                        <View>
                            <View style={s.sectionHeader}>
                                <Text style={s.sectionTitle}>Today's Medications</Text>
                                <StatusBadge label={`${takenCount}/${meds.length} taken`} variant={takenCount === meds.length ? 'success' : 'info'} />
                            </View>
                            <View style={s.progressBar}>
                                <View style={[s.progressFill, { width: `${(takenCount / meds.length) * 100}%` }]} />
                            </View>
                            <PremiumCard style={{ padding: 0, marginTop: Spacing.md }}>
                                {meds.map((m, i) => (
                                    <React.Fragment key={m.id}>
                                        {i > 0 && <View style={s.divider} />}
                                        <TouchableOpacity style={s.medRow} activeOpacity={0.7} onPress={() => toggleMed(m.id)}>
                                            <View style={[s.checkBox, m.taken && s.checkBoxDone]}>
                                                {m.taken && <Text style={s.checkMark}>✓</Text>}
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[s.medName, m.taken && s.medNameDone]}>{m.name}</Text>
                                                <Text style={s.medTime}>{m.time}</Text>
                                            </View>
                                            {m.taken && <StatusBadge label="Taken" variant="success" />}
                                        </TouchableOpacity>
                                    </React.Fragment>
                                ))}
                            </PremiumCard>
                        </View>

                        {/* Emergency */}
                        <View>
                            <TouchableOpacity style={s.emergencyBtn} activeOpacity={0.8}
                                onPress={() => navigation.navigate('Emergency')}>
                                <LinearGradient colors={['#DC2626', '#EF4444']} style={s.emergencyGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                                    <Text style={s.emergencyIcon}>🚨</Text>
                                    <View>
                                        <Text style={s.emergencyTitle}>Emergency Help</Text>
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
    // Next Call
    nextCallCard: { marginTop: Spacing.md },
    nextCallHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
    nextCallLabel: { ...Typography.captionBold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    nextCallTime: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.xs },
    nextCallNote: { ...Typography.body, color: Colors.textSecondary },
    // Section
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.sm },
    sectionTitle: { ...Typography.h3, color: Colors.textPrimary },
    progressBar: { height: 6, backgroundColor: Colors.borderLight, borderRadius: 3 },
    progressFill: { height: 6, borderRadius: 3, backgroundColor: Colors.success },
    divider: { height: 1, backgroundColor: Colors.borderLight },
    // Med
    medRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 14 },
    checkBox: { width: 28, height: 28, borderRadius: Radius.sm, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
    checkBoxDone: { borderColor: Colors.success, backgroundColor: Colors.successLight },
    checkMark: { color: Colors.success, fontSize: 14, fontWeight: '700' },
    medName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 15 },
    medNameDone: { textDecorationLine: 'line-through', color: Colors.textMuted },
    medTime: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    // Emergency
    emergencyBtn: { marginTop: Spacing.xl, borderRadius: Radius.lg, overflow: 'hidden', ...Shadows.lg },
    emergencyGrad: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg, paddingHorizontal: Spacing.lg },
    emergencyIcon: { fontSize: 32 },
    emergencyTitle: { ...Typography.h3, color: '#fff' },
    emergencySub: { ...Typography.caption, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
});
