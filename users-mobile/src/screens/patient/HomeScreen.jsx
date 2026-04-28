import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Pressable, Animated, ActivityIndicator, TextInput, KeyboardAvoidingView, TouchableOpacity, DeviceEventEmitter, InteractionManager, Vibration, Alert, SafeAreaView, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Pill, PhoneCall, CalendarCheck, Sunrise, Sun, Moon, Package,
    Sparkles, ChevronRight, PhoneIncoming, TrendingUp, Activity, CalendarDays, CheckCircle2, Circle, Bell,
    Heart, Wind, Thermometer, Droplets, MapPin, AlertTriangle, PillBottle, Syringe, WifiOff, Clock
} from 'lucide-react-native';
import { handleAxiosError } from '../../lib/axiosInstance';
import { colors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../lib/api';
import { getCache, setCache, CACHE_KEYS } from '../../lib/CacheService';
import { useFocusEffect } from '@react-navigation/native';
import AIPredictionChart from '../../components/vitals/AIPredictionChart';
import HealthSyncService from '../../services/HealthSyncService';
import { Watch, Zap } from 'lucide-react-native';
import { syncAllSchedules } from '../../utils/notifications';
import usePatientStore from '../../store/usePatientStore';
import SmartInput from '../../components/ui/SmartInput';

// ── Rotating Daily Health Tips ──────────────────────────────
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

const ACCENT_MAP = { morning: colors.success, afternoon: colors.warning, evening: '#7C3AED', night: '#8B5CF6', as_needed: '#6366F1' };
const TIME_LABELS = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night', as_needed: 'As Needed' };

// ── Skeleton Loader ──────────────────────────────────────────
const SkeletonItem = ({ width, height, borderRadius = 8, style }) => {
    const anim = useRef(new Animated.Value(0.3)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true })
            ])
        ).start();
    }, [anim]);
    return <Animated.View style={[{ width, height, borderRadius, backgroundColor: '#E2E8F0', opacity: anim }, style]} />;
};


const TimeBadge = ({ type, timeStr }) => {
    let IconCmp, bg, color;
    if (type === 'morning') { IconCmp = Sunrise; bg = '#DCFCE7'; color = colors.success; }
    else if (type === 'afternoon') { IconCmp = Sun; bg = '#FEF3C7'; color = colors.warning; }
    else { IconCmp = Moon; bg = '#EDE9FE'; color = '#8B5CF6'; }

    return (
        <View style={[styles.timeBadge, { backgroundColor: bg }]}>
            <IconCmp size={14} color={color} strokeWidth={2.5} />
            <Text style={[styles.timeBadgeTxt, { color }]}>{timeStr}</Text>
        </View>
    );
};

const VitalsCard = ({ label, value, unit, icon: Icon, color, status = 'Stable' }) => {
    const isLogged = status === 'Recorded';
    return (
        <View
            style={[
                styles.vitalsCardPremium,
                { backgroundColor: isLogged ? '#FFFFFF' : '#F8FAFC' },
                !isLogged && { borderStyle: 'dashed', borderColor: '#E2E8F0', opacity: 0.85 },
            ]}
        >
            <View style={styles.vitalsRowTop}>
                <View style={[styles.vitalsIconBoxPremium, { backgroundColor: color + (isLogged ? '15' : '08') }]}>
                    <Icon size={20} color={isLogged ? color : '#94A3B8'} strokeWidth={2.5} />
                </View>
                <View style={[styles.statusBadge, { backgroundColor: isLogged ? color + '10' : '#F1F5F9' }]}>
                    <View style={[styles.statusDot, { backgroundColor: isLogged ? color : '#CBD5E1' }]} />
                    <Text style={[styles.statusText, { color: isLogged ? color : '#94A3B8' }]}>{status}</Text>
                </View>
            </View>

            <View style={styles.vitalsMainInfo}>
                <Text style={styles.vitalsLabelPremium}>{label}</Text>
                <View style={styles.vitalsValueRow}>
                    <Text style={[styles.vitalsValuePremium, !isLogged && { color: '#CBD5E1' }]}>{value}</Text>
                    <Text style={styles.vitalsUnitPremium}>{unit}</Text>
                </View>
            </View>

            {isLogged ? (
                <View style={styles.trendContainer}>
                    <TrendingUp size={14} color="#22C55E" />
                    <Text style={styles.trendText}>Logged today</Text>
                </View>
            ) : (
                <View style={styles.trendContainer}>
                    <Activity size={14} color="#94A3B8" />
                    <Text style={[styles.trendText, { color: '#94A3B8' }]}>Tap History to log</Text>
                </View>
            )}
        </View>
    );
};

const MedicationCard = ({ med, onPress }) => {
    let IconCmp = Pill;
    if (med.type === 'afternoon') IconCmp = PillBottle;
    if (med.type === 'night') IconCmp = Syringe;

    return (
        <Pressable onPress={() => onPress && onPress()} style={[styles.medCard, med.taken && styles.medCardTaken]}>
            <View style={styles.medCardInner}>
                <View style={[styles.medIconBox, med.taken ? { backgroundColor: '#DCFCE7' } : { backgroundColor: '#EFF6FF' }]}>
                    {med.taken ? (
                        <CheckCircle2 size={20} color="#16A34A" strokeWidth={2.5} />
                    ) : (
                        <IconCmp size={20} color="#3B82F6" strokeWidth={2.5} />
                    )}
                </View>
                <View style={styles.medContentMinimal}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.medTitleMinimal, med.taken && { color: '#16A34A' }]}>{med.name}</Text>
                        {med.taken && (
                            <View style={styles.takenBadge}>
                                <CheckCircle2 size={10} color="#16A34A" />
                                <Text style={styles.takenBadgeText}>Taken</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.medSubMinimal}>{med.dosage} {med.instructions ? `• ${med.instructions}` : ''}</Text>
                </View>
                <View style={styles.checkboxTouch}>
                    <View style={[styles.checkboxMinimal, med.taken && { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' }]}>
                        {med.taken && <CheckCircle2 color="#16A34A" size={24} />}
                        {!med.taken && <CheckCircle2 color="#CBD5E1" size={24} />}
                    </View>
                </View>
            </View>
        </Pressable>
    );
};

export default function PatientHomeScreen({ navigation }) {
    const { displayName, profile } = useAuth();

    // ── Zustand store subscriptions ─────────────────────────────
    const patient = usePatientStore((s) => s.patient);
    const vitals = usePatientStore((s) => s.vitals);
    const vitalsHistory = usePatientStore((s) => s.vitalsHistory);
    const aiPrediction = usePatientStore((s) => s.aiPrediction);
    const meds = usePatientStore((s) => s.dashboardMeds);
    const isCached = usePatientStore((s) => s.isCached);
    const storeFetchDashboard = usePatientStore((s) => s.fetchDashboard);
    const storeOptimisticToggle = usePatientStore((s) => s.optimisticToggleMed);

    // Local-only UI state
    const [loading, setLoading] = useState(true);
    const [unreadCount, setUnreadCount] = useState(0);

    // Log vitals form state
    const [isLogging, setIsLogging] = useState(false);
    const [formValues, setFormValues] = useState({
        heart_rate: '', systolic: '', diastolic: '', oxygen_saturation: '', hydration: '',
    });
    const [formError, setFormError] = useState(null);
    const [submitLoading, setSubmitLoading] = useState(false);

    const staggerAnims = useRef([...Array(10)].map(() => new Animated.Value(0))).current;

    // Health sync state
    const [syncStatus, setSyncStatus] = useState({
        enabled: false,
        connected: false,
        lastSync: null,
        readingsToday: 0,
        syncing: false,
    });

    const runAnimations = useCallback(() => {
        staggerAnims.forEach(anim => anim.setValue(0));
        Animated.stagger(100,
            staggerAnims.map(anim =>
                Animated.spring(anim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true })
            )
        ).start();
    }, [staggerAnims]);

    const lastFetchRef = useRef(0);

    const fetchData = useCallback(async (skipCache = false) => {
        try {
            const result = await storeFetchDashboard(skipCache);
            if (result) {
                // Schedule push notifications for dashboard items
                try {
                    const medsToSync = result.meds || [];
                    const medPrefs = result.patient?.medication_call_preferences || {};
                    let daysLeft = null;
                    if (result.patient?.subscription?.expires_at) {
                        daysLeft = Math.ceil((new Date(result.patient.subscription.expires_at) - new Date()) / (1000 * 60 * 60 * 24));
                    }
                    syncAllSchedules(medsToSync, medPrefs, daysLeft, !!result.vitals);
                } catch (notifErr) {
                    console.warn('Notification scheduling error (non-critical):', notifErr.message);
                }
            }
        } finally {
            setLoading(false);
        }
    }, [storeFetchDashboard]);

    // ─── Submit new vitals ──────────────────────────────────────
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

    // Use focus effect to refresh data when returning from Vitals History/Log
    const hasAnimated = useRef(false);
    useFocusEffect(
        useCallback(() => {
            // Defer data fetch until after screen transition animation completes (60fps fix)
            const task = InteractionManager.runAfterInteractions(() => {
                fetchData(true).then(() => {
                    if (!hasAnimated.current) {
                        hasAnimated.current = true;
                        runAnimations();
                    }
                });
                // Also fetch unread notification count for badge
                apiService.patients.getNotificationsUnreadCount()
                    .then(res => setUnreadCount(res.data?.count || 0))
                    .catch(() => {});
            });
            // Poll every 2 minutes (was 15s — caused JS thread congestion during tab switches)
            const interval = setInterval(() => fetchData(true), 120000);
            return () => { task.cancel(); clearInterval(interval); };
        }, [fetchData, runAnimations])
    );

    // ─── Initialize Health Sync ─────────────────────────────────
    useEffect(() => {
        const initSync = async () => {
            const status = await HealthSyncService.getStatus();
            setSyncStatus(status);

            if (status.enabled && status.connected) {
                await HealthSyncService.initialize();
            }
        };
        initSync();

        const unsub = HealthSyncService.addListener((update) => {
            setSyncStatus(prev => ({ ...prev, ...update }));
            // If new readings were accepted, refresh the dashboard data
            if (update.totalAccepted > 0) {
                fetchData(true);
            }
        });

        return () => {
            unsub();
        };
    }, [fetchData]);


    const takenCount = meds.filter(m => m.taken).length;
    const totalMeds = meds.length;
    const adherencePct = totalMeds > 0 ? Math.round((takenCount / totalMeds) * 100) : 0;
    const [medsExpanded, setMedsExpanded] = useState(false);
    const [showStreakBanner, setShowStreakBanner] = useState(true);
    const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

    // Derive next upcoming dose
    const getNextDose = () => {
        const hour = new Date().getHours();
        const prefs = patient?.medication_call_preferences || {};
        const pendingMeds = meds.filter(m => !m.taken);
        if (pendingMeds.length === 0) return null;
        // Find next slot
        const slots = ['morning', 'afternoon', 'evening', 'night'];
        const slotHours = { morning: 5, afternoon: 11, evening: 16, night: 19 };
        for (const s of slots) {
            if (hour < (slotHours[s] || 24)) {
                const pending = pendingMeds.filter(m => m.type === s);
                if (pending.length > 0) return { slot: TIME_LABELS[s] || s, time: prefs[s] || '', count: pending.length };
            }
        }
        return { slot: 'Later', time: '', count: pendingMeds.length };
    };
    const nextDose = getNextDose();

    // Vitals streak count
    const vitalsStreak = vitalsHistory.length;

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning,';
        if (hour < 17) return 'Good Afternoon,';
        return 'Good Evening,';
    };

    // Derived stats
    let daysPremiumRemaining = 0;
    if (patient?.subscription?.expires_at) {
        const diffTime = new Date(patient.subscription.expires_at) - new Date();
        daysPremiumRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }
    const callsFreq = patient?.call_frequency_days || 7;

    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: '#F8FAFC' }]}>
                {/* Header Skeleton */}
                <View style={[styles.minimalHeader, { paddingHorizontal: 24, paddingVertical: 12 }]}>
                    <View>
                        <SkeletonItem width={120} height={14} style={{ marginBottom: 8 }} />
                        <SkeletonItem width={180} height={28} />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        <SkeletonItem width={44} height={44} borderRadius={22} />
                        <SkeletonItem width={44} height={44} borderRadius={22} />
                    </View>
                </View>

                <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} showsVerticalScrollIndicator={false}>
                    {/* Progress Card Skeleton */}
                    <SkeletonItem width="100%" height={160} borderRadius={28} style={{ marginTop: 24, marginBottom: 16 }} />
                    
                    {/* Section Title */}
                    <SkeletonItem width={150} height={20} style={{ marginVertical: 16 }} />
                    
                    {/* Med Cards Skeletons */}
                    <SkeletonItem width="100%" height={100} borderRadius={24} style={{ marginBottom: 12 }} />
                    <SkeletonItem width="100%" height={100} borderRadius={24} style={{ marginBottom: 12 }} />
                    <SkeletonItem width="100%" height={100} borderRadius={24} style={{ marginBottom: 12 }} />

                    {/* Vitals Summary Skeleton */}
                    <SkeletonItem width="100%" height={180} borderRadius={28} style={{ marginTop: 12, marginBottom: 40 }} />
                </ScrollView>
            </SafeAreaView>
        );
    }

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <LinearGradient colors={['#F8FAFC', '#EEF2FF']} style={[styles.container, { position: 'relative' }]}>
                <View style={[styles.headerWrap, { zIndex: 10, elevation: 10 }]}>
                    <Animated.View style={[styles.minimalHeader, { opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
                        {/* Location at the very top */}
                        <Pressable 
                            onPress={() => navigation.navigate('LocationSearch')}
                            style={({ pressed }) => [
                                styles.locationPill,
                                { opacity: pressed ? 0.8 : 1 }
                            ]}
                        >
                            <View style={styles.locationIconBox}>
                                <MapPin size={10} color="#FFFFFF" fill="#FFFFFF" />
                            </View>
                            <Text style={styles.locationLabel} numberOfLines={1}>
                                {patient?.city || profile?.city || 'Detecting...'}
                            </Text>
                            <ChevronRight size={10} color={colors.primary} strokeWidth={3} />
                        </Pressable>

                        {/* Main Row: Name, Bell, Avatar */}
                        <View style={styles.mainHeaderRow}>
                            <View style={styles.headerLeft}>
                                <View style={styles.greetingGroupCompact}>
                                    <Text style={styles.greetingGreeting} numberOfLines={1}>
                                        {getGreeting()}
                                    </Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={styles.greetingNameCompact} numberOfLines={1}>
                                            {(patient?.name || displayName)?.split(' ')[0] || 'User'}
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            <View style={styles.headerRight}>
                                <Pressable 
                                    style={styles.bellBtnGlass} 
                                    onPress={() => navigation.navigate('Notifications')}
                                >
                                    <Bell size={20} color={colors.primary} strokeWidth={2.5} />
                                    {unreadCount > 0 && <View style={styles.bellBadgePremium} />}
                                </Pressable>
                                
                                <TouchableOpacity 
                                    activeOpacity={0.8}
                                    style={styles.avatarContainerPremium}
                                    onPress={() => navigation.navigate('Profile')}
                                >
                                    <View style={styles.avatarOuterRing}>
                                        <View style={styles.avatarInnerPremium}>
                                            <Text style={styles.avatarTxtPremium}>{displayName?.charAt(0) || 'U'}</Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Date Badge shifted to bottom or integrated if needed, keeping it subtle for height reduction */}
                        <View style={styles.dateBadge}>
                            <CalendarDays size={12} color="#94A3B8" />
                            <Text style={styles.dateLabelCompact}>{dateStr}</Text>
                        </View>
                    </Animated.View>
                </View>

            <ScrollView 
                style={styles.body} 
                contentContainerStyle={styles.bodyContent} 
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {isCached && (
                    <View style={styles.offlineBanner}>
                        <WifiOff size={14} color="#92400E" />
                        <Text style={styles.offlineBannerText}>Showing cached data • Pull to refresh</Text>
                    </View>
                )}
                <Animated.View style={[styles.headerStatsRow, { opacity: staggerAnims[1], transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
                    <Pressable onPress={() => navigation.navigate('AdherenceDetails')} style={styles.statMiniCardEnhanced}>
                        <View style={[styles.statIconBox, { backgroundColor: 'rgba(14,165,233,0.1)' }]}><Pill size={18} color="#0EA5E9" /></View>
                        <Text style={styles.statMiniVal}>{takenCount}/{meds.length}</Text>
                        <Text style={styles.statMiniLabel}>Meds Taken</Text>
                    </Pressable>

                    <View style={styles.statMiniCardEnhanced}>
                        <View style={[styles.statIconBox, { backgroundColor: 'rgba(234,179,8,0.1)' }]}><CalendarCheck size={18} color="#EAB308" /></View>
                        <Text style={styles.statMiniVal}>{daysPremiumRemaining}</Text>
                        <Text style={styles.statMiniLabel}>Days Premium</Text>
                    </View>
                </Animated.View>

                {/* ── PROGRESS BANNERS ── */}
                {showStreakBanner && vitalsStreak >= 3 && (
                    <Animated.View style={{ opacity: staggerAnims[2], transform: [{ translateY: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                        <View style={styles.streakBanner}>
                            <View style={styles.streakBannerLeft}>
                                <Text style={styles.streakEmoji}>🔥</Text>
                                <View>
                                    <Text style={styles.streakTitle}>{vitalsStreak}-day vitals streak!</Text>
                                    <Text style={styles.streakSub}>Keep logging to unlock better insights</Text>
                                </View>
                            </View>
                            <Pressable onPress={() => setShowStreakBanner(false)} hitSlop={12}>
                                <Text style={styles.streakDismiss}>✕</Text>
                            </Pressable>
                        </View>
                    </Animated.View>
                )}

                {takenCount === totalMeds && totalMeds > 0 && (
                    <Animated.View style={{ opacity: staggerAnims[2], transform: [{ translateY: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                        <View style={[styles.streakBanner, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                            <View style={styles.streakBannerLeft}>
                                <Text style={styles.streakEmoji}>✅</Text>
                                <View>
                                    <Text style={[styles.streakTitle, { color: '#166534' }]}>All meds taken today!</Text>
                                    <Text style={[styles.streakSub, { color: '#15803D' }]}>Great job staying on track</Text>
                                </View>
                            </View>
                        </View>
                    </Animated.View>
                )}

                {/* ── MEDICATION SUMMARY INSIGHT CARD ── */}
                <Animated.View style={{ opacity: staggerAnims[2], transform: [{ translateY: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>TODAY'S MEDICATIONS</Text>

                        {totalMeds > 0 ? (
                            <Pressable
                                style={styles.medInsightCard}
                                onPress={() => setMedsExpanded(!medsExpanded)}
                            >
                                <View style={styles.medInsightTop}>
                                    <View style={styles.medInsightLeft}>
                                        <View style={styles.medInsightIconBox}>
                                            <Pill size={22} color="#6366F1" strokeWidth={2.5} />
                                        </View>
                                        <View>
                                            <Text style={styles.medInsightCount}>{totalMeds} Medication{totalMeds !== 1 ? 's' : ''}</Text>
                                            {nextDose && (
                                                <Text style={styles.medInsightNext}>
                                                    Next: {nextDose.slot}{nextDose.time ? ` (${nextDose.time})` : ''}
                                                </Text>
                                            )}
                                            {!nextDose && <Text style={[styles.medInsightNext, { color: '#16A34A' }]}>All done for today! 🎉</Text>}
                                        </View>
                                    </View>
                                    <View style={styles.medInsightRight}>
                                        <Text style={styles.medInsightPct}>{adherencePct}%</Text>
                                        <Text style={styles.medInsightPctLabel}>adherence</Text>
                                    </View>
                                </View>

                                {/* Adherence progress bar */}
                                <View style={styles.adherenceBarBg}>
                                    <View style={[styles.adherenceBarFill, { width: `${adherencePct}%` }]} />
                                </View>

                                <View style={styles.medInsightFooter}>
                                    <Text style={styles.medInsightFooterTxt}>
                                        {takenCount}/{totalMeds} taken • {medsExpanded ? 'Hide details' : 'View details'}
                                    </Text>
                                    <ChevronRight
                                        size={14}
                                        color="#94A3B8"
                                        style={{ transform: [{ rotate: medsExpanded ? '90deg' : '0deg' }] }}
                                    />
                                </View>
                            </Pressable>
                        ) : (
                            <View style={styles.emptyMedCard}>
                                <View style={styles.emptyMedIcon}>
                                    <Pill size={28} color="#CBD5E1" strokeWidth={1.5} />
                                </View>
                                <Text style={styles.emptyMedTitle}>No Medications Yet</Text>
                                <Text style={styles.emptyMedSub}>Your care team will add medications here. They'll show up as actionable cards.</Text>
                            </View>
                        )}

                        {/* Expandable individual med cards */}
                        {medsExpanded && meds.map(med => (
                            <MedicationCard 
                                key={med.id} 
                                med={med} 
                                onPress={() => navigation.navigate('Medications')} 
                            />
                        ))}
                    </View>
                </Animated.View>

                <Animated.View style={{ opacity: staggerAnims[3], transform: [{ translateY: staggerAnims[3].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={styles.section}>
                        <View style={styles.sectionHeaderRow}>
                            <Text style={styles.sectionHeader}>MY VITALS</Text>
                            <Pressable style={styles.viewAllBtn} onPress={() => navigation.navigate('VitalsHistory')}>
                                <Text style={styles.viewAllText}>History</Text>
                                <ChevronRight size={14} color="#64748B" />
                            </Pressable>
                        </View>

                        {/* ── Health Sync Status Card ────────────── */}
                        <Pressable
                            style={[styles.syncCard, syncStatus.connected && styles.syncCardConnected]}
                            onPress={() => navigation.navigate('HealthConnectSetup')}
                        >
                            <View style={styles.syncCardLeft}>
                                <View style={[styles.syncIconBox, syncStatus.connected ? { backgroundColor: '#DCFCE7' } : { backgroundColor: '#EEF2FF' }]}>
                                    {syncStatus.connected
                                        ? <Watch size={20} color="#16A34A" strokeWidth={2.5} />
                                        : <Watch size={20} color="#3B82F6" strokeWidth={2.5} />
                                    }
                                </View>
                                <View style={styles.syncCardContent}>
                                    <View style={styles.syncTitleRow}>
                                        <Text style={styles.syncCardTitle} numberOfLines={1}>
                                            {syncStatus.connected ? 'Wearable Connected' : 'Connect Wearable'}
                                        </Text>
                                        {syncStatus.syncing && (
                                            <View style={styles.syncingBadge}>
                                                <Zap size={10} color="#D97706" />
                                                <Text style={styles.syncingBadgeText}>Syncing</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.syncCardSub}>
                                        {syncStatus.connected
                                            ? `${syncStatus.readingsToday} readings today${syncStatus.lastSync ? ' • Last: ' + new Date(syncStatus.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`
                                            : 'Auto-track vitals from your smartwatch'
                                        }
                                    </Text>
                                </View>
                            </View>
                            <ChevronRight size={18} color={syncStatus.connected ? '#16A34A' : '#94A3B8'} />
                        </Pressable>
                        
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vitalsScroll}>
                            <VitalsCard label="Heart Rate" value={vitals?.heart_rate || '—'} unit="bpm" icon={Heart} color="#EF4444" status={vitals?.heart_rate ? 'Recorded' : 'Not Logged'} />
                            <VitalsCard label="Blood Pressure" value={vitals?.blood_pressure?.systolic ? `${vitals.blood_pressure.systolic}/${vitals.blood_pressure.diastolic}` : '—'} unit="mmHg" icon={Activity} color="#3B86FF" status={vitals?.blood_pressure?.systolic ? 'Recorded' : 'Not Logged'} />
                            <VitalsCard label="Oxygen" value={vitals?.oxygen_saturation != null ? vitals.oxygen_saturation : '—'} unit="%" icon={Wind} color="#06B6D4" status={vitals?.oxygen_saturation != null ? 'Recorded' : 'Not Logged'} />
                            <VitalsCard label="Hydration" value={vitals?.hydration != null ? vitals.hydration : '—'} unit="%" icon={Droplets} color="#0EA5E9" status={vitals?.hydration != null ? 'Recorded' : 'Not Logged'} />
                        </ScrollView>

                        {/* ── AI OUTLOOK CARD ──────────────────────── */}
                        {(aiPrediction || vitalsHistory.length > 0) && (
                            <View style={styles.chartCardLog}>
                                <View style={styles.aiOutletHeader}>
                                    <View style={styles.aiOutletHeaderLeft}>
                                        <Sparkles size={20} color="#8B5CF6" />
                                        <Text style={styles.chartTitleLog}>AI Health Outlook</Text>
                                    </View>
                                    {aiPrediction && (
                                        <View style={[styles.aiBadge, aiPrediction.health_label === 'Critical' ? styles.aiBadgeRed : aiPrediction.health_label === 'Warning' ? styles.aiBadgeOrange : styles.aiBadgeGreen]}>
                                            <Text style={[styles.aiBadgeTxt, aiPrediction.health_label === 'Critical' ? styles.aiBadgeRedTxt : aiPrediction.health_label === 'Warning' ? styles.aiBadgeOrangeTxt : styles.aiBadgeGreenTxt]}>{aiPrediction.health_label}</Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={styles.aiOutlookDesc}>
                                    Our AI analyzes your vitals history to forecast trends and flag potential concerns.
                                </Text>
                                
                                {vitalsHistory.length > 0 && (
                                    <AIPredictionChart 
                                        metricName="Heart Rate" 
                                        unit="bpm"
                                        vitalsHistory={vitalsHistory.map(v => ({ 
                                            label: new Date(v.date).toLocaleDateString([], { month: 'short', day: 'numeric' }), 
                                            value: v.heart_rate 
                                        }))}
                                        predictionData={aiPrediction?.predictions ? aiPrediction.predictions.map(p => ({
                                            label: new Date(p.date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
                                            value: p.heart_rate
                                        })) : null}
                                    />
                                )}
                            </View>
                        )}

                        {/* ── Log Vitals Form ──────────────────────── */}
                        <View style={styles.chartCardLog}>
                            <Pressable
                                style={styles.logToggleRow}
                                onPress={() => { setIsLogging(!isLogging); setFormError(null); }}
                            >
                                <Text style={styles.chartTitleLog}>Log Today's Vitals</Text>
                                <View style={[styles.addBadge, isLogging && styles.addBadgeCancel]}>
                                    <Text style={[styles.addBadgeTxt, isLogging && styles.addBadgeCancelTxt]}>{isLogging ? 'Cancel' : '+ Add Entry'}</Text>
                                </View>
                            </Pressable>

                            {isLogging && (
                                <View style={styles.formArea}>
                                    {formError && (
                                        <View style={[styles.errorBanner, { marginBottom: 12 }]}>
                                            <AlertTriangle size={16} color="#DC2626" />
                                            <Text style={styles.errorText}>{formError}</Text>
                                        </View>
                                    )}

                                    <View style={styles.formRow}>
                                        <View style={styles.formGroup}>
                                            <SmartInput label="Heart Rate (bpm)" keyboardType="numeric" placeholder="72"
                                                value={formValues.heart_rate} onChangeText={(t) => setFormValues((p) => ({ ...p, heart_rate: t }))} />
                                        </View>
                                        <View style={styles.formGroup}>
                                            <SmartInput label="O₂ Saturation (%)" keyboardType="numeric" placeholder="98"
                                                value={formValues.oxygen_saturation} onChangeText={(t) => setFormValues((p) => ({ ...p, oxygen_saturation: t }))} />
                                        </View>
                                    </View>

                                    <Text style={[styles.formLabel, { marginTop: 14 }]}>Blood Pressure (mmHg)</Text>
                                    <View style={styles.formRow}>
                                        <View style={styles.formGroup}>
                                            <SmartInput keyboardType="numeric" placeholder="Systolic (120)"
                                                value={formValues.systolic} onChangeText={(t) => setFormValues((p) => ({ ...p, systolic: t }))} />
                                        </View>
                                        <View style={styles.formGroup}>
                                            <SmartInput keyboardType="numeric" placeholder="Diastolic (80)"
                                                value={formValues.diastolic} onChangeText={(t) => setFormValues((p) => ({ ...p, diastolic: t }))} />
                                        </View>
                                    </View>

                                    <View style={styles.formGroup}>
                                        <SmartInput label="Hydration (%)" keyboardType="numeric" placeholder="65"
                                            value={formValues.hydration} onChangeText={(t) => setFormValues((p) => ({ ...p, hydration: t }))} />
                                    </View>

                                    <Pressable style={styles.submitBtn} onPress={handleLogVitals} disabled={submitLoading}>
                                        {submitLoading
                                            ? <ActivityIndicator color="#FFF" />
                                            : <Text style={styles.submitTxt}>Save Record</Text>
                                        }
                                    </Pressable>
                                </View>
                            )}
                        </View>
                    </View>
                </Animated.View>

                <Animated.View style={{ opacity: staggerAnims[4], transform: [{ translateY: staggerAnims[4].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={styles.section}>
                        <View style={[styles.tipCardEnhanced, { backgroundColor: '#FFFFFF' }]}>
                            <View style={styles.tipTitleRow}>
                                <View style={styles.tipIconBox}><Sparkles size={16} color="#0EA5E9" /></View>
                                <Text style={styles.tipLabel}>DAILY HEALTH TIP</Text>
                            </View>
                            <Text style={styles.tipBodyText}>{getDailyTip()}</Text>
                        </View>
                    </View>
                </Animated.View>

                <Animated.View style={{ opacity: staggerAnims[5], transform: [{ translateY: staggerAnims[5].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>QUICK ACTIONS</Text>
                        <View style={styles.quickGrid}>
                            <Pressable style={styles.quickCardEnhanced} onPress={() => navigation.navigate('AdherenceDetails')}>
                                <View style={styles.quickContent}>
                                    <View style={[styles.quickIconBoxEnhanced, { backgroundColor: '#F0FDF4' }]}><CheckCircle2 size={20} color="#16A34A" /></View>
                                    <View style={styles.quickTextView}><Text style={styles.quickCardTitle}>Med Adherence</Text><Text style={styles.quickCardSub}>Progress</Text></View>
                                </View><ChevronRight size={18} color="#CBD5E1" />
                            </Pressable>

                            <Pressable style={styles.quickCardEnhanced} onPress={() => Alert.alert('Coming Soon! 🚀', 'Med Delivery is on its way! We\'re building a seamless way to order and track your medications right from the app. Stay tuned!', [{ text: 'Got it!', style: 'default' }])}>
                                <View style={styles.quickContent}>
                                    <View style={[styles.quickIconBoxEnhanced, { backgroundColor: '#E0F2FE' }]}><Package size={20} color="#0284C7" /></View>
                                    <View style={styles.quickTextView}><Text style={styles.quickCardTitle}>Med Delivery</Text><Text style={styles.quickCardSub}>Coming Soon</Text></View>
                                </View><ChevronRight size={18} color="#CBD5E1" />
                            </Pressable>

                            <Pressable style={styles.quickCardEnhanced} onPress={() => navigation.navigate('HealthProfile')}>
                                <View style={styles.quickContent}>
                                    <View style={[styles.quickIconBoxEnhanced, { backgroundColor: '#F3E8FF' }]}><Activity size={20} color="#9333EA" /></View>
                                    <View style={styles.quickTextView}><Text style={styles.quickCardTitle}>Health Profile</Text><Text style={styles.quickCardSub}>Updated</Text></View>
                                </View><ChevronRight size={18} color="#CBD5E1" />
                            </Pressable>

                            <Pressable style={styles.quickCardEnhanced} onPress={() => navigation.navigate('HealthProfile')}>
                                <View style={styles.quickContent}>
                                    <View style={[styles.quickIconBoxEnhanced, { backgroundColor: '#FEF3C7' }]}><CalendarDays size={20} color="#D97706" /></View>
                                    <View style={styles.quickTextView}><Text style={styles.quickCardTitle}>Schedule</Text><Text style={styles.quickCardSub}>Next Appt</Text></View>
                                </View><ChevronRight size={18} color="#CBD5E1" />
                            </Pressable>
                        </View>
                    </View>
                </Animated.View>
            </ScrollView>
            </LinearGradient>

        </KeyboardAvoidingView>
    );

}
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },

    offlineBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#FEF3C7',
        borderWidth: 1,
        borderColor: '#FDE68A',
        borderRadius: 12,
        paddingVertical: 8,
        paddingHorizontal: 14,
        marginBottom: 16,
    },
    offlineBannerText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#92400E',
    },

    minimalHeader: { paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingHorizontal: 24, paddingBottom: 16, backgroundColor: 'transparent' },

    headerContent: { zIndex: 2 },
    mainHeaderRow: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center'
    },
    headerLeft: { flex: 1, flexShrink: 1, marginRight: 10 },
    greetingGroupCompact: { flexShrink: 1 },
    headerRight: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 12 
    },

    locationPill: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 22, alignSelf: 'flex-start', marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0',
    },
    locationIconBox: {
        width: 16, height: 16, borderRadius: 8, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', marginRight: 6,
    },
    locationLabel: { fontSize: 10, color: '#3B82F6', fontWeight: '800', marginRight: 4, letterSpacing: 0.2, textTransform: 'uppercase' },

    greetingGroupCompact: { flexDirection: 'column', alignItems: 'flex-start' },
    greetingGreeting: { fontSize: 13, color: '#6366F1', fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
    greetingNameCompact: { fontSize: 32, fontWeight: '800', color: '#0F172A', letterSpacing: -1 },

    dateBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
    },
    dateLabelCompact: { fontSize: 13, color: '#94A3B8', fontWeight: '700' },

    bellBtnGlass: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
    bellBadgePremium: { 
        position: 'absolute', 
        top: 11, 
        right: 11, 
        width: 7, 
        height: 7, 
        borderRadius: 3.5, 
        backgroundColor: '#EF4444', 
        borderWidth: 1.5, 
        borderColor: '#1E40AF' 
    },

    avatarContainerPremium: {
        shadowColor: 'rgba(0,0,0,0.1)',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
    },
    avatarOuterRing: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
    avatarInnerPremium: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
    avatarTxtPremium: { fontSize: 16, fontWeight: '900', color: colors.primaryDark },

    headerStatsRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 0, // No longer overlaying
        paddingBottom: 20,
        width: '100%',
    },
    statMiniCardEnhanced: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 12,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 10,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#F1F5F9'
    },
    statIconBox: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    statMiniVal: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
    statMiniLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', marginTop: 2, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },

    body: { flex: 1, width: '100%' },
    bodyContent: { paddingHorizontal: 20, paddingBottom: 110, paddingTop: 12, width: '100%' },

    section: { marginBottom: 32, width: '100%' },
    sectionHeader: { fontSize: 13, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16, marginLeft: 4 },

    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingRight: 4 },
    viewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    viewAllText: { fontSize: 13, fontWeight: '700', color: '#64748B' },

    vitalsScroll: { paddingRight: 24, gap: 16 },
    vitalsCardPremium: {
        width: 170,
        borderRadius: 24,
        padding: 20,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 10,
        elevation: 2,
    },
    vitalsRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    vitalsIconBoxPremium: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

    vitalsMainInfo: { marginBottom: 16 },
    vitalsLabelPremium: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 4 },
    vitalsValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    vitalsValuePremium: { fontSize: 24, fontWeight: '800', color: '#1E293B' },
    vitalsUnitPremium: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },

    trendText: { fontSize: 11, color: '#64748B', fontWeight: '500' },

    medCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 24, marginBottom: 16, overflow: 'hidden', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2, borderWidth: 1, borderColor: '#F1F5F9' },
    medCardInner: { flexDirection: 'row', padding: 20, alignItems: 'center' },
    medIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    medContentMinimal: { flex: 1 },
    medTitleMinimal: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
    medSubMinimal: { fontSize: 13, color: '#64748B', fontWeight: '500' },
    textStrikethrough: { textDecorationLine: 'line-through', color: '#94A3B8' },
    medCardTaken: {
        backgroundColor: '#F0FDF4',
        borderColor: '#DCFCE7',
    },
    takenBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    },
    takenBadgeText: { fontSize: 10, fontWeight: '700', color: '#16A34A' },
    checkboxTouch: { padding: 4 },
    checkboxMinimal: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },

    tipCardEnhanced: { borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 },
    tipTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    tipIconBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(14,165,233,0.1)', alignItems: 'center', justifyContent: 'center' },
    tipLabel: { fontSize: 12, fontWeight: '800', color: '#0EA5E9', letterSpacing: 1 },
    tipBodyText: { fontSize: 15, color: '#334155', lineHeight: 24, fontWeight: '500' },

    quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    quickCardEnhanced: { width: '47.5%', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: '#F1F5F9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#0A2463', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4 },
    quickContent: { flex: 1, gap: 12 },
    quickIconBoxEnhanced: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    quickTextView: { flex: 1 },
    quickCardTitle: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
    quickCardSub: { fontSize: 12, color: '#64748B', marginTop: 3, fontWeight: '600' },

    /* Log Form Styles */
    chartCardLog: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginTop: 24,
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: 'rgba(10, 36, 99, 0.1)', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 1, shadowRadius: 20, elevation: 5,
    },
    syncCardTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B', flexShrink: 1 },
    syncTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    chartTitleLog: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
    logToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    addBadge: { backgroundColor: 'rgba(59,134,255,0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
    addBadgeTxt: { color: '#3B86FF', fontSize: 13, fontWeight: '700' },
    addBadgeCancel: { backgroundColor: 'rgba(239,68,68,0.1)' },
    addBadgeCancelTxt: { color: '#EF4444' },

    aiOutletHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    aiOutletHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    aiOutlookDesc: { fontSize: 13, color: '#64748B', lineHeight: 18, marginBottom: 12 },
    aiBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
    aiBadgeTxt: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    aiBadgeGreen: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
    aiBadgeGreenTxt: { color: '#16A34A' },
    aiBadgeOrange: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
    aiBadgeOrangeTxt: { color: '#D97706' },
    aiBadgeRed: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
    aiBadgeRedTxt: { color: '#DC2626' },

    formArea: { marginTop: 20 },
    formRow: { flexDirection: 'row', gap: 12 },
    formGroup: { flex: 1, marginBottom: 4 },
    formLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 },
    formInput: {
        backgroundColor: '#FAFBFF', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 20,
        paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: '#0F172A', fontWeight: '600',
        height: 48,
    },

    submitBtn: {
        borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20,
        overflow: 'hidden', backgroundColor: '#3B86FF',
        shadowColor: '#3B86FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
    },
    submitTxt: { color: '#FFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },

    errorBanner: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
        borderRadius: 16, padding: 14, gap: 10,
    },
    errorText: { flex: 1, color: '#991B1B', fontSize: 13, fontWeight: '600', lineHeight: 18 },

    // ── Health Sync Card ──────────────────────────
    syncCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        borderStyle: 'dashed',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
    },
    syncCardConnected: {
        borderColor: '#BBF7D0',
        borderStyle: 'solid',
        backgroundColor: '#F0FDF4',
    },
    syncCardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 14,
    },
    syncIconBox: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    syncCardContent: {
        flex: 1,
    },
    syncTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 2,
    },
    syncCardTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1E293B',
    },
    syncCardSub: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '500',
    },
    syncingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    syncingBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#D97706',
    },

    /* ── Medication Insight Card ── */
    medInsightCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20,
        borderWidth: 1.5, borderColor: '#EEF2FF',
        shadowColor: '#6366F1', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 5,
        marginBottom: 12,
    },
    medInsightTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    medInsightLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
    medInsightIconBox: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
    medInsightCount: { fontSize: 17, fontWeight: '800', color: '#1E293B', letterSpacing: -0.3 },
    medInsightNext: { fontSize: 13, fontWeight: '600', color: '#64748B', marginTop: 2 },
    medInsightRight: { alignItems: 'center' },
    medInsightPct: { fontSize: 28, fontWeight: '900', color: '#6366F1', letterSpacing: -1 },
    medInsightPctLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 },

    adherenceBarBg: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, marginBottom: 14, overflow: 'hidden' },
    adherenceBarFill: { height: 6, backgroundColor: '#6366F1', borderRadius: 3 },

    medInsightFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    medInsightFooterTxt: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },

    /* ── Empty Med State ── */
    emptyMedCard: {
        backgroundColor: '#FAFBFF', borderRadius: 24, padding: 32, alignItems: 'center',
        borderWidth: 1.5, borderColor: '#E2E8F0', borderStyle: 'dashed',
    },
    emptyMedIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    emptyMedTitle: { fontSize: 16, fontWeight: '700', color: '#475569', marginBottom: 6 },
    emptyMedSub: { fontSize: 13, fontWeight: '500', color: '#94A3B8', textAlign: 'center', lineHeight: 20 },

    /* ── Streak / Progress Banners ── */
    streakBanner: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
        borderRadius: 16, padding: 14, paddingHorizontal: 16, marginBottom: 16,
    },
    streakBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    streakEmoji: { fontSize: 22 },
    streakTitle: { fontSize: 14, fontWeight: '800', color: '#92400E' },
    streakSub: { fontSize: 12, fontWeight: '500', color: '#B45309', marginTop: 1 },
    streakDismiss: { fontSize: 16, color: '#D97706', fontWeight: '700', padding: 4 },
});

