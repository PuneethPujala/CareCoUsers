import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    View, Text, StyleSheet, Animated, Pressable, ScrollView, SafeAreaView,
    Platform, Dimensions, Easing, RefreshControl, Modal, Alert, Image,
} from 'react-native';
import { getStreakState } from '../../utils/streakHelper';
import StreakCompanion from '../../components/ui/StreakCompanion';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart } from 'react-native-chart-kit';
import * as Icons from 'lucide-react-native';
import {
    X, TrendingUp, TrendingDown, Minus, Award, Target, Calendar as CalIcon,
    CheckCircle2, Zap, ChevronLeft, ChevronRight, Sparkles, Heart, Star, Share2, Flame, Lock,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ACHIEVEMENTS, TIER_CONFIG, CATEGORY_CONFIG } from '../../constants/achievements';
import { useFocusEffect } from '@react-navigation/native';
import usePatientStore from '../../store/usePatientStore';
import RecapStoryModal from '../../components/adherence/RecapStoryModal';
import { layout } from '../../theme';
import {
    startOfMonth, endOfMonth, eachDayOfInterval, format, isToday,
    startOfWeek, endOfWeek, isSameMonth, parseISO, addMonths, subMonths,
} from 'date-fns';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const GRID_COLUMNS = 3;
const GRID_GAP = 10;
const AVAILABLE_WIDTH = SCREEN_WIDTH - 40;
const badgeWidth = (AVAILABLE_WIDTH - (GRID_GAP * (GRID_COLUMNS - 1))) / GRID_COLUMNS - 1.5;

const TIER_ORDER = ['bronze', 'silver', 'gold', 'legendary'];

const getRemainingLabel = (achievement, meta) => {
    if (!achievement) return '';
    const progressVal = achievement.progress || 0;
    const target = meta.target || 1;
    const current = Math.round(progressVal * target);
    const remaining = Math.max(0, target - current);

    if (meta.isPercentage) {
        const currentPct = Math.round(progressVal * 100);
        const targetPct = target;
        const remainingPct = Math.max(0, targetPct - currentPct);
        return `${remainingPct}% more to unlock`;
    }

    const category = meta.category;
    if (category === 'streaks') {
        return `${remaining} more day${remaining > 1 ? 's' : ''} to unlock`;
    }
    if (category === 'perfect_days') {
        return `${remaining} more perfect day${remaining > 1 ? 's' : ''} to unlock`;
    }
    if (category === 'doses') {
        return `${remaining} more log${remaining > 1 ? 's' : ''} to unlock`;
    }
    if (category === 'routine') {
        if (achievement.key === 'score_plus_20') {
            return `${remaining} more point${remaining > 1 ? 's' : ''} to unlock`;
        }
        return `${remaining} more day${remaining > 1 ? 's' : ''} to unlock`;
    }
    return `${remaining} more to unlock`;
};

const getHeroTheme = (scoreValue) => {
    if (scoreValue >= 90) {
        return {
            gradient: ['#065F46', '#0F766E', '#14B8A6'], // Emerald -> Teal
            accentGlow: '#10B981',
            textOnHero: '#FFFFFF',
            barBg: 'rgba(255, 255, 255, 0.25)',
            barFill: '#34D399',
            ringColor: '#34D399',
        };
    } else if (scoreValue >= 70) {
        return {
            gradient: ['#1E1B4B', '#312E81', '#4F46E5'], // Indigo -> Violet
            accentGlow: '#6366F1',
            textOnHero: '#FFFFFF',
            barBg: 'rgba(255, 255, 255, 0.2)',
            barFill: '#818CF8',
            ringColor: '#818CF8',
        };
    } else {
        return {
            gradient: ['#7C2D12', '#9A3412', '#EF4444'], // Orange -> Red
            accentGlow: '#F97316',
            textOnHero: '#FFFFFF',
            barBg: 'rgba(255, 255, 255, 0.25)',
            barFill: '#F87171',
            ringColor: '#F87171',
        };
    }
};

// ── Color System ──────────────────────────────────────────────
const C = {
    bg: '#F8FAFC',
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
    no_medications: '#E2E8F0',
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
const getFeedbackMessage = (score, momentum, t) => {
    if (score >= 95) return { text: t('adherence.feedback_outstanding', { defaultValue: "Outstanding! You're at peak consistency 🌟" }), color: C.success };
    if (score >= 90) return { text: t('adherence.feedback_excellent', { defaultValue: "Excellent work! You're building great habits 💙" }), color: C.success };
    if (score >= 80) return { text: t('adherence.feedback_wonderful', { defaultValue: "Wonderful consistency! Keep this rhythm going ✨" }), color: C.primary };
    if (score >= 70) return { text: t('adherence.feedback_good', { defaultValue: "Good progress! Every dose counts toward better health 🌿" }), color: C.primary };
    if (score >= 50) return { text: t('adherence.feedback_improving', { defaultValue: "You're improving! Small steps lead to big changes 🌱" }), color: C.warning };
    if (momentum === 'rising') return { text: t('adherence.feedback_rising', { defaultValue: "Your recent trend is looking up! 📈" }), color: C.primary };
    return { text: t('adherence.feedback_start', { defaultValue: "Every new day is a fresh start. You've got this 💪" }), color: C.muted };
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
                    backgroundColor: status && status !== 'none' && status !== 'no_medications' ? bg + '22' : todayFlag ? C.primarySoft : 'transparent',
                    borderWidth: todayFlag ? 2 : status && status !== 'none' && status !== 'no_medications' ? 1.5 : 0,
                    borderColor: todayFlag ? C.primary : status && status !== 'none' && status !== 'no_medications' ? bg + '60' : 'transparent',
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
const getRecapLabels = (t) => ({ weekly: t('adherence.weekly', { defaultValue: 'Weekly' }), monthly: t('adherence.monthly', { defaultValue: 'Monthly' }), yearly: t('adherence.yearly', { defaultValue: 'Yearly' }) });

export default function AdherenceScreen({ navigation }) {
    const { t } = useTranslation();
    const adherenceDetails = usePatientStore((s) => s.adherenceDetails);
    const adherenceRecap = usePatientStore((s) => s.adherenceRecap);
    const fetchAdherenceDetails = usePatientStore((s) => s.fetchAdherenceDetails);
    const fetchAdherenceRecap = usePatientStore((s) => s.fetchAdherenceRecap);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [recapLoading, setRecapLoading] = useState(false);
    const [selectedDay, setSelectedDay] = useState(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [activeRecapTab, setActiveRecapTab] = useState('weekly');
    const [showStoryModal, setShowStoryModal] = useState(false);
    const [selectedBadge, setSelectedBadge] = useState(null);
    const scaleAnim = useRef(new Animated.Value(0)).current;

    const handleBadgePress = (badge) => {
        try {
            Haptics.selectionAsync();
        } catch (e) {}

        const meta = ACHIEVEMENTS.find(a => a.key === badge.key) || {};
        setSelectedBadge({ ...badge, iconName: meta.iconName, target: meta.target });

        scaleAnim.setValue(0.3);
        Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 7,
            tension: 40,
            useNativeDriver: true
        }).start();
    };

    const handleCloseBadgeModal = () => {
        try {
            Haptics.selectionAsync();
        } catch (e) {}
        setSelectedBadge(null);
    };

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

    const switchRecapTab = async (tab) => {
        const idx = RECAP_TABS.indexOf(tab);
        Animated.spring(tabSlideAnim, { toValue: idx * tabWidth, friction: 8, useNativeDriver: true }).start();
        setActiveRecapTab(tab);
        
        const cached = usePatientStore.getState().adherenceRecaps?.[tab];
        if (!cached) {
            setRecapLoading(true);
            usePatientStore.setState({ adherenceRecap: null });
        }
        await fetchAdherenceRecap(tab);
        setRecapLoading(false);
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        // Clear cache on pull-to-refresh
        usePatientStore.setState({
            adherenceRecaps: { weekly: null, monthly: null, yearly: null }
        });
        await Promise.all([
            fetchAdherenceDetails(),
            fetchAdherenceRecap(activeRecapTabRef.current, true),
            usePatientStore.getState().fetchDashboard(true).catch(() => {}),
            usePatientStore.getState().fetchMedications().catch(() => {})
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

    const feedback = getFeedbackMessage(score.monthly, momentum, t);
    const levelColor = LEVEL_COLORS[level.key] || C.light;

    const MomentumIcon = momentum === 'rising' ? TrendingUp : momentum === 'falling' ? TrendingDown : Minus;
    const momentumColor = momentum === 'rising' ? C.success : momentum === 'falling' ? C.danger : C.warning;
    const momentumLabel = momentum === 'rising' ? t('adherence.rising', { defaultValue: 'Rising' }) : momentum === 'falling' ? t('adherence.falling', { defaultValue: 'Falling' }) : t('adherence.steady', { defaultValue: 'Steady' });

    const heroScore = activeRecapTab === 'weekly' ? score.weekly : activeRecapTab === 'yearly' ? (adherenceRecap?.adherence_rate ?? score.monthly) : score.monthly;
    const heroTheme = getHeroTheme(heroScore);
    const ringColor = heroTheme.ringColor;

    // Calendar
    const calendarDays = useMemo(() => {
        return eachDayOfInterval({ start: startOfWeek(startOfMonth(currentMonth)), end: endOfWeek(endOfMonth(currentMonth)) });
    }, [currentMonth]);

    const dailyLogMap = useMemo(() => {
        const map = {};
        dailyLog.forEach(d => { map[d.date] = d; });
        return map;
    }, [dailyLog]);

    const achievementsByCategory = useMemo(() => {
        const groups = {};
        Object.keys(CATEGORY_CONFIG).forEach(cat => {
            groups[cat] = [];
        });
        
        achievements.forEach(achievement => {
            const meta = ACHIEVEMENTS.find(a => a.key === achievement.key) || {};
            const cat = meta.category || 'routine';
            if (!groups[cat]) {
                groups[cat] = [];
            }
            groups[cat].push(achievement);
        });

        const tierOrder = { bronze: 1, silver: 2, gold: 3, legendary: 4 };
        Object.keys(groups).forEach(cat => {
            groups[cat].sort((a, b) => {
                const metaA = ACHIEVEMENTS.find(m => m.key === a.key) || {};
                const metaB = ACHIEVEMENTS.find(m => m.key === b.key) || {};
                return (tierOrder[metaA.tier] || 1) - (tierOrder[metaB.tier] || 1);
            });
        });

        return groups;
    }, [achievements]);

    const totalAchievementsCount = achievements.length;
    const unlockedCount = achievements.filter(a => a.unlocked).length;
    const completionPercentage = totalAchievementsCount > 0 ? Math.round((unlockedCount / totalAchievementsCount) * 100) : 0;

    const nextGoal = useMemo(() => {
        const locked = achievements.filter(a => !a.unlocked);
        if (locked.length === 0) return null;
        
        const sorted = [...locked].sort((a, b) => {
            const progressA = a.progress || 0;
            const progressB = b.progress || 0;
            return progressB - progressA;
        });
        
        const best = sorted[0];
        const meta = ACHIEVEMENTS.find(m => m.key === best.key) || {};
        return { ...best, meta };
    }, [achievements]);

    const recentUnlocks = useMemo(() => {
        const unlocked = achievements.filter(a => a.unlocked);
        if (unlocked.length === 0) return [];
        
        const tierOrder = { legendary: 1, gold: 2, silver: 3, bronze: 4 };
        const sorted = [...unlocked].sort((a, b) => {
            const metaA = ACHIEVEMENTS.find(m => m.key === a.key) || {};
            const metaB = ACHIEVEMENTS.find(m => m.key === b.key) || {};
            return (tierOrder[metaA.tier] || 4) - (tierOrder[metaB.tier] || 4);
        });
        
        const times = [
            '2 days ago',
            'last week',
            '2 weeks ago',
            '3 weeks ago',
            'last month'
        ];
        return sorted.slice(0, 3).map((badge, idx) => {
            const meta = ACHIEVEMENTS.find(a => a.key === badge.key) || {};
            const time = times[idx % times.length];
            return {
                ...badge,
                meta,
                unlockedTime: time
            };
        });
    }, [achievements]);

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
            <SafeAreaView style={{ flex: 1 }}>
                {/* ── Header ── */}
                <View style={styles.header}>
                    <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <ChevronLeft size={22} color={C.dark} />
                    </Pressable>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.headerTitle}>{t('common.adherence', { defaultValue: 'Adherence' })}</Text>
                        <Text style={styles.headerSub}>{t('adherence.header_sub', { defaultValue: 'Track your medication journey' })}</Text>
                    </View>
                    <Pressable
                        style={styles.shareBtn}
                        onPress={() => setShowStoryModal(true)}
                    >
                        <Share2 size={15} color="#FFF" />
                        <Text style={styles.shareBtnText}>{t('adherence.share', { defaultValue: 'Share' })}</Text>
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
                                    {getRecapLabels(t)[tab]}
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
                            colors={heroTheme.gradient}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            style={styles.heroCard}
                        >
                            {/* Inner glow accent */}
                            <View style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: heroTheme.accentGlow, opacity: 0.25 }} />

                            <View style={styles.heroTopRow}>
                                {/* Ring */}
                                <View style={styles.heroRingWrap}>
                                    <CircularProgress progress={heroScore} size={148} strokeWidth={13} color={ringColor} />
                                    <View style={styles.heroRingCenter}>
                                        <AnimatedNumber value={heroScore} style={styles.heroRingPercent} />
                                        <Text style={styles.heroRingLabel}>{getRecapLabels(t)[activeRecapTab]}</Text>
                                    </View>
                                </View>

                                {/* Right stats */}
                                <View style={styles.heroRightCol}>
                                    <View style={styles.heroStatBox}>
                                        <Text style={styles.heroStatLabel}>{t('adherence.score', { defaultValue: 'Score' })}</Text>
                                        <AnimatedNumber value={adherenceRecap?.adherence_rate ?? score.weekly} style={styles.heroStatValue} />
                                    </View>
                                    <View style={styles.heroStatDivider} />
                                    <View style={styles.heroStatBox}>
                                        <Text style={styles.heroStatLabel}>{t('adherence.momentum', { defaultValue: 'Momentum' })}</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                            <View style={{ backgroundColor: momentumColor + '30', borderRadius: 8, padding: 3 }}>
                                                <MomentumIcon size={14} color={momentumColor} />
                                            </View>
                                            <Text style={[styles.heroStatValue, { color: momentumColor, fontSize: 15 }]}>{momentumLabel}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.heroStatDivider} />
                                    <View style={styles.heroStatBox}>
                                        <Text style={styles.heroStatLabel}>{t('adherence.level', { defaultValue: 'Level' })}</Text>
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
                                    <Text style={styles.heroProgressTitle}>{t('adherence.todays_goal', { defaultValue: "Today's Goal" })}</Text>
                                    <Text style={styles.heroProgressCount}>
                                        {today.taken}<Text style={{ fontSize: 13, opacity: 0.6 }}>/{today.total || '—'} {t('adherence.doses', { defaultValue: 'doses' })}</Text>
                                    </Text>
                                    {today.completed && (
                                        <View style={styles.heroCompletedPill}>
                                            <Sparkles size={10} color="#10B981" />
                                            <Text style={styles.heroCompletedText}>{t('adherence.done', { defaultValue: 'Done!' })}</Text>
                                        </View>
                                    )}
                                </View>
                                <View style={[styles.heroProgressBg, { backgroundColor: heroTheme.barBg }]}>
                                    <Animated.View style={[
                                        styles.heroProgressFill,
                                        {
                                            width: today.total > 0 ? `${Math.min(100, (today.taken / today.total) * 100)}%` : '0%',
                                            backgroundColor: today.completed ? '#10B981' : heroTheme.barFill,
                                        },
                                    ]} />
                                </View>
                            </View>
                        </LinearGradient>
                    </Animated.View>

                    {/* ── [1] Streak Banner with Companion ── */}
                    <Animated.View style={anim(1)}>
                        {(() => {
                            const companion = getStreakState(streak, dailyLog);
                            return (
                                <LinearGradient
                                    colors={streak >= 7 ? ['#F97316', '#EF4444'] : streak >= 3 ? ['#F59E0B', '#F97316'] : streak > 0 ? ['#22C55E', '#16A34A'] : ['#64748B', '#475569']}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={[styles.streakCard, { shadowColor: streak >= 7 ? '#EF4444' : streak >= 3 ? '#F97316' : streak > 0 ? '#16A34A' : '#475569' }]}
                                >
                                    <View style={styles.streakLeft}>
                                        <View style={styles.companionImageWrap}>
                                            <StreakCompanion streak={streak} dailyLog={dailyLog} size={48} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.streakNum}>{t('adherence.streak_days', { defaultValue: '{{streak}} Day Streak', streak })}</Text>
                                            <Text style={styles.companionLabel}>{companion.label}</Text>
                                            <Text style={styles.streakSub}>{companion.subtitle}</Text>
                                        </View>
                                    </View>
                                    {streak > 0 && (
                                        <View style={styles.streakBadge}>
                                            <Text style={styles.streakBadgeNum}>{streak}</Text>
                                            <Text style={styles.streakBadgeLabel}>{t('adherence.days', { defaultValue: 'DAYS' })}</Text>
                                        </View>
                                    )}
                                </LinearGradient>
                            );
                        })()}
                    </Animated.View>

                    {/* ── [2] Recap Stats ── */}
                    {(recapLoading || !adherenceRecap) ? (
                        <Animated.View style={anim(2)}>
                            <View style={styles.card}>
                                <View style={styles.cardHeaderRow}>
                                    <Skeleton width={120} height={18} />
                                    <Skeleton width={80} height={20} borderRadius={10} />
                                </View>

                                <View style={styles.recapStatsRow}>
                                    {[1, 2, 3].map((_, i) => (
                                        <View key={i} style={[styles.recapStatCard, { borderColor: '#E2E8F0', borderWidth: 1 }]}>
                                            <Skeleton width={45} height={20} borderRadius={6} style={{ marginBottom: 6 }} />
                                            <Skeleton width={60} height={10} borderRadius={3} />
                                        </View>
                                    ))}
                                </View>
                                <Skeleton width={180} height={12} style={{ marginTop: 12 }} />
                            </View>
                        </Animated.View>
                    ) : (
                        <Animated.View style={anim(2)}>
                            <View style={styles.card}>
                                <View style={styles.cardHeaderRow}>
                                    <Text style={styles.cardTitle}>
                                        {activeRecapTab === 'yearly' && adherenceRecap.is_all_time_fallback
                                            ? t('adherence.all_time_recap', { defaultValue: 'ALL TIME RECAP' })
                                            : t('adherence.recap_title', { defaultValue: '{{tab}} RECAP', tab: getRecapLabels(t)[activeRecapTab].toUpperCase() })}
                                    </Text>
                                    <View style={[styles.levelPill, { backgroundColor: (adherenceRecap.level?.key === 'optimal' ? C.success : adherenceRecap.level?.key === 'consistent' ? C.primary : C.warning) + '18' }]}>
                                        <Text style={{ fontSize: 12 }}>{adherenceRecap.level?.emoji || '🌱'}</Text>
                                        <Text style={[styles.levelPillText, {
                                            color: adherenceRecap.level?.key === 'optimal' ? C.success :
                                                adherenceRecap.level?.key === 'consistent' ? C.primary : C.warning
                                        }]}>{adherenceRecap.level?.label ? t(`adherence.level_${adherenceRecap.level.key}`, { defaultValue: adherenceRecap.level.label }) : t('adherence.level_beginner', { defaultValue: 'Beginner' })}</Text>
                                    </View>
                                </View>

                                <View style={styles.recapStatsRow}>
                                    {[
                                        { label: t('common.adherence', { defaultValue: 'Adherence' }), value: `${adherenceRecap.adherence_rate || 0}%`, color: '#6366F1' },
                                        { label: t('adherence.perfect_days', { defaultValue: 'Perfect Days' }), value: adherenceRecap.perfect_days || 0, color: '#10B981' },
                                        { label: t('adherence.doses_taken', { defaultValue: 'Doses Taken' }), value: adherenceRecap.total_doses_taken || 0, color: '#8B5CF6' },
                                    ].map((item, i) => (
                                        <View key={i} style={styles.recapStatCard}>
                                            <Text style={[styles.recapStatCardValue, { color: item.color }]}>{item.value}</Text>
                                            <Text style={styles.recapStatCardLabel}>{item.label}</Text>
                                        </View>
                                    ))}
                                </View>

                                {adherenceRecap.improvement_vs_previous !== 0 && (
                                    <View style={styles.improvementRow}>
                                        {adherenceRecap.improvement_vs_previous > 0
                                            ? <TrendingUp size={13} color={C.success} />
                                            : <TrendingDown size={13} color={C.danger} />}
                                        <Text style={[styles.improvementText, { color: adherenceRecap.improvement_vs_previous > 0 ? C.success : C.danger }]}>
                                            {adherenceRecap.improvement_vs_previous > 0 ? '+' : ''}{adherenceRecap.improvement_vs_previous}% {t('adherence.vs_previous', { defaultValue: 'vs previous {{period}}', period: activeRecapTab === 'yearly' ? t('adherence.year', { defaultValue: 'year' }) : activeRecapTab === 'monthly' ? t('adherence.month', { defaultValue: 'month' }) : t('adherence.week', { defaultValue: 'week' }) })}
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
                                                onPress={() => Alert.alert(t('adherence.set_reminder', { defaultValue: 'Set Reminder' }), t('adherence.reminder_desc', { defaultValue: 'Afternoon medication reminder will be added to your notifications.' }), [{ text: t('common.ok', { defaultValue: 'OK' }) }])}
                                            >
                                                <Text style={styles.reminderBtnText}>{t('adherence.set_reminder', { defaultValue: 'Set Reminder' })}</Text>
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
                            <Text style={styles.cardTitle}>{t('common.7_day_adherence_trend', { defaultValue: '7-DAY ADHERENCE TREND' })}</Text>

                            <View style={{ alignItems: 'center', marginHorizontal: -8, marginTop: 4, marginBottom: 16 }}>
                                <LineChart
                                    data={{
                                        labels: weeklyTrend.length > 0 ? weeklyTrend.map(d => d.day) : [t('adherence.mon', { defaultValue: 'Mon' }), t('adherence.tue', { defaultValue: 'Tue' }), t('adherence.wed', { defaultValue: 'Wed' }), t('adherence.thu', { defaultValue: 'Thu' }), t('adherence.fri', { defaultValue: 'Fri' }), t('adherence.sat', { defaultValue: 'Sat' }), t('adherence.sun', { defaultValue: 'Sun' })],
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
                                    <Text style={styles.trendStatLabel}>{t('common.taken', { defaultValue: 'Taken' })}</Text>
                                </View>
                                <View style={styles.trendDivider} />
                                <View style={styles.trendStatItem}>
                                    <View style={[styles.trendDot, { backgroundColor: C.danger }]} />
                                    <Text style={styles.trendStatNum}>{weeklySummary.missed}</Text>
                                    <Text style={styles.trendStatLabel}>{t('adherence.missed', { defaultValue: 'Missed' })}</Text>
                                </View>
                                <View style={styles.trendDivider} />
                                <View style={styles.trendStatItem}>
                                    <MomentumIcon size={14} color={weeklySummary.improvement >= 0 ? C.success : C.danger} />
                                    <Text style={[styles.trendStatNum, { color: weeklySummary.improvement >= 0 ? C.success : C.danger }]}>
                                        {weeklySummary.improvement >= 0 ? '+' : ''}{weeklySummary.improvement}%
                                    </Text>
                                    <Text style={styles.trendStatLabel}>{t('adherence.vs_last', { defaultValue: 'vs Last' })}</Text>
                                </View>
                            </View>

                            {/* Vitals adherence row */}
                            <View style={styles.vitalsRow}>
                                <View style={styles.vitalsHeader}>
                                    <Heart size={14} color={C.danger} />
                                    <Text style={styles.vitalsLabel}>{t('adherence.vitals_logging', { defaultValue: 'Vitals Logging' })}</Text>
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
                                <Text style={styles.cardTitle}>{format(currentMonth, 'MMMM yyyy').toUpperCase()}</Text>
                                <View style={{ flex: 1 }} />
                                <Pressable onPress={() => setCurrentMonth(prev => subMonths(prev, 1))} style={{ padding: 4 }}>
                                    <ChevronLeft size={20} color={C.primary} />
                                </Pressable>
                                <Pressable onPress={() => setCurrentMonth(prev => addMonths(prev, 1))} style={{ padding: 4 }}>
                                    <ChevronRight size={20} color={C.primary} />
                                </Pressable>
                            </View>

                            <View style={styles.weekDaysRow}>
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                                    <Text key={i} style={styles.weekDayLabel}>{t(`adherence.short_day_${i}`, { defaultValue: d.charAt(0) })}</Text>
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
                                            isCurrentMonth={isSameMonth(date, currentMonth)}
                                            onPress={() => {
                                            const isPast = new Date(dateStr) < new Date();
                                            setSelectedDay(entry || {
                                                date: dateStr,
                                                status: isPast ? 'missed' : 'none',
                                                rate: 0,
                                                medicines: [],
                                                vitals: null,
                                                _noEntry: true,
                                                _isPast: isPast,
                                            });
                                        }}
                                        />
                                    );
                                })}
                            </View>

                            <View style={styles.legendRow}>
                                {[
                                    { label: t('adherence.complete', { defaultValue: 'Complete' }), color: C.success },
                                    { label: t('adherence.partial', { defaultValue: 'Partial' }), color: C.warning },
                                    { label: t('adherence.missed', { defaultValue: 'Missed' }), color: C.danger },
                                    { label: t('adherence.no_data', { defaultValue: 'No Data' }), color: '#CBD5E1' },
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
                            {/* Completion Progress Header */}
                            <View style={styles.completionContainer}>
                                <View style={styles.completionHeader}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Award size={16} color={C.purple} />
                                        <Text style={styles.completionTitle}>{t('common.achievements', { defaultValue: 'Achievements' })}</Text>
                                    </View>
                                    <Text style={styles.completionStats}>
                                        {unlockedCount}/{totalAchievementsCount} <Text style={{ color: C.muted, fontWeight: '500' }}>Unlocked</Text> ({completionPercentage}% Complete)
                                    </Text>
                                </View>
                                <View style={styles.completionBarBg}>
                                    <LinearGradient
                                        colors={['#7C3AED', '#4361EE']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={[styles.completionBarFill, { width: `${completionPercentage}%` }]}
                                    />
                                </View>
                            </View>

                            {/* Recent Unlocks */}
                            {recentUnlocks.length > 0 && (
                                <View style={styles.recentUnlocksContainer}>
                                    <Text style={styles.recentUnlocksHeader}>{t('adherence.recent_unlocks', { defaultValue: 'Recent Unlocks' })}</Text>
                                    <View style={styles.recentUnlocksList}>
                                        {recentUnlocks.map((item, idx) => {
                                            const IconComponent = Icons[item.meta.iconName] || Icons.Award;
                                            const tierConfig = TIER_CONFIG[item.meta.tier] || TIER_CONFIG.bronze;
                                            return (
                                                <Pressable
                                                    key={item.key}
                                                    style={[styles.recentUnlockItem, idx < recentUnlocks.length - 1 && { marginRight: GRID_GAP }]}
                                                    onPress={() => handleBadgePress(item)}
                                                >
                                                    <LinearGradient
                                                        colors={tierConfig.gradient}
                                                        style={styles.recentUnlockIconBg}
                                                        start={{ x: 0, y: 0 }}
                                                        end={{ x: 1, y: 1 }}
                                                    >
                                                        <IconComponent size={14} color="#FFF" />
                                                    </LinearGradient>
                                                    <View style={{ flex: 1, marginLeft: 8 }}>
                                                        <Text style={styles.recentUnlockTitle} numberOfLines={1}>{item.meta.title || item.key}</Text>
                                                        <Text style={styles.recentUnlockTime}>Unlocked {item.unlockedTime}</Text>
                                                    </View>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                </View>
                            )}

                            {/* Next Goal Card */}
                            {nextGoal && (
                                <Pressable
                                    style={[styles.nextGoalCard, { borderColor: (TIER_CONFIG[nextGoal.meta.tier] || TIER_CONFIG.bronze).color + '30' }]}
                                    onPress={() => handleBadgePress(nextGoal)}
                                >
                                    <View style={styles.nextGoalHeader}>
                                        <Sparkles size={12} color="#F59E0B" />
                                        <Text style={styles.nextGoalHeaderText}>{t('adherence.next_goal', { defaultValue: 'NEXT GOAL' })}</Text>
                                    </View>
                                    
                                    <View style={styles.nextGoalBody}>
                                        {/* Badge Icon */}
                                        <LinearGradient
                                            colors={(TIER_CONFIG[nextGoal.meta.tier] || TIER_CONFIG.bronze).gradient}
                                            style={styles.nextGoalBadgeCircle}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                        >
                                            {(() => {
                                                const IconComponent = Icons[nextGoal.meta.iconName] || Icons.Award;
                                                return <IconComponent size={24} color="#FFF" />;
                                            })()}
                                        </LinearGradient>
                                        
                                        {/* Achievement details */}
                                        <View style={{ flex: 1, marginLeft: 14 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Text style={styles.nextGoalTitle}>{nextGoal.meta.title || nextGoal.key}</Text>
                                                <Text style={styles.nextGoalProgressText}>{getRemainingLabel(nextGoal, nextGoal.meta)}</Text>
                                            </View>
                                            <Text style={styles.nextGoalDesc} numberOfLines={1}>{nextGoal.meta.description}</Text>
                                            
                                            {/* Progress bar */}
                                            <View style={styles.nextGoalProgressBarContainer}>
                                                <View style={styles.nextGoalProgressBarBg}>
                                                    <LinearGradient
                                                        colors={(TIER_CONFIG[nextGoal.meta.tier] || TIER_CONFIG.bronze).gradient}
                                                        start={{ x: 0, y: 0 }}
                                                        end={{ x: 1, y: 0 }}
                                                        style={[
                                                            styles.nextGoalProgressBarFill,
                                                            { width: `${Math.min(100, (nextGoal.progress || 0) * 100)}%` }
                                                        ]}
                                                    />
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                </Pressable>
                            )}

                            {Object.keys(CATEGORY_CONFIG).map((categoryKey) => {
                                const catConfig = CATEGORY_CONFIG[categoryKey];
                                const catAchievements = achievementsByCategory[categoryKey] || [];
                                
                                if (catAchievements.length === 0) return null;

                                return (
                                    <View key={categoryKey} style={styles.categoryContainer}>
                                        <View style={styles.categoryHeader}>
                                            <View style={styles.categoryHeaderLeft}>
                                                <Text style={styles.categoryEmoji}>{catConfig.emoji}</Text>
                                                <View>
                                                    <Text style={styles.categoryTitle}>{catConfig.title}</Text>
                                                    <Text style={styles.categoryDesc}>{catConfig.description}</Text>
                                                </View>
                                            </View>
                                            <View style={styles.categoryBadgeCount}>
                                                <Text style={styles.categoryBadgeCountText}>
                                                    {catAchievements.filter(a => a.unlocked).length}/{catAchievements.length}
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={styles.achievementsGrid}>
                                            {catAchievements.map((achievement) => {
                                                const meta = ACHIEVEMENTS.find(a => a.key === achievement.key) || {};
                                                const tierConfig = TIER_CONFIG[meta.tier] || TIER_CONFIG.bronze;
                                                const IconComponent = Icons[meta.iconName] || Icons.Award;
                                                const isUnlocked = achievement.unlocked;

                                                return (
                                                    <Pressable
                                                        key={achievement.key}
                                                        style={[
                                                            styles.badgeItem,
                                                            isUnlocked
                                                                ? { borderColor: tierConfig.color + '25', shadowColor: tierConfig.color }
                                                                : styles.badgeItemLocked
                                                        ]}
                                                        onPress={() => handleBadgePress(achievement)}
                                                    >
                                                        {/* Badge Circle with Icon */}
                                                        {isUnlocked ? (
                                                            <LinearGradient
                                                                colors={tierConfig.gradient}
                                                                style={styles.badgeCircle}
                                                                start={{ x: 0, y: 0 }}
                                                                end={{ x: 1, y: 1 }}
                                                            >
                                                                <IconComponent size={22} color="#FFF" />
                                                            </LinearGradient>
                                                        ) : (
                                                            <View style={[styles.badgeCircle, styles.badgeCircleLocked]}>
                                                                <IconComponent size={22} color="#94A3B8" style={{ opacity: 0.45 }} />
                                                                <View style={styles.lockIconOverlay}>
                                                                    <Lock size={9} color="#FFF" />
                                                                </View>
                                                            </View>
                                                        )}

                                                        {/* Achievement title */}
                                                        <Text numberOfLines={1} style={[styles.badgeItemTitle, !isUnlocked && { color: '#64748B' }]}>
                                                            {meta.title || achievement.key}
                                                        </Text>

                                                        {/* Micro progress bar for locked achievements */}
                                                        {!isUnlocked && achievement.progress > 0 && (
                                                            <View style={styles.badgeProgressContainer}>
                                                                <View style={styles.badgeProgressBg}>
                                                                    <LinearGradient
                                                                        colors={tierConfig.gradient}
                                                                        start={{ x: 0, y: 0 }}
                                                                        end={{ x: 1, y: 0 }}
                                                                        style={[
                                                                            styles.badgeProgressFill,
                                                                            { width: `${Math.min(100, achievement.progress * 100)}%` },
                                                                        ]}
                                                                    />
                                                                </View>
                                                                <Text style={styles.badgeProgressText}>{achievement.progressLabel}</Text>
                                                            </View>
                                                        )}
                                                    </Pressable>
                                                );
                                            })}
                                        </View>
                                    </View>
                                );
                            })}
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
                                        <Text style={styles.sheetSectionLabel}>{t('adherence.medications_label', { defaultValue: 'MEDICATIONS' })}</Text>
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
                                    <View style={styles.sheetEmptyBox}>
                                        <Text style={styles.sheetEmptyIcon}>
                                            {selectedDay._noEntry && selectedDay._isPast ? '😴' : selectedDay._noEntry ? '📅' : '💊'}
                                        </Text>
                                        <Text style={styles.sheetEmptyTitle}>
                                            {selectedDay._noEntry && selectedDay._isPast
                                                ? t('adherence.no_log_past', { defaultValue: 'No records for this day' })
                                                : selectedDay._noEntry
                                                    ? t('adherence.no_log_future', { defaultValue: 'No medications scheduled' })
                                                    : t('adherence.no_meds_scheduled_day', { defaultValue: 'No medications scheduled for this day.' })}
                                        </Text>
                                        <Text style={styles.sheetEmptyDesc}>
                                            {selectedDay._noEntry && selectedDay._isPast
                                                ? t('adherence.no_log_past_desc', { defaultValue: 'Medication data wasn\'t recorded for this day.' })
                                                : t('adherence.no_log_future_desc', { defaultValue: 'This day has no scheduled medications.' })}
                                        </Text>
                                    </View>
                                )}

                                {selectedDay.vitals && (
                                    <View style={styles.sheetVitals}>
                                        <Text style={styles.sheetSectionLabel}>{t('adherence.vitals_logged_label', { defaultValue: 'VITALS LOGGED' })}</Text>
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

            {/* ── Achievement Detail Modal ── */}
            <Modal
                visible={!!selectedBadge}
                transparent
                animationType="fade"
                onRequestClose={handleCloseBadgeModal}
            >
                <View style={styles.badgeModalOverlay}>
                    <Pressable style={styles.badgeModalBackdrop} onPress={handleCloseBadgeModal} />
                    
                    <Animated.View style={[
                        styles.badgeModalContent,
                        {
                            transform: [{ scale: scaleAnim }],
                        }
                    ]}>
                        {selectedBadge && (() => {
                            const meta = ACHIEVEMENTS.find(a => a.key === selectedBadge.key) || {};
                            const tierInfo = TIER_CONFIG[meta.tier] || TIER_CONFIG.bronze;
                            const IconComponent = Icons[meta.iconName] || Icons.Award;
                            const isUnlocked = selectedBadge.unlocked;

                            return (
                                <>
                                    {/* Close Button */}
                                    <Pressable style={styles.badgeModalClose} onPress={handleCloseBadgeModal}>
                                        <X size={18} color={C.muted} />
                                    </Pressable>

                                    {/* Large Glowing Collectible Trophy Container */}
                                    <View style={{ position: 'relative', marginBottom: 20, alignItems: 'center', justifyContent: 'center' }}>
                                        {/* Dynamic Glow Accent */}
                                        <View style={{
                                            position: 'absolute',
                                            width: 140, height: 140,
                                            borderRadius: 70,
                                            backgroundColor: isUnlocked ? tierInfo.color + '20' : '#E2E8F030',
                                            transform: [{ scale: 1.15 }]
                                        }} />
                                        
                                        {isUnlocked ? (
                                            <LinearGradient
                                                colors={tierInfo.gradient}
                                                style={styles.badgeModalCircle}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                            >
                                                <IconComponent size={42} color="#FFF" />
                                            </LinearGradient>
                                        ) : (
                                            <View style={[styles.badgeModalCircle, styles.badgeModalCircleLocked]}>
                                                <IconComponent size={42} color="#94A3B8" style={{ opacity: 0.4 }} />
                                                <View style={styles.badgeModalLockOverlay}>
                                                    <Lock size={14} color="#FFF" />
                                                </View>
                                            </View>
                                        )}
                                    </View>

                                    {/* Ribbon label */}
                                    <View style={[styles.badgeModalRibbon, { backgroundColor: tierInfo.bgColor, borderWidth: 1, borderColor: tierInfo.color + '30' }]}>
                                        <Text style={[styles.badgeModalRibbonTxt, { color: tierInfo.color }]}>
                                            {tierInfo.label.toUpperCase()} ACHIEVEMENT
                                        </Text>
                                    </View>

                                    {/* Title */}
                                    <Text style={styles.badgeModalTitle}>{meta.title || selectedBadge.key}</Text>

                                    {/* Description */}
                                    <Text style={styles.badgeModalDesc}>{meta.description}</Text>

                                    <View style={styles.badgeModalDivider} />

                                    {/* Progress & Locked status banner */}
                                    {isUnlocked ? (
                                        <View style={[styles.badgeModalStatusBox, { shadowColor: C.success, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 }]}>
                                            <Sparkles size={16} color={C.success} />
                                            <Text style={styles.badgeModalStatusTextUnlocked}>
                                                UNLOCKED
                                            </Text>
                                        </View>
                                    ) : (
                                        <View style={styles.badgeModalProgressContainer}>
                                            <View style={styles.badgeModalProgressHeader}>
                                                <Text style={styles.badgeModalProgressTitle}>Progress to Unlock</Text>
                                                <Text style={[styles.badgeModalProgressVal, { color: tierInfo.color }]}>
                                                    {selectedBadge.progressLabel || '0%'}
                                                </Text>
                                            </View>
                                            <View style={styles.badgeModalProgressBg}>
                                                <LinearGradient
                                                    colors={tierInfo.gradient}
                                                    start={{ x: 0, y: 0 }}
                                                    end={{ x: 1, y: 0 }}
                                                    style={[
                                                        styles.badgeModalProgressFill,
                                                        {
                                                            width: `${Math.min(100, (selectedBadge.progress || 0) * 100)}%`
                                                        }
                                                    ]}
                                                />
                                            </View>
                                        </View>
                                    )}
                                </>
                            );
                        })()}
                    </Animated.View>
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
        flexDirection: 'row', backgroundColor: '#F1F5F9',
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

    scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: layout.TAB_BAR_CLEARANCE },

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
    companionImageWrap: {
        width: 56, height: 56, borderRadius: 16,
        backgroundColor: '#FFFFFF',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.4)',
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 3,
    },
    companionImage: { width: 48, height: 48 },
    companionLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.9)', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 1 },
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
    categoryContainer: { marginBottom: 22 },
    categoryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 4 },
    categoryHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    categoryEmoji: { fontSize: 20 },
    categoryTitle: { fontSize: 13, fontWeight: '800', color: C.dark, letterSpacing: 0.3 },
    categoryDesc: { fontSize: 11, color: C.muted, fontWeight: '500', marginTop: 1 },
    achievementsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
        marginRight: -GRID_GAP, // Offset the trailing margin of grid items
    },
    badgeItem: {
        width: badgeWidth,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        paddingVertical: 14,
        paddingHorizontal: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: C.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
        marginRight: GRID_GAP,
        marginBottom: GRID_GAP,
    },
    badgeItemLocked: {
        backgroundColor: '#F8FAFC',
        borderColor: '#E2E8F0',
        shadowOpacity: 0,
        elevation: 0,
    },
    badgeCircle: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.15,
        shadowRadius: 5,
        elevation: 4,
    },
    badgeCircleLocked: {
        backgroundColor: '#E2E8F0',
        shadowOpacity: 0,
        elevation: 0,
        position: 'relative',
    },
    lockIconOverlay: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: '#64748B',
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#F8FAFC',
    },
    badgeItemTitle: {
        fontSize: 11,
        fontWeight: '700',
        color: C.dark,
        textAlign: 'center',
        marginTop: 2,
    },
    badgeProgressContainer: {
        width: '100%',
        marginTop: 6,
        alignItems: 'center',
    },
    badgeProgressBg: {
        width: '80%',
        height: 5,
        borderRadius: 999,
        backgroundColor: '#E2E8F0',
        overflow: 'hidden',
    },
    badgeProgressFill: {
        height: '100%',
        borderRadius: 999,
    },
    badgeProgressText: {
        fontSize: 8,
        fontWeight: '600',
        color: C.muted,
        marginTop: 2,
    },

    // ── Achievement Detail Modal ──
    badgeModalOverlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
    },
    badgeModalBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    badgeModalContent: {
        width: SCREEN_WIDTH - 64,
        backgroundColor: '#FFFFFF',
        borderRadius: 28,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
        position: 'relative',
    },
    badgeModalClose: {
        position: 'absolute',
        top: 20,
        right: 20,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeModalRibbon: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
        marginBottom: 16,
    },
    badgeModalRibbonTxt: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
    },
    badgeModalCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 6,
    },
    badgeModalCircleLocked: {
        backgroundColor: '#E2E8F0',
        shadowOpacity: 0,
        elevation: 0,
        position: 'relative',
    },
    badgeModalLockOverlay: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#64748B',
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: '#FFFFFF',
    },
    badgeModalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: C.dark,
        textAlign: 'center',
        marginBottom: 8,
    },
    badgeModalDesc: {
        fontSize: 13,
        fontWeight: '500',
        color: C.muted,
        textAlign: 'center',
        lineHeight: 18,
        paddingHorizontal: 12,
    },
    badgeModalDivider: {
        width: '100%',
        height: 1,
        backgroundColor: C.border,
        marginVertical: 18,
    },
    badgeModalStatusBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: C.successBg,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 16,
    },
    badgeModalStatusTextUnlocked: {
        fontSize: 13,
        fontWeight: '700',
        color: C.success,
    },
    badgeModalProgressContainer: {
        width: '100%',
    },
    badgeModalProgressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    badgeModalProgressTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: C.dark,
    },
    badgeModalProgressVal: {
        fontSize: 12,
        fontWeight: '800',
        color: C.muted,
    },
    badgeModalProgressBg: {
        width: '100%',
        height: 8,
        borderRadius: 4,
        backgroundColor: '#E2E8F0',
        overflow: 'hidden',
    },
    badgeModalProgressFill: {
        height: '100%',
        borderRadius: 4,
    },

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
    sheetEmptyBox: {
        alignItems: 'center', paddingVertical: 24, marginBottom: 12,
        backgroundColor: '#F8FAFC', borderRadius: 18,
        borderWidth: 1, borderColor: C.border, borderStyle: 'dashed',
    },
    sheetEmptyIcon: { fontSize: 36, marginBottom: 10 },
    sheetEmptyTitle: { fontSize: 14, fontWeight: '700', color: C.mid, textAlign: 'center' },
    sheetEmptyDesc: { fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 4, paddingHorizontal: 16, lineHeight: 18 },
    sheetVitals: { marginTop: 4 },
    sheetVitalChip: {
        backgroundColor: '#F8FAFC', paddingHorizontal: 12, paddingVertical: 7,
        borderRadius: 12, borderWidth: 1, borderColor: C.border,
    },
    sheetVitalText: { fontSize: 13, fontWeight: '600', color: C.mid },

    // ── Completion Header ──
    completionContainer: {
        marginBottom: 20,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E8EDF5',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 10,
        elevation: 3,
    },
    completionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    completionTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: 0.5,
    },
    completionStats: {
        fontSize: 12,
        fontWeight: '700',
        color: '#4F46E5',
    },
    completionBarBg: {
        height: 8,
        backgroundColor: '#F1F5F9',
        borderRadius: 999,
        overflow: 'hidden',
    },
    completionBarFill: {
        height: '100%',
        borderRadius: 999,
    },

    // ── Recent Unlocks ──
    recentUnlocksContainer: {
        marginBottom: 20,
    },
    recentUnlocksHeader: {
        fontSize: 11,
        fontWeight: '850',
        color: '#64748B',
        letterSpacing: 1.0,
        textTransform: 'uppercase',
        marginBottom: 10,
        marginLeft: 2,
    },
    recentUnlocksList: {
        flexDirection: 'row',
    },
    recentUnlockItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        padding: 10,
        borderWidth: 1,
        borderColor: '#E8EDF5',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 5,
        elevation: 1,
    },
    recentUnlockIconBg: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    recentUnlockTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: '#0F172A',
    },
    recentUnlockTime: {
        fontSize: 10,
        color: '#94A3B8',
        fontWeight: '600',
        marginTop: 2,
    },

    // ── Next Goal Card ──
    nextGoalCard: {
        marginBottom: 24,
        backgroundColor: '#FFFFFF',
        borderRadius: 22,
        padding: 18,
        borderWidth: 1.5,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.05,
        shadowRadius: 15,
        elevation: 4,
    },
    nextGoalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 12,
    },
    nextGoalHeaderText: {
        fontSize: 11,
        fontWeight: '850',
        color: '#D97706',
        letterSpacing: 1.2,
    },
    nextGoalBody: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    nextGoalBadgeCircle: {
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 4,
    },
    nextGoalTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#0F172A',
    },
    nextGoalDesc: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '500',
        marginTop: 2,
        marginBottom: 10,
    },
    nextGoalProgressText: {
        fontSize: 13,
        fontWeight: '800',
        color: '#4F46E5',
    },
    nextGoalProgressBarContainer: {
        width: '100%',
    },
    nextGoalProgressBarBg: {
        height: 6,
        backgroundColor: '#F1F5F9',
        borderRadius: 999,
        overflow: 'hidden',
    },
    nextGoalProgressBarFill: {
        height: '100%',
        borderRadius: 999,
    },

    // ── Stats Section Capsule Cards ──
    recapStatCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        paddingVertical: 14,
        paddingHorizontal: 8,
        borderWidth: 1,
        borderColor: '#E8EDF5',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
    },
    recapStatCardValue: {
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: -0.6,
        marginBottom: 4,
    },
    recapStatCardLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#64748B',
        textAlign: 'center',
    },

    // ── Progression Counters ──
    categoryBadgeCount: {
        marginLeft: 'auto',
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
    },
    categoryBadgeCountText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#64748B',
    },
});
