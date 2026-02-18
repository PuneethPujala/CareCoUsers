import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';

const MANAGER = {
    name: 'Alice Manager', role: 'Care Manager', load: 78,
    callers: [
        { id: 'c1', name: 'Sarah Johnson', calls: 28, score: 96 },
        { id: 'c2', name: 'Mike Chen', calls: 24, score: 91 },
        { id: 'c3', name: 'Emily Davis', calls: 22, score: 88 },
    ],
    patients: [
        { id: 'p1', name: 'Robert Williams', adherence: 92 },
        { id: 'p2', name: 'Margaret Chen', adherence: 68 },
        { id: 'p3', name: 'James Wilson', adherence: 85 },
    ],
};

export default function ManagerDetailScreen({ navigation }) {


const loadColor = MANAGER.load > 85 ? Colors.error : MANAGER.load > 65 ? Colors.warning : Colors.success;

    return (
        <View style={s.container}>
            <GradientHeader title={MANAGER.name} subtitle={MANAGER.role} onBack={() => navigation.goBack()}
                colors={Colors.roleGradient.care_manager}>
                <View style={s.loadSection}>
                    <View style={s.loadHeader}><Text style={s.loadLabel}>Workload</Text><Text style={[s.loadPct, { color: '#fff' }]}>{MANAGER.load}%</Text></View>
                    <View style={s.loadBarOuter}><View style={[s.loadBarFill, { width: `${MANAGER.load}%`, backgroundColor: loadColor }]} /></View>
                </View>
            </GradientHeader>

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
                <View>
                    <Text style={s.secTitle}>Callers ({MANAGER.callers.length})</Text>
                    <PremiumCard style={{ padding: 0 }}>
                        {MANAGER.callers.map((c, i) => (
                            <React.Fragment key={c.id}>
                                {i > 0 && <View style={s.divider} />}
                                <PremiumCard onPress={() => navigation.navigate('CallerDetail', { callerId: c.id })}
                                    style={s.listRow} shadow="sm">
                                    <View style={s.avatar}><Text style={s.avatarText}>{c.name.charAt(0)}</Text></View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.rowName}>{c.name}</Text>
                                        <Text style={s.rowSub}>{c.calls} calls today</Text>
                                    </View>
                                    <StatusBadge label={`${c.score}`} variant="primary" />
                                </PremiumCard>
                            </React.Fragment>
                        ))}
                    </PremiumCard>
                </View>

                <View>
                    <Text style={s.secTitle}>Patients ({MANAGER.patients.length})</Text>
                    <PremiumCard style={{ padding: 0 }}>
                        {MANAGER.patients.map((p, i) => (
                            <React.Fragment key={p.id}>
                                {i > 0 && <View style={s.divider} />}
                                <PremiumCard onPress={() => navigation.navigate('PatientDetail', { patientId: p.id })}
                                    style={s.listRow} shadow="sm">
                                    <View style={s.avatar}><Text style={s.avatarText}>{p.name.charAt(0)}</Text></View>
                                    <Text style={s.rowName}>{p.name}</Text>
                                    <View style={{ flex: 1 }} />
                                    <StatusBadge label={`${p.adherence}%`} variant={p.adherence >= 80 ? 'success' : 'warning'} />
                                </PremiumCard>
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
    loadSection: { marginTop: Spacing.md },
    loadHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
    loadLabel: { ...Typography.caption, color: 'rgba(255,255,255,0.7)' },
    loadPct: { ...Typography.captionBold },
    loadBarOuter: { height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4 },
    loadBarFill: { height: 8, borderRadius: 4 },
    secTitle: { ...Typography.h3, color: Colors.textPrimary, marginTop: Spacing.lg, marginBottom: Spacing.md },
    divider: { height: 1, backgroundColor: Colors.borderLight },
    listRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, marginBottom: 0, borderRadius: 0 },
    avatar: { width: 36, height: 36, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    avatarText: { ...Typography.caption, color: Colors.primary, fontWeight: '700' },
    rowName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    rowSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
});
