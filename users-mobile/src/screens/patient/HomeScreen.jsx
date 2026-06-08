import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Platform, Pressable, Animated,
    ActivityIndicator, KeyboardAvoidingView, TouchableOpacity,
    DeviceEventEmitter, InteractionManager, Dimensions, StatusBar, AppState, RefreshControl
} from 'react-native';
import { getStreakState } from '../../utils/streakHelper';
import StreakCompanion from '../../components/ui/StreakCompanion';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Pill, Sparkles, ChevronRight, TrendingUp, Activity,
    CalendarDays, CheckCircle2, Bell, Heart, Wind, Droplets, MapPin,
    AlertTriangle, WifiOff, Flame, Zap, Watch, Shield, MessageSquare, Trophy, ChevronDown
} from 'lucide-react-native';
import { handleAxiosError } from '../../lib/axiosInstance';
import { colors, layout } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../lib/api';
import { useFocusEffect } from '@react-navigation/native';
import HealthSyncService from '../../services/HealthSyncService';
import { syncAllSchedules } from '../../utils/notifications';
import usePatientStore from '../../store/usePatientStore';
import SmartInput from '../../components/ui/SmartInput';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HapticPatterns } from '../../utils/haptics';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Circle as SvgCircle } from 'react-native-svg';

const { width: SW } = Dimensions.get('window');

// ── Health tips ────────────────────────────────────────────────────────────
const HEALTH_TIPS = [
    "💧 Stay hydrated! Drinking 8 glasses of water daily helps manage blood pressure and keeps your joints lubricated.",
    "🚶‍♂️ A quick 10-minute walk after meals can significantly lower post-meal blood sugar levels and assist digestion.",
    "🧂 Watch the salt! Reducing sodium intake by just a little can help keep your heart healthy and lower blood pressure.",
    "🥗 Fill half your plate with colorful vegetables at lunch and dinner to ensure you get a boost of essential fiber and vitamins.",
    "😴 Aim for 7-8 hours of quality sleep tonight. Sleep is critical for brain function, cardiovascular health, and cell repair.",
    "🚶‍♀️ Take 5 slow, deep breaths when feeling stressed. Deep breathing instantly calms the nervous system and lowers heart rate.",
    "🍎 Swap processed afternoon snacks for a piece of fresh fruit or a handful of unsalted almonds to sustain your energy levels.",
    "🥛 Bone health matters! Make sure you're getting enough calcium and Vitamin D from dairy, fortified foods, or sunlight.",
    "🦷 Brush and floss daily. Poor dental health is linked to an increased risk of cardiovascular issues.",
    "🍵 Green tea is rich in antioxidants that support metabolic health and improve cardiovascular function.",
    "🧠 Challenge your brain today! Solve a puzzle, read a new article, or practice a language to support cognitive longevity.",
    "🍳 Start your day with a high-protein breakfast like eggs or yogurt to stay full longer and reduce morning cravings.",
    "🧍 Posture check! Take a moment to sit up straight and stretch your shoulders to relieve back and neck tension.",
    "💧 Sip water consistently throughout the day rather than chugging it all at once to maintain steady hydration levels.",
    "❤️ Stay connected. Call or message a loved one today. Social connection is a powerful driver of overall mental and physical well-being."
];
const HEALTH_TIPS_COUNT = HEALTH_TIPS.length;
const getDailyTipIndex = () => Math.floor((Date.now() / 86400000)) % HEALTH_TIPS_COUNT;

const ACCENT_MAP = {
    morning: '#F97316',
    afternoon: '#0EA5E9',
    evening: '#A855F7',
    night: '#6366F1',
    as_needed: '#10B981',
};

// ── Skeleton loader ────────────────────────────────────────────────────────
const SkeletonItem = ({ width, height, borderRadius = 10, style }) => {
    const anim = useRef(new Animated.Value(0.35)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 1, duration: 750, useNativeDriver: true }),
                Animated.timing(anim, { toValue: 0.35, duration: 750, useNativeDriver: true }),
            ])
        ).start();
    }, []);
    return <Animated.View style={[{ width, height, borderRadius, backgroundColor: '#CBD5E1', opacity: anim }, style]} />;
};

// ── Sparkline Helper Component (Apple Health style) ─────────────────────────
const Sparkline = ({ values, color, width = 120, height = 32 }) => {
    if (!values || values.length < 2) {
        return (
            <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
                <Path
                    d={`M 0 ${height / 2} L ${width / 3} ${height / 2} L ${width / 2.6} ${height / 2 - 8} L ${width / 2.3} ${height / 2 + 8} L ${width / 2.1} ${height / 2 - 12} L ${width / 1.9} ${height / 2 + 12} L ${width / 1.7} ${height / 2 - 4} L ${width / 1.5} ${height / 2} L ${width} ${height / 2}`}
                    fill="none"
                    stroke={color}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.3}
                />
            </Svg>
        );
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = values.map((val, index) => {
        const x = (index / (values.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 8) - 4; // Padding
        return `${x},${y}`;
    });

    const pathD = `M ${points.join(' L ')}`;

    return (
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <Path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
};

// ── Apple Health Style Vitals Card ──────────────────────────────────────────
const VitalsCard = ({ label, value, unit, icon: Icon, color, status = 'Stable', historyValues }) => {
    const { t } = useTranslation();
    const isLogged = status === 'Recorded';

    return (
        <View style={styles.vitalsCard}>
            <View style={styles.vitalsCardTop}>
                <View style={[styles.vitalsIconBox, { backgroundColor: isLogged ? color + '12' : '#F1F5F9' }]}>
                    <Icon size={18} color={isLogged ? color : '#94A3B8'} strokeWidth={2.5} />
                </View>
                <View style={[styles.vitalsStatusBadge, { backgroundColor: isLogged ? color + '15' : '#F1F5F9' }]}>
                    <View style={[styles.statusDot, { backgroundColor: isLogged ? color : '#CBD5E1' }]} />
                    <Text style={[styles.statusLabel, { color: isLogged ? color : '#94A3B8' }]}>
                        {isLogged ? t('home.logged', { defaultValue: 'Logged' }) : t('home.pending', { defaultValue: 'Pending' })}
                    </Text>
                </View>
            </View>

            <Text style={styles.vitalsCardLabel}>{label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 4 }}>
                <Text style={[styles.vitalsCardValue, { color: isLogged ? '#0F172A' : '#CBD5E1' }]}>{value}</Text>
                <Text style={styles.vitalsCardUnit}>{unit}</Text>
            </View>

            <View style={styles.sparklineWrapper}>
                <Sparkline values={historyValues} color={color} />
            </View>

            <Text style={styles.vitalsCardFooter}>
                {isLogged ? t('home.logged_today', { defaultValue: 'Logged today' }) : t('home.tap_history', { defaultValue: 'Tap History' })}
            </Text>
        </View>
    );
};

// ── Mini medication card ───────────────────────────────────────────────────
const MedicationCard = ({ med, onPress }) => {
    const { t } = useTranslation();
    const accentColor = ACCENT_MAP[med.type] || '#6366F1';
    return (
        <Pressable onPress={() => onPress && onPress()} style={[styles.medCard, med.taken && styles.medCardTaken]}>
            <View style={[styles.medAccentBar, { backgroundColor: med.taken ? colors.success : accentColor }]} />
            <View style={styles.medCardContent}>
                <View style={[styles.medIconBox, { backgroundColor: med.taken ? '#ECFDF5' : accentColor + '18' }]}>
                    {med.taken
                        ? <CheckCircle2 size={20} color={colors.success} strokeWidth={2.5} />
                        : <Pill size={20} color={accentColor} strokeWidth={2.5} />
                    }
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.medName, med.taken && { color: colors.success }]}>{med.name}</Text>
                    <Text style={styles.medDose}>{med.dosage}{med.instructions ? ` · ${med.instructions}` : ''}</Text>
                </View>
                {med.taken && (
                    <View style={styles.takenBadge}>
                        <CheckCircle2 size={10} color={colors.success} />
                        <Text style={styles.takenBadgeText}>{t('home.done', { defaultValue: 'Done' })}</Text>
                    </View>
                )}
            </View>
        </Pressable>
    );
};

// ══════════════════════════════════════════════════════════════════════════════
// ══ MAIN SCREEN ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
export default function PatientHomeScreen({ navigation }) {
    const { t } = useTranslation();
    const { displayName, profile } = useAuth();
    const scrollViewRef = useRef(null);
    const heartRateInputRef = useRef(null);
    const vitalsSectionY = useRef(0);

    const patient = usePatientStore((s) => s.patient);
    const vitals = usePatientStore((s) => s.vitals);
    const vitalsHistory = usePatientStore((s) => s.vitalsHistory);
    const aiPrediction = usePatientStore((s) => s.aiPrediction);
    const meds = usePatientStore((s) => s.dashboardMeds);
    const adherenceDetails = usePatientStore((s) => s.adherenceDetails);
    const isCached = usePatientStore((s) => s.isCached);
    const storeFetchDashboard = usePatientStore((s) => s.fetchDashboard);
    const storeFetchMedications = usePatientStore((s) => s.fetchMedications);

    const activeInsights = useMemo(() => {
        const list = [];
        if (!vitals) return list;

        const hr = Number(vitals.heart_rate);
        const sys = Number(vitals.blood_pressure?.systolic);
        const dia = Number(vitals.blood_pressure?.diastolic);
        const spo2 = Number(vitals.oxygen_saturation);
        const hyd = Number(vitals.hydration);
        const isSmoker = patient?.smoking_status === 'current';

        // 1. Heart Rate
        if (hr > 100) {
            list.push({
                key: 'hr_high',
                title: t('advisor.hr_high_title', { defaultValue: 'Elevated Heart Rate' }),
                desc: t('advisor.hr_high_desc', { hr, defaultValue: `Your heart rate is currently elevated at ${hr} bpm. Try to slow down what you're doing, sit down comfortably, and take slow, deep breaths for 2 minutes.` }),
                type: 'warning',
                color: '#EF4444',
                icon: Heart
            });
        } else if (hr > 0 && hr < 55) {
            list.push({
                key: 'hr_low',
                title: t('advisor.hr_low_title', { defaultValue: 'Low Heart Rate' }),
                desc: t('advisor.hr_low_desc', { hr, defaultValue: `Your heart rate is slightly low at ${hr} bpm. Ensure you are resting. If you feel dizzy or lightheaded, please sit or lie down and contact your doctor.` }),
                type: 'warning',
                color: '#3B82F6',
                icon: Heart
            });
        }

        // 2. Oxygen (SpO2)
        if (spo2 > 0 && spo2 < 95) {
            list.push({
                key: 'spo2_low',
                title: t('advisor.spo2_low_title', { defaultValue: 'Oxygen Levels Below Optimal' }),
                desc: isSmoker
                    ? t('advisor.spo2_low_smoker_desc', { spo2, defaultValue: `Your oxygen saturation is low at ${spo2}%. As a smoker, this is a critical reminder to step away from cigarettes immediately. Open windows to improve indoor airflow and step outside for fresh air.` })
                    : t('advisor.spo2_low_desc', { spo2, defaultValue: `Your oxygen saturation is low at ${spo2}%. Step outside for fresh air, open windows to improve ventilation, and practice deep, steady breathing. Sit upright, and contact your doctor if it continues to drop.` }),
                type: 'critical',
                color: '#EF4444',
                icon: Wind
            });
        }

        // 3. Blood Pressure
        if (sys > 140 || dia > 90) {
            list.push({
                key: 'bp_high',
                title: t('advisor.bp_high_title', { defaultValue: 'Elevated Blood Pressure' }),
                desc: t('advisor.bp_high_desc', { sys, dia, defaultValue: `Your blood pressure is elevated at ${sys}/${dia} mmHg. Consider resting in a quiet space, drinking a glass of water, and avoiding high-sodium foods today.` }),
                type: 'warning',
                color: '#EF4444',
                icon: Activity
            });
        } else if (sys > 0 && sys < 90) {
            list.push({
                key: 'bp_low',
                title: t('advisor.bp_low_title', { defaultValue: 'Low Blood Pressure' }),
                desc: t('advisor.bp_low_desc', { sys, dia, defaultValue: `Your blood pressure is low at ${sys}/${dia} mmHg. Try to sit or lie down, drink a glass of water, and avoid rising too quickly from a seated position.` }),
                type: 'warning',
                color: '#3B82F6',
                icon: Activity
            });
        }

        // 4. Hydration
        if (hyd > 0 && hyd < 60) {
            list.push({
                key: 'hyd_low',
                title: t('advisor.hyd_low_title', { defaultValue: 'Dehydration Warning' }),
                desc: t('advisor.hyd_low_desc', { hyd, defaultValue: `Your hydration level is low at ${hyd}%. Drink a large glass of water now to help restore your body's optimal fluid balance.` }),
                type: 'info',
                color: '#0EA5E9',
                icon: Droplets
            });
        }

        return list;
    }, [vitals, patient, t]);

    const [loading, setLoading] = useState(true);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLogging, setIsLogging] = useState(false);
    const [formValues, setFormValues] = useState({
        heart_rate: '', systolic: '', diastolic: '', oxygen_saturation: '', hydration: '',
    });
    const [formError, setFormError] = useState(null);
    const [submitLoading, setSubmitLoading] = useState(false);

    // ── Sprint C Animation Refs ──────────────────────────────────────────────
    const orbScaleAnim = useRef(new Animated.Value(1)).current;
    const glowOpacityAnim = useRef(new Animated.Value(0)).current;
    const prevScoreRef = useRef(null);

    // Mood picker transition
    const moodFadeAnim = useRef(new Animated.Value(1)).current;
    const thanksFadeAnim = useRef(new Animated.Value(0)).current;

    // Medications card scaling
    const medsCardScaleAnim = useRef(new Animated.Value(1)).current;
    const prevMedsCompletedRef = useRef(null);

    // Coach card insight cross-fade & slide
    const coachFadeAnim = useRef(new Animated.Value(1)).current;
    const coachSlideAnim = useRef(new Animated.Value(0)).current;
    const [displayInsight, setDisplayInsight] = useState('');
    const [medsExpanded, setMedsExpanded] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Today's Insights Sliding Carousel State & Constants
    const [activeInsightIndex, setActiveInsightIndex] = useState(0);
    const insightScrollViewRef = useRef(null);
    const slideWidth = SW - 40 - 44; // cardWidth (SW - 40) - card padding (44)

    // Mood states
    const [moodLogged, setMoodLogged] = useState(false);
    const [selectedMood, setSelectedMood] = useState(null);
    const [moodSaving, setMoodSaving] = useState(false);

    const checkDailyMoodStatus = useCallback(() => {
        if (!patient?.moodHistory) return;
        const timezone = patient.timezone || 'Asia/Kolkata';
        try {
            const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
            const loggedToday = patient.moodHistory.find(m => {
                if (!m.date) return false;
                const dStr = new Date(m.date).toLocaleDateString('en-CA', { timeZone: timezone });
                return dStr === todayStr;
            });
            if (loggedToday) {
                setMoodLogged(true);
                setSelectedMood(loggedToday.value || loggedToday.mood);
                thanksFadeAnim.setValue(1);
            } else {
                setMoodLogged(false);
                setSelectedMood(null);
                moodFadeAnim.setValue(1);
            }
        } catch (e) {
            console.warn('Check daily mood error:', e.message);
        }
    }, [patient]);

    const saveDailyMood = async (moodValue) => {
        if (moodSaving) return;
        setMoodSaving(true);
        HapticPatterns.log();

        // Optimistic state switch FIRST — React immediately renders the thanks view
        setMoodLogged(true);
        setSelectedMood(moodValue);

        // Cross-fade: picker fades out + thanks fades in simultaneously (no blank gap)
        thanksFadeAnim.setValue(0);
        Animated.parallel([
            Animated.timing(moodFadeAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.timing(thanksFadeAnim, {
                toValue: 1,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start();

        try {
            const { data } = await apiService.patients.logMood(moodValue);
            if (data?.success) {
                // Delayed fetch to sync new live coach card data
                setTimeout(async () => {
                    await fetchData(true);
                }, 1500);
            } else {
                revertMoodCheckin();
            }
        } catch (err) {
            console.warn('Failed to log mood to backend:', err.message);
            revertMoodCheckin();
        } finally {
            setMoodSaving(false);
        }
    };

    const revertMoodCheckin = () => {
        // Fade out thanks card and restore picker if request failed
        Animated.timing(thanksFadeAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
        }).start(() => {
            setMoodLogged(false);
            setSelectedMood(null);
            moodFadeAnim.setValue(0);
            Animated.timing(moodFadeAnim, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }).start();
        });
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchData(true);
        setRefreshing(false);
    }, [fetchData]);

    const [syncStatus, setSyncStatus] = useState({
        enabled: false, connected: false, lastSync: null, readingsToday: 0, syncing: false,
    });

    const staggerAnims = useRef([...Array(10)].map(() => new Animated.Value(0))).current;

    const runAnimations = useCallback(() => {
        staggerAnims.forEach(a => a.setValue(0));
        Animated.stagger(80,
            staggerAnims.map(a => Animated.spring(a, { toValue: 1, friction: 8, tension: 42, useNativeDriver: true }))
        ).start();
    }, [staggerAnims]);

    const skipCacheRef = useRef(false);

    const fetchData = useCallback(async (skipCache = false) => {
        try {
            const promises = [
                storeFetchDashboard(skipCache),
                apiService.patients.getNotificationsUnreadCount()
                    .then(res => setUnreadCount(res.data?.count || 0))
                    .catch(() => {})
            ];
            if (skipCache) {
                promises.push(storeFetchMedications().catch(() => {}));
            }
            const [result] = await Promise.all(promises);
            if (result) {
                try {
                    const medsToSync = result.meds || [];
                    const medPrefs = result.patient?.medication_call_preferences || {};
                    let daysLeft = null;
                    if (result.patient?.subscription?.expires_at) {
                        daysLeft = Math.ceil((new Date(result.patient.subscription.expires_at) - new Date()) / (1000 * 60 * 60 * 24));
                    }
                    syncAllSchedules(medsToSync, medPrefs, daysLeft, !!result.vitals);
                } catch (notifErr) {
                    console.warn('Notification scheduling error:', notifErr.message);
                }
            }
        } finally {
            setLoading(false);
        }
    }, [storeFetchDashboard, storeFetchMedications]);

    const handleLogVitals = async () => {
        setFormError(null);
        const hr = Number(formValues.heart_rate);
        const sys = Number(formValues.systolic);
        const dia = Number(formValues.diastolic);
        const o2 = Number(formValues.oxygen_saturation);
        const hyd = Number(formValues.hydration);
        if (!hr || !sys || !dia || !o2 || !hyd) {
            setFormError('All fields are required.');
            return;
        }
        try {
            setSubmitLoading(true);
            await apiService.patients.logVitals({
                date: new Date().toISOString(),
                heart_rate: hr,
                blood_pressure: { systolic: sys, diastolic: dia },
                oxygen_saturation: o2,
                hydration: hyd,
            });
            HapticPatterns.log();
            setIsLogging(false);
            setFormValues({ heart_rate: '', systolic: '', diastolic: '', oxygen_saturation: '', hydration: '' });
            DeviceEventEmitter.emit('VITALS_UPDATED');
            await fetchData(true);
        } catch (err) {
            setFormError(handleAxiosError(err));
        } finally {
            setSubmitLoading(false);
        }
    };

    const hasAnimated = useRef(false);
    useFocusEffect(
        useCallback(() => {
            const task = InteractionManager.runAfterInteractions(() => {
                fetchData(skipCacheRef.current).then(() => {
                    skipCacheRef.current = true;
                    if (!hasAnimated.current) {
                        hasAnimated.current = true;
                        runAnimations();
                    }
                });
                apiService.patients.getNotificationsUnreadCount()
                    .then(res => setUnreadCount(res.data?.count || 0))
                    .catch(() => {});
            });
            const interval = setInterval(() => fetchData(true), 120000);
            return () => { task.cancel(); clearInterval(interval); };
        }, [fetchData, runAnimations])
    );

    useEffect(() => {
        const initSync = async () => {
            const status = await HealthSyncService.getStatus();
            setSyncStatus(status);
            if (status.enabled && status.connected) await HealthSyncService.initialize();
        };
        initSync();
        const unsub = HealthSyncService.addListener((update) => {
            setSyncStatus(prev => ({ ...prev, ...update }));
            if (update.totalAccepted > 0) fetchData(true);
        });
        return () => unsub();
    }, [fetchData]);

    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState === 'active') {
                setNow(new Date());
            }
        });
        return () => subscription.remove();
    }, []);

    // Sync mood state when patient data changes
    useEffect(() => {
        checkDailyMoodStatus();
    }, [patient, checkDailyMoodStatus]);

    const openPremium = () => {
        const isRenewal = !!patient?.subscription?.expires_at;
        navigation.navigate('PremiumShowcase', { isRenewal });
    };

    useEffect(() => {
        const checkPremiumPopup = async () => {
            if (daysPremiumRemaining <= 7 && daysPremiumRemaining > 0) {
                try {
                    const lastPrompt = await AsyncStorage.getItem('last_premium_prompt');
                    const today = new Date().toDateString();
                    if (lastPrompt !== today) {
                        await AsyncStorage.setItem('last_premium_prompt', today);
                        setTimeout(() => openPremium(), 1500);
                    }
                } catch (e) { console.error('Premium prompt error', e); }
            }
        };
        if (!loading) {
            checkPremiumPopup();
        }
    }, [daysPremiumRemaining, loading]);

    // ── Derived values ─────────────────────────────────────────────────────
    const takenCount = meds.filter(m => m.taken).length;
    const totalMeds = meds.length;
    const adherencePct = totalMeds > 0 ? Math.round((takenCount / totalMeds) * 100) : 0;
    const medicationStreak = patient?.patient_health_state?.adherence?.streak ?? adherenceDetails?.streak ?? 0;
    const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    const firstName = (patient?.name || displayName)?.split(' ')[0] || 'there';

    let daysPremiumRemaining = 0;
    if (patient?.subscription?.expires_at) {
        const diff = new Date(patient.subscription.expires_at) - new Date();
        daysPremiumRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    // ── The Morning/Evening Brief (Dynamic Context) ──
    const getDynamicBrief = () => {
        const h = now.getHours();
        const isMorning = h >= 5 && h < 12;
        const isEvening = h >= 18 && h <= 23;

        const dailyLog = adherenceDetails?.daily_log || [];
        let yesterdayPct = null;
        if (dailyLog.length >= 2) {
            const yLog = dailyLog[dailyLog.length - 2];
            if (yLog && yLog.total > 0) {
                yesterdayPct = Math.round((yLog.taken / yLog.total) * 100);
            }
        }

        const scheduledToday = totalMeds;
        const takenToday = takenCount;
        const incompleteToday = scheduledToday - takenToday;

        if (isMorning) {
            if (yesterdayPct === 100) {
                return { greeting: t('home.brief_morning_good', { defaultValue: 'Good morning,' }), sub: t('home.brief_morning_perfect', { defaultValue: `Yesterday was perfect. You have ${scheduledToday} medication${scheduledToday !== 1 ? 's' : ''} this morning.` }) };
            } else if (yesterdayPct !== null && yesterdayPct < 100) {
                return { greeting: t('home.brief_morning_fresh', { defaultValue: `Good morning,` }), sub: t('home.brief_morning_restart', { defaultValue: `Today's a fresh start. ${scheduledToday} medication${scheduledToday !== 1 ? 's' : ''} scheduled this morning.` }) };
            } else {
                return { greeting: t('home.brief_morning_good', { defaultValue: 'Good morning,' }), sub: t('home.brief_morning_build', { defaultValue: "Let's build a good day." }) };
            }
        } else if (isEvening) {
            if (scheduledToday > 0 && incompleteToday === 0) {
                return { greeting: t('home.brief_evening_winding', { defaultValue: 'Winding down,' }), sub: t('home.brief_evening_perfect', { defaultValue: "Everything's logged for today. Rest well." }) };
            } else if (scheduledToday > 0 && incompleteToday > 0) {
                return { greeting: t('home.brief_evening_greeting', { defaultValue: `Evening,` }), sub: t('home.brief_evening_almost', { defaultValue: `${incompleteToday} more medication${incompleteToday !== 1 ? 's' : ''} before bed — nearly there.` }) };
            } else {
                return { greeting: t('home.brief_evening_good', { defaultValue: 'Good evening,' }), sub: t('home.brief_evening_checkin', { defaultValue: 'How are you feeling today?' }) };
            }
        } else {
            return {
                greeting: t('home.brief_afternoon', { defaultValue: `Good afternoon,` }),
                sub: scheduledToday > 0 ? (incompleteToday === 0 ? t('home.brief_all_done', { defaultValue: 'All done for today! 🎉' }) : t('home.brief_left', { defaultValue: `${incompleteToday} left today.` })) : t('home.brief_hope_good', { defaultValue: "Hope you're having a good day." })
            };
        }
    };
    const brief = getDynamicBrief();

    const getNextDose = () => {
        const hour = new Date().getHours();
        const prefs = patient?.medication_call_preferences || {};
        const pending = meds.filter(m => !m.taken);
        if (pending.length === 0) return null;
        const slots = ['morning', 'afternoon', 'evening', 'night'];
        const slotEndHours = { morning: 11, afternoon: 16, evening: 19, night: 24 };
        const timeLabels = { morning: t('time_slots.morning', { defaultValue: 'Morning' }), afternoon: t('time_slots.afternoon', { defaultValue: 'Afternoon' }), evening: t('time_slots.evening', { defaultValue: 'Evening' }), night: t('time_slots.night', { defaultValue: 'Night' }) };
        for (const s of slots) {
            if (hour < (slotEndHours[s] || 24)) {
                const slotPending = pending.filter(m => m.type === s);
                if (slotPending.length > 0)
                    return { slot: timeLabels[s] || s, time: prefs[s] || '', count: slotPending.length };
            }
        }
        return { slot: t('home.later', { defaultValue: 'Later' }), time: '', count: pending.length };
    };
    const nextDose = getNextDose();

    const adherenceColor = adherencePct >= 80 ? '#10B981' : adherencePct >= 50 ? '#F59E0B' : '#EF4444';
    const hasContextualAlerts = !vitals || meds.some(m => !m.taken);

    const anim = (i) => ({
        opacity: staggerAnims[i],
        transform: [{ translateY: staggerAnims[i].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
    });

    const isNewUser = totalMeds === 0 && vitalsHistory.length === 0 && medicationStreak === 0;
    const hasVitalsToday = vitals?.heart_rate || vitals?.blood_pressure?.systolic || vitals?.oxygen_saturation != null || vitals?.hydration != null;

    // ── Unified Health Score from Backend ──
    const healthScore = patient?.patient_health_state?.score ?? patient?.health_score?.score ?? patient?.healthScoreCache ?? 82;
    const healthLabel = patient?.patient_health_state?.label ?? patient?.health_score?.label ?? t('health_profile.status_stable', { defaultValue: 'Excellent' });
    const healthGrade = patient?.patient_health_state?.grade ?? patient?.health_score?.grade ?? 'A';
    const healthColor = patient?.patient_health_state?.color ?? patient?.health_score?.color ?? '#10B981';

    const prevScore = Math.max(50, healthScore - 6);
    const scoreDiff = healthScore - prevScore;

    const targetMilestone = Math.min(100, Math.ceil(healthScore / 5) * 5 + (healthScore % 5 === 0 ? 5 : 0));
    const milestoneProgress = healthScore / targetMilestone;

    // ── Sprint C Animation Effects ───────────────────────────────────────────
    // Health Orb Spring & Glow Pulse
    useEffect(() => {
        if (prevScoreRef.current !== null && healthScore > prevScoreRef.current) {
            HapticPatterns.milestone();
            Animated.parallel([
                Animated.sequence([
                    Animated.spring(orbScaleAnim, {
                        toValue: 1.08,
                        friction: 3,
                        tension: 40,
                        useNativeDriver: true
                    }),
                    Animated.spring(orbScaleAnim, {
                        toValue: 1,
                        friction: 5,
                        tension: 40,
                        useNativeDriver: true
                    })
                ]),
                Animated.sequence([
                    Animated.timing(glowOpacityAnim, {
                        toValue: 0.8,
                        duration: 200,
                        useNativeDriver: true
                    }),
                    Animated.timing(glowOpacityAnim, {
                        toValue: 0,
                        duration: 400,
                        useNativeDriver: true
                    })
                ])
            ]).start();
        }
        prevScoreRef.current = healthScore;
    }, [healthScore]);

    // Perfect Day Card Scale (Adherence complete)
    useEffect(() => {
        const isCompleted = totalMeds > 0 && adherencePct === 100;
        if (prevMedsCompletedRef.current !== null && isCompleted && !prevMedsCompletedRef.current) {
            HapticPatterns.allDone();
            Animated.sequence([
                Animated.spring(medsCardScaleAnim, {
                    toValue: 1.03,
                    friction: 3,
                    tension: 40,
                    useNativeDriver: true,
                }),
                Animated.spring(medsCardScaleAnim, {
                    toValue: 1,
                    friction: 5,
                    tension: 40,
                    useNativeDriver: true,
                }),
            ]).start();
        }
        prevMedsCompletedRef.current = isCompleted;
    }, [adherencePct, totalMeds]);

    // Coach Card Insight text transition
    const targetInsightText = useMemo(() => {
        if (patient?.patient_health_state?.coach?.insight) {
            return patient.patient_health_state.coach.insight;
        }
        if (activeInsights.length > 0) {
            return activeInsights[0].desc;
        }
        if (selectedMood === 'sad') {
            return t('home.insight_sad_fallback', {
                defaultValue: `Sorry you are feeling down today, ${firstName}. Let's focus on small wins: take your medications and drink a warm cup of water.`,
                name: firstName
            });
        }
        return t('home.insight_default_fallback', {
            defaultValue: `All your tracked indicators look outstanding, ${firstName}! Your consistency this week has been excellent. Keep up the good work.`,
            name: firstName
        });
    }, [patient?.patient_health_state?.coach?.insight, activeInsights, selectedMood, firstName, t]);

    // Dynamic Slide Insights for Carousel
    const slideInsights = useMemo(() => {
        // Slide 1: Medication Consistency
        let medInsight = '';
        const incomplete = totalMeds - takenCount;
        if (totalMeds === 0) {
            medInsight = t('home.insight_no_meds', { defaultValue: "No medications scheduled for today. Keep checking your dashboard for updates." });
        } else if (incomplete === 0) {
            medInsight = t('home.insight_all_taken', { defaultValue: "You have taken all medications today! Outstanding consistency." });
        } else if (incomplete === 1) {
            medInsight = t('home.insight_one_left', { defaultValue: "Only one medication remains for today. Let's get it done!" });
        } else {
            medInsight = t('home.insight_adherence_fallback', { defaultValue: "Pairing medications with daily routines like meals helps build consistency." });
        }

        // Slide 2: Vitals Pulse
        let vitalsInsight = '';
        if (activeInsights.length > 0) {
            vitalsInsight = activeInsights[0].desc;
        } else {
            vitalsInsight = t('home.insight_vitals_stable', { defaultValue: "Your vitals (Heart Rate & Blood Pressure) are within normal, stable ranges today." });
        }

        // Slide 3: Wellness & Mindset
        let wellnessInsight = '';
        if (selectedMood === 'sad') {
            wellnessInsight = t('home.insight_sad_fallback', {
                defaultValue: `Sorry you are feeling down today, ${firstName}. Let's focus on small wins: take your medications and drink a warm cup of water.`,
                name: firstName
            });
        } else {
            wellnessInsight = t('home.insight_default_fallback', {
                defaultValue: `All your tracked indicators look outstanding, ${firstName}! Your consistency this week has been excellent. Keep up the good work.`,
                name: firstName
            });
        }

        return [
            {
                id: 'meds',
                title: t('home.insight_meds_title', { defaultValue: "Medication Consistency" }),
                desc: medInsight,
                icon: Pill,
                iconColor: '#34D399',
            },
            {
                id: 'vitals',
                title: t('home.insight_vitals_title', { defaultValue: "Vitals Pulse" }),
                desc: vitalsInsight,
                icon: Activity,
                iconColor: '#60A5FA',
            },
            {
                id: 'wellness',
                title: t('home.insight_wellness_title', { defaultValue: "Daily Wellness" }),
                desc: wellnessInsight,
                icon: Sparkles,
                iconColor: '#C084FC',
            }
        ];
    }, [totalMeds, takenCount, activeInsights, selectedMood, firstName, t]);

    useEffect(() => {
        if (!displayInsight) {
            setDisplayInsight(targetInsightText);
            coachFadeAnim.setValue(1);
            coachSlideAnim.setValue(0);
            return;
        }
        if (displayInsight !== targetInsightText) {
            Animated.parallel([
                Animated.timing(coachFadeAnim, {
                    toValue: 0,
                    duration: 120,
                    useNativeDriver: true,
                }),
                Animated.timing(coachSlideAnim, {
                    toValue: -8,
                    duration: 120,
                    useNativeDriver: true,
                })
            ]).start(() => {
                setDisplayInsight(targetInsightText);
                Animated.parallel([
                    Animated.timing(coachFadeAnim, {
                        toValue: 1,
                        duration: 130,
                        useNativeDriver: true,
                    }),
                    Animated.timing(coachSlideAnim, {
                        toValue: 0,
                        duration: 130,
                        useNativeDriver: true,
                    })
                ]).start();
            });
        }
    }, [targetInsightText]);

    const hrHistory = useMemo(() => {
        return (vitalsHistory || [])
            .map(v => Number(v.heart_rate))
            .filter(v => !isNaN(v) && v > 0)
            .slice(-7);
    }, [vitalsHistory]);

    const bpHistory = useMemo(() => {
        return (vitalsHistory || [])
            .map(v => Number(v.blood_pressure?.systolic ?? v.systolic))
            .filter(v => !isNaN(v) && v > 0)
            .slice(-7);
    }, [vitalsHistory]);

    const spo2History = useMemo(() => {
        return (vitalsHistory || [])
            .map(v => Number(v.oxygen_saturation))
            .filter(v => !isNaN(v) && v > 0)
            .slice(-7);
    }, [vitalsHistory]);

    const hydHistory = useMemo(() => {
        return (vitalsHistory || [])
            .map(v => Number(v.hydration))
            .filter(v => !isNaN(v) && v > 0)
            .slice(-7);
    }, [vitalsHistory]);

    // ── 1. Priority Greeting Selection Engine ──
    const getAdaptiveGreeting = () => {
        const incomplete = totalMeds - takenCount;
        
        // Priority 1: Perfect Day (all meds completed)
        if (totalMeds > 0 && incomplete === 0) {
            const h = now.getHours();
            const isMorning = h >= 5 && h < 12;
            return isMorning ? `🏆 Perfect morning, ${firstName}!` : `🏆 Perfect day so far, ${firstName}!`;
        }
        
        // Priority 2: Active Consistency Streak
        if (medicationStreak >= 3) {
            return `🔥 ${medicationStreak} Day Streak, ${firstName}!`;
        }

        // Priority 3: Score Improvement
        if (scoreDiff > 0) {
            return `📈 Health score is up, ${firstName}!`;
        }

        // Priority 4: Final Medication Remaining
        if (incomplete === 1) {
            return `⚡ One medication left, ${firstName}!`;
        }

        // Priority 5: Standard Context Greeting (time of day)
        return `${brief.greeting} ${firstName} 👋`;
    };
    const adaptiveGreeting = getAdaptiveGreeting();

    // ── 2. Dynamic Rotating Subtitle under greeting ──
    const getHeaderSubtitle = () => {
        if (!moodLogged) {
            return "Today's mood check-in pending";
        }
        if (scoreDiff > 0) {
            return `Your health score is up by +${scoreDiff} this month`;
        }
        if (nextDose) {
            return `Next medication: ${nextDose.slot} (${nextDose.time})`;
        }
        if (takenCount > 0) {
            return `${takenCount} medication${takenCount > 1 ? 's' : ''} completed today`;
        }
        return "Your wellness tracker is active";
    };
    const headerSubtitle = getHeaderSubtitle();

    // ── Vitals Form (recovered) ─────────────────────────────────────────────
    const renderVitalsForm = (isInline) => {
        return (
            <View style={{ marginTop: isInline ? 0 : 20 }}>
                {formError && (
                    <View style={styles.errorBanner}>
                        <AlertTriangle size={15} color="#DC2626" />
                        <Text style={styles.errorText}>{formError}</Text>
                    </View>
                )}
                <View style={styles.formRow}>
                    <View style={{ flex: 1 }}>
                        <SmartInput ref={isInline ? heartRateInputRef : undefined} label={t('home.heart_rate_label', { defaultValue: 'Heart Rate (bpm)' })} keyboardType="numeric" placeholder="72"
                            value={formValues.heart_rate} onChangeText={(text) => setFormValues(p => ({ ...p, heart_rate: text }))} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <SmartInput label={t('home.o2_label', { defaultValue: 'O₂ Saturation (%)' })} keyboardType="numeric" placeholder="98"
                            value={formValues.oxygen_saturation} onChangeText={(text) => setFormValues(p => ({ ...p, oxygen_saturation: text }))} />
                    </View>
                </View>
                <View style={styles.formRow}>
                    <View style={{ flex: 1 }}>
                        <SmartInput label={t('home.systolic_label', { defaultValue: 'Systolic (mmHg)' })} keyboardType="numeric" placeholder="120"
                            value={formValues.systolic} onChangeText={(text) => setFormValues(p => ({ ...p, systolic: text }))} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <SmartInput label={t('home.diastolic_label', { defaultValue: 'Diastolic (mmHg)' })} keyboardType="numeric" placeholder="80"
                            value={formValues.diastolic} onChangeText={(text) => setFormValues(p => ({ ...p, diastolic: text }))} />
                    </View>
                </View>
                <SmartInput label={t('home.hydration_label', { defaultValue: 'Hydration (%)' })} keyboardType="numeric" placeholder="65"
                    value={formValues.hydration} onChangeText={(text) => setFormValues(p => ({ ...p, hydration: text }))} />
                <Pressable style={styles.submitBtn} onPress={handleLogVitals} disabled={submitLoading}>
                    <LinearGradient colors={['#818CF8', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
                    {submitLoading
                        ? <ActivityIndicator color="#FFF" />
                        : <Text style={styles.submitBtnText}>{t('home.save_record', { defaultValue: 'Save Record' })}</Text>
                    }
                </Pressable>
            </View>
        );
    };

    // ── Loading skeleton ─────────────────────────────────────────────────────
    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
                <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
                <View style={styles.skeletonHeader}>
                    <View style={{ paddingHorizontal: 24 }}>
                        <SkeletonItem width={180} height={28} borderRadius={10} style={{ marginBottom: 8 }} />
                        <SkeletonItem width={240} height={14} borderRadius={6} style={{ marginBottom: 28 }} />
                    </View>
                </View>
                <View style={{ flex: 1, padding: 20, gap: 14 }}>
                    <View style={{ alignItems: 'center', marginVertical: 10 }}>
                        <SkeletonItem width={210} height={210} borderRadius={105} />
                    </View>
                    <SkeletonItem width="100%" height={80} borderRadius={24} />
                    <SkeletonItem width="100%" height={60} borderRadius={20} />
                    <SkeletonItem width="100%" height={140} borderRadius={24} />
                    <SkeletonItem width="100%" height={80} borderRadius={24} />
                </View>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
                <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

                {/* ── HEADER ── */}
                <View style={styles.header}>
                    <View style={styles.mainHeaderRow}>
                        <View style={{ flex: 1, paddingRight: 16 }}>
                            <Text style={styles.greetingName}>{adaptiveGreeting}</Text>
                            <Text style={styles.headerSubtext}>{headerSubtitle}</Text>
                        </View>
                        <View style={styles.headerActions}>
                            <Pressable style={styles.headerIconBtn} onPress={() => navigation.navigate('Notifications')}>
                                <Bell size={20} color="#475569" strokeWidth={2.5} />
                                {(unreadCount > 0 || hasContextualAlerts) && <View style={styles.bellDot} />}
                            </Pressable>
                            <TouchableOpacity activeOpacity={0.85} style={styles.avatarBtn} onPress={() => navigation.navigate('Profile')}>
                                <Text style={styles.avatarText}>{displayName?.charAt(0) || 'U'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* ── SCROLLABLE CONTAINER ── */}
                <ScrollView
                    ref={scrollViewRef}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
                >
                    {/* Pills Row */}
                    <Animated.View style={[anim(0), { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }]}>
                        <View style={styles.datePill}>
                            <CalendarDays size={12} color="#94A3B8" />
                            <Text style={styles.dateText}>{dateStr}</Text>
                        </View>
                        <Pressable onPress={() => navigation.navigate('LocationSearch')} style={[styles.locationPill, { flex: 1 }]}>
                            <View style={styles.locationDot}>
                                <MapPin size={10} color="#FFF" fill="#FFF" />
                            </View>
                            <Text style={styles.locationText} numberOfLines={1}>
                                {patient?.city || profile?.city || t('home.detecting', { defaultValue: 'Detecting...' })}
                            </Text>
                            <ChevronRight size={12} color="#94A3B8" style={{ marginLeft: 'auto' }} />
                        </Pressable>
                    </Animated.View>

                    {daysPremiumRemaining <= 0 && (
                        <Pressable style={styles.premiumBanner} onPress={() => openPremium()}>
                            <View style={styles.premiumBannerLeft}>
                                <View style={styles.premiumBannerIcon}>
                                    <Sparkles size={18} color="#A855F7" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.premiumBannerTitle}>Premium Expired</Text>
                                    <Text style={styles.premiumBannerSub}>Your AI health insights are paused until renewal.</Text>
                                </View>
                            </View>
                            <ChevronRight size={20} color="#CBD5E1" />
                        </Pressable>
                    )}

                    {/* Offline Banner */}
                    {isCached && (
                        <View style={styles.offlineBanner}>
                            <WifiOff size={13} color="#92400E" />
                            <Text style={styles.offlineBannerText}>{t('home.offline_banner', { defaultValue: 'Showing cached data · Pull to refresh' })}</Text>
                        </View>
                    )}

                    {/* ── 1. GLASS HEALTH ORB (Brand Focus, 60% Width) ── */}
                    <Animated.View style={[anim(1), styles.orbContainer]}>
                        <Animated.View style={[styles.orbWrapper, { transform: [{ scale: orbScaleAnim }] }]}>
                            <Svg width={210} height={210} viewBox="0 0 200 200" style={styles.orbSvg}>
                                <Defs>
                                    <SvgLinearGradient id="orbGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <Stop offset="0%" stopColor="#818CF8" stopOpacity={0.15} />
                                        <Stop offset="100%" stopColor="#A855F7" stopOpacity={0.03} />
                                    </SvgLinearGradient>
                                    <SvgLinearGradient id="progressRingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <Stop offset="0%" stopColor="#818CF8" />
                                        <Stop offset="50%" stopColor="#6366F1" />
                                        <Stop offset="100%" stopColor="#A855F7" />
                                    </SvgLinearGradient>
                                </Defs>
                                <SvgCircle cx="100" cy="100" r="86" fill="url(#orbGlowGrad)" />
                                <SvgCircle cx="100" cy="100" r="90" stroke="#F1F5F9" strokeWidth="6" fill="transparent" />
                                <SvgCircle
                                    cx="100"
                                    cy="100"
                                    r="90"
                                    stroke="url(#progressRingGrad)"
                                    strokeWidth="6"
                                    fill="transparent"
                                    strokeDasharray="565.48"
                                    strokeDashoffset={565.48 - (565.48 * healthScore) / 100}
                                    strokeLinecap="round"
                                    transform="rotate(-90 100 100)"
                                />
                            </Svg>

                            {/* Active Glow Pulse Overlay */}
                            <Animated.View style={[StyleSheet.absoluteFill, { opacity: glowOpacityAnim, pointerEvents: 'none' }]}>
                                <Svg width={210} height={210} viewBox="0 0 200 200" style={styles.orbSvg}>
                                    <Defs>
                                        <SvgLinearGradient id="activeGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <Stop offset="0%" stopColor={healthColor} stopOpacity={0.45} />
                                            <Stop offset="100%" stopColor={healthColor} stopOpacity={0.05} />
                                        </SvgLinearGradient>
                                    </Defs>
                                    <SvgCircle cx="100" cy="100" r="95" fill="url(#activeGlowGrad)" />
                                </Svg>
                            </Animated.View>

                            <View style={styles.glassOrb}>
                                <Text style={styles.orbScoreText}>{healthScore}</Text>
                                <Text style={[styles.orbLabelText, { color: healthColor }]}>{healthLabel.toUpperCase()}</Text>
                                
                                <View style={[styles.orbGradeBadge, { backgroundColor: healthColor + '10', borderColor: healthColor + '30' }]}>
                                    <Text style={[styles.orbGradeText, { color: healthColor }]}>{healthGrade}</Text>
                                </View>
                            </View>
                        </Animated.View>
                        
                        <Text style={styles.orbNextDose}>
                            {nextDose
                                ? `${t('home.next_dose', { slot: nextDose.slot, defaultValue: `Next Dose: ${nextDose.slot}` })}${nextDose.time ? ` (${nextDose.time})` : ''}`
                                : t('home.all_done_today', { defaultValue: 'All medications completed! 🎉' })
                            }
                        </Text>
                    </Animated.View>

                    {/* ── 2. DAILY CHECK-IN (Directly under the Orb) ── */}
                    <Animated.View style={[anim(2), styles.section]}>
                        <View style={styles.checkinCard}>
                            {!moodLogged ? (
                                <Animated.View style={{ opacity: moodFadeAnim }}>
                                    <Text style={styles.checkinTitle}>{t('home.how_are_feeling', { defaultValue: 'How are you feeling today?' })}</Text>
                                    <View style={styles.moodEmojiRow}>
                                        <Pressable style={styles.moodEmojiPill} onPress={() => saveDailyMood('sad')}>
                                            <Text style={styles.moodEmoji}>😞</Text>
                                            <Text style={styles.moodLabel}>Low</Text>
                                        </Pressable>
                                        <Pressable style={styles.moodEmojiPill} onPress={() => saveDailyMood('okay')}>
                                            <Text style={styles.moodEmoji}>😐</Text>
                                            <Text style={styles.moodLabel}>Okay</Text>
                                        </Pressable>
                                        <Pressable style={styles.moodEmojiPill} onPress={() => saveDailyMood('good')}>
                                            <Text style={styles.moodEmoji}>🙂</Text>
                                            <Text style={styles.moodLabel}>Good</Text>
                                        </Pressable>
                                        <Pressable style={styles.moodEmojiPill} onPress={() => saveDailyMood('great')}>
                                            <Text style={styles.moodEmoji}>😄</Text>
                                            <Text style={styles.moodLabel}>Great</Text>
                                        </Pressable>
                                    </View>
                                </Animated.View>
                            ) : (
                                <Animated.View style={{ opacity: thanksFadeAnim, width: '100%' }}>
                                    <View style={styles.checkinCompleteView}>
                                        <Sparkles size={16} color="#6366F1" style={{ marginRight: 8 }} />
                                        <Text style={styles.checkinCompleteText}>
                                            ✨ Thanks for checking in. Today's insight has been updated.
                                        </Text>
                                        <Text style={styles.selectedMoodBadge}>
                                            {selectedMood === 'sad' ? '😞 Low' : selectedMood === 'okay' ? '😐 Okay' : selectedMood === 'good' ? '🙂 Good' : '😄 Great'}
                                        </Text>
                                    </View>
                                </Animated.View>
                            )}
                        </View>
                    </Animated.View>

                    {/* ── 3. HEALTH PULSE (Instant Reassurance) ── */}
                    <Animated.View style={[anim(3), styles.section]}>
                        <View style={styles.pulseCard}>
                            <View style={styles.pulseHeader}>
                                <Activity size={14} color="#6366F1" />
                                <Text style={styles.pulseTitle}>HEALTH PULSE</Text>
                                <View style={[styles.pulseStatusIndicator, { backgroundColor: activeInsights.length > 0 ? '#FEF2F2' : '#ECFDF5' }]}>
                                    <View style={[styles.pulseStatusDot, { backgroundColor: activeInsights.length > 0 ? '#EF4444' : '#10B981' }]} />
                                    <Text style={[styles.pulseStatusLabel, { color: activeInsights.length > 0 ? '#EF4444' : '#10B981' }]}>
                                        {activeInsights.length > 0 ? 'Attention Needed' : 'Stable Today'}
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.pulseDetailsText}>
                                {activeInsights.length > 0 
                                    ? "Some vitals require attention. View your coach suggestions below."
                                    : 'Heart Rate Normal · BP Normal · Oxygen Saturation Normal'
                                }
                            </Text>
                        </View>
                    </Animated.View>

                    {/* ── 4. TODAY'S INSIGHT (AI Coach Guidance sliding carousel) ── */}
                    <Animated.View style={[anim(4), styles.section]}>
                        <LinearGradient
                            colors={['#1E1B4B', '#312E81']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.insightCard}
                        >
                            <View style={styles.insightHeaderRow}>
                                <View style={styles.insightHeaderLeft}>
                                    <View style={styles.insightIconBox}>
                                        <Sparkles size={16} color="#A855F7" />
                                    </View>
                                    <Text style={styles.insightTitle}>
                                        {slideInsights[activeInsightIndex]?.title || t('common.todays_insight', { defaultValue: "Today's Insight" })}
                                    </Text>
                                </View>
                                <View style={styles.insightBadge}>
                                    <View style={styles.insightBadgeDot} />
                                    <Text style={styles.insightBadgeText}>{t('home.live_coach', { defaultValue: 'LIVE COACH' })}</Text>
                                </View>
                            </View>

                            <ScrollView
                                ref={insightScrollViewRef}
                                horizontal
                                pagingEnabled
                                showsHorizontalScrollIndicator={false}
                                onScroll={(e) => {
                                    const contentOffset = e.nativeEvent.contentOffset.x;
                                    const index = Math.round(contentOffset / slideWidth);
                                    if (index !== activeInsightIndex && index >= 0 && index < slideInsights.length) {
                                        setActiveInsightIndex(index);
                                    }
                                }}
                                scrollEventThrottle={16}
                                style={{ width: slideWidth }}
                                contentContainerStyle={{ alignItems: 'center' }}
                            >
                                {slideInsights.map((slide) => {
                                    const SlideIcon = slide.icon;
                                    return (
                                        <View key={slide.id} style={{ width: slideWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <View style={{ flex: 1, paddingRight: 10 }}>
                                                <Text style={styles.insightDescText}>
                                                    {slide.desc}
                                                </Text>
                                            </View>
                                            <View style={styles.insightIllustration}>
                                                <SlideIcon size={26} color={slide.iconColor} strokeWidth={2} />
                                            </View>
                                        </View>
                                    );
                                })}
                            </ScrollView>

                            <View style={styles.insightDotsRow}>
                                {slideInsights.map((_, index) => (
                                    <TouchableOpacity
                                        key={index}
                                        onPress={() => {
                                            insightScrollViewRef.current?.scrollTo({ x: index * slideWidth, animated: true });
                                            setActiveInsightIndex(index);
                                        }}
                                        style={[
                                            styles.insightDot,
                                            activeInsightIndex === index && styles.insightDotActive
                                        ]}
                                    />
                                ))}
                            </View>
                        </LinearGradient>
                    </Animated.View>

                    {/* ── 6. MEDICATIONS ── */}
                    <Animated.View style={[anim(6), styles.section]}>
                        <View style={styles.sectionTitleRow}>
                            <Text style={styles.sectionTitle}>{t('home.todays_plan', { defaultValue: "TODAY'S PLAN" })}</Text>
                            <Pressable style={styles.viewAllBtn} onPress={() => navigation.navigate('Medications')}>
                                <Text style={styles.viewAllText}>{t('home.view_details', { defaultValue: 'View Details' })}</Text>
                                <ChevronRight size={13} color="#6366F1" />
                            </Pressable>
                        </View>

                        {totalMeds > 0 ? (
                            <Animated.View style={{ transform: [{ scale: medsCardScaleAnim }] }}>
                                <Pressable style={styles.medSummaryCard} onPress={() => setMedsExpanded(!medsExpanded)}>
                                    <LinearGradient
                                        colors={adherencePct === 100 ? ['#22C55E', '#16A34A'] : adherencePct >= 50 ? ['#6366F1', '#4F46E5'] : ['#EF4444', '#DC2626']}
                                        style={styles.medSummaryGradient}
                                    >
                                        <View style={styles.medSummaryMainRow}>
                                            <View style={{ flex: 1 }}>
                                                {adherencePct === 100 ? (
                                                    <Text style={styles.medSummaryStatusTitle}>🏆 Perfect Day!</Text>
                                                ) : (
                                                    <Text style={styles.medSummaryStatusTitle}>🟢 On Track</Text>
                                                )}
                                                <Text style={styles.medSummaryDetails}>{takenCount} of {totalMeds} medications taken</Text>
                                            </View>
                                            <View style={styles.medSummaryPercentage}>
                                                <Text style={styles.medPercentageText}>{adherencePct}%</Text>
                                            </View>
                                        </View>

                                        {/* Progress Bar */}
                                        <View style={styles.medProgressBarBg}>
                                            <View style={[styles.medProgressBarFill, { width: `${adherencePct}%` }]} />
                                        </View>

                                        <View style={styles.medSummaryFooterRow}>
                                            <Text style={styles.medSummaryFooterText}>
                                                {medsExpanded ? t('home.hide', { defaultValue: 'Hide items' }) : t('home.view_details', { defaultValue: 'Tap to view schedule' })}
                                            </Text>
                                            <ChevronDown size={14} color="#FFF" style={{ transform: [{ rotate: medsExpanded ? '180deg' : '0deg' }] }} />
                                        </View>
                                    </LinearGradient>
                                </Pressable>
                            </Animated.View>
                        ) : (
                            <View style={styles.emptyCard}>
                                <View style={styles.emptyIconBox}><Pill size={28} color="#CBD5E1" strokeWidth={1.5} /></View>
                                <Text style={styles.emptyTitle}>{t('common.no_medications_added', { defaultValue: 'No medications added' })}</Text>
                                <Text style={styles.emptySub}>{t('common.meds_empty_desc', { defaultValue: "Your medications will appear here once you add your first one. We'll help you stay on track." })}</Text>
                            </View>
                        )}

                        {medsExpanded && meds.map(med => (
                            <MedicationCard key={med.id} med={med} onPress={() => navigation.navigate('Medications')} />
                        ))}
                    </Animated.View>

                    {/* ── 7. VITALS (Apple Health Style) ── */}
                    <Animated.View
                        style={[anim(7), styles.section]}
                        onLayout={(e) => {
                            vitalsSectionY.current = e.nativeEvent.layout.y;
                        }}
                    >
                        <View style={styles.sectionTitleRow}>
                            <Text style={styles.sectionTitle}>{t('home.vitals', { defaultValue: 'VITALS' })}</Text>
                            <Pressable style={styles.viewAllBtn} onPress={() => navigation.navigate('VitalsHistory')}>
                                <Text style={styles.viewAllText}>{t('home.history', { defaultValue: 'History' })}</Text>
                                <ChevronRight size={13} color="#6366F1" />
                            </Pressable>
                        </View>

                        {/* Wearable sync card */}
                        <Pressable
                            style={[styles.syncCard, syncStatus.connected && styles.syncCardConnected]}
                            onPress={() => navigation.navigate('HealthConnectSetup')}
                        >
                            {syncStatus.connected && (
                                <LinearGradient colors={['#ECFDF5', '#F0FDF4']} style={StyleSheet.absoluteFill} />
                            )}
                            <View style={styles.syncCardLeft}>
                                <View style={[styles.syncIconBox, { backgroundColor: syncStatus.connected ? '#DCFCE7' : '#EEF2FF' }]}>
                                    <Watch size={20} color={syncStatus.connected ? colors.success : '#6366F1'} strokeWidth={2.5} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                        <Text style={styles.syncTitle}>
                                            {syncStatus.connected ? t('home.wearable_connected', { defaultValue: 'Wearable Connected' }) : t('home.connect_wearable', { defaultValue: 'Connect Wearable' })}
                                        </Text>
                                        {syncStatus.syncing && (
                                            <View style={styles.syncingBadge}>
                                                <Zap size={9} color="#D97706" />
                                                <Text style={styles.syncingText}>{t('home.syncing', { defaultValue: 'Syncing' })}</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.syncSub}>
                                        {syncStatus.connected
                                            ? `${syncStatus.readingsToday} ${t('home.readings_today', { defaultValue: 'readings today' })}${syncStatus.lastSync ? ` · ${t('home.last', { defaultValue: 'Last' })}: ` + new Date(syncStatus.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`
                                            : t('home.auto_track', { defaultValue: 'Auto-track vitals from your smartwatch' })}
                                    </Text>
                                </View>
                            </View>
                            
                            {syncStatus.connected ? (
                                <Svg width={50} height={20} viewBox="0 0 50 20" style={{ marginRight: 8 }}>
                                    <Path
                                        d="M 0 10 L 15 10 L 18 2 L 22 18 L 25 10 L 50 10"
                                        fill="none"
                                        stroke="#10B981"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </Svg>
                            ) : (
                                <ChevronRight size={18} color="#CBD5E1" />
                            )}
                        </Pressable>

                        {/* Vitals Grid Row */}
                        {hasVitalsToday ? (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.vitalsScrollContainer}
                            >
                                <VitalsCard
                                    label={t('home.heart_rate', { defaultValue: 'Heart Rate' })}
                                    value={vitals?.heart_rate || '—'}
                                    unit="bpm"
                                    icon={Heart}
                                    color="#EF4444"
                                    status={vitals?.heart_rate ? 'Recorded' : 'Not Logged'}
                                    historyValues={hrHistory}
                                />
                                <VitalsCard
                                    label={t('home.blood_pressure', { defaultValue: 'Blood Pressure' })}
                                    value={vitals?.blood_pressure?.systolic ? `${vitals.blood_pressure.systolic}/${vitals.blood_pressure.diastolic}` : '—'}
                                    unit="mmHg"
                                    icon={Activity}
                                    color="#6366F1"
                                    status={vitals?.blood_pressure?.systolic ? 'Recorded' : 'Not Logged'}
                                    historyValues={bpHistory}
                                />
                                <VitalsCard
                                    label={t('home.oxygen_saturation', { defaultValue: 'Oxygen Saturation' })}
                                    value={vitals?.oxygen_saturation != null ? `${vitals.oxygen_saturation}` : '—'}
                                    unit="%"
                                    icon={Wind}
                                    color="#10B981"
                                    status={vitals?.oxygen_saturation != null ? 'Recorded' : 'Not Logged'}
                                    historyValues={spo2History}
                                />
                                <VitalsCard
                                    label={t('home.hydration', { defaultValue: 'Hydration' })}
                                    value={vitals?.hydration != null ? `${vitals.hydration}` : '—'}
                                    unit="%"
                                    icon={Droplets}
                                    color="#0EA5E9"
                                    status={vitals?.hydration != null ? 'Recorded' : 'Not Logged'}
                                    historyValues={hydHistory}
                                />
                            </ScrollView>
                        ) : (
                            <View style={styles.card}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <Text style={styles.cardTitle}>{t('common.today_s_check_in', { defaultValue: "Today's Check-In" })}</Text>
                                </View>
                                {renderVitalsForm(true)}
                            </View>
                        )}

                        {/* Collapsible log vitals row */}
                        {hasVitalsToday && (
                            <View style={[styles.card, { marginTop: 14 }]}>
                                <Pressable
                                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                                    onPress={() => { setIsLogging(!isLogging); setFormError(null); }}
                                >
                                    <Text style={styles.cardTitle}>{t('common.log_today_s_vitals', { defaultValue: "Log Today's Vitals" })}</Text>
                                    <View style={[styles.toggleBadge, isLogging && styles.toggleBadgeCancel]}>
                                        <Text style={[styles.toggleBadgeText, isLogging && { color: '#EF4444' }]}>
                                            {isLogging ? t('common.cancel', { defaultValue: 'Cancel' }) : t('home.add_entry', { defaultValue: '+ Add Entry' })}
                                        </Text>
                                    </View>
                                </Pressable>
                                {isLogging && renderVitalsForm(false)}
                            </View>
                        )}
                    </Animated.View>

                    {/* ── 8. HEALTH JOURNEY & NEXT GOAL ── */}
                    <Animated.View style={[anim(8), styles.section]}>
                        <Pressable onPress={() => navigation.navigate('AdherenceDetails')} style={styles.journeyCard}>
                            <View style={styles.journeyHeader}>
                                <Text style={styles.journeyTitle}>HEALTH JOURNEY</Text>
                                <View style={styles.journeyImprovementBadge}>
                                    <TrendingUp size={12} color="#10B981" />
                                    <Text style={styles.journeyImprovementText}>+{scoreDiff} This Month</Text>
                                </View>
                            </View>

                            <View style={styles.journeyProgressRow}>
                                <Text style={styles.journeyProgressText}>
                                    {prevScore} <Text style={{ color: '#94A3B8' }}>→</Text> {healthScore}
                                </Text>
                                <Text style={styles.journeyConsistencyBadge}>Best Consistency Yet</Text>
                            </View>
                            
                            <Text style={styles.journeyDesc}>
                                Better medication adherence and stable vital trends recorded this week.
                            </Text>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 10 }}>
                                <Text style={{ fontSize: 12, color: '#6366F1', fontWeight: '700' }}>View Adherence Details</Text>
                                <ChevronRight size={12} color="#6366F1" />
                            </View>
                        </Pressable>

                        {/* Relocated Next Goal Card */}
                        <View style={[styles.goalCard, { marginTop: 12 }]}>
                            <View style={styles.goalCardHeader}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <View style={styles.goalIconBox}>
                                        <Trophy size={15} color="#F59E0B" />
                                    </View>
                                    <Text style={styles.goalTitle}>{t('home.next_goal', { defaultValue: 'NEXT GOAL' })}</Text>
                                </View>
                                <Text style={styles.goalProgressValue}>
                                    {healthScore} / {targetMilestone}
                                </Text>
                            </View>
                            
                            <Text style={styles.goalDesc}>Reach Health Score {targetMilestone}</Text>

                            <View style={styles.progressBg}>
                                <LinearGradient
                                    colors={['#FCD34D', '#F59E0B']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={[styles.progressFill, { width: `${milestoneProgress * 100}%` }]}
                                />
                            </View>
                        </View>
                    </Animated.View>

                    {/* ── 9. QUICK ACTIONS (Visually De-emphasized Utility Chips) ── */}
                    <Animated.View style={[anim(9), styles.section]}>
                        <Text style={styles.sectionTitle}>{t('common.quick_actions', { defaultValue: 'QUICK ACTIONS' })}</Text>
                        <View style={styles.deemphasizedActionsRow}>
                            <Pressable style={styles.actionChip} onPress={() => navigation.navigate('AdherenceDetails')}>
                                <TrendingUp size={13} color="#475569" />
                                <Text style={styles.actionChipText}>Adherence</Text>
                            </Pressable>

                            <Pressable style={styles.actionChip} onPress={() => navigation.navigate('Notifications')}>
                                <Bell size={13} color="#475569" />
                                <Text style={styles.actionChipText}>Reminders</Text>
                            </Pressable>

                            <Pressable style={styles.actionChip} onPress={() => navigation.navigate('Chatbot')}>
                                <Sparkles size={13} color="#475569" />
                                <Text style={styles.actionChipText}>Coach</Text>
                            </Pressable>

                            <Pressable style={styles.actionChip} onPress={() => navigation.navigate('Profile')}>
                                <Shield size={13} color="#475569" />
                                <Text style={styles.actionChipText}>Profile</Text>
                            </Pressable>
                        </View>
                    </Animated.View>

                    {/* ── 10. DAILY HEALTH TIP ── */}
                    <Animated.View style={anim(9)}>
                        <View style={styles.section}>
                            <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.tipCard}>
                                <View style={styles.tipHeader}>
                                    <LinearGradient colors={['#818CF8', '#6366F1']} style={styles.tipIconBox}>
                                        <Sparkles size={14} color="#FFF" />
                                    </LinearGradient>
                                    <Text style={styles.tipLabel}>{t('home.daily_health_tip', { defaultValue: 'DAILY HEALTH TIP' })}</Text>
                                </View>
                                <Text style={styles.tipText}>{t('tips.tip_' + getDailyTipIndex(), { defaultValue: HEALTH_TIPS[getDailyTipIndex()] })}</Text>
                            </LinearGradient>
                        </View>
                    </Animated.View>

                    <View style={{ height: 60 }} />
                </ScrollView>
            </View>
        </KeyboardAvoidingView>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// ══ STYLES ═══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
    premiumBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAF5FF', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3E8FF' },
    premiumBannerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    premiumBannerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F3E8FF', alignItems: 'center', justifyContent: 'center' },
    premiumBannerTitle: { fontSize: 15, fontWeight: '800', color: '#6B21A8' },
    premiumBannerSub: { fontSize: 13, color: '#9333EA', fontWeight: '500', marginTop: 2, lineHeight: 18 },

    // ── Skeleton ──
    skeletonHeader: { paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingBottom: 20, backgroundColor: '#F8FAFC', paddingHorizontal: 24 },

    // ── Header ──
    header: {
        paddingTop: Platform.OS === 'ios' ? 60 : 48,
        paddingHorizontal: 24, paddingBottom: 14,
        backgroundColor: '#F8FAFC',
    },
    mainHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    greetingName: { fontSize: 28, fontWeight: '900', color: '#6366F1', letterSpacing: -1 },
    headerSubtext: { fontSize: 13, color: '#94A3B8', marginTop: 2, fontWeight: '600' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerIconBtn: {
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
        alignItems: 'center', justifyContent: 'center',
    },
    bellDot: { position: 'absolute', top: 10, right: 10, width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: '#FFFFFF' },
    avatarBtn: {
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: '#6366F1', borderWidth: 2, borderColor: '#C7D2FE',
        alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { fontSize: 16, fontWeight: '900', color: '#FFFFFF' },
    datePill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03, shadowRadius: 4, elevation: 1
    },
    dateText: { fontSize: 12, color: '#475569', fontWeight: '700' },
    locationPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03, shadowRadius: 4, elevation: 1
    },
    locationDot: {
        width: 16, height: 16, borderRadius: 8,
        backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center',
    },
    locationText: { fontSize: 12, color: '#475569', fontWeight: '700', flex: 1 },

    // ── Glass Health Orb ──
    orbContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 18,
    },
    orbWrapper: {
        width: 210,
        height: 210,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    orbSvg: {
        position: 'absolute',
    },
    glassOrb: {
        width: 168,
        height: 168,
        borderRadius: 84,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.78)',
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.85)',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.16,
        shadowRadius: 20,
        elevation: 8,
        position: 'relative'
    },
    orbScoreText: {
        fontSize: 58,
        fontWeight: '900',
        color: '#0F172A',
        letterSpacing: -2,
    },
    orbLabelText: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1.5,
        marginTop: -4,
    },
    orbGradeBadge: {
        position: 'absolute',
        bottom: 18,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
        borderWidth: 1,
    },
    orbGradeText: {
        fontSize: 11,
        fontWeight: '900',
    },
    orbNextDose: {
        fontSize: 13,
        color: '#64748B',
        fontWeight: '700',
        marginTop: 14,
        textAlign: 'center',
    },

    // ── Daily Check-In ──
    checkinCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.02,
        shadowRadius: 10,
        elevation: 2,
    },
    checkinTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#1E293B',
        marginBottom: 14,
        textAlign: 'center',
    },
    moodEmojiRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
    },
    moodEmojiPill: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
        width: 60,
    },
    moodEmoji: {
        fontSize: 32,
        marginBottom: 4,
    },
    moodLabel: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '700',
    },
    checkinCompleteView: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
    },
    checkinCompleteText: {
        fontSize: 13,
        color: '#312E81',
        fontWeight: '600',
        flex: 1,
    },
    selectedMoodBadge: {
        fontSize: 12,
        fontWeight: '700',
        color: '#6366F1',
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
    },

    // ── Health Pulse Card ──
    pulseCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.01,
        shadowRadius: 6,
        elevation: 1,
    },
    pulseHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    pulseTitle: {
        fontSize: 10,
        fontWeight: '800',
        color: '#94A3B8',
        letterSpacing: 1.2,
    },
    pulseStatusIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        marginLeft: 'auto',
    },
    pulseStatusDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
    },
    pulseStatusLabel: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    pulseDetailsText: {
        fontSize: 13,
        color: '#475569',
        fontWeight: '600',
        lineHeight: 18,
    },

    // ── AI Coach (Today's Insight) ──
    insightCard: {
        borderRadius: 24,
        padding: 22,
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 8,
    },
    insightHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    insightHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    insightIconBox: {
        width: 28,
        height: 28,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    insightTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#E0E7FF',
        letterSpacing: 1,
    },
    insightBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        backgroundColor: '#DCFCE7',
    },
    insightBadgeDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#22C55E',
    },
    insightBadgeText: {
        fontSize: 9,
        fontWeight: '900',
        color: '#16A34A',
        letterSpacing: 0.5,
    },
    insightBody: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    insightDescText: {
        fontSize: 15,
        color: '#FFFFFF',
        lineHeight: 22,
        fontWeight: '500',
    },
    insightIllustration: {
        width: 56,
        height: 56,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    insightDotsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
        marginTop: 18,
    },
    insightDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    insightDotActive: {
        width: 15,
        backgroundColor: '#FFFFFF',
    },

    // ── Next Goal Card ──
    goalCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.02,
        shadowRadius: 10,
        elevation: 2,
    },
    goalCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    goalIconBox: {
        width: 24,
        height: 24,
        borderRadius: 8,
        backgroundColor: '#FEF3C7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    goalTitle: {
        fontSize: 10,
        fontWeight: '800',
        color: '#94A3B8',
        letterSpacing: 1.5,
    },
    goalProgressValue: {
        fontSize: 13,
        fontWeight: '800',
        color: '#475569',
    },
    goalDesc: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 14,
    },
    progressBg: {
        height: 8,
        backgroundColor: '#F1F5F9',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: 8,
        borderRadius: 4,
    },

    // ── Medications Plan ──
    medSummaryCard: {
        borderRadius: 24,
        overflow: 'hidden',
        marginBottom: 14,
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 4,
    },
    medSummaryGradient: {
        padding: 20,
    },
    medSummaryMainRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    medSummaryStatusTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: '#FFFFFF',
    },
    medSummaryDetails: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.85)',
        marginTop: 2,
        fontWeight: '500',
    },
    medSummaryPercentage: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    medPercentageText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '900',
    },
    medProgressBarBg: {
        height: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 14,
    },
    medProgressBarFill: {
        height: 6,
        backgroundColor: '#FFFFFF',
        borderRadius: 3,
    },
    medSummaryFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    medSummaryFooterText: {
        fontSize: 12,
        color: '#FFFFFF',
        fontWeight: '700',
    },

    // ── Vitals Section (Apple Health style) ──
    vitalsGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 14,
    },
    vitalsScrollContainer: {
        flexDirection: 'row',
        gap: 12,
        paddingBottom: 14,
    },
    vitalsCard: {
        width: 165,
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.02,
        shadowRadius: 10,
        elevation: 2,
    },
    vitalsCardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    vitalsIconBox: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    vitalsStatusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 14,
    },
    statusDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
    },
    statusLabel: {
        fontSize: 9,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    vitalsCardLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748B',
    },
    vitalsCardValue: {
        fontSize: 24,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.5,
    },
    vitalsCardUnit: {
        fontSize: 11,
        fontWeight: '600',
        color: '#94A3B8',
    },
    sparklineWrapper: {
        height: 32,
        width: '100%',
        marginVertical: 10,
        justifyContent: 'center',
    },
    vitalsCardFooter: {
        fontSize: 10,
        color: '#94A3B8',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },

    // ── Health Journey ──
    journeyCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.02,
        shadowRadius: 10,
        elevation: 2,
    },
    journeyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    journeyTitle: {
        fontSize: 10,
        fontWeight: '800',
        color: '#94A3B8',
        letterSpacing: 1.5,
    },
    journeyImprovementBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#ECFDF5',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
    },
    journeyImprovementText: {
        fontSize: 11,
        color: '#10B981',
        fontWeight: '800',
    },
    journeyProgressRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    journeyProgressText: {
        fontSize: 26,
        fontWeight: '900',
        color: '#0F172A',
        letterSpacing: -1,
    },
    journeyConsistencyBadge: {
        fontSize: 11,
        color: '#6366F1',
        fontWeight: '800',
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    journeyDesc: {
        fontSize: 13,
        color: '#64748B',
        lineHeight: 18,
        fontWeight: '500',
    },

    // ── De-emphasized Quick Actions (Flat Capsule Chips) ──
    deemphasizedActionsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    actionChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        gap: 6,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    actionChipText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#475569',
    },

    // ── tip card ──
    tipCard: { borderRadius: 22, overflow: 'hidden', padding: 18, borderWidth: 1, borderColor: '#C7D2FE' },
    tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    tipIconBox: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    tipLabel: { fontSize: 11, fontWeight: '800', color: '#6366F1', letterSpacing: 1.2, textTransform: 'uppercase' },
    tipText: { fontSize: 14, color: '#3730A3', lineHeight: 22, fontWeight: '500' },

    // ── Scroll Content ──
    scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: layout.TAB_BAR_CLEARANCE },

    // ── Sections ──
    section: { marginBottom: 20 },
    sectionTitle: {
        fontSize: 11, fontWeight: '800', color: '#94A3B8',
        letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 12,
    },
    sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    viewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    viewAllText: { fontSize: 13, fontWeight: '700', color: '#6366F1' },

    // ── Offline Banner ──
    offlineBanner: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
        backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A',
        borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 16,
    },
    offlineBannerText: { fontSize: 12, fontWeight: '700', color: '#92400E' },

    // ── Mini Med cards ──
    medCard: {
        backgroundColor: '#FFFFFF', borderRadius: 20, marginBottom: 10,
        flexDirection: 'row', overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.04, shadowRadius: 10, elevation: 3,
        borderWidth: 1, borderColor: '#F1F5F9',
    },
    medCardTaken: { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' },
    medAccentBar: { width: 5, flexShrink: 0 },
    medCardContent: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
    medIconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    medName: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 3 },
    medDose: { fontSize: 12, color: '#64748B', fontWeight: '500' },
    takenBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
    takenBadgeText: { fontSize: 10, fontWeight: '700', color: colors.success },

    // ── Sync Card ──
    syncCard: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 16, marginBottom: 14,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 8, elevation: 2,
        overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0',
    },
    syncCardConnected: { borderColor: '#DCFCE7' },
    syncCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 14 },
    syncIconBox: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    syncTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
    syncSub: { fontSize: 12, color: '#64748B', fontWeight: '500' },
    syncingBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF3C7', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
    syncingText: { fontSize: 10, fontWeight: '700', color: '#D97706' },

    // ── Generic Card ──
    card: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.02, shadowRadius: 10, elevation: 2,
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    cardTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
    toggleBadge: { backgroundColor: 'rgba(99,102,241,0.1)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
    toggleBadgeCancel: { backgroundColor: 'rgba(239,68,68,0.08)' },
    toggleBadgeText: { color: '#6366F1', fontSize: 13, fontWeight: '700' },
    formRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
    submitBtn: {
        borderRadius: 18, paddingVertical: 16, alignItems: 'center', marginTop: 20,
        overflow: 'hidden',
        shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
    },
    submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
    errorBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
        borderRadius: 14, padding: 12, marginBottom: 12,
    },
    errorText: { flex: 1, color: '#991B1B', fontSize: 13, fontWeight: '600', lineHeight: 18 },

    // ── Empty State ──
    emptyCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28,
        alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.02, shadowRadius: 10, elevation: 2,
    },
    emptyIconBox: {
        width: 56, height: 56, borderRadius: 18, backgroundColor: '#F1F5F9',
        alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 6, textAlign: 'center' },
    emptySub: { fontSize: 13, color: '#64748B', fontWeight: '500', lineHeight: 19, textAlign: 'center' },

    // ── FLOATING COACH BUTTON ──
    floatingCoachBtn: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        borderRadius: 25,
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 6,
        overflow: 'hidden',
    },
    floatingCoachGradient: {
        paddingHorizontal: 20,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    floatingCoachText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
    },
});
