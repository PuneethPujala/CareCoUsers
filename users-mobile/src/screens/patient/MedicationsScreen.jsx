import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View, Text, StyleSheet, ScrollView, Platform, Pressable, Animated,
    ActivityIndicator, Dimensions, Modal, RefreshControl,
    InteractionManager, LayoutAnimation, UIManager, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import PremiumFormModal from '../../components/ui/PremiumFormModal';
import {
    Pill, Sunrise, Sun, Sunset, Moon, CheckCircle2, Bell, Plus,
    AlertCircle, Calendar, Pencil, Clock, X, MessageCircle,
    ChevronDown, ChevronUp, Info, Upload, Shield, TrendingUp, Zap,
} from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Svg, { Circle as SvgCircle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { layout } from '../../theme';
import { apiService } from '../../lib/api';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import usePatientStore from '../../store/usePatientStore';
import * as Notifications from 'expo-notifications';
import AlertManager from '../../utils/AlertManager';

const { width: SW } = Dimensions.get('window');
const AnimatedSvgCircle = Animated.createAnimatedComponent(SvgCircle);

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Slot Configuration (correct chronological order) ────────────────────────
const SLOT_ORDER = ['morning', 'afternoon', 'evening', 'night', 'as_needed'];
const SLOT_CONFIG = {
    morning: {
        label: 'Morning', Icon: Sunrise,
        color: '#F97316', light: '#FFF7ED', border: '#FED7AA',
    },
    afternoon: {
        label: 'Afternoon', Icon: Sun,
        color: '#0EA5E9', light: '#F0F9FF', border: '#BAE6FD',
    },
    evening: {
        label: 'Evening', Icon: Sunset,
        color: '#A855F7', light: '#FAF5FF', border: '#E9D5FF',
    },
    night: {
        label: 'Night', Icon: Moon,
        color: '#6366F1', light: '#EEF2FF', border: '#C7D2FE',
    },
    as_needed: {
        label: 'As Needed', Icon: AlertCircle,
        color: '#10B981', light: '#ECFDF5', border: '#A7F3D0',
    },
};

const SLOT_START_HOURS = { morning: 5, afternoon: 11, evening: 16, night: 19 };

// ── Skeleton ─────────────────────────────────────────────────────────────────
const Skeleton = ({ width, height, radius = 10, style }) => {
    const anim = useRef(new Animated.Value(0.4)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 0.9, duration: 800, useNativeDriver: true }),
                Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
            ])
        ).start();
    }, []);
    return (
        <Animated.View
            style={[{ width, height, borderRadius: radius, backgroundColor: 'rgba(255,255,255,0.18)', opacity: anim }, style]}
        />
    );
};

// ── Progress Ring (for header) ────────────────────────────────────────────────
const ProgressRing = ({ progress = 0, size = 96, strokeWidth = 9 }) => {
    const radius = (size - strokeWidth) / 2;
    const circ = radius * 2 * Math.PI;
    const anim = useRef(new Animated.Value(0)).current;
    const [disp, setDisp] = useState(0);

    useEffect(() => {
        const id = anim.addListener(({ value }) => setDisp(Math.round(value)));
        Animated.spring(anim, { toValue: progress, friction: 8, tension: 40, useNativeDriver: false }).start();
        return () => anim.removeListener(id);
    }, [progress]);

    const offset = anim.interpolate({ inputRange: [0, 100], outputRange: [circ, 0], extrapolate: 'clamp' });

    return (
        <View style={{ width: size, height: size }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Defs>
                    <SvgLinearGradient id="pGrad" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0" stopColor="#60A5FA" stopOpacity="1" />
                        <Stop offset="1" stopColor="#A5F3FC" stopOpacity="1" />
                    </SvgLinearGradient>
                </Defs>
                <SvgCircle cx={size / 2} cy={size / 2} r={radius} stroke="#EEF2FF" strokeWidth={strokeWidth} fill="none" />
                <AnimatedSvgCircle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke="url(#pGrad)" strokeWidth={strokeWidth} fill="none"
                    strokeDasharray={circ} strokeDashoffset={offset}
                    strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </Svg>
            <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: '#0F172A', letterSpacing: -0.8 }}>{disp}%</Text>
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.2, textTransform: 'uppercase' }}>Done</Text>
            </View>
        </View>
    );
};

// ── Weekly Chart Bar ──────────────────────────────────────────────────────────
const ChartBar = ({ percentage, isToday, day }) => {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(anim, { toValue: percentage, friction: 8, tension: 40, useNativeDriver: false }).start();
    }, [percentage]);

    const height = anim.interpolate({ inputRange: [0, 100], outputRange: ['4%', '100%'], extrapolate: 'clamp' });

    return (
        <View style={{ alignItems: 'center', flex: 1 }}>
            <View style={{ height: 60, justifyContent: 'flex-end', width: '100%', alignItems: 'center' }}>
                <Animated.View style={{
                    height, width: '70%', minWidth: 14,
                    borderTopLeftRadius: 7, borderTopRightRadius: 7,
                    backgroundColor: isToday ? '#6366F1' : (percentage > 0 ? '#A5B4FC' : '#E2E8F0'),
                }} />
            </View>
            <View style={{
                width: 24, height: 24, borderRadius: 12, marginTop: 6,
                backgroundColor: isToday ? '#6366F1' : 'transparent',
                alignItems: 'center', justifyContent: 'center',
            }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: isToday ? '#FFFFFF' : '#94A3B8' }}>{day}</Text>
            </View>
        </View>
    );
};

// ── Slot Section Header ───────────────────────────────────────────────────────
const SlotHeader = ({ slot, callTime }) => {
    const cfg = SLOT_CONFIG[slot];
    if (!cfg) return null;
    const { label, Icon, color, light, border } = cfg;
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: light, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: border }}>
                    <Icon size={17} color={color} strokeWidth={2.5} />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#1E293B', letterSpacing: -0.1 }}>{label}</Text>
            </View>
            {callTime ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: light, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: border }}>
                    <Clock size={12} color={color} strokeWidth={2.5} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color }}>{callTime}</Text>
                </View>
            ) : null}
        </View>
    );
};

// ── Medication Card ───────────────────────────────────────────────────────────
const MedCard = ({ med, onToggle, onSnooze }) => {
    const [expanded, setExpanded] = useState(false);
    const swRef = useRef(null);
    const checkScale = useRef(new Animated.Value(med.taken ? 1 : 0)).current;
    const cfg = SLOT_CONFIG[med.type] || SLOT_CONFIG.as_needed;

    useEffect(() => {
        if (med.taken) {
            Animated.spring(checkScale, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }).start();
        }
    }, [med.taken]);

    const renderLeft = (progress, dragX) => {
        const trans = dragX.interpolate({ inputRange: [0, 80], outputRange: [-50, 0], extrapolate: 'clamp' });
        return (
            <Pressable
                style={[styles.swipeLeftAction]}
                onPress={() => { swRef.current?.close(); if (!med.taken) onToggle(med); }}
            >
                <Animated.View style={{ transform: [{ translateX: trans }], alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={26} color="#FFF" strokeWidth={2} />
                    <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>TAKE</Text>
                </Animated.View>
            </Pressable>
        );
    };

    const renderRight = (progress, dragX) => {
        const trans = dragX.interpolate({ inputRange: [-80, 0], outputRange: [0, 50], extrapolate: 'clamp' });
        return (
            <Pressable
                style={[styles.swipeRightAction]}
                onPress={() => { swRef.current?.close(); onSnooze(med); }}
            >
                <Animated.View style={{ transform: [{ translateX: trans }], alignItems: 'center', gap: 4 }}>
                    <Clock size={26} color="#FFF" strokeWidth={2} />
                    <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>SNOOZE</Text>
                </Animated.View>
            </Pressable>
        );
    };

    return (
        <Swipeable
            ref={swRef}
            renderLeftActions={med.taken ? null : renderLeft}
            renderRightActions={med.taken ? null : renderRight}
            onSwipeableLeftOpen={() => { if (!med.taken) onToggle(med); swRef.current?.close(); }}
            friction={2} leftThreshold={40} rightThreshold={40}
        >
            <Pressable
                onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setExpanded(e => !e);
                }}
                style={[styles.medCard, med.taken && styles.medCardTaken]}
            >
                {/* Top accent bar */}
                <View style={[styles.medTopBar, { backgroundColor: med.taken ? '#10B981' : cfg.color }]} />

                <View style={styles.medCardBody}>
                    {/* Icon box */}
                    <View style={[styles.medIconBox, { backgroundColor: med.taken ? '#DCFCE7' : cfg.light, borderColor: med.taken ? '#A7F3D0' : cfg.border }]}>
                        {med.taken ? (
                            <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                                <CheckCircle2 size={22} color="#10B981" strokeWidth={2.5} />
                            </Animated.View>
                        ) : (
                            <Pill size={22} color={cfg.color} strokeWidth={2.5} />
                        )}
                    </View>

                    {/* Text content */}
                    <View style={{ flex: 1, gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={[styles.medName, med.taken && { color: '#10B981' }]}>{med.name}</Text>
                            {med.taken && (
                                <View style={styles.takenBadge}>
                                    <CheckCircle2 size={10} color="#10B981" />
                                    <Text style={styles.takenBadgeTxt}>
                                        {med.marked_by === 'caller' ? 'By Caregiver' : 'Taken'}
                                    </Text>
                                </View>
                            )}
                            {med.verifiedByCaller && (
                                <View style={styles.verifiedBadge}>
                                    <Shield size={9} color="#059669" />
                                    <Text style={styles.verifiedTxt}>Verified</Text>
                                </View>
                            )}
                        </View>
                        <Text style={styles.medDose}>
                            {med.preferred_time ? `${med.preferred_time} · ` : ''}{med.dosage}
                        </Text>
                    </View>

                    {/* Expand chevron */}
                    <View style={{ padding: 4, opacity: 0.5 }}>
                        {expanded
                            ? <ChevronUp size={18} color="#64748B" />
                            : <ChevronDown size={18} color="#64748B" />}
                    </View>
                </View>

                {/* Expanded instructions */}
                {expanded && (
                    <View style={styles.expandSection}>
                        <View style={[styles.instructionBox, { backgroundColor: cfg.light, borderColor: cfg.border }]}>
                            <Info size={15} color={cfg.color} style={{ marginTop: 1, flexShrink: 0 }} />
                            <Text style={[styles.instructionTxt, { color: cfg.color }]}>
                                {med.instructions || 'No special instructions provided.'}
                            </Text>
                        </View>
                    </View>
                )}
            </Pressable>
        </Swipeable>
    );
};

// ── Custom Time Picker ────────────────────────────────────────────────────────
const ITEM_H = 52;
const VISIBLE_ROWS = 5;

const WheelCol = ({ data, selectedValue, onValueChange, colWidth = 72 }) => {
    const ref = useRef(null);
    const isProg = useRef(false);

    useEffect(() => {
        const idx = data.indexOf(selectedValue);
        if (idx >= 0 && ref.current) {
            isProg.current = true;
            setTimeout(() => {
                try { ref.current?.scrollTo({ y: idx * ITEM_H, animated: false }); } catch (e) {}
                setTimeout(() => { isProg.current = false; }, 60);
            }, 60);
        }
    }, [selectedValue, data]);

    const onScroll = useCallback((e) => {
        if (isProg.current) return;
        const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
        if (idx >= 0 && idx < data.length && data[idx] !== selectedValue) onValueChange(data[idx]);
    }, [data, selectedValue, onValueChange]);

    const onTap = useCallback((idx) => {
        isProg.current = true;
        onValueChange(data[idx]);
        try { ref.current?.scrollTo({ y: idx * ITEM_H, animated: true }); } catch (e) {}
        setTimeout(() => { isProg.current = false; }, 320);
    }, [data, onValueChange]);

    return (
        <View style={{ height: ITEM_H * VISIBLE_ROWS, width: colWidth, overflow: 'hidden' }}>
            <ScrollView
                ref={ref} showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_H} decelerationRate="fast"
                onScroll={onScroll} scrollEventThrottle={16}
                contentContainerStyle={{
                    paddingTop: ITEM_H * Math.floor(VISIBLE_ROWS / 2),
                    paddingBottom: ITEM_H * Math.floor(VISIBLE_ROWS / 2),
                }}
                nestedScrollEnabled
            >
                {data.map((item, idx) => {
                    const sel = item === selectedValue;
                    return (
                        <Pressable key={item} onPress={() => onTap(idx)} style={{ height: ITEM_H, justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{
                                fontSize: sel ? 26 : 18,
                                fontWeight: sel ? '900' : '400',
                                color: sel ? '#0F172A' : '#94A3B8',
                                opacity: sel ? 1 : 0.55,
                            }}>{item}</Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const TimePickerModal = ({ visible, onClose, onSave, initialTime }) => {
    const [h, setH] = useState('12');
    const [m, setM] = useState('00');
    const [ap, setAp] = useState('AM');

    useEffect(() => {
        if (visible && initialTime) {
            const parts = initialTime.split(':');
            let hr = parseInt(parts[0] || '12', 10);
            const mn = parts[1] || '00';
            const isPm = hr >= 12;
            if (hr === 0) hr = 12; else if (hr > 12) hr -= 12;
            setH(hr.toString().padStart(2, '0'));
            setM(mn);
            setAp(isPm ? 'PM' : 'AM');
        }
    }, [visible, initialTime]);

    if (!visible) return null;

    const hrs = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
    const mins = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

    const save = () => {
        let hr24 = parseInt(h, 10);
        if (ap === 'PM' && hr24 !== 12) hr24 += 12;
        if (ap === 'AM' && hr24 === 12) hr24 = 0;
        onSave(`${hr24.toString().padStart(2, '0')}:${m}`);
    };

    return (
        <Modal visible transparent animationType="fade">
            <Pressable
                onPress={onClose}
                style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', alignItems: 'center' }}
            >
                <Pressable
                    onPress={e => e.stopPropagation()}
                    style={{ backgroundColor: '#FFF', borderRadius: 32, padding: 28, width: Math.min(SW - 40, 340), shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 40, elevation: 14 }}
                >
                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#0F172A', textAlign: 'center', marginBottom: 4 }}>Set Time</Text>
                    <Text style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', marginBottom: 24, fontWeight: '500' }}>Scroll to choose your preferred time</Text>

                    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: ITEM_H * VISIBLE_ROWS, position: 'relative' }}>
                        <View pointerEvents="none" style={{
                            position: 'absolute',
                            top: ITEM_H * Math.floor(VISIBLE_ROWS / 2),
                            left: 10, right: 10, height: ITEM_H,
                            borderRadius: 16, backgroundColor: '#F1F5F9',
                            borderWidth: 1, borderColor: '#E2E8F0',
                        }} />
                        <WheelCol data={hrs} selectedValue={h} onValueChange={setH} colWidth={72} />
                        <Text style={{ fontSize: 28, fontWeight: '900', color: '#0F172A', marginHorizontal: 2 }}>:</Text>
                        <WheelCol data={mins} selectedValue={m} onValueChange={setM} colWidth={72} />
                        <View style={{ width: 12 }} />
                        <WheelCol data={['AM', 'PM']} selectedValue={ap} onValueChange={setAp} colWidth={62} />
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 28 }}>
                        <Pressable onPress={onClose} style={{ flex: 1, paddingVertical: 15, borderRadius: 16, alignItems: 'center', backgroundColor: '#F8FAFC' }}>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: '#64748B' }}>Cancel</Text>
                        </Pressable>
                        <Pressable onPress={save} style={{ flex: 2, paddingVertical: 15, borderRadius: 16, alignItems: 'center', overflow: 'hidden' }}>
                            <LinearGradient colors={['#6366F1', '#4F46E5']} style={StyleSheet.absoluteFill} />
                            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>Confirm</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
};

// ══════════════════════════════════════════════════════════════════════════════
// ══ MAIN SCREEN ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
export default function MedicationsScreen({ navigation }) {
    const patient = usePatientStore(s => s.patient);
    const schedule = usePatientStore(s => s.medicationSchedule);
    const adherence = usePatientStore(s => s.weeklyAdherence);
    const preferences = usePatientStore(s => s.callPreferences);
    const storeFetchMedications = usePatientStore(s => s.fetchMedications);
    const storeSavePrefs = usePatientStore(s => s.saveCallPreferences);
    const storeOptimisticToggle = usePatientStore(s => s.optimisticToggleMed);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showPrefModal, setShowPrefModal] = useState(false);
    const [tempPrefs, setTempPrefs] = useState({ morning: '09:00', afternoon: '14:00', night: '20:00' });
    const [savingPrefs, setSavingPrefs] = useState(false);
    const [activePicker, setActivePicker] = useState(null);
    const [toast, setToast] = useState({ visible: false, title: '', message: '' });
    const [confirmingMed, setConfirmingMed] = useState(null);
    const [isConfirmVisible, setIsConfirmVisible] = useState(false);
    const [requestingMod, setRequestingMod] = useState(false);
    const [modRequested, setModRequested] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);

    const staggerAnims = useRef([...Array(10)].map(() => new Animated.Value(0))).current;
    const hasAnimated = useRef(false);
    const toastAnim = useRef(new Animated.Value(0)).current;

    const showToast = (title, message) => {
        setToast({ visible: true, title, message });
        toastAnim.setValue(0);
        Animated.sequence([
            Animated.spring(toastAnim, { toValue: 1, friction: 7, useNativeDriver: true }),
            Animated.delay(2400),
            Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => setToast({ visible: false, title: '', message: '' }));
    };

    const runAnimations = useCallback(() => {
        staggerAnims.forEach(a => a.setValue(0));
        Animated.stagger(65, staggerAnims.map(a =>
            Animated.spring(a, { toValue: 1, friction: 8, tension: 42, useNativeDriver: true })
        )).start();
    }, [staggerAnims]);

    const load = useCallback(async (isRefresh = false) => {
        try {
            await storeFetchMedications();
            if (!isRefresh && !hasAnimated.current) {
                hasAnimated.current = true;
                runAnimations();
            }
        } catch (err) {
            console.warn('Failed to load medications:', err.message);
        } finally {
            setLoading(false);
            if (isRefresh) setRefreshing(false);
        }
    }, [storeFetchMedications, runAnimations]);

    useFocusEffect(useCallback(() => {
        const task = InteractionManager.runAfterInteractions(() => {
            load(false).then(() => {
                if (!hasAnimated.current) { hasAnimated.current = true; runAnimations(); }
            });
        });
        const interval = setInterval(() => load(true), 120000);
        return () => { task.cancel(); clearInterval(interval); };
    }, [load, runAnimations]));

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        load(true);
    }, [load]);

    const handleMedIconPress = useCallback((med) => {
        if (med.taken) return;

        const hour = new Date().getHours();
        const slotStart = SLOT_START_HOURS[med.type];
        if (slotStart !== undefined && hour < slotStart) {
            const msgs = {
                morning: { title: 'Easy there, early bird! 🐦', body: "Morning meds aren't due yet. Come back after 5 AM!" },
                afternoon: { title: 'Not yet! ☀️', body: 'Afternoon meds unlock from 11 AM. Patience!' },
                evening: { title: 'Hold on! 🌅', body: 'Evening meds are available after 4 PM.' },
                night: { title: "It's not night yet! 🌙", body: 'Night meds start from 7 PM. Enjoy your day first!' },
            };
            const msg = msgs[med.type] || { title: 'Not yet! ⏰', body: "This medication isn't due yet." };
            AlertManager.alert(msg.title, msg.body, [{ text: 'Got it! 😊', style: 'default' }]);
            return;
        }

        setConfirmingMed(med);
        setIsConfirmVisible(true);
    }, []);

    const handleConfirmToggle = async () => {
        if (!confirmingMed) return;
        const med = confirmingMed;
        setIsConfirmVisible(false);
        setConfirmingMed(null);
        try {
            await storeOptimisticToggle(med, true);
        } catch (err) {
            console.warn('[Toggle] Failed:', err.message);
            showToast('Sync Failed', 'Check your connection and try again.');
        }
    };

    const handleSnooze = async (med) => {
        try {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;
            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }
            
            if (finalStatus !== 'granted') {
                AlertManager.alert('Permission Required', 'Please enable notifications to snooze medications.', [{ text: 'OK' }]);
                return;
            }

            await Notifications.scheduleNotificationAsync({
                content: {
                    title: `⏳ Reminder: ${med.name}`,
                    body: `Time to take your ${med.name}!`,
                    data: { screen: 'Medications', type: 'medication_reminder' },
                    sound: 'default',
                },
                trigger: { seconds: 30 * 60 },
            });
            showToast('Snoozed 30 min', `We'll remind you about ${med.name}.`);
        } catch (err) {
            console.warn('Snooze failed:', err.message);
        }
    };

    const handleSavePreferences = async () => {
        setSavingPrefs(true);
        try {
            await storeSavePrefs(tempPrefs);
            setShowPrefModal(false);
        } catch {
            showToast('Error', 'Failed to save preferences.');
        } finally {
            setSavingPrefs(false);
        }
    };

    const handleUploadPrescription = async () => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') { showToast('Permission needed', 'Camera roll access required.'); return; }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true, quality: 0.8, base64: true,
            });
            if (!result.canceled && result.assets[0]) {
                setUploadingImage(true);
                const manipResult = await ImageManipulator.manipulateAsync(
                    result.assets[0].uri,
                    [{ resize: { width: 800 } }],
                    { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                );
                if (!manipResult.base64) throw new Error('Failed to process image.');
                await apiService.patients.uploadPrescription({ file_base64: manipResult.base64, content_type: 'image/jpeg' });
                showToast('Uploaded! ✓', 'Prescription sent for caregiver review.');
                load(true);
            }
        } catch (error) {
            showToast('Upload Failed', error.response?.data?.error || error.message || 'Try again.');
        } finally {
            setUploadingImage(false);
        }
    };

    // ── Derived values ─────────────────────────────────────────────────────
    const allMeds = SLOT_ORDER.flatMap(slot => schedule[slot] || []);
    const takenCount = allMeds.filter(m => m.taken).length;
    const totalCount = allMeds.length;
    const progressPerc = totalCount > 0 ? (takenCount / totalCount) * 100 : 0;
    const adherencePct = adherence.length > 0
        ? Math.round(adherence.reduce((s, d) => s + (d.p || 0), 0) / adherence.length)
        : 0;

    const hour = new Date().getHours();
    const nextSlot = SLOT_ORDER.find(slot => {
        const start = SLOT_START_HOURS[slot];
        return start !== undefined && hour < start && (schedule[slot] || []).some(m => !m.taken);
    });
    const nextCfg = nextSlot ? SLOT_CONFIG[nextSlot] : null;

    const anim = (i) => ({
        opacity: staggerAnims[i],
        transform: [{ translateY: staggerAnims[i].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
    });

    // ── Loading skeleton ───────────────────────────────────────────────────
    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
                <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
                <View style={styles.header}>
                    <View style={styles.headerRow}>
                        <View>
                            <View style={{ width: 70, height: 9, borderRadius: 5, backgroundColor: '#E2E8F0', marginBottom: 10 }} />
                            <View style={{ width: 180, height: 28, borderRadius: 10, backgroundColor: '#E2E8F0' }} />
                        </View>
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#E2E8F0' }} />
                    </View>
                </View>
                <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
                    {[100, 140, 88, 88, 88].map((h, i) => (
                        <View key={i} style={{ height: h, borderRadius: 20, backgroundColor: '#E2E8F0' }} />
                    ))}
                </ScrollView>
            </View>
        );
    }

    // ── Premium paywall ────────────────────────────────────────────────────
    if (patient?.subscription?.plan === 'free') {
        return (
            <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
                <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
                <View style={styles.header}>
                    <View style={styles.headerRow}>
                        <View>
                            <Text style={styles.headerEyebrow}>CARE PLAN</Text>
                            <Text style={styles.headerTitle}>Medications</Text>
                        </View>
                    </View>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                    <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                        <Pill size={36} color="#6366F1" strokeWidth={1.5} />
                    </View>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: '#0F172A', marginBottom: 10 }}>Premium Feature</Text>
                    <Text style={{ fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 24 }}>
                        Medication tracking and adherence insights are included in the Premium Plan. Upgrade to manage your daily schedule.
                    </Text>
                </View>
            </View>
        );
    }

    // ══════════════════════════════════════════════════════════════════════
    return (
        <View style={styles.root}>
            <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

            {/* ── SIMPLE HEADER (like care team) ── */}
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerEyebrow}>CARE PLAN</Text>
                        <Text style={styles.headerTitle}>Medications</Text>
                    </View>
                    <Pressable style={styles.headerBtn} onPress={() => navigation.navigate('Notifications')}>
                        <Bell size={20} color="#0F172A" strokeWidth={2.5} />
                    </Pressable>
                </View>
            </View>

            {/* ── ALL SCROLLABLE CONTENT ── */}
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6366F1" />}
            >
                {/* Progress card (scrolls with content) */}
                {totalCount > 0 && (
                    <Animated.View style={[anim(0), styles.progressCard]}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.progressLabel}>Today's Progress</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginVertical: 6 }}>
                                <Text style={styles.progressCount}>{takenCount}</Text>
                                <Text style={styles.progressTotal}>/ {totalCount} taken</Text>
                            </View>
                            <View style={styles.progressBarBg}>
                                <LinearGradient
                                    colors={progressPerc >= 80 ? ['#34D399', '#10B981'] : progressPerc >= 50 ? ['#FCD34D', '#F59E0B'] : ['#FC8181', '#EF4444']}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={[styles.progressBarFill, { width: `${Math.max(progressPerc, 4)}%` }]}
                                />
                            </View>
                            <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                    <TrendingUp size={12} color="#6366F1" />
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#6366F1' }}>{Math.round(adherencePct)}% avg</Text>
                                </View>
                                {nextCfg ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                        <nextCfg.Icon size={12} color={nextCfg.color} />
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: nextCfg.color }}>Next: {nextCfg.label}</Text>
                                    </View>
                                ) : (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                        <CheckCircle2 size={12} color="#10B981" />
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>All done!</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                        <ProgressRing progress={progressPerc} size={88} strokeWidth={8} />
                    </Animated.View>
                )}

                {totalCount === 0 ? (
                    /* ── EMPTY STATE ── */
                    <Animated.View style={[styles.emptyCard, anim(1)]}>
                        <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.emptyIconWrap}>
                            <Calendar size={44} color="#6366F1" strokeWidth={1.5} />
                        </LinearGradient>
                        <Text style={styles.emptyTitle}>All Clear!</Text>
                        <Text style={styles.emptyBody}>
                            No medications scheduled yet. Your caregiver will add them, or request a review below.
                        </Text>
                        <Pressable style={styles.emptyPrefBtn} onPress={() => { setShowPrefModal(true); setTempPrefs(preferences); }}>
                            <LinearGradient colors={['#6366F1', '#4F46E5']} style={StyleSheet.absoluteFill} />
                            <Clock size={17} color="#FFF" />
                            <Text style={styles.emptyPrefTxt}>Set Call Preferences</Text>
                        </Pressable>

                        <View style={styles.actionGroup}>
                            <Pressable
                                style={[styles.outlineBtn, modRequested && { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
                                disabled={requestingMod || modRequested}
                                onPress={async () => {
                                    setRequestingMod(true);
                                    try {
                                        await apiService.patients.requestMedicationModification({ description: 'Patient requests caller to add/review medications.' });
                                        setModRequested(true);
                                        showToast('Request Sent ✓', 'Your caregiver will discuss meds on your next call.');
                                    } catch { showToast('Error', 'Could not send. Try again.'); }
                                    finally { setRequestingMod(false); }
                                }}
                            >
                                {requestingMod ? <ActivityIndicator size="small" color="#6366F1" /> :
                                    modRequested ? <><CheckCircle2 size={18} color="#16A34A" /><Text style={[styles.outlineBtnTxt, { color: '#16A34A' }]}>Request Sent!</Text></> :
                                        <><MessageCircle size={18} color="#6366F1" /><Text style={styles.outlineBtnTxt}>Request Caregiver Review</Text></>
                                }
                            </Pressable>
                            <Pressable style={[styles.outlineBtn, { borderColor: '#D1FAE5' }]} disabled={uploadingImage} onPress={handleUploadPrescription}>
                                {uploadingImage ? <ActivityIndicator size="small" color="#10B981" /> :
                                    <><Upload size={18} color="#10B981" /><Text style={[styles.outlineBtnTxt, { color: '#10B981' }]}>Upload Prescription</Text></>
                                }
                            </Pressable>
                        </View>

                        {patient?.uploaded_prescriptions?.length > 0 && (
                            <View style={{ width: '100%', marginTop: 20 }}>
                                <Text style={styles.sectionLabel}>RECENT UPLOADS</Text>
                                {patient.uploaded_prescriptions.map((up, idx) => (
                                    <UploadRow key={idx} upload={up} />
                                ))}
                            </View>
                        )}
                    </Animated.View>
                ) : (
                    <>
                        {/* ── WEEKLY CHART ── */}
                        <Animated.View style={anim(1)}>
                            <View style={styles.chartCard}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                    <View>
                                        <Text style={styles.cardTitle}>Weekly Adherence</Text>
                                        <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2, fontWeight: '600' }}>
                                            Last 7 days
                                        </Text>
                                    </View>
                                    <View style={styles.adherenceBadge}>
                                        <TrendingUp size={13} color="#6366F1" />
                                        <Text style={styles.adherenceBadgeTxt}>{adherencePct}% avg</Text>
                                    </View>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 2 }}>
                                    {adherence.map((d, i) => {
                                        const todayRaw = new Date().getDay();
                                        const todayIdx = todayRaw === 0 ? 6 : todayRaw - 1;
                                        return (
                                            <ChartBar
                                                key={i}
                                                percentage={d.p}
                                                isToday={i === todayIdx}
                                                day={(d.day || '').substring(0, 2)}
                                            />
                                        );
                                    })}
                                </View>
                            </View>
                        </Animated.View>

                        {/* ── TIME SECTIONS ── */}
                        <Animated.View style={anim(2)}>
                            {SLOT_ORDER.map(slot => {
                                const meds = schedule[slot] || [];
                                if (meds.length === 0) return null;
                                return (
                                    <View key={slot} style={styles.slotSection}>
                                        <SlotHeader slot={slot} callTime={preferences[slot]} />
                                        {meds.map(med => (
                                            <View key={med.id} style={{ marginBottom: 10 }}>
                                                <MedCard med={med} onToggle={handleMedIconPress} onSnooze={handleSnooze} />
                                            </View>
                                        ))}
                                    </View>
                                );
                            })}
                        </Animated.View>

                        {/* ── ACTION BUTTONS ── */}
                        <Animated.View style={[anim(3), styles.actionGroup]}>
                            <Pressable
                                style={[styles.outlineBtn, modRequested && { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
                                disabled={requestingMod || modRequested}
                                onPress={async () => {
                                    setRequestingMod(true);
                                    try {
                                        await apiService.patients.requestMedicationModification({ description: 'Patient requests medication review/modification.' });
                                        setModRequested(true);
                                        showToast('Request Sent ✓', 'Your caregiver will review your meds on the next call.');
                                    } catch { showToast('Error', 'Could not send. Try again.'); }
                                    finally { setRequestingMod(false); }
                                }}
                            >
                                {requestingMod ? <ActivityIndicator size="small" color="#6366F1" /> :
                                    modRequested ? <><CheckCircle2 size={18} color="#16A34A" /><Text style={[styles.outlineBtnTxt, { color: '#16A34A' }]}>Request Sent!</Text></> :
                                        <><Pencil size={18} color="#6366F1" /><Text style={styles.outlineBtnTxt}>Request Medication Review</Text></>
                                }
                            </Pressable>
                            <Pressable style={[styles.outlineBtn, { borderColor: '#D1FAE5' }]} disabled={uploadingImage} onPress={handleUploadPrescription}>
                                {uploadingImage ? <ActivityIndicator size="small" color="#10B981" /> :
                                    <><Upload size={18} color="#10B981" /><Text style={[styles.outlineBtnTxt, { color: '#10B981' }]}>Upload New Prescription</Text></>
                                }
                            </Pressable>

                            {patient?.uploaded_prescriptions?.length > 0 && (
                                <View style={{ marginTop: 8 }}>
                                    <Text style={[styles.sectionLabel, { marginBottom: 12 }]}>UPLOADED PRESCRIPTIONS</Text>
                                    {patient.uploaded_prescriptions.map((up, idx) => (
                                        <View key={idx} style={[styles.uploadCard, { marginBottom: 8 }]}>
                                            <View style={[styles.uploadStatusBox, {
                                                backgroundColor: up.status === 'reviewed' ? '#DCFCE7' : up.status === 'rejected' ? '#FEE2E2' : '#FEF3C7',
                                            }]}>
                                                {up.status === 'reviewed' ? <CheckCircle2 size={18} color="#16A34A" /> :
                                                    up.status === 'rejected' ? <X size={18} color="#DC2626" /> :
                                                        <Clock size={18} color="#D97706" />}
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.uploadName}>Doctor's Slip</Text>
                                                <Text style={styles.uploadDate}>{new Date(up.uploaded_at).toLocaleDateString()}</Text>
                                            </View>
                                            <Text style={[styles.uploadStatus, {
                                                color: up.status === 'reviewed' ? '#16A34A' : up.status === 'rejected' ? '#DC2626' : '#D97706',
                                            }]}>{up.status}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </Animated.View>
                    </>
                )}
            </ScrollView>

            {/* ── FAB ── */}
            <Animated.View style={[styles.fab, {
                opacity: staggerAnims[4],
                transform: [{ scale: staggerAnims[4].interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }],
            }]}>
                <Pressable onPress={() => { setShowPrefModal(true); setTempPrefs(preferences); setActivePicker(null); }}>
                    <LinearGradient colors={['#818CF8', '#4F46E5']} style={styles.fabBtn}>
                        <Clock size={24} color="#FFF" strokeWidth={2.5} />
                    </LinearGradient>
                </Pressable>
            </Animated.View>

            {/* ── PREFERENCES MODAL ── */}
            <PremiumFormModal
                visible={showPrefModal}
                title="Call Preferences"
                onClose={() => setShowPrefModal(false)}
                onSave={handleSavePreferences}
                saveText={savingPrefs ? 'Saving...' : 'Save Preferences'}
                saving={savingPrefs}
            >
                <Text style={styles.modalDesc}>
                    Set when your care team should call to check on your medications. We call within 30 min of this time.
                </Text>
                {['morning', 'afternoon', 'night'].map(slot => {
                    const cfg = SLOT_CONFIG[slot];
                    return (
                        <View key={slot} style={styles.prefRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={[styles.prefIconBox, { backgroundColor: cfg.light, borderColor: cfg.border }]}>
                                    <cfg.Icon size={17} color={cfg.color} strokeWidth={2.5} />
                                </View>
                                <Text style={styles.prefLabel}>{cfg.label}</Text>
                            </View>
                            <Pressable style={[styles.timeBtn, { borderColor: cfg.border }]} onPress={() => setActivePicker(slot)}>
                                <Clock size={14} color={cfg.color} />
                                <Text style={[styles.timeBtnTxt, { color: cfg.color }]}>{tempPrefs[slot]}</Text>
                            </Pressable>
                        </View>
                    );
                })}
            </PremiumFormModal>

            <TimePickerModal
                visible={!!activePicker}
                initialTime={activePicker ? tempPrefs[activePicker] : '12:00'}
                onClose={() => setActivePicker(null)}
                onSave={(val) => {
                    if (activePicker) setTempPrefs(p => ({ ...p, [activePicker]: val }));
                    setActivePicker(null);
                }}
            />

            {/* ── CONFIRMATION MODAL (bottom sheet) ── */}
            <Modal visible={isConfirmVisible} transparent animationType="slide">
                <View style={styles.confirmOverlay}>
                    <Pressable style={{ flex: 1 }} onPress={() => { setIsConfirmVisible(false); setConfirmingMed(null); }} />
                    <View style={styles.confirmSheet}>
                        <View style={styles.sheetHandle} />
                        <View style={{ alignItems: 'center', marginBottom: 24 }}>
                            <LinearGradient
                                colors={['#EEF2FF', '#C7D2FE']}
                                style={styles.confirmIconWrap}
                            >
                                <Pill size={36} color="#6366F1" strokeWidth={1.8} />
                            </LinearGradient>
                            <Text style={styles.confirmTitle}>Confirm Intake</Text>
                            <Text style={styles.confirmSub}>
                                {'Have you taken\n'}
                                <Text style={{ fontWeight: '900', color: '#1E293B' }}>"{confirmingMed?.name}"</Text>
                                {'?'}
                            </Text>
                            {confirmingMed?.dosage && (
                                <View style={styles.dosagePill}>
                                    <Zap size={12} color="#6366F1" />
                                    <Text style={styles.dosageTxt}>{confirmingMed.dosage}</Text>
                                </View>
                            )}
                        </View>
                        <Pressable style={styles.confirmYesBtn} onPress={handleConfirmToggle}>
                            <LinearGradient
                                colors={['#818CF8', '#4F46E5']}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                style={[StyleSheet.absoluteFill, { borderRadius: 18 }]}
                            />
                            <CheckCircle2 size={22} color="#FFF" />
                            <Text style={styles.confirmYesTxt}>Yes, I took it!</Text>
                        </Pressable>
                        <Pressable style={styles.confirmNoBtn} onPress={() => { setIsConfirmVisible(false); setConfirmingMed(null); }}>
                            <Text style={styles.confirmNoTxt}>Not yet</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* ── TOAST ── */}
            {toast.visible && (
                <Animated.View style={[styles.toast, {
                    opacity: toastAnim,
                    transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
                }]}>
                    <View style={styles.toastInner}>
                        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                            <CheckCircle2 size={20} color="#16A34A" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.toastTitle}>{toast.title}</Text>
                            <Text style={styles.toastMsg}>{toast.message}</Text>
                        </View>
                    </View>
                </Animated.View>
            )}
        </View>
    );
}

// ── Upload row helper ─────────────────────────────────────────────────────────
function UploadRow({ upload }) {
    return (
        <View style={[styles.uploadCard, { marginBottom: 8 }]}>
            <View style={[styles.uploadStatusBox, {
                backgroundColor: upload.status === 'reviewed' ? '#DCFCE7' : upload.status === 'rejected' ? '#FEE2E2' : '#FEF3C7',
            }]}>
                {upload.status === 'reviewed' ? <CheckCircle2 size={16} color="#16A34A" /> :
                    upload.status === 'rejected' ? <X size={16} color="#DC2626" /> :
                        <Clock size={16} color="#D97706" />}
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.uploadName}>Prescription Slip</Text>
                <Text style={styles.uploadDate}>{new Date(upload.uploaded_at).toLocaleDateString()}</Text>
            </View>
            <Text style={[styles.uploadStatus, {
                color: upload.status === 'reviewed' ? '#16A34A' : upload.status === 'rejected' ? '#DC2626' : '#D97706',
            }]}>{upload.status}</Text>
        </View>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// ══ STYLES ═══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F8FAFC' },

    // ── Header (simple, like care team) ──
    header: {
        paddingTop: Platform.OS === 'ios' ? 60 : 48,
        paddingHorizontal: 24, paddingBottom: 14,
        backgroundColor: '#F8FAFC',
    },
    headerRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    headerEyebrow: {
        fontSize: 13, fontWeight: '800', color: '#6366F1',
        letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4,
    },
    headerTitle: {
        fontSize: 32, fontWeight: '800', color: '#0F172A', letterSpacing: -1,
    },
    headerBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#E2E8F0',
    },

    // ── Progress card (inside scroll) ──
    progressCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20,
        flexDirection: 'row', alignItems: 'center', gap: 16,
        marginBottom: 20,
        shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07, shadowRadius: 14, elevation: 4,
        borderWidth: 1, borderColor: '#EEF2FF',
    },
    progressLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.2, textTransform: 'uppercase' },
    progressCount: { fontSize: 34, fontWeight: '900', color: '#0F172A', letterSpacing: -1 },
    progressTotal: { fontSize: 16, fontWeight: '600', color: '#94A3B8' },
    progressBarBg: { height: 7, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
    progressBarFill: { height: 7, borderRadius: 4 },

    // ── Scroll ──
    scrollView: { flex: 1, backgroundColor: '#F8FAFC' },
    scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: layout.TAB_BAR_CLEARANCE },

    // ── Chart card ──
    chartCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 20,
        shadowColor: '#6366F1', shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.07, shadowRadius: 18, elevation: 4,
        borderWidth: 1, borderColor: '#EEF2FF',
    },
    cardTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
    adherenceBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: '#EEF2FF', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10,
    },
    adherenceBadgeTxt: { fontSize: 12, fontWeight: '700', color: '#6366F1' },
    sectionLabel: {
        fontSize: 11, fontWeight: '800', color: '#94A3B8',
        letterSpacing: 1.5, textTransform: 'uppercase',
    },

    // ── Slot section ──
    slotSection: { marginBottom: 22 },

    // ── Med card ──
    medCard: {
        backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden',
        shadowColor: '#1E293B', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05, shadowRadius: 12, elevation: 3,
        borderWidth: 1, borderColor: '#F1F5F9',
    },
    medCardTaken: { backgroundColor: '#F8FFF9', borderColor: '#DCFCE7' },
    medTopBar: { height: 4, width: '100%' },
    medCardBody: { flexDirection: 'row', padding: 16, alignItems: 'center', gap: 14 },
    medIconBox: {
        width: 48, height: 48, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    },
    medName: { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
    medDose: { fontSize: 13, color: '#64748B', fontWeight: '500', marginTop: 2 },
    takenBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#DCFCE7', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
    },
    takenBadgeTxt: { fontSize: 10, fontWeight: '700', color: '#16A34A' },
    verifiedBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2,
        borderRadius: 6, borderWidth: 1, borderColor: '#D1FAE5',
    },
    verifiedTxt: { fontSize: 9, fontWeight: '800', color: '#059669', textTransform: 'uppercase', letterSpacing: 0.5 },
    expandSection: { paddingHorizontal: 16, paddingBottom: 14 },
    instructionBox: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
    instructionTxt: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },

    // ── Swipe actions ──
    swipeLeftAction: {
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: '#10B981', borderRadius: 20,
        paddingHorizontal: 22, marginRight: 10,
    },
    swipeRightAction: {
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: '#F59E0B', borderRadius: 20,
        paddingHorizontal: 22, marginLeft: 10,
    },

    // ── Empty state ──
    emptyCard: {
        backgroundColor: '#FFFFFF', borderRadius: 28, padding: 28,
        alignItems: 'center', borderWidth: 1, borderColor: '#EEF2FF',
        shadowColor: '#6366F1', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06, shadowRadius: 24, elevation: 5,
    },
    emptyIconWrap: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 26, fontWeight: '900', color: '#0F172A', marginBottom: 10 },
    emptyBody: { fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 24, marginBottom: 24 },
    emptyPrefBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 9,
        height: 52, paddingHorizontal: 28, borderRadius: 26,
        overflow: 'hidden', marginBottom: 16,
    },
    emptyPrefTxt: { fontSize: 15, fontWeight: '700', color: '#FFF' },

    // ── Action buttons ──
    actionGroup: { gap: 10 },
    outlineBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
        paddingVertical: 16, borderRadius: 18, borderWidth: 1.5,
        borderStyle: 'dashed', backgroundColor: '#FAFBFF', borderColor: '#C7D2FE',
    },
    outlineBtnTxt: { fontSize: 14, fontWeight: '700', color: '#6366F1' },

    // ── Uploads ──
    uploadCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14,
        borderWidth: 1, borderColor: '#F1F5F9',
    },
    uploadStatusBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    uploadName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
    uploadDate: { fontSize: 12, color: '#64748B', marginTop: 2 },
    uploadStatus: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },

    // ── FAB ──
    fab: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 112 : 92,
        right: 24, zIndex: 100,
    },
    fabBtn: {
        width: 58, height: 58, borderRadius: 29,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.38, shadowRadius: 16, elevation: 10,
    },

    // ── Preferences modal ──
    modalDesc: { fontSize: 14, color: '#64748B', lineHeight: 22, marginBottom: 20 },
    prefRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#F8FAFC', padding: 14, borderRadius: 16, marginBottom: 10,
    },
    prefIconBox: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    prefLabel: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
    timeBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 13, paddingVertical: 9,
        borderRadius: 12, borderWidth: 1, backgroundColor: '#FFF',
    },
    timeBtnTxt: { fontSize: 15, fontWeight: '700' },

    // ── Confirmation modal ──
    confirmOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.55)' },
    confirmSheet: {
        backgroundColor: '#FFF', borderTopLeftRadius: 36, borderTopRightRadius: 36,
        padding: 28, paddingBottom: Platform.OS === 'ios' ? 52 : 28,
    },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 28 },
    confirmIconWrap: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    confirmTitle: { fontSize: 26, fontWeight: '900', color: '#0F172A', textAlign: 'center', marginBottom: 10 },
    confirmSub: { fontSize: 16, color: '#64748B', textAlign: 'center', lineHeight: 26, marginBottom: 2 },
    dosagePill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        marginTop: 12, backgroundColor: '#EEF2FF',
        paddingHorizontal: 18, paddingVertical: 8, borderRadius: 22,
    },
    dosageTxt: { fontSize: 14, fontWeight: '800', color: '#6366F1' },
    confirmYesBtn: {
        height: 58, borderRadius: 18, overflow: 'hidden',
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        marginTop: 4, marginBottom: 10,
    },
    confirmYesTxt: { fontSize: 18, fontWeight: '800', color: '#FFF' },
    confirmNoBtn: {
        height: 52, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#F8FAFC',
    },
    confirmNoTxt: { fontSize: 16, fontWeight: '700', color: '#64748B' },

    // ── Toast ──
    toast: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 114 : 90,
        left: 20, right: 20, zIndex: 999,
    },
    toastInner: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FFFFFF', padding: 16, borderRadius: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12, shadowRadius: 20, elevation: 8,
        borderWidth: 1, borderColor: '#F1F5F9',
    },
    toastTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
    toastMsg: { fontSize: 13, color: '#64748B', marginTop: 2 },
});
