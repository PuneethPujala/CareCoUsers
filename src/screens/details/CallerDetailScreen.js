import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';

const CALLER = {
    name: 'Sarah Johnson', score: 96, status: 'active', calls: 28, avgDuration: '14 min',
    patients: [
        { id: 'p1', name: 'Robert Williams', adherence: 92 },
        { id: 'p2', name: 'Margaret Chen', adherence: 68 },
        { id: 'p3', name: 'James Wilson', adherence: 85 },
    ],
    log: [
        { date: 'Today 9:30 AM', patient: 'Robert Williams', duration: '12 min', outcome: 'Completed' },
        { date: 'Today 10:00 AM', patient: 'Margaret Chen', duration: '—', outcome: 'Missed' },
        { date: 'Yesterday 2:00 PM', patient: 'James Wilson', duration: '18 min', outcome: 'Completed' },
    ],
};

export default function CallerDetailScreen({ navigation }) {


return (
        <View style={s.container}>
            <GradientHeader title={CALLER.name} subtitle="Caller Profile" onBack={() => navigation.goBack()}>
                <View style={s.headerStats}>
                    <View style={s.hStat}><Text style={s.hStatVal}>{CALLER.score}</Text><Text style={s.hStatLbl}>Score</Text></View>
                    <View style={s.hStatDivider} />
                    <View style={s.hStat}><Text style={s.hStatVal}>{CALLER.calls}</Text><Text style={s.hStatLbl}>Calls Today</Text></View>
                    <View style={s.hStatDivider} />
                    <View style={s.hStat}><Text style={s.hStatVal}>{CALLER.avgDuration}</Text><Text style={s.hStatLbl}>Avg Duration</Text></View>
                </View>
            </GradientHeader>

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
                <View>
                    <Text style={s.secTitle}>Assigned Patients</Text>
                    <PremiumCard style={{ padding: 0 }}>
                        {CALLER.patients.map((p, i) => (
                            <React.Fragment key={p.id}>
                                {i > 0 && <View style={s.divider} />}
                                <PremiumCard onPress={() => navigation.navigate('PatientDetail', { patientId: p.id })}
                                    style={s.patRow} shadow="sm">
                                    <View style={s.patAvatar}><Text style={s.patAvatarText}>{p.name.charAt(0)}</Text></View>
                                    <Text style={s.patName}>{p.name}</Text>
                                    <View style={{ flex: 1 }} />
                                    <StatusBadge label={`${p.adherence}%`} variant={p.adherence >= 80 ? 'success' : 'warning'} />
                                </PremiumCard>
                            </React.Fragment>
                        ))}
                    </PremiumCard>
                </View>

                <View>
                    <Text style={s.secTitle}>Call Log</Text>
                    <PremiumCard style={{ padding: 0 }}>
                        {CALLER.log.map((l, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && <View style={s.divider} />}
                                <View style={s.logRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.logPatient}>{l.patient}</Text>
                                        <Text style={s.logSub}>{l.date} · {l.duration}</Text>
                                    </View>
                                    <StatusBadge label={l.outcome} variant={l.outcome === 'Completed' ? 'success' : 'error'} />
                                </View>
                            </React.Fragment>
                        ))}
                    </PremiumCard>
                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    body: { flex: 1, paddingHorizontal: Spacing.md },
    headerStats: { flexDirection: 'row', justifyContent: 'space-around', marginTop: Spacing.lg, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: Radius.md, paddingVertical: Spacing.md },
    hStat: { alignItems: 'center' },
    hStatVal: { ...Typography.h3, color: '#fff' },
    hStatLbl: { ...Typography.tiny, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
    hStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
    secTitle: { ...Typography.h3, color: Colors.textPrimary, marginTop: Spacing.lg, marginBottom: Spacing.md },
    divider: { height: 1, backgroundColor: Colors.borderLight },
    patRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, marginBottom: 0, borderRadius: 0 },
    patAvatar: { width: 36, height: 36, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    patAvatarText: { ...Typography.caption, color: Colors.primary, fontWeight: '700' },
    patName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    logRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 14 },
    logPatient: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    logSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
});
