import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Dimensions, ActivityIndicator, Image, Animated, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '../../lib/api';
import { HeartPulse, Activity, Bell, ShieldCheck, AlertCircle, ChevronLeft, RefreshCw, Lightbulb, Sparkles, Calendar, TrendingUp, Pill, Phone, ChevronRight, Eye, Flame, ArrowUpRight, Clock } from 'lucide-react-native';
import AlertManager from '../../utils/AlertManager';
import { colors, radius, spacing, shadows, layout, motion, anim, useReduceMotion } from '../../theme';
import usePatientStore from '../../store/usePatientStore';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import CompanionHeader from '../../components/ui/CompanionHeader';

const { width } = Dimensions.get('window');
const circleSize = 88;

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

export default function CompanionAnalyticsScreen() {
    const [data, setData] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [nudging, setNudging] = useState(false);
    const [requestingBP, setRequestingBP] = useState(false);
    
    const selectedPatientId = usePatientStore(s => s.companionSelectedPatientId);
    const navigation = useNavigation();
    const reduceMotion = useReduceMotion();
    const insets = useSafeAreaInsets();

    // Stagger animation states for sub-elements
    const journeyAnims = useRef([...Array(3)].map(() => new Animated.Value(0))).current;
    const [recAnims, setRecAnims] = useState([]);
    const [timelineAnims, setTimelineAnims] = useState([]);

    const handleNudge = async () => {
        if (nudging) return;
        setNudging(true);
        try {
            await apiService.companion.nudge({ patientId: selectedPatientId });
            AlertManager.alert('Nudge Sent', `${data.patient.name} has been nudged successfully! ❤️`);
        } catch (err) {
            console.warn('Failed to nudge', err);
            AlertManager.alert('Nudge Failed', 'Unable to send nudge reminder.');
        } finally {
            setNudging(false);
        }
    };

    const handleRequestBP = async () => {
        if (requestingBP) return;
        setRequestingBP(true);
        try {
            await apiService.companion.requestBP({ patientId: selectedPatientId });
            AlertManager.alert('BP Request Sent', `Request for Blood Pressure log sent successfully! 🩺`);
        } catch (err) {
            console.warn('Failed to request BP', err);
            AlertManager.alert('Request Failed', 'Unable to send Blood Pressure log request.');
        } finally {
            setRequestingBP(false);
        }
    };

    const handleCall = () => {
        const phone = data?.patient?.phone;
        if (phone) {
            Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
        } else {
            AlertManager.alert('No Phone Number', `${data?.patient?.name || 'Patient'} does not have a phone number configured.`);
        }
    };

    const parseRecommendation = (recText) => {
        const textLower = recText.toLowerCase();
        
        let title = 'Wellness Action';
        let icon = <Sparkles size={20} color={colors.primary} />;
        let actionLabel = 'Review';
        let onPress = null;
        let severity = 'info'; // 'critical' | 'warning' | 'info'
        
        if (textLower.includes('nudge') || textLower.includes('medication') || textLower.includes('remind') || textLower.includes('pill')) {
            title = 'Medication Nudge';
            icon = <Pill size={20} color={textLower.includes('urgent') || textLower.includes('critical') ? colors.danger : colors.warning} />;
            actionLabel = 'Remind Now';
            onPress = handleNudge;
            severity = (textLower.includes('urgent') || textLower.includes('critical')) ? 'critical' : 'warning';
        } else if (textLower.includes('blood pressure') || textLower.includes('bp') || textLower.includes('vital') || textLower.includes('log')) {
            title = 'Vitals Request';
            icon = <HeartPulse size={20} color={colors.warning} />;
            actionLabel = 'Request BP';
            onPress = handleRequestBP;
            severity = 'warning';
        } else if (textLower.includes('call') || textLower.includes('phone') || textLower.includes('contact') || textLower.includes('chat')) {
            title = 'Wellness Call';
            icon = <Phone size={20} color={colors.primary} />;
            actionLabel = 'Call Patient';
            onPress = handleCall;
            severity = 'info';
        }

        return { title, icon, actionLabel, onPress, severity };
    };

    // Helpers for dynamic styling and narratives
    const getTrendBg = (direction) => {
        if (direction === 'improving') return colors.successLight;
        if (direction === 'worsening') return colors.dangerLight;
        return '#F1F5F9';
    };

    const getTrendColor = (direction) => {
        if (direction === 'improving') return colors.success;
        if (direction === 'worsening') return colors.danger;
        return '#64748B';
    };

    const getRiskColor = (level) => {
        if (level === 'high') return colors.danger;
        if (level === 'medium') return colors.warning;
        if (level === 'low') return colors.success;
        return '#64748B';
    };

    const getRiskBg = (level) => {
        if (level === 'high') return colors.dangerLight;
        if (level === 'medium') return colors.warningLight;
        if (level === 'low') return colors.successLight;
        return '#F1F5F9';
    };

    const getTransitionNarrative = (item) => {
        const fromLvl = item.from;
        const toLvl = item.to;
        
        const scoreMap = { high: 84, medium: 56, low: 22, unknown: 0 };
        const fromScore = scoreMap[fromLvl] || 0;
        const toScore = scoreMap[toLvl] || 0;
        
        let title = 'Status Stabilized';
        let narrative = 'Patient health metrics remain stable within normal variations.';
        
        if (fromLvl === 'high' && toLvl === 'medium') {
            title = 'Risk Improved';
            narrative = 'Medication adherence increased to 82% and vitals stabilized.';
        } else if (fromLvl === 'medium' && toLvl === 'low') {
            title = 'Risk Improved';
            narrative = 'Optimal adherence achieved. Vital stats remained stable for 3 consecutive days.';
        } else if (fromLvl === 'high' && toLvl === 'low') {
            title = 'Significant Recovery';
            narrative = 'All recent medication doses completed. Core vitals returned to baseline.';
        } else if (fromLvl === 'low' && toLvl === 'medium') {
            title = 'Risk Elevated';
            narrative = 'Adherence dipped slightly below target. Request vitals to verify status.';
        } else if (fromLvl === 'medium' && toLvl === 'high') {
            title = 'Risk Elevated';
            narrative = 'Missed doses detected. Urgent attention recommended to prevent further decline.';
        } else if (fromLvl === 'low' && toLvl === 'high') {
            title = 'Critical Risk Alert';
            narrative = 'Sudden decline in activity logs and missed medication reminders.';
        } else if (toLvl === 'high') {
            title = 'Risk Escalation';
            narrative = 'Risk level updated to High. Follow-up checklist initiated.';
        } else if (toLvl === 'medium') {
            title = 'Risk Moderate';
            narrative = 'Patient status monitored at Medium risk. Continue standard check-ins.';
        } else if (toLvl === 'low') {
            title = 'Risk Stable';
            narrative = 'Patient remains low risk. Health log coverage is excellent.';
        }
        
        return { title, narrative, fromScore, toScore };
    };

    const loadData = async () => {
        try {
            if (!selectedPatientId) return;
            const res = await apiService.companion.getPatientStatus({ patientId: selectedPatientId });
            setData(res.data);
        } catch (err) {
            console.warn('Failed to load companion analytics', err);
        }
    };

    useEffect(() => {
        loadData();
    }, [selectedPatientId]);

    // ── 9-Step Staggered Entrance Animations ──
    const staggerAnims = useRef([...Array(9)].map(() => new Animated.Value(0))).current;
    const hasAnimated = useRef(false);

    const runEntranceAnimations = useCallback(() => {
        staggerAnims.forEach(a => a.setValue(0));
        if (reduceMotion) {
            staggerAnims.forEach(a => a.setValue(1));
            return;
        }

        const animations = staggerAnims.map((val) => {
            return Animated.timing(val, {
                toValue: 1,
                duration: motion.normal,
                useNativeDriver: true,
            });
        });

        Animated.stagger(85, animations).start();
    }, [staggerAnims, reduceMotion]);

    useEffect(() => {
        if (data && !hasAnimated.current) {
            hasAnimated.current = true;
            runEntranceAnimations();
        }
    }, [data, runEntranceAnimations]);

    // Dynamic animation sequence runner for sub-items
    useEffect(() => {
        if (data) {
            const recCount = (data.companion_insights?.recommendations || []).length;
            const newRecAnims = [...Array(recCount)].map(() => new Animated.Value(0));
            setRecAnims(newRecAnims);

            const timelineCount = Math.min((data.risk_timeline || []).length, 5);
            const newTimelineAnims = [...Array(timelineCount)].map(() => new Animated.Value(0));
            setTimelineAnims(newTimelineAnims);

            journeyAnims.forEach(val => val.setValue(0));

            if (reduceMotion) {
                newRecAnims.forEach(val => val.setValue(1));
                newTimelineAnims.forEach(val => val.setValue(1));
                journeyAnims.forEach(val => val.setValue(1));
            } else {
                Animated.stagger(motion.fast, newRecAnims.map(val => Animated.timing(val, {
                    toValue: 1,
                    duration: motion.fast,
                    useNativeDriver: true
                }))).start();

                Animated.stagger(motion.normal, journeyAnims.map(val => Animated.timing(val, {
                    toValue: 1,
                    duration: motion.normal,
                    useNativeDriver: true
                }))).start();

                Animated.stagger(motion.slow, newTimelineAnims.map(val => Animated.timing(val, {
                    toValue: 1,
                    duration: motion.slow,
                    useNativeDriver: true
                }))).start();
            }
        }
    }, [data, reduceMotion]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const sectionAnimStyle = (idx) => {
        return {
            opacity: staggerAnims[idx],
            transform: reduceMotion ? [] : [{ translateY: staggerAnims[idx].interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }],
        };
    };

    const journeyAnimStyle = (idx) => {
        const val = journeyAnims[idx];
        if (!val) return { opacity: 1 };
        return {
            opacity: val,
            transform: reduceMotion ? [] : [{ translateY: val.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }],
        };
    };

    const renderBreakdownItem = (label, score, maxScore) => {
        const isFull = score === maxScore;
        return (
            <View style={styles.breakdownItem} key={label}>
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
                                <Stop offset="0%" stopColor="#E0F2FE" stopOpacity="0.75" />
                                <Stop offset="100%" stopColor="#F8FAFC" stopOpacity="0" />
                            </SvgGradient>
                        </Defs>
                        {/* Top right curvy gradient backdrop */}
                        <Path d="M180 0 C260 120, 320 150, 400 120 L400 0 Z" fill="url(#topBg)" />
                        
                        {/* Stylized high-end wavy/curved lines only in the top hero region */}
                        <Path d="M-20 160 C80 210, 180 130, 280 210 C340 260, 380 230, 420 290" stroke={colors.borderLight} strokeWidth="1.5" fill="none" opacity="0.6" />
                        <Path d="M-40 190 C60 240, 160 160, 260 240 C320 290, 360 260, 400 320" stroke="#E2E8F0" strokeWidth="1" fill="none" opacity="0.35" />
                    </Svg>
                </View>

                {/* Header */}
                <CompanionHeader
                    style={{ backgroundColor: 'transparent', borderBottomWidth: 0, shadowColor: 'transparent', elevation: 0 }}
                    subtitle="AI Predictions & Trends"
                    title="Health Intelligence"
                    onBack={() => navigation.goBack()}
                    right={(
                        <View style={styles.bellButton}>
                            <Bell color={colors.textMuted} size={20} />
                        </View>
                    )}
                />

                <ScrollView contentContainerStyle={styles.content}>
                    {/* AI Insight Hero Skeleton */}
                    <View style={styles.insightHeroCard}>
                        <View style={[styles.insightHeroHeader, { gap: 6, flexDirection: 'row', alignItems: 'center' }]}>
                            <SkeletonItem width={16} height={16} borderRadius={8} />
                            <SkeletonItem width={80} height={10} />
                        </View>
                        <SkeletonItem width="100%" height={12} style={{ marginTop: 8 }} />
                        <SkeletonItem width="95%" height={12} style={{ marginTop: 6 }} />
                    </View>

                    {/* Score Ring Card Skeleton */}
                    <View style={styles.kpiCardUnified}>
                        <SkeletonItem width={150} height={16} />
                        <View style={styles.kpiCardUnifiedDivider} />
                        <View style={[styles.visibilityHeroContainer, { marginVertical: 10 }]}>
                            <SkeletonItem width={132} height={132} borderRadius={66} />
                        </View>
                        <View style={styles.kpiDetailsGrid}>
                            <View style={[styles.kpiDetailBox, { gap: 6 }]}>
                                <SkeletonItem width={60} height={10} />
                                <SkeletonItem width={80} height={20} borderRadius={8} />
                            </View>
                            <View style={[styles.kpiDetailBox, { gap: 6 }]}>
                                <SkeletonItem width={60} height={10} />
                                <SkeletonItem width={100} height={20} borderRadius={8} />
                            </View>
                        </View>
                        <View style={[styles.stabilityBannerUnified, { gap: 6, flexDirection: 'row', alignItems: 'center' }]}>
                            <SkeletonItem width={8} height={8} borderRadius={4} />
                            <SkeletonItem width={200} height={12} />
                        </View>
                    </View>

                    {/* Coverage Breakdown Skeleton */}
                    <View style={styles.card}>
                        <SkeletonItem width={160} height={16} style={{ marginBottom: 12 }} />
                        <View style={styles.coverageGridUnified}>
                            {[1, 2, 3, 4].map((item) => (
                                <View key={item} style={[styles.coverageCapsule, { gap: 6 }]}>
                                    <View style={styles.coverageCapsuleHeader}>
                                        <SkeletonItem width={70} height={10} />
                                        <SkeletonItem width={30} height={10} />
                                    </View>
                                    <SkeletonItem width="100%" height={8} borderRadius={4} />
                                    <SkeletonItem width={40} height={8} />
                                </View>
                            ))}
                        </View>
                    </View>
                </ScrollView>
            </View>
        );
    }

    const adherence = data.patient.adherence_rate !== null ? data.patient.adherence_rate : 0;
    
    // AI Insights Data
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

    // Circular progress calculation
    const strokeWidth = 8;
    const radiusVal = (circleSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radiusVal;
    const strokeDashoffset = circumference - (visibilityScore / 100) * circumference;

    return (
        <View style={styles.container}>
            {/* Ambient Background Decorations */}
            <View style={StyleSheet.absoluteFill}>
                <Svg height="100%" width="100%" viewBox="0 0 400 850" preserveAspectRatio="none">
                    <Defs>
                        <SvgGradient id="topBg" x1="0%" y1="0%" x2="100%" y2="100%">
                            <Stop offset="0%" stopColor="#E0F2FE" stopOpacity="0.75" />
                            <Stop offset="100%" stopColor="#F8FAFC" stopOpacity="0" />
                        </SvgGradient>
                    </Defs>
                    {/* Top right curvy gradient backdrop */}
                    <Path d="M180 0 C260 120, 320 150, 400 120 L400 0 Z" fill="url(#topBg)" />
                    
                    {/* Stylized high-end wavy/curved lines only in the top hero region */}
                    <Path d="M-20 160 C80 210, 180 130, 280 210 C340 260, 380 230, 420 290" stroke={colors.borderLight} strokeWidth="1.5" fill="none" opacity="0.6" />
                    <Path d="M-40 190 C60 240, 160 160, 260 240 C320 290, 360 260, 400 320" stroke="#E2E8F0" strokeWidth="1" fill="none" opacity="0.35" />
                </Svg>
            </View>

            {/* Header */}
            <CompanionHeader
                style={{ backgroundColor: 'transparent', borderBottomWidth: 0, shadowColor: 'transparent', elevation: 0 }}
                subtitle="AI Predictions & Trends"
                title="Health Intelligence"
                onBack={() => navigation.goBack()}
                right={(
                    <Pressable style={({ pressed }) => [styles.bellButton, pressed && { opacity: 0.7 }]} onPress={() => navigation.navigate('CompanionAlerts')}>
                        <Bell color={colors.textPrimary} size={20} />
                        {data.recent_alerts?.length > 0 && <View style={styles.bellDot} />}
                    </Pressable>
                )}
            />

                        <ScrollView 
                contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
                refreshControl={
                    <RefreshControl 
                        refreshing={refreshing} 
                        onRefresh={onRefresh} 
                        tintColor={colors.primary} 
                    />
                }
            >
                {/* 1. AI Insight Hero */}
                <Animated.View style={[styles.insightHeroCard, sectionAnimStyle(0)]}>
                    <View style={styles.insightHeroHeader}>
                        <Sparkles color="#6366F1" size={16} />
                        <Text style={styles.insightHeroHeaderTitle}>AI INSIGHT</Text>
                    </View>
                    <Text style={styles.insightHeroText}>
                        {(() => {
                            if (isLowVisibility) {
                                const hasVitals = data.vitals_history && data.vitals_history.length > 0;
                                return !hasVitals 
                                    ? `Prediction confidence is low because the patient has not logged vitals in the past 7 days.`
                                    : `Prediction confidence is limited because the patient has not synced sufficient health logs recently.`;
                            }
                            if (riskLevel === 'high') {
                                return `Immediate caregiver attention recommended due to elevated patient risk indicators.`;
                            }
                            if (riskLevel === 'medium') {
                                return `Minor regression detected. Monitor patient vitals and medication adherence closely.`;
                            }
                            return `Patient health trajectory appears stable and consistent this week.`;
                        })()}
                    </Text>
                </Animated.View>

                {/* 2. Visibility Hero Ring & KPIs */}
                <Animated.View style={[styles.kpiCardUnified, sectionAnimStyle(1)]}>
                    <Text style={styles.kpiCardUnifiedTitle}>Health Intelligence Score</Text>
                    <View style={styles.kpiCardUnifiedDivider} />
                    
                    {/* Visibility Hero Ring */}
                    <View style={styles.visibilityHeroContainer}>
                        <Svg width={132} height={132}>
                            <Circle
                                cx={66}
                                cy={66}
                                r={56}
                                stroke="#E2E8F0"
                                strokeWidth={10}
                                fill="transparent"
                            />
                            <Circle
                                cx={66}
                                cy={66}
                                r={56}
                                stroke={visibilityScore >= 80 ? '#10B981' : visibilityScore >= 50 ? '#F59E0B' : '#EF4444'}
                                strokeWidth={10}
                                fill="transparent"
                                strokeDasharray={2 * Math.PI * 56}
                                strokeDashoffset={2 * Math.PI * 56 - (visibilityScore / 100) * (2 * Math.PI * 56)}
                                strokeLinecap="round"
                                transform="rotate(-90 66 66)"
                            />
                        </Svg>
                        <View style={styles.visibilityHeroTextContainer}>
                            <Text style={[styles.visibilityHeroPercent, { color: visibilityScore >= 80 ? '#10B981' : visibilityScore >= 50 ? '#F59E0B' : '#EF4444' }]}>
                                {visibilityScore}%
                            </Text>
                            <Text style={styles.visibilityHeroLabel}>Visibility</Text>
                            <Text style={styles.visibilityHeroSub}>{visibilityLabel} Quality</Text>
                        </View>
                    </View>

                    {/* Unified details: Risk Status and Confidence Score */}
                    <View style={styles.kpiDetailsGrid}>
                        <View style={styles.kpiDetailBox}>
                            <Text style={styles.kpiDetailLabel}>Risk Status</Text>
                            <View style={[
                                styles.kpiDetailBadge, 
                                { backgroundColor: getRiskBg(riskLevel) }
                            ]}>
                                <Text style={[
                                    styles.kpiDetailBadgeText,
                                    { color: getRiskColor(riskLevel) }
                                ]}>
                                    {riskLevel.toUpperCase()}
                                </Text>
                            </View>
                        </View>
                        
                        <View style={styles.kpiDetailBox}>
                            <Text style={styles.kpiDetailLabel}>Confidence</Text>
                            <View style={[styles.kpiDetailBadge, { backgroundColor: '#EEF2FF' }]}>
                                <Text style={[styles.kpiDetailBadgeText, { color: '#6366F1' }]}>
                                    {confidenceScore}% ({confidenceLabel})
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Stability Banner */}
                    <View style={styles.stabilityBannerUnified}>
                        <View style={[styles.stabilityPulseDot, { backgroundColor: lastStable.currently_stable ? '#10B981' : '#F59E0B' }]} />
                        {(() => {
                            if (lastStable.currently_stable) {
                                return (
                                    <Text style={styles.stabilityBannerText}>
                                        Patient stable for <Text style={FONT.bold}>{lastStable.stable_days}</Text> consecutive days
                                    </Text>
                                );
                            } else if (lastStable.last_stable_at) {
                                const diffMs = Date.now() - new Date(lastStable.last_stable_at).getTime();
                                const diffDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                                return (
                                    <Text style={styles.stabilityBannerText}>
                                        Patient last stable <Text style={FONT.bold}>{diffDays}</Text> {diffDays === 1 ? 'day' : 'days'} ago
                                    </Text>
                                );
                            } else {
                                return (
                                    <Text style={styles.stabilityBannerText}>
                                        Patient status currently unstable
                                    </Text>
                                );
                            }
                        })()}
                    </View>
                </Animated.View>

                {/* 3. Coverage Breakdown Progress Capsules */}
                <Animated.View style={[styles.card, sectionAnimStyle(2)]}>
                    <Text style={styles.sectionHeading}>📋 Coverage Breakdown</Text>
                    <View style={styles.coverageGridUnified}>
                        {(() => {
                            const bd = insights.visibility_breakdown || { medications: 0, vitals: 0, wearable: 0, mood: 0 };
                            const items = [
                                { label: 'Medications', score: bd.medications ?? 0, max: 35 },
                                { label: 'Vitals Log', score: bd.vitals ?? 0, max: 35 },
                                { label: 'Wearables', score: bd.wearable ?? 0, max: 15 },
                                { label: 'Mood Logs', score: bd.mood ?? 0, max: 15 }
                            ];
                            
                            return items.map((item) => {
                                const percent = item.max > 0 ? Math.round((item.score / item.max) * 100) : 0;
                                const barColor = percent >= 80 ? '#10B981' : percent >= 40 ? '#F59E0B' : '#EF4444';
                                
                                return (
                                    <View style={styles.coverageCapsule} key={item.label}>
                                        <View style={styles.coverageCapsuleHeader}>
                                            <Text style={styles.coverageCapsuleLabel}>{item.label}</Text>
                                            <Text style={[styles.coverageCapsulePercent, { color: barColor }]}>
                                                {percent}%
                                            </Text>
                                        </View>
                                        <View style={styles.coverageCapsuleBarTrack}>
                                            <View style={[styles.coverageCapsuleBarFill, { width: `${percent}%`, backgroundColor: barColor }]} />
                                        </View>
                                        <Text style={styles.coverageCapsuleScore}>
                                            {item.score}/{item.max} pts
                                        </Text>
                                    </View>
                                );
                            });
                        })()}
                    </View>
                </Animated.View>

                {/* 4. Risk Contributors Card */}
                <Animated.View style={[styles.card, sectionAnimStyle(3)]}>
                    <View style={styles.sectionHeaderRow}>
                        <Activity color="#6366F1" size={18} />
                        <Text style={styles.cardTitle}>Risk Contributors</Text>
                    </View>
                    <Text style={styles.cardSub}>Why current patient risk level exists</Text>

                    {(() => {
                        const riskBreakdown = insights.risk_breakdown || { adherence: 30, vitals: 40, mood: 15, visibility: 15 };
                        const totalBreakdown = (riskBreakdown.adherence || 0) + (riskBreakdown.vitals || 0) + (riskBreakdown.mood || 0) + (riskBreakdown.visibility || 0) || 1;
                        const pctAdherence = Math.round(((riskBreakdown.adherence || 0) / totalBreakdown) * 100);
                        const pctVitals = Math.round(((riskBreakdown.vitals || 0) / totalBreakdown) * 100);
                        const pctMood = Math.round(((riskBreakdown.mood || 0) / totalBreakdown) * 100);
                        const pctVisibility = Math.round(((riskBreakdown.visibility || 0) / totalBreakdown) * 100);

                        const list = [
                            { key: 'Meds', label: 'Medications', pct: pctAdherence, color: '#10B981' },
                            { key: 'Vitals', label: 'Vitals Sync', pct: pctVitals, color: '#EF4444' },
                            { key: 'Wellness', label: 'Mood Tracking', pct: pctMood, color: '#F59E0B' },
                            { key: 'Visibility', label: 'Data Visibility', pct: pctVisibility, color: '#6366F1' }
                        ];

                        const sorted = [...list].sort((a, b) => b.pct - a.pct);

                        return (
                            <View style={{ marginTop: 12 }}>
                                <View style={styles.stackedBar}>
                                    {pctAdherence > 0 && <View style={[styles.stackedBarSegment, { width: `${pctAdherence}%`, backgroundColor: '#10B981' }]} />}
                                    {pctVitals > 0 && <View style={[styles.stackedBarSegment, { width: `${pctVitals}%`, backgroundColor: '#EF4444' }]} />}
                                    {pctMood > 0 && <View style={[styles.stackedBarSegment, { width: `${pctMood}%`, backgroundColor: '#F59E0B' }]} />}
                                    {pctVisibility > 0 && <View style={[styles.stackedBarSegment, { width: `${pctVisibility}%`, backgroundColor: '#6366F1' }]} />}
                                </View>

                                {/* Mini Intelligence Cards */}
                                <View style={styles.contributorsGrid}>
                                    {sorted.map((item, idx) => {
                                        let role = 'Minimal Impact';
                                        let roleBg = '#F1F5F9';
                                        let roleColor = '#64748B';

                                        if (item.pct > 0) {
                                            if (idx === 0 && item.pct > 30) {
                                                role = 'Primary Driver';
                                                roleBg = '#FEF2F2';
                                                roleColor = '#EF4444';
                                            } else if (idx === 1 && item.pct > 15) {
                                                role = 'Secondary Driver';
                                                roleBg = '#EEF2FF';
                                                roleColor = '#6366F1';
                                            } else {
                                                role = 'Contributing';
                                                roleBg = '#FFFBEB';
                                                roleColor = '#F59E0B';
                                            }
                                        }

                                        return (
                                            <View key={item.key} style={styles.contributorCard}>
                                                <View style={styles.contributorCardHeader}>
                                                    <View style={styles.contributorLabelRow}>
                                                        <View style={[styles.contributorDot, { backgroundColor: item.color }]} />
                                                        <Text style={styles.contributorCardLabel}>{item.label}</Text>
                                                    </View>
                                                    <View style={[styles.contributorRoleBadge, { backgroundColor: roleBg }]}>
                                                        <Text style={[styles.contributorRoleText, { color: roleColor }]}>
                                                            {role}
                                                        </Text>
                                                    </View>
                                                </View>
                                                <View style={styles.contributorMetricRow}>
                                                    <Text style={styles.contributorMetricPercent}>{item.pct}%</Text>
                                                    <Text style={styles.contributorMetricImpact}>Impact</Text>
                                                </View>
                                                <View style={styles.contributorBarTrack}>
                                                    <View style={[styles.contributorBarFill, { width: `${item.pct}%`, backgroundColor: item.color }]} />
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        );
                    })()}
                </Animated.View>

                {/* 5. 3-Day Forecast & Frosted Alert */}
                <Animated.View style={[styles.card, sectionAnimStyle(4)]}>
                    <View style={styles.sectionHeaderRow}>
                        <Sparkles color="#6366F1" size={18} />
                        <Text style={styles.cardTitle}>3-Day Vital Forecast</Text>
                    </View>
                    <Text style={styles.cardSub}>AI outlook & upcoming vital status predictions</Text>

                    {/* Softer, frosted alert card if visibility is low */}
                    {confidenceLabel === 'Low' && (
                        <View style={styles.frostedAlertCard}>
                            <View style={styles.frostedAlertHeader}>
                                <AlertCircle color="#F59E0B" size={16} />
                                <Text style={styles.frostedAlertTitle}>Limited Data Available</Text>
                            </View>
                            <Text style={styles.frostedAlertText}>
                                Predictions are currently based on incomplete vitals. Update logs to improve forecast confidence.
                            </Text>
                            <Pressable 
                                style={({ pressed }) => [styles.frostedAlertBtn, pressed && { opacity: 0.85 }]}
                                onPress={handleRequestBP}
                            >
                                <Text style={styles.frostedAlertBtnText}>Request BP Reading</Text>
                                <ArrowUpRight size={14} color="#6366F1" />
                            </Pressable>
                        </View>
                    )}

                    <View style={styles.forecastContent}>
                        {(() => {
                            const predData = predictions.predictions || [];
                            if (predData.length === 0) {
                                return <Text style={styles.noForecastText}>No forecasting metrics synchronized yet.</Text>;
                            }

                            const getForecastHumanStatus = (bp) => {
                                if (!bp) return { status: '🟢 Stable', sub: 'Low concern', color: '#10B981', bg: '#ECFDF5' };
                                const sys = bp.systolic || 120;
                                const dia = bp.diastolic || 80;
                                
                                if (sys >= 140 || dia >= 90) {
                                    return { status: '🔴 Elevated', sub: 'Needs attention', color: '#EF4444', bg: '#FEF2F2' };
                                }
                                if (sys >= 130 || dia >= 85) {
                                    return { status: '🟡 Watch', sub: 'Monitor closely', color: '#F59E0B', bg: '#FFFBEB' };
                                }
                                return { status: '🟢 Stable', sub: 'Low concern', color: '#10B981', bg: '#ECFDF5' };
                            };

                            return (
                                <View style={styles.forecastRow}>
                                    {predData.slice(0, 3).map((pred, idx) => {
                                        const dayLabel = idx === 0 ? 'Tomorrow' : idx === 1 ? 'Day 2' : 'Day 3';
                                        const human = getForecastHumanStatus(pred.blood_pressure);
                                        return (
                                            <View key={pred.date || idx} style={styles.forecastBox}>
                                                <Text style={styles.forecastDayLabel}>{dayLabel}</Text>
                                                
                                                <View style={[styles.forecastHumanBadge, { backgroundColor: human.bg }]}>
                                                    <Text style={[styles.forecastHumanBadgeText, { color: human.color }]}>
                                                        {human.status}
                                                    </Text>
                                                </View>
                                                <Text style={styles.forecastHumanSubText}>{human.sub}</Text>
                                                
                                                <View style={styles.forecastStatsDivider} />

                                                <View style={styles.forecastStats}>
                                                    <Text style={styles.forecastStatVal}>
                                                        {pred.blood_pressure?.systolic || 120}/{pred.blood_pressure?.diastolic || 80}
                                                    </Text>
                                                    <Text style={styles.forecastStatLabel}>BP (mmHg)</Text>
                                                    
                                                    <Text style={[styles.forecastStatVal, { marginTop: 6 }]}>
                                                        {pred.heart_rate || 75}
                                                    </Text>
                                                    <Text style={styles.forecastStatLabel}>HR (bpm)</Text>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            );
                        })()}
                    </View>
                </Animated.View>

                {/* 6. 14-Day Health Trajectory */}
                {insights.predictive_health?.forecast && (
                    <Animated.View style={[styles.card, sectionAnimStyle(5)]}>
                        <View style={styles.sectionHeaderRow}>
                            <Sparkles color="#6366F1" size={18} />
                            <Text style={styles.cardTitle}>14-Day Health Trajectory</Text>
                        </View>
                        <Text style={styles.cardSub}>Long-term AI trajectory forecast</Text>

                        {/* Recovery Banner */}
                        {insights.predictive_health?.recovery?.status && (
                            <View style={styles.recoveryBanner}>
                                <ShieldCheck size={18} color="#10B981" />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.recoveryBannerTitle}>Patient is recovering</Text>
                                    <Text style={styles.recoveryBannerDesc}>
                                        Risk has decreased for {insights.predictive_health.recovery.days} consecutive days (Confidence: {insights.predictive_health.recovery.confidence}%).
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Early Warning Alert */}
                        {(insights.predictive_health?.risk_trends?.velocity > 0 || insights.predictive_health?.forecast?.trajectory === 'negative') && (
                            <View style={styles.warningAlertBanner}>
                                <AlertCircle size={18} color="#EF4444" style={{ marginTop: 2 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.warningAlertTitle}>Early Warning Alert</Text>
                                    <Text style={styles.warningAlertDesc}>
                                        {insights.predictive_health.risk_trends.velocity > 0
                                            ? `Risk velocity is increasing (Velocity: +${insights.predictive_health.risk_trends.velocity.toFixed(2)}, Accel: +${insights.predictive_health.risk_trends.acceleration.toFixed(2)}). `
                                            : ''}
                                        {insights.predictive_health.forecast.trajectory === 'negative'
                                            ? `Trajectory forecast projects a decline in health score to ${insights.predictive_health.forecast.projected_score_14d} within 14 days.`
                                            : ''}
                                    </Text>
                                </View>
                            </View>
                        )}

                        <View style={styles.trajectoryRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.trajectoryText}>
                                    Currently projected: <Text style={FONT.bold}>{insights.predictive_health.forecast.projected_score_14d}/100</Text>
                                </Text>
                                <Text style={styles.trajectorySub}>
                                    Based on {adherence}% adherence & latest vitals
                                </Text>
                            </View>
                            <View style={{
                                backgroundColor: insights.predictive_health.forecast.trajectory === 'positive' ? '#ECFDF5' : (insights.predictive_health.forecast.trajectory === 'negative' ? '#FEF2F2' : '#F1F5F9'),
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: insights.predictive_health.forecast.trajectory === 'positive' ? '#A7F3D0' : (insights.predictive_health.forecast.trajectory === 'negative' ? '#FCA5A5' : '#E2E8F0')
                            }}>
                                <Text style={{
                                    fontSize: 11,
                                    ...FONT.bold,
                                    color: insights.predictive_health.forecast.trajectory === 'positive' ? '#10B981' : (insights.predictive_health.forecast.trajectory === 'negative' ? '#EF4444' : '#64748B')
                                }}>
                                    {insights.predictive_health.forecast.trajectory === 'positive' ? 'Improving ↗' : (insights.predictive_health.forecast.trajectory === 'negative' ? 'Declining ↘' : 'Stable ➔')}
                                </Text>
                            </View>
                        </View>
                    </Animated.View>
                )}

                {/* 7. AI Recommendations */}
                {recommendations.length > 0 && (
                    <Animated.View style={[styles.card, { borderColor: colors.primarySoft, borderWidth: 1.5 }, sectionAnimStyle(6)]}>
                        <View style={styles.sectionHeaderRow}>
                            <Lightbulb color={colors.warning} size={18} />
                            <Text style={styles.cardTitle}>AI Recommendations</Text>
                        </View>
                        <Text style={styles.cardSub}>Suggested caretaker checklist actions</Text>
                        
                        <View style={styles.recommendationsList}>
                            {recommendations.map((rec, idx) => {
                                const parsed = parseRecommendation(rec);
                                const animVal = recAnims[idx] || new Animated.Value(1);
                                
                                let severityLabel = '🔵 Optimization';
                                let severityBg = colors.primarySoft;
                                let severityTextColor = colors.primary;
                                
                                if (parsed.severity === 'critical') {
                                    severityLabel = '🔴 Critical';
                                    severityBg = colors.dangerLight;
                                    severityTextColor = colors.danger;
                                } else if (parsed.severity === 'warning') {
                                    severityLabel = '🟡 Attention Needed';
                                    severityBg = colors.warningLight;
                                    severityTextColor = colors.warning;
                                }

                                const cardAnimStyle = {
                                    opacity: animVal,
                                    transform: [
                                        { translateY: animVal.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) },
                                        { scale: animVal.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }
                                    ]
                                };

                                const handlePress = parsed.onPress || (() => navigation.navigate('InterventionCenter'));

                                return (
                                    <Animated.View key={rec || idx} style={[styles.recommendationCard, cardAnimStyle]}>
                                        <View style={styles.recommendationCardHeader}>
                                            <View style={styles.recommendationHeaderLeft}>
                                                {parsed.icon}
                                                <Text style={styles.recommendationCardTitle}>{parsed.title}</Text>
                                            </View>
                                            <View style={[styles.severityBadge, { backgroundColor: severityBg }]}>
                                                <Text style={[styles.severityBadgeText, { color: severityTextColor }]}>
                                                    {severityLabel}
                                                </Text>
                                            </View>
                                        </View>
                                        <Text style={styles.recommendationCardReason}>{rec}</Text>
                                        <Pressable 
                                            style={({ pressed }) => [
                                                styles.recommendationCardButton, 
                                                { backgroundColor: parsed.severity === 'critical' ? colors.danger : parsed.severity === 'warning' ? colors.warning : colors.primary },
                                                pressed && { opacity: 0.8 }
                                            ]}
                                            onPress={handlePress}
                                        >
                                            <Text style={styles.recommendationCardButtonText}>{parsed.actionLabel}</Text>
                                            <ArrowUpRight size={14} color="#FFF" />
                                        </Pressable>
                                    </Animated.View>
                                );
                            })}
                        </View>
                    </Animated.View>
                )}

                {/* 8. Journey Progression Cards */}
                <Animated.View style={[styles.card, sectionAnimStyle(7)]}>
                    <View style={styles.sectionHeaderRow}>
                        <Calendar color={colors.primary} size={18} />
                        <Text style={styles.cardTitle}>Journey Progression</Text>
                    </View>
                    <Text style={styles.cardSub}>Long-term progression metrics</Text>

                    <View style={styles.journeyListContainer}>
                        {/* Card 1: Risk Status */}
                        <Animated.View style={[styles.journeyMetricCard, journeyAnimStyle(0)]}>
                            <View style={styles.journeyMetricHeader}>
                                <Text style={styles.journeyMetricLabel}>Risk Status</Text>
                                <TrendingUp size={16} color={colors.textSecondary} />
                            </View>
                            <View style={styles.journeyMetricRow}>
                                <Text style={[styles.journeyMetricVal, { color: getRiskColor(riskLevel) }]}>
                                    {riskLevel.toUpperCase()}
                                </Text>
                                <View style={[styles.trendBadge, { backgroundColor: getTrendBg(trendDirection) }]}>
                                    <Text style={[styles.trendBadgeText, { color: getTrendColor(trendDirection) }]}>
                                        {trendDirection === 'improving' ? '↗ Improving' : trendDirection === 'worsening' ? '↘ Declining' : '→ Stable'}
                                    </Text>
                                </View>
                            </View>
                        </Animated.View>

                        {/* Card 2: Care Visibility */}
                        <Animated.View style={[styles.journeyMetricCard, journeyAnimStyle(1)]}>
                            <View style={styles.journeyMetricHeader}>
                                <Text style={styles.journeyMetricLabel}>Care Visibility</Text>
                                <Eye size={16} color={colors.textSecondary} />
                            </View>
                            <View style={styles.journeyMetricRow}>
                                <Text style={[styles.journeyMetricVal, { color: visibilityScore >= 80 ? colors.success : visibilityScore >= 50 ? colors.warning : colors.danger }]}>
                                    {visibilityScore}%
                                </Text>
                                <Text style={styles.journeyMetricSub}>{visibilityLabel} Coverage</Text>
                            </View>
                            {/* Horizontal Progress Bar */}
                            <View style={styles.progressContainer}>
                                <View style={styles.progressBarTrack}>
                                    <View style={[
                                        styles.progressBarFill, 
                                        { 
                                            width: `${visibilityScore}%`,
                                            backgroundColor: visibilityScore >= 80 ? colors.success : visibilityScore >= 50 ? colors.warning : colors.danger 
                                        }
                                    ]} />
                                </View>
                            </View>
                        </Animated.View>

                        {/* Card 3: Medication Adherence Streak */}
                        <Animated.View style={[styles.journeyMetricCard, journeyAnimStyle(2)]}>
                            <View style={styles.journeyMetricHeader}>
                                <Text style={styles.journeyMetricLabel}>Medication Streak</Text>
                                <Flame size={16} color="#F97316" />
                            </View>
                            <View style={styles.journeyMetricRow}>
                                <View style={styles.streakContainer}>
                                    <Text style={[styles.journeyMetricVal, { color: colors.primary }]}>
                                        {data.patient.current_streak} Days
                                    </Text>
                                </View>
                                <Text style={styles.journeyMetricSub}>{adherence}% Adherence</Text>
                            </View>
                        </Animated.View>
                    </View>
                </Animated.View>

                {/* 9. Caregiver Risk Timeline */}
                <Animated.View style={[styles.card, sectionAnimStyle(8)]}>
                    <View style={styles.sectionHeaderRow}>
                        <Clock color={colors.primary} size={18} />
                        <Text style={styles.cardTitle}>Caregiver Risk Timeline</Text>
                    </View>
                    <Text style={styles.cardSub}>Long-term progression story</Text>

                    <View style={styles.journeyTimelineSection}>
                        {(!data.risk_timeline || data.risk_timeline.length === 0) ? (
                            <View style={styles.emptyTimelineContainer}>
                                <Text style={styles.emptyTimelineEmoji}>🌱</Text>
                                <Text style={styles.emptyTimelineTitle}>
                                    Risk history will appear as the patient accumulates health data over time.
                                </Text>
                                <Text style={styles.emptyTimelineSub}>Check back after a few days.</Text>
                            </View>
                        ) : (
                            <View style={styles.timelineList}>
                                {data.risk_timeline.slice(0, 5).map((item, idx) => {
                                    const isLast = idx === Math.min(data.risk_timeline.length, 5) - 1;
                                    const dateStr = formatDate(item.date, 'D MMM, h:mm a');
                                    
                                    const { title, narrative, fromScore, toScore } = getTransitionNarrative(item);
                                    
                                    const animVal = timelineAnims[idx] || new Animated.Value(1);

                                    const timelineAnimStyle = {
                                        opacity: animVal,
                                        transform: [
                                            { translateY: animVal.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }
                                        ]
                                    };

                                    return (
                                        <Animated.View key={item._id || idx} style={[styles.timelineRowItem, timelineAnimStyle]}>
                                            <View style={styles.timelineLineCol}>
                                                <View style={[styles.timelineNodeCircle, { backgroundColor: getRiskColor(item.to) }]}>
                                                    <Text style={styles.timelineNodeScoreText}>{toScore}</Text>
                                                </View>
                                                {!isLast && <View style={styles.timelineVerticalLinkLine} />}
                                            </View>
                                            <View style={styles.timelineContentCol}>
                                                <View style={styles.timelineNodeHeader}>
                                                    <Text style={[styles.timelineNodeTitle, { color: getRiskColor(item.to), ...FONT.bold }]}>
                                                        {item.to === 'high' ? 'High Risk' : item.to === 'medium' ? 'Medium Risk' : 'Low Risk'}
                                                    </Text>
                                                    <Text style={styles.timelineNodeDate}>{dateStr}</Text>
                                                </View>
                                                <View style={styles.timelineTransitionDivider} />
                                                <Text style={styles.timelineNarrativeTitle}>{title}</Text>
                                                <Text style={styles.timelineNarrativeText}>{narrative}</Text>
                                                <Text style={styles.timelineTransitionSubText}>
                                                    Risk level changed from {item.from.toUpperCase()} ({fromScore}) to {item.to.toUpperCase()} ({toScore})
                                                </Text>
                                            </View>
                                        </Animated.View>
                                    );
                                })}
                            </View>
                        )}
                    </View>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { 
        paddingTop: 60, 
        paddingHorizontal: 24, 
        paddingBottom: 16, 
        backgroundColor: colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
    },
    backBtn: {
        padding: 4,
        marginLeft: -4,
    },
    headerSub: {
        fontSize: 12,
        ...FONT.semibold,
        color: colors.primary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    title: { fontSize: 24, ...FONT.heavy, color: colors.textPrimary },
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
        paddingBottom: layout.TAB_BAR_CLEARANCE,
        gap: 16,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        padding: spacing.md,
        ...shadows.card,
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
        marginBottom: 8,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sectionHeading: {
        fontSize: 13,
        ...FONT.bold,
        color: colors.textPrimary,
        marginBottom: 10,
    },
    sectionSubHeading: {
        fontSize: 12,
        ...FONT.bold,
        color: colors.textSecondary,
        marginBottom: 8,
    },
    
    // AI Insight Hero styles
    insightHeroCard: {
        backgroundColor: '#EEF2FF',
        borderRadius: radius.xl,
        padding: spacing.md,
        borderWidth: 1.5,
        borderColor: '#C7D2FE',
        ...shadows.card,
    },
    insightHeroHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    insightHeroHeaderTitle: {
        fontSize: 11,
        ...FONT.heavy,
        color: '#4F46E5',
        letterSpacing: 0.5,
    },
    insightHeroText: {
        fontSize: 13,
        ...FONT.semibold,
        color: '#312E81',
        lineHeight: 18,
    },

    // Visibility Hero Ring styles
    kpiCardUnified: {
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        padding: spacing.md,
        ...shadows.card,
        borderWidth: 1.5,
        borderColor: colors.primarySoft,
    },
    kpiCardUnifiedTitle: {
        fontSize: 15,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    kpiCardUnifiedDivider: {
        height: 1,
        backgroundColor: colors.borderLight,
        marginVertical: 12,
    },
    visibilityHeroContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 12,
    },
    visibilityHeroTextContainer: {
        position: 'absolute',
        alignItems: 'center',
    },
    visibilityHeroPercent: {
        fontSize: 24,
        ...FONT.heavy,
    },
    visibilityHeroLabel: {
        fontSize: 12,
        ...FONT.bold,
        color: colors.textPrimary,
        marginTop: 2,
    },
    visibilityHeroSub: {
        fontSize: 9,
        ...FONT.semibold,
        color: colors.textMuted,
        marginTop: 1,
    },
    kpiDetailsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 12,
    },
    kpiDetailBox: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: colors.borderLight,
        alignItems: 'center',
    },
    kpiDetailLabel: {
        fontSize: 10,
        ...FONT.bold,
        color: colors.textSecondary,
        marginBottom: 6,
    },
    kpiDetailBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    kpiDetailBadgeText: {
        fontSize: 11,
        ...FONT.bold,
    },
    stabilityBannerUnified: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: colors.borderLight,
        marginTop: 14,
        gap: 8,
    },
    stabilityPulseDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    stabilityBannerText: {
        fontSize: 11,
        ...FONT.semibold,
        color: colors.textSecondary,
    },

    // Coverage Breakdown Progress Capsules styles
    coverageGridUnified: {
        gap: 10,
        marginTop: 6,
    },
    coverageCapsule: {
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: 16,
        padding: 12,
        ...shadows.sm,
    },
    coverageCapsuleHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    coverageCapsuleLabel: {
        fontSize: 12,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    coverageCapsulePercent: {
        fontSize: 12,
        ...FONT.heavy,
    },
    coverageCapsuleBarTrack: {
        height: 6,
        backgroundColor: '#E2E8F0',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 6,
    },
    coverageCapsuleBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    coverageCapsuleScore: {
        fontSize: 9,
        ...FONT.bold,
        color: colors.textMuted,
    },

    // Risk Contributors styles
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
    contributorsGrid: {
        gap: 10,
        marginTop: 6,
    },
    contributorCard: {
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: 16,
        padding: 12,
        ...shadows.sm,
    },
    contributorCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    contributorLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    contributorDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    contributorCardLabel: {
        fontSize: 12,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    contributorRoleBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    contributorRoleText: {
        fontSize: 9,
        ...FONT.bold,
    },
    contributorMetricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 6,
    },
    contributorMetricPercent: {
        fontSize: 18,
        ...FONT.heavy,
        color: colors.textPrimary,
    },
    contributorMetricImpact: {
        fontSize: 10,
        ...FONT.semibold,
        color: colors.textMuted,
    },
    contributorBarTrack: {
        height: 4,
        backgroundColor: '#E2E8F0',
        borderRadius: 2,
        overflow: 'hidden',
    },
    contributorBarFill: {
        height: '100%',
        borderRadius: 2,
    },

    // Forecast styles
    frostedAlertCard: {
        backgroundColor: '#FFFDF5',
        borderWidth: 1,
        borderColor: '#FEF3C7',
        borderRadius: 16,
        padding: 12,
        marginBottom: 12,
        ...shadows.sm,
    },
    frostedAlertHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    frostedAlertTitle: {
        fontSize: 12,
        ...FONT.bold,
        color: '#D97706',
    },
    frostedAlertText: {
        fontSize: 11,
        ...FONT.medium,
        color: '#B45309',
        lineHeight: 15,
        marginBottom: 10,
    },
    frostedAlertBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#FCD34D',
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
        alignSelf: 'flex-start',
        ...shadows.sm,
    },
    frostedAlertBtnText: {
        fontSize: 11,
        ...FONT.bold,
        color: '#4F46E5',
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
    forecastHumanBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        marginBottom: 4,
    },
    forecastHumanBadgeText: {
        fontSize: 9,
        ...FONT.bold,
    },
    forecastHumanSubText: {
        fontSize: 8,
        ...FONT.medium,
        color: colors.textMuted,
        marginBottom: 6,
    },
    forecastStatsDivider: {
        height: 1,
        backgroundColor: colors.borderLight,
        width: '100%',
        marginVertical: 6,
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

    // 14-Day Trajectory styles
    recoveryBanner: {
        backgroundColor: '#ECFDF5',
        borderWidth: 1,
        borderColor: '#A7F3D0',
        borderRadius: 12,
        padding: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    recoveryBannerTitle: {
        fontSize: 12,
        ...FONT.bold,
        color: '#065F46',
    },
    recoveryBannerDesc: {
        fontSize: 10,
        ...FONT.medium,
        color: '#047857',
        marginTop: 2,
    },
    warningAlertBanner: {
        backgroundColor: '#FEF2F2',
        borderWidth: 1,
        borderColor: '#FCA5A5',
        borderRadius: 12,
        padding: 10,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 12,
    },
    warningAlertTitle: {
        fontSize: 12,
        ...FONT.bold,
        color: '#991B1B',
    },
    warningAlertDesc: {
        fontSize: 10,
        ...FONT.medium,
        color: '#B91C1C',
        marginTop: 2,
        lineHeight: 14,
    },
    trajectoryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: 12,
        padding: 10,
    },
    trajectoryText: {
        fontSize: 12,
        ...FONT.heavy,
        color: colors.textPrimary,
    },
    trajectorySub: {
        fontSize: 10,
        ...FONT.medium,
        color: colors.textMuted,
        marginTop: 2,
    },

    // AI Recommendations styles
    recommendationsList: {
        gap: 12,
        marginTop: spacing.xs,
    },
    recommendationCard: {
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: 16,
        padding: spacing.md,
        ...shadows.sm,
    },
    recommendationCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    recommendationHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    recommendationCardTitle: {
        fontSize: 13,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    severityBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    severityBadgeText: {
        fontSize: 9,
        ...FONT.bold,
    },
    recommendationCardReason: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textSecondary,
        lineHeight: 16,
        marginBottom: 12,
    },
    recommendationCardButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
    },
    recommendationCardButtonText: {
        fontSize: 11,
        ...FONT.bold,
        color: '#FFF',
    },

    // Journey Progression & Timeline styles
    journeyListContainer: {
        gap: 12,
        marginTop: spacing.sm,
    },
    journeyMetricCard: {
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: 16,
        padding: spacing.md,
        ...shadows.sm,
    },
    journeyMetricHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    journeyMetricLabel: {
        fontSize: 11,
        ...FONT.semibold,
        color: colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    journeyMetricVal: {
        fontSize: 22,
        ...FONT.heavy,
        color: colors.textPrimary,
    },
    journeyMetricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    journeyMetricSub: {
        fontSize: 12,
        ...FONT.bold,
        color: colors.textMuted,
    },
    trendBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    trendBadgeText: {
        fontSize: 11,
        ...FONT.bold,
    },
    progressContainer: {
        marginTop: 10,
        width: '100%',
    },
    progressBarTrack: {
        height: 6,
        backgroundColor: '#E2E8F0',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    streakContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    journeyTimelineSection: {
        marginTop: 12,
    },
    emptyTimelineContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 32,
        paddingHorizontal: 16,
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.borderLight,
        marginTop: 8,
    },
    emptyTimelineEmoji: {
        fontSize: 32,
        marginBottom: 10,
    },
    emptyTimelineTitle: {
        fontSize: 13,
        ...FONT.bold,
        color: colors.textPrimary,
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 4,
    },
    emptyTimelineSub: {
        fontSize: 11,
        ...FONT.medium,
        color: colors.textMuted,
        textAlign: 'center',
    },
    timelineList: {
        marginTop: spacing.sm,
        gap: 16,
    },
    timelineRowItem: {
        flexDirection: 'row',
        gap: 12,
    },
    timelineLineCol: {
        alignItems: 'center',
        width: 32,
    },
    timelineNodeCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        ...shadows.sm,
    },
    timelineNodeScoreText: {
        fontSize: 11,
        ...FONT.heavy,
        color: '#FFF',
    },
    timelineVerticalLinkLine: {
        width: 3,
        flex: 1,
        backgroundColor: colors.borderLight,
        marginVertical: 4,
    },
    timelineContentCol: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 14,
        ...shadows.sm,
    },
    timelineNodeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    timelineNodeTitle: {
        fontSize: 14,
        ...FONT.heavy,
    },
    timelineNodeDate: {
        fontSize: 10,
        ...FONT.semibold,
        color: colors.textMuted,
    },
    timelineTransitionDivider: {
        height: 1,
        backgroundColor: colors.borderLight,
        marginBottom: 8,
    },
    timelineNarrativeTitle: {
        fontSize: 12,
        ...FONT.heavy,
        color: colors.textPrimary,
        marginBottom: 2,
    },
    timelineNarrativeText: {
        fontSize: 11,
        ...FONT.medium,
        color: colors.textSecondary,
        lineHeight: 15,
        marginBottom: 8,
    },
    timelineTransitionSubText: {
        fontSize: 9,
        ...FONT.semibold,
        color: colors.textMuted,
        textTransform: 'uppercase',
    },
});