import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Platform, Pressable, Animated,
    ActivityIndicator, KeyboardAvoidingView, TouchableOpacity,
    DeviceEventEmitter, InteractionManager, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Pill, Package, Sparkles, ChevronRight, TrendingUp, Activity,
    CalendarDays, CheckCircle2, Bell, Heart, Wind, Droplets, MapPin,
    AlertTriangle, WifiOff, Flame, Zap, Watch,
} from 'lucide-react-native';
import { handleAxiosError } from '../../lib/axiosInstance';
import { colors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../lib/api';
import { useFocusEffect } from '@react-navigation/native';
import AIPredictionChart from '../../components/vitals/AIPredictionChart';
import HealthSyncService from '../../services/HealthSyncService';
import { syncAllSchedules } from '../../utils/notifications';
import usePatientStore from '../../store/usePatientStore';
import SmartInput from '../../components/ui/SmartInput';
import AlertManager from '../../utils/AlertManager';

const { width: SW } = Dimensions.get('window');

// ── Constants ──────────────────────────────────────────────────────────────
const HEALTH_TIPS = [
    '💧 Stay hydrated! Drinking 8 glasses of water daily helps manage blood pressure and significantly improves kidney function.',
    '🥗 Eating a handful of leafy greens daily can reduce your risk of heart disease by up to 15%. Your heart will thank you!',
    '🚶 A brisk 20-minute walk after meals helps regulate blood sugar levels — even better than medication for some people.',
    '😴 Aim for 7–8 hours of sleep. Poor sleep raises cortisol, which increases blood pressure and blood sugar levels.',
    '🧘 Just 5 minutes of deep breathing can lower your heart rate by 10–15 bpm. Try box breathing: inhale 4s, hold 4s, exhale 4s.',
    '🫐 Blueberries are a superfood! They contain anthocyanins that improve memory and reduce inflammation. Add them to breakfast.',
    '☀️ 15 minutes of morning sunlight boosts Vitamin D production and helps regulate your circadian rhythm for better sleep.',
    '🥜 A small handful of almonds (about 23) provides your daily magnesium needs, helping reduce muscle cramps and anxiety.',
    '🍌 Bananas are rich in potassium, which helps counteract the effects of sodium on blood pressure. Great as a midday snack!',
    '🫁 Practice the 4-7-8 breathing technique before bed: inhale 4s, hold 7s, exhale 8s. It activates your parasympathetic system.',
    '🥑 Avocados contain healthy monounsaturated fats that help lower LDL cholesterol while raising HDL (the good kind).',
    '🏋️ Even 10 minutes of light stretching in the morning improves circulation and reduces joint stiffness throughout the day.',
    '🍵 Green tea contains L-theanine, which promotes calm alertness without the jitters. Perfect alternative to a second coffee.',
    '🧄 Garlic contains allicin, a compound shown to reduce blood pressure by 5–8 mmHg in people with hypertension.',
    '🥕 Orange and yellow vegetables like carrots are packed with beta-carotene, which your body converts to Vitamin A for eye health.',
];
const getDailyTip = () => HEALTH_TIPS[Math.floor((Date.now() / 86400000)) % HEALTH_TIPS.length];

const ACCENT_MAP = {
    morning: colors.success,
    afternoon: colors.warning,
    evening: '#0369A1',
    night: '#1D4ED8',
    as_needed: '#0EA5E9',
};
const TIME_LABELS = {
    morning: 'Morning', afternoon: 'Afternoon',
    evening: 'Evening', night: 'Night', as_needed: 'As Needed',
};

const HERO_GRAD = ['#071628', '#0C2240', '#0F3460'];

// ── Skeleton Loader ────────────────────────────────────────────────────────
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
    return (
        <Animated.View style={[{ width, height, borderRadius, backgroundColor: 'rgba(255,255,255,0.12)', opacity: anim }, style]} />
    );
};

// ── VitalsCard ─────────────────────────────────────────────────────────────
const VitalsCard = ({ label, value, unit, icon: Icon, color, status = 'Stable' }) => {
    const isLogged = status === 'Recorded';
    return (
        <View style={[styles.vitalsCard, { backgroundColor: '#FFFFFF' }]}>
            <LinearGradient
                colors={isLogged ? [color + '14', color + '06'] : ['#FAFBFF', '#F5F7FF']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            />
            <View style={styles.vitalsCardTop}>
                <View style={[styles.vitalsIconBox, { backgroundColor: isLogged ? color + '22' : '#F8FAFC' }]}>
                    <Icon size={20} color={isLogged ? color : '#94A3B8'} strokeWidth={2.5} />
                </View>
                <View style={[styles.vitalsStatusBadge, { backgroundColor: isLogged ? color + '15' : '#F1F5F9' }]}>
                    <View style={[styles.statusDot, { backgroundColor: isLogged ? color : '#CBD5E1' }]} />
                    <Text style={[styles.statusLabel, { color: isLogged ? color : '#94A3B8' }]}>
                        {isLogged ? 'Logged' : 'Pending'}
                    </Text>
                </View>
            </View>
            <Text style={styles.vitalsCardLabel}>{label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 2 }}>
                <Text style={[styles.vitalsCardValue, { color: isLogged ? '#0F172A' : '#CBD5E1' }]}>{value}</Text>
                <Text style={styles.vitalsCardUnit}>{unit}</Text>
            </View>
            <View style={styles.vitalsCardFooter}>
                {isLogged
                    ? <><TrendingUp size={12} color={colors.success} /><Text style={[styles.vitalsFooterText, { color: colors.success }]}>Logged today</Text></>
                    : <><Activity size={12} color="#94A3B8" /><Text style={styles.vitalsFooterText}>Tap History to log</Text></>
                }
            </View>
        </View>
    );
};

// ── MedicationCard ─────────────────────────────────────────────────────────
const MedicationCard = ({ med, onPress }) => {
    const accentColor = ACCENT_MAP[med.type] || '#0EA5E9';
    return (
        <Pressable onPress={() => onPress && onPress()} style={[styles.medCard, med.taken && styles.medCardTaken]}>
            <View style={[styles.medAccentBar, { backgroundColor: med.taken ? colors.success : accentColor }]} />
            <View style={styles.medCardContent}>
                <View style={[styles.medIconBox, { backgroundColor: med.taken ? '#ECFDF5' : accentColor + '15' }]}>
                    {med.taken
                        ? <CheckCircle2 size={20} color={colors.success} strokeWidth={2.5} />
                        : <Pill size={20} color={accentColor} strokeWidth={2.5} />
                    }
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.medName, med.taken && { color: colors.success }]}>{med.name}</Text>
                    <Text style={styles.medDose}>{med.dosage}{med.instructions ? ` • ${med.instructions}` : ''}</Text>
                </View>
                {med.taken && (
                    <View style={styles.takenBadge}>
                        <CheckCircle2 size={10} color={colors.success} />
                        <Text style={styles.takenBadgeText}>Done</Text>
                    </View>
                )}
            </View>
        </Pressable>
    );
};

// ════════════════════════════════════════════════════════════════════════════
// ══ MAIN SCREEN ══════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
export default function PatientHomeScreen({ navigation }) {
    const { displayName, profile } = useAuth();

    // ── Zustand store ────────────────────────────────────────────────────
    const patient = usePatientStore((s) => s.patient);
    const vitals = usePatientStore((s) => s.vitals);
    const vitalsHistory = usePatientStore((s) => s.vitalsHistory);
    const aiPrediction = usePatientStore((s) => s.aiPrediction);
    const meds = usePatientStore((s) => s.dashboardMeds);
    const adherenceDetails = usePatientStore((s) => s.adherenceDetails);
    const isCached = usePatientStore((s) => s.isCached);
    const storeFetchDashboard = usePatientStore((s) => s.fetchDashboard);

    // ── Local state ──────────────────────────────────────────────────────
    const [loading, setLoading] = useState(true);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLogging, setIsLogging] = useState(false);
    const [formValues, setFormValues] = useState({
        heart_rate: '', systolic: '', diastolic: '', oxygen_saturation: '', hydration: '',
    });
    const [formError, setFormError] = useState(null);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [medsExpanded, setMedsExpanded] = useState(false);
    const [showStreakBanner, setShowStreakBanner] = useState(true);
    const [syncStatus, setSyncStatus] = useState({
        enabled: false, connected: false, lastSync: null, readingsToday: 0, syncing: false,
    });

    const staggerAnims = useRef([...Array(10)].map(() => new Animated.Value(0))).current;

    const runAnimations = useCallback(() => {
        staggerAnims.forEach(a => a.setValue(0));
        Animated.stagger(90,
            staggerAnims.map(a => Animated.spring(a, { toValue: 1, friction: 8, tension: 42, useNativeDriver: true }))
        ).start();
    }, [staggerAnims]);

    const fetchData = useCallback(async (skipCache = false) => {
        try {
            const result = await storeFetchDashboard(skipCache);
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
    }, [storeFetchDashboard]);

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
                fetchData(true).then(() => {
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

    // ── Derived values ────────────────────────────────────────────────────
    const takenCount = meds.filter(m => m.taken).length;
    const totalMeds = meds.length;
    const adherencePct = totalMeds > 0 ? Math.round((takenCount / totalMeds) * 100) : 0;
    const medicationStreak = adherenceDetails?.streak || 0;
    const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    const firstName = (patient?.name || displayName)?.split(' ')[0] || 'there';

    let daysPremiumRemaining = 0;
    if (patient?.subscription?.expires_at) {
        const diff = new Date(patient.subscription.expires_at) - new Date();
        daysPremiumRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    const getGreeting = () => {
        const h = new Date().getHours();
        if (h < 12) return 'Good Morning';
        if (h < 17) return 'Good Afternoon';
        return 'Good Evening';
    };

    const getNextDose = () => {
        const hour = new Date().getHours();
        const prefs = patient?.medication_call_preferences || {};
        const pending = meds.filter(m => !m.taken);
        if (pending.length === 0) return null;
        const slots = ['morning', 'afternoon', 'evening', 'night'];
        const slotHours = { morning: 5, afternoon: 11, evening: 16, night: 19 };
        for (const s of slots) {
            if (hour < (slotHours[s] || 24)) {
                const slotPending = pending.filter(m => m.type === s);
                if (slotPending.length > 0)
                    return { slot: TIME_LABELS[s] || s, time: prefs[s] || '', count: slotPending.length };
            }
        }
        return { slot: 'Later', time: '', count: pending.length };
    };
    const nextDose = getNextDose();

    const adherenceColor = adherencePct >= 80 ? '#10B981' : adherencePct >= 50 ? '#F59E0B' : '#F43F5E';

    const anim = (i) => ({
        opacity: staggerAnims[i],
        transform: [{ translateY: staggerAnims[i].interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
    });

    // ── Loading skeleton ──────────────────────────────────────────────────
    if (loading) {
        return (
            <View style={{ flex: 1 }}>
                <LinearGradient colors={HERO_GRAD} style={styles.skeletonHeader}>
                    <View style={{ paddingHorizontal: 24 }}>
                        <SkeletonItem width={90} height={11} borderRadius={6} style={{ marginBottom: 18 }} />
                        <SkeletonItem width={220} height={34} borderRadius={10} style={{ marginBottom: 8 }} />
                        <SkeletonItem width={150} height={14} borderRadius={6} style={{ marginBottom: 28 }} />
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <SkeletonItem width="30%" height={68} borderRadius={18} />
                            <SkeletonItem width="30%" height={68} borderRadius={18} />
                            <SkeletonItem width="30%" height={68} borderRadius={18} />
                        </View>
                    </View>
                </LinearGradient>
                <View style={styles.skeletonPanel}>
                    <View style={{ padding: 20, gap: 14 }}>
                        <View style={{ backgroundColor: '#E2E8F0', borderRadius: 22, height: 130 }} />
                        <View style={{ backgroundColor: '#E2E8F0', borderRadius: 22, height: 110 }} />
                        <View style={{ backgroundColor: '#E2E8F0', borderRadius: 22, height: 200 }} />
                    </View>
                </View>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <LinearGradient colors={HERO_GRAD} style={{ flex: 1 }}>
                {/* Decorative orbs */}
                <View style={styles.orb1} />
                <View style={styles.orb2} />

                {/* ── HEADER ── */}
                <Animated.View style={[styles.header, anim(0)]}>
                    <Pressable onPress={() => navigation.navigate('LocationSearch')} style={styles.locationPill}>
                        <View style={styles.locationDot}><MapPin size={10} color="#FFF" fill="#FFF" /></View>
                        <Text style={styles.locationText} numberOfLines={1}>
                            {patient?.city || profile?.city || 'Detecting...'}
                        </Text>
                        <ChevronRight size={10} color="rgba(255,255,255,0.5)" strokeWidth={3} />
                    </Pressable>

                    <View style={styles.mainHeaderRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.greetingLabel}>{getGreeting()},</Text>
                            <Text style={styles.greetingName}>{firstName} 👋</Text>
                        </View>
                        <View style={styles.headerActions}>
                            <Pressable style={styles.headerIconBtn} onPress={() => navigation.navigate('Notifications')}>
                                <Bell size={20} color="rgba(255,255,255,0.9)" strokeWidth={2.5} />
                                {unreadCount > 0 && <View style={styles.bellDot} />}
                            </Pressable>
                            <TouchableOpacity activeOpacity={0.85} style={styles.avatarBtn} onPress={() => navigation.navigate('Profile')}>
                                <Text style={styles.avatarText}>{displayName?.charAt(0) || 'U'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.datePill}>
                        <CalendarDays size={12} color="rgba(255,255,255,0.45)" />
                        <Text style={styles.dateText}>{dateStr}</Text>
                    </View>

                    {/* Quick stats strip */}
                    <Animated.View style={[styles.statsStrip, { opacity: staggerAnims[1] }]}>
                        {[
                            { Icon: Pill, value: `${takenCount}/${totalMeds}`, label: 'Meds Today', iconColor: 'rgba(255,255,255,0.85)', onPress: () => navigation.navigate('AdherenceDetails') },
                            { Icon: Flame, value: String(medicationStreak), label: 'Day Streak', iconColor: '#FB923C', onPress: () => navigation.navigate('AdherenceDetails') },
                            { Icon: Sparkles, value: String(daysPremiumRemaining), label: 'Days Premium', iconColor: '#A78BFA', onPress: null },
                        ].map(({ Icon: StatIcon, value, label, iconColor, onPress: statPress }, i) => (
                            <Pressable key={i} style={styles.statChip} onPress={statPress || undefined}>
                                <LinearGradient
                                    colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.08)']}
                                    style={styles.statChipGrad}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                >
                                    <StatIcon size={16} color={iconColor} strokeWidth={2} />
                                    <Text style={styles.statChipValue}>{value}</Text>
                                    <Text style={styles.statChipLabel}>{label}</Text>
                                </LinearGradient>
                            </Pressable>
                        ))}
                    </Animated.View>
                </Animated.View>

                {/* ── CONTENT PANEL ── */}
                <View style={styles.contentPanel}>
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* Offline banner */}
                        {isCached && (
                            <View style={styles.offlineBanner}>
                                <WifiOff size={13} color="#92400E" />
                                <Text style={styles.offlineBannerText}>Showing cached data • Pull to refresh</Text>
                            </View>
                        )}

                        {/* ── Banners ── */}
                        <Animated.View style={anim(2)}>
                            {showStreakBanner && medicationStreak >= 3 && (
                                <View style={[styles.banner, { borderColor: '#FDE68A' }]}>
                                    <LinearGradient colors={['#FEF3C7', '#FDE68A']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                        <Text style={{ fontSize: 22 }}>🔥</Text>
                                        <View>
                                            <Text style={styles.bannerTitle}>{medicationStreak}-day medication streak!</Text>
                                            <Text style={styles.bannerSub}>Keep logging to unlock better insights</Text>
                                        </View>
                                    </View>
                                    <Pressable onPress={() => setShowStreakBanner(false)} hitSlop={12}>
                                        <Text style={{ fontSize: 16, color: '#D97706', fontWeight: '700', padding: 4 }}>✕</Text>
                                    </Pressable>
                                </View>
                            )}
                            {takenCount === totalMeds && totalMeds > 0 && (
                                <View style={[styles.banner, { borderColor: '#BBF7D0' }]}>
                                    <LinearGradient colors={['#F0FDF4', '#DCFCE7']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                        <Text style={{ fontSize: 22 }}>✅</Text>
                                        <View>
                                            <Text style={[styles.bannerTitle, { color: '#166534' }]}>All meds taken today!</Text>
                                            <Text style={[styles.bannerSub, { color: '#15803D' }]}>Great job staying on track</Text>
                                        </View>
                                    </View>
                                </View>
                            )}
                        </Animated.View>

                        {/* ── TODAY'S MEDICATIONS ── */}
                        <Animated.View style={anim(3)}>
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>TODAY'S MEDICATIONS</Text>

                                {totalMeds > 0 ? (
                                    <Pressable style={styles.medSummaryCard} onPress={() => setMedsExpanded(!medsExpanded)}>
                                        <LinearGradient
                                            colors={adherencePct >= 80 ? ['#10B981', '#34D399'] : adherencePct >= 50 ? ['#F59E0B', '#FCD34D'] : ['#F43F5E', '#FB7185']}
                                            style={styles.medAccent}
                                            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                                        />
                                        <View style={styles.medSummaryBody}>
                                            <View style={styles.medSummaryRow}>
                                                <View style={styles.medSummaryLeft}>
                                                    <View style={styles.medSummaryIcon}>
                                                        <Pill size={22} color="#4361EE" strokeWidth={2.5} />
                                                    </View>
                                                    <View>
                                                        <Text style={styles.medSummaryCount}>
                                                            {totalMeds} Medication{totalMeds !== 1 ? 's' : ''}
                                                        </Text>
                                                        {nextDose
                                                            ? <Text style={styles.medSummaryNext}>Next: {nextDose.slot}{nextDose.time ? ` (${nextDose.time})` : ''}</Text>
                                                            : <Text style={[styles.medSummaryNext, { color: colors.success }]}>All done for today! 🎉</Text>
                                                        }
                                                    </View>
                                                </View>
                                                <View style={{ alignItems: 'center' }}>
                                                    <Text style={[styles.adherencePct, { color: adherenceColor }]}>{adherencePct}%</Text>
                                                    <Text style={styles.adherencePctLabel}>Adherence</Text>
                                                </View>
                                            </View>
                                            <View style={styles.progBarBg}>
                                                <View style={[styles.progBarFill, { width: `${adherencePct}%`, backgroundColor: adherenceColor }]} />
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <Text style={styles.medFooterText}>{takenCount} of {totalMeds} taken  •  {medsExpanded ? 'Hide details' : 'View details'}</Text>
                                                <ChevronRight size={14} color="#94A3B8" style={{ transform: [{ rotate: medsExpanded ? '90deg' : '0deg' }] }} />
                                            </View>
                                        </View>
                                    </Pressable>
                                ) : (
                                    <View style={styles.emptyCard}>
                                        <View style={styles.emptyIconBox}><Pill size={28} color="#CBD5E1" strokeWidth={1.5} /></View>
                                        <Text style={styles.emptyTitle}>No Medications Yet</Text>
                                        <Text style={styles.emptySub}>Your care team will add medications here. They'll show up as actionable cards.</Text>
                                    </View>
                                )}

                                {medsExpanded && meds.map(med => (
                                    <MedicationCard key={med.id} med={med} onPress={() => navigation.navigate('Medications')} />
                                ))}
                            </View>
                        </Animated.View>

                        {/* ── MY VITALS ── */}
                        <Animated.View style={anim(4)}>
                            <View style={styles.section}>
                                <View style={styles.sectionTitleRow}>
                                    <Text style={styles.sectionTitle}>MY VITALS</Text>
                                    <Pressable style={styles.viewAllBtn} onPress={() => navigation.navigate('VitalsHistory')}>
                                        <Text style={styles.viewAllText}>History</Text>
                                        <ChevronRight size={13} color="#64748B" />
                                    </Pressable>
                                </View>

                                {/* Wearable sync */}
                                <Pressable
                                    style={[styles.syncCard, syncStatus.connected && styles.syncCardConnected]}
                                    onPress={() => navigation.navigate('HealthConnectSetup')}
                                >
                                    <View style={styles.syncCardLeft}>
                                        <View style={[styles.syncIconBox, { backgroundColor: syncStatus.connected ? '#ECFDF5' : '#E0F2FE' }]}>
                                            <Watch size={20} color={syncStatus.connected ? colors.success : '#4361EE'} strokeWidth={2.5} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                                <Text style={styles.syncTitle}>
                                                    {syncStatus.connected ? 'Wearable Connected' : 'Connect Wearable'}
                                                </Text>
                                                {syncStatus.syncing && (
                                                    <View style={styles.syncingBadge}>
                                                        <Zap size={9} color="#D97706" />
                                                        <Text style={styles.syncingText}>Syncing</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={styles.syncSub}>
                                                {syncStatus.connected
                                                    ? `${syncStatus.readingsToday} readings today${syncStatus.lastSync ? ' • Last: ' + new Date(syncStatus.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`
                                                    : 'Auto-track vitals from your smartwatch'}
                                            </Text>
                                        </View>
                                    </View>
                                    <ChevronRight size={18} color={syncStatus.connected ? colors.success : '#94A3B8'} />
                                </Pressable>

                                {/* Vitals cards */}
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingRight: 4, marginBottom: 16 }}>
                                    <VitalsCard label="Heart Rate" value={vitals?.heart_rate || '—'} unit="bpm" icon={Heart} color="#EF4444" status={vitals?.heart_rate ? 'Recorded' : 'Not Logged'} />
                                    <VitalsCard label="Blood Pressure" value={vitals?.blood_pressure?.systolic ? `${vitals.blood_pressure.systolic}/${vitals.blood_pressure.diastolic}` : '—'} unit="mmHg" icon={Activity} color="#3B82F6" status={vitals?.blood_pressure?.systolic ? 'Recorded' : 'Not Logged'} />
                                    <VitalsCard label="Oxygen" value={vitals?.oxygen_saturation != null ? vitals.oxygen_saturation : '—'} unit="%" icon={Wind} color="#06B6D4" status={vitals?.oxygen_saturation != null ? 'Recorded' : 'Not Logged'} />
                                    <VitalsCard label="Hydration" value={vitals?.hydration != null ? vitals.hydration : '—'} unit="%" icon={Droplets} color="#0EA5E9" status={vitals?.hydration != null ? 'Recorded' : 'Not Logged'} />
                                </ScrollView>

                                {/* AI Outlook */}
                                {(aiPrediction || vitalsHistory.length > 0) && (
                                    <View style={styles.card}>
                                        <View style={styles.cardHeaderRow}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <View style={styles.aiIconBox}>
                                                    <Sparkles size={16} color="#0EA5E9" />
                                                </View>
                                                <Text style={styles.cardTitle}>AI Health Outlook</Text>
                                            </View>
                                            {aiPrediction && (
                                                <View style={[
                                                    styles.aiBadge,
                                                    aiPrediction.health_label === 'Critical' ? styles.aiBadgeRed :
                                                        aiPrediction.health_label === 'Warning' ? styles.aiBadgeOrange :
                                                            styles.aiBadgeGreen,
                                                ]}>
                                                    <Text style={[
                                                        styles.aiBadgeText,
                                                        { color: aiPrediction.health_label === 'Critical' ? '#DC2626' : aiPrediction.health_label === 'Warning' ? '#D97706' : '#16A34A' },
                                                    ]}>{aiPrediction.health_label}</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.aiDesc}>Our AI analyzes your vitals history to forecast trends and flag potential concerns.</Text>
                                        {vitalsHistory.length > 0 && (
                                            <AIPredictionChart
                                                metricName="Heart Rate"
                                                unit="bpm"
                                                vitalsHistory={vitalsHistory.map(v => ({
                                                    label: new Date(v.date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
                                                    value: v.heart_rate,
                                                }))}
                                                predictionData={aiPrediction?.predictions ? aiPrediction.predictions.map(p => ({
                                                    label: new Date(p.date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
                                                    value: p.heart_rate,
                                                })) : null}
                                            />
                                        )}
                                    </View>
                                )}

                                {/* Log vitals form */}
                                <View style={[styles.card, { marginTop: 16 }]}>
                                    <Pressable
                                        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                                        onPress={() => { setIsLogging(!isLogging); setFormError(null); }}
                                    >
                                        <Text style={styles.cardTitle}>Log Today's Vitals</Text>
                                        <View style={[styles.toggleBadge, isLogging && styles.toggleBadgeCancel]}>
                                            <Text style={[styles.toggleBadgeText, isLogging && { color: '#EF4444' }]}>
                                                {isLogging ? 'Cancel' : '+ Add Entry'}
                                            </Text>
                                        </View>
                                    </Pressable>
                                    {isLogging && (
                                        <View style={{ marginTop: 20 }}>
                                            {formError && (
                                                <View style={styles.errorBanner}>
                                                    <AlertTriangle size={15} color="#DC2626" />
                                                    <Text style={styles.errorText}>{formError}</Text>
                                                </View>
                                            )}
                                            <View style={styles.formRow}>
                                                <View style={{ flex: 1 }}>
                                                    <SmartInput label="Heart Rate (bpm)" keyboardType="numeric" placeholder="72"
                                                        value={formValues.heart_rate} onChangeText={(t) => setFormValues(p => ({ ...p, heart_rate: t }))} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <SmartInput label="O₂ Saturation (%)" keyboardType="numeric" placeholder="98"
                                                        value={formValues.oxygen_saturation} onChangeText={(t) => setFormValues(p => ({ ...p, oxygen_saturation: t }))} />
                                                </View>
                                            </View>
                                            <Text style={styles.formLabel}>Blood Pressure (mmHg)</Text>
                                            <View style={styles.formRow}>
                                                <View style={{ flex: 1 }}>
                                                    <SmartInput keyboardType="numeric" placeholder="Systolic (120)"
                                                        value={formValues.systolic} onChangeText={(t) => setFormValues(p => ({ ...p, systolic: t }))} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <SmartInput keyboardType="numeric" placeholder="Diastolic (80)"
                                                        value={formValues.diastolic} onChangeText={(t) => setFormValues(p => ({ ...p, diastolic: t }))} />
                                                </View>
                                            </View>
                                            <SmartInput label="Hydration (%)" keyboardType="numeric" placeholder="65"
                                                value={formValues.hydration} onChangeText={(t) => setFormValues(p => ({ ...p, hydration: t }))} />
                                            <Pressable style={styles.submitBtn} onPress={handleLogVitals} disabled={submitLoading}>
                                                {submitLoading
                                                    ? <ActivityIndicator color="#FFF" />
                                                    : <Text style={styles.submitBtnText}>Save Record</Text>
                                                }
                                            </Pressable>
                                        </View>
                                    )}
                                </View>
                            </View>
                        </Animated.View>

                        {/* ── DAILY TIP ── */}
                        <Animated.View style={anim(5)}>
                            <View style={styles.section}>
                                <View style={styles.tipCard}>
                                    <LinearGradient colors={['#0EA5E9', '#38BDF8']} style={styles.tipAccentBar} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
                                    <View style={styles.tipBody}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                            <View style={styles.tipIconBox}><Sparkles size={15} color="#0EA5E9" /></View>
                                            <Text style={styles.tipLabel}>DAILY HEALTH TIP</Text>
                                        </View>
                                        <Text style={styles.tipText}>{getDailyTip()}</Text>
                                    </View>
                                </View>
                            </View>
                        </Animated.View>

                        {/* ── QUICK ACTIONS ── */}
                        <Animated.View style={anim(6)}>
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
                                <View style={styles.quickGrid}>
                                    {[
                                        { label: 'Med Adherence', sub: 'View Progress', grad: ['#10B981', '#34D399'], Icon: CheckCircle2, onPress: () => navigation.navigate('AdherenceDetails') },
                                        { label: 'Med Delivery', sub: 'Coming Soon', grad: ['#0EA5E9', '#38BDF8'], Icon: Package, onPress: () => AlertManager.alert('Coming Soon! 🚀', "Med Delivery is on its way! We're building a seamless way to order and track your medications right from the app. Stay tuned!", [{ text: 'Got it!', style: 'default' }]) },
                                        { label: 'Health Profile', sub: 'View & Edit', grad: ['#0284C7', '#38BDF8'], Icon: Activity, onPress: () => navigation.navigate('HealthProfile') },
                                        { label: 'Schedule', sub: 'Next Appointment', grad: ['#F59E0B', '#FCD34D'], Icon: CalendarDays, onPress: () => navigation.navigate('HealthProfile') },
                                    ].map(({ label, sub, grad, Icon, onPress }) => (
                                        <Pressable key={label} style={styles.quickCard} onPress={onPress}>
                                            <LinearGradient colors={grad} style={styles.quickIconBox} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                                <Icon size={20} color="#FFF" strokeWidth={2.5} />
                                            </LinearGradient>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.quickCardTitle}>{label}</Text>
                                                <Text style={styles.quickCardSub}>{sub}</Text>
                                            </View>
                                            <ChevronRight size={16} color="#CBD5E1" />
                                        </Pressable>
                                    ))}
                                </View>
                            </View>
                        </Animated.View>

                        <View style={{ height: 30 }} />
                    </ScrollView>
                </View>
            </LinearGradient>
        </KeyboardAvoidingView>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// ══ STYLES ═══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
    // ── Skeleton ──
    skeletonHeader: { paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingBottom: 24 },
    skeletonPanel: { flex: 1, backgroundColor: '#F2F4FF', borderTopLeftRadius: 32, borderTopRightRadius: 32 },

    // ── Orbs ──
    orb1: { position: 'absolute', top: -60, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: '#0EA5E9', opacity: 0.1 },
    orb2: { position: 'absolute', top: 180, left: -80, width: 160, height: 160, borderRadius: 80, backgroundColor: '#0369A1', opacity: 0.1 },

    // ── Header ──
    header: { paddingTop: Platform.OS === 'ios' ? 52 : 40, paddingHorizontal: 24, paddingBottom: 12 },
    locationPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 20, alignSelf: 'flex-start', marginBottom: 16,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    },
    locationDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#4361EE', alignItems: 'center', justifyContent: 'center' },
    locationText: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
    mainHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    greetingLabel: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 0.3, marginBottom: 2 },
    greetingName: { fontSize: 30, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.8 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 2 },
    headerIconBtn: {
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
        alignItems: 'center', justifyContent: 'center',
    },
    bellDot: { position: 'absolute', top: 10, right: 10, width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: '#0C2240' },
    avatarBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#4361EE', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 16, fontWeight: '900', color: '#FFFFFF' },
    datePill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    dateText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },

    // ── Stats Strip ──
    statsStrip: { flexDirection: 'row', gap: 10, marginTop: 12 },
    statChip: { flex: 1, borderRadius: 16, overflow: 'hidden' },
    statChipGrad: { padding: 10, alignItems: 'center', gap: 3, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
    statChipValue: { fontSize: 16, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
    statChipLabel: { fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', textAlign: 'center' },

    // ── Content Panel ──
    contentPanel: { flex: 1, backgroundColor: '#F0F9FF', borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
    scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 110 },

    // ── Offline Banner ──
    offlineBanner: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
        backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A',
        borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 16,
    },
    offlineBannerText: { fontSize: 12, fontWeight: '600', color: '#92400E' },

    // ── Alert Banners ──
    banner: {
        flexDirection: 'row', alignItems: 'center',
        borderWidth: 1, borderRadius: 18, padding: 14, paddingHorizontal: 16,
        marginBottom: 12, overflow: 'hidden',
    },
    bannerTitle: { fontSize: 14, fontWeight: '800', color: '#92400E' },
    bannerSub: { fontSize: 12, fontWeight: '500', color: '#B45309', marginTop: 1 },

    // ── Sections ──
    section: { marginBottom: 28 },
    sectionTitle: { fontSize: 12, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 14 },
    sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    viewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    viewAllText: { fontSize: 13, fontWeight: '700', color: '#64748B' },

    // ── Med Summary Card ──
    medSummaryCard: {
        backgroundColor: '#FFFFFF', borderRadius: 22, marginBottom: 12,
        flexDirection: 'row', overflow: 'hidden',
        shadowColor: '#4361EE', shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08, shadowRadius: 18, elevation: 6,
    },
    medAccent: { width: 5, flexShrink: 0 },
    medSummaryBody: { flex: 1, padding: 20 },
    medSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    medSummaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
    medSummaryIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' },
    medSummaryCount: { fontSize: 17, fontWeight: '800', color: '#1E293B', letterSpacing: -0.3 },
    medSummaryNext: { fontSize: 13, fontWeight: '600', color: '#64748B', marginTop: 2 },
    adherencePct: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
    adherencePctLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 },
    progBarBg: { height: 7, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', marginBottom: 14 },
    progBarFill: { height: 7, borderRadius: 4 },
    medFooterText: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },

    // ── Empty state ──
    emptyCard: { backgroundColor: '#FAFBFF', borderRadius: 22, padding: 32, alignItems: 'center', borderWidth: 1.5, borderColor: '#E2E8F0', borderStyle: 'dashed' },
    emptyIconBox: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: '#475569', marginBottom: 6 },
    emptySub: { fontSize: 13, fontWeight: '500', color: '#94A3B8', textAlign: 'center', lineHeight: 20 },

    // ── Individual Med Card ──
    medCard: {
        backgroundColor: '#FFFFFF', borderRadius: 20, marginBottom: 10,
        flexDirection: 'row', overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.04, shadowRadius: 10, elevation: 3,
    },
    medCardTaken: { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' },
    medAccentBar: { width: 4, flexShrink: 0 },
    medCardContent: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
    medIconBox: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    medName: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 3 },
    medDose: { fontSize: 12, color: '#64748B', fontWeight: '500' },
    takenBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
    takenBadgeText: { fontSize: 10, fontWeight: '700', color: colors.success },

    // ── Vitals Card ──
    vitalsCard: {
        width: 160, borderRadius: 22, padding: 18, overflow: 'hidden',
        shadowColor: '#4361EE', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 5,
    },
    vitalsCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    vitalsIconBox: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    vitalsStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 14 },
    statusDot: { width: 5, height: 5, borderRadius: 2.5 },
    statusLabel: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    vitalsCardLabel: { fontSize: 12, fontWeight: '700', color: '#64748B' },
    vitalsCardValue: { fontSize: 22, fontWeight: '800' },
    vitalsCardUnit: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
    vitalsCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 },
    vitalsFooterText: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },

    // ── Sync Card ──
    syncCard: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginBottom: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
    },
    syncCardConnected: { backgroundColor: '#F0FDF4' },
    syncCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 14 },
    syncIconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    syncTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
    syncSub: { fontSize: 12, color: '#64748B', fontWeight: '500' },
    syncingBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF3C7', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
    syncingText: { fontSize: 10, fontWeight: '700', color: '#D97706' },

    // ── Generic Card ──
    card: {
        backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 14, elevation: 4,
    },
    cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    cardTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
    aiIconBox: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' },
    aiDesc: { fontSize: 13, color: '#64748B', lineHeight: 18, marginTop: 4, marginBottom: 12 },
    aiBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
    aiBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    aiBadgeGreen: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
    aiBadgeOrange: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
    aiBadgeRed: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
    toggleBadge: { backgroundColor: 'rgba(67,97,238,0.1)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
    toggleBadgeCancel: { backgroundColor: 'rgba(239,68,68,0.1)' },
    toggleBadgeText: { color: '#4361EE', fontSize: 13, fontWeight: '700' },
    formRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
    formLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
    submitBtn: {
        borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 20,
        backgroundColor: '#4361EE',
        shadowColor: '#4361EE', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
    },
    submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
    errorBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
        borderRadius: 14, padding: 12, marginBottom: 12,
    },
    errorText: { flex: 1, color: '#991B1B', fontSize: 13, fontWeight: '600', lineHeight: 18 },

    // ── Daily Tip ──
    tipCard: {
        backgroundColor: '#FFFFFF', borderRadius: 22, overflow: 'hidden',
        flexDirection: 'row',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 3,
    },
    tipAccentBar: { width: 5, flexShrink: 0 },
    tipBody: { flex: 1, padding: 18 },
    tipIconBox: { width: 28, height: 28, borderRadius: 9, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' },
    tipLabel: { fontSize: 11, fontWeight: '800', color: '#0EA5E9', letterSpacing: 1.2 },
    tipText: { fontSize: 14, color: '#334155', lineHeight: 22, fontWeight: '500' },

    // ── Quick Actions ──
    quickGrid: { gap: 12 },
    quickCard: {
        backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16,
        flexDirection: 'row', alignItems: 'center', gap: 14,
        shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
    },
    quickIconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    quickCardTitle: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
    quickCardSub: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '600' },
});
