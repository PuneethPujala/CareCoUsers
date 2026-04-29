import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import {
    View, Text, StyleSheet, Animated, Pressable, ScrollView, SafeAreaView,
    Platform, Dimensions, Easing, RefreshControl, Modal, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart } from 'react-native-chart-kit';
import {
    X, TrendingUp, TrendingDown, Minus, Award, Target, Calendar as CalIcon,
    CheckCircle2, Zap, ChevronLeft, Sparkles, Heart, Star, Share2, Flame, Lock,
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import usePatientStore from '../../store/usePatientStore';
import RecapStoryModal from '../../components/adherence/RecapStoryModal';
import {
    startOfMonth, endOfMonth, eachDayOfInterval, format, isToday,
    startOfWeek, endOfWeek, isSameMonth, parseISO,
} from 'date-fns';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Color System ──────────────────────────────────────────────
const C = {
    bg: '#F0F4FF',
    card: '#FFFFFF',
    primary: '#4361EE',
    primarySoft: '#EEF2FF',
    success: '#10B981',
    successBg: '#ECFDF5',
    warning: '#F59E0B',
    warningBg: '#FFFBEB',
    danger: '#F43F5E',
    dangerBg: '#FFF1F2',
    purple: '#7C3AED',
    purpleBg: '#F5F3FF',
    dark: '#0F172A',
    mid: '#334155',
    muted: '#64748B',
    light: '#94A3B8',
    border: '#E8EDF5',
    ring90: '#10B981',
    ring70: '#F59E0B',
    ringLow: '#F43F5E',
};

const LEVEL_COLORS = {
    optimal: '#10B981',
    consistent: '#4361EE',
    improving: '#F59E0B',
    beginner: '#94A3B8',
};

const STATUS_COLORS = {
    complete: '#10B981',
    partial: '#F59E0B',
    missed: '#F43F5E',
    none: '#E2E8F0',
};

// ── Animated Circular Progress ─────────────────────────────────
const CircularProgress = ({ progress, size = 160, strokeWidth = 14, color }) => {
    const animValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(animValue, {
            toValue: progress,
            duration: 1400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [progress]);

    const ringColor = color || (progress >= 90 ? C.ring90 : progress >= 70 ? C.ring70 : C.ringLow);

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            {/* Background ring */}
            <View style={{
                position: 'absolute',
                width: size, height: size, borderRadius: size / 2,
                borderWidth: strokeWidth, borderColor: 'rgba(255,255,255,0.15)',
            }} />
            {/* Progress arc */}
            <Animated.View style={{
                position: 'absolute',
                width: size - 4, height: size - 4,
                borderRadius: (size - 4) / 2,
                borderWidth: strokeWidth,
                borderColor: ringColor,
                borderTopColor: 'transparent',
                borderRightColor: 'transparent',
                transform: [{
                    rotate: animValue.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['-45deg', '315deg'],
                    }),
                }],
                opacity: animValue.interpolate({
                    inputRange: [0, 8],
                    outputRange: [0.2, 1],
                    extrapolate: 'clamp',
                }),
            }} />
            {/* Glow for high scores */}
            {progress >= 90 && (
                <Animated.View style={{
                    position: 'absolute',
                    width: size + 20, height: size + 20,
                    borderRadius: (size + 20) / 2,
                    backgroundColor: ringColor + '20',
                    transform: [{
                        scale: animValue.interpolate({
                            inputRange: [85, 100],
                            outputRange: [0.95, 1.06],
                            extrapolate: 'clamp',
                        }),
                    }],
                    opacity: animValue.interpolate({
                        inputRange: [88, 100],
                        outputRange: [0, 1],
                        extrapolate: 'clamp',
                    }),
                }} />
            )}
        </View>
    );
};

// ── Animated Number Counter ─────────────────────────────────────
const AnimatedNumber = ({ value, style, suffix = '%' }) => {
    const animValue = useRef(new Animated.Value(0)).current;
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        animValue.setValue(0);
        Animated.timing(animValue, {
            toValue: value,
            duration: 1100,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
        const listener = animValue.addListener(({ value: v }) => setDisplayValue(Math.round(v)));
        return () => animValue.removeListener(listener);
    }, [value]);

    return <Text style={style}>{displayValue}{suffix}</Text>;
};

// ── Feedback Message ────────────────────────────────────────────
const getFeedbackMessage = (score, momentum) => {
    if (score >= 95) return { text: "Outstanding! You're at peak consistency 🌟", color: C.success };
    if (score >= 90) return { text: "Excellent work! You're building great habits 💙", color: C.success };
    if (score >= 80) return { text: "Wonderful consistency! Keep this rhythm going ✨", color: C.primary };
    if (score >= 70) return { text: "Good progress! Every dose counts toward better health 🌿", color: C.primary };
    if (score >= 50) return { text: "You're improving! Small steps lead to big changes 🌱", color: C.warning };
    if (momentum === 'rising') return { text: "Your recent trend is looking up! 📈", color: C.primary };
    return { text: "Every new day is a fresh start. You've got this 💪", color: C.muted };
};

// ── Calendar Day Cell ───────────────────────────────────────────
const CalendarDay = ({ date, status, isCurrentMonth, onPress }) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const todayFlag = isToday(date);
    const bg = STATUS_COLORS[status] || 'transparent';

    const handlePress = () => {
        Animated.sequence([
            Animated.spring(scaleAnim, { toValue: 1.2, friction: 5, useNativeDriver: true }),
            Animated.spring(scaleAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
        ]).start();
        if (onPress) onPress();
    };

    return (
        <Pressable onPress={handlePress} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2.5 }}>
            <Animated.View style={[
                styles.dayCell,
                {
                    opacity: isCurrentMonth ? 1 : 0.25,
                    backgroundColor: status && status !== 'none' ? bg + '22' : todayFlag ? C.primarySoft : 'transparent',
                    borderWidth: todayFlag ? 2 : status && status !== 'none' ? 1.5 : 0,
                    borderColor: todayFlag ? C.primary : status && status !== 'none' ? bg + '60' : 'transparent',
                    transform: [{ scale: scaleAnim }],
                },
            ]}>
                {status === 'complete' ? (
                    <CheckCircle2 size={15} color={C.success} />
                ) : (
                    <Text style={[
                        styles.dayText,
                        todayFlag && { color: C.primary, fontWeight: '800' },
                        status === 'partial' && { color: C.warning, fontWeight: '700' },
                        status === 'missed' && { color: C.danger, fontWeight: '700' },
                    ]}>
                        {format(date, 'd')}
                    </Text>
                )}
            </Animated.View>
        </Pressable>
    );
};

// ── Achievement Badge ───────────────────────────────────────────
const BADGE_CONFIGS = {
    first_perfect_day: { Icon: CheckCircle2, grad: ['#10B981', '#059669'] },
    '3_day_consistent': { Icon: Zap, grad: ['#F59E0B', '#D97706'] },
    never_missed_morning: { Icon: Star, grad: ['#4361EE', '#2563EB'] },
    weekly_90: { Icon: Target, grad: ['#7C3AED', '#6D28D9'] },
    '7_perfect_days': { Icon: Sparkles, grad: ['#06B6D4', '#0891B2'] },
    monthly_consistent: { Icon: Award, grad: ['#F43F5E', '#E11D48'] },
};

const AchievementBadge = ({ achievement, index }) => {
    const scaleAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            delay: index * 70,
            friction: 6,
            tension: 55,
            useNativeDriver: true,
        }).start();
    }, []);

    const unlocked = achievement.unlocked;
    const cfg = BADGE_CONFIGS[achievement.key] || { Icon: Award, grad: ['#94A3B8', '#64748B'] };
    const { Icon: BadgeIcon, grad } = cfg;
    const cardWidth = (SCREEN_WIDTH - 40 - 12) / 2;

    return (
        <Animated.View style={[
            styles.achievementCard,
            { width: cardWidth, transform: [{ scale: scaleAnim }] },
            !unlocked && styles.achievementLocked,
        ]}>
            <LinearGradient
                colors={unlocked ? grad : ['#E2E8F0', '#CBD5E1']}
                style={styles.achievementIconCircle}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
                {unlocked
                    ? <BadgeIcon size={20} color="#FFFFFF" strokeWidth={2.5} />
                    : <Lock size={16} color="#94A3B8" strokeWidth={2.5} />
                }
            </LinearGradient>
            <Text style={[styles.achievementLabel, !unlocked && { color: C.light }]} numberOfLines={2}>
                {achievement.label}
            </Text>
            <Text style={[styles.achievementDesc, !unlocked && { color: '#CBD5E1' }]} numberOfLines={2}>
                {achievement.description}
            </Text>
            <View style={[styles.achievementStatus, { backgroundColor: unlocked ? C.successBg : '#F1F5F9' }]}>
                {unlocked && <CheckCircle2 size={10} color={C.success} />}
                <Text style={[styles.achievementStatusText, { color: unlocked ? C.success : C.light }]}>
                    {unlocked ? 'Unlocked' : 'Locked'}
                </Text>
            </View>
        </Animated.View>
    );
};

// ── Skeleton Loader ─────────────────────────────────────────────
const Skeleton = ({ width, height, borderRadius = 10, style }) => {
    const anim = useRef(new Animated.Value(0.4)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
                Animated.timing(anim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
            ])
        ).start();
    }, []);
    return <Animated.View style={[{ width, height, borderRadius, backgroundColor: '#E2E8F0', opacity: anim }, style]} />;
};

// ══════════════════════════════════════════════════════════════
// ══ MAIN SCREEN ═══════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
const RECAP_TABS = ['weekly', 'monthly', 'yearly'];
const RECAP_LABELS = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

export default function AdherenceScreen({ navigation }) {
    const adherenceDetails = usePatientStore((s) => s.adherenceDetails);
    const adherenceRecap = usePatientStore((s) => s.adherenceRecap);
    const fetchAdherenceDetails = usePatientStore((s) => s.fetchAdherenceDetails);
    const fetchAdherenceRecap = usePatientStore((s) => s.fetchAdherenceRecap);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDay, setSelectedDay] = useState(null);
    const [activeRecapTab, setActiveRecapTab] = useState('weekly');
    const [showStoryModal, setShowStoryModal] = useState(false);

    // Use ref to avoid double-fetch when tab changes while screen is focused
    const activeRecapTabRef = useRef('weekly');
    useEffect(() => { activeRecapTabRef.current = activeRecapTab; }, [activeRecapTab]);

    // Tab slide indicator
    const tabSlideAnim = useRef(new Animated.Value(0)).current;
    const tabWidth = (SCREEN_WIDTH - 48) / 3;

    // Stagger animations — 7 unique slots
    const staggerAnims = useRef([...Array(7)].map(() => new Animated.Value(0))).current;

    const runAnimations = useCallback(() => {
        staggerAnims.forEach(a => a.setValue(0));
        Animated.stagger(100,
            staggerAnims.map(a => Animated.spring(a, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }))
        ).start();
    }, [staggerAnims]);

    const loadData = useCallback(async () => {
        await Promise.all([
            fetchAdherenceDetails(),
            fetchAdherenceRecap(activeRecapTabRef.current),
        ]);
        setLoading(false);
        runAnimations();
    }, [fetchAdherenceDetails, fetchAdherenceRecap, runAnimations]);

    useFocusEffect(
        useCallback(() => { loadData(); }, [loadData])
    );

    const switchRecapTab = (tab) => {
        const idx = RECAP_TABS.indexOf(tab);
        Animated.spring(tabSlideAnim, { toValue: idx * tabWidth, friction: 8, useNativeDriver: true }).start();
        setActiveRecapTab(tab);
        fetchAdherenceRecap(tab);
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await Promise.all([
            fetchAdherenceDetails(),
            fetchAdherenceRecap(activeRecapTabRef.current),
        ]);
        setRefreshing(false);
    };

    // ── Derived data ──────────────────────────────────────────
    const data = adherenceDetails || {};
    const score = data.score || { weekly: 0, monthly: 0 };
    const level = data.level || { key: 'beginner', label: 'Beginner', emoji: '🌱' };
    const momentum = data.momentum || 'steady';
    const today = data.today || { taken: 0, total: 0, completed: false };
    const dailyLog = data.daily_log || [];
    const achievements = data.achievements || [];
    const weeklySummary = data.weekly_summary || { taken: 0, missed: 0, improvement: 0 };
    const vitalsAdherence = data.vitals_adherence || 0;
    const insights = data.insights || [];
    const streak = data.streak || 0;
    const weeklyTrend = data.weekly_trend || [];

    const feedback = getFeedbackMessage(score.monthly, momentum);
    const levelColor = LEVEL_COLORS[level.key] || C.light;

    const MomentumIcon = momentum === 'rising' ? TrendingUp : momentum === 'falling' ? TrendingDown : Minus;
    const momentumColor = momentum === 'rising' ? C.success : momentum === 'falling' ? C.danger : C.warning;
    const momentumLabel = momentum === 'rising' ? 'Rising' : momentum === 'falling' ? 'Falling' : 'Steady';

    const ringColor = score.monthly >= 90 ? C.ring90 : score.monthly >= 70 ? C.ring70 : C.ringLow;

    // Calendar
    const calendarDays = useMemo(() => {
        const now = new Date();
        return eachDayOfInterval({ start: startOfWeek(startOfMonth(now)), end: endOfWeek(endOfMonth(now)) });
    }, []);

    const dailyLogMap = useMemo(() => {
        const map = {};
        dailyLog.forEach(d => { map[d.date] = d; });
        return map;
    }, [dailyLog]);

    const anim = (i) => ({
        opacity: staggerAnims[i],
        transform: [{ translateY: staggerAnims[i].interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
    });

    // ── Loading Skeleton ────────────────────────────────────
    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
                <View style={styles.header}>
                    <Skeleton width={40} height={40} borderRadius={14} />
                    <Skeleton width={160} height={22} style={{ marginLeft: 12 }} />
                </View>
                <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
                    <Skeleton width="100%" height={220} borderRadius={28} />
                    <Skeleton width="100%" height={80} borderRadius={20} />
                    <Skeleton width="100%" height={130} borderRadius={20} />
                    <Skeleton width="100%" height={200} borderRadius={20} />
                </ScrollView>
            </SafeAreaView>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: C.bg }}>
            {/* Decorative blobs */}
            <View style={{ position: 'absolute', top: -80, right: -60, width: 260, height: 260, borderRadius: 130, backgroundColor: C.primary + '18' }} />
            <View style={{ position: 'absolute', top: 380, left: -80, width: 200, height: 200, borderRadius: 100, backgroundColor: C.purple + '12' }} />

            <SafeAreaView style={{ flex: 1 }}>
                {/* ── Header ── */}
                <View style={styles.header}>
                    <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <ChevronLeft size={22} color={C.dark} />
                    </Pressable>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.headerTitle}>Adherence</Text>
                        <Text style={styles.headerSub}>Track your medication journey</Text>
                    </View>
                    <Pressable
                        style={styles.shareBtn}
                        onPress={() => setShowStoryModal(true)}
                    >
                        <Share2 size={15} color="#FFF" />
                        <Text style={styles.shareBtnText}>Share</Text>
                    </Pressable>
                </View>

                {/* ── Period Tabs ── */}
                <View style={styles.tabsContainer}>
                    <View style={styles.tabsInner}>
                        <Animated.View
                            style={[styles.tabSlider, { width: tabWidth - 4, transform: [{ translateX: tabSlideAnim }] }]}
                        />
                        {RECAP_TABS.map((tab) => (
                            <Pressable key={tab} style={[styles.tab, { width: tabWidth }]} onPress={() => switchRecapTab(tab)}>
                                <Text style={[styles.tabText, activeRecapTab === tab && styles.tabTextActive]}>
                                    {RECAP_LABELS[tab]}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
                >

                    {/* ── [0] Hero Gradient Card ── */}
                    <Animated.View style={anim(0)}>
                        <LinearGradient
                            colors={['#1E1B4B', '#312E81', '#4338CA']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            style={styles.heroCard}
                        >
                            {/* Inner glow accent */}
                            <View style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: '#6366F1', opacity: 0.25 }} />

                            <View style={styles.heroTopRow}>
                                {/* Ring */}
                                <View style={styles.heroRingWrap}>
                                    <CircularProgress progress={score.monthly} size={148} strokeWidth={13} color={ringColor} />
                                    <View style={styles.heroRingCenter}>
                                        <AnimatedNumber value={score.monthly} style={styles.heroRingPercent} />
                                        <Text style={styles.heroRingLabel}>Monthly</Text>
                                    </View>
                                </View>

                                {/* Right stats */}
                                <View style={styles.heroRightCol}>
                                    <View style={styles.heroStatBox}>
                                        <Text style={styles.heroStatLabel}>This Week</Text>
                                        <AnimatedNumber value={score.weekly} style={styles.heroStatValue} />
                                    </View>
                                    <View style={styles.heroStatDivider} />
                                    <View style={styles.heroStatBox}>
                                        <Text style={styles.heroStatLabel}>Momentum</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                            <View style={{ backgroundColor: momentumColor + '30', borderRadius: 8, padding: 3 }}>
                                                <MomentumIcon size={14} color={momentumColor} />
                                            </View>
                                            <Text style={[styles.heroStatValue, { color: momentumColor, fontSize: 15 }]}>{momentumLabel}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.heroStatDivider} />
                                    <View style={styles.heroStatBox}>
                                        <Text style={styles.heroStatLabel}>Level</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                                            <Text style={{ fontSize: 16 }}>{level.emoji}</Text>
                                            <Text style={[styles.heroStatValue, { color: levelColor, fontSize: 13 }]}>{level.label}</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>

                            {/* Today's progress bar */}
                            <View style={styles.heroProgressSection}>
                                <View style={styles.heroProgressHeader}>
                                    <Target size={13} color="rgba(255,255,255,0.7)" />
                                    <Text style={styles.heroProgressTitle}>Today's Goal</Text>
                                    <Text style={styles.heroProgressCount}>
                                        {today.taken}<Text style={{ fontSize: 13, opacity: 0.6 }}>/{today.total || '—'} doses</Text>
                                    </Text>
                                    {today.completed && (
                                        <View style={styles.heroCompletedPill}>
                                            <Sparkles size={10} color="#10B981" />
                                            <Text style={styles.heroCompletedText}>Done!</Text>
                                        </View>
                                    )}
                                </View>
                                <View style={styles.heroProgressBg}>
                                    <Animated.View style={[
                                        styles.heroProgressFill,
                                        {
                                            width: today.total > 0 ? `${Math.min(100, (today.taken / today.total) * 100)}%` : '0%',
                                            backgroundColor: today.completed ? '#10B981' : '#818CF8',
                                        },
                                    ]} />
                                </View>
                            </View>
                        </LinearGradient>
                    </Animated.View>

                    {/* ── [1] Streak Banner ── */}
                    <Animated.View style={anim(1)}>
                        <LinearGradient
                            colors={streak >= 7 ? ['#F97316', '#EF4444'] : streak >= 3 ? ['#F59E0B', '#F97316'] : ['#64748B', '#475569']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.streakCard}
                        >
                            <View style={styles.streakLeft}>
                                <Flame size={36} color="#FFF" fill={streak > 0 ? '#FFF' : 'transparent'} />
                                <View>
                                    <Text style={styles.streakNum}>{streak} Day Streak</Text>
                                    <Text style={styles.streakSub}>
                                        {streak >= 7 ? "You're on fire! Keep it up 🔥" :
                                            streak >= 3 ? 'Building momentum! 💪' :
                                                streak > 0 ? 'Great start! Keep going 🌱' :
                                                    'Take your meds to start your streak'}
                                    </Text>
                                </View>
                            </View>
                            {streak > 0 && (
                                <View style={styles.streakBadge}>
                                    <Text style={styles.streakBadgeNum}>{streak}</Text>
                                    <Text style={styles.streakBadgeLabel}>DAYS</Text>
                                </View>
                            )}
                        </LinearGradient>
                    </Animated.View>

                    {/* ── [2] Recap Stats ── */}
                    {adherenceRecap && (
                        <Animated.View style={anim(2)}>
                            <View style={styles.card}>
                                <View style={styles.cardHeaderRow}>
                                    <Text style={styles.cardTitle}>
                                        {activeRecapTab === 'yearly' && adherenceRecap.is_all_time_fallback
                                            ? 'ALL TIME RECAP'
                                            : `${RECAP_LABELS[activeRecapTab].toUpperCase()} RECAP`}
                                    </Text>
                                    <View style={[styles.levelPill, { backgroundColor: (adherenceRecap.level?.key === 'optimal' ? C.success : adherenceRecap.level?.key === 'consistent' ? C.primary : C.warning) + '18' }]}>
                                        <Text style={{ fontSize: 12 }}>{adherenceRecap.level?.emoji || '🌱'}</Text>
                                        <Text style={[styles.levelPillText, {
                                            color: adherenceRecap.level?.key === 'optimal' ? C.success :
                                                adherenceRecap.level?.key === 'consistent' ? C.primary : C.warning
                                        }]}>{adherenceRecap.level?.label || 'Beginner'}</Text>
                                    </View>
                                </View>

                                <View style={styles.recapStatsRow}>
                                    {[
                                        { label: 'Adherence', value: `${adherenceRecap.adherence_rate || 0}%`, color: C.primary, grad: ['#4361EE', '#818CF8'] },
                                        { label: 'Perfect Days', value: adherenceRecap.perfect_days || 0, color: C.success, grad: ['#10B981', '#34D399'] },
                                        { label: 'Doses Taken', value: adherenceRecap.total_doses_taken || 0, color: C.purple, grad: ['#7C3AED', '#A78BFA'] },
                                    ].map((item, i) => (
                                        <View key={i} style={styles.recapStatItem}>
                                            <LinearGradient colors={item.grad} style={styles.recapStatIconBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                                <Text style={{ fontSize: 18, fontWeight: '900', color: '#FFF' }}>{item.value}</Text>
                                            </LinearGradient>
                                            <Text style={styles.recapStatLabel}>{item.label}</Text>
                                        </View>
                                    ))}
                                </View>

                                {adherenceRecap.improvement_vs_previous !== 0 && (
                                    <View style={styles.improvementRow}>
                                        {adherenceRecap.improvement_vs_previous > 0
                                            ? <TrendingUp size={13} color={C.success} />
                                            : <TrendingDown size={13} color={C.danger} />}
                                        <Text style={[styles.improvementText, { color: adherenceRecap.improvement_vs_previous > 0 ? C.success : C.danger }]}>
                                            {adherenceRecap.improvement_vs_previous > 0 ? '+' : ''}{adherenceRecap.improvement_vs_previous}% vs previous {activeRecapTab === 'yearly' ? 'year' : activeRecapTab === 'monthly' ? 'month' : 'week'}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </Animated.View>
                    )}

                    {/* ── [3] Feedback + Insights ── */}
                    <Animated.View style={anim(3)}>
                        <View style={[styles.feedbackBanner, { backgroundColor: feedback.color + '12', borderColor: feedback.color + '30' }]}>
                            <Heart size={16} color={feedback.color} fill={feedback.color + '40'} />
                            <Text style={[styles.feedbackText, { color: feedback.color }]}>{feedback.text}</Text>
                        </View>

                        {insights.length > 0 && (
                            <View style={{ gap: 10, marginBottom: 20 }}>
                                {insights.map((insight, idx) => (
                                    <View key={idx} style={styles.insightCard}>
                                        <View style={styles.insightLeft}>
                                            <View style={styles.insightIconBox}>
                                                <Sparkles size={14} color={C.purple} />
                                            </View>
                                            <Text style={styles.insightText}>{insight}</Text>
                                        </View>
                                        {insight.includes('afternoon') && (
                                            <Pressable
                                                style={styles.reminderBtn}
                                                onPress={() => Alert.alert('Set Reminder', 'Afternoon medication reminder will be added to your notifications.', [{ text: 'OK' }])}
                                            >
                                                <Text style={styles.reminderBtnText}>Set Reminder</Text>
                                            </Pressable>
                                        )}
                                    </View>
                                ))}
                            </View>
                        )}
                    </Animated.View>

                    {/* ── [4] 7-Day Trend ── */}
                    <Animated.View style={anim(4)}>
                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>7-DAY ADHERENCE TREND</Text>

                            <View style={{ alignItems: 'center', marginHorizontal: -8, marginTop: 4, marginBottom: 16 }}>
                                <LineChart
                                    data={{
                                        labels: weeklyTrend.length > 0 ? weeklyTrend.map(d => d.day) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                                        datasets: [{ data: weeklyTrend.length > 0 ? weeklyTrend.map(d => Math.max(d.rate, 1)) : [1, 1, 1, 1, 1, 1, 1] }],
                                    }}
                                    width={SCREEN_WIDTH - 48}
                                    height={170}
                                    chartConfig={{
                                        backgroundColor: 'transparent',
                                        backgroundGradientFrom: '#FFFFFF',
                                        backgroundGradientFromOpacity: 0,
                                        backgroundGradientTo: '#FFFFFF',
                                        backgroundGradientToOpacity: 0,
                                        decimalPlaces: 0,
                                        color: (opacity = 1) => `rgba(67, 97, 238, ${opacity})`,
                                        labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
                                        propsForDots: { r: '5', strokeWidth: '2', stroke: '#4361EE', fill: '#EEF2FF' },
                                        propsForBackgroundLines: { strokeDasharray: '4', strokeWidth: 1, stroke: 'rgba(226, 232, 240, 0.8)' },
                                    }}
                                    bezier
                                    style={{ borderRadius: 16 }}
                                    withInnerLines
                                    withOuterLines={false}
                                    withVerticalLines={false}
                                />
                            </View>

                            <View style={styles.trendStatsRow}>
                                <View style={styles.trendStatItem}>
                                    <View style={[styles.trendDot, { backgroundColor: C.success }]} />
                                    <Text style={styles.trendStatNum}>{weeklySummary.taken}</Text>
                                    <Text style={styles.trendStatLabel}>Taken</Text>
                                </View>
                                <View style={styles.trendDivider} />
                                <View style={styles.trendStatItem}>
                                    <View style={[styles.trendDot, { backgroundColor: C.danger }]} />
                                    <Text style={styles.trendStatNum}>{weeklySummary.missed}</Text>
                                    <Text style={styles.trendStatLabel}>Missed</Text>
                                </View>
                                <View style={styles.trendDivider} />
                                <View style={styles.trendStatItem}>
                                    <MomentumIcon size={14} color={weeklySummary.improvement >= 0 ? C.success : C.danger} />
                                    <Text style={[styles.trendStatNum, { color: weeklySummary.improvement >= 0 ? C.success : C.danger }]}>
                                        {weeklySummary.improvement >= 0 ? '+' : ''}{weeklySummary.improvement}%
                                    </Text>
                                    <Text style={styles.trendStatLabel}>vs Last</Text>
                                </View>
                            </View>

                            {/* Vitals adherence row */}
                            <View style={styles.vitalsRow}>
                                <View style={styles.vitalsHeader}>
                                    <Heart size={14} color={C.danger} />
                                    <Text style={styles.vitalsLabel}>Vitals Logging</Text>
                                    <Text style={[styles.vitalsValue, { color: vitalsAdherence >= 70 ? C.success : vitalsAdherence >= 40 ? C.warning : C.danger }]}>
                                        {vitalsAdherence}%
                                    </Text>
                                </View>
                                <View style={styles.vitalsBarBg}>
                                    <View style={[styles.vitalsBarFill, {
                                        width: `${vitalsAdherence}%`,
                                        backgroundColor: vitalsAdherence >= 70 ? C.success : vitalsAdherence >= 40 ? C.warning : C.danger,
                                    }]} />
                                </View>
                            </View>
                        </View>
                    </Animated.View>

                    {/* ── [5] Calendar Heatmap ── */}
                    <Animated.View style={anim(5)}>
                        <View style={styles.card}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                <View style={[styles.cardIconBox, { backgroundColor: C.primarySoft }]}>
                                    <CalIcon size={15} color={C.primary} />
                                </View>
                                <Text style={styles.cardTitle}>{format(new Date(), 'MMMM yyyy').toUpperCase()}</Text>
                            </View>

                            <View style={styles.weekDaysRow}>
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                                    <Text key={i} style={styles.weekDayLabel}>{d.charAt(0)}</Text>
                                ))}
                            </View>

                            <View style={styles.calendarGrid}>
                                {calendarDays.map((date, idx) => {
                                    const dateStr = format(date, 'yyyy-MM-dd');
                                    const entry = dailyLogMap[dateStr];
                                    return (
                                        <CalendarDay
                                            key={idx}
                                            date={date}
                                            status={entry?.status}
                                            isCurrentMonth={isSameMonth(date, new Date())}
                                            onPress={() => setSelectedDay(entry || {
                                                date: dateStr, status: 'none', rate: 0, medicines: [], vitals: null,
                                            })}
                                        />
                                    );
                                })}
                            </View>

                            <View style={styles.legendRow}>
                                {[
                                    { label: 'Complete', color: C.success },
                                    { label: 'Partial', color: C.warning },
                                    { label: 'Missed', color: C.danger },
                                    { label: 'No Data', color: '#CBD5E1' },
                                ].map((item) => (
                                    <View key={item.label} style={styles.legendItem}>
                                        <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                                        <Text style={styles.legendText}>{item.label}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </Animated.View>

                    {/* ── [6] Achievements ── */}
                    <Animated.View style={anim(6)}>
                        <View style={styles.achievementsSection}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                <LinearGradient colors={['#7C3AED', '#4361EE']} style={styles.cardIconBox} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                    <Award size={15} color="#FFF" />
                                </LinearGradient>
                                <Text style={styles.cardTitle}>ACHIEVEMENTS</Text>
                                <View style={{ marginLeft: 'auto', backgroundColor: C.purpleBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: C.purple }}>
                                        {achievements.filter(a => a.unlocked).length}/{achievements.length}
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.achievementsGrid}>
                                {achievements.map((achievement, idx) => (
                                    <AchievementBadge key={achievement.key} achievement={achievement} index={idx} />
                                ))}
                            </View>
                        </View>
                    </Animated.View>

                    <View style={{ height: 100 }} />
                </ScrollView>
            </SafeAreaView>

            {/* ── Recap Story Modal ── */}
            <RecapStoryModal
                visible={showStoryModal}
                onClose={() => setShowStoryModal(false)}
                recap={adherenceRecap}
                period={activeRecapTab}
            />

            {/* ── Day Detail Bottom Sheet ── */}
            <Modal
                visible={!!selectedDay}
                animationType="slide"
                transparent
                onRequestClose={() => setSelectedDay(null)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={styles.modalBackdrop} onPress={() => setSelectedDay(null)} />
                    <View style={styles.bottomSheet}>
                        <View style={styles.sheetHandle} />
                        {selectedDay && (
                            <>
                                <View style={styles.sheetHeader}>
                                    <View>
                                        <Text style={styles.sheetDate}>{format(parseISO(selectedDay.date), 'EEEE, MMMM do')}</Text>
                                        <Text style={styles.sheetYear}>{format(parseISO(selectedDay.date), 'yyyy')}</Text>
                                    </View>
                                    <View style={[styles.sheetBadge, { backgroundColor: STATUS_COLORS[selectedDay.status] + '22' }]}>
                                        <Text style={[styles.sheetBadgeText, { color: STATUS_COLORS[selectedDay.status] }]}>
                                            {selectedDay.rate}% adherence
                                        </Text>
                                    </View>
                                </View>

                                {selectedDay.medicines && selectedDay.medicines.length > 0 ? (
                                    <View style={{ marginBottom: 16 }}>
                                        <Text style={styles.sheetSectionLabel}>MEDICATIONS</Text>
                                        {selectedDay.medicines.map((med, idx) => (
                                            <View key={idx} style={styles.sheetMedRow}>
                                                <View style={[styles.sheetMedIcon, { backgroundColor: med.taken ? C.successBg : C.dangerBg }]}>
                                                    {med.taken
                                                        ? <CheckCircle2 size={14} color={C.success} />
                                                        : <X size={14} color={C.danger} />}
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.sheetMedName, !med.taken && { textDecorationLine: 'line-through', color: C.muted }]}>
                                                        {med.name}
                                                    </Text>
                                                    <Text style={styles.sheetMedTime}>{med.time}</Text>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                ) : (
                                    <Text style={styles.sheetEmpty}>No medications scheduled for this day.</Text>
                                )}

                                {selectedDay.vitals && (
                                    <View style={styles.sheetVitals}>
                                        <Text style={styles.sheetSectionLabel}>VITALS LOGGED</Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                                            {selectedDay.vitals.heart_rate && (
                                                <View style={styles.sheetVitalChip}><Text style={styles.sheetVitalText}>💓 {selectedDay.vitals.heart_rate} bpm</Text></View>
                                            )}
                                            {selectedDay.vitals.systolic && (
                                                <View style={styles.sheetVitalChip}><Text style={styles.sheetVitalText}>🩸 {selectedDay.vitals.systolic}/{selectedDay.vitals.diastolic}</Text></View>
                                            )}
                                            {selectedDay.vitals.oxygen_saturation && (
                                                <View style={styles.sheetVitalChip}><Text style={styles.sheetVitalText}>💨 {selectedDay.vitals.oxygen_saturation}%</Text></View>
                                            )}
                                            {selectedDay.vitals.hydration && (
                                                <View style={styles.sheetVitalChip}><Text style={styles.sheetVitalText}>💧 {selectedDay.vitals.hydration}%</Text></View>
                                            )}
                                        </View>
                                    </View>
                                )}
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// ══════════════════════════════════════════════════════════════
// ══ STYLES ════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
    // ── Header ──
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 44 : 8,
        paddingBottom: 14,
    },
    backBtn: {
        width: 42, height: 42, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
    },
    headerTitle: { fontSize: 20, fontWeight: '800', color: C.dark, letterSpacing: -0.4 },
    headerSub: { fontSize: 12, color: C.muted, fontWeight: '500', marginTop: 1 },
    shareBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
        backgroundColor: C.primary,
        shadowColor: C.primary, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
    },
    shareBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },

    // ── Tabs ──
    tabsContainer: { paddingHorizontal: 20, paddingBottom: 16 },
    tabsInner: {
        flexDirection: 'row', backgroundColor: '#E8EDF5',
        borderRadius: 16, padding: 4, position: 'relative',
    },
    tabSlider: {
        position: 'absolute', top: 4, left: 4,
        height: 38, borderRadius: 12,
        backgroundColor: '#FFFFFF',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1, shadowRadius: 6, elevation: 3,
    },
    tab: {
        paddingVertical: 10, alignItems: 'center', zIndex: 1,
    },
    tabText: { fontSize: 14, fontWeight: '700', color: C.light },
    tabTextActive: { color: C.dark },

    scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40 },

    // ── Hero Card ──
    heroCard: {
        borderRadius: 28, padding: 24,
        marginBottom: 16, overflow: 'hidden',
        shadowColor: '#312E81', shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.4, shadowRadius: 24, elevation: 12,
    },
    heroTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    heroRingWrap: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
    heroRingCenter: { position: 'absolute', alignItems: 'center' },
    heroRingPercent: { fontSize: 34, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1 },
    heroRingLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginTop: -2 },
    heroRightCol: { flex: 1, marginLeft: 20, gap: 0 },
    heroStatBox: { paddingVertical: 10 },
    heroStatLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
    heroStatValue: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
    heroStatDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
    heroProgressSection: {
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 16,
    },
    heroProgressHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10,
    },
    heroProgressTitle: { flex: 1, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
    heroProgressCount: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
    heroCompletedPill: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(16,185,129,0.25)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    },
    heroCompletedText: { fontSize: 11, fontWeight: '700', color: '#10B981' },
    heroProgressBg: {
        height: 7, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, overflow: 'hidden',
    },
    heroProgressFill: { height: '100%', borderRadius: 4 },

    // ── Streak Card ──
    streakCard: {
        borderRadius: 22, paddingHorizontal: 20, paddingVertical: 18,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, overflow: 'hidden',
        shadowColor: '#F97316', shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3, shadowRadius: 14, elevation: 8,
    },
    streakLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
    streakNum: { fontSize: 20, fontWeight: '900', color: '#FFF', letterSpacing: -0.5 },
    streakSub: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)', marginTop: 2 },
    streakBadge: {
        backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 16,
        paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center',
    },
    streakBadgeNum: { fontSize: 22, fontWeight: '900', color: '#FFF' },
    streakBadgeLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.8)', letterSpacing: 1 },

    // ── Generic Card ──
    card: {
        backgroundColor: '#FFFFFF', borderRadius: 24,
        padding: 20, marginBottom: 16,
        borderWidth: 1, borderColor: C.border,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05, shadowRadius: 14, elevation: 4,
    },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
    cardTitle: {
        fontSize: 12, fontWeight: '800', color: C.light,
        letterSpacing: 1.4, textTransform: 'uppercase',
    },
    cardIconBox: {
        width: 30, height: 30, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    levelPill: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    },
    levelPillText: { fontSize: 12, fontWeight: '700' },

    // ── Recap Stats ──
    recapStatsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
    recapStatItem: { flex: 1, alignItems: 'center', gap: 8 },
    recapStatIconBg: {
        width: '100%', paddingVertical: 14, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center',
    },
    recapStatLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textAlign: 'center' },
    improvementRow: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        justifyContent: 'center', marginTop: 14,
        paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border,
    },
    improvementText: { fontSize: 13, fontWeight: '700' },

    // ── Feedback Banner ──
    feedbackBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 16,
    },
    feedbackText: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 20 },

    // ── Insight Card ──
    insightCard: {
        backgroundColor: '#FFFFFF', borderRadius: 18,
        padding: 14, borderWidth: 1, borderColor: C.border,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    },
    insightLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    insightIconBox: {
        width: 28, height: 28, borderRadius: 9,
        backgroundColor: C.purpleBg, alignItems: 'center', justifyContent: 'center',
    },
    insightText: { flex: 1, fontSize: 13, fontWeight: '600', color: C.dark, lineHeight: 20 },
    reminderBtn: {
        marginTop: 10, backgroundColor: C.primarySoft,
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
        borderWidth: 1, borderColor: '#C7D2FE', alignSelf: 'flex-start',
    },
    reminderBtnText: { fontSize: 12, fontWeight: '700', color: C.primary },

    // ── Trend Stats ──
    trendStatsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
    trendStatItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    trendDot: { width: 8, height: 8, borderRadius: 4 },
    trendStatNum: { fontSize: 20, fontWeight: '800', color: C.dark },
    trendStatLabel: { fontSize: 11, fontWeight: '600', color: C.muted },
    trendDivider: { width: 1, height: 32, backgroundColor: C.border },

    // ── Vitals Adherence ──
    vitalsRow: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.border },
    vitalsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    vitalsLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: C.dark },
    vitalsValue: { fontSize: 14, fontWeight: '800' },
    vitalsBarBg: { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
    vitalsBarFill: { height: '100%', borderRadius: 4 },

    // ── Calendar ──
    weekDaysRow: { flexDirection: 'row', marginBottom: 6 },
    weekDayLabel: {
        width: `${100 / 7}%`, textAlign: 'center',
        fontSize: 11, fontWeight: '800', color: C.light, letterSpacing: 0.5,
    },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell: {
        flex: 1, borderRadius: 22,
        alignItems: 'center', justifyContent: 'center',
    },
    dayText: { fontSize: 13, fontWeight: '600', color: C.mid },
    legendRow: {
        flexDirection: 'row', justifyContent: 'center', gap: 14,
        marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 11, fontWeight: '600', color: C.light },

    // ── Achievements ──
    achievementsSection: { marginBottom: 8 },
    achievementsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    achievementCard: {
        backgroundColor: '#FFFFFF', borderRadius: 20,
        padding: 16, paddingTop: 18, alignItems: 'center',
        borderWidth: 1, borderColor: C.border,
        shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
    },
    achievementLocked: { opacity: 0.45, backgroundColor: '#FAFBFC' },
    achievementIconCircle: {
        width: 48, height: 48, borderRadius: 24,
        alignItems: 'center', justifyContent: 'center', marginBottom: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18, shadowRadius: 6, elevation: 5,
    },
    achievementLabel: { fontSize: 12, fontWeight: '800', color: C.dark, textAlign: 'center', lineHeight: 16 },
    achievementDesc: { fontSize: 10, fontWeight: '500', color: C.muted, textAlign: 'center', marginTop: 4, lineHeight: 13 },
    achievementStatus: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginTop: 10,
    },
    achievementStatusText: { fontSize: 10, fontWeight: '700' },

    // ── Modal / Bottom Sheet ──
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.5)' },
    bottomSheet: {
        backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32,
        padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        shadowColor: '#000', shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.12, shadowRadius: 24, elevation: 14,
    },
    sheetHandle: {
        width: 40, height: 5, borderRadius: 3, backgroundColor: '#CBD5E1',
        alignSelf: 'center', marginBottom: 20,
    },
    sheetHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
        paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 16,
    },
    sheetDate: { fontSize: 17, fontWeight: '800', color: C.dark },
    sheetYear: { fontSize: 12, color: C.muted, fontWeight: '600', marginTop: 2 },
    sheetBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    sheetBadgeText: { fontSize: 12, fontWeight: '700' },
    sheetSectionLabel: { fontSize: 11, fontWeight: '800', color: C.light, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 },
    sheetMedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    sheetMedIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    sheetMedName: { fontSize: 14, fontWeight: '700', color: C.dark },
    sheetMedTime: { fontSize: 11, color: C.muted, fontWeight: '500', marginTop: 1 },
    sheetEmpty: { fontSize: 13, color: C.muted, fontStyle: 'italic', marginBottom: 16 },
    sheetVitals: { marginTop: 4 },
    sheetVitalChip: {
        backgroundColor: '#F8FAFC', paddingHorizontal: 12, paddingVertical: 7,
        borderRadius: 12, borderWidth: 1, borderColor: C.border,
    },
    sheetVitalText: { fontSize: 13, fontWeight: '600', color: C.mid },
});
