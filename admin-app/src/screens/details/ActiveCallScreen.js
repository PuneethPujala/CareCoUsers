import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator, StatusBar, Animated, BackHandler } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
    if (shift === 'morning') return 'Morning';
    if (shift === 'afternoon') return 'Afternoon';
    return 'Night';
}

function getShiftIcon(shift) {
    if (shift === 'morning') return 'sunny';
    if (shift === 'afternoon') return 'partly-sunny';
    return 'moon';
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
    const [prevShiftMeds, setPrevShiftMeds] = useState([]); // { ...med, _shift: 'morning' }
    
    // Track medication confirmations: { medId: boolean }
    const [checkedMeds, setCheckedMeds] = useState({});
    const [checkedPrevMeds, setCheckedPrevMeds] = useState({});
    
    // Notes and mood
    const [notes, setNotes] = useState('');
    const [mood, setMood] = useState('neutral');
    const [outcome, setOutcome] = useState('completed');
    
    const timerRef = useRef(null);
    const startedAtRef = useRef(new Date().toISOString());
    const currentShift = getCurrentShift();

    const getMedKey = (med) => med._id || med.name || JSON.stringify(med);
    const getPrevMedKey = (med) => `${med._shift}_${getMedKey(med)}`;

    // Previous shifts for the current shift
    const getPrevShifts = () => {
        if (currentShift === 'afternoon') return ['morning'];
        if (currentShift === 'night') return ['morning', 'afternoon'];
        return [];
    };

    useEffect(() => {
        if (!patientId || patientId === 'mock') {
            return setLoading(false);
        }

        const fetchMeds = async () => {
            try {
                // Fetch current shift meds
                const res = await apiService.caretaker.getPatientMeds(patientId, { shift: currentShift });
                const allMeds = res.data?.medications || [];
                setAllMedications(allMeds);
                const shiftMeds = filterMedsByShift(allMeds, currentShift);
                setMedications(shiftMeds);

                const initialChecked = {};
                shiftMeds.forEach(m => {
                    const key = getMedKey(m);
                    let isConfirmedThisShift = false;
                    if (m.takenLogs && m.takenLogs.length > 0) {
                        const todayStr = new Date().toLocaleDateString('en-CA');
                        isConfirmedThisShift = m.takenLogs.some(l => {
                            if (l.date !== todayStr) return false;
                            if (l.shift) {
                                let logShift = l.shift.toLowerCase().trim();
                                if (logShift === 'evening') logShift = 'night';
                                return logShift === currentShift;
                            }
                            return false;
                        });
                    }
                    if (m.callerMarked) isConfirmedThisShift = true;
                    if (isConfirmedThisShift) initialChecked[key] = true;
                });
                setCheckedMeds(initialChecked);

                // Fetch previous shift meds (unconfirmed only)
                const prevShifts = getPrevShifts();
                const missedMeds = [];
                for (const shift of prevShifts) {
                    try {
                        const prevRes = await apiService.caretaker.getPatientMeds(patientId, { shift });
                        const prevMeds = prevRes.data?.medications || [];
                        const prevFiltered = filterMedsByShift(prevMeds, shift);
                        const todayStr = new Date().toLocaleDateString('en-CA');
                        
                        prevFiltered.forEach(m => {
                            // Check if this med is already confirmed for that shift
                            let isConfirmed = false;
                            if (m.lastConfirmed === true) isConfirmed = true;
                            if (m.callerMarked) isConfirmed = true;
                            if (m.patientMarked) isConfirmed = true;
                            if (m.takenLogs && m.takenLogs.length > 0) {
                                isConfirmed = m.takenLogs.some(l => {
                                    if (l.date !== todayStr) return false;
                                    if (l.shift) {
                                        let ls = l.shift.toLowerCase().trim();
                                        if (ls === 'evening') ls = 'night';
                                        return ls === shift;
                                    }
                                    return false;
                                });
                            }
                            // Only add if NOT confirmed
                            if (!isConfirmed) {
                                missedMeds.push({ ...m, _shift: shift });
                            }
                        });
                    } catch (e) {
                        console.warn(`[ActiveCall] Failed to fetch ${shift} meds:`, e.message);
                    }
                }
                setPrevShiftMeds(missedMeds);
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

    // Block Android back button — must use Log & End Call
    useEffect(() => {
        const handler = BackHandler.addEventListener('hardwareBackPress', () => true);
        return () => handler.remove();
    }, []);

    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const toggleMed = (med) => {
        if (outcome !== 'completed') {
            Alert.alert('Cannot Mark Medications', 'You can only confirm medications when the call outcome is "Completed (Contact Made)".');
            return;
        }
        const key = getMedKey(med);
        setCheckedMeds(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const togglePrevMed = (med) => {
        if (outcome !== 'completed') {
            Alert.alert('Cannot Mark Medications', 'You can only confirm medications when the call outcome is "Completed (Contact Made)".');
            return;
        }
        const key = getPrevMedKey(med);
        setCheckedPrevMeds(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleEndCall = async () => {
        if (!outcome) {
            Alert.alert('Select Outcome', 'Please select a call outcome before ending the call.');
            return;
        }

        if (!patientId || patientId === 'mock') {
            clearInterval(timerRef.current);
            Alert.alert('Call Finished', 'Mock call completed.');
            navigation.goBack();
            return;
        }

        if (outcome === 'completed' && medications.length > 0) {
            const allChecked = medications.every(m => checkedMeds[getMedKey(m)]);
            if (!allChecked) {
                const cc = medications.filter(m => checkedMeds[getMedKey(m)]).length;
                Alert.alert(
                    'Incomplete Medication Review',
                    `Only ${cc} of ${medications.length} medications are confirmed. The patient will remain PENDING in your queue until all medications are verified.\n\nDo you want to proceed?`,
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

        const isCallMade = outcome === 'completed';
        
        // Current shift med confirmations
        const medConfirmations = isCallMade ? medications.map(med => ({
            medicationId: med._id || null,
            medicationName: med.name,
            confirmed: !!checkedMeds[getMedKey(med)],
            reason: '',
            notes: ''
        })) : [];

        // Previous shift med confirmations (only confirmed ones, with scheduledShift)
        if (isCallMade) {
            prevShiftMeds.forEach(med => {
                if (checkedPrevMeds[getPrevMedKey(med)]) {
                    medConfirmations.push({
                        medicationId: med._id || null,
                        medicationName: med.name,
                        confirmed: true,
                        scheduledShift: med._shift,
                        reason: '',
                        notes: `Confirmed during ${currentShift} shift call`
                    });
                }
            });
        }

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

    const checkedCount = medications.filter(m => checkedMeds[getMedKey(m)]).length;
    const ringSize = 150;
    const ringStroke = 6;
    const ringRadius = (ringSize - ringStroke) / 2;
    const ringCircum = 2 * Math.PI * ringRadius;
    const ringProgress = ringCircum - (ringCircum * (seconds % 60)) / 60;

    return (
        <View style={st.root}>
            <StatusBar barStyle="dark-content" />
            
            {/* ═══ Premium Light Header ═══ */}
            <LinearGradient colors={['#EEF2FF', '#F5F3FF', '#F8FAFC']} style={st.header}>
                {/* Top badges — centered */}
                <View style={st.headerTopRow}>
                    <View style={st.livePill}>
                        <View style={st.liveDot} />
                        <Text style={st.liveTxt}>LIVE CALL</Text>
                    </View>
                    <View style={st.shiftPill}>
                        <Ionicons name={getShiftIcon(currentShift)} size={13} color="#D97706" />
                        <Text style={st.shiftTxt}>{getShiftLabel(currentShift)} Shift</Text>
                    </View>
                </View>

                {/* SVG Progress Ring + Timer */}
                <View style={st.timerBlock}>
                    <View style={st.timerRingWrap}>
                        <Svg width={ringSize} height={ringSize} style={{ position: 'absolute' }}>
                            <Circle cx={ringSize/2} cy={ringSize/2} r={ringRadius} fill="none" stroke="#E2E8F0" strokeWidth={ringStroke} />
                            <Circle cx={ringSize/2} cy={ringSize/2} r={ringRadius} fill="none" stroke="#6366F1" strokeWidth={ringStroke} strokeLinecap="round" strokeDasharray={ringCircum} strokeDashoffset={ringProgress} transform={`rotate(-90 ${ringSize/2} ${ringSize/2})`} />
                        </Svg>
                        <View style={st.timerInner}>
                            <Text style={st.timerText}>{formatTime(seconds)}</Text>
                            <Text style={st.timerSec}>elapsed</Text>
                        </View>
                    </View>
                    <Text style={st.patientNameText} numberOfLines={1}>{patientName || 'Patient'}</Text>
                </View>
            </LinearGradient>

            <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>
                {loading ? (
                    <View style={st.loader}>
                        <ActivityIndicator size="large" color="#4F46E5" />
                    </View>
                ) : (
                    <>
                        {/* ═══ Medication Review ═══ */}
                        <View style={st.sectionHeader}>
                            <Ionicons name="medical" size={16} color="#4F46E5" />
                            <Text style={st.sectionTitle}>{getShiftLabel(currentShift)} Medications</Text>
                            {medications.length > 0 && (
                                <View style={st.medCountPill}>
                                    <Text style={st.medCountTxt}>{checkedCount}/{medications.length}</Text>
                                </View>
                            )}
                        </View>
                        <View style={st.card}>
                            {medications.length === 0 ? (
                                <View style={st.emptyState}>
                                    <View style={st.emptyIconWrap}>
                                        <Ionicons name="checkmark-circle" size={28} color="#10B981" />
                                    </View>
                                    <Text style={st.emptyTitle}>All Clear</Text>
                                    <Text style={st.emptySub}>No medications for this shift</Text>
                                </View>
                            ) : (
                                medications.map((m, i) => {
                                    const isChecked = checkedMeds[getMedKey(m)];
                                    return (
                                        <React.Fragment key={getMedKey(m) || i}>
                                            {i > 0 && <View style={st.divider} />}
                                            <TouchableOpacity style={st.medRow} onPress={() => toggleMed(m)} activeOpacity={0.65}>
                                                <View style={[st.medCheck, isChecked && st.medCheckDone]}>
                                                    {isChecked && <Feather name="check" size={13} color="#FFF" />}
                                                </View>
                                                <View style={st.medInfo}>
                                                    <Text style={[st.medName, isChecked && st.medDone]} numberOfLines={1}>{m.name}</Text>
                                                    <Text style={[st.medDetail, isChecked && st.medDone]}>{m.dosage} · {m.frequency}</Text>
                                                </View>
                                                <View style={[st.medStatusPill, isChecked ? st.medStatusDone : st.medStatusPending]}>
                                                    <Text style={[st.medStatusTxt, isChecked && { color: '#059669' }]}>
                                                        {isChecked ? 'Confirmed' : 'Pending'}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </View>

                        {/* ═══ Previous Shift Missed Meds ═══ */}
                        {prevShiftMeds.length > 0 && (
                            <>
                                <View style={st.sectionHeader}>
                                    <Feather name="clock" size={15} color="#D97706" />
                                    <Text style={[st.sectionTitle, { color: '#92400E' }]}>Missed from Earlier</Text>
                                    <View style={st.prevCountPill}>
                                        <Text style={st.prevCountTxt}>{prevShiftMeds.length}</Text>
                                    </View>
                                </View>
                                <View style={[st.card, { borderColor: '#FDE68A' }]}>
                                    {prevShiftMeds.map((m, i) => {
                                        const isChecked = checkedPrevMeds[getPrevMedKey(m)];
                                        return (
                                            <React.Fragment key={getPrevMedKey(m) || i}>
                                                {i > 0 && <View style={st.divider} />}
                                                <TouchableOpacity style={st.medRow} onPress={() => togglePrevMed(m)} activeOpacity={0.65}>
                                                    <View style={[st.medCheck, isChecked && st.medCheckDone]}>
                                                        {isChecked && <Feather name="check" size={13} color="#FFF" />}
                                                    </View>
                                                    <View style={st.medInfo}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                            <Text style={[st.medName, isChecked && st.medDone]} numberOfLines={1}>{m.name}</Text>
                                                            <View style={st.shiftTag}>
                                                                <Text style={st.shiftTagTxt}>{getShiftLabel(m._shift)}</Text>
                                                            </View>
                                                        </View>
                                                        <Text style={[st.medDetail, isChecked && st.medDone]}>{m.dosage} · {m.frequency}</Text>
                                                    </View>
                                                    <View style={[st.medStatusPill, isChecked ? st.medStatusDone : { backgroundColor: '#FEF3C7' }]}>
                                                        <Text style={[st.medStatusTxt, isChecked ? { color: '#059669' } : { color: '#B45309' }]}>
                                                            {isChecked ? 'Confirmed' : 'Missed'}
                                                        </Text>
                                                    </View>
                                                </TouchableOpacity>
                                            </React.Fragment>
                                        );
                                    })}
                                </View>
                            </>
                        )}

                        {/* ═══ Patient Mood ═══ */}
                        <View style={st.sectionHeader}>
                            <Feather name="heart" size={15} color="#4F46E5" />
                            <Text style={st.sectionTitle}>Patient Mood</Text>
                        </View>
                        <View style={st.moodRow}>
                            {[
                                { id: 'good', icon: 'happy', color: '#10B981', bg: ['#D1FAE5', '#A7F3D0'], label: 'Good' },
                                { id: 'neutral', icon: 'happy-outline', color: '#F59E0B', bg: ['#FEF3C7', '#FDE68A'], label: 'Neutral' },
                                { id: 'bad', icon: 'sad', color: '#EF4444', bg: ['#FEE2E2', '#FECACA'], label: 'Unwell' }
                            ].map(opt => {
                                const active = mood === opt.id;
                                return (
                                    <TouchableOpacity key={opt.id} style={[st.moodCard, active && { borderColor: opt.color }]} activeOpacity={0.75} onPress={() => setMood(opt.id)}>
                                        <View style={[st.moodIconWrap, active && { backgroundColor: opt.color + '18' }]}>
                                            <Ionicons name={opt.icon} size={26} color={active ? opt.color : '#94A3B8'} />
                                        </View>
                                        <Text style={[st.moodLabel, active && { color: opt.color, fontWeight: '800' }]}>{opt.label}</Text>
                                        {active && <View style={[st.moodDot, { backgroundColor: opt.color }]} />}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* ═══ Call Outcome ═══ */}
                        <View style={st.sectionHeader}>
                            <Feather name="phone" size={15} color="#4F46E5" />
                            <Text style={st.sectionTitle}>Call Outcome</Text>
                        </View>
                        <View style={st.card}>
                            {[
                                { id: 'completed', label: 'Completed', sub: 'Contact was made', icon: 'checkmark-circle', color: '#10B981' },
                                { id: 'no_answer', label: 'No Answer', sub: 'Patient didn\'t pick up', icon: 'call', color: '#F59E0B' },
                                { id: 'missed', label: 'Cancelled', sub: 'Call was skipped', icon: 'close-circle', color: '#EF4444' },
                            ].map((item, i) => {
                                const active = outcome === item.id;
                                return (
                                    <React.Fragment key={item.id}>
                                        {i > 0 && <View style={st.divider} />}
                                        <TouchableOpacity style={st.outcomeRow} activeOpacity={0.7} onPress={() => setOutcome(item.id)}>
                                            <View style={[st.outcomeIconWrap, active && { backgroundColor: item.color + '15' }]}>
                                                <Ionicons name={item.icon} size={20} color={active ? item.color : '#CBD5E1'} />
                                            </View>
                                            <View style={st.outcomeInfo}>
                                                <Text style={[st.outcomeLabel, active && { color: '#0F172A' }]}>{item.label}</Text>
                                                <Text style={st.outcomeSub}>{item.sub}</Text>
                                            </View>
                                            <View style={[st.radioOuter, active && { borderColor: item.color }]}>
                                                {active && <View style={[st.radioInner, { backgroundColor: item.color }]} />}
                                            </View>
                                        </TouchableOpacity>
                                    </React.Fragment>
                                );
                            })}
                        </View>

                        {/* ═══ Notes ═══ */}
                        <View style={st.sectionHeader}>
                            <Feather name="edit-3" size={15} color="#4F46E5" />
                            <Text style={st.sectionTitle}>Notes</Text>
                        </View>
                        <View style={st.card}>
                            <TextInput
                                style={st.notesInput}
                                placeholder="Any important observations about this call..."
                                placeholderTextColor="#94A3B8"
                                value={notes}
                                onChangeText={setNotes}
                                multiline
                                textAlignVertical="top"
                            />
                        </View>

                        {/* ═══ End Call Button ═══ */}
                        <TouchableOpacity style={st.endBtnWrap} activeOpacity={0.85} onPress={handleEndCall} disabled={saving}>
                            <LinearGradient colors={['#EF4444', '#DC2626']} start={{x:0,y:0}} end={{x:1,y:0}} style={st.endBtnGrad}>
                                {saving ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <>
                                        <Feather name="phone-off" size={19} color="#FFFFFF" />
                                        <Text style={st.endBtnText}>Log & End Call</Text>
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        <View style={{ height: 40 }} />
                    </>
                )}
            </ScrollView>
        </View>
    );
}

// ═══════════════════════════════════════════
// PREMIUM STYLES
// ═══════════════════════════════════════════
const st = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F8FAFC' },

    // ── Header ──
    header: { paddingTop: 54, paddingBottom: 24, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, ...Theme.shadows.sharp, shadowColor: '#6366F1', shadowOpacity: 0.06 },
    headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, gap: 10 },
    livePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EF4444', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, gap: 6 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
    liveTxt: { fontSize: 10, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.8 },
    shiftPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, gap: 5, borderWidth: 1, borderColor: '#FDE68A' },
    shiftTxt: { fontSize: 11, fontWeight: '700', color: '#D97706' },

    // Timer
    timerBlock: { alignItems: 'center', marginTop: 20 },
    timerRingWrap: { width: 150, height: 150, justifyContent: 'center', alignItems: 'center' },
    timerInner: {
        width: 126, height: 126, borderRadius: 63,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center', alignItems: 'center',
        ...Theme.shadows.sharp, shadowColor: '#6366F1', shadowOpacity: 0.1,
    },
    timerText: { fontSize: 38, fontWeight: '900', color: '#0F172A', letterSpacing: 2, fontVariant: ['tabular-nums'] },
    timerSec: { fontSize: 10, fontWeight: '600', color: '#94A3B8', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 },
    patientNameText: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginTop: 14, paddingHorizontal: 40 },

    // ── Scrollable ──
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
    loader: { paddingVertical: 60, alignItems: 'center' },

    // Section
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28, marginBottom: 14, paddingHorizontal: 2 },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', flex: 1, letterSpacing: -0.2 },
    medCountPill: { backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#E0E7FF' },
    medCountTxt: { fontSize: 12, fontWeight: '800', color: '#4F46E5' },

    // Card
    card: { backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden', ...Theme.shadows.sharp, elevation: 2 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E2E8F0', marginLeft: 58 },

    // Empty State
    emptyState: { paddingVertical: 40, alignItems: 'center' },
    emptyIconWrap: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
    emptyTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
    emptySub: { fontSize: 13, fontWeight: '500', color: '#94A3B8' },

    // Medication Row
    medRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 18 },
    medCheck: { width: 28, height: 28, borderRadius: 10, borderWidth: 2.5, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center' },
    medCheckDone: { backgroundColor: '#10B981', borderColor: '#10B981' },
    medInfo: { flex: 1, marginLeft: 14 },
    medName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
    medDetail: { fontSize: 12, fontWeight: '500', color: '#94A3B8', marginTop: 3 },
    medDone: { textDecorationLine: 'line-through', color: '#B0B8C4' },
    medStatusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    medStatusPending: { backgroundColor: '#FFF7ED' },
    medStatusDone: { backgroundColor: '#ECFDF5' },
    medStatusTxt: { fontSize: 10, fontWeight: '800', color: '#D97706', letterSpacing: 0.3 },

    // Previous Shift
    prevCountPill: { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A' },
    prevCountTxt: { fontSize: 12, fontWeight: '800', color: '#B45309' },
    shiftTag: { backgroundColor: '#EEF2FF', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
    shiftTagTxt: { fontSize: 9, fontWeight: '800', color: '#6366F1', letterSpacing: 0.3, textTransform: 'uppercase' },

    // Mood
    moodRow: { flexDirection: 'row', gap: 10 },
    moodCard: {
        flex: 1, alignItems: 'center', paddingVertical: 18, borderRadius: 20,
        backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#F1F5F9',
        ...Theme.shadows.sharp, elevation: 2,
    },
    moodIconWrap: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
    moodLabel: { fontSize: 13, fontWeight: '700', color: '#94A3B8', marginTop: 10 },
    moodDot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },

    // Outcome
    outcomeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 18 },
    outcomeIconWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    outcomeInfo: { flex: 1 },
    outcomeLabel: { fontSize: 15, fontWeight: '700', color: '#64748B' },
    outcomeSub: { fontSize: 12, fontWeight: '500', color: '#94A3B8', marginTop: 2 },
    radioOuter: { width: 24, height: 24, borderRadius: 12, borderWidth: 2.5, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center' },
    radioInner: { width: 12, height: 12, borderRadius: 6 },

    // Notes
    notesInput: { fontSize: 15, fontWeight: '500', color: '#0F172A', minHeight: 110, padding: 18, lineHeight: 22 },

    // End Button
    endBtnWrap: { marginTop: 36, borderRadius: 20, overflow: 'hidden', ...Theme.shadows.sharp, shadowColor: '#EF4444', shadowOpacity: 0.3, elevation: 4 },
    endBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 19 },
    endBtnText: { fontSize: 17, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.3 },
});
