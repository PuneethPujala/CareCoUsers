import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Dimensions, Linking, ActivityIndicator, Image, Animated, Modal, TouchableOpacity } from 'react-native';
import { apiService } from '../../lib/api';
import { HeartPulse, Activity, Bell, Phone, ChevronRight, MessageSquare, ShieldCheck, AlertCircle, RefreshCw, Bluetooth, Lightbulb, Sparkles, TrendingUp, Calendar, ChevronDown, ChevronUp, TriangleAlert, Package2, BotMessageSquare, ClipboardCheck, Clock3, BrainCircuit, ChartColumnIncreasing, X } from 'lucide-react-native';
import AlertManager from '../../utils/AlertManager';
import { colors, radius, spacing, shadows, layout, motion, anim, useReduceMotion } from '../../theme';
import usePatientStore from '../../store/usePatientStore';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import CompanionHeader from '../../components/ui/CompanionHeader';
import TabScreenTransition from '../../components/ui/TabScreenTransition';
import StreakCalendar from '../../components/health/StreakCalendar';

const { width } = Dimensions.get('window');

const FONT = {
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};


const formatDate = (dateInput, formatStr) => {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';
    
    const day = date.getDate();
    const monthIndex = date.getMonth();
    const year = date.getFullYear();
    
    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthsFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    if (formatStr === 'D MMM') {
        return `${day} ${monthsShort[monthIndex]}`;
    }
    if (formatStr === 'D MMM, h:mm a') {
        const hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'pm' : 'am';
        const formattedHours = hours % 12 || 12;
        return `${day} ${monthsShort[monthIndex]}, ${formattedHours}:${minutes} ${ampm}`;
    }
    if (formatStr === 'YYYY-MM-DD') {
        const mm = String(monthIndex + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        return `${year}-${mm}-${dd}`;
    }
    if (formatStr === 'MMMM D, YYYY') {
        return `${monthsFull[monthIndex]} ${day}, ${year}`;
    }
    
    return date.toLocaleDateString();
};

const SkeletonItem = ({ width, height, borderRadius = 8, style }) => {
    const anim = useRef(new Animated.Value(0.3)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
            ])
        ).start();
    }, [anim]);
    return <Animated.View style={[{ width, height, borderRadius, backgroundColor: '#E2E8F0', opacity: anim }, style]} />;
};

export default function CompanionDashboardScreen() {
    const [data, setData] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    
    const pendingInterventionsCount = usePatientStore(s => s.pendingInterventionsCount);
    const setPendingInterventionsCount = usePatientStore(s => s.setPendingInterventionsCount);
    const [expandedBriefing, setExpandedBriefing] = useState(false);
    const [entranceAnimationFinished, setEntranceAnimationFinished] = useState(false);
    
    const selectedPatientId = usePatientStore(s => s.companionSelectedPatientId);
    const navigation = useNavigation();
    const reduceMotion = useReduceMotion();

    const [showCalendarModal, setShowCalendarModal] = useState(false);
    const [historyData, setHistoryData] = useState(null);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [showMedicationListModal, setShowMedicationListModal] = useState(false);

    const handleViewCalendar = async () => {
        setShowCalendarModal(true);
        if (!selectedPatientId) return;
        setLoadingHistory(true);
        try {
            const res = await apiService.companion.getPatientHealthHistory({ patientId: selectedPatientId });
            setHistoryData(res.data);
        } catch (err) {
            console.warn('Failed to load patient health history', err);
            AlertManager.alert('Error', 'Failed to retrieve patient adherence history.');
        } finally {
            setLoadingHistory(false);
        }
    };

    const visibleSections = useMemo(() => {
        if (!data || !data.patient) return [];
        

        return [
            'alerts',
            (data.refill_alerts && data.refill_alerts.length > 0) ? 'refill' : null,
            'adherence',
            'vitals',
            'intelligence_center',
            'briefing',
            'summary',
            'intervention_center',
            (data.medication_schedule && data.medication_schedule.length > 0) ? 'timeline' : null,
            'refresh',
        ].filter(Boolean);
    }, [data]);

    // ── Staggered Entrance Animations ──
    const staggerAnims = useRef([...Array(15)].map(() => new Animated.Value(0))).current;
    const hasAnimated = useRef(false);
    const activeAnimation = useRef(null);

    const runEntranceAnimations = useCallback(() => {
        if (activeAnimation.current) {
            activeAnimation.current.stop();
        }
        staggerAnims.forEach(a => a.setValue(0));
        if (reduceMotion) {
            staggerAnims.forEach(a => a.setValue(1));
            setEntranceAnimationFinished(true);
            return;
        }

        const animations = visibleSections.map((sectionKey, idx) => {
            const val = staggerAnims[idx];
            if (!val) return null;
            
            let duration = motion.normal;
            if (sectionKey === 'summary' || sectionKey === 'briefing' || sectionKey === 'needs_attention') {
                duration = motion.fast;
            } else if (sectionKey === 'forecasts' || sectionKey === 'recommendations') {
                duration = motion.normal;
            } else if (sectionKey === 'journey' || sectionKey === 'health_status') {
                duration = motion.slow;
            }
            
            return Animated.timing(val, {
                toValue: 1,
                duration: duration,
                useNativeDriver: true,
            });
        }).filter(Boolean);

        activeAnimation.current = Animated.stagger(70, animations);
        activeAnimation.current.start(() => {
            activeAnimation.current = null;
            setEntranceAnimationFinished(true);
        });
    }, [staggerAnims, reduceMotion, visibleSections]);

    const sectionAnimForKey = (sectionKey) => {
        if (entranceAnimationFinished || reduceMotion) {
            return { opacity: 1 };
        }
        const idx = visibleSections.indexOf(sectionKey);
        if (idx === -1 || idx >= staggerAnims.length) {
            return { opacity: 1 };
        }
        return {
            opacity: staggerAnims[idx],
            transform: [{ translateY: staggerAnims[idx].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
        };
    };

    // Mock weekly data to render a stunning micro-chart (since backend is real-time only)
    const mockWeeklyAdherence = [
        { day: 'M', rate: 80 },
        { day: 'T', rate: 100 },
        { day: 'W', rate: 60 },
        { day: 'T', rate: 90 },
        { day: 'F', rate: 100 },
        { day: 'S', rate: 40 },
        { day: 'S', rate: 75 },
    ];

    const loadData = async () => {
        try {
            if (!selectedPatientId) return;
            
            // Fetch status and interventions in parallel to speed up load time
            const [res, intRes] = await Promise.all([
                apiService.companion.getPatientStatus({ patientId: selectedPatientId }),
                apiService.companion.getInterventions({ patientId: selectedPatientId }).catch(intErr => {
                    console.warn('Failed to fetch interventions for count', intErr);
                    return { data: { active_interventions: [] } };
                })
            ]);
            
            setData(res.data);
            setPendingInterventionsCount(intRes.data.active_interventions?.length || 0);
        } catch (err) {
            console.warn('Failed to load companion dashboard', err);
        }
    };

    useFocusEffect(
        useCallback(() => {
            // Load latest patient metrics on focus
            loadData();
            
            // Sync dashboard metrics every 30 seconds
            const interval = setInterval(() => {
                loadData();
            }, 30000);
            
            return () => {
                clearInterval(interval);
                // Reset animation flag on screen blur, so animations replay on next focus
                hasAnimated.current = false;
            };
        }, [selectedPatientId])
    );

    // Trigger animations when data first loads or updates
    useEffect(() => {
        if (data && !hasAnimated.current) {
            hasAnimated.current = true;
            runEntranceAnimations();
        }
    }, [data, runEntranceAnimations]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };



    const handleManualRefresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            const res = await apiService.companion.refreshInsights({ patientId: selectedPatientId });
            if (res.data?.success) {
                // Update insights in data state
                setData(prev => ({
                    ...prev,
                    companion_insights: res.data.companion_insights
                }));
                // Reload all other patient dashboard data
                await loadData();
                AlertManager.alert('Refreshed', 'AI companion insights refreshed successfully! ✨');
            }
        } catch (err) {
            console.warn('Failed to refresh insights', err);
            if (err.response?.status === 429) {
                const errorMsg = err.response.data?.error || 'Insights can only be refreshed once every 5 minutes.';
                const retryAfter = err.response.data?.retryAfterSeconds;
                const retryStr = retryAfter ? ` Please try again in ${retryAfter}s.` : '';
                AlertManager.alert('Refresh Limit', `${errorMsg}${retryStr}`);
            } else {
                AlertManager.alert('Refresh Failed', 'Unable to refresh AI insights at this time.');
            }
        } finally {
            setRefreshing(false);
        }
    };

    const renderBreakdownItem = (label, score, maxScore) => {
        const isFull = score === maxScore;
        return (
            <View style={styles.breakdownItem}>
                <View style={[styles.breakdownStatusIcon, { backgroundColor: isFull ? colors.successLight : colors.warningLight }]}>
                    <Text style={{ color: isFull ? colors.success : colors.warning, fontSize: 10, ...FONT.bold }}>
                        {isFull ? '✓' : '!'}
                    </Text>
                </View>
                <Text style={styles.breakdownItemLabel}>{label}</Text>
                <Text style={styles.breakdownItemScore}>{score}/{maxScore}</Text>
            </View>
        );
    };

    if (!data || !data.patient) {
        return (
            <View style={styles.container}>
                {/* Ambient Background Decorations */}
                <View style={StyleSheet.absoluteFill}>
                    <Svg height="100%" width="100%" viewBox="0 0 400 850" preserveAspectRatio="none">
                        <Defs>
                            <SvgGradient id="topBg" x1="0%" y1="0%" x2="100%" y2="100%">
                                <Stop offset="0%" stopColor="#EDE9FE" stopOpacity="0.75" />
                                <Stop offset="100%" stopColor="#F8FAFC" stopOpacity="0" />
                            </SvgGradient>
                            <SvgGradient id="bottomBg" x1="0%" y1="0%" x2="100%" y2="100%">
                                <Stop offset="0%" stopColor="#FAF5FF" stopOpacity="0.75" />
                                <Stop offset="100%" stopColor="#F8FAFC" stopOpacity="0" />
                            </SvgGradient>
                        </Defs>
                        
                        <Path d="M180 0 C260 120, 320 150, 400 120 L400 0 Z" fill="url(#topBg)" />
                        <Path d="M0 620 C60 700, 140 720, 220 850 L0 850 Z" fill="url(#bottomBg)" />
                        <Path d="M-20 180 C80 230, 180 150, 280 230 C340 280, 380 250, 420 310" stroke={colors.borderLight} strokeWidth="1.5" fill="none" opacity="0.4" />
                        <Path d="M-40 210 C60 260, 160 180, 260 260 C320 310, 360 280, 400 340" stroke={colors.borderLight} strokeWidth="1" fill="none" opacity="0.25" />
                        <Circle cx="320" cy="480" r="130" stroke={colors.borderLight} strokeWidth="1" fill="none" opacity="0.2" />
                        <Circle cx="320" cy="480" r="90" stroke={colors.borderLight} strokeWidth="1.2" fill="none" opacity="0.1" />
                    </Svg>
                </View>

                <CompanionHeader
                    style={{ backgroundColor: 'transparent', borderBottomWidth: 0, shadowColor: 'transparent', elevation: 0 }}
                    subtitle="Family Care Portal"
                    title="Patient's Health"
                    onBack={() => navigation.goBack()}
                    right={(
                        <View style={styles.bellButton}>
                            <Bell color={colors.textMuted} size={20} />
                        </View>
                    )}
                />

                <ScrollView contentContainerStyle={styles.content}>
                    {/* Summary Card Skeleton */}
                    <View style={styles.summaryCard}>
                        <View style={styles.summaryColLeft}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <SkeletonItem width={20} height={20} borderRadius={10} />
                                <View style={{ gap: 4 }}>
                                    <SkeletonItem width={70} height={12} />
                                    <SkeletonItem width={100} height={10} />
                                </View>
                            </View>
                        </View>
                        <View style={styles.summaryDivider} />
                        <View style={[styles.summaryColCenter, { gap: 4 }]}>
                            <SkeletonItem width={50} height={10} />
                            <SkeletonItem width={40} height={24} />
                            <SkeletonItem width={30} height={10} />
                        </View>
                        <View style={styles.summaryDivider} />
                        <View style={[styles.summaryColRight, { gap: 4 }]}>
                            <SkeletonItem width={50} height={10} />
                            <SkeletonItem width={55} height={16} />
                        </View>
                    </View>

                    {/* Briefing Skeleton */}
                    <View style={styles.briefingContainerStandalone}>
                        <SkeletonItem style={styles.mascotOverlappingImage} />
                        <View style={[styles.speechBubbleOverlapping, { gap: 10 }]}>
                            <SkeletonItem width={120} height={16} />
                            <SkeletonItem width="100%" height={12} />
                            <SkeletonItem width="90%" height={12} />
                            <SkeletonItem width="60%" height={12} />
                        </View>
                    </View>

                    {/* CTA Cards Skeletons */}
                    <View style={[styles.card, { height: 86, justifyContent: 'center', paddingHorizontal: 20 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <SkeletonItem width={24} height={24} borderRadius={12} />
                            <View style={{ flex: 1, gap: 6 }}>
                                <SkeletonItem width={160} height={14} />
                                <SkeletonItem width={100} height={10} />
                            </View>
                            <SkeletonItem width={14} height={14} borderRadius={7} />
                        </View>
                    </View>

                    <View style={[styles.card, { height: 86, justifyContent: 'center', paddingHorizontal: 20 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <SkeletonItem width={24} height={24} borderRadius={12} />
                            <View style={{ flex: 1, gap: 6 }}>
                                <SkeletonItem width={180} height={14} />
                                <SkeletonItem width={120} height={10} />
                            </View>
                            <SkeletonItem width={14} height={14} borderRadius={7} />
                        </View>
                    </View>

                    {/* Adherence Card Skeleton */}
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <SkeletonItem width={18} height={18} borderRadius={4} style={{ marginRight: 8 }} />
                            <View style={{ gap: 4 }}>
                                <SkeletonItem width={140} height={14} />
                                <SkeletonItem width={100} height={10} />
                            </View>
                        </View>
                        <View style={[styles.meterRow, { marginVertical: 12 }]}>
                            <View style={{ flex: 1, gap: 8 }}>
                                <SkeletonItem width={60} height={28} />
                                <SkeletonItem width={90} height={16} borderRadius={8} />
                            </View>
                            <SkeletonItem width={80} height={80} borderRadius={40} />
                        </View>
                        <View style={styles.chartContainer}>
                            <SkeletonItem width={120} height={12} style={{ marginBottom: 12 }} />
                            <View style={[styles.barChart, { height: 80, alignItems: 'flex-end' }]}>
                                {[60, 90, 40, 80, 100, 30, 70].map((h, i) => (
                                    <View key={i} style={{ alignItems: 'center', gap: 6 }}>
                                        <SkeletonItem width={14} height={h * 0.6} borderRadius={4} />
                                        <SkeletonItem width={12} height={10} />
                                    </View>
                                ))}
                            </View>
                        </View>
                    </View>
                </ScrollView>
            </View>
        );
    }

    const adherence = data.patient.adherence_rate !== null ? data.patient.adherence_rate : 0;
    
    // BP validation: handle empty BP readings gracefully
    const hasVitals = data.latest_vital && 
                      data.latest_vital.bp_systolic && 
                      data.latest_vital.bp_diastolic;

    // AI Decision Support Data
    const insights = data.companion_insights || {};
    const predictions = data.ai_predictions || {};
    const visibilityScore = insights.visibility_score ?? 0;
    const visibilityLabel = insights.visibility_label ?? 'Low';
    const isLowVisibility = visibilityLabel === 'Low' || visibilityScore < 50;
    const riskLevel = isLowVisibility ? 'unknown' : (insights.risk_level || 'low');
    const trendDirection = insights.risk_trend?.direction || 'stable';
    const confidenceLabel = insights.confidence_label ?? 'Low';
    const confidenceScore = insights.confidence_score ?? 0;
    const lastStable = insights.last_stable || { stable_days: 0, currently_stable: false };
    const recommendations = insights.recommendations || [];

    const summaryText = insights.summary || 'AI has not generated a briefing for today yet.';
    const splitIndex = summaryText.indexOf('. ');
    let shortSummary = summaryText;
    let briefDetails = '';
    if (splitIndex !== -1) {
        shortSummary = summaryText.substring(0, splitIndex + 1);
        briefDetails = summaryText.substring(splitIndex + 2);
    }

    return (
        <TabScreenTransition>
            <View style={styles.container}>
            {/* Clean Ambient Gradient Glow Backdrop */}
            <LinearGradient 
                colors={['#EEF2FF', '#F8FAFC']} 
                style={StyleSheet.absoluteFill} 
            />

            <CompanionHeader
                style={{ backgroundColor: 'transparent', borderBottomWidth: 0, shadowColor: 'transparent', elevation: 0 }}
                subtitle="Family Care Portal"
                title={`${data.patient.name}'s Health`}
                onBack={() => navigation.goBack()}
                right={(
                    <Pressable style={({ pressed }) => [styles.bellButton, pressed && { opacity: 0.7 }]} onPress={() => navigation.navigate('CompanionAlerts')}>
                        <Bell color={colors.textPrimary} size={20} />
                        {data.recent_alerts?.length > 0 && <View style={styles.bellDot} />}
                    </Pressable>
                )}
            />

            <ScrollView 
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            >
                {isLowVisibility && (
                    <View style={styles.lowVisibilityBanner}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <AlertCircle color="#B45309" size={18} />
                            <Text style={styles.lowVisibilityBannerTitle}>Low Care Visibility</Text>
                        </View>
                        <Text style={styles.lowVisibilityBannerText}>
                            {data.patient.name} has not logged any medications or vitals recently. Health indicators may be inaccurate until tracking resumes.
                        </Text>
                    </View>
                )}

                {/* 1. Alerts Card */}
                {visibleSections.includes('alerts') && (
                    data.recent_alerts?.length > 0 ? (
                        <Animated.View style={[styles.card, sectionAnimForKey('alerts')]}>
                            <View style={styles.cardHeader}>
                                <View style={[styles.iconBox, { backgroundColor: colors.dangerLight }]}>
                                    <TriangleAlert color={colors.danger} size={20} />
                                </View>
                                <View>
                                    <Text style={styles.cardTitle}>Critical Alerts</Text>
                                    <Text style={styles.cardSub}>Attention required immediately</Text>
                                </View>
                            </View>

                            <View style={styles.alertsList}>
                                {data.recent_alerts.map(a => (
                                    <View key={a._id} style={styles.alertItem}>
                                        <View style={styles.alertDot} />
                                        <Text style={styles.alertDescription}>{a.description}</Text>
                                    </View>
                                ))}
                            </View>
                        </Animated.View>
                    ) : (
                        <Animated.View style={[styles.noAlertsCard, sectionAnimForKey('alerts')]}>
                            <ShieldCheck color={colors.success} size={24} />
                            <Text style={styles.noAlertsText}>All systems normal. No active alerts.</Text>
                        </Animated.View>
                    )
                )}

                {/* 2. Low Pill Stock Refill Warning Banner */}
                {visibleSections.includes('refill') && (
                    <Animated.View style={[styles.refillBanner, sectionAnimForKey('refill')]}>
                        <View style={styles.refillBannerHeader}>
                            <Package2 color={colors.warning} size={20} />
                            <Text style={styles.refillBannerTitle}>Low Medication Stock Alert</Text>
                        </View>
                        <ScrollView style={styles.refillList} nestedScrollEnabled={true}>
                            {data.refill_alerts.map((alert) => (
                                <View key={alert.medication_id} style={styles.refillItem}>
                                    <Text style={styles.refillMedName}>{alert.name}</Text>
                                    <Text style={styles.refillMedStock}>
                                        Only <Text style={{ color: colors.danger, ...FONT.bold }}>{alert.remaining_doses}</Text> doses left!
                                    </Text>
                                    {alert.pharmacy_phone ? (
                                        <Pressable 
                                            style={styles.refillCallBtn}
                                            onPress={() => Linking.openURL(`tel:${alert.pharmacy_phone}`)}
                                        >
                                            <Phone size={12} color={colors.primary} />
                                            <Text style={styles.refillCallText}>Order</Text>
                                        </Pressable>
                                    ) : null}
                                </View>
                            ))}
                        </ScrollView>
                    </Animated.View>
                )}




                {/* 9. Adherence Meter Card */}
                {visibleSections.includes('adherence') && (
                    <Animated.View style={[styles.card, sectionAnimForKey('adherence')]}>
                        <View style={styles.cardHeader}>
                            <View style={[styles.iconBox, { backgroundColor: '#ECFEFF' }]}>
                                <ChartColumnIncreasing color="#0891B2" size={20} />
                            </View>
                            <View>
                                <Text style={styles.cardTitle}>Medication Adherence</Text>
                                <Text style={styles.cardSub}>Today's completed schedule</Text>
                            </View>
                        </View>

                        <View style={styles.meterRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.largeValue} numberOfLines={1} adjustsFontSizeToFit>
                                    {data.patient.adherence_rate !== null ? `${data.patient.adherence_rate}%` : 'N/A'}
                                </Text>
                                <View style={styles.streakBadge}>
                                    <Text style={styles.streakText}>🔥 {data.patient.current_streak} Day Streak</Text>
                                </View>
                            </View>

                            {/* Custom Pure-CSS Circular Progress Approximation */}
                            <View style={styles.circularProgressPlaceholder}>
                                <View style={[
                                    styles.circleSegment, 
                                    { borderColor: adherence > 75 ? colors.success : adherence > 50 ? colors.warning : colors.danger }
                                ]}>
                                    <Text style={styles.circleInsideText}>
                                        {adherence > 75 ? 'Good' : adherence > 50 ? 'Fair' : 'Low'}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Dynamic Status Banner */}
                        <View style={[
                            styles.statusBanner,
                            { backgroundColor: adherence > 75 ? colors.successLight : adherence > 50 ? colors.warningLight : colors.dangerLight }
                        ]}>
                            <Text style={[
                                styles.statusBannerText,
                                { color: adherence > 75 ? colors.success : adherence > 50 ? colors.warning : colors.danger }
                            ]}>
                                {adherence > 75 ? 'Adherence is stable. Keep it up!' : 'Some medicines were missed today.'}
                            </Text>
                        </View>

                        {/* Custom Weekly Progress Micro-Chart */}
                        <View style={styles.chartContainer}>
                            <Text style={styles.chartTitle}>Weekly Adherence Trend</Text>
                            <View style={styles.barChart}>
                                {(data?.weekly_adherence || mockWeeklyAdherence).map((item, idx) => (
                                    <View key={idx} style={styles.barWrapper}>
                                        <View style={styles.barTrack}>
                                            <View style={[
                                                styles.barFill, 
                                                { 
                                                    height: `${item.rate}%`,
                                                    backgroundColor: item.rate > 75 ? colors.success : item.rate > 50 ? colors.warning : colors.danger 
                                                }
                                            ]} />
                                        </View>
                                        <Text style={styles.barLabel}>{item.day}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </Animated.View>
                )}

                {/* 7. Vitals Card (with beautiful elegant empty states) */}
                {visibleSections.includes('vitals') && (
                    <Animated.View style={[styles.card, sectionAnimForKey('vitals')]}>
                        <View style={styles.cardHeader}>
                            <View style={[styles.iconBox, { backgroundColor: '#FFF1F2' }]}>
                                <HeartPulse color="#F43F5E" size={20} />
                            </View>
                            <View>
                                <Text style={styles.cardTitle}>Vitals Status</Text>
                                <Text style={styles.cardSub}>Latest biometric sync</Text>
                            </View>
                        </View>

                        {hasVitals ? (
                            <View style={styles.vitalsRow}>
                                <View style={styles.vitalMetricsBox}>
                                    <Text style={styles.vitalLabel}>Blood Pressure</Text>
                                    <Text style={styles.vitalBigValue} numberOfLines={1} adjustsFontSizeToFit>
                                        {data.latest_vital.bp_systolic}/{data.latest_vital.bp_diastolic}
                                    </Text>
                                    <Text style={styles.vitalUnit}>mmHg</Text>
                                </View>
                                
                                <View style={styles.vitalDivider} />

                                <View style={styles.vitalMetricsBox}>
                                    <Text style={styles.vitalLabel}>Status</Text>
                                    <View style={[styles.vitalBadge, { backgroundColor: colors.successLight }]}>
                                        <Text style={[styles.vitalBadgeText, { color: colors.success }]}>Normal</Text>
                                    </View>
                                    <Text style={styles.vitalTime}>Synced 2h ago</Text>
                                </View>
                            </View>
                        ) : (
                            <View style={styles.vitalsEmptyContainer}>
                                {/* Left Side: Illustrative Blood Pressure Monitor */}
                                <View style={styles.vitalsEmptyLeft}>
                                    <Image 
                                        source={require('../../../assets/bp_monitor_illus.jpg')} 
                                        style={styles.bpMonitorImage}
                                        resizeMode="cover"
                                    />
                                    <View style={styles.bluetoothBadgeOverlay}>
                                        <Bluetooth size={14} color="#FFF" />
                                    </View>
                                </View>

                                {/* Right Side: Status, Description, and Sync Actions */}
                                <View style={styles.vitalsEmptyRight}>
                                    <View style={styles.vitalsStatusBadgeRow}>
                                        <Bluetooth size={14} color={colors.success} />
                                        <Text style={styles.vitalsStatusBadgeText}>All vitals normal</Text>
                                    </View>
                                    
                                    <Text style={styles.vitalsEmptyDesc}>
                                        No BP logs recorded today. Vitals sync when {data.patient.name.split(' ')[0]} connects a BP monitor.
                                    </Text>

                                    <Pressable style={styles.vitalsSyncBtnContainer} onPress={() => loadData()}>
                                        <LinearGradient
                                            colors={['#2563EB', '#1D4ED8']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={styles.vitalsSyncBtnGradient}
                                        >
                                            <Text style={styles.vitalsSyncBtnText}>Sync Now</Text>
                                        </LinearGradient>
                                    </Pressable>

                                    <Pressable style={styles.vitalsConnectBtn} onPress={() => {
                                        AlertManager.alert('Connect Device', 'Searching for nearby Bluetooth blood pressure monitors...');
                                    }}>
                                        <Text style={styles.vitalsConnectBtnText}>Connect Device</Text>
                                    </Pressable>
                                </View>
                            </View>
                        )}
                    </Animated.View>
                )}

                {/* 8. 🧠 Health Intelligence Center CTA Card */}
                {visibleSections.includes('intelligence_center') && (
                    <Animated.View style={[styles.ctaCard, sectionAnimForKey('intelligence_center')]}>
                        <Pressable 
                            style={({ pressed }) => [styles.ctaCardPressable, pressed && { opacity: 0.95 }]}
                            onPress={() => navigation.navigate('CompanionAnalytics')}
                        >
                            <View style={styles.ctaCardHeader}>
                                <View style={[styles.iconBox, { backgroundColor: '#F5F3FF' }]}>
                                    <BrainCircuit color="#7C3AED" size={20} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.ctaTitle}>Health Intelligence Center</Text>
                                    <Text style={styles.ctaSubtitle}>Forecasts • Trends • AI Insights</Text>
                                </View>
                                <ChevronRight color={colors.primary} size={20} />
                            </View>

                            {/* Preview Chips */}
                            <View style={styles.ctaChipsRow}>
                                <View style={[
                                    styles.ctaChip,
                                    riskLevel === 'high' ? styles.chipHigh :
                                    riskLevel === 'medium' ? styles.chipMedium :
                                    riskLevel === 'low' ? styles.chipLow : styles.chipUnknown
                                ]}>
                                    <Text style={[
                                        styles.ctaChipText,
                                        { color: riskLevel === 'high' ? colors.danger :
                                                 riskLevel === 'medium' ? colors.warning :
                                                 riskLevel === 'low' ? colors.success : '#64748B' }
                                    ]}>
                                        Risk: {riskLevel === 'high' ? 'High' : riskLevel === 'medium' ? 'Medium' : riskLevel === 'low' ? 'Low' : 'Unknown'}
                                    </Text>
                                </View>

                                <View style={[styles.ctaChip, { backgroundColor: '#E0F2FE' }]}>
                                    <Text style={[styles.ctaChipText, { color: colors.primary }]}>
                                        Forecast: {trendDirection === 'improving' ? 'Improving' : trendDirection === 'worsening' ? 'Declining' : 'Stable'}
                                    </Text>
                                </View>

                                <View style={[styles.ctaChip, { backgroundColor: '#F1F5F9' }]}>
                                    <Text style={[styles.ctaChipText, { color: '#475569' }]}>
                                        Confidence: {confidenceScore}%
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.ctaViewDetailsRow}>
                                <Text style={styles.ctaViewDetailsText}>View Details</Text>
                                <ChevronRight size={14} color={colors.primary} />
                            </View>
                        </Pressable>
                    </Animated.View>
                )}

                {/* 3. AI Companion Briefing (Mascot Overlapping Speech Bubble) */}
                {visibleSections.includes('briefing') && (
                     <Animated.View style={[styles.briefingContainerStandalone, sectionAnimForKey('briefing')]}>
                         <Image 
                             source={require('../../../assets/doctor_mascot_insights.jpg')} 
                             style={styles.mascotOverlappingImage}
                             resizeMode="cover"
                         />
                         <View style={styles.speechBubbleOverlapping}>
                             <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                 <BotMessageSquare color="#4F46E5" size={20} />
                                 <Text style={[styles.briefingTitleOverlapping, { marginBottom: 0 }]}>AI Companion Briefing</Text>
                             </View>
                             <Text style={styles.briefingText}>{shortSummary}</Text>

                             {expandedBriefing && briefDetails ? (
                                 <View style={styles.expandedBriefingContainer}>
                                     <View style={styles.briefingDivider} />
                                     <Text style={styles.briefingTextDetails}>{briefDetails}</Text>
                                 </View>
                             ) : null}

                             {briefDetails ? (
                                 <Pressable 
                                     style={({ pressed }) => [styles.briefingToggleBtn, pressed && { opacity: 0.7 }]}
                                     onPress={() => setExpandedBriefing(!expandedBriefing)}
                                 >
                                     <Text style={styles.briefingToggleText}>
                                         {expandedBriefing ? 'Show Less' : 'Read Full Briefing'}
                                     </Text>
                                     {expandedBriefing ? (
                                         <ChevronUp size={14} color={colors.primary} style={{ marginLeft: 2 }} />
                                     ) : (
                                         <ChevronDown size={14} color={colors.primary} style={{ marginLeft: 2 }} />
                                     )}
                                 </Pressable>
                             ) : null}
                         </View>
                     </Animated.View>
                 )}

                {/* 4. Top Summary Card (Status Bar) */}
                {visibleSections.includes('summary') && (
                    <Animated.View style={[styles.summaryCard, sectionAnimForKey('summary')]}>
                    <View style={styles.summaryColLeft}>
                        <View style={styles.summaryColRow}>
                            <Activity color={(data.recent_alerts && data.recent_alerts.length > 0) ? colors.danger : '#2563EB'} size={20} />
                            <View style={{ marginLeft: 6, flex: 1 }}>
                                <Text style={styles.summaryColTitle} numberOfLines={1}>
                                    {(data.recent_alerts && data.recent_alerts.length > 0) ? 'Action Needed' : 'Stable Today'}
                                </Text>
                                <Text style={styles.summaryColSub}>
                                    {(data.recent_alerts && data.recent_alerts.length > 0) ? `${data.recent_alerts.length} active alerts` : 'All vitals normal'}
                                </Text>
                            </View>
                        </View>
                    </View>
                    
                    <View style={styles.summaryDivider} />
                    
                    <View style={styles.summaryColCenter}>
                        <Text style={styles.summaryColLabel}>Adherence</Text>
                        <Text 
                            style={[
                                styles.summaryColValue, 
                                { color: adherence > 75 ? colors.success : adherence > 50 ? colors.warning : colors.danger }
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                        >
                            {data.patient.adherence_rate !== null ? `${data.patient.adherence_rate}%` : 'N/A'}
                        </Text>
                        <Text style={styles.summaryColLabelSub}>
                            {adherence > 75 ? 'Good' : adherence > 50 ? 'Fair' : 'Low'}
                        </Text>
                    </View>
                    
                    <View style={styles.summaryDivider} />
                    
                    <View style={styles.summaryColRight}>
                        <Text style={styles.summaryColLabel}>Last Sync</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Text style={styles.summaryColValueSmall}>
                                {hasVitals ? '2h ago' : '8m ago'}
                            </Text>
                            <Pressable onPress={() => loadData()}>
                                <RefreshCw size={12} color={colors.primary} />
                            </Pressable>
                        </View>
                    </View>
                    </Animated.View>
                )}

                {/* 5. ⚡ Proactive Intervention Center CTA Card */}
                {visibleSections.includes('intervention_center') && (
                    <Animated.View style={[styles.ctaCard, { marginTop: 12 }, sectionAnimForKey('intervention_center')]}>
                        <Pressable 
                            style={({ pressed }) => [styles.ctaCardPressable, pressed && { opacity: 0.95 }]}
                            onPress={() => navigation.navigate('InterventionCenter')}
                        >
                            <View style={styles.ctaCardHeader}>
                                <View style={[styles.iconBox, { backgroundColor: '#ECFDF5' }]}>
                                    <ClipboardCheck color="#059669" size={20} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.ctaTitle}>Proactive Intervention Center</Text>
                                    <Text style={styles.ctaSubtitle}>
                                        {pendingInterventionsCount > 0 
                                            ? `${pendingInterventionsCount} care intervention${pendingInterventionsCount > 1 ? 's' : ''} recommended`
                                            : 'No immediate actions needed today'}
                                    </Text>
                                </View>
                                {pendingInterventionsCount > 0 && (
                                    <View style={styles.activeBadgeContainer}>
                                        <Text style={styles.activeBadgeText}>{pendingInterventionsCount}</Text>
                                    </View>
                                )}
                                <ChevronRight color={colors.primary} size={20} />
                            </View>
                            <View style={styles.ctaViewDetailsRow}>
                                <Text style={styles.ctaViewDetailsText}>Open Action Center</Text>
                                <ChevronRight size={14} color={colors.primary} />
                            </View>
                        </Pressable>
                    </Animated.View>
                )}

                {/* 6. Daily Medication Timeline Checklist */}
                {visibleSections.includes('timeline') && (
                    <Animated.View style={[styles.card, sectionAnimForKey('timeline')]}>
                        <View style={styles.cardHeader}>
                            <View style={[styles.iconBox, { backgroundColor: '#F1F5F9' }]}>
                                <Clock3 color="#475569" size={20} />
                            </View>
                            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View>
                                    <Text style={styles.cardTitle}>Today's Dose Timeline</Text>
                                    <Text style={styles.cardSub}>Track hourly adherence status</Text>
                                </View>
                                <Pressable 
                                    style={styles.timelineCalendarBtn} 
                                    onPress={handleViewCalendar}
                                >
                                    <Calendar size={14} color="#7C3AED" />
                                    <Text style={styles.timelineCalendarBtnText}>View Calendar</Text>
                                </Pressable>
                            </View>
                        </View>

                        <View style={styles.timelineContainer}>
                            {(() => {
                                const SLOT_ORDER = { morning: 1, afternoon: 2, evening: 3, night: 4, as_needed: 5 };
                                const sortedSchedule = [...data.medication_schedule].sort((a, b) => {
                                    const aOrder = SLOT_ORDER[a.scheduled_time] || 99;
                                    const bOrder = SLOT_ORDER[b.scheduled_time] || 99;
                                    if (aOrder !== bOrder) return aOrder - bOrder;
                                    return a.name.localeCompare(b.name);
                                });
                                
                                const TIME_MAPPING = {
                                    morning: { time: '08:00', label: 'MORNING' },
                                    afternoon: { time: '13:00', label: 'AFTERNOON' },
                                    evening: { time: '17:00', label: 'AFTERNOON' },
                                    night: { time: '21:00', label: 'NIGHT' },
                                    as_needed: { time: 'AS NEEDED', label: 'PRN' }
                                };
                                
                                return (
                                    <>
                                        {sortedSchedule.map((item, idx) => {
                                            const isLast = idx === sortedSchedule.length - 1;
                                            return (
                                                <View key={idx} style={styles.timelineRow}>
                                                    {/* Left part: Time & Period */}
                                                    <View style={styles.timelineTimeCol}>
                                                        <Text style={styles.timelineTimeHour}>
                                                            {TIME_MAPPING[item.scheduled_time]?.time || '08:00'}
                                                        </Text>
                                                        <Text style={styles.timelineTimePeriod}>
                                                            {TIME_MAPPING[item.scheduled_time]?.label || 'MORNING'}
                                                        </Text>
                                                    </View>

                                                    {/* Middle part: Dotted Line and Node */}
                                                    <View style={styles.timelineLineCol}>
                                                        <View style={styles.timelineLineContainer}>
                                                            {!isLast && <View style={[styles.timelineLine, { 
                                                                borderColor: item.taken ? '#10B981' : '#CBD5E1' 
                                                            }]} />}
                                                            
                                                            {item.taken ? (
                                                                <View style={styles.timelineCheckNode}>
                                                                    <Text style={styles.timelineCheckText}>✓</Text>
                                                                </View>
                                                            ) : (
                                                                <View style={styles.timelinePendingNode} />
                                                            )}
                                                        </View>
                                                    </View>

                                                    {/* Right part: clean card */}
                                                    <Pressable style={({ pressed }) => [styles.timelineCard, item.taken ? styles.timelineCardTaken : null, pressed && { opacity: 0.7 }]}>
                                                        {/* Pill/Capsule Icon in rounded square */}
                                                        <View style={[styles.timelineIconBox, { backgroundColor: item.taken ? '#ECFDF5' : '#F1F5F9' }]}>
                                                            <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={item.taken ? '#10B981' : '#64748B'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <Path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
                                                                <Path d="m8.5 8.5 7 7" />
                                                            </Svg>
                                                        </View>

                                                        <View style={{ flex: 1, paddingRight: 8 }}>
                                                            <Text style={styles.timelineMedName} numberOfLines={1} adjustsFontSizeToFit>{item.name}</Text>
                                                            <Text style={styles.timelineMedDosage} numberOfLines={1} adjustsFontSizeToFit>{item.dosage} • {item.route}</Text>
                                                        </View>

                                                        <View style={[
                                                            styles.timelineStatusBadge, 
                                                            { backgroundColor: item.taken ? '#ECFDF5' : '#FEF3C7' }
                                                        ]}>
                                                            <Text style={[
                                                                styles.timelineStatusText, 
                                                                { color: item.taken ? '#10B981' : '#D97706' }
                                                            ]}>
                                                                {item.taken ? 'Taken' : 'Pending'}
                                                            </Text>
                                                        </View>

                                                        <ChevronRight size={16} color="#94A3B8" style={{ marginLeft: 6 }} />
                                                    </Pressable>
                                                </View>
                                            );
                                        })}
                                        
                                        <Pressable 
                                            style={({ pressed }) => [styles.timelineViewAllBtn, pressed && { opacity: 0.85 }]}
                                            onPress={() => setShowMedicationListModal(true)}
                                        >
                                            <Text style={styles.timelineViewAllText}>View Full Medication List</Text>
                                            <ChevronRight size={14} color="#7C3AED" />
                                        </Pressable>
                                    </>
                                );
                            })()}
                        </View>
                    </Animated.View>
                )}






                {/* 10. Refresh AI Insights Button */}
                {visibleSections.includes('refresh') && (
                    <Animated.View style={[sectionAnimForKey('refresh')]}>
                        <Pressable 
                            style={({ pressed }) => [styles.refreshInsightsBtn, pressed && { opacity: 0.8 }]}
                            onPress={handleManualRefresh}
                            disabled={refreshing}
                        >
                            {refreshing ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <RefreshCw size={14} color={colors.primary} />
                                    <Text style={styles.refreshInsightsBtnText}>Refresh Insights</Text>
                                </View>
                            )}
                        </Pressable>
                    </Animated.View>
                )}
            </ScrollView>

            {/* Modal 1: Adherence Calendar */}
            <Modal
                visible={showCalendarModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowCalendarModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>Adherence Calendar</Text>
                                <Text style={styles.modalSub}>{data?.patient?.name}'s 35-Day consistency board</Text>
                            </View>
                            <TouchableOpacity 
                                style={styles.modalCloseBtn}
                                onPress={() => setShowCalendarModal(false)}
                            >
                                <X size={20} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        
                        {loadingHistory ? (
                            <View style={styles.modalLoading}>
                                <ActivityIndicator size="large" color={colors.primary} />
                                <Text style={styles.modalLoadingText}>Loading health history...</Text>
                            </View>
                        ) : (
                            <ScrollView contentContainerStyle={styles.modalScroll}>
                                <StreakCalendar
                                    dailyLog={
                                        historyData?.history?.map((h) => ({
                                            date: formatDate(h.date, "YYYY-MM-DD"),
                                            adherence: h.adherence?.today ?? null,
                                            mood: h.mood ?? null,
                                            sleepHours: h.sleepHours ?? null,
                                            bp: h.bpAvg ?? null,
                                            score: h.score ?? null,
                                        })) || []
                                    }
                                    timezone={data?.patient?.timezone || "Asia/Kolkata"}
                                    profile={data?.patient}
                                    onPressLogActivity={null}
                                />
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Modal 2: Full Medication List */}
            <Modal
                visible={showMedicationListModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowMedicationListModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>Medication Schedule</Text>
                                <Text style={styles.modalSub}>{data?.patient?.name}'s current active medications</Text>
                            </View>
                            <TouchableOpacity 
                                style={styles.modalCloseBtn}
                                onPress={() => setShowMedicationListModal(false)}
                            >
                                <X size={20} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView contentContainerStyle={styles.modalScroll}>
                            {data?.medication_schedule && data.medication_schedule.length > 0 ? (
                                <View style={styles.medListContainer}>
                                    {data.medication_schedule.map((med, idx) => (
                                        <View key={idx} style={styles.medListItem}>
                                            <View style={[styles.medListIconContainer, { backgroundColor: med.taken ? '#ECFDF5' : '#F8FAFC' }]}>
                                                <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={med.taken ? '#10B981' : '#64748B'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <Path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
                                                    <Path d="m8.5 8.5 7 7" />
                                                </Svg>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.medListName}>{med.name}</Text>
                                                <Text style={styles.medListDetails}>{med.dosage} • {med.route}</Text>
                                                <Text style={styles.medListTime}>Scheduled: {med.scheduled_time?.toUpperCase()}</Text>
                                            </View>
                                            <View style={[
                                                styles.medListStatusBadge,
                                                { backgroundColor: med.taken ? '#ECFDF5' : '#FEF3C7' }
                                            ]}>
                                                <Text style={[
                                                    styles.medListStatusText,
                                                    { color: med.taken ? '#10B981' : '#D97706' }
                                                ]}>
                                                    {med.taken ? 'Taken' : 'Pending'}
                                                </Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                <View style={styles.emptyMedsContainer}>
                                    <Text style={styles.emptyMedsText}>No medications scheduled for today</Text>
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
            </View>
        </TabScreenTransition>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    bellButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        ...shadows.sm,
    },
    bellDot: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.danger,
    },
    content: {
        paddingHorizontal: spacing.screen,
        paddingTop: 20,
        paddingBottom: layout.TAB_BAR_CLEARANCE + 72,
        gap: 16,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOpacity: 0.02,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        elevation: 2,
        padding: spacing.md,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    iconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitle: {
        fontSize: 15,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    cardSub: {
        fontSize: 11,
        ...FONT.medium,
        color: colors.textMuted,
        marginTop: 1,
    },
    meterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    largeValue: {
        fontSize: 48,
        ...FONT.heavy,
        color: colors.textPrimary,
    },
    streakBadge: {
        backgroundColor: colors.primarySoft,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        alignSelf: 'flex-start',
        marginTop: 4,
    },
    streakText: {
        fontSize: 11,
        ...FONT.bold,
        color: colors.primary,
    },
    circularProgressPlaceholder: {
        width: 78,
        height: 78,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    circleSegment: {
        width: 78,
        height: 78,
        borderRadius: 39,
        borderWidth: 6,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'absolute',
    },
    circleInsideText: {
        fontSize: 14,
        ...FONT.bold,
        color: colors.textPrimary,
    },

    statusBanner: {
        padding: 12,
        borderRadius: 16,
        marginBottom: 24,
    },
    statusBannerText: {
        fontSize: 12,
        ...FONT.semibold,
        textAlign: 'center',
    },

    // Micro-Chart Styles
    chartContainer: {
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
        paddingTop: 20,
    },
    chartTitle: {
        fontSize: 13,
        ...FONT.bold,
        color: colors.textSecondary,
        marginBottom: 16,
    },
    barChart: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        height: 100,
        paddingHorizontal: 8,
    },
    barWrapper: {
        alignItems: 'center',
        gap: 8,
    },
    barTrack: {
        width: 14,
        height: 70,
        backgroundColor: '#F1F5F9',
        borderRadius: 7,
        justifyContent: 'flex-end',
    },
    barFill: {
        width: '100%',
        borderRadius: 7,
    },
    barLabel: {
        fontSize: 10,
        ...FONT.semibold,
        color: colors.textMuted,
    },

    // Vitals section
    vitalsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingVertical: 10,
    },
    vitalMetricsBox: {
        alignItems: 'center',
    },
    vitalLabel: {
        fontSize: 12,
        ...FONT.semibold,
        color: colors.textSecondary,
        marginBottom: 6,
    },
    vitalBigValue: {
        fontSize: 32,
        ...FONT.heavy,
        color: colors.textPrimary,
    },
    vitalUnit: {
        fontSize: 11,
        ...FONT.medium,
        color: colors.textMuted,
    },
    vitalDivider: {
        width: 1,
        height: 60,
        backgroundColor: colors.borderLight,
    },
    vitalBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        marginBottom: 6,
    },
    vitalBadgeText: {
        fontSize: 12,
        ...FONT.bold,
    },
    vitalTime: {
        fontSize: 10,
        color: colors.textMuted,
        ...FONT.medium,
    },

    // Elegant Empty Vitals State
    emptyVitalsCard: {
        alignItems: 'center',
        paddingVertical: 20,
        paddingHorizontal: 16,
    },
    emptyVitalsText: {
        fontSize: 16,
        ...FONT.bold,
        color: colors.textPrimary,
        marginTop: 12,
    },
    emptyVitalsSub: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: 6,
        lineHeight: 18,
    },
    emptyVitalsButton: {
        backgroundColor: colors.primary,
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 14,
        marginTop: 16,
    },
    emptyVitalsButtonText: {
        color: colors.surface,
        fontSize: 12,
        ...FONT.bold,
    },

    // Alerts Styles
    alertsList: {
        gap: 12,
    },
    alertItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.dangerLight,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 16,
        gap: 10,
    },
    alertDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.danger,
    },
    alertDescription: {
        fontSize: 13,
        ...FONT.semibold,
        color: colors.danger,
        flex: 1,
    },

    // No Alerts card
    noAlertsCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOpacity: 0.02,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        elevation: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 10,
    },
    noAlertsText: {
        fontSize: 13,
        ...FONT.bold,
        color: colors.success,
    },

    // Low Pill Stock Refill Banner
    refillBanner: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOpacity: 0.02,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        elevation: 2,
        padding: 16,
        gap: 10,
    },
    refillBannerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    refillBannerTitle: {
        fontSize: 14,
        ...FONT.bold,
        color: '#D97706',
    },
    refillList: {
        maxHeight: 120,
    },
    refillItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: 16,
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginVertical: 4,
        gap: 8,
    },
    refillMedName: {
        fontSize: 12,
        ...FONT.bold,
        color: colors.textPrimary,
        flex: 1.5,
    },
    refillMedStock: {
        fontSize: 11,
        ...FONT.medium,
        color: colors.textSecondary,
        flex: 2,
    },
    refillCallBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors.primarySoft,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
    },
    refillCallText: {
        fontSize: 10,
        ...FONT.bold,
        color: colors.primary,
    },

    // Daily Medication Timeline Styles
    timelineContainer: {
        marginTop: 14,
        gap: 16,
    },
    timelineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
    },
    timelineTimeCol: {
        width: 70,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    timelineTimeHour: {
        fontSize: 13,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    timelineTimePeriod: {
        fontSize: 9,
        ...FONT.medium,
        color: colors.textMuted,
        marginTop: 2,
    },
    timelineLineCol: {
        width: 24,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'stretch',
    },
    timelineLineContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        height: '100%',
        width: '100%',
    },
    timelineLine: {
        position: 'absolute',
        top: 24,
        bottom: -24,
        width: 1,
        borderStyle: 'dashed',
        borderLeftWidth: 1.5,
        zIndex: 1,
    },
    timelineCheckNode: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#10B981',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    timelineCheckText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: 'bold',
        marginTop: -1,
    },
    timelinePendingNode: {
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: '#CBD5E1',
        backgroundColor: '#FFFFFF',
        zIndex: 2,
    },
    timelineCard: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#F1F5F9',
        borderRadius: 18,
        padding: 12,
        marginLeft: 4,
    },
    timelineCardTaken: {
        backgroundColor: '#F0FDF4',
        borderColor: '#DCFCE7',
    },
    timelineIconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    timelineMedName: {
        fontSize: 14,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    timelineMedDosage: {
        fontSize: 11,
        ...FONT.medium,
        color: colors.textMuted,
        marginTop: 2,
    },
    timelineStatusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    timelineStatusText: {
        fontSize: 10,
        ...FONT.bold,
    },
    timelineCalendarBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: '#F5F3FF',
    },
    timelineCalendarBtnText: {
        color: '#7C3AED',
        fontSize: 11,
        ...FONT.semibold,
    },
    timelineViewAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: '#E9E3FF',
        borderRadius: 20,
        paddingVertical: 10,
        marginTop: 14,
    },
    timelineViewAllText: {
        color: '#7C3AED',
        fontSize: 12,
        ...FONT.bold,
    },

    // Vitals Trend Analytics Styles
    vitalTrendSummary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginTop: 16,
    },
    vitalTrendSummaryText: {
        fontSize: 12,
        ...FONT.semibold,
    },

    // Summary Card Styles
    summaryCard: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOpacity: 0.02,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        elevation: 2,
        paddingVertical: 16,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    summaryColLeft: {
        flex: 1.6,
        justifyContent: 'center',
    },
    summaryColCenter: {
        flex: 0.8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    summaryColRight: {
        flex: 0.8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    summaryColRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    summaryColTitle: {
        fontSize: 13,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    summaryColSub: {
        fontSize: 10,
        ...FONT.semibold,
        color: colors.textMuted,
        marginTop: 2,
    },
    summaryColLabel: {
        fontSize: 11,
        ...FONT.bold,
        color: colors.textMuted,
    },
    summaryColValue: {
        fontSize: 16,
        ...FONT.heavy,
        marginTop: 2,
    },
    summaryColValueSmall: {
        fontSize: 12,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    summaryColLabelSub: {
        fontSize: 10,
        ...FONT.semibold,
        color: colors.textSecondary,
        marginTop: 1,
    },
    summaryDivider: {
        width: 1,
        height: 32,
        backgroundColor: colors.borderLight,
        marginHorizontal: 8,
    },

    // Horizontal Empty Vitals Styles
    vitalsEmptyContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingVertical: 8,
    },
    vitalsEmptyLeft: {
        position: 'relative',
        width: 120,
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bpMonitorImage: {
        width: 110,
        height: 110,
        borderRadius: 16,
        overflow: 'hidden',
    },
    bluetoothBadgeOverlay: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#2563EB',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#FFF',
    },
    vitalsEmptyRight: {
        flex: 1,
        gap: 8,
    },
    vitalsStatusBadgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    vitalsStatusBadgeText: {
        fontSize: 13,
        ...FONT.bold,
        color: colors.success,
    },
    vitalsEmptyDesc: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textSecondary,
        lineHeight: 18,
    },
    vitalsSyncBtnContainer: {
        marginTop: 4,
        borderRadius: 12,
        overflow: 'hidden',
    },
    vitalsSyncBtnGradient: {
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    vitalsSyncBtnText: {
        color: '#FFF',
        fontSize: 13,
        ...FONT.bold,
    },
    vitalsConnectBtn: {
        alignItems: 'center',
        paddingVertical: 4,
    },
    vitalsConnectBtnText: {
        color: '#2563EB',
        fontSize: 12,
        ...FONT.bold,
    },


    // ─── AI Companion Intelligence Hub Styles ───
    hubCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        padding: spacing.md,
        ...shadows.card,
        borderWidth: 1.5,
        borderColor: colors.primarySoft,
    },
    hubHeader: {
        marginBottom: 16,
    },
    hubTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    hubTitle: {
        fontSize: 16,
        ...FONT.heavy,
        color: colors.primaryMid,
    },
    metricRow: {
        marginBottom: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    badgeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    riskBadgeHigh: {
        backgroundColor: colors.dangerLight,
    },
    riskBadgeMedium: {
        backgroundColor: colors.warningLight,
    },
    riskBadgeLow: {
        backgroundColor: colors.successLight,
    },
    riskBadgeUnknown: {
        backgroundColor: '#F1F5F9',
    },
    riskBadgeText: {
        fontSize: 11,
        ...FONT.bold,
    },
    trendText: {
        fontSize: 11,
        ...FONT.bold,
        marginHorizontal: 4,
    },
    confidenceBadge: {
        backgroundColor: colors.primarySoft,
    },
    confidenceBadgeText: {
        fontSize: 11,
        ...FONT.bold,
    },
    lastStableText: {
        fontSize: 12,
        color: colors.textSecondary,
        ...FONT.medium,
    },
    visibilityContainer: {
        marginTop: 14,
    },
    visibilityHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    visibilityLabel: {
        fontSize: 12,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    visibilityScoreText: {
        fontSize: 12,
        ...FONT.bold,
    },
    progressBarContainer: {
        height: 6,
        backgroundColor: '#E2E8F0',
        borderRadius: 3,
        width: '100%',
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    breakdownGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
        gap: 8,
    },
    breakdownItem: {
        flex: 1,
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        paddingVertical: 8,
        paddingHorizontal: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    breakdownStatusIcon: {
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    breakdownItemLabel: {
        fontSize: 9,
        ...FONT.bold,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    breakdownItemScore: {
        fontSize: 8,
        ...FONT.semibold,
        color: colors.textMuted,
        marginTop: 2,
    },
    briefingContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    mascotImage: {
        width: 54,
        height: 54,
        borderRadius: 27,
        borderWidth: 2,
        borderColor: colors.primarySoft,
        ...shadows.sm,
    },
    speechBubble: {
        flex: 1,
        backgroundColor: colors.primarySoft,
        borderRadius: 16,
        padding: 12,
        position: 'relative',
    },
    speechArrow: {
        position: 'absolute',
        left: -8,
        top: 18,
        width: 0,
        height: 0,
        borderTopWidth: 8,
        borderTopColor: 'transparent',
        borderBottomWidth: 8,
        borderBottomColor: 'transparent',
        borderRightWidth: 8,
        borderRightColor: colors.primarySoft,
    },
    briefingTitle: {
        fontSize: 11,
        ...FONT.bold,
        color: colors.primaryMid,
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    briefingText: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textPrimary,
        lineHeight: 18,
    },
    expandedBriefingContainer: {
        marginTop: 8,
    },
    briefingDivider: {
        height: 1,
        backgroundColor: colors.primaryMid + '20',
        marginVertical: 8,
        borderStyle: 'dashed',
        borderWidth: 1,
        borderRadius: 1,
    },
    briefingTextDetails: {
        fontSize: 11.5,
        ...FONT.medium,
        color: colors.textSecondary,
        lineHeight: 16,
    },
    briefingToggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        marginTop: 10,
        alignSelf: 'flex-start',
    },
    briefingToggleText: {
        fontSize: 11,
        ...FONT.bold,
        color: colors.primary,
    },

    sectionHeading: {
        fontSize: 13,
        ...FONT.bold,
        color: colors.textPrimary,
        marginBottom: 10,
    },
    noActionsBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.successLight,
        padding: 10,
        borderRadius: 12,
    },
    noActionsText: {
        fontSize: 12,
        ...FONT.bold,
        color: colors.success,
    },

    forecastContainer: {
        marginBottom: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    forecastContent: {
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
    },
    noForecastText: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textMuted,
        textAlign: 'center',
        paddingVertical: 12,
    },
    forecastRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    forecastBox: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: 12,
        padding: 8,
        alignItems: 'center',
    },
    forecastDayLabel: {
        fontSize: 10,
        ...FONT.bold,
        color: colors.primary,
        marginBottom: 6,
    },
    forecastStats: {
        alignItems: 'center',
        width: '100%',
    },
    forecastStatVal: {
        fontSize: 12,
        ...FONT.heavy,
        color: colors.textPrimary,
    },
    forecastStatLabel: {
        fontSize: 8,
        ...FONT.medium,
        color: colors.textMuted,
        marginTop: 1,
    },
    forecastWarningOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(248, 250, 252, 0.92)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 6,
    },
    forecastWarningText: {
        fontSize: 10,
        ...FONT.bold,
        color: colors.danger,
        textAlign: 'center',
        lineHeight: 14,
    },
    recommendationsContainer: {
        marginBottom: 16,
    },
    recommendationsList: {
        gap: 8,
    },
    recRow: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'flex-start',
    },
    recBullet: {
        color: colors.primary,
        fontSize: 11,
        marginTop: 1,
    },
    recText: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textPrimary,
        flex: 1,
        lineHeight: 17,
    },
    refreshInsightsBtn: {
        backgroundColor: 'transparent',
        borderRadius: 14,
        borderWidth: 2,
        borderColor: colors.primary,
        paddingVertical: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    refreshInsightsBtnText: {
        color: colors.primary,
        fontSize: 13,
        ...FONT.bold,
    },
    riskBreakdownContainer: {
        marginTop: spacing.md,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
    },
    stackedBar: {
        height: 12,
        flexDirection: 'row',
        backgroundColor: '#E2E8F0',
        borderRadius: 6,
        overflow: 'hidden',
        marginVertical: spacing.sm,
    },
    stackedBarSegment: {
        height: '100%',
    },
    legendGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginTop: spacing.xs,
        gap: 8,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        width: '45%',
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    legendText: {
        fontSize: 10,
        ...FONT.semibold,
        color: colors.textSecondary,
    },
    journeyProgressionContainer: {
        marginVertical: spacing.md,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
    },
    journeyGrid: {
        flexDirection: 'row',
        gap: 8,
        marginTop: spacing.xs,
    },
    journeyGridCard: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: 12,
        padding: spacing.sm,
        alignItems: 'center',
    },
    journeyGridLabel: {
        fontSize: 10,
        ...FONT.semibold,
        color: colors.textMuted,
        textAlign: 'center',
    },
    journeyGridVal: {
        fontSize: 16,
        ...FONT.heavy,
        marginVertical: 4,
    },
    journeyGridSub: {
        fontSize: 9,
        ...FONT.medium,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    riskTimelineContainer: {
        marginBottom: spacing.md,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
    },
    emptyTimelineBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.successLight,
        padding: spacing.md,
        borderRadius: 12,
    },
    emptyTimelineText: {
        fontSize: 12,
        ...FONT.bold,
        color: colors.success,
        flex: 1,
    },
    timelineList: {
        marginTop: spacing.xs,
        gap: spacing.xs,
    },
    timelineRowItem: {
        flexDirection: 'row',
        gap: 12,
    },
    timelineLineCol: {
        alignItems: 'center',
        width: 16,
    },
    timelineMarkerDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginTop: 6,
    },
    timelineVerticalLinkLine: {
        width: 2,
        flex: 1,
        backgroundColor: colors.borderLight,
        marginVertical: 2,
    },
    timelineContentCol: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: 12,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    timelineTransitionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    timelineRiskText: {
        fontSize: 11,
        ...FONT.semibold,
    },
    timelineTransitionArrow: {
        fontSize: 11,
        color: colors.textMuted,
    },
    timelineTransitionDate: {
        fontSize: 9,
        ...FONT.medium,
        color: colors.textMuted,
        marginTop: 2,
    },
    briefingContainerStandalone: {
        position: 'relative',
        marginTop: 24,
        marginBottom: 16,
    },
    mascotOverlappingImage: {
        position: 'absolute',
        top: -20,
        left: 20,
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: 2,
        borderColor: '#FFF',
        zIndex: 10,
        ...shadows.sm,
    },
    speechBubbleOverlapping: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        paddingTop: 36,
        paddingHorizontal: 16,
        paddingBottom: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOpacity: 0.02,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        elevation: 2,
    },
    briefingTitleOverlapping: {
        fontSize: 11,
        ...FONT.bold,
        color: colors.primaryMid,
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    ctaCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOpacity: 0.02,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        elevation: 2,
    },
    ctaCardPressable: {
        padding: spacing.md,
    },
    ctaCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    ctaEmoji: {
        fontSize: 28,
    },
    ctaTitle: {
        fontSize: 15,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    ctaSubtitle: {
        fontSize: 11,
        ...FONT.medium,
        color: colors.textMuted,
        marginTop: 1,
    },
    ctaChipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 16,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
        paddingTop: 12,
    },
    ctaChip: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    ctaChipText: {
        fontSize: 10,
        ...FONT.bold,
    },
    chipHigh: { backgroundColor: colors.dangerLight },
    chipMedium: { backgroundColor: colors.warningLight },
    chipLow: { backgroundColor: colors.successLight },
    chipUnknown: { backgroundColor: '#F1F5F9' },
    ctaViewDetailsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
        marginTop: 12,
    },
    ctaViewDetailsText: {
        fontSize: 11,
        ...FONT.bold,
        color: colors.primary,
    },
    activeBadgeContainer: {
        backgroundColor: colors.danger,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        marginRight: 4,
    },
    activeBadgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        ...FONT.bold,
    },

    lowVisibilityBanner: {
        backgroundColor: '#FFFBEB',
        borderColor: '#FDE68A',
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: 16,
        marginBottom: 8,
    },
    lowVisibilityBannerTitle: {
        fontSize: 14,
        ...FONT.bold,
        color: '#B45309',
    },
    lowVisibilityBannerText: {
        fontSize: 12,
        ...FONT.medium,
        color: '#D97706',
        marginTop: 4,
        lineHeight: 18,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingTop: 20,
        paddingHorizontal: spacing.screen,
        maxHeight: '85%',
        minHeight: '40%',
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    modalTitle: {
        fontSize: 18,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    modalSub: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textMuted,
        marginTop: 2,
    },
    modalCloseBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalScroll: {
        paddingVertical: 16,
        paddingBottom: 40,
    },
    modalLoading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
        gap: 12,
    },
    modalLoadingText: {
        fontSize: 14,
        ...FONT.semibold,
        color: colors.textSecondary,
    },
    medListContainer: {
        gap: 12,
    },
    medListItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        gap: 12,
    },
    medListIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    medListName: {
        fontSize: 15,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    medListDetails: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textSecondary,
        marginTop: 2,
    },
    medListTime: {
        fontSize: 10,
        ...FONT.heavy,
        color: colors.primary,
        marginTop: 4,
        letterSpacing: 0.5,
    },
    medListStatusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    medListStatusText: {
        fontSize: 11,
        ...FONT.bold,
    },
    emptyMedsContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
    },
    emptyMedsText: {
        fontSize: 14,
        ...FONT.medium,
        color: colors.textMuted,
    },
});
