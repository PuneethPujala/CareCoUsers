import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';

const PATIENT = {
    name: 'Robert Williams', age: 72,
    meds: ['Metformin 500mg', 'Lisinopril 10mg', 'Atorvastatin 20mg', 'Aspirin 81mg'],
};

export default function ActiveCallScreen({ navigation, route }) {
    const patient = route?.params?.patient || PATIENT;
    const [seconds, setSeconds] = useState(0);
    const [checkedMeds, setCheckedMeds] = useState({});
    const [notes, setNotes] = useState('');
    const timer = useRef(null);

    useEffect(() => {
        timer.current = setInterval(() => setSeconds(s => s + 1), 1000);
        return () => clearInterval(timer.current);
    }, []);

    const toggleMed = (i) => setCheckedMeds(prev => ({ ...prev, [i]: !prev[i] }));
    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    const endCall = () => {
        clearInterval(timer.current);
        const total = Object.keys(checkedMeds).filter(k => checkedMeds[k]).length;
        Alert.alert('Call Ended',
            `Duration: ${formatTime(seconds)}\nMeds reviewed: ${total}/${patient.meds?.length || 0}\n\nNotes: ${notes || 'None'}`,
            [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
    };

    return (
        <View style={s.container}>
            <LinearGradient colors={Colors.gradient} style={s.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <SafeAreaView edges={['top']}>
                    <View style={s.headerRow}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                            <Text style={s.backText}>←</Text>
                        </TouchableOpacity>
                        <StatusBadge label="LIVE" variant="error" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
                    </View>
                    <View style={s.timerArea}>
                        <Text style={s.timerText}>{formatTime(seconds)}</Text>
                        <Text style={s.patientName}>{patient.name || 'Patient'}</Text>
                    </View>
                </SafeAreaView>
            </LinearGradient>

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
                <Text style={s.secTitle}>Medication Checklist</Text>
                <PremiumCard style={{ padding: 0 }}>
                    {(patient.meds || PATIENT.meds).map((m, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && <View style={s.divider} />}
                            <TouchableOpacity style={s.medRow} onPress={() => toggleMed(i)} activeOpacity={0.7}>
                                <View style={[s.checkbox, checkedMeds[i] && s.checkboxDone]}>
                                    {checkedMeds[i] && <Text style={s.checkMark}>✓</Text>}
                                </View>
                                <Text style={[s.medName, checkedMeds[i] && s.medNameDone]}>{m}</Text>
                            </TouchableOpacity>
                        </React.Fragment>
                    ))}
                </PremiumCard>

                <Text style={s.secTitle}>Call Notes</Text>
                <PremiumCard>
                    <TextInput style={s.notesInput} placeholder="Add notes about the call..." placeholderTextColor={Colors.textMuted}
                        value={notes} onChangeText={setNotes} multiline numberOfLines={4} textAlignVertical="top" />
                </PremiumCard>

                <TouchableOpacity onPress={endCall} style={s.endCallWrap} activeOpacity={0.9}>
                    <LinearGradient colors={['#DC2626', '#EF4444']} style={s.endCallBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                        <Text style={s.endCallText}>End Call</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: { paddingBottom: Spacing.xl },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
    backBtn: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    backText: { fontSize: 20, color: '#fff', fontWeight: '700' },
    timerArea: { alignItems: 'center', marginTop: Spacing.lg },
    timerText: { fontSize: 48, fontWeight: '200', color: '#fff', letterSpacing: 2 },
    patientName: { ...Typography.h3, color: 'rgba(255,255,255,0.8)', marginTop: Spacing.sm },
    body: { flex: 1, paddingHorizontal: Spacing.md },
    secTitle: { ...Typography.h3, color: Colors.textPrimary, marginTop: Spacing.lg, marginBottom: Spacing.md },
    divider: { height: 1, backgroundColor: Colors.borderLight },
    medRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 14 },
    checkbox: { width: 28, height: 28, borderRadius: Radius.sm, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
    checkboxDone: { borderColor: Colors.success, backgroundColor: Colors.successLight },
    checkMark: { color: Colors.success, fontSize: 14, fontWeight: '700' },
    medName: { ...Typography.bodyMedium, color: Colors.textPrimary },
    medNameDone: { textDecorationLine: 'line-through', color: Colors.textMuted },
    notesInput: { ...Typography.body, color: Colors.textPrimary, minHeight: 100 },
    endCallWrap: { marginTop: Spacing.xl, borderRadius: Radius.lg, overflow: 'hidden', ...Shadows.lg },
    endCallBtn: { paddingVertical: Spacing.md, alignItems: 'center' },
    endCallText: { ...Typography.button, color: '#fff' },
});
