import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Dimensions, ActivityIndicator, Image, Animated } from 'react-native';
import { apiService } from '../../lib/api';
import { HeartPulse, Activity, Bell, ShieldCheck, AlertCircle, ChevronLeft, RefreshCw, Lightbulb, Sparkles, Calendar, TrendingUp } from 'lucide-react-native';
import AlertManager from '../../utils/AlertManager';
import { colors, radius, spacing, shadows, layout, motion, anim, useReduceMotion } from '../../theme';
import usePatientStore from '../../store/usePatientStore';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

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

export default function CompanionAnalyticsScreen() {
    const [data, setData] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    
    const selectedPatientId = usePatientStore(s => s.companionSelectedPatientId);
    const navigation = useNavigation();
    const reduceMotion = useReduceMotion();

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

    // ── 6-Step Staggered Entrance Animations ──
    const staggerAnims = useRef([...Array(6)].map(() => new Animated.Value(0))).current;
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

    if (!data || !data.patient) return <View style={styles.container} />;

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
                            <Stop offset="0%" stopColor="#F0F9FF" stopOpacity="0.75" />
                            <Stop offset="100%" stopColor="#F8FAFC" stopOpacity="0" />
                        </SvgGradient>
                    </Defs>
                    <Path d="M180 0 C260 120, 320 150, 400 120 L400 0 Z" fill="url(#topBg)" />
                </Svg>
            </View>

            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
                    <ChevronLeft color={colors.textPrimary} size={28} />
                </Pressable>
                <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.headerSub}>AI Predictions & Trends</Text>
                    <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>Health Intelligence</Text>
                </View>
                <Pressable style={({ pressed }) => [styles.bellButton, pressed && { opacity: 0.7 }]} onPress={() => navigation.navigate('CompanionAlerts')}>
                    <Bell color={colors.textPrimary} size={20} />
                    {data.recent_alerts?.length > 0 && <View style={styles.bellDot} />}
                </Pressable>
            </View>

            <ScrollView 
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            >
                {/* Section 1: Top-Level KPIs (Risk, Visibility, Confidence) */}
                <Animated.View style={[styles.kpiCard, sectionAnimStyle(0)]}>
                    <View style={styles.kpiGrid}>
                        {/* KPI 1: Risk Level */}
                        <View style={styles.kpiBox}>
                            <Text style={styles.kpiLabel}>Risk Level</Text>
                            <View style={[
                                styles.kpiBadge,
                                riskLevel === 'high' ? styles.riskBadgeHigh :
                                riskLevel === 'medium' ? styles.riskBadgeMedium :
                                riskLevel === 'low' ? styles.riskBadgeLow : styles.riskBadgeUnknown
                            ]}>
                                <Text style={[
                                    styles.kpiBadgeText,
                                    { color: riskLevel === 'high' ? colors.danger :
                                             riskLevel === 'medium' ? colors.warning :
                                             riskLevel === 'low' ? colors.success : '#64748B' }
                                ]}>
                                    {riskLevel === 'high' ? 'High' :
                                     riskLevel === 'medium' ? 'Medium' :
                                     riskLevel === 'low' ? 'Low' : 'Unknown'}
                                </Text>
                            </View>
                            <Text style={[
                                styles.kpiSub,
                                { color: trendDirection === 'improving' ? colors.success :
                                         trendDirection === 'worsening' ? colors.danger : colors.textSecondary }
                            ]}>
                                {trendDirection === 'improving' ? 'Improving ↓' :
                                 trendDirection === 'worsening' ? 'Worsening ↑' : 'Stable →'}
                            </Text>
                        </View>

                        {/* KPI 2: Visibility (Circular Progress Meter) */}
                        <View style={styles.kpiBox}>
                            <Text style={styles.kpiLabel}>Visibility</Text>
                            <View style={styles.circularProgressContainer}>
                                <Svg width={circleSize} height={circleSize}>
                                    <Circle
                                        cx={circleSize / 2}
                                        cy={circleSize / 2}
                                        r={radiusVal}
                                        stroke="#E2E8F0"
                                        strokeWidth={strokeWidth}
                                        fill="transparent"
                                    />
                                    <Circle
                                        cx={circleSize / 2}
                                        cy={circleSize / 2}
                                        r={radiusVal}
                                        stroke={visibilityScore >= 80 ? colors.success : visibilityScore >= 50 ? colors.warning : colors.danger}
                                        strokeWidth={strokeWidth}
                                        fill="transparent"
                                        strokeDasharray={circumference}
                                        strokeDashoffset={strokeDashoffset}
                                        strokeLinecap="round"
                                        transform={`rotate(-90 ${circleSize / 2} ${circleSize / 2})`}
                                    />
                                </Svg>
                                <View style={styles.circularProgressLabelContainer}>
                                    <Text style={[styles.circularProgressText, { color: visibilityScore >= 80 ? colors.success : visibilityScore >= 50 ? colors.warning : colors.danger }]}>
                                        {visibilityScore}%
                                    </Text>
                                    <Text style={styles.circularProgressSubText}>{visibilityLabel}</Text>
                                </View>
                            </View>
                        </View>

                        {/* KPI 3: Confidence */}
                        <View style={styles.kpiBox}>
                            <Text style={styles.kpiLabel}>Confidence</Text>
                            <View style={[styles.kpiBadge, styles.confidenceBadge]}>
                                <Text style={[styles.confidenceBadgeText, { color: confidenceLabel === 'High' ? colors.success : confidenceLabel === 'Medium' ? colors.warning : colors.danger }]}>
                                    {confidenceScore}%
                                </Text>
                            </View>
                            <Text style={styles.kpiSub}>{confidenceLabel} Quality</Text>
                        </View>
                    </View>

                    {/* Streak & Stability Streak */}
                    <View style={styles.stabilityBox}>
                        {(() => {
                            if (lastStable.currently_stable) {
                                return (
                                    <Text style={styles.stabilityText}>
                                        🟢 Patient stable for <Text style={FONT.bold}>{lastStable.stable_days}</Text> consecutive days
                                    </Text>
                                );
                            } else if (lastStable.last_stable_at) {
                                const diffMs = Date.now() - new Date(lastStable.last_stable_at).getTime();
                                const diffDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                                return (
                                    <Text style={styles.stabilityText}>
                                        ⚠️ Patient last stable <Text style={FONT.bold}>{diffDays}</Text> {diffDays === 1 ? 'day' : 'days'} ago
                                    </Text>
                                );
                            } else {
                                return (
                                    <Text style={styles.stabilityText}>
                                        ⚠️ Patient status currently unstable
                                    </Text>
                                );
                            }
                        })()}
                    </View>

                    {/* Visibility Breakdown Grid */}
                    <View style={styles.breakdownContainer}>
                        <Text style={styles.sectionSubHeading}>Coverage Breakdown</Text>
                        <View style={styles.breakdownGrid}>
                            {(() => {
                                const bd = insights.visibility_breakdown || { medications: 0, vitals: 0, wearable: 0, mood: 0 };
                                return (
                                    <>
                                        {renderBreakdownItem('Medications', bd.medications, 35)}
                                        {renderBreakdownItem('Vitals Log', bd.vitals, 35)}
                                        {renderBreakdownItem('Wearable', bd.wearable, 15)}
                                        {renderBreakdownItem('Mood Log', bd.mood, 15)}
                                    </>
                                );
                            })()}
                        </View>
                    </View>
                </Animated.View>

                {/* Section 2: Risk Contributors Stacked Bar Chart */}
                <Animated.View style={[styles.card, sectionAnimStyle(1)]}>
                    <View style={styles.sectionHeaderRow}>
                        <Activity color={colors.primary} size={18} />
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

                        return (
                            <View style={{ marginTop: 12 }}>
                                <View style={styles.stackedBar}>
                                    {pctAdherence > 0 && <View style={[styles.stackedBarSegment, { width: `${pctAdherence}%`, backgroundColor: '#10B981', borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }]} />}
                                    {pctVitals > 0 && <View style={[styles.stackedBarSegment, { width: `${pctVitals}%`, backgroundColor: '#EF4444' }]} />}
                                    {pctMood > 0 && <View style={[styles.stackedBarSegment, { width: `${pctMood}%`, backgroundColor: '#F59E0B' }]} />}
                                    {pctVisibility > 0 && <View style={[styles.stackedBarSegment, { width: `${pctVisibility}%`, backgroundColor: '#6366F1', borderTopRightRadius: 4, borderBottomRightRadius: 4 }]} />}
                                </View>
                                <View style={styles.legendGrid}>
                                    <View style={styles.legendItem}>
                                        <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                                        <Text style={styles.legendText} numberOfLines={1}>Meds ({pctAdherence}%)</Text>
                                    </View>
                                    <View style={styles.legendItem}>
                                        <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
                                        <Text style={styles.legendText} numberOfLines={1}>Vitals ({pctVitals}%)</Text>
                                    </View>
                                    <View style={styles.legendItem}>
                                        <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                                        <Text style={styles.legendText} numberOfLines={1}>Wellness ({pctMood}%)</Text>
                                    </View>
                                    <View style={styles.legendItem}>
                                        <View style={[styles.legendDot, { backgroundColor: '#6366F1' }]} />
                                        <Text style={styles.legendText} numberOfLines={1}>Visibility ({pctVisibility}%)</Text>
                                    </View>
                                </View>
                            </View>
                        );
                    })()}
                </Animated.View>

                {/* Section 3: Predictive Forecasts & Recovery (Future Outlook) */}
                <Animated.View style={[styles.card, sectionAnimStyle(2)]}>
                    <View style={styles.sectionHeaderRow}>
                        <Sparkles color={colors.primary} size={18} />
                        <Text style={styles.cardTitle}>Predictive Forecasts</Text>
                    </View>
                    <Text style={styles.cardSub}>AI outlook & upcoming trends</Text>

                    {/* Alerts & Recovery status inside forecasts */}
                    {((insights.predictive_health?.recovery?.status) || 
                      (insights.predictive_health?.risk_trends?.velocity > 0 || insights.predictive_health?.forecast?.trajectory === 'negative')) && (
                        <View style={{ marginVertical: 12, gap: 10 }}>
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
                        </View>
                    )}

                    <Text style={styles.sectionHeading}>🔮 3-Day Vital Forecast</Text>
                    <View style={styles.forecastContent}>
                        {(() => {
                            const predData = predictions.predictions || [];
                            if (predData.length === 0) {
                                return <Text style={styles.noForecastText}>No forecasting metrics synchronized yet.</Text>;
                            }
                            return (
                                <View style={styles.forecastRow}>
                                    {predData.slice(0, 3).map((pred, idx) => {
                                        const dayLabel = idx === 0 ? 'Tomorrow' : idx === 1 ? 'Day 2' : 'Day 3';
                                        return (
                                            <View key={pred.date || idx} style={styles.forecastBox}>
                                                <Text style={styles.forecastDayLabel}>{dayLabel}</Text>
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
                        
                        {/* Forecast Warning Overlay for Low Confidence */}
                        {confidenceLabel === 'Low' && (
                            <View style={styles.forecastWarningOverlay}>
                                <AlertCircle color={colors.danger} size={16} />
                                <Text style={styles.forecastWarningText}>
                                    Forecast quality limited due to low visibility. Request vital log to update predictions.
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* 14-Day Trajectory Forecast */}
                    {insights.predictive_health?.forecast && (
                        <View style={styles.trajectoryContainer}>
                            <Text style={styles.sectionHeading}>🔮 14-Day Health Trajectory</Text>
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
                        </View>
                    )}
                </Animated.View>

                {/* Section 4: Vitals & Adherence Trends (Historical Charts) */}
                <Animated.View style={[styles.card, sectionAnimStyle(3)]}>
                    <View style={styles.sectionHeaderRow}>
                        <TrendingUp color={colors.primary} size={18} />
                        <Text style={styles.cardTitle}>Vitals & Adherence Trends</Text>
                    </View>
                    <Text style={styles.cardSub}>Historical chronological analytics</Text>

                    {/* Vitals Trend SVG Line Chart */}
                    <View style={{ marginTop: 14 }}>
                        <Text style={styles.sectionSubHeading}>7-Day Heart Rate Trend (bpm)</Text>
                        
                        {(() => {
                            const daysToShow = 7;
                            const history = data.vitals_history || [];
                            const last7Days = [];
                            const today = new Date();
                            
                            for (let i = daysToShow - 1; i >= 0; i--) {
                                const d = new Date(today);
                                d.setDate(d.getDate() - i);
                                last7Days.push(d);
                            }

                            const historyByDate = {};
                            history.forEach(log => {
                                if (log.date) {
                                    const dStr = new Date(log.date).toISOString().slice(0, 10);
                                    historyByDate[dStr] = log;
                                }
                            });

                            // Create Points for SVG
                            const minHr = 50;
                            const maxHr = 110;
                            const chartH = 90;
                            const chartW = width - 64; // Horizontal screen clearance
                            const getX = (idx) => (idx * chartW) / 6;
                            const getY = (hr) => {
                                const clamped = Math.max(minHr, Math.min(maxHr, hr));
                                return chartH - 10 - ((clamped - minHr) / (maxHr - minHr)) * (chartH - 20);
                            };

                            const points = last7Days.map((dateObj, idx) => {
                                const dStr = dateObj.toISOString().slice(0, 10);
                                const log = historyByDate[dStr];
                                const hasData = log && log.heart_rate;
                                const hr = hasData ? log.heart_rate : 75; // fallback
                                return {
                                    x: getX(idx),
                                    y: getY(hr),
                                    hr: hr,
                                    hasData: hasData,
                                    dayLabel: dateObj.toLocaleDateString(undefined, { weekday: 'narrow' })
                                };
                            });

                            // Build path d
                            let dPath = '';
                            points.forEach((pt, idx) => {
                                if (idx === 0) {
                                    dPath += `M ${pt.x} ${pt.y}`;
                                } else {
                                    dPath += ` L ${pt.x} ${pt.y}`;
                                }
                            });

                            // Area path
                            const dArea = points.length > 0 
                                ? `${dPath} L ${points[points.length - 1].x} ${chartH} L ${points[0].x} ${chartH} Z`
                                : '';

                            const allEmpty = history.filter(l => l.heart_rate).length === 0;

                            return (
                                <View style={styles.chartWrapper}>
                                    {allEmpty ? (
                                        <View style={styles.emptyChartBox}>
                                            <HeartPulse size={24} color={colors.textMuted} />
                                            <Text style={styles.emptyChartText}>No heart rate records in the past 7 days.</Text>
                                        </View>
                                    ) : (
                                        <View>
                                            <Svg height={chartH} width={chartW}>
                                                <Defs>
                                                    <SvgGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.25" />
                                                        <Stop offset="100%" stopColor={colors.primary} stopOpacity="0.0" />
                                                    </SvgGradient>
                                                </Defs>
                                                
                                                {/* Grid lines */}
                                                <Path d={`M 0 ${getY(60)} L ${chartW} ${getY(60)}`} stroke="#E2E8F0" strokeWidth="0.8" strokeDasharray="4 4" />
                                                <Path d={`M 0 ${getY(80)} L ${chartW} ${getY(80)}`} stroke="#E2E8F0" strokeWidth="0.8" strokeDasharray="4 4" />
                                                <Path d={`M 0 ${getY(100)} L ${chartW} ${getY(100)}`} stroke="#E2E8F0" strokeWidth="0.8" strokeDasharray="4 4" />

                                                {/* Area fill */}
                                                {dArea !== '' && <Path d={dArea} fill="url(#chartAreaGrad)" />}
                                                
                                                {/* Stroke line */}
                                                {dPath !== '' && <Path d={dPath} fill="none" stroke={colors.primary} strokeWidth="2.5" strokeLinecap="round" />}

                                                {/* Dots */}
                                                {points.map((pt, idx) => (
                                                    <Circle
                                                        key={idx}
                                                        cx={pt.x}
                                                        cy={pt.y}
                                                        r={pt.hasData ? 4 : 2}
                                                        fill={pt.hasData ? colors.primary : '#FFF'}
                                                        stroke={colors.primary}
                                                        strokeWidth={pt.hasData ? 1.5 : 1}
                                                    />
                                                ))}
                                            </Svg>
                                            {/* X Axis labels */}
                                            <View style={styles.chartLabelsRow}>
                                                {points.map((pt, idx) => (
                                                    <Text key={idx} style={[styles.chartXLabel, pt.hasData && { color: colors.textPrimary, ...FONT.bold }]}>
                                                        {pt.dayLabel}
                                                    </Text>
                                                ))}
                                            </View>
                                        </View>
                                    )}
                                </View>
                            );
                        })()}
                    </View>

                    {/* Adherence Trends (Weekly Bar Chart) */}
                    <View style={styles.trendsDivider} />
                    <View style={{ marginTop: 14 }}>
                        <Text style={styles.sectionSubHeading}>Weekly Adherence Rate (%)</Text>
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

                {/* Section 5: AI Recommendations */}
                {recommendations.length > 0 && (
                    <Animated.View style={[styles.card, { borderColor: colors.primarySoft, borderWidth: 1.5 }, sectionAnimStyle(4)]}>
                        <View style={styles.sectionHeaderRow}>
                            <Lightbulb color={colors.warning} size={18} />
                            <Text style={styles.cardTitle}>AI Recommendations</Text>
                        </View>
                        <Text style={styles.cardSub}>Suggested caretaker checklist actions</Text>
                        
                        <View style={styles.recommendationsList}>
                            {recommendations.map((rec, idx) => (
                                <View key={rec || idx} style={styles.recRow}>
                                    <Text style={styles.recBullet}>✦</Text>
                                    <Text style={styles.recText}>{rec}</Text>
                                </View>
                            ))}
                        </View>
                    </Animated.View>
                )}

                {/* Section 6: Patient Journey & Risk Timeline */}
                <Animated.View style={[styles.card, sectionAnimStyle(5)]}>
                    <View style={styles.sectionHeaderRow}>
                        <Calendar color={colors.primary} size={18} />
                        <Text style={styles.cardTitle}>Journey & Timeline</Text>
                    </View>
                    <Text style={styles.cardSub}>Long-term progression story</Text>

                    <Text style={styles.sectionHeading}>📈 Patient Journey Progression</Text>
                    <View style={styles.journeyGrid}>
                        {/* Column 1: Risk Status */}
                        <View style={styles.journeyGridCard}>
                            <Text style={styles.journeyGridLabel}>Risk Status</Text>
                            <Text style={[
                                styles.journeyGridVal,
                                { color: riskLevel === 'high' ? colors.danger :
                                         riskLevel === 'medium' ? colors.warning :
                                         riskLevel === 'low' ? colors.success : '#64748B' }
                            ]}>
                                {riskLevel === 'high' ? 'High' :
                                 riskLevel === 'medium' ? 'Medium' :
                                 riskLevel === 'low' ? 'Low' : 'Unknown'}
                            </Text>
                            <Text style={styles.journeyGridSub}>
                                {trendDirection === 'improving' ? '↗ Improving' :
                                 trendDirection === 'worsening' ? '↘ Worsening' : '→ Stable'}
                            </Text>
                        </View>

                        {/* Column 2: Care Visibility */}
                        <View style={styles.journeyGridCard}>
                            <Text style={styles.journeyGridLabel}>Care Visibility</Text>
                            <Text style={[
                                styles.journeyGridVal,
                                { color: visibilityScore >= 80 ? colors.success : visibilityScore >= 50 ? colors.warning : colors.danger }
                            ]}>
                                {visibilityScore}%
                            </Text>
                            <Text style={styles.journeyGridSub}>{visibilityLabel} Coverage</Text>
                        </View>

                        {/* Column 3: Adherence Streak */}
                        <View style={styles.journeyGridCard}>
                            <Text style={styles.journeyGridLabel}>Medication Streak</Text>
                            <Text style={[styles.journeyGridVal, { color: colors.primary }]}>
                                {data.patient.current_streak} Days
                            </Text>
                            <Text style={styles.journeyGridSub}>{adherence}% Adherence</Text>
                        </View>
                    </View>

                    {/* Timeline */}
                    <View style={styles.journeyTimelineSection}>
                        <Text style={styles.sectionHeading}>📅 Caregiver Risk Timeline</Text>
                        {(!data.risk_timeline || data.risk_timeline.length === 0) ? (
                            <View style={styles.emptyTimelineBox}>
                                <ShieldCheck color={colors.success} size={18} />
                                <Text style={styles.emptyTimelineText}>No risk transitions recorded. Patient has been consistently stable.</Text>
                            </View>
                        ) : (
                            <View style={styles.timelineList}>
                                {data.risk_timeline.slice(0, 5).map((item, idx) => {
                                    const isLast = idx === Math.min(data.risk_timeline.length, 5) - 1;
                                    const dateStr = formatDate(item.date, 'D MMM, h:mm a');
                                    
                                    const getRiskColor = (lvl) => {
                                        if (lvl === 'high') return colors.danger;
                                        if (lvl === 'medium') return colors.warning;
                                        if (lvl === 'low') return colors.success;
                                        return '#64748B';
                                    };

                                    return (
                                        <View key={item._id || idx} style={styles.timelineRowItem}>
                                            <View style={styles.timelineLineCol}>
                                                <View style={[styles.timelineMarkerDot, { backgroundColor: getRiskColor(item.to) }]} />
                                                {!isLast && <View style={styles.timelineVerticalLinkLine} />}
                                            </View>
                                            <View style={styles.timelineContentCol}>
                                                <View style={styles.timelineTransitionRow}>
                                                    <Text style={[styles.timelineRiskText, { color: getRiskColor(item.from) }]}>
                                                        {item.from.toUpperCase()}
                                                    </Text>
                                                    <Text style={styles.timelineTransitionArrow}>➔</Text>
                                                    <Text style={[styles.timelineRiskText, { color: getRiskColor(item.to), ...FONT.bold }]}>
                                                        {item.to.toUpperCase()}
                                                    </Text>
                                                </View>
                                                <Text style={styles.timelineTransitionDate}>{dateStr}</Text>
                                            </View>
                                        </View>
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
    kpiCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        padding: spacing.md,
        ...shadows.card,
        borderWidth: 1.5,
        borderColor: colors.primarySoft,
        marginTop: 8,
    },
    kpiGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    kpiBox: {
        flex: 1,
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    kpiLabel: {
        fontSize: 10,
        ...FONT.bold,
        color: colors.textSecondary,
        marginBottom: 8,
    },
    kpiBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 54,
    },
    kpiBadgeText: {
        fontSize: 11,
        ...FONT.bold,
    },
    riskBadgeHigh: { backgroundColor: colors.dangerLight },
    riskBadgeMedium: { backgroundColor: colors.warningLight },
    riskBadgeLow: { backgroundColor: colors.successLight },
    riskBadgeUnknown: { backgroundColor: '#F1F5F9' },
    kpiSub: {
        fontSize: 9,
        ...FONT.bold,
        marginTop: 6,
    },
    confidenceBadge: {
        backgroundColor: colors.primarySoft,
    },
    confidenceBadgeText: {
        fontSize: 11,
        ...FONT.bold,
    },
    circularProgressContainer: {
        width: circleSize,
        height: circleSize,
        justifyContent: 'center',
        alignItems: 'center',
    },
    circularProgressLabelContainer: {
        position: 'absolute',
        alignItems: 'center',
    },
    circularProgressText: {
        fontSize: 13,
        ...FONT.bold,
    },
    circularProgressSubText: {
        fontSize: 8,
        ...FONT.semibold,
        color: colors.textMuted,
        marginTop: 1,
    },
    stabilityBox: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
        alignItems: 'center',
    },
    stabilityText: {
        fontSize: 11,
        color: colors.textSecondary,
        ...FONT.semibold,
    },
    breakdownContainer: {
        marginTop: 14,
        paddingTop: 14,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
    },
    breakdownGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 6,
    },
    breakdownItem: {
        flex: 1,
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        paddingVertical: 8,
        paddingHorizontal: 2,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    breakdownStatusIcon: {
        width: 16,
        height: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    breakdownItemLabel: {
        fontSize: 8,
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
        gap: 6,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        width: '46%',
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
    recoveryBanner: {
        backgroundColor: '#ECFDF5',
        borderWidth: 1,
        borderColor: '#A7F3D0',
        borderRadius: 12,
        padding: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
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
    trajectoryContainer: {
        marginTop: 14,
        paddingTop: 14,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
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
    chartWrapper: {
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: 16,
        padding: 12,
        marginTop: 6,
        alignItems: 'center',
    },
    emptyChartBox: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
        gap: 8,
    },
    emptyChartText: {
        fontSize: 11,
        ...FONT.medium,
        color: colors.textMuted,
        textAlign: 'center',
    },
    chartLabelsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginTop: 8,
    },
    chartXLabel: {
        fontSize: 9,
        ...FONT.semibold,
        color: colors.textMuted,
        width: (width - 64 - 24) / 7,
        textAlign: 'center',
    },
    trendsDivider: {
        height: 1,
        backgroundColor: colors.borderLight,
        marginVertical: 14,
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
    journeyTimelineSection: {
        marginTop: 16,
        paddingTop: 16,
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
});
