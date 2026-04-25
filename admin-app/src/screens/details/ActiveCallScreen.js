import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator, StatusBar } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Theme } from '../../theme/theme';
import { apiService } from '../../lib/api';

// ── Shift helper ──
function getCurrentShift() {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'night';
}

function getShiftLabel(shift) {
    if (shift === 'morning') return 'Morning (Before 12 PM)';
    if (shift === 'afternoon') return 'Afternoon (12 PM – 5 PM)';
    return 'Night (After 5 PM)';
}

function filterMedsByShift(medications, shift) {
    const shiftLower = shift.toLowerCase();
    return medications.filter(med => {
        const times = med.scheduledTimes && med.scheduledTimes.length > 0 ? med.scheduledTimes : (med.times || []);

        if (times.length === 0) return shiftLower === 'morning';

        return times.some(t => {
            const lower = (t || '').toLowerCase().trim();
            if (lower === shiftLower || lower.includes(shiftLower)) return true;
            if (shiftLower === 'night' && lower.includes('evening')) return true;

            let hour = -1;
            const match24 = lower.match(/^(\d{1,2}):(\d{2})$/);
            const match12 = lower.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);

            if (match24) {
                hour = parseInt(match24[1], 10);
            } else if (match12) {
                hour = parseInt(match12[1], 10);
                const period = match12[3];
                if (period === 'pm' && hour !== 12) hour += 12;
                if (period === 'am' && hour === 12) hour = 0;
            }

            if (hour === -1) return shiftLower === 'morning';

            if (shiftLower === 'morning') return hour >= 0 && hour < 12;
            if (shiftLower === 'afternoon') return hour >= 12 && hour < 17;
            if (shiftLower === 'night') return hour >= 17;
            
            return false;
        });
    });
}

export default function ActiveCallScreen({ navigation, route }) {
    // Route now expects: { callId (optional), patientId, patientName, scheduledTime (optional) }
    const { callId, patientId, patientName, scheduledTime } = route?.params?.patient 
        ? { patientId: route.params.patient._id || route.params.patient.id, patientName: route.params.patient.name } // fallback for safety if old route format was used occasionally
        : route?.params || {};
        
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [seconds, setSeconds] = useState(0);
    const [allMedications, setAllMedications] = useState([]);
    const [medications, setMedications] = useState([]);
    
    // Track medication confirmations: { medId: boolean }
    const [checkedMeds, setCheckedMeds] = useState({});
    
    // Notes and mood
    const [notes, setNotes] = useState('');
    const [mood, setMood] = useState('neutral'); // good, neutral, bad
    const [outcome, setOutcome] = useState('completed'); // completed, missed, no_answer
    
    const timerRef = useRef(null);
    const startedAtRef = useRef(new Date().toISOString());
    const currentShift = getCurrentShift();

    useEffect(() => {
        if (!patientId || patientId === 'mock') {
            return setLoading(false);
        }

        const fetchMeds = async () => {
            try {
                const res = await apiService.caretaker.getPatientMeds(patientId);
                const allMeds = res.data?.medications || [];
                setAllMedications(allMeds);
                // Filter to current shift only
                const shiftMeds = filterMedsByShift(allMeds, currentShift);
                setMedications(shiftMeds);
            } catch (err) {
                console.error('[ActiveCall] Meds error:', err);
                Alert.alert('Warning', 'Could not load live medication list.');
            } finally {
                setLoading(false);
            }
        };
        fetchMeds();
        
        timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
        return () => clearInterval(timerRef.current);
    }, [patientId]);

    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const toggleMed = (id) => {
        // Only allow toggling meds if call outcome is 'completed'
        if (outcome !== 'completed') {
            Alert.alert('Cannot Mark Medications', 'You can only confirm medications when the call outcome is "Completed (Contact Made)".');
            return;
        }
        setCheckedMeds(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleEndCall = async () => {
        if (!patientId || patientId === 'mock') {
            clearInterval(timerRef.current);
            Alert.alert('Call Finished', 'Mock call completed.');
            navigation.goBack();
            return;
        }

        // Validation: if completed but not all meds checked, warn user
        if (outcome === 'completed' && medications.length > 0) {
            const allChecked = medications.every(m => checkedMeds[m._id]);
            if (!allChecked) {
                const checkedCount = medications.filter(m => checkedMeds[m._id]).length;
                Alert.alert(
                    'Incomplete Medication Review',
                    `Only ${checkedCount} of ${medications.length} medications are confirmed. The patient will remain PENDING in your queue until all medications are verified.\n\nDo you want to proceed?`,
                    [
                        { text: 'Go Back', style: 'cancel' },
                        { text: 'Submit Anyway', style: 'destructive', onPress: () => submitCall() },
                    ]
                );
                return;
            }
        }

        submitCall();
    };

    const submitCall = async () => {
        setSaving(true);
        clearInterval(timerRef.current);

        // For no_answer/missed: do NOT send medication confirmations at all
        const isCallMade = outcome === 'completed';
        const medConfirmations = isCallMade ? medications.map(med => ({
            medicationId: med._id,
            medicationName: med.name,
            confirmed: !!checkedMeds[med._id],
            reason: '',
            notes: ''
        })) : []; // Empty for missed/no_answer calls

        const payload = {
            callLogId: callId,
            patientId,
            scheduledTime: scheduledTime || new Date().toISOString(),
            status: outcome,
            outcome: outcome === 'completed' ? 'answered_completed' : (outcome === 'no_answer' ? 'no_answer' : 'refused'),
            startedAt: startedAtRef.current,
            endedAt: new Date().toISOString(),
            duration: seconds,
            notes,
            patientMood: isCallMade ? (mood === 'good' ? 'happy' : mood === 'bad' ? 'sad' : mood) : 'neutral',
            followUpRequired: false,
            medicationConfirmations: medConfirmations,
            callQuality: { rating: 5, issues: [] }
        };

        try {
            await apiService.caretaker.logCall(payload);
            navigation.goBack();
        } catch (err) {
            console.error('[ActiveCall] End call error:', err);
            Alert.alert('Error', 'Failed to save call log data. Please ensure you are online.');
            setSaving(false);
            timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
        }
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            
            {/* ── Active Header ── */}
            <View style={s.header}>
                <View style={s.headerRow}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} disabled={saving}>
                        <Feather name="arrow-left" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                    <View style={s.liveBadge}>
                        <View style={s.liveDot} />
                        <Text style={[s.liveBadgeTxt, Theme.typography.common]}>LIVE CALL</Text>
                    </View>
                </View>
                
                <View style={s.timerArea}>
                    <Text style={[s.timerText, Theme.typography.common]}>{formatTime(seconds)}</Text>
                    <Text style={[s.patientName, Theme.typography.common]}>{patientName || 'Patient'}</Text>
                </View>

                {/* ── Shift Indicator ── */}
                <View style={s.shiftBadge}>
                    <Feather name="sun" size={12} color="#F59E0B" />
                    <Text style={s.shiftBadgeText}>{getShiftLabel(currentShift)}</Text>
                </View>
            </View>

            <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
                {loading ? (
                    <View style={s.loader}>
                        <ActivityIndicator size="large" color="#2563EB" />
                    </View>
                ) : (
                    <>
                        {/* ── Medications (Shift-Filtered) ── */}
                        <Text style={[s.secTitle, Theme.typography.common]}>
                            {currentShift.charAt(0).toUpperCase() + currentShift.slice(1)} Medication Review ({medications.length})
                        </Text>
                        <View style={s.card}>
                            {medications.length === 0 ? (
                                <View style={s.emptyArea}>
                                    <Feather name="check-circle" size={24} color="#10B981" />
                                    <Text style={[s.emptyText, Theme.typography.common]}>No medications scheduled for this shift.</Text>
                                </View>
                            ) : (
                                medications.map((m, i) => (
                                    <React.Fragment key={m._id || i}>
                                        {i > 0 && <View style={s.divider} />}
                                        <TouchableOpacity style={s.medRow} onPress={() => toggleMed(m._id)} activeOpacity={0.7}>
                                            <View style={[s.checkbox, checkedMeds[m._id] && s.checkboxDone]}>
                                                {checkedMeds[m._id] && <Feather name="check" size={14} color="#FFFFFF" />}
                                            </View>
                                            <View style={{ flex: 1, marginLeft: 14 }}>
                                                <Text style={[s.medName, checkedMeds[m._id] && s.medNameDone, Theme.typography.common]}>
                                                    {m.name}
                                                </Text>
                                                <Text style={[s.medSub, checkedMeds[m._id] && s.medNameDone, Theme.typography.common]}>
                                                    {m.dosage} • {m.frequency}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    </React.Fragment>
                                ))
                            )}
                        </View>

                        {/* ── Patient Mood ── */}
                        <Text style={[s.secTitle, Theme.typography.common]}>Patient Mood</Text>
                        <View style={s.card}>
                            <View style={s.moodRow}>
                                {[
                                    { id: 'good', icon: 'smile', color: '#10B981', label: 'Good' },
                                    { id: 'neutral', icon: 'meh', color: '#F59E0B', label: 'Neutral' },
                                    { id: 'bad', icon: 'frown', color: '#EF4444', label: 'Unwell' }
                                ].map(option => {
                                    const isActive = mood === option.id;
                                    return (
                                        <TouchableOpacity 
                                            key={option.id}
                                            style={[s.moodBtn, isActive && { backgroundColor: option.color + '15', borderColor: option.color }]}
                                            activeOpacity={0.8}
                                            onPress={() => setMood(option.id)}
                                        >
                                            <Feather name={option.icon} size={24} color={isActive ? option.color : '#94A3B8'} />
                                            <Text style={[s.moodLbl, Theme.typography.common, isActive && { color: option.color, fontWeight: '800' }]}>
                                                {option.label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        {/* ── Call Outcome ── */}
                        <Text style={[s.secTitle, Theme.typography.common]}>Call Outcome</Text>
                        <View style={s.cardRows}>
                            {[
                                { id: 'completed', label: 'Completed (Contact Made)', icon: 'phone-call' },
                                { id: 'no_answer', label: 'No Answer', icon: 'phone-missed' },
                                { id: 'missed', label: 'Cancelled / Missed', icon: 'x-circle' },
                            ].map(item => (
                                <TouchableOpacity 
                                    key={item.id} 
                                    style={s.outcomeRow} 
                                    activeOpacity={0.8} 
                                    onPress={() => setOutcome(item.id)}
                                >
                                    <View style={[s.radioOuter, outcome === item.id && s.radioOuterActive]}>
                                        {outcome === item.id && <View style={s.radioInner} />}
                                    </View>
                                    <View style={s.outcomeLabelWrap}>
                                        <Text style={[s.outcomeLbl, Theme.typography.common, outcome === item.id && { color: '#0F172A' }]}>
                                            {item.label}
                                        </Text>
                                    </View>
                                    <Feather name={item.icon} size={18} color={outcome === item.id ? '#2563EB' : '#CBD5E1'} />
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* ── Notes ── */}
                        <Text style={[s.secTitle, Theme.typography.common]}>Notes</Text>
                        <View style={s.card}>
                            <TextInput 
                                style={[s.notesInput, Theme.typography.common]} 
                                placeholder="Any important observations?" 
                                placeholderTextColor="#94A3B8"
                                value={notes} 
                                onChangeText={setNotes} 
                                multiline 
                                textAlignVertical="top" 
                            />
                        </View>

                        {/* ── End Call ── */}
                        <TouchableOpacity style={s.endBtn} activeOpacity={0.8} onPress={handleEndCall} disabled={saving}>
                            {saving ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <>
                                    <Feather name="phone-off" size={20} color="#FFFFFF" />
                                    <Text style={[s.endBtnText, Theme.typography.common]}>Log & End Call</Text>
                                </>
                            )}
                        </TouchableOpacity>
                        
                        <View style={{ height: 40 }} />
                    </>
                )}
            </ScrollView>
        </View>
    );
}

// ═══════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F8FAFC' },
    
    // Header
    header: { backgroundColor: '#0F172A', paddingTop: 50, paddingBottom: 32, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, ...Theme.shadows.sharp },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
    backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF', marginRight: 6 },
    liveBadgeTxt: { fontSize: 11, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
    
    timerArea: { alignItems: 'center', marginTop: 24 },
    timerText: { fontSize: 56, fontWeight: '800', color: '#FFFFFF', letterSpacing: 2 },
    patientName: { fontSize: 16, fontWeight: '600', color: '#94A3B8', marginTop: 4 },

    shiftBadge: { 
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', 
        gap: 6, alignSelf: 'center', marginTop: 12,
        backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 
    },
    shiftBadgeText: { fontSize: 11, fontWeight: '700', color: '#F59E0B', letterSpacing: 0.3 },
    
    scroll: { flex: 1 },
    content: { padding: 16 },
    loader: { paddingVertical: 60, alignItems: 'center' },
    
    secTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 24, marginBottom: 12 },
    
    // Cards
    card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', ...Theme.shadows.sharp, overflow: 'hidden' },
    cardRows: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', ...Theme.shadows.sharp, overflow: 'hidden' },

    divider: { height: 1, backgroundColor: '#F1F5F9' },
    
    // Med Row
    medRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    checkbox: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center' },
    checkboxDone: { backgroundColor: '#10B981', borderColor: '#10B981' },
    medName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
    medSub: { fontSize: 12, fontWeight: '600', color: '#64748B', marginTop: 2 },
    medNameDone: { textDecorationLine: 'line-through', color: '#94A3B8' },

    // Mood
    moodRow: { flexDirection: 'row', padding: 10 },
    moodBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
    moodLbl: { fontSize: 12, fontWeight: '700', color: '#94A3B8', marginTop: 8 },

    // Outcome
    outcomeRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    radioOuterActive: { borderColor: '#2563EB' },
    radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563EB' },
    outcomeLabelWrap: { flex: 1 },
    outcomeLbl: { fontSize: 14, fontWeight: '700', color: '#64748B' },

    // Notes
    notesInput: { fontSize: 15, color: '#0F172A', minHeight: 100, padding: 16 },

    // End Button
    endBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 16, marginTop: 32, ...Theme.shadows.sharp },
    endBtnText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
    
    emptyArea: { paddingVertical: 32, alignItems: 'center', gap: 8 },
    emptyText: { fontSize: 13, fontWeight: '600', color: '#64748B' }
});
