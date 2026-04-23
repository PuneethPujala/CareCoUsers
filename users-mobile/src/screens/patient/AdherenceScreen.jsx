import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import {
    View, Text, StyleSheet, Animated, Pressable, ScrollView, SafeAreaView,
    Platform, ActivityIndicator, Dimensions, Easing, RefreshControl, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    X, TrendingUp, TrendingDown, Minus, Award, Target, Calendar as CalIcon,
    CheckCircle2, Zap, ChevronLeft, Sparkles, Heart, Star,
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import usePatientStore from '../../store/usePatientStore';
import {
    startOfMonth, endOfMonth, eachDayOfInterval, format, isToday,
    startOfWeek, endOfWeek, isSameMonth, parseISO, isSameDay,
} from 'date-fns';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Color System ────────────────────────────────────────────
const C = {
    bg: '#F8FAFC',
    card: '#FFFFFF',
    primary: '#3B82F6',
    primarySoft: '#EFF6FF',
    success: '#22C55E',
    successBg: '#F0FDF4',
    warning: '#F59E0B',
    warningBg: '#FFFBEB',
    danger: '#EF4444',
    dangerBg: '#FEF2F2',
    purple: '#8B5CF6',
    purpleBg: '#F5F3FF',
    dark: '#0F172A',
    mid: '#334155',
    muted: '#64748B',
    light: '#94A3B8',
    border: '#F1F5F9',
    ring90: '#22C55E',
    ring70: '#F59E0B',
    ringLow: '#EF4444',
};

const LEVEL_COLORS = {
    optimal: '#22C55E',
    consistent: '#3B82F6',
    improving: '#F59E0B',
    beginner: '#94A3B8',
};

const STATUS_COLORS = {
    complete: '#22C55E',
    partial: '#F59E0B',
    missed: '#EF4444',
    none: '#E2E8F0',
};

// ── Animated Circular Progress ────────────────────────────────
const CircularProgress = ({ progress, size = 160, strokeWidth = 12, color }) => {
    const animValue = useRef(new Animated.Value(0)).current;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    useEffect(() => {
        Animated.timing(animValue, {
            toValue: progress,
            duration: 1200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [progress]);

    const strokeDashoffset = animValue.interpolate({
        inputRange: [0, 100],
        outputRange: [circumference, 0],
        extrapolate: 'clamp',
    });

    const ringColor = progress >= 90 ? C.ring90 : progress >= 70 ? C.ring70 : C.ringLow;
    const finalColor = color || ringColor;

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            {/* Background ring */}
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <View style={{
                    width: size, height: size, borderRadius: size / 2,
                    borderWidth: strokeWidth, borderColor: '#F1F5F9',
                }} />
            </View>
            {/* Foreground ring (SVG-like via border trick) */}
            <Animated.View style={{
                position: 'absolute',
                width: size - 4,
                height: size - 4,
                borderRadius: (size - 4) / 2,
                borderWidth: strokeWidth,
                borderColor: finalColor,
                borderTopColor: 'transparent',
                borderRightColor: 'transparent',
                transform: [{
                    rotate: animValue.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['0deg', '360deg'],
                    }),
                }],
                opacity: animValue.interpolate({
                    inputRange: [0, 5],
                    outputRange: [0.3, 1],
                    extrapolate: 'clamp',
                }),
            }} />
            {/* Pulsing Glow effect for high scores */}
            {progress >= 90 && (
                <View style={[StyleSheet.absoluteFill, {
                    alignItems: 'center', justifyContent: 'center',
                }]}>
                    <Animated.View style={{
                        width: size + 16, height: size + 16, borderRadius: (size + 16) / 2,
                        backgroundColor: finalColor + '15',
                        position: 'absolute',
                        transform: [{
                            scale: animValue.interpolate({
                                inputRange: [0, 50, 100],
                                outputRange: [1, 1.02, 1.05],
                            })
                        }],
                        opacity: animValue.interpolate({
                            inputRange: [90, 100],
                            outputRange: [0, 1],
                            extrapolate: 'clamp',
                        })
                    }} />
                </View>
            )}
        </View>
    );
};

// ── Animated Number Counter ────────────────────────────────
const AnimatedNumber = ({ value, style, suffix = '%' }) => {
    const animValue = useRef(new Animated.Value(0)).current;
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        animValue.setValue(0);
        Animated.timing(animValue, {
            toValue: value,
            duration: 1000,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();

        const listener = animValue.addListener(({ value: v }) => {
            setDisplayValue(Math.round(v));
        });
        return () => animValue.removeListener(listener);
    }, [value]);

    return <Text style={style}>{displayValue}{suffix}</Text>;
};

// ── Smart Feedback Message ─────────────────────────────────
const getFeedbackMessage = (score, momentum) => {
    if (score >= 95) return { text: "Outstanding! You're at peak consistency 🌟", color: C.success };
    if (score >= 90) return { text: "Excellent work! You're building great habits 💙", color: C.success };
    if (score >= 80) return { text: "Wonderful consistency! Keep this rhythm going ✨", color: C.primary };
    if (score >= 70) return { text: "Good progress! Every dose counts toward better health 🌿", color: C.primary };
    if (score >= 50) return { text: "You're improving! Small steps lead to big changes 🌱", color: C.warning };
    if (momentum === 'rising') return { text: "Your recent trend is looking up! 📈", color: C.primary };
    return { text: "Every new day is a fresh start. You've got this 💪", color: C.muted };
};

// ── Calendar Day Cell ────────────────────────────────────────
const CalendarDay = ({ date, status, rate, isCurrentMonth, onPress }) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const todayFlag = isToday(date);
    const bg = status ? STATUS_COLORS[status] : '#F8FAFC';
    const opacity = isCurrentMonth ? 1 : 0.3;

    const handlePress = () => {
        Animated.sequence([
            Animated.spring(scaleAnim, { toValue: 1.15, friction: 5, useNativeDriver: true }),
            Animated.spring(scaleAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
        ]).start();
        if (onPress) onPress();
    };

    return (
        <Pressable onPress={handlePress} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
            <Animated.View style={[
                styles.dayCell,
                {
                    opacity,
                    backgroundColor: status === 'none' || !status ? '#F8FAFC' : bg + '18',
                    borderColor: todayFlag ? C.primary : status && status !== 'none' ? bg + '40' : 'transparent',
                    borderWidth: todayFlag ? 2 : 1,
                    transform: [{ scale: scaleAnim }],
                },
            ]}>
                {status === 'complete' ? (
                    <CheckCircle2 size={14} color={C.success} fill={C.successBg} />
                ) : (
                    <Text style={[
                        styles.dayText,
                        todayFlag && { color: C.primary, fontWeight: '800' },
                        status === 'partial' && { color: C.warning },
                        status === 'missed' && { color: C.danger },
                    ]}>
                        {format(date, 'd')}
                    </Text>
                )}
            </Animated.View>
        </Pressable>
    );
};

// ── Achievement Badge ────────────────────────────────────────
const AchievementBadge = ({ achievement, index }) => {
    const scaleAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            delay: index * 80,
            friction: 6,
            tension: 50,
            useNativeDriver: true,
        }).start();
    }, []);

    const unlocked = achievement.unlocked;

    return (
        <Animated.View style={[
            styles.achievementCard,
            !unlocked && styles.achievementLocked,
            { transform: [{ scale: scaleAnim }] },
        ]}>
            <Text style={styles.achievementEmoji}>{achievement.emoji}</Text>
            <Text style={[styles.achievementLabel, !unlocked && { color: C.light }]} numberOfLines={1}>
                {achievement.label}
            </Text>
            <Text style={[styles.achievementDesc, !unlocked && { color: '#CBD5E1' }]} numberOfLines={2}>
                {achievement.description}
            </Text>
            {unlocked && (
                <View style={styles.unlockedBadge}>
                    <CheckCircle2 size={10} color={C.success} />
                    <Text style={styles.unlockedText}>Unlocked</Text>
                </View>
            )}
            {!unlocked && (
                <View style={[styles.unlockedBadge, { backgroundColor: '#F1F5F9' }]}>
                    <Text style={[styles.unlockedText, { color: C.light }]}>Locked</Text>
                </View>
            )}
        </Animated.View>
    );
};

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
    }, []);

    return (
        <Animated.View style={[{ width, height, borderRadius, backgroundColor: '#E2E8F0', opacity: anim }, style]} />
    );
};

// ════════════════════════════════════════════════════════════
// ══ MAIN SCREEN ════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
export default function AdherenceScreen({ navigation }) {
    const adherenceDetails = usePatientStore((s) => s.adherenceDetails);
    const fetchAdherenceDetails = usePatientStore((s) => s.fetchAdherenceDetails);
    const patient = usePatientStore((s) => s.patient);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDay, setSelectedDay] = useState(null);

    // Stagger animations
    const staggerAnims = useRef([...Array(8)].map(() => new Animated.Value(0))).current;

    const runAnimations = useCallback(() => {
        staggerAnims.forEach(a => a.setValue(0));
        Animated.stagger(120,
            staggerAnims.map(a => Animated.spring(a, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }))
        ).start();
    }, [staggerAnims]);

    const loadData = useCallback(async () => {
        await fetchAdherenceDetails();
        setLoading(false);
        runAnimations();
    }, [fetchAdherenceDetails, runAnimations]);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchAdherenceDetails();
        setRefreshing(false);
    };

    // ── Derived data ──────────────────────────────────────
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

    const feedback = getFeedbackMessage(score.monthly, momentum);

    // Calendar generation
    const calendarDays = useMemo(() => {
        const now = new Date();
        const start = startOfWeek(startOfMonth(now));
        const end = endOfWeek(endOfMonth(now));
        return eachDayOfInterval({ start, end });
    }, []);

    const dailyLogMap = useMemo(() => {
        const map = {};
        dailyLog.forEach(d => { map[d.date] = d; });
        return map;
    }, [dailyLog]);

    const anim = (i) => ({
        opacity: staggerAnims[i],
        transform: [{ translateY: staggerAnims[i].interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
    });

    const MomentumIcon = momentum === 'rising' ? TrendingUp : momentum === 'falling' ? TrendingDown : Minus;
    const momentumColor = momentum === 'rising' ? C.success : momentum === 'falling' ? C.danger : C.warning;
    const momentumLabel = momentum === 'rising' ? 'Rising' : momentum === 'falling' ? 'Needs Focus' : 'Steady';
    const levelColor = LEVEL_COLORS[level.key] || C.muted;

    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
                <View style={[styles.header, { borderBottomWidth: 0 }]}>
                    <SkeletonItem width={40} height={40} borderRadius={12} />
                    <SkeletonItem width={180} height={24} style={{ marginLeft: 10 }} />
                </View>
                <View style={{ padding: 20 }}>
                    <SkeletonItem width="100%" height={80} borderRadius={16} style={{ marginBottom: 16 }} />
                    <SkeletonItem width="100%" height={120} borderRadius={20} style={{ marginBottom: 16 }} />
                    <SkeletonItem width="100%" height={200} borderRadius={20} style={{ marginBottom: 16 }} />
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <SkeletonItem width="30%" height={100} borderRadius={16} />
                        <SkeletonItem width="30%" height={100} borderRadius={16} />
                        <SkeletonItem width="30%" height={100} borderRadius={16} />
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#FAFBFD' }}>
            {/* Dynamic Mesh Background Simulation */}
            <Animated.View style={{ position: 'absolute', top: -100, left: -50, width: 300, height: 300, borderRadius: 150, backgroundColor: C.primary, opacity: 0.04, transform: [{ scale: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }] }} />
            <Animated.View style={{ position: 'absolute', top: 250, right: -100, width: 250, height: 250, borderRadius: 125, backgroundColor: score.monthly >= 80 ? C.success : C.primary, opacity: 0.04, transform: [{ scale: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }] }} />

            <SafeAreaView style={styles.container}>
                {/* ── Header ── */}
            <View style={styles.header}>
                <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft size={24} color={C.dark} />
                </Pressable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Medication Adherence</Text>
                </View>
                <View style={[styles.levelPill, { backgroundColor: levelColor + '15', borderColor: levelColor + '30' }]}>
                    <Text style={{ fontSize: 14 }}>{level.emoji}</Text>
                    <Text style={[styles.levelText, { color: levelColor }]}>{level.label}</Text>
                </View>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
            >
                {/* ── 1. Smart Feedback Banner ── */}
                <Animated.View style={anim(0)}>
                    <View style={[styles.feedbackBanner, { backgroundColor: feedback.color + '08', borderColor: feedback.color + '20' }]}>
                        <Heart size={16} color={feedback.color} fill={feedback.color + '30'} />
                        <Text style={[styles.feedbackText, { color: feedback.color }]}>{feedback.text}</Text>
                    </View>
                    
                    {insights.length > 0 && (
                        <View style={styles.insightsContainer}>
                            {insights.map((insight, idx) => (
                                <View key={idx} style={styles.insightRow}>
                                    <Sparkles size={14} color={C.purple} />
                                    <Text style={styles.insightText}>{insight}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </Animated.View>

                {/* ── 2. Today's Quest ── */}
                <Animated.View style={anim(1)}>
                    <View style={styles.questCard}>
                        <View style={styles.questHeader}>
                            <View style={styles.questIconBox}>
                                <Target size={18} color={C.primary} />
                            </View>
                            <Text style={styles.questTitle}>Today's Goal</Text>
                            {today.completed && (
                                <View style={styles.completedPill}>
                                    <Sparkles size={12} color={C.success} />
                                    <Text style={styles.completedText}>Complete!</Text>
                                </View>
                            )}
                        </View>
                        <View style={styles.questProgressRow}>
                            <Text style={styles.questCount}>{today.taken}</Text>
                            <Text style={styles.questTotal}>/ {today.total || '—'} doses</Text>
                        </View>
                        <View style={styles.questBarBg}>
                            <Animated.View style={[
                                styles.questBarFill,
                                {
                                    width: today.total > 0 ? `${(today.taken / today.total) * 100}%` : '0%',
                                    backgroundColor: today.completed ? C.success : C.primary,
                                },
                            ]} />
                        </View>
                    </View>
                </Animated.View>

                {/* ── 3. Hero Adherence Ring ── */}
                <Animated.View style={anim(2)}>
                    <View style={styles.ringCard}>
                        <View style={styles.ringRow}>
                            <View style={styles.ringWrap}>
                                <CircularProgress progress={score.monthly} size={150} strokeWidth={14} />
                                <View style={styles.ringCenter}>
                                    <AnimatedNumber value={score.monthly} style={styles.ringPercent} />
                                    <Text style={styles.ringLabel}>Monthly</Text>
                                </View>
                            </View>
                            <View style={styles.ringStats}>
                                <View style={styles.ringStatItem}>
                                    <Text style={styles.ringStatLabel}>This Week</Text>
                                    <AnimatedNumber value={score.weekly} style={styles.ringStatValue} />
                                </View>
                                <View style={[styles.ringStatDivider]} />
                                <View style={styles.ringStatItem}>
                                    <Text style={styles.ringStatLabel}>Momentum</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <MomentumIcon size={16} color={momentumColor} />
                                        <Text style={[styles.ringStatValue, { color: momentumColor, fontSize: 16 }]}>{momentumLabel}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {/* ── 4. Weekly Performance ── */}
                <Animated.View style={anim(3)}>
                    <View style={styles.weeklyCard}>
                        <Text style={styles.sectionTitle}>WEEKLY REPORT</Text>
                        <View style={styles.weeklyStatsRow}>
                            <View style={styles.weeklyStatInline}>
                                <View style={[styles.weeklyStatDot, { backgroundColor: C.success }]} />
                                <Text style={styles.weeklyStatNum}>{weeklySummary.taken}</Text>
                                <Text style={styles.weeklyStatLabel}>Taken</Text>
                            </View>
                            <View style={styles.weeklyStatDivider} />
                            <View style={styles.weeklyStatInline}>
                                <View style={[styles.weeklyStatDot, { backgroundColor: C.danger }]} />
                                <Text style={styles.weeklyStatNum}>{weeklySummary.missed}</Text>
                                <Text style={styles.weeklyStatLabel}>Missed</Text>
                            </View>
                            <View style={styles.weeklyStatDivider} />
                            <View style={styles.weeklyStatInline}>
                                <MomentumIcon size={16} color={weeklySummary.improvement >= 0 ? C.success : C.danger} />
                                <Text style={[styles.weeklyStatNum, { color: weeklySummary.improvement >= 0 ? C.success : C.danger }]}>
                                    {weeklySummary.improvement >= 0 ? '+' : ''}{weeklySummary.improvement}%
                                </Text>
                                <Text style={styles.weeklyStatLabel}>vs Last Week</Text>
                            </View>
                        </View>
                        
                        {/* Vitals Adherence Mini-Bar */}
                        <View style={styles.vitalsAdherenceRow}>
                            <View style={styles.vitalsAdherenceHeader}>
                                <Heart size={14} color={C.danger} />
                                <Text style={styles.vitalsAdherenceLabel}>Vitals Logging Consistency</Text>
                                <Text style={styles.vitalsAdherenceValue}>{vitalsAdherence}%</Text>
                            </View>
                            <View style={styles.questBarBg}>
                                <View style={[styles.questBarFill, { width: `${vitalsAdherence}%`, backgroundColor: vitalsAdherence >= 70 ? C.success : vitalsAdherence >= 40 ? C.warning : C.danger }]} />
                            </View>
                        </View>
                        
                    </View>
                </Animated.View>

                {/* ── 5. Calendar Heatmap ── */}
                <Animated.View style={anim(4)}>
                    <View style={styles.calendarCard}>
                        <View style={styles.calendarHeaderRow}>
                            <CalIcon size={18} color={C.primary} />
                            <Text style={styles.sectionTitle}>{format(new Date(), 'MMMM yyyy').toUpperCase()}</Text>
                        </View>

                        <View style={styles.weekDaysRow}>
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                                <Text key={`wd-${i}`} style={styles.weekDayLabel}>{d}</Text>
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
                                        rate={entry?.rate}
                                        isCurrentMonth={isSameMonth(date, new Date())}
                                        onPress={() => {
                                            // Always allow selection — create synthetic entry for empty days
                                            const dayEntry = entry || {
                                                date: dateStr,
                                                status: 'none',
                                                rate: 0,
                                                medicines: [],
                                                vitals: null,
                                            };
                                            setSelectedDay(dayEntry);
                                        }}
                                    />
                                );
                            })}
                        </View>

                        {/* Calendar Legend */}
                        <View style={styles.legendRow}>
                            {[
                                { label: 'Complete', color: C.success },
                                { label: 'Partial', color: C.warning },
                                { label: 'Missed', color: C.danger },
                                { label: 'No Data', color: '#E2E8F0' },
                            ].map((item) => (
                                <View key={item.label} style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                                    <Text style={styles.legendText}>{item.label}</Text>
                                </View>
                            ))}
                        </View>

                    </View>
                </Animated.View>

                {/* ── 6. Achievements ── */}
                <Animated.View style={anim(5)}>
                    <View style={styles.achievementsSection}>
                        <View style={styles.achievementsHeader}>
                            <Award size={18} color={C.purple} />
                            <Text style={styles.sectionTitle}>ACHIEVEMENTS</Text>
                        </View>
                        <View style={styles.achievementsGrid}>
                            {achievements.map((achievement, idx) => (
                                <AchievementBadge key={achievement.key} achievement={achievement} index={idx} />
                            ))}
                        </View>
                    </View>
                </Animated.View>

                {/* ── Bottom Spacer ── */}
                <View style={{ height: 120 }} />
            </ScrollView>
        </SafeAreaView>

        {/* ── Seamless Slide-Up Modal Date Details ── */}
        <Modal
            visible={!!selectedDay}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setSelectedDay(null)}
        >
            <View style={styles.modalOverlay}>
                <Pressable style={styles.modalBackdrop} onPress={() => setSelectedDay(null)} />
                <View style={styles.dayDetail}>
                    <View style={styles.modalDragHandleContainer}>
                        <View style={styles.modalDragHandle} />
                    </View>
                    
                    {selectedDay && (
                        <>
                            <View style={styles.dayDetailHeader}>
                                <Text style={styles.dayDetailDate}>{format(parseISO(selectedDay.date), 'EEEE, MMMM do yyyy')}</Text>
                                <View style={[styles.dayDetailBadge, { backgroundColor: STATUS_COLORS[selectedDay.status] + '20' }]}>
                                    <Text style={[styles.dayDetailBadgeText, { color: STATUS_COLORS[selectedDay.status] }]}>
                                        {selectedDay.rate}% Adherence
                                    </Text>
                                </View>
                            </View>
                            
                            {selectedDay.medicines && selectedDay.medicines.length > 0 ? (
                                <View style={styles.dayDetailMeds}>
                                    <Text style={styles.dayDetailSectionTitle}>Medications</Text>
                                    {selectedDay.medicines.map((med, idx) => (
                                        <View key={idx} style={styles.dayDetailMedRow}>
                                            {med.taken ? <CheckCircle2 size={16} color={C.success} /> : <X size={16} color={C.danger} />}
                                            <Text style={[styles.dayDetailMedName, med.taken ? { color: C.dark } : { color: C.muted, textDecorationLine: 'line-through' }]}>
                                                {med.name} <Text style={{ color: C.light, fontSize: 11 }}>({med.time})</Text>
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                <Text style={styles.dayDetailEmpty}>No medications scheduled for this day.</Text>
                            )}
                            
                            {selectedDay.vitals && (
                                <View style={styles.dayDetailVitals}>
                                    <Text style={styles.dayDetailSectionTitle}>Vitals Logged</Text>
                                    <Text style={styles.dayDetailVitalText}>
                                        {selectedDay.vitals.heart_rate ? `💓 ${selectedDay.vitals.heart_rate} bpm   ` : ''}
                                        {selectedDay.vitals.systolic ? `🩸 ${selectedDay.vitals.systolic}/${selectedDay.vitals.diastolic}   ` : ''}
                                        {selectedDay.vitals.oxygen_saturation ? `💨 ${selectedDay.vitals.oxygen_saturation}%   ` : ''}
                                        {selectedDay.vitals.hydration ? `💧 ${selectedDay.vitals.hydration}%` : ''}
                                    </Text>
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

// ════════════════════════════════════════════════════════════
// ══ STYLES ═════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: C.bg,
    },

    // ── Header ──
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? 44 : 8,
        paddingBottom: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: C.border,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: C.bg,
    },
    headerCenter: { flex: 1, marginLeft: 10 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: C.dark, letterSpacing: -0.3 },
    levelPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
    },
    levelText: { fontSize: 12, fontWeight: '700' },

    // ── Scroll ──
    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingTop: 16 },

    // ── Feedback Banner ──
    feedbackBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 16,
    },
    feedbackText: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 20 },

    // ── Quest Card ──
    questCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        marginBottom: 16,
        shadowColor: C.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 20,
        elevation: 4,
    },
    questHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    questIconBox: {
        width: 32, height: 32, borderRadius: 10,
        backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center',
    },
    questTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: C.dark },
    completedPill: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: C.successBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
    },
    completedText: { fontSize: 11, fontWeight: '700', color: C.success },
    questProgressRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 },
    questCount: { fontSize: 36, fontWeight: '800', color: C.dark, letterSpacing: -1 },
    questTotal: { fontSize: 16, fontWeight: '500', color: C.muted, marginLeft: 4 },
    questBarBg: {
        height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden',
    },
    questBarFill: {
        height: '100%', borderRadius: 4,
    },

    // ── Ring Card ──
    ringCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        marginBottom: 16,
        shadowColor: C.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 20,
        elevation: 4,
    },
    ringRow: { flexDirection: 'row', alignItems: 'center' },
    ringWrap: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
    ringCenter: { position: 'absolute', alignItems: 'center' },
    ringPercent: { fontSize: 36, fontWeight: '800', color: C.dark, letterSpacing: -1 },
    ringLabel: { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: -2 },
    ringStats: { flex: 1, marginLeft: 24, gap: 16 },
    ringStatItem: {},
    ringStatLabel: { fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    ringStatValue: { fontSize: 20, fontWeight: '800', color: C.dark },
    ringStatDivider: { height: 1, backgroundColor: C.border },

    // ── Weekly Card ──
    weeklyCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        marginBottom: 16,
        shadowColor: C.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 20,
        elevation: 4,
    },
    sectionTitle: {
        fontSize: 13, fontWeight: '800', color: C.light,
        letterSpacing: 1.2, marginBottom: 16,
    },
    weeklyStatsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    weeklyStatInline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    weeklyStatDot: { width: 8, height: 8, borderRadius: 4 },
    weeklyStatDivider: { width: 1, height: 32, backgroundColor: C.border },
    weeklyStatNum: { fontSize: 20, fontWeight: '800', color: C.dark },
    weeklyStatLabel: { fontSize: 11, fontWeight: '600', color: C.muted },

    // ── Vitals Adherence ──
    vitalsAdherenceRow: { marginTop: 20 },
    vitalsAdherenceHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
    vitalsAdherenceLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: C.muted },
    vitalsAdherenceValue: { fontSize: 14, fontWeight: '800', color: C.dark },

    // ── Calendar ──
    calendarCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        marginBottom: 16,
        shadowColor: C.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 20,
        elevation: 4,
    },
    calendarHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    weekDaysRow: {
        flexDirection: 'row', marginBottom: 8, paddingHorizontal: 2,
    },
    weekDayLabel: {
        width: `${100 / 7}%`, textAlign: 'center',
        fontSize: 12, fontWeight: '700', color: C.light,
    },
    calendarGrid: {
        flexDirection: 'row', flexWrap: 'wrap',
    },
    dayCell: {
        flex: 1, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    dayText: { fontSize: 13, fontWeight: '600', color: C.mid },
    legendRow: {
        flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 16, paddingTop: 12,
        borderTopWidth: 1, borderTopColor: C.border,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 11, fontWeight: '600', color: C.light },
    
    // ── Modal Bottom Sheet ──
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.4)' },
    modalDragHandleContainer: { alignItems: 'center', marginBottom: 20 },
    modalDragHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#CBD5E1' },
    
    dayDetail: {
        padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 32, borderTopRightRadius: 32,
        shadowColor: '#000', shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.1, shadowRadius: 20, elevation: 10,
    },
    dayDetailHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 12,
    },
    dayDetailDate: { fontSize: 16, fontWeight: '700', color: C.dark },
    dayDetailBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    dayDetailBadgeText: { fontSize: 11, fontWeight: '700' },
    
    dayDetailSectionTitle: { fontSize: 12, fontWeight: '700', color: C.light, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
    dayDetailMeds: { marginBottom: 16 },
    dayDetailMedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    dayDetailMedName: { fontSize: 14, fontWeight: '600' },
    dayDetailEmpty: { fontSize: 13, color: C.muted, fontStyle: 'italic', marginBottom: 16 },
    
    dayDetailVitals: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12 },
    dayDetailVitalText: { fontSize: 14, fontWeight: '500', color: C.mid, lineHeight: 22 },

    // ── Vitals & Insights ──
    insightsContainer: { marginTop: 12, gap: 8 },
    insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.purpleBg },
    insightText: { flex: 1, fontSize: 13, color: C.mid, fontWeight: '500', lineHeight: 18 },
    
    vitalsAdherenceRow: { marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.border },
    vitalsAdherenceHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    vitalsAdherenceLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: C.dark },
    vitalsAdherenceValue: { fontSize: 14, fontWeight: '800', color: C.primary },

    // ── Achievements ──
    achievementsSection: {
        marginBottom: 16,
    },
    achievementsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    achievementsGrid: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    },
    achievementCard: {
        width: (SCREEN_WIDTH - 40 - 24) / 3,
        backgroundColor: 'rgba(255, 255, 255, 0.75)',
        borderRadius: 16,
        padding: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: C.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 6,
        elevation: 2,
    },
    achievementLocked: {
        opacity: 0.55,
        backgroundColor: '#FAFAFA',
    },
    achievementEmoji: { fontSize: 24, marginBottom: 6 },
    achievementLabel: { fontSize: 11, fontWeight: '700', color: C.dark, textAlign: 'center' },
    achievementDesc: { fontSize: 9, fontWeight: '500', color: C.muted, textAlign: 'center', marginTop: 2, lineHeight: 12 },
    unlockedBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 2,
        backgroundColor: C.successBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginTop: 6,
    },
    unlockedText: { fontSize: 9, fontWeight: '700', color: C.success },
});
