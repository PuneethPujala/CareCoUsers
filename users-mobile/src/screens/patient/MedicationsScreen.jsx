import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import {
    View, Text, StyleSheet, ScrollView, Platform, Pressable, Animated,
    ActivityIndicator, Dimensions, Modal, RefreshControl, TextInput,
    InteractionManager, LayoutAnimation, UIManager, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import PremiumFormModal from '../../components/ui/PremiumFormModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    Pill, Sunrise, Sun, Sunset, Moon, CheckCircle2, Bell, Plus,
    AlertCircle, Calendar, Pencil, Clock, X, MessageCircle,
    ChevronDown, ChevronUp, Info, Upload, Shield, TrendingUp, Zap, Trash2,
} from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Svg, { Circle as SvgCircle, Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { colors, layout, spacing, radius, shadows } from '../../theme';
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
    const { t } = useTranslation();
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
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.2, textTransform: 'uppercase' }}>{t('common.done', { defaultValue: 'Done' })}</Text>
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
    const { t } = useTranslation();
    const cfg = SLOT_CONFIG[slot];
    if (!cfg) return null;
    const { label, Icon, color, light, border } = cfg;
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: radius.sm, backgroundColor: light, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: border }}>
                    <Icon size={17} color={color} strokeWidth={2.5} />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#1E293B', letterSpacing: -0.1 }}>{t(`time_slots.${slot}`, { defaultValue: label })}</Text>
            </View>
            {callTime ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: light, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm, borderWidth: 1, borderColor: border }}>
                    <Clock size={12} color={color} strokeWidth={2.5} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color }}>{callTime}</Text>
                </View>
            ) : null}
        </View>
    );
};

// ── Medication Card ───────────────────────────────────────────────────────────
const MedCard = ({ med, onToggle, onSnooze, onRefill }) => {
    const { t } = useTranslation();
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
                    <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>{t('medications.take', { defaultValue: 'TAKE' })}</Text>
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
                    <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>{t('medications.snooze', { defaultValue: 'SNOOZE' })}</Text>
                </Animated.View>
            </Pressable>
        );
    };

    const hasRefillInfo = med.refillInfo && (typeof med.refillInfo.remainingDoses === 'number' || typeof med.refillInfo.totalDoses === 'number');
    const displayDoses = med.refillInfo?.remainingDoses ?? med.refillInfo?.totalDoses ?? 0;
    const isLowSupply = hasRefillInfo && displayDoses <= (med.refillInfo.alertThreshold || 5);

    return (
        <View>
            <Swipeable
                ref={swRef}
                renderLeftActions={med.taken ? null : renderLeft}
                renderRightActions={med.taken ? null : renderRight}
                onSwipeableLeftOpen={() => { if (!med.taken) onToggle(med); swRef.current?.close(); }}
                onSwipeableRightOpen={() => { if (med.taken) swRef.current?.close(); }}
                enabled={!med.taken}
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
                                            {med.marked_by === 'caller' ? t('medications.by_caregiver', { defaultValue: 'By Caregiver' }) : t('medications.taken', { defaultValue: 'Taken' })}
                                        </Text>
                                    </View>
                                )}
                                {med.verifiedByCaller && (
                                    <View style={styles.verifiedBadge}>
                                        <Shield size={9} color="#059669" />
                                        <Text style={styles.verifiedTxt}>{t('medications.verified', { defaultValue: 'Verified' })}</Text>
                                    </View>
                                )}
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                                <Text style={styles.medDose}>
                                    {med.preferred_time ? `${med.preferred_time} · ` : ''}{med.dosage}
                                </Text>
                                {hasRefillInfo && (
                                    <View style={{ 
                                        flexDirection: 'row', alignItems: 'center', gap: 4, 
                                        paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 8, 
                                        backgroundColor: isLowSupply ? '#FEF2F2' : '#F1F5F9',
                                        borderWidth: 1,
                                        borderColor: isLowSupply ? '#FECACA' : '#E2E8F0',
                                    }}>
                                        {isLowSupply && <AlertCircle size={10} color="#EF4444" strokeWidth={3} />}
                                        <Text style={{ 
                                            fontSize: 9, fontWeight: '800', 
                                            color: isLowSupply ? '#EF4444' : '#64748B', 
                                            letterSpacing: 0.3, textTransform: 'uppercase'
                                        }}>
                                            {displayDoses} {isLowSupply ? 'Left (Refill)' : 'Supply Left'}
                                        </Text>
                                    </View>
                                )}
                            </View>
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
                                    {med.instructions || t('medications.no_instructions', { defaultValue: 'No special instructions provided.' })}
                                </Text>
                            </View>
                            {hasRefillInfo && (
                                <Pressable 
                                    onPress={() => onRefill && onRefill(med)}
                                    style={{ marginTop: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#EEF2FF', borderRadius: radius.sm, borderWidth: 1, borderColor: '#C7D2FE' }}
                                >
                                    <Zap size={14} color="#6366F1" />
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#6366F1' }}>Mark as Refilled</Text>
                                </Pressable>
                            )}
                        </View>
                    )}
                </Pressable>
            </Swipeable>
        </View>
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
    const { t } = useTranslation();
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
                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#0F172A', textAlign: 'center', marginBottom: 4 }}>{t('medications.set_time', { defaultValue: 'Set Time' })}</Text>
                    <Text style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', marginBottom: 24, fontWeight: '500' }}>{t('medications.scroll_time', { defaultValue: 'Scroll to choose your preferred time' })}</Text>

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
                            <Text style={{ fontSize: 15, fontWeight: '700', color: '#64748B' }}>{t('common.cancel', { defaultValue: 'Cancel' })}</Text>
                        </Pressable>
                        <Pressable onPress={save} style={{ flex: 2, paddingVertical: 15, borderRadius: 16, alignItems: 'center', overflow: 'hidden' }}>
                            <LinearGradient colors={['#6366F1', '#4F46E5']} style={StyleSheet.absoluteFill} />
                            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>{t('common.confirm', { defaultValue: 'Confirm' })}</Text>
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
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const dynamicBottom = insets.bottom > 0 ? insets.bottom : layout.TAB_BAR_BOTTOM;
    const fabBottom = dynamicBottom + layout.TAB_BAR_HEIGHT + 16;
    const localFabBottom = fabBottom + 70; // 70px above the global ChatFAB (58px height + 12px gap)
    const patient = usePatientStore(s => s.patient);
    const schedule = usePatientStore(s => s.medicationSchedule);
    const adherence = usePatientStore(s => s.weeklyAdherence);
    const preferences = usePatientStore(s => s.callPreferences);
    const storeFetchMedications = usePatientStore(s => s.fetchMedications);
    const storeSavePrefs = usePatientStore(s => s.saveCallPreferences);
    const storeOptimisticToggle = usePatientStore(s => s.optimisticToggleMed);
    const storeFetchDashboard = usePatientStore(s => s.fetchDashboard);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showPrefModal, setShowPrefModal] = useState(false);
    const [tempPrefs, setTempPrefs] = useState({ morning: '09:00', afternoon: '14:00', evening: '17:00', night: '20:00' });
    const [unreadCount, setUnreadCount] = useState(0);
    const [savingPrefs, setSavingPrefs] = useState(false);
    const [activePicker, setActivePicker] = useState(null);
    const [toast, setToast] = useState({ visible: false, title: '', message: '', type: 'success' });
    const [confirmingMed, setConfirmingMed] = useState(null);
    const [isConfirmVisible, setIsConfirmVisible] = useState(false);
    const [requestingMod, setRequestingMod] = useState(false);
    const [modRequested, setModRequested] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [weeklySummary, setWeeklySummary] = useState(null);
    const [refillModal, setRefillModal] = useState({ visible: false, med: null, count: '' });
    const [submittingRefill, setSubmittingRefill] = useState(false);

    const [tempMeds, setTempMeds] = useState([]);
    const [showAddTempMedModal, setShowAddTempMedModal] = useState(false);
    const [tempMedForm, setTempMedForm] = useState({ name: '', dosage: '', frequency: 'As needed', reason: '', shift: 'morning' });
    const [addingTempMed, setAddingTempMed] = useState(false);
    const deletedTempMedsRef = useRef({});

    const staggerAnims = useRef([...Array(10)].map(() => new Animated.Value(0))).current;
    const hasAnimated = useRef(false);
    const toastAnim = useRef(new Animated.Value(0)).current;

    const showToast = useCallback((title, message, type = 'success') => {
        setToast({ visible: true, title, message, type });
        toastAnim.setValue(0);
        Animated.sequence([
            Animated.spring(toastAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
            Animated.delay(2800),
            Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => setToast({ visible: false, title: '', message: '', type: 'success' }));
    }, [toastAnim]);

    const runAnimations = useCallback(() => {
        staggerAnims.forEach(a => a.setValue(0));
        Animated.stagger(65, staggerAnims.map(a =>
            Animated.spring(a, { toValue: 1, friction: 8, tension: 42, useNativeDriver: true })
        )).start();
    }, [staggerAnims]);

    const load = useCallback(async (isRefresh = false) => {
        try {
            const promises = [
                storeFetchMedications(),
                apiService.patients.getNotificationsUnreadCount()
                    .then(res => setUnreadCount(res.data?.count || 0))
                    .catch(() => {})
            ];
            if (isRefresh) {
                promises.push(storeFetchDashboard(true).catch(() => {}));
            }
            await Promise.all(promises);
            
            try {
                const tempRes = await apiService.medicines.getTempMeds();
                const freshTempMeds = tempRes.data?.tempMedications || [];
                const now = Date.now();
                const filtered = freshTempMeds.filter(m => {
                    const deletedTs = deletedTempMedsRef.current[m._id];
                    if (deletedTs) {
                        if (now - deletedTs < 60000) {
                            return false;
                        } else {
                            delete deletedTempMedsRef.current[m._id];
                        }
                    }
                    return true;
                });
                setTempMeds(filtered);
            } catch (tempErr) {
                console.warn('Failed to fetch temporary medications:', tempErr.message);
            }

            try {
                const { data } = await apiService.medicines.getWeeklySummary();
                if (data?.summary) {
                    setWeeklySummary(data.summary);
                }
            } catch (sumErr) {
                console.warn('Failed to fetch AI summary:', sumErr.message);
            }

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
    }, [storeFetchMedications, storeFetchDashboard, runAnimations]);

    useFocusEffect(useCallback(() => {
        const task = InteractionManager.runAfterInteractions(() => {
            load(false).then(() => {
                if (!hasAnimated.current) { hasAnimated.current = true; runAnimations(); }
            });
            apiService.patients.getNotificationsUnreadCount()
                .then(res => setUnreadCount(res.data?.count || 0))
                .catch(() => {});
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
                morning: { title: t('medications.early_bird_title', { defaultValue: 'Easy there, early bird! 🐦' }), body: t('medications.early_bird_body', { defaultValue: "Morning meds aren't due yet. Come back after 5 AM!" }) },
                afternoon: { title: t('medications.not_yet_title', { defaultValue: 'Not yet! ☀️' }), body: t('medications.not_yet_afternoon', { defaultValue: 'Afternoon meds unlock from 11 AM. Patience!' }) },
                evening: { title: t('medications.hold_on_title', { defaultValue: 'Hold on! 🌅' }), body: t('medications.not_yet_evening', { defaultValue: 'Evening meds are available after 4 PM.' }) },
                night: { title: t('medications.not_night_yet_title', { defaultValue: "It's not night yet! 🌙" }), body: t('medications.not_yet_night', { defaultValue: 'Night meds start from 7 PM. Enjoy your day first!' }) },
            };
            const msg = msgs[med.type] || { title: t('medications.not_yet_generic_title', { defaultValue: 'Not yet! ⏰' }), body: t('medications.not_yet_generic', { defaultValue: "This medication isn't due yet." }) };
            AlertManager.alert(msg.title, msg.body, [{ text: t('common.got_it', { defaultValue: 'Got it! 😊' }), style: 'default' }]);
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
            showToast(t('common.sync_failed', { defaultValue: 'Sync Failed' }), t('common.check_connection', { defaultValue: 'Check your connection and try again.' }), 'error');
        }
    };

    const handleDeleteTempMed = async (med) => {
        if (!med._id || String(med._id).startsWith('temp_')) {
            return; // Safety guard: ignore deleting pending optimistic items
        }
        AlertManager.alert(
            'Remove Medicine',
            `Are you sure you want to remove "${med.name}" from your temporary medications?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: 'Remove', 
                    style: 'destructive', 
                    onPress: async () => {
                        const previousMeds = tempMeds;
                        // Optimistically remove from state immediately
                        setTempMeds(prev => prev.filter(m => m._id !== med._id));
                        
                        // Register in optimistic deleted map
                        deletedTempMedsRef.current[med._id] = Date.now();
                        
                        try {
                            await apiService.medicines.deleteTempMed(med._id);
                            showToast(t('common.success', { defaultValue: 'Success' }), 'Temporary medicine removed.', 'success');
                            // No immediate getTempMeds call needed! It's already deleted in local state.
                        } catch (err) {
                            console.warn('Delete temp-med failed:', err.message);
                            // Remove from optimistic deleted map
                            delete deletedTempMedsRef.current[med._id];
                            // Rollback state on error
                            setTempMeds(previousMeds);
                            showToast(t('common.error', { defaultValue: 'Error' }), 'Failed to remove medicine.', 'error');
                        }
                    }
                }
            ]
        );
    };

    const submitAddTempMed = async () => {
        if (!tempMedForm.name || !tempMedForm.name.trim()) {
            AlertManager.alert('Validation Error', 'Medicine name is required.');
            return;
        }

        const tempId = 'temp_' + Date.now();
        const optimisticMed = {
            _id: tempId,
            name: tempMedForm.name.trim(),
            dosage: tempMedForm.dosage?.trim() || '',
            frequency: tempMedForm.frequency?.trim() || 'As needed',
            reason: tempMedForm.reason?.trim() || '',
            shift: tempMedForm.shift,
            riskTier: 'safe', // default placeholder
            addedByName: patient?.name || 'Patient',
            addedByRole: 'patient',
            createdAt: new Date().toISOString()
        };

        const previousMeds = tempMeds;
        // Optimistically prepend the new med to state immediately
        setTempMeds(prev => [optimisticMed, ...prev]);
        setShowAddTempMedModal(false);
        showToast(t('common.success', { defaultValue: 'Success' }), 'Temporary medicine added.', 'success');

        setAddingTempMed(true);
        try {
            const res = await apiService.medicines.addTempMed(tempMedForm);
            const savedMed = res.data?.tempMedication;
            if (savedMed) {
                // Swap the temp ID with the database item containing real ID and risk details
                setTempMeds(prev => prev.map(m => m._id === tempId ? savedMed : m));
                setTempMedForm({ name: '', dosage: '', frequency: 'As needed', reason: '', shift: 'morning' });
            } else {
                const tempRes = await apiService.medicines.getTempMeds();
                setTempMeds(tempRes.data?.tempMedications || []);
            }
        } catch (err) {
            console.warn('Add temp-med failed:', err.message);
            // Rollback on error
            setTempMeds(previousMeds);
            showToast(t('common.error', { defaultValue: 'Error' }), err.response?.data?.error || 'Failed to add medicine.', 'error');
        } finally {
            setAddingTempMed(false);
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
                AlertManager.alert(t('common.permission_required', { defaultValue: 'Permission Required' }), t('medications.enable_notifications', { defaultValue: 'Please enable notifications to snooze medications.' }), [{ text: t('common.ok', { defaultValue: 'OK' }) }]);
                return;
            }

            await Notifications.scheduleNotificationAsync({
                content: {
                    title: `⏳ ${t('medications.reminder', { defaultValue: 'Reminder' })}: ${med.name}`,
                    body: `${t('medications.time_to_take', { defaultValue: 'Time to take your' })} ${med.name}!`,
                    data: { screen: 'Medications', type: 'medication_reminder' },
                    sound: 'default',
                },
                trigger: { type: 'timeInterval', seconds: 30 * 60, channelId: 'meds' },
            });
            showToast(t('medications.snoozed', { defaultValue: 'Snoozed 30 min' }), `${t('medications.remind_you_about', { defaultValue: "We'll remind you about" })} ${med.name}.`, 'info');
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
            showToast(t('common.error', { defaultValue: 'Error' }), t('medications.save_prefs_failed', { defaultValue: 'Failed to save preferences.' }), 'error');
        } finally {
            setSavingPrefs(false);
        }
    };

    const handleRefill = (med) => {
        setRefillModal({ 
            visible: true, 
            med, 
            count: '' 
        });
    };

    const submitRefill = async () => {
        if (!refillModal.med || submittingRefill) return;
        const newCount = parseInt(refillModal.count, 10);
        if (isNaN(newCount) || newCount <= 0) {
            AlertManager.alert('Invalid Count', 'Please enter a valid number of doses.');
            return;
        }

        setSubmittingRefill(true);
        try {
            await apiService.medicines.refill(refillModal.med.name, newCount);
            showToast(t('common.success', { defaultValue: 'Success' }), t('medications.refill_success', { defaultValue: 'Medication supply refilled!' }), 'success');
            setRefillModal({ visible: false, med: null, count: '' });
            await load(true);
        } catch (err) {
            console.warn('Refill failed:', err.message);
            showToast(t('common.error', { defaultValue: 'Error' }), t('medications.refill_failed', { defaultValue: 'Failed to refill medication.' }), 'error');
        } finally {
            setSubmittingRefill(false);
        }
    };

    const handleUploadPrescription = async () => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') { 
                showToast(t('common.permission_needed', { defaultValue: 'Permission needed' }), t('medications.camera_req', { defaultValue: 'Camera access required.' }), 'error'); 
                return; 
            }
            
            AlertManager.alert(
                'Scan Prescription',
                'How would you like to provide the prescription?',
                [
                    { 
                        text: 'Take Photo', 
                        onPress: async () => {
                            const result = await ImagePicker.launchCameraAsync({
                                allowsEditing: false, quality: 0.8, base64: true,
                            });
                            processSelectedImage(result);
                        }
                    },
                    { 
                        text: 'Choose from Gallery', 
                        onPress: async () => {
                            const result = await ImagePicker.launchImageLibraryAsync({
                                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                                allowsEditing: false, quality: 0.8, base64: true,
                            });
                            processSelectedImage(result);
                        }
                    },
                    { text: 'Cancel', style: 'cancel' }
                ]
            );
        } catch (error) {
            showToast(t('common.error', { defaultValue: 'Error' }), error.message, 'error');
        }
    };

    const processSelectedImage = async (result) => {
        if (!result.canceled && result.assets && result.assets[0]) {
            try {
                setUploadingImage(true);
                const manipResult = await ImageManipulator.manipulateAsync(
                    result.assets[0].uri,
                    [{ resize: { width: 1024 } }], // Larger width for better OCR
                    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                );
                if (!manipResult.base64) throw new Error('Failed to process image.');
                
                // Navigate to the verification screen, passing the image and refresh callback
                navigation.navigate('PrescriptionVerification', { 
                    imageBase64: manipResult.base64,
                    imageUri: manipResult.uri,
                    onVerifySave: () => {
                        setModRequested(true);
                        load(true);
                    }
                });
            } catch (error) {
                showToast('Image Error', 'Could not process the selected image.', 'error');
            } finally {
                setUploadingImage(false);
            }
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
    // End hours: slot is still "active" until this hour
    const SLOT_END_HOURS = { morning: 11, afternoon: 16, evening: 19, night: 24 };
    const nextSlot = SLOT_ORDER.find(slot => {
        const start = SLOT_START_HOURS[slot];
        const end = SLOT_END_HOURS[slot];
        if (start === undefined) return false;
        const hasUntaken = (schedule[slot] || []).some(m => !m.taken);
        if (!hasUntaken) return false;
        // Slot is relevant if we're currently IN it (start <= hour < end) or it's upcoming (hour < start)
        return hour < end;
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
                            <Text style={styles.headerEyebrow}>{t('meds.care_plan', { defaultValue: 'CARE PLAN' })}</Text>
                            <Text style={styles.headerTitle}>{t('common.medications', { defaultValue: 'Medications' })}</Text>
                        </View>
                    </View>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                    <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                        <Pill size={36} color="#6366F1" strokeWidth={1.5} />
                    </View>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: '#0F172A', marginBottom: 10 }}>{t('common.premium_feature', { defaultValue: 'Premium Feature' })}</Text>
                    <Text style={{ fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 24 }}>
                        {t('medications.premium_desc', { defaultValue: 'Medication tracking and adherence insights are included in the Premium Plan. Upgrade to manage your daily schedule.' })}
                    </Text>
                </View>
            </View>
        );
    }

    // ══════════════════════════════════════════════════════════════════════
    return (
        <View style={styles.root}>
            <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

            {/* Ambient Background Decorations (Level 3: Light-Medium) */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <Svg height="100%" width="100%" viewBox="0 0 400 850" preserveAspectRatio="none">
                    <Defs>
                        <SvgLinearGradient id="medsTopBg" x1="0%" y1="0%" x2="100%" y2="100%">
                            <Stop offset="0%" stopColor="#E0F2FE" stopOpacity="0.65" />
                            <Stop offset="100%" stopColor="#F8FAFC" stopOpacity="0" />
                        </SvgLinearGradient>
                    </Defs>
                    
                    {/* Top right curvy gradient backdrop */}
                    <Path d="M180 0 C260 120, 320 150, 400 120 L400 0 Z" fill="url(#medsTopBg)" />

                    {/* Stylized sweeping curve line */}
                    <Path d="M-20 180 C80 230, 180 150, 280 230 C340 280, 380 250, 420 310" stroke={colors.borderLight} strokeWidth="1" fill="none" opacity="0.15" />
                </Svg>
            </View>


            {/* ── SIMPLE HEADER (like care team) ── */}
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerEyebrow}>{t('meds.care_plan', { defaultValue: 'CARE PLAN' })}</Text>
                        <Text style={styles.headerTitle}>{t('common.medications', { defaultValue: 'Medications' })}</Text>
                    </View>
                    <Pressable style={styles.headerBtn} onPress={() => navigation.navigate('Notifications')}>
                        <Bell size={20} color="#475569" strokeWidth={2.5} />
                        {unreadCount > 0 && <View style={styles.bellDot} />}
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
                            <Text style={styles.progressLabel}>{t('medications.todays_progress', { defaultValue: "Today's Progress" })}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginVertical: 6 }}>
                                <Text style={styles.progressCount}>{takenCount}</Text>
                                <Text style={styles.progressTotal}>/ {totalCount} {t('common.taken', { defaultValue: 'taken' })}</Text>
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
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#6366F1' }}>{Math.round(adherencePct)}% {t('common.avg', { defaultValue: 'avg' })}</Text>
                                </View>
                                {nextCfg ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                        <nextCfg.Icon size={12} color={nextCfg.color} />
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: nextCfg.color }}>{t('medications.next', { defaultValue: 'Next' })}: {t(`time_slots.${nextSlot}`, { defaultValue: nextCfg.label })}</Text>
                                    </View>
                                ) : (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                        <CheckCircle2 size={12} color="#10B981" />
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>{t('common.all_done', { defaultValue: 'All done!' })}</Text>
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
                        <Text style={styles.emptyTitle}>{t('common.all_clear', { defaultValue: 'All Clear!' })}</Text>
                        <Text style={styles.emptyBody}>
                            {t('medications.no_meds_scheduled', { defaultValue: 'No medications scheduled yet. Your caregiver will add them, or request a review below.' })}
                        </Text>
                        <Pressable style={styles.emptyPrefBtn} onPress={() => { setShowPrefModal(true); setTempPrefs(preferences); }}>
                            <LinearGradient colors={['#6366F1', '#4F46E5']} style={StyleSheet.absoluteFill} />
                            <Clock size={17} color="#FFF" />
                            <Text style={styles.emptyPrefTxt}>{t('medications.set_call_prefs', { defaultValue: 'Set Call Preferences' })}</Text>
                        </Pressable>

                        <View style={styles.actionGroup}>
                            <Pressable
                                style={[styles.outlineBtn, modRequested && { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
                                disabled={uploadingImage || modRequested}
                                onPress={handleUploadPrescription}
                            >
                                {uploadingImage ? <ActivityIndicator size="small" color="#6366F1" /> :
                                    modRequested ? <><CheckCircle2 size={18} color="#16A34A" /><Text style={[styles.outlineBtnTxt, { color: '#16A34A' }]}>{t('medications.request_sent', { defaultValue: 'Request Sent!' })}</Text></> :
                                        <><MessageCircle size={18} color="#6366F1" /><Text style={styles.outlineBtnTxt}>{t('medications.request_caregiver_review', { defaultValue: 'Request Caregiver Review' })}</Text></>
                                }
                            </Pressable>
                        </View>

                        {patient?.uploaded_prescriptions?.length > 0 && (
                            <View style={{ width: '100%', marginTop: 20 }}>
                                <Text style={styles.sectionLabel}>{t('medications.recent_uploads', { defaultValue: 'RECENT UPLOADS' })}</Text>
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
                                        <Text style={styles.cardTitle}>{t('common.weekly_adherence', { defaultValue: 'Weekly Adherence' })}</Text>
                                        <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2, fontWeight: '600' }}>
                                            {t('common.last_7_days', { defaultValue: 'Last 7 days' })}
                                        </Text>
                                    </View>
                                    <View style={styles.adherenceBadge}>
                                        <TrendingUp size={13} color="#6366F1" />
                                        <Text style={styles.adherenceBadgeTxt}>{adherencePct}% {t('common.avg', { defaultValue: 'avg' })}</Text>
                                    </View>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 2 }}>
                                    {adherence.map((d, i) => (
                                        <ChartBar
                                            key={i}
                                            percentage={d.p}
                                            isToday={d.isToday}
                                            day={(d.day || '').substring(0, 2)}
                                        />
                                    ))}
                                </View>
                            </View>

                            {/* ── AI WEEKLY SUMMARY ── */}
                            {weeklySummary && (
                                <View style={{ backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#BBF7D0' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <Zap size={16} color="#16A34A" />
                                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#16A34A', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                                            AI Weekly Summary
                                        </Text>
                                    </View>
                                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#064E3B', lineHeight: 22, marginBottom: 8 }}>
                                        {weeklySummary.summary_text}
                                    </Text>
                                    <Text style={{ fontSize: 14, color: '#047857', fontStyle: 'italic', marginBottom: 4 }}>
                                        "{weeklySummary.encouragement_text}"
                                    </Text>
                                    <Text style={{ fontSize: 13, color: '#065F46', marginTop: 4 }}>
                                        💡 {weeklySummary.areas_to_improve}
                                    </Text>
                                </View>
                            )}
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
                                                <MedCard med={med} onToggle={handleMedIconPress} onSnooze={handleSnooze} onRefill={handleRefill} />
                                            </View>
                                        ))}
                                    </View>
                                );
                            })}
                        </Animated.View>

                        {/* ── TEMPORARY MEDICATIONS ── */}
                        <Animated.View style={anim(3)}>
                            <View style={{ backgroundColor: '#FFFFFF', borderRadius: radius.lg, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: colors.borderLight, ...shadows.card }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <View style={{ width: 28, height: 28, borderRadius: radius.sm, backgroundColor: '#FAF5FF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9D5FF' }}>
                                            <Pill size={14} color="#A855F7" strokeWidth={2.5} />
                                        </View>
                                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', letterSpacing: 0.3 }}>
                                            Temporary Medications
                                        </Text>
                                        {tempMeds.length > 0 && (
                                            <View style={{ backgroundColor: '#FAF5FF', paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.sm, borderWidth: 1, borderColor: '#E9D5FF' }}>
                                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#A855F7' }}>{tempMeds.length}</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Pressable 
                                        onPress={() => {
                                            setTempMedForm({ name: '', dosage: '', frequency: 'As needed', reason: '', shift: 'morning' });
                                            setShowAddTempMedModal(true);
                                        }} 
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#FAF5FF', borderRadius: radius.sm, borderWidth: 1, borderColor: '#E9D5FF' }}
                                    >
                                        <Plus size={14} color="#A855F7" strokeWidth={2.5} />
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#A855F7' }}>Add</Text>
                                    </Pressable>
                                </View>

                                {tempMeds.length === 0 ? (
                                    <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                        <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center' }}>
                                            No temporary medications. Add any short-term or OTC medicines you are currently taking.
                                        </Text>
                                    </View>
                                ) : (
                                    tempMeds.map((tm, idx) => {
                                        const riskColors = { safe: '#10B981', caution: '#F59E0B', restricted: '#EF4444' };
                                        const riskColor = riskColors[tm.riskTier] || '#64748B';
                                        
                                        // Shift config for beautiful micro-details
                                        const shiftStyles = {
                                            morning: { bg: '#FFF7ED', txt: '#C2410C', label: 'Morning' },
                                            afternoon: { bg: '#F0F9FF', txt: '#0369A1', label: 'Afternoon' },
                                            night: { bg: '#EEF2FF', txt: '#4338CA', label: 'Night' },
                                        };
                                        const shiftCfg = shiftStyles[tm.shift] || { bg: '#F1F5F9', txt: '#475569', label: tm.shift };

                                        return (
                                            <View 
                                                key={tm._id || idx} 
                                                style={{ 
                                                    flexDirection: 'row', 
                                                    alignItems: 'center', 
                                                    gap: 12, 
                                                    padding: 14, 
                                                    backgroundColor: '#F8FAFC',
                                                    borderRadius: radius.md,
                                                    borderWidth: 1,
                                                    borderColor: colors.borderLight,
                                                    borderLeftWidth: 4,
                                                    borderLeftColor: riskColor,
                                                    marginBottom: idx < tempMeds.length - 1 ? 12 : 0,
                                                    ...shadows.sm,
                                                }}
                                            >
                                                <View style={{ flex: 1, gap: 4 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                        <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 }}>{tm.name}</Text>
                                                        {tm.shift && (
                                                            <View style={{ backgroundColor: shiftCfg.bg, paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 8 }}>
                                                                <Text style={{ fontSize: 9, fontWeight: '800', color: shiftCfg.txt, textTransform: 'uppercase', letterSpacing: 0.3 }}>{shiftCfg.label}</Text>
                                                            </View>
                                                        )}
                                                        <View style={{ backgroundColor: tm.riskTier === 'safe' ? '#ECFDF5' : tm.riskTier === 'restricted' ? '#FEF2F2' : '#FFFBEB', paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 8, borderWidth: 1, borderColor: tm.riskTier === 'safe' ? '#A7F3D0' : tm.riskTier === 'restricted' ? '#FECACA' : '#FDE68A' }}>
                                                            <Text style={{ fontSize: 9, fontWeight: '900', color: riskColor, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                                                {tm.riskTier === 'safe' ? 'Safe' : tm.riskTier === 'restricted' ? 'Restricted' : 'Caution'}
                                                            </Text>
                                                        </View>
                                                    </View>

                                                    {(tm.dosage || tm.frequency) ? (
                                                        <Text style={{ fontSize: 13, color: '#475569', fontWeight: '600' }}>
                                                            {[tm.dosage, tm.frequency].filter(Boolean).join(' · ')}
                                                        </Text>
                                                    ) : null}

                                                    {tm.aiSummary ? (
                                                        <Text style={{ fontSize: 12, color: '#64748B', lineHeight: 17, marginTop: 2 }}>
                                                            {tm.aiSummary}
                                                        </Text>
                                                    ) : null}

                                                    {tm.reason ? (
                                                        <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '500', marginTop: 1 }}>
                                                            Reason: {tm.reason}
                                                        </Text>
                                                    ) : null}

                                                    {tm.riskTier === 'restricted' && (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#FCA5A5' }}>
                                                            <AlertCircle size={11} color="#DC2626" strokeWidth={2.5} />
                                                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#DC2626', letterSpacing: 0.2 }}>Do NOT take without doctor approval</Text>
                                                        </View>
                                                    )}

                                                    <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '500', marginTop: 2 }}>
                                                        Added by {tm.addedByName || tm.addedByRole}
                                                    </Text>
                                                </View>

                                                {tm._id && String(tm._id).startsWith('temp_') ? (
                                                    <View style={{ padding: 8 }}>
                                                        <ActivityIndicator size="small" color="#A855F7" />
                                                    </View>
                                                ) : (
                                                    <Pressable 
                                                        onPress={() => handleDeleteTempMed(tm)}
                                                        style={({ pressed }) => [{ padding: 8, borderRadius: 10, backgroundColor: '#F1F5F9', opacity: pressed ? 0.6 : 1 }]}
                                                    >
                                                        <Trash2 size={15} color="#94A3B8" />
                                                    </Pressable>
                                                )}
                                            </View>
                                        );
                                    })
                                )}
                            </View>
                        </Animated.View>

                        {/* ── MEDICATION SUPPLY ── */}
                        {(() => {
                            const supplyMeds = [];
                            const seen = new Set();
                            allMeds.forEach(med => {
                                if (med.refillInfo && !seen.has(med.name)) {
                                    seen.add(med.name);
                                    const remaining = med.refillInfo.remainingDoses ?? med.refillInfo.totalDoses ?? null;
                                    if (remaining !== null) {
                                        supplyMeds.push({
                                            name: med.name,
                                            remaining,
                                            total: med.refillInfo.totalDoses || remaining,
                                            isLow: remaining <= (med.refillInfo.alertThreshold || 5),
                                        });
                                    }
                                }
                            });
                            if (supplyMeds.length === 0) return null;
                            return (
                                <Animated.View style={anim(3)}>
                                    <View style={{ backgroundColor: '#FFFFFF', borderRadius: radius.lg, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: colors.borderLight, ...shadows.card }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                            <View style={{ width: 28, height: 28, borderRadius: radius.sm, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#C7D2FE' }}>
                                                <Pill size={14} color="#6366F1" strokeWidth={2.5} />
                                            </View>
                                            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', letterSpacing: 0.3 }}>
                                                {t('medications.supply_tracker', { defaultValue: 'Medication Supply' })}
                                            </Text>
                                        </View>
                                        {supplyMeds.map(sm => {
                                            const pct = sm.total > 0 ? Math.min((sm.remaining / sm.total) * 100, 100) : 0;
                                            return (
                                                <View key={sm.name} style={{ marginBottom: 14 }}>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B', letterSpacing: -0.1 }}>{sm.name}</Text>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                            {sm.isLow && <AlertCircle size={10} color="#EF4444" strokeWidth={3} />}
                                                            <Text style={{ fontSize: 12, fontWeight: '800', color: sm.isLow ? '#EF4444' : '#64748B' }}>
                                                                {sm.remaining} / {sm.total} {t('medications.left', { defaultValue: 'left' })}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    <View style={{ height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                                                        <View style={{
                                                            height: 8, borderRadius: 4,
                                                            width: `${Math.max(pct, 2)}%`,
                                                            overflow: 'hidden'
                                                        }}>
                                                            <LinearGradient 
                                                                colors={sm.isLow ? ['#EF4444', '#F87171'] : pct > 50 ? ['#10B981', '#34D399'] : ['#F59E0B', '#FBBF24']} 
                                                                start={{ x: 0, y: 0 }} 
                                                                end={{ x: 1, y: 0 }} 
                                                                style={{ flex: 1 }} 
                                                            />
                                                        </View>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </Animated.View>
                            );
                        })()}

                        {/* ── ACTION BUTTONS ── */}
                        <Animated.View style={[anim(3), styles.actionGroup]}>
                            <Pressable
                                style={[styles.outlineBtn, modRequested && { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
                                disabled={uploadingImage || modRequested}
                                onPress={handleUploadPrescription}
                            >
                                {uploadingImage ? <ActivityIndicator size="small" color="#6366F1" /> :
                                    modRequested ? <><CheckCircle2 size={18} color="#16A34A" /><Text style={[styles.outlineBtnTxt, { color: '#16A34A' }]}>{t('medications.request_sent', { defaultValue: 'Request Sent!' })}</Text></> :
                                        <><Pencil size={18} color="#6366F1" /><Text style={styles.outlineBtnTxt}>{t('medications.request_med_review', { defaultValue: 'Request Medication Review' })}</Text></>
                                }
                            </Pressable>

                            {patient?.uploaded_prescriptions?.length > 0 && (
                                <View style={{ marginTop: 8 }}>
                                    <Text style={[styles.sectionLabel, { marginBottom: 12 }]}>{t('medications.uploaded_prescriptions', { defaultValue: 'UPLOADED PRESCRIPTIONS' })}</Text>
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
                                                <Text style={styles.uploadName}>{t('medications.doctors_slip', { defaultValue: "Doctor's Slip" })}</Text>
                                                <Text style={styles.uploadDate}>{new Date(up.uploaded_at).toLocaleDateString()}</Text>
                                            </View>
                                            <Text style={[styles.uploadStatus, {
                                                color: up.status === 'reviewed' ? '#16A34A' : up.status === 'rejected' ? '#DC2626' : '#D97706',
                                            }]}>{t(`medications.status_${up.status}`, { defaultValue: up.status })}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </Animated.View>
                    </>
                )}
            </ScrollView>

            {/* ── FAB ── */}
            {totalCount > 0 && (
                <Animated.View style={[styles.fab, {
                    bottom: localFabBottom,
                    opacity: staggerAnims[4],
                    transform: [{ scale: staggerAnims[4].interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }],
                }]}>
                    <Pressable onPress={() => { setShowPrefModal(true); setTempPrefs(preferences); setActivePicker(null); }}>
                        <LinearGradient colors={['#818CF8', '#4F46E5']} style={styles.fabBtn}>
                            <Clock size={24} color="#FFF" strokeWidth={2.5} />
                        </LinearGradient>
                    </Pressable>
                </Animated.View>
            )}

            {/* ── PREFERENCES MODAL ── */}
            <PremiumFormModal
                visible={showPrefModal}
                title={t('medications.call_preferences', { defaultValue: 'Call Preferences' })}
                onClose={() => setShowPrefModal(false)}
                onSave={handleSavePreferences}
                saveText={savingPrefs ? t('common.saving', { defaultValue: 'Saving...' }) : t('medications.save_prefs', { defaultValue: 'Save Preferences' })}
                saving={savingPrefs}
            >
                <Text style={styles.modalDesc}>
                    {t('medications.call_prefs_desc', { defaultValue: 'Set when your care team should call to check on your medications. We call within 30 min of this time.' })}
                </Text>
                {['morning', 'afternoon', 'evening', 'night'].map(slot => {
                    const cfg = SLOT_CONFIG[slot];
                    return (
                        <View key={slot} style={styles.prefRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={[styles.prefIconBox, { backgroundColor: cfg.light, borderColor: cfg.border }]}>
                                    <cfg.Icon size={17} color={cfg.color} strokeWidth={2.5} />
                                </View>
                                <Text style={styles.prefLabel}>{t(`time_slots.${slot}`, { defaultValue: cfg.label })}</Text>
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

            {/* ── REFILL MODAL ── */}
            <Modal visible={refillModal.visible} transparent animationType="fade">
                <View style={[styles.confirmOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
                    <View style={{ backgroundColor: '#FFF', width: '85%', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 15, elevation: 10 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={{ fontSize: 18, fontWeight: '800', color: '#1E293B' }}>Refill Medication</Text>
                            <Pressable onPress={() => setRefillModal({ visible: false, med: null, count: '' })}>
                                <X color="#64748B" size={20} />
                            </Pressable>
                        </View>
                        <Text style={{ fontSize: 14, color: '#475569', marginBottom: 16, lineHeight: 20 }}>
                            Enter the number of new doses you purchased. These will be <Text style={{ fontWeight: '800', color: '#1E293B' }}>added</Text> to your current remaining supply of <Text style={{ fontWeight: '700', color: '#1E293B' }}>{refillModal.med?.name}</Text>.
                        </Text>
                        <TextInput
                            style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, fontSize: 16, color: '#1E293B', marginBottom: 16 }}
                            value={refillModal.count}
                            onChangeText={(t) => setRefillModal(p => ({ ...p, count: t }))}
                            keyboardType="numeric"
                            placeholder="e.g. 30"
                            placeholderTextColor="#94A3B8"
                        />
                        {(() => {
                            const currentRemaining = refillModal.med?.refillInfo?.remainingDoses ?? refillModal.med?.refillInfo?.totalDoses ?? 0;
                            const addedDoses = parseInt(refillModal.count, 10) || 0;
                            const newRemaining = currentRemaining + addedDoses;
                            return (
                                <View style={{ marginBottom: 20, backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', gap: 6 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '500' }}>Current Remaining:</Text>
                                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>{currentRemaining} doses</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '500' }}>New Purchased:</Text>
                                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#10B981' }}>+{addedDoses} doses</Text>
                                    </View>
                                    <View style={{ height: 1, backgroundColor: '#E2E8F0', marginVertical: 4 }} />
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E3A8A' }}>New remaining after refill:</Text>
                                        <Text style={{ fontSize: 13, fontWeight: '900', color: '#1E3A8A' }}>{newRemaining} doses</Text>
                                    </View>
                                </View>
                            );
                        })()}
                        <Pressable 
                            style={{ 
                                backgroundColor: submittingRefill ? '#94A3B8' : '#1E3A8A', 
                                paddingVertical: 14, 
                                borderRadius: 12, 
                                alignItems: 'center',
                                opacity: submittingRefill ? 0.8 : 1
                            }}
                            disabled={submittingRefill}
                            onPress={submitRefill}
                        >
                            {submittingRefill ? (
                                <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                                <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700' }}>Confirm Refill</Text>
                            )}
                        </Pressable>
                    </View>
                </View>
            </Modal>

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
                            <Text style={styles.confirmTitle}>{t('medications.confirm_intake', { defaultValue: 'Confirm Intake' })}</Text>
                            <Text style={styles.confirmSub}>
                                {t('medications.have_you_taken', { defaultValue: 'Have you taken\n' })}
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
                            <Text style={styles.confirmYesTxt}>{t('medications.yes_i_took_it', { defaultValue: 'Yes, I took it!' })}</Text>
                        </Pressable>
                        <Pressable style={styles.confirmNoBtn} onPress={() => { setIsConfirmVisible(false); setConfirmingMed(null); }}>
                            <Text style={styles.confirmNoTxt}>{t('common.not_yet', { defaultValue: 'Not yet' })}</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* ── TOAST ── */}
            {toast.visible && (() => {
                const toastConfigs = {
                    success: {
                        bg: '#ECFDF5',
                        border: '#A7F3D0',
                        iconBg: '#D1FAE5',
                        iconColor: '#10B981',
                        Icon: CheckCircle2,
                    },
                    error: {
                        bg: '#FEF2F2',
                        border: '#FECACA',
                        iconBg: '#FEE2E2',
                        iconColor: '#EF4444',
                        Icon: AlertCircle,
                    },
                    info: {
                        bg: '#EFF6FF',
                        border: '#BFDBFE',
                        iconBg: '#DBEAFE',
                        iconColor: '#3B82F6',
                        Icon: Info,
                    },
                };
                const cfg = toastConfigs[toast.type || 'success'] || toastConfigs.success;
                const IconComponent = cfg.Icon;
                return (
                    <Animated.View style={[styles.toast, {
                        opacity: toastAnim,
                        transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
                    }]}>
                        <View style={[styles.toastInner, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: cfg.iconBg, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                <IconComponent size={20} color={cfg.iconColor} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.toastTitle}>{toast.title}</Text>
                                <Text style={styles.toastMsg}>{toast.message}</Text>
                            </View>
                        </View>
                    </Animated.View>
                );
            })()}

            {/* ── ADD TEMPORARY MEDICATION MODAL ── */}
            <Modal visible={showAddTempMedModal} transparent animationType="slide">
                <View style={styles.confirmOverlay}>
                    <Pressable style={{ flex: 1 }} onPress={() => setShowAddTempMedModal(false)} />
                    <View style={styles.confirmSheet}>
                        <View style={styles.sheetHandle} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <Text style={{ fontSize: 20, fontWeight: '900', color: '#0F172A' }}>Add Temporary Medication</Text>
                            <Pressable onPress={() => setShowAddTempMedModal(false)}>
                                <X color="#64748B" size={20} />
                            </Pressable>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: Platform.OS === 'ios' ? 40 : 20 }}>
                            <View style={{ gap: 6 }}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Medicine Name *</Text>
                                <TextInput
                                    style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, fontSize: 15, color: '#0F172A' }}
                                    placeholder="e.g. Paracetamol, Dolo 650"
                                    placeholderTextColor="#94A3B8"
                                    value={tempMedForm.name}
                                    onChangeText={text => setTempMedForm(prev => ({ ...prev, name: text }))}
                                />
                            </View>

                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <View style={{ flex: 1, gap: 6 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Dosage</Text>
                                    <TextInput
                                        style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, fontSize: 15, color: '#0F172A' }}
                                        placeholder="e.g. 650 mg, 1 tablet"
                                        placeholderTextColor="#94A3B8"
                                        value={tempMedForm.dosage}
                                        onChangeText={text => setTempMedForm(prev => ({ ...prev, dosage: text }))}
                                    />
                                </View>
                                <View style={{ flex: 1, gap: 6 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Frequency</Text>
                                    <TextInput
                                        style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, fontSize: 15, color: '#0F172A' }}
                                        placeholder="e.g. As needed, Twice daily"
                                        placeholderTextColor="#94A3B8"
                                        value={tempMedForm.frequency}
                                        onChangeText={text => setTempMedForm(prev => ({ ...prev, frequency: text }))}
                                    />
                                </View>
                            </View>

                            <View style={{ gap: 6 }}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Preferred Shift *</Text>
                                <View style={{ flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4, gap: 4 }}>
                                    {['morning', 'afternoon', 'night'].map(shift => {
                                        const active = tempMedForm.shift === shift;
                                        return (
                                            <Pressable 
                                                key={shift}
                                                onPress={() => setTempMedForm(prev => ({ ...prev, shift }))}
                                                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: active ? '#FFFFFF' : 'transparent', shadowColor: active ? '#000' : 'transparent', shadowOffset: { width: 0, height: 1 }, shadowOpacity: active ? 0.1 : 0, shadowRadius: 2, elevation: active ? 1 : 0 }}
                                            >
                                                <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#0F172A' : '#64748B', textTransform: 'capitalize' }}>{shift}</Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>

                            <View style={{ gap: 6 }}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Reason</Text>
                                <TextInput
                                    style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, fontSize: 15, color: '#0F172A' }}
                                    placeholder="e.g. Headache, Fever"
                                    placeholderTextColor="#94A3B8"
                                    value={tempMedForm.reason}
                                    onChangeText={text => setTempMedForm(prev => ({ ...prev, reason: text }))}
                                />
                            </View>

                            <Pressable 
                                onPress={submitAddTempMed}
                                disabled={addingTempMed}
                                style={{ backgroundColor: '#7C3AED', paddingVertical: 15, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10, flexDirection: 'row', gap: 8 }}
                            >
                                {addingTempMed ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <>
                                        <Plus size={18} color="#FFFFFF" strokeWidth={2.5} />
                                        <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700' }}>Add Medicine</Text>
                                    </>
                                )}
                            </Pressable>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// ── Upload row helper ─────────────────────────────────────────────────────────
function UploadRow({ upload }) {
    const { t } = useTranslation();
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
                <Text style={styles.uploadName}>{t('medications.prescription_slip', { defaultValue: 'Prescription Slip' })}</Text>
                <Text style={styles.uploadDate}>{new Date(upload.uploaded_at).toLocaleDateString()}</Text>
            </View>
            <Text style={[styles.uploadStatus, {
                color: upload.status === 'reviewed' ? '#16A34A' : upload.status === 'rejected' ? '#DC2626' : '#D97706',
            }]}>{t(`medications.status_${upload.status}`, { defaultValue: upload.status })}</Text>
        </View>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// ══ STYLES ═══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },

    // ── Header (simple, like care team) ──
    header: {
        paddingTop: Platform.OS === 'ios' ? 60 : 48,
        paddingHorizontal: spacing.screen, paddingBottom: 14,
        backgroundColor: colors.background,
    },
    headerRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    headerEyebrow: {
        fontSize: 13, fontWeight: '800', color: colors.primary,
        letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4,
    },
    headerTitle: {
        fontSize: 32, fontWeight: '800', color: '#0F172A', letterSpacing: -1,
    },
    headerBtn: {
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.borderLight,
        alignItems: 'center', justifyContent: 'center',
    },
    bellDot: { position: 'absolute', top: 10, right: 10, width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.danger, borderWidth: 1.5, borderColor: '#FFFFFF' },

    // ── Progress card (inside scroll) ──
    progressCard: {
        backgroundColor: '#FFFFFF', borderRadius: radius.lg, padding: 20,
        flexDirection: 'row', alignItems: 'center', gap: 16,
        marginBottom: 20,
        ...shadows.card,
        borderWidth: 1, borderColor: '#EEF2FF',
    },
    progressLabel: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' },
    progressCount: { fontSize: 34, fontWeight: '900', color: '#0F172A', letterSpacing: -1 },
    progressTotal: { fontSize: 16, fontWeight: '600', color: colors.textMuted },
    progressBarBg: { height: 7, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
    progressBarFill: { height: 7, borderRadius: 4 },

    // ── Scroll ──
    scrollView: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingHorizontal: spacing.screen, paddingTop: 8, paddingBottom: layout.TAB_BAR_CLEARANCE + 80 },

    // ── Chart card ──
    chartCard: {
        backgroundColor: '#FFFFFF', borderRadius: radius.lg, padding: 20, marginBottom: 20,
        ...shadows.card,
        borderWidth: 1, borderColor: '#EEF2FF',
    },
    cardTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
    adherenceBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: '#EEF2FF', paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.sm,
    },
    adherenceBadgeTxt: { fontSize: 12, fontWeight: '700', color: colors.primary },
    sectionLabel: {
        fontSize: 11, fontWeight: '800', color: colors.textMuted,
        letterSpacing: 1.5, textTransform: 'uppercase',
    },

    // ── Slot section ──
    slotSection: { marginBottom: 22 },

    // ── Med card ──
    medCard: {
        backgroundColor: '#FFFFFF', borderRadius: radius.md, overflow: 'hidden',
        ...shadows.card,
        borderWidth: 1, borderColor: colors.borderLight,
    },
    medCardTaken: { backgroundColor: '#F8FFF9', borderColor: colors.successLight },
    medTopBar: { height: 4, width: '100%' },
    medCardBody: { flexDirection: 'row', padding: 16, alignItems: 'center', gap: 14 },
    medIconBox: {
        width: 48, height: 48, borderRadius: radius.md,
        alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    },
    medName: { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
    medDose: { fontSize: 13, color: colors.textSecondary, fontWeight: '500', marginTop: 2 },
    takenBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: colors.successLight, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.sm,
    },
    takenBadgeTxt: { fontSize: 10, fontWeight: '700', color: colors.success },
    verifiedBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2,
        borderRadius: 6, borderWidth: 1, borderColor: '#D1FAE5',
    },
    verifiedTxt: { fontSize: 9, fontWeight: '800', color: '#059669', textTransform: 'uppercase', letterSpacing: 0.5 },
    expandSection: { paddingHorizontal: 16, paddingBottom: 14 },
    instructionBox: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: radius.md, borderWidth: 1 },
    instructionTxt: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },

    // ── Swipe actions ──
    swipeLeftAction: {
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: colors.success, borderRadius: radius.md,
        paddingHorizontal: 22, marginRight: 10,
    },
    swipeRightAction: {
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: colors.warning, borderRadius: radius.md,
        paddingHorizontal: 22, marginLeft: 10,
    },

    // ── Empty state ──
    emptyCard: {
        backgroundColor: '#FFFFFF', borderRadius: radius.lg, padding: 28,
        alignItems: 'center', borderWidth: 1, borderColor: '#EEF2FF',
        ...shadows.card,
    },
    emptyIconWrap: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 26, fontWeight: '900', color: '#0F172A', marginBottom: 10 },
    emptyBody: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: 24 },
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
        paddingVertical: 16, paddingHorizontal: 28, borderRadius: radius.md, borderWidth: 1.5,
        borderStyle: 'dashed', backgroundColor: '#FAFBFF', borderColor: '#C7D2FE',
    },
    outlineBtnTxt: { fontSize: 14, fontWeight: '700', color: colors.primary },

    // ── Uploads ──
    uploadCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#FFFFFF', borderRadius: radius.md, padding: 14,
        borderWidth: 1, borderColor: colors.divider,
    },
    uploadStatusBox: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    uploadName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
    uploadDate: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    uploadStatus: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },

    // ── FAB ──
    fab: {
        position: 'absolute',
        right: 28, zIndex: 100,
    },
    fabBtn: {
        width: 58, height: 58, borderRadius: 29,
        alignItems: 'center', justifyContent: 'center',
        ...shadows.hero,
    },

    // ── Preferences modal ──
    modalDesc: { fontSize: 14, color: colors.textSecondary, lineHeight: 22, marginBottom: 20 },
    prefRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#F8FAFC', padding: 14, borderRadius: radius.md, marginBottom: 10,
    },
    prefIconBox: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    prefLabel: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
    timeBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 13, paddingVertical: 9,
        borderRadius: radius.md, borderWidth: 1, backgroundColor: '#FFF',
    },
    timeBtnTxt: { fontSize: 15, fontWeight: '700' },

    // ── Confirmation modal ──
    confirmOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.55)' },
    confirmSheet: {
        backgroundColor: '#FFF', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
        padding: 28, paddingBottom: Platform.OS === 'ios' ? 52 : 28,
    },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.divider, alignSelf: 'center', marginBottom: 28 },
    confirmIconWrap: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    confirmTitle: { fontSize: 26, fontWeight: '900', color: '#0F172A', textAlign: 'center', marginBottom: 10 },
    confirmSub: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', lineHeight: 26, marginBottom: 2 },
    dosagePill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        marginTop: 12, backgroundColor: '#EEF2FF',
        paddingHorizontal: 18, paddingVertical: 8, borderRadius: radius.full,
    },
    dosageTxt: { fontSize: 14, fontWeight: '800', color: colors.primary },
    confirmYesBtn: {
        height: 58, borderRadius: radius.md, overflow: 'hidden',
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        marginTop: 4, marginBottom: 10,
    },
    confirmYesTxt: { fontSize: 18, fontWeight: '800', color: '#FFF' },
    confirmNoBtn: {
        height: 52, borderRadius: radius.md,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#F8FAFC',
    },
    confirmNoTxt: { fontSize: 16, fontWeight: '700', color: colors.textSecondary },

    // ── Toast ──
    toast: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 48,
        left: 20, right: 20, zIndex: 9999,
    },
    toastInner: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FFFFFF', padding: 16, borderRadius: radius.md,
        ...shadows.card,
        borderWidth: 1, borderColor: colors.divider,
    },
    toastTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
    toastMsg: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
});
