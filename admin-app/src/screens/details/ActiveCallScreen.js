import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator, StatusBar, Animated, BackHandler, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { Theme } from '../../theme/theme';
import { apiService } from '../../lib/api';
import { createAgoraRtcEngine, ChannelProfileType, ClientRoleType } from 'react-native-agora';

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
    const [checkedTempMeds, setCheckedTempMeds] = useState({});
    
    const currentShift = getCurrentShift();

    // Temporary / OTC Medicines
    const [tempMeds, setTempMeds] = useState([]);
    const [showAddTempMed, setShowAddTempMed] = useState(false);
    const [tempMedForm, setTempMedForm] = useState({ name: '', dosage: '', frequency: 'As needed', reason: '', shift: currentShift });
    const [tempMedAI, setTempMedAI] = useState(null);
    const [tempMedLoading, setTempMedLoading] = useState(false);
    const [aiLookupLoading, setAiLookupLoading] = useState(false);
    
    // Notes and mood
    const [notes, setNotes] = useState('');
    const [mood, setMood] = useState('neutral');
    const [outcome, setOutcome] = useState('completed');
    
    // Agora State
    const [agoraEngine, setAgoraEngine] = useState(null);
    const [isJoined, setIsJoined] = useState(false);
    const [remoteUid, setRemoteUid] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeaker, setIsSpeaker] = useState(true);
    const [agoraError, setAgoraError] = useState(null);

    // Dictation State
    const [recording, setRecording] = useState(null);
    const [isDictating, setIsDictating] = useState(false);
    const [dictationTime, setDictationTime] = useState(0);
    const dictationTimerRef = useRef(null);

    const timerRef = useRef(null);
    const startedAtRef = useRef(new Date().toISOString());

    const getMedKey = (med) => med._id || med.name || JSON.stringify(med);
    const getPrevMedKey = (med) => `${med._shift}_${getMedKey(med)}`;

    // Previous shifts for the current shift
    const getPrevShifts = () => {
        if (currentShift === 'afternoon') return ['morning'];
        if (currentShift === 'night') return ['morning', 'afternoon'];
        return [];
    };

    // Filter temp meds based on shift
    const shiftWeights = { morning: 1, afternoon: 2, night: 3 };
    const currentShiftWeight = shiftWeights[currentShift];
    const displayTempMeds = tempMeds.filter(tm => shiftWeights[tm.shift] <= currentShiftWeight);

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
        fetchTempMeds();
        
        timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
        return () => clearInterval(timerRef.current);
    }, [patientId]);

    // Block Android back button — must use Log & End Call
    useEffect(() => {
        const handler = BackHandler.addEventListener('hardwareBackPress', () => true);
        return () => handler.remove();
    }, []);

    // ── Temp Meds Helpers ──
    const fetchTempMeds = useCallback(async () => {
        if (!patientId || patientId === 'mock') return;
        try {
            const res = await apiService.caretaker.getTempMeds(patientId);
            setTempMeds(res.data?.tempMedications || []);
        } catch (err) {
            console.warn('[ActiveCall] TempMeds fetch error:', err.message);
        }
    }, [patientId]);

    // ── Agora Call Management ──
    const initAgora = async () => {
        try {
            // Fetch token from backend
            const tokenRes = await apiService.caretaker.getAgoraToken(patientId);
            const { token, appId } = tokenRes.data;

            if (!appId || appId === 'mock-app-id') {
                setAgoraError('Missing backend credentials (mock mode)');
                return;
            }

            const engine = createAgoraRtcEngine();
            engine.initialize({ appId });
            engine.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
            
            engine.enableAudio();
            engine.setEnableSpeakerphone(isSpeaker);

            engine.addListener('onJoinChannelSuccess', () => setIsJoined(true));
            engine.addListener('onUserJoined', (conn, uid) => setRemoteUid(uid));
            engine.addListener('onUserOffline', () => setRemoteUid(null));
            engine.addListener('onError', (err, msg) => setAgoraError(`Error: ${msg}`));

            setAgoraEngine(engine);
            engine.joinChannel(token, patientId, 0, {
                clientRoleType: ClientRoleType.ClientRoleBroadcaster,
            });
        } catch (e) {
            console.error('[Agora] init failed:', e);
            setAgoraError('Failed to initialize call');
        }
    };

    const toggleMute = () => {
        if (agoraEngine) {
            agoraEngine.muteLocalAudioStream(!isMuted);
            setIsMuted(!isMuted);
        }
    };

    const toggleSpeaker = () => {
        if (agoraEngine) {
            agoraEngine.setEnableSpeakerphone(!isSpeaker);
            setIsSpeaker(!isSpeaker);
        }
    };

    const cleanupAgora = () => {
        if (agoraEngine) {
            try {
                agoraEngine.leaveChannel();
                agoraEngine.removeAllListeners();
                agoraEngine.release();
            } catch (e) {}
            setAgoraEngine(null);
        }
    };

    useEffect(() => {
        return () => cleanupAgora();
    }, [agoraEngine]);


    const handleAILookup = async () => {
        if (!tempMedForm.name.trim()) return;
        setAiLookupLoading(true);
        try {
            const res = await apiService.caretaker.getMedicineInfo(tempMedForm.name.trim());
            setTempMedAI(res.data);
        } catch { setTempMedAI(null); }
        finally { setAiLookupLoading(false); }
    };

    const handleAddTempMed = async () => {
        if (!tempMedForm.name.trim()) return Alert.alert('Error', 'Medicine name is required.');
        setTempMedLoading(true);
        try {
            await apiService.caretaker.addTempMed(patientId, tempMedForm);
            setShowAddTempMed(false);
            setTempMedForm({ name: '', dosage: '', frequency: 'As needed', reason: '', shift: currentShift });
            setTempMedAI(null);
            fetchTempMeds();
        } catch (err) {
            Alert.alert('Error', err?.response?.data?.error || 'Failed to add medicine.');
        } finally { setTempMedLoading(false); }
    };

    const handleDeleteTempMed = (med) => {
        if (Platform.OS === 'web') {
            if (window.confirm(`Remove "${med.name}" from temporary medicines?`)) {
                apiService.caretaker.deleteTempMed(patientId, med._id)
                    .then(fetchTempMeds)
                    .catch(e => alert('Failed to remove: ' + e.message));
            }
            return;
        }
        Alert.alert('Remove Medicine', `Remove "${med.name}" from temporary medicines?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: async () => {
                try {
                    await apiService.caretaker.deleteTempMed(patientId, med._id);
                    fetchTempMeds();
                } catch { Alert.alert('Error', 'Failed to remove.'); }
            }},
        ]);
    };

    const getRiskColor = (tier) => tier === 'safe' ? '#10B981' : tier === 'restricted' ? '#EF4444' : '#F59E0B';
    const getRiskBg = (tier) => tier === 'safe' ? '#F0FDF4' : tier === 'restricted' ? '#FEF2F2' : '#FFFBEB';
    const getRiskBorder = (tier) => tier === 'safe' ? '#BBF7D0' : tier === 'restricted' ? '#FECACA' : '#FDE68A';
    const getRiskLabel = (tier) => tier === 'safe' ? 'OTC — Safe' : tier === 'restricted' ? 'Prescription Only — Verify with Doctor' : 'Use with Caution';

    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const toggleMed = (med) => {
        if (outcome !== 'completed') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('Cannot Mark Medications', 'You can only confirm medications when the call outcome is "Completed (Contact Made)".');
            return;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const key = getMedKey(med);
        setCheckedMeds(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const togglePrevMed = (med) => {
        if (outcome !== 'completed') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('Cannot Mark Medications', 'You can only confirm medications when the call outcome is "Completed (Contact Made)".');
            return;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const key = getPrevMedKey(med);
        setCheckedPrevMeds(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleTempMed = (med) => {
        if (outcome !== 'completed') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('Cannot Mark Medications', 'You can only confirm medications when the call outcome is "Completed (Contact Made)".');
            return;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCheckedTempMeds(prev => ({ ...prev, [med._id]: !prev[med._id] }));
    };

    // ── Dictation Logic ──
    const startDictation = async () => {
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const permission = await Audio.requestPermissionsAsync();
            if (permission.status !== 'granted') {
                Alert.alert('Permission required', 'Please grant microphone access to use voice dictation.');
                return;
            }
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });
            const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
            setRecording(recording);
            setDictationTime(0);
            dictationTimerRef.current = setInterval(() => {
                setDictationTime(t => t + 1);
            }, 1000);
        } catch (err) {
            console.error('Failed to start recording', err);
            Alert.alert('Error', 'Could not start recording.');
        }
    };

    const stopDictation = async () => {
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (!recording) return;
            setIsDictating(true);
            setRecording(null);
            clearInterval(dictationTimerRef.current);
            await recording.stopAndUnloadAsync();
            
            const uri = recording.getURI();
            
            // Format for FormData
            const formData = new FormData();
            formData.append('audio', {
                uri,
                name: 'dictation.m4a',
                type: 'audio/m4a'
            });

            const res = await apiService.caretaker.dictate(formData);
            if (res.data?.success && res.data?.data) {
                const { originalText, translatedText, language } = res.data.data;
                let newNote = '';
                
                if (language && language.toLowerCase() !== 'en' && language.toLowerCase() !== 'english' && originalText !== translatedText) {
                    newNote = `[Original - ${language}]: ${originalText}\n[Translation]: ${translatedText}\n\n`;
                } else {
                    newNote = `${translatedText}\n\n`;
                }

                setNotes(prev => (prev ? prev + '\n\n' + newNote : newNote).trim());
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
        } catch (err) {
            console.error('Dictation error:', err);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('Dictation Failed', 'Could not process the audio. Please try again.');
        } finally {
            setIsDictating(false);
        }
    };

    const handleEndCall = async () => {
        if (!outcome) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
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
                        reason: '',
                        notes: `Confirmed missed dose from ${med._shift} shift.`
                    });
                }
            });

            // Temp meds confirmations
            tempMeds.forEach(med => {
                if (checkedTempMeds[med._id]) {
                    medConfirmations.push({
                        medicationId: null, // Don't link to main collection
                        medicationName: med.name + ' (Temp)',
                        confirmed: true,
                        reason: '',
                        notes: 'Temporary medicine confirmed.'
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
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            navigation.goBack();
        } catch (err) {
            console.error('[ActiveCall] End call error:', err);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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

                    {/* Agora Controls */}
                    <View style={st.agoraControls}>
                        <TouchableOpacity style={[st.controlBtn, isMuted && st.controlBtnActive]} onPress={toggleMute}>
                            <Ionicons name={isMuted ? "mic-off" : "mic"} size={22} color={isMuted ? "#EF4444" : "#64748B"} />
                        </TouchableOpacity>
                        <TouchableOpacity style={[st.controlBtn, isSpeaker && st.controlBtnActive]} onPress={toggleSpeaker}>
                            <Ionicons name={isSpeaker ? "volume-high" : "volume-medium"} size={22} color={isSpeaker ? "#6366F1" : "#64748B"} />
                        </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
                        {agoraError ? (
                            <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '500' }}>{agoraError}</Text>
                        ) : remoteUid ? (
                            <>
                                <View style={[st.statusDot, { backgroundColor: '#10B981' }]} />
                                <Text style={{ fontSize: 13, color: '#10B981', fontWeight: '600' }}>Patient Connected</Text>
                            </>
                        ) : (
                            <>
                                <ActivityIndicator size="small" color="#6366F1" />
                                <Text style={{ fontSize: 13, color: '#6366F1', fontWeight: '500' }}>Calling patient...</Text>
                            </>
                        )}
                    </View>
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

                        {/* ═══ Temporary / OTC Medicines ═══ */}
                        <View style={[st.sectionHeader, { justifyContent: 'space-between' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingRight: 10 }}>
                                <Ionicons name="medkit" size={16} color="#8B5CF6" />
                                <Text style={st.sectionTitle} numberOfLines={1}>Temporary Medicines</Text>
                                {displayTempMeds.length > 0 && (
                                    <View style={[st.medCountPill, { backgroundColor: '#F3E8FF', borderColor: '#DDD6FE' }]}>
                                        <Text style={[st.medCountTxt, { color: '#7C3AED' }]}>{displayTempMeds.length}</Text>
                                    </View>
                                )}
                            </View>
                            <TouchableOpacity style={st.addTempBtn} onPress={() => setShowAddTempMed(true)} activeOpacity={0.7}>
                                <Feather name="plus" size={14} color="#7C3AED" />
                                <Text style={st.addTempBtnTxt}>Add</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={st.card}>
                            {displayTempMeds.length === 0 ? (
                                <View style={st.emptyState}>
                                    <View style={[st.emptyIconWrap, { backgroundColor: '#F3E8FF' }]}>
                                        <Ionicons name="medkit-outline" size={24} color="#8B5CF6" />
                                    </View>
                                    <Text style={st.emptyTitle}>No Temporary Medicines</Text>
                                    <Text style={st.emptySub}>Tap + Add to add OTC / short-term medicines</Text>
                                </View>
                            ) : (
                                displayTempMeds.map((tm, i) => {
                                    const isChecked = checkedTempMeds[tm._id];
                                    return (
                                        <React.Fragment key={tm._id || i}>
                                            {i > 0 && <View style={st.divider} />}
                                            <TouchableOpacity 
                                                style={[st.medRow, { borderLeftWidth: 4, borderLeftColor: getRiskColor(tm.riskTier), paddingLeft: 14 }]} 
                                                onPress={() => toggleTempMed(tm)} 
                                                activeOpacity={0.65}
                                            >
                                                <View style={[st.medCheck, isChecked && st.medCheckDone]}>
                                                    {isChecked && <Feather name="check" size={13} color="#FFF" />}
                                                </View>
                                                
                                                <View style={st.medInfo}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                        <Text style={[st.medName, isChecked && st.medDone]} numberOfLines={1}>{tm.name}</Text>
                                                        
                                                        {tm.shift && (
                                                            <View style={st.shiftTag}>
                                                                <Text style={st.shiftTagTxt}>{tm.shift}</Text>
                                                            </View>
                                                        )}

                                                        <View style={[st.riskPill, { backgroundColor: getRiskBg(tm.riskTier), borderColor: getRiskBorder(tm.riskTier) }]}>
                                                            <Text style={[st.riskPillTxt, { color: getRiskColor(tm.riskTier) }]}>
                                                                {tm.riskTier === 'safe' ? '● Safe' : tm.riskTier === 'restricted' ? '● Restricted' : '● Caution'}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    {(tm.dosage || tm.frequency) ? <Text style={[st.medDetail, isChecked && st.medDone]}>{[tm.dosage, tm.frequency].filter(Boolean).join(' · ')}</Text> : null}
                                                    {tm.reason ? <Text style={[st.medDetail, isChecked && st.medDone, { color: '#64748B' }]}>Reason: {tm.reason}</Text> : null}
                                                    {tm.aiSummary ? <Text style={[st.medDetail, isChecked && st.medDone, { fontStyle: 'italic', color: '#6B7280', marginTop: 4 }]}>{tm.aiSummary}</Text> : null}
                                                    {tm.riskTier === 'restricted' && !isChecked && (
                                                        <View style={st.restrictedBanner}>
                                                            <Ionicons name="warning" size={13} color="#DC2626" />
                                                            <Text style={st.restrictedTxt}>Do NOT remind without doctor approval</Text>
                                                        </View>
                                                    )}
                                                    {tm.riskTier === 'caution' && !isChecked && tm.warnings?.length > 0 && (
                                                        <View style={st.cautionBanner}>
                                                            <Ionicons name="alert-circle" size={13} color="#D97706" />
                                                            <Text style={st.cautionTxt}>{tm.warnings[0]}</Text>
                                                        </View>
                                                    )}
                                                    <Text style={[st.medDetail, { fontSize: 10, color: '#94A3B8', marginTop: 4 }]}>Added by {tm.addedByName || tm.addedByRole}</Text>
                                                </View>
                                                <TouchableOpacity 
                                                    onPress={() => handleDeleteTempMed(tm)} 
                                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                                    style={{ padding: 6, marginLeft: 8 }}
                                                >
                                                    <Feather name="trash-2" size={18} color="#94A3B8" />
                                                </TouchableOpacity>
                                            </TouchableOpacity>
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </View>

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
                                    <TouchableOpacity 
                                        key={opt.id} 
                                        style={[st.moodCard, active && { borderColor: opt.color }]} 
                                        activeOpacity={0.75} 
                                        onPress={() => {
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                            setMood(opt.id);
                                        }}
                                    >
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
                                        <TouchableOpacity 
                                            style={st.outcomeRow} 
                                            activeOpacity={0.7} 
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                setOutcome(item.id);
                                            }}
                                        >
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
                        <View style={[st.sectionHeader, { justifyContent: 'space-between' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Feather name="edit-3" size={15} color="#4F46E5" />
                                <Text style={st.sectionTitle}>Notes</Text>
                            </View>
                            
                            {/* Dictation Button */}
                            {isDictating ? (
                                <View style={st.dictationLoader}>
                                    <ActivityIndicator size="small" color="#7C3AED" />
                                    <Text style={st.dictationText}>Transcribing...</Text>
                                </View>
                            ) : recording ? (
                                <TouchableOpacity style={st.dictationBtnActive} onPress={stopDictation} activeOpacity={0.7}>
                                    <View style={st.recordingDot} />
                                    <Text style={st.dictationBtnActiveTxt}>{formatTime(dictationTime)} • Stop</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={st.dictationBtn} onPress={startDictation} activeOpacity={0.7}>
                                    <Ionicons name="mic" size={14} color="#7C3AED" />
                                    <Text style={st.dictationBtnTxt}>Dictate</Text>
                                </TouchableOpacity>
                            )}
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

            {/* ═══ Add Temp Medicine Modal ═══ */}
            <Modal visible={showAddTempMed} animationType="slide" transparent onRequestClose={() => setShowAddTempMed(false)}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <TouchableOpacity style={st.modalOverlay} activeOpacity={1} onPress={() => setShowAddTempMed(false)}>
                        <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()} style={st.modalSheet}>
                            <View style={st.modalHandle} />
                            <Text style={st.modalTitle}>Add Temporary Medicine</Text>
                            <Text style={st.modalSub}>For OTC / short-term medicines only</Text>

                            <TextInput style={st.modalInput} placeholder="Medicine name (e.g. Dolo 650)" placeholderTextColor="#94A3B8" value={tempMedForm.name} onChangeText={v => { setTempMedForm(f => ({ ...f, name: v })); setTempMedAI(null); }} />
                            <TextInput style={st.modalInput} placeholder="Dosage (e.g. 1 tablet)" placeholderTextColor="#94A3B8" value={tempMedForm.dosage} onChangeText={v => setTempMedForm(f => ({ ...f, dosage: v }))} />

                            <View style={st.freqRow}>
                                {['morning', 'afternoon', 'night'].map(s => (
                                    <TouchableOpacity key={s} style={[st.freqChip, tempMedForm.shift === s && st.freqChipActive, { backgroundColor: tempMedForm.shift === s ? '#EEF2FF' : '#F8FAFC', borderColor: tempMedForm.shift === s ? '#818CF8' : '#F1F5F9' }]} onPress={() => setTempMedForm(fm => ({ ...fm, shift: s }))}>
                                        <Text style={[st.freqChipTxt, tempMedForm.shift === s && st.freqChipTxtActive, { color: tempMedForm.shift === s ? '#4F46E5' : '#64748B' }]}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={st.freqRow}>
                                {['Once daily', 'Twice daily', 'Thrice daily', 'As needed'].map(f => (
                                    <TouchableOpacity key={f} style={[st.freqChip, tempMedForm.frequency === f && st.freqChipActive]} onPress={() => setTempMedForm(fm => ({ ...fm, frequency: f }))}>
                                        <Text style={[st.freqChipTxt, tempMedForm.frequency === f && st.freqChipTxtActive]}>{f}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <TextInput style={st.modalInput} placeholder="Reason (e.g. Fever, Headache)" placeholderTextColor="#94A3B8" value={tempMedForm.reason} onChangeText={v => setTempMedForm(f => ({ ...f, reason: v }))} />

                            {/* AI Lookup */}
                            <TouchableOpacity style={st.aiLookupBtn} onPress={handleAILookup} disabled={aiLookupLoading || !tempMedForm.name.trim()}>
                                {aiLookupLoading ? <ActivityIndicator size="small" color="#7C3AED" /> : (
                                    <><Ionicons name="sparkles" size={16} color="#7C3AED" /><Text style={st.aiLookupTxt}>Check Medicine Safety</Text></>
                                )}
                            </TouchableOpacity>

                            {tempMedAI && (
                                <View style={[st.aiResultBox, { borderColor: getRiskBorder(tempMedAI.riskTier), backgroundColor: getRiskBg(tempMedAI.riskTier) }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                        <View style={[st.riskPill, { backgroundColor: '#FFF', borderColor: getRiskBorder(tempMedAI.riskTier) }]}>
                                            <Text style={[st.riskPillTxt, { color: getRiskColor(tempMedAI.riskTier) }]}>
                                                {getRiskLabel(tempMedAI.riskTier)}
                                            </Text>
                                        </View>
                                        {tempMedAI.genericName ? <Text style={{ fontSize: 12, color: '#64748B' }}>({tempMedAI.genericName})</Text> : null}
                                    </View>
                                    {tempMedAI.aiSummary ? <Text style={{ fontSize: 13, color: '#334155', lineHeight: 18, marginBottom: 4 }}>{tempMedAI.aiSummary}</Text> : null}
                                    {tempMedAI.warnings?.length > 0 && <Text style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>⚠ {tempMedAI.warnings.join(' · ')}</Text>}
                                </View>
                            )}

                            <TouchableOpacity style={[st.modalAddBtn, tempMedLoading && { opacity: 0.6 }]} onPress={handleAddTempMed} disabled={tempMedLoading}>
                                {tempMedLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={st.modalAddBtnTxt}>Add Medicine</Text>}
                            </TouchableOpacity>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </Modal>
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

    // Agora Controls
    agoraControls: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 16 },
    controlBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
    controlBtnActive: { backgroundColor: '#FEE2E2', borderColor: '#FECACA' },
    statusDot: { width: 8, height: 8, borderRadius: 4 },

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
    dictationBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F3E8FF', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#DDD6FE' },
    dictationBtnTxt: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },
    dictationBtnActive: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA' },
    dictationBtnActiveTxt: { fontSize: 12, fontWeight: '800', color: '#DC2626', fontVariant: ['tabular-nums'] },
    recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
    dictationLoader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dictationText: { fontSize: 12, fontWeight: '600', color: '#7C3AED' },

    // End Button
    endBtnWrap: { marginTop: 36, borderRadius: 20, overflow: 'hidden', ...Theme.shadows.sharp, shadowColor: '#EF4444', shadowOpacity: 0.3, elevation: 4 },
    endBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 19 },
    endBtnText: { fontSize: 17, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.3 },

    // ── Temp Meds ──
    addTempBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F3E8FF', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#DDD6FE' },
    addTempBtnTxt: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },
    tempMedRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14, paddingHorizontal: 18, borderLeftWidth: 3 },
    tempMedInfo: { flex: 1, marginRight: 10 },
    riskPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
    riskPillTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
    restrictedBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6, borderWidth: 1, borderColor: '#FECACA' },
    restrictedTxt: { fontSize: 11, fontWeight: '700', color: '#DC2626', flex: 1 },
    cautionBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFBEB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6, borderWidth: 1, borderColor: '#FDE68A' },
    cautionTxt: { fontSize: 11, fontWeight: '600', color: '#B45309', flex: 1 },

    // ── Add Temp Med Modal ──
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: '85%' },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginBottom: 4 },
    modalSub: { fontSize: 13, fontWeight: '500', color: '#94A3B8', marginBottom: 20 },
    modalInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, fontWeight: '500', color: '#0F172A', marginBottom: 12 },
    freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    freqChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
    freqChipActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
    freqChipTxt: { fontSize: 12, fontWeight: '600', color: '#64748B' },
    freqChipTxtActive: { color: '#4F46E5' },
    aiLookupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: '#DDD6FE', backgroundColor: '#FAFAFF', marginBottom: 12 },
    aiLookupTxt: { fontSize: 14, fontWeight: '700', color: '#7C3AED' },
    aiResultBox: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 16 },
    modalAddBtn: { backgroundColor: '#6366F1', borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
    modalAddBtnTxt: { fontSize: 16, fontWeight: '900', color: '#FFF' },
});
