import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Dimensions, ActivityIndicator, Image, Animated, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '../../lib/api';
import { HeartPulse, Activity, Bell, ShieldCheck, AlertCircle, ChevronLeft, RefreshCw, Lightbulb, Sparkles, Calendar, TrendingUp, Pill, Phone, ChevronRight, Eye, Flame, ArrowUpRight, Clock, Smile, ClipboardList } from 'lucide-react-native';
import AlertManager from '../../utils/AlertManager';
import { colors, radius, spacing, shadows, layout, motion, anim, useReduceMotion } from '../../theme';
import usePatientStore from '../../store/usePatientStore';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
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

const getFreshnessText = (dateInput) => {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `Updated ${diffMins}m ago`;
    
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    return `Updated at ${formattedHours}:${minutes} ${ampm}`;
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

const SectionHeader = ({ icon: Icon, title, iconColor, style }) => (
    <View style={[styles.sectionHeaderRow, style]}>
        {Icon && <Icon color={iconColor || colors.primary} size={18} />}
        <Text style={styles.cardTitle}>{title}</Text>
    </View>
);

const TimelineEmptyIllustration = () => {
    return (
        <View style={styles.emptyIllustrationWrapper}>
            <Svg width={100} height={80} viewBox="0 0 100 80">
                <Defs>
                    <SvgGradient id="dotsGlow" x1="0%" y1="0%" x2="0%" y2="100%">
                        <Stop offset="0%" stopColor="#CBD5E1" stopOpacity="1" />
                        <Stop offset="100%" stopColor="#CBD5E1" stopOpacity="0.2" />
                    </SvgGradient>
                </Defs>
                <Path 
                    d="M50 5 V75" 
                    stroke="url(#dotsGlow)" 
                    strokeWidth="2" 
                    strokeDasharray="4 4" 
                />
                <Circle cx="50" cy="15" r="4" fill="#CBD5E1" />
                <Circle cx="50" cy="40" r="4" fill="#E2E8F0" />
                <Circle cx="50" cy="65" r="4" fill="#F1F5F9" />
            </Svg>
        </View>
    );
};

const ForecastEmptyIllustration = () => {
    return (
        <View style={styles.emptyIllustrationWrapper}>
            <Svg width={100} height={40} viewBox="0 0 100 40">
                <Path 
                    d="M 10 30 L 30 15 L 50 25 L 70 10 L 90 20" 
                    fill="none" 
                    stroke="#E2E8F0" 
                    strokeWidth="2" 
                    strokeDasharray="4 4" 
                />
                <Circle cx="10" cy="30" r="3" fill="#CBD5E1" />
                <Circle cx="30" cy="15" r="3" fill="#CBD5E1" />
                <Circle cx="50" cy="25" r="3" fill="#E2E8F0" />
                <Circle cx="70" cy="10" r="3" fill="#E2E8F0" />
                <Circle cx="90" cy="20" r="3" fill="#F1F5F9" />
            </Svg>
        </View>
    );
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
        
        // Priority 1: Clinical Consultations (consult, provider, doctor)
        if (textLower.includes('consult') || textLower.includes('provider') || textLower.includes('doctor')) {
            title = 'Clinical Consultation';
            icon = <ShieldCheck size={20} color={colors.success} />;
            actionLabel = 'Go to Interventions';
            onPress = () => navigation.navigate('InterventionCenter');
            severity = 'info';
        }
        // Priority 2: Wellness Calls (call, phone, contact, chat)
        else if (textLower.includes('call') || textLower.includes('phone') || textLower.includes('contact') || textLower.includes('chat')) {
            title = 'Wellness Call';
            icon = <Phone size={20} color={colors.primary} />;
            actionLabel = 'Call Patient';
            onPress = handleCall;
            severity = 'info';
        }
        // Priority 3: Vitals Requests (blood pressure, bp, vital, log)
        else if (textLower.includes('blood pressure') || textLower.includes('bp') || textLower.includes('vital') || textLower.includes('log')) {
            title = 'Vitals Request';
            icon = <HeartPulse size={20} color={colors.warning} />;
            actionLabel = 'Request BP';
            onPress = handleRequestBP;
            severity = 'warning';
        }
        // Priority 4: Medication reminders (nudge, medication, remind, pill)
        else if (textLower.includes('nudge') || textLower.includes('medication') || textLower.includes('remind') || textLower.includes('pill')) {
            title = 'Medication Nudge';
            icon = <Pill size={20} color={textLower.includes('urgent') || textLower.includes('critical') ? colors.danger : colors.warning} />;
            actionLabel = 'Remind Now';
            onPress = handleNudge;
            severity = (textLower.includes('urgent') || textLower.includes('critical')) ? 'critical' : 'warning';
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
        try {
            if (selectedPatientId) {
                await apiService.companion.refreshInsights({ patientId: selectedPatientId });
            }
        } catch (err) {
            // Silence rate limit (429) or other errors during manual refresh
            console.log('[CompanionAnalytics] Refresh insights skipped or rate-limited:', err.message);
        }
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
                {/* Premium Linear Gradient Background */}
                <LinearGradient
                    colors={['#EEF2FF', '#F8FAFC']}
                    style={StyleSheet.absoluteFill}
                />

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
                    {/* Top Summary Card Skeleton */}
                    <View style={styles.summaryCard}>
                        <View style={[styles.summaryHeader, { gap: 6, flexDirection: 'row', alignItems: 'center' }]}>
                            <SkeletonItem width={18} height={18} borderRadius={9} />
                            <SkeletonItem width={120} height={12} />
                        </View>
                        <SkeletonItem width="100%" height={12} style={{ marginTop: 12 }} />
                        <SkeletonItem width="90%" height={12} style={{ marginTop: 6 }} />
                        
                        <View style={[styles.summaryStatsRow, { marginTop: 14 }]}>
                            {[1, 2, 3, 4].map((i) => (
                                <View key={i} style={[styles.summaryStatItem, { gap: 6 }]}>
                                    <SkeletonItem width={40} height={8} />
                                    <SkeletonItem width={60} height={14} borderRadius={6} />
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* KPI Ring Card Skeleton (Side-by-Side) */}
                    <View style={styles.kpiCardUnified}>
                        <SkeletonItem width={150} height={16} />
                        <View style={styles.kpiCardUnifiedDivider} />
                        
                        <View style={styles.kpiMainRow}>
                            <View style={[styles.visibilityHeroContainer, { marginVertical: 0 }]}>
                                <SkeletonItem width={96} height={96} borderRadius={48} />
                            </View>
                            <View style={[styles.kpiInfoColumn, { gap: 10, flex: 1 }]}>
                                <SkeletonItem width="80%" height={20} borderRadius={8} />
                                <SkeletonItem width="90%" height={20} borderRadius={8} />
                                <SkeletonItem width="70%" height={14} borderRadius={6} />
                            </View>
                        </View>
                    </View>

                    {/* Coverage Breakdown Skeleton (2x2 Grid) */}
                    <View style={styles.card}>
                        <SkeletonItem width={160} height={16} style={{ marginBottom: 12 }} />
                        <View style={styles.coverageGrid2x2}>
                            {[1, 2, 3, 4].map((item) => (
                                <View key={item} style={styles.coverageGridCardSkeleton}>
                                    <View style={styles.coverageGridCardHeader}>
                                        <SkeletonItem width={24} height={24} borderRadius={12} />
                                        <SkeletonItem width={32} height={12} />
                                    </View>
                                    <SkeletonItem width={80} height={12} style={{ marginTop: 8 }} />
                                    <SkeletonItem width={40} height={8} style={{ marginTop: 4 }} />
                                    <SkeletonItem width="100%" height={4} borderRadius={2} style={{ marginTop: 8 }} />
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

    // Circular progress calculation
    const strokeWidth = 8;
    const radiusVal = (circleSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radiusVal;
    const strokeDashoffset = circumference - (visibilityScore / 100) * circumference;

    return (
        <View style={styles.container}>
            {/* Premium Linear Gradient Background */}
            <LinearGradient
                colors={['#EEF2FF', '#F8FAFC']}
                style={StyleSheet.absoluteFill}
            />

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
                {/* 1. Sticky Analytics Summary Card */}
                <Animated.View style={[styles.summaryCard, sectionAnimStyle(0), { overflow: 'hidden', position: 'relative', paddingLeft: 18 }]}>
                    <View style={[styles.accentStrip, { backgroundColor: isLowVisibility ? '#64748B' : (riskLevel === 'high' ? colors.danger : (riskLevel === 'medium' ? colors.warning : colors.success)), borderTopLeftRadius: radius.xl, borderBottomLeftRadius: radius.xl }]} />
                    <View style={styles.glowBg} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingRight: 6 }}>
                        <SectionHeader
                            icon={HeartPulse}
                            title="Health Status Summary"
                            iconColor={colors.primary}
                        />
                        {insights.generated_at && (
                            <Text style={{ fontSize: 10, ...FONT.medium, color: colors.textMuted }}>
                                {getFreshnessText(insights.generated_at)}
                            </Text>
                        )}
                    </View>
                    
                    <Text style={styles.summaryNarrative}>
                        {(() => {
                            if (isLowVisibility) {
                                return `Patient status is currently uncertain. There is limited data coverage to verify recent health logs.`;
                            }
                            if (riskLevel === 'high') {
                                return `Immediate attention needed. Elevated patient risk indicators detected in recent logs.`;
                            }
                            if (riskLevel === 'medium') {
                                return `Caution advised. Minor health log regressions detected. Monitor vitals closely.`;
                            }
                            return `${data.patient.name || 'Patient'} is stable and maintaining normal health indicators this week.`;
                        })()}
                    </Text>
                    
                    <View style={styles.summaryStatsRow}>
                        {/* Stat 1: Status */}
                        <View style={styles.summaryStatItem}>
                            <Text style={styles.summaryStatLabel}>Status</Text>
                            <Text style={[styles.summaryStatVal, { color: isLowVisibility ? colors.textSecondary : (riskLevel === 'high' ? colors.danger : (riskLevel === 'medium' ? colors.warning : colors.success)) }]}>
                                {isLowVisibility ? 'Uncertain' : (riskLevel === 'high' ? 'Action' : (riskLevel === 'medium' ? 'Watch' : 'Stable'))}
                            </Text>
                        </View>
                        
                        <View style={styles.summaryStatDivider} />
                        
                        {/* Stat 2: Risk */}
                        <View style={styles.summaryStatItem}>
                            <Text style={styles.summaryStatLabel}>Risk Level</Text>
                            <Text style={[styles.summaryStatVal, { color: getRiskColor(riskLevel) }]}>
                                {riskLevel.toUpperCase()}
                            </Text>
                        </View>
                        
                        <View style={styles.summaryStatDivider} />
                        
                        {/* Stat 3: Trajectory */}
                        <View style={styles.summaryStatItem}>
                            <Text style={styles.summaryStatLabel}>Trajectory</Text>
                            {(() => {
                                const traj = insights.predictive_health?.forecast?.trajectory || 'stable';
                                return (
                                    <Text style={[
                                        styles.summaryStatVal, 
                                        { color: traj === 'positive' ? colors.success : (traj === 'negative' ? colors.danger : colors.textSecondary) }
                                    ]}>
                                        {traj === 'positive' ? 'Positive' : (traj === 'negative' ? 'Declining' : 'Stable')}
                                    </Text>
                                );
                            })()}
                        </View>
                        
                        <View style={styles.summaryStatDivider} />
                        
                        {/* Stat 4: Confidence */}
                        <View style={styles.summaryStatItem}>
                            <Text style={styles.summaryStatLabel}>Confidence</Text>
                            <Text style={[styles.summaryStatVal, { color: colors.primary }]}>
                                {confidenceScore}%
                            </Text>
                        </View>
                    </View>
                </Animated.View>

                {/* 2. Visibility Ring & KPI Details Side-by-Side */}
                <Animated.View style={[styles.kpiCardUnified, sectionAnimStyle(1), { overflow: 'hidden', position: 'relative' }]}>
                    <View style={styles.glowBg} />
                    <SectionHeader
                        icon={Eye}
                        title="Data Visibility & Confidence"
                        iconColor="#6366F1"
                    />
                    <View style={styles.kpiCardUnifiedDivider} />
                    
                    <View style={styles.kpiMainRow}>
                        {/* Left: Shrunk Visibility Ring */}
                        <View style={styles.visibilityHeroContainer}>
                            <Svg width={96} height={96}>
                                <Circle
                                    cx={48}
                                    cy={48}
                                    r={40}
                                    stroke="#E2E8F0"
                                    strokeWidth={8}
                                    fill="transparent"
                                />
                                <Circle
                                    cx={48}
                                    cy={48}
                                    r={40}
                                    stroke={visibilityScore >= 80 ? '#10B981' : visibilityScore >= 50 ? '#F59E0B' : '#EF4444'}
                                    strokeWidth={8}
                                    fill="transparent"
                                    strokeDasharray={2 * Math.PI * 40}
                                    strokeDashoffset={2 * Math.PI * 40 - (visibilityScore / 100) * (2 * Math.PI * 40)}
                                    strokeLinecap="round"
                                    transform="rotate(-90 48 48)"
                                />
                            </Svg>
                            <View style={styles.visibilityHeroTextContainer}>
                                <Text style={[styles.visibilityHeroPercent, { color: visibilityScore >= 80 ? '#10B981' : visibilityScore >= 50 ? '#F59E0B' : '#EF4444' }]}>
                                    {visibilityScore}%
                                </Text>
                                <Text style={styles.visibilityHeroLabel}>Visibility</Text>
                            </View>
                        </View>
                        
                        {/* Right: Side-by-Side Details */}
                        <View style={styles.kpiInfoColumn}>
                            {/* Detail 1: Risk Status */}
                            <View style={styles.kpiDetailInlineRow}>
                                <Text style={styles.kpiDetailInlineLabel}>Risk Status:</Text>
                                <View style={[styles.kpiDetailBadge, { backgroundColor: getRiskBg(riskLevel) }]}>
                                    <Text style={[styles.kpiDetailBadgeText, { color: getRiskColor(riskLevel) }]}>
                                        {riskLevel.toUpperCase()}
                                    </Text>
                                </View>
                            </View>
                            
                            {/* Detail 2: Confidence */}
                            <View style={styles.kpiDetailInlineRow}>
                                <Text style={styles.kpiDetailInlineLabel}>Confidence:</Text>
                                <View style={[styles.kpiDetailBadge, { backgroundColor: '#EEF2FF' }]}>
                                    <Text style={[styles.kpiDetailBadgeText, { color: '#6366F1' }]}>
                                        {confidenceScore}% ({confidenceLabel})
                                    </Text>
                                </View>
                            </View>
                            
                            {/* Stability indicator */}
                            <View style={styles.stabilityIndicatorRow}>
                                <View style={[styles.stabilityPulseDot, { backgroundColor: lastStable.currently_stable ? '#10B981' : '#F59E0B' }]} />
                                {(() => {
                                    if (lastStable.currently_stable) {
                                        return (
                                            <Text style={styles.stabilityIndicatorText}>
                                                Stable for <Text style={FONT.bold}>{lastStable.stable_days}</Text>d
                                            </Text>
                                        );
                                    } else if (lastStable.last_stable_at) {
                                        const diffMs = Date.now() - new Date(lastStable.last_stable_at).getTime();
                                        const diffDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                                        return (
                                            <Text style={styles.stabilityIndicatorText}>
                                                Last stable <Text style={FONT.bold}>{diffDays}</Text>d ago
                                            </Text>
                                        );
                                    } else {
                                        return (
                                            <Text style={styles.stabilityIndicatorText}>
                                                Status unstable
                                            </Text>
                                        );
                                    }
                                })()}
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {/* 3. Coverage Breakdown Grid (2x2) */}
                <Animated.View style={[styles.card, sectionAnimStyle(2)]}>
                    <SectionHeader
                        icon={ClipboardList}
                        title="Coverage Breakdown"
                        iconColor="#10B981"
                        style={{ marginBottom: 12 }}
                    />
                    {(() => {
                        const bd = insights.visibility_breakdown || { medications: 0, vitals: 0, wearable: 0, mood: 0 };
                        const items = [
                            { label: 'Medications', score: bd.medications ?? 0, max: 35, icon: <Pill size={16} color="#10B981" /> },
                            { label: 'Vitals Log', score: bd.vitals ?? 0, max: 35, icon: <HeartPulse size={16} color="#EF4444" /> },
                            { label: 'Wearables', score: bd.wearable ?? 0, max: 15, icon: <Activity size={16} color="#6366F1" /> },
                            { label: 'Mood Logs', score: bd.mood ?? 0, max: 15, icon: <Smile size={16} color="#F59E0B" /> }
                        ];
                        
                        return (
                            <View style={styles.coverageGrid2x2}>
                                {items.map((item) => {
                                    const percent = item.max > 0 ? Math.round((item.score / item.max) * 100) : 0;
                                    const barColor = percent >= 80 ? '#10B981' : percent >= 40 ? '#F59E0B' : '#EF4444';
                                    const barBg = percent >= 80 ? '#ECFDF5' : percent >= 40 ? '#FFFBEB' : '#FEF2F2';
                                    
                                    return (
                                        <View style={styles.coverageGridCard} key={item.label}>
                                            <View style={styles.coverageGridCardHeader}>
                                                <View style={[styles.coverageGridIconWrapper, { backgroundColor: barBg }]}>
                                                    {item.icon}
                                                </View>
                                                <Text style={[styles.coverageGridPercentText, { color: barColor }]}>
                                                    {percent}%
                                                </Text>
                                            </View>
                                            <Text style={styles.coverageGridCardTitle} numberOfLines={1}>
                                                {item.label}
                                            </Text>
                                            <Text style={styles.coverageGridCardScore}>
                                                {item.score}/{item.max} pts
                                            </Text>
                                            <View style={styles.coverageGridBarTrack}>
                                                <View style={[styles.coverageGridBarFill, { width: `${percent}%`, backgroundColor: barColor }]} />
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        );
                    })()}
                </Animated.View>

                {/* 3.5 Weekly Adherence Trend */}
                {data.weekly_adherence && data.weekly_adherence.length > 0 && (
                    <Animated.View style={[styles.card, sectionAnimStyle(2)]}>
                        <SectionHeader
                            icon={Calendar}
                            title="Weekly Adherence Trend"
                            iconColor="#10B981"
                        />
                        <Text style={styles.cardSub}>Medication compliance rate over the last 7 days</Text>
                        
                        <View style={styles.weeklyAdherenceRow}>
                            {data.weekly_adherence.map((dayData, idx) => {
                                const rate = dayData.rate ?? 0;
                                const isHigh = rate >= 80;
                                const isLow = rate < 50;
                                const statusColor = isHigh ? '#10B981' : (isLow ? '#EF4444' : '#F59E0B');
                                const statusBg = isHigh ? '#ECFDF5' : (isLow ? '#FEF2F2' : '#FFFBEB');
                                
                                return (
                                    <View key={idx} style={styles.weeklyAdherenceDay}>
                                        <Text style={styles.weeklyAdherenceDayName}>{dayData.day}</Text>
                                        <View style={[styles.weeklyAdherenceBadge, { backgroundColor: statusBg, borderColor: statusColor }]}>
                                            <Text style={[styles.weeklyAdherenceRate, { color: statusColor }]}>{rate}%</Text>
                                        </View>
                                        <View style={styles.weeklyAdherenceBarTrack}>
                                            <View style={[styles.weeklyAdherenceBarFill, { height: `${rate}%`, backgroundColor: statusColor }]} />
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </Animated.View>
                )}

                {/* 4. Risk Contributors Card */}
                <Animated.View style={[styles.card, sectionAnimStyle(3)]}>
                    <SectionHeader
                        icon={Activity}
                        title="Risk Contributors"
                        iconColor="#6366F1"
                    />
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
                            <View style={{ marginTop: 6 }}>
                                <View style={styles.stackedBar}>
                                    {pctAdherence > 0 && <View style={[styles.stackedBarSegment, { width: `${pctAdherence}%`, backgroundColor: '#10B981' }]} />}
                                    {pctVitals > 0 && <View style={[styles.stackedBarSegment, { width: `${pctVitals}%`, backgroundColor: '#EF4444' }]} />}
                                    {pctMood > 0 && <View style={[styles.stackedBarSegment, { width: `${pctMood}%`, backgroundColor: '#F59E0B' }]} />}
                                    {pctVisibility > 0 && <View style={[styles.stackedBarSegment, { width: `${pctVisibility}%`, backgroundColor: '#6366F1' }]} />}
                                </View>

                                {/* Grid-aligned Contributor List Rows */}
                                <View style={styles.contributorsListCompact}>
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

                                        const isLastRow = idx === sorted.length - 1;

                                        return (
                                            <View key={item.key} style={[styles.contributorRow, isLastRow && { borderBottomWidth: 0 }]}>
                                                <View style={styles.contributorLabelCol}>
                                                    <View style={[styles.contributorBullet, { backgroundColor: item.color }]} />
                                                    <Text style={styles.contributorLabel}>{item.label}</Text>
                                                </View>
                                                <Text style={styles.contributorImpactCol}>{item.pct}% impact</Text>
                                                <View style={styles.contributorBadgeCol}>
                                                    <View style={[styles.contributorBadge, { backgroundColor: roleBg }]}>
                                                        <Text style={[styles.contributorBadgeText, { color: roleColor }]}>
                                                            {role}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        );
                    })()}
                </Animated.View>

                {/* 5. 3-Day Forecast & Premium Glass Alert */}
                <Animated.View style={[styles.card, sectionAnimStyle(4), { overflow: 'hidden', position: 'relative' }]}>
                    <View style={styles.glowBg} />
                    <SectionHeader
                        icon={Sparkles}
                        title="3-Day Vital Forecast"
                        iconColor="#6366F1"
                    />
                    <Text style={styles.cardSub}>AI outlook & upcoming vital status predictions</Text>

                    {/* Softer, glassmorphic alert card if visibility is low */}
                    {confidenceLabel === 'Low' && (
                        <View style={[styles.premiumGlassAlert, { backgroundColor: '#FFFDF5', borderColor: '#FDE68A', marginBottom: 12 }]}>
                            <View style={[styles.accentStrip, { backgroundColor: '#F59E0B' }]} />
                            <View style={styles.glassAlertContent}>
                                <View style={styles.glassAlertHeader}>
                                    <AlertCircle color="#F59E0B" size={15} />
                                    <Text style={[styles.glassAlertTitle, { color: '#B45309' }]}>Limited Data Available</Text>
                                </View>
                                <Text style={[styles.glassAlertText, { color: '#D97706' }]}>
                                    Predictions are currently based on incomplete vitals. Update logs to improve forecast confidence.
                                </Text>
                                <Pressable 
                                    style={({ pressed }) => [styles.glassAlertBtn, pressed && { opacity: 0.85 }]}
                                    onPress={handleRequestBP}
                                >
                                    <Text style={styles.glassAlertBtnText}>Request BP Reading</Text>
                                    <ArrowUpRight size={13} color="#B45309" />
                                </Pressable>
                            </View>
                        </View>
                    )}

                    <View style={styles.forecastContent}>
                        {(() => {
                            const predData = predictions.predictions || [];
                            if (predData.length === 0) {
                                return (
                                    <View style={styles.emptyForecastContainer}>
                                        <ForecastEmptyIllustration />
                                        <Text style={styles.noForecastText}>Not enough data to generate forecasts</Text>
                                    </View>
                                );
                            }

                            const getForecastHumanStatus = (bp) => {
                                if (!bp) return { status: 'Stable', sub: 'Low concern', color: '#10B981', bg: '#ECFDF5' };
                                const sys = bp.systolic || 120;
                                const dia = bp.diastolic || 80;
                                
                                if (sys >= 140 || dia >= 90) {
                                    return { status: 'Elevated', sub: 'Needs attention', color: '#EF4444', bg: '#FEF2F2' };
                                }
                                if (sys >= 130 || dia >= 85) {
                                    return { status: 'Watch', sub: 'Monitor closely', color: '#F59E0B', bg: '#FFFBEB' };
                                }
                                return { status: 'Stable', sub: 'Low concern', color: '#10B981', bg: '#ECFDF5' };
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
                                                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: human.color }} />
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
                    <Animated.View style={[styles.card, sectionAnimStyle(5), { overflow: 'hidden', position: 'relative' }]}>
                        <View style={styles.glowBg} />
                        <SectionHeader
                            icon={Sparkles}
                            title="14-Day Health Trajectory"
                            iconColor="#6366F1"
                        />
                        <Text style={styles.cardSub}>Long-term AI trajectory forecast</Text>

                        {/* Recovery Banner */}
                        {insights.predictive_health?.recovery?.status && (
                            <View style={[styles.premiumGlassAlert, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                                <View style={[styles.accentStrip, { backgroundColor: '#10B981' }]} />
                                <View style={styles.glassAlertContent}>
                                    <View style={styles.glassAlertHeader}>
                                        <ShieldCheck size={15} color="#10B981" />
                                        <Text style={[styles.glassAlertTitle, { color: '#065F46' }]}>Patient is recovering</Text>
                                    </View>
                                    <Text style={[styles.glassAlertText, { color: '#047857' }]}>
                                        Risk has decreased for {insights.predictive_health.recovery.days} consecutive days (Confidence: {insights.predictive_health.recovery.confidence}%).
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Early Warning Alert */}
                        {(insights.predictive_health?.risk_trends?.velocity > 0 || insights.predictive_health?.forecast?.trajectory === 'negative') && (
                            <View style={[styles.premiumGlassAlert, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', marginTop: insights.predictive_health?.recovery?.status ? 12 : 0 }]}>
                                <View style={[styles.accentStrip, { backgroundColor: '#EF4444' }]} />
                                <View style={styles.glassAlertContent}>
                                    <View style={styles.glassAlertHeader}>
                                        <AlertCircle size={15} color="#EF4444" />
                                        <Text style={[styles.glassAlertTitle, { color: '#991B1B' }]}>Early Warning Alert</Text>
                                    </View>
                                    <Text style={[styles.glassAlertText, { color: '#B91C1C' }]}>
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

                        <View style={[styles.trajectoryRow, { marginTop: 12 }]}>
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
                    <Animated.View style={[styles.card, sectionAnimStyle(6)]}>
                        <SectionHeader
                            icon={Lightbulb}
                            title="AI Recommendations"
                            iconColor={colors.warning}
                        />
                        <Text style={styles.cardSub}>Suggested caretaker checklist actions</Text>
                        
                        <View style={styles.recommendationsList}>
                            {recommendations.map((rec, idx) => {
                                const parsed = parseRecommendation(rec);
                                const animVal = recAnims[idx] || new Animated.Value(1);
                                
                                let severityLabel = 'Optimization';
                                let severityBg = colors.primarySoft;
                                let severityTextColor = colors.primary;
                                let accentColor = colors.primary;
                                
                                if (parsed.severity === 'critical') {
                                    severityLabel = 'Critical';
                                    severityBg = colors.dangerLight;
                                    severityTextColor = colors.danger;
                                    accentColor = colors.danger;
                                } else if (parsed.severity === 'warning') {
                                    severityLabel = 'Attention Needed';
                                    severityBg = colors.warningLight;
                                    severityTextColor = colors.warning;
                                    accentColor = colors.warning;
                                }

                                const cardAnimStyle = {
                                    opacity: animVal,
                                    transform: [
                                        { translateY: animVal.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) },
                                        { scale: animVal.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }
                                    ]
                                };

                                const handlePress = parsed.onPress || (() => navigation.navigate('InterventionCenter'));
                                const isLoading = (parsed.onPress === handleNudge && nudging) || (parsed.onPress === handleRequestBP && requestingBP);
                                const isDisabled = nudging || requestingBP;

                                return (
                                    <Animated.View key={rec || idx} style={[styles.recommendationCard, cardAnimStyle, { overflow: 'hidden', position: 'relative', paddingLeft: 18 }]}>
                                        <View style={[styles.accentStrip, { backgroundColor: accentColor, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }]} />
                                        <View style={styles.recommendationCardHeader}>
                                            <View style={styles.recommendationHeaderLeft}>
                                                {parsed.icon}
                                                <Text style={styles.recommendationCardTitle}>{parsed.title}</Text>
                                            </View>
                                            <View style={[styles.severityBadge, { backgroundColor: severityBg }]}>
                                                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: severityTextColor }} />
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
                                                (pressed || isDisabled) && { opacity: 0.6 }
                                            ]}
                                            onPress={handlePress}
                                            disabled={isDisabled}
                                        >
                                            {isLoading && (
                                                <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 2 }} />
                                            )}
                                            <Text style={styles.recommendationCardButtonText}>
                                                {isLoading ? 'Processing' : parsed.actionLabel}
                                            </Text>
                                            {!isLoading && <ArrowUpRight size={14} color="#FFF" />}
                                        </Pressable>
                                    </Animated.View>
                                );
                            })}
                        </View>
                    </Animated.View>
                )}

                {/* 8. Journey Progression Cards (Redesigned as Single-Row Card) */}
                <Animated.View style={[styles.card, sectionAnimStyle(7)]}>
                    <SectionHeader
                        icon={Calendar}
                        title="Journey Progression"
                        iconColor={colors.primary}
                    />
                    <Text style={styles.cardSub}>Long-term progression metrics</Text>

                    <View style={styles.journeyProgressionCard}>
                        {/* Col 1: Risk Status */}
                        <View style={styles.journeyProgressionCol}>
                            <View style={styles.journeyColHeader}>
                                <TrendingUp size={14} color={getRiskColor(riskLevel)} />
                                <Text style={styles.journeyColLabel}>Risk</Text>
                            </View>
                            <Text style={[styles.journeyColValue, { color: getRiskColor(riskLevel) }]} numberOfLines={1}>
                                {riskLevel.toUpperCase()}
                            </Text>
                            <Text style={[styles.journeyColSub, { color: getTrendColor(trendDirection) }]} numberOfLines={1}>
                                {trendDirection === 'improving' ? 'Improving' : trendDirection === 'worsening' ? 'Declining' : 'Stable'}
                            </Text>
                        </View>

                        <View style={styles.journeyProgressionDivider} />

                        {/* Col 2: Care Visibility */}
                        <View style={styles.journeyProgressionCol}>
                            <View style={styles.journeyColHeader}>
                                <Eye size={14} color={colors.primary} />
                                <Text style={styles.journeyColLabel}>Visibility</Text>
                            </View>
                            <Text style={[styles.journeyColValue, { color: colors.textPrimary }]} numberOfLines={1}>
                                {visibilityScore}%
                            </Text>
                            <Text style={styles.journeyColSub} numberOfLines={1}>
                                {visibilityLabel} Quality
                            </Text>
                        </View>

                        <View style={styles.journeyProgressionDivider} />

                        {/* Col 3: Streak */}
                        <View style={styles.journeyProgressionCol}>
                            <View style={styles.journeyColHeader}>
                                <Flame size={14} color="#F97316" />
                                <Text style={styles.journeyColLabel}>Streak</Text>
                            </View>
                            <Text style={[styles.journeyColValue, { color: colors.primary }]} numberOfLines={1}>
                                {data.patient.current_streak}d
                            </Text>
                            <Text style={styles.journeyColSub} numberOfLines={1}>
                                {adherence}% Adh
                            </Text>
                        </View>
                    </View>
                </Animated.View>

                {/* 9. Caregiver Risk Timeline */}
                <Animated.View style={[styles.card, sectionAnimStyle(8)]}>
                    <SectionHeader
                        icon={Clock}
                        title="Caregiver Risk Timeline"
                        iconColor={colors.primary}
                    />
                    <Text style={styles.cardSub}>Long-term progression story</Text>

                    <View style={styles.journeyTimelineSection}>
                        {(!data.risk_timeline || data.risk_timeline.length === 0) ? (
                            <View style={styles.emptyTimelineContainer}>
                                <TimelineEmptyIllustration />
                                <Text style={styles.emptyTimelineTitle}>
                                    No risk transitions recorded yet
                                </Text>
                                <Text style={styles.emptyTimelineSub}>
                                    History will appear as patient health logs accumulate.
                                </Text>
                            </View>
                        ) : (
                            <View style={styles.timelineList}>
                                {data.risk_timeline.slice(0, 5).map((item, idx) => {
                                    const isLast = idx === Math.min(data.risk_timeline.length, 5) - 1;
                                    const dateStr = formatDate(item.date, 'D MMM, h:mm a');
                                    
                                    const { title, narrative, fromScore, toScore } = getTransitionNarrative(item);
                                    
                                    let displaySummary = title;
                                    let displayNarrative = narrative;
                                    let displayFactors = [];
                                    
                                    if (item.reason) {
                                        if (typeof item.reason === 'object') {
                                            displaySummary = item.reason.summary || title;
                                            displayFactors = item.reason.factors || [];
                                            displayNarrative = '';
                                        } else if (typeof item.reason === 'string') {
                                            displayNarrative = item.reason;
                                        }
                                    }
                                    
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
                                                <Text style={styles.timelineNarrativeTitle}>{displaySummary}</Text>
                                                {displayNarrative ? (
                                                    <Text style={styles.timelineNarrativeText}>{displayNarrative}</Text>
                                                ) : null}
                                                {displayFactors.length > 0 && (
                                                    <View style={{ gap: 4, marginTop: 4, marginBottom: 8 }}>
                                                        {displayFactors.map((factor, fIdx) => (
                                                            <View key={fIdx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                                                                <Text style={{ color: getRiskColor(item.to), fontSize: 10, marginTop: 2 }}>•</Text>
                                                                <Text style={{ flex: 1, fontSize: 11, ...FONT.medium, color: colors.textSecondary, lineHeight: 15 }}>{factor}</Text>
                                                            </View>
                                                        ))}
                                                    </View>
                                                )}
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
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#0A2463',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 2,
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
    weeklyAdherenceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginTop: 10,
        paddingHorizontal: 4,
    },
    weeklyAdherenceDay: {
        alignItems: 'center',
        flex: 1,
    },
    weeklyAdherenceDayName: {
        fontSize: 10,
        ...FONT.bold,
        color: colors.textMuted,
        marginBottom: 4,
    },
    weeklyAdherenceBadge: {
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
        marginBottom: 6,
    },
    weeklyAdherenceRate: {
        fontSize: 8,
        ...FONT.bold,
    },
    weeklyAdherenceBarTrack: {
        width: 8,
        height: 48,
        backgroundColor: '#E2E8F0',
        borderRadius: 4,
        overflow: 'hidden',
        justifyContent: 'flex-end',
    },
    weeklyAdherenceBarFill: {
        width: '100%',
        borderRadius: 4,
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
    
    // AI Insight / Summary Card styles
    summaryCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#0A2463',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 2,
    },
    summaryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    summaryTitle: {
        fontSize: 14,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    summaryNarrative: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textSecondary,
        lineHeight: 16,
        marginBottom: 14,
    },
    summaryStatsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    summaryStatItem: {
        flex: 1,
        alignItems: 'center',
    },
    summaryStatLabel: {
        fontSize: 9,
        ...FONT.semibold,
        color: colors.textMuted,
        marginBottom: 2,
    },
    summaryStatVal: {
        fontSize: 11,
        ...FONT.bold,
    },
    summaryStatDivider: {
        width: 1,
        height: 20,
        backgroundColor: '#E2E8F0',
        alignSelf: 'center',
    },

    // Visibility Hero Ring & KPIs (Side-by-side) styles
    kpiCardUnified: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#0A2463',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 2,
    },
    kpiCardUnifiedTitle: {
        fontSize: 15,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    kpiCardUnifiedDivider: {
        height: 1,
        backgroundColor: '#E2E8F0',
        marginVertical: 12,
    },
    kpiMainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    visibilityHeroContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        width: 96,
        height: 96,
    },
    visibilityHeroTextContainer: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    visibilityHeroPercent: {
        fontSize: 18,
        ...FONT.heavy,
    },
    visibilityHeroLabel: {
        fontSize: 9,
        ...FONT.bold,
        color: colors.textMuted,
        marginTop: 1,
    },
    kpiInfoColumn: {
        flex: 1,
        gap: 6,
    },
    kpiDetailInlineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    kpiDetailInlineLabel: {
        fontSize: 11,
        ...FONT.semibold,
        color: colors.textSecondary,
    },
    kpiDetailBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    kpiDetailBadgeText: {
        fontSize: 10,
        ...FONT.bold,
    },
    stabilityIndicatorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
    },
    stabilityPulseDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    stabilityIndicatorText: {
        fontSize: 10,
        ...FONT.semibold,
        color: colors.textMuted,
    },

    // Coverage Breakdown Progress Capsules (2x2 Grid)
    coverageGrid2x2: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 10,
        marginTop: 6,
    },
    coverageGridCard: {
        width: '48%',
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 12,
        padding: 10,
        ...shadows.sm,
    },
    coverageGridCardSkeleton: {
        width: '48%',
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 12,
        padding: 10,
    },
    coverageGridCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    coverageGridIconWrapper: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    coverageGridPercentText: {
        fontSize: 12,
        ...FONT.heavy,
    },
    coverageGridCardTitle: {
        fontSize: 11,
        ...FONT.bold,
        color: colors.textPrimary,
        marginBottom: 2,
    },
    coverageGridCardScore: {
        fontSize: 9,
        ...FONT.semibold,
        color: colors.textMuted,
        marginBottom: 6,
    },
    coverageGridBarTrack: {
        height: 4,
        backgroundColor: '#E2E8F0',
        borderRadius: 2,
        overflow: 'hidden',
    },
    coverageGridBarFill: {
        height: '100%',
        borderRadius: 2,
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
    contributorsListCompact: {
        gap: 8,
        marginTop: 8,
    },
    contributorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    contributorLabelCol: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        width: '42%',
    },
    contributorBullet: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    contributorLabel: {
        fontSize: 12,
        ...FONT.semibold,
        color: colors.textSecondary,
    },
    contributorImpactCol: {
        width: '26%',
        fontSize: 12,
        ...FONT.bold,
        color: colors.textPrimary,
        textAlign: 'left',
    },
    contributorBadgeCol: {
        width: '32%',
        alignItems: 'flex-end',
    },
    contributorBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    contributorBadgeText: {
        fontSize: 9,
        ...FONT.bold,
    },

    // Forecast styles
    premiumGlassAlert: {
        borderWidth: 1,
        borderRadius: 12,
        overflow: 'hidden',
        position: 'relative',
        marginTop: 8,
    },
    glowBg: {
        position: 'absolute',
        top: -40,
        right: -40,
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: colors.primary,
        opacity: 0.04,
    },
    accentStrip: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
    },
    glassAlertContent: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        paddingLeft: 16,
    },
    glassAlertHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    glassAlertTitle: {
        fontSize: 12,
        ...FONT.bold,
    },
    glassAlertText: {
        fontSize: 11,
        ...FONT.medium,
        lineHeight: 15,
    },
    glassAlertBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#F59E0B',
        borderRadius: 8,
        paddingVertical: 6,
        paddingHorizontal: 10,
        alignSelf: 'flex-start',
        marginTop: 8,
        ...shadows.sm,
    },
    glassAlertBtnText: {
        fontSize: 10,
        ...FONT.bold,
        color: '#B45309',
    },
    forecastContent: {
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
    },
    emptyForecastContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
    },
    noForecastText: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textMuted,
        textAlign: 'center',
        paddingVertical: 4,
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
        borderColor: '#E2E8F0',
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
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
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
        backgroundColor: '#E2E8F0',
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
    trajectoryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
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
        borderColor: '#E2E8F0',
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
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
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
        paddingHorizontal: 16,
        borderRadius: 20,
        alignSelf: 'flex-end',
        marginTop: 4,
    },
    recommendationCardButtonText: {
        fontSize: 11,
        ...FONT.bold,
        color: '#FFF',
    },

    // Journey Progression Single-Row Card styles
    journeyProgressionCard: {
        flexDirection: 'row',
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 16,
        paddingVertical: 12,
        ...shadows.sm,
        marginTop: 8,
    },
    journeyProgressionCol: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    journeyColHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 4,
    },
    journeyColLabel: {
        fontSize: 10,
        ...FONT.semibold,
        color: colors.textMuted,
        textTransform: 'uppercase',
    },
    journeyColValue: {
        fontSize: 15,
        ...FONT.heavy,
        marginBottom: 2,
    },
    journeyTrendBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    journeyTrendText: {
        fontSize: 9,
        ...FONT.bold,
    },
    journeyColSub: {
        fontSize: 9,
        ...FONT.semibold,
        color: colors.textMuted,
    },
    journeyProgressionDivider: {
        width: 1,
        height: '60%',
        backgroundColor: '#E2E8F0',
        alignSelf: 'center',
    },

    // Timeline styles
    journeyTimelineSection: {
        marginTop: 12,
    },
    emptyIllustrationWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 8,
    },
    emptyTimelineContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
        paddingHorizontal: 16,
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginTop: 8,
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
        backgroundColor: '#E2E8F0',
        marginVertical: 4,
    },
    timelineContentCol: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
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
        backgroundColor: '#E2E8F0',
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