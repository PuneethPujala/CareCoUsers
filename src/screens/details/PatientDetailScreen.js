import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import PatientHealthView from '../../components/common/PatientHealthView';

const PATIENT = {
    name: 'Robert Williams', age: 72, phone: '555-0401', email: 'robert@email.com',
    conditions: [
        { id: 'c1', condition: 'Type 2 Diabetes', diagnosedDate: '2022-03-15', severity: 'Moderate', status: 'active' },
        { id: 'c2', condition: 'Hypertension', diagnosedDate: '2021-08-22', severity: 'Mild', status: 'active' },
        { id: 'c3', condition: 'Mild Arthritis', diagnosedDate: '2023-05-10', severity: 'Mild', status: 'managed' },
    ],
    medications: [
        { id: 'm1', name: 'Metformin 500mg', frequency: 'Twice daily', addedDate: '2022-03-15', adherence: 94 },
        { id: 'm2', name: 'Lisinopril 10mg', frequency: 'Once daily', addedDate: '2021-08-22', adherence: 88 },
        { id: 'm3', name: 'Atorvastatin 20mg', frequency: 'Once daily', addedDate: '2023-01-10', adherence: 92 },
    ],
    careTeam: [
        { name: 'Sarah Johnson', role: 'Caller' },
        { name: 'Alice Manager', role: 'Care Manager' },
    ],
    calls: [
        { date: 'Today 9:30 AM', duration: '12 min', mood: '😊', outcome: 'Good' },
        { date: 'Yesterday 2:00 PM', duration: '15 min', mood: '😊', outcome: 'Good' },
        { date: '2 days ago', duration: '10 min', mood: '😐', outcome: 'Concern' },
    ],
};

export default function PatientDetailScreen({ navigation, route }) {

    return (
        <View style={s.container}>
            <GradientHeader title={PATIENT.name} subtitle={`Age ${PATIENT.age}`} onBack={() => navigation.goBack()}>
                <View style={s.headerStats}>
                    <View style={s.hStat}><Text style={s.hStatVal}>92%</Text><Text style={s.hStatLbl}>Adherence</Text></View>
                    <View style={s.hStatDivider} />
                    <View style={s.hStat}><Text style={s.hStatVal}>{PATIENT.medications.length}</Text><Text style={s.hStatLbl}>Medications</Text></View>
                    <View style={s.hStatDivider} />
                    <View style={s.hStat}><Text style={s.hStatVal}>{PATIENT.conditions.length}</Text><Text style={s.hStatLbl}>Conditions</Text></View>
                    <View style={s.hStatDivider} />
                    <View style={s.hStat}><Text style={s.hStatVal}>24</Text><Text style={s.hStatLbl}>Total Calls</Text></View>
                </View>
            </GradientHeader>

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
                {/* Health Conditions & Medications (Read-Only) */}
                <View style={{ marginTop: Spacing.lg }}>
                    <PatientHealthView
                        conditions={PATIENT.conditions}
                        medications={PATIENT.medications}
                        editable={false}
                    />
                </View>

                {/* Care Team */}
                <View>
                    <Text style={s.secTitle}>Care Team</Text>
                    <PremiumCard style={{ padding: 0 }}>
                        {PATIENT.careTeam.map((t, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && <View style={s.divider} />}
                                <View style={s.teamRow}>
                                    <View style={s.teamAvatar}><Text style={s.teamAvatarText}>{t.name.charAt(0)}</Text></View>
                                    <View>
                                        <Text style={s.teamName}>{t.name}</Text>
                                        <Text style={s.teamRole}>{t.role}</Text>
                                    </View>
                                </View>
                            </React.Fragment>
                        ))}
                    </PremiumCard>
                </View>

                {/* Call History */}
                <View>
                    <Text style={s.secTitle}>Recent Calls</Text>
                    <PremiumCard style={{ padding: 0 }}>
                        {PATIENT.calls.map((c, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && <View style={s.divider} />}
                                <View style={s.callRow}>
                                    <Text style={s.callMood}>{c.mood}</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.callDate}>{c.date}</Text>
                                        <Text style={s.callDur}>{c.duration}</Text>
                                    </View>
                                    <StatusBadge label={c.outcome} variant={c.outcome === 'Good' ? 'success' : 'warning'} />
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
    teamRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 14 },
    teamAvatar: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    teamAvatarText: { ...Typography.bodySemibold, color: Colors.primary },
    teamName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    teamRole: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    callRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 14 },
    callMood: { fontSize: 24 },
    callDate: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    callDur: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
});
