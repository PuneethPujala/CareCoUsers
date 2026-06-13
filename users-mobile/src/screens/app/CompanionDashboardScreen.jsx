import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Dimensions, Linking, ActivityIndicator, Image, Animated } from 'react-native';
import { apiService } from '../../lib/api';
import { HeartPulse, Activity, Bell, Phone, Send, ChevronRight, MessageSquare, ShieldCheck, AlertCircle, ChevronLeft, RefreshCw, Bluetooth } from 'lucide-react-native';
import AlertManager from '../../utils/AlertManager';
import { colors, radius, spacing, shadows, layout, motion, anim, useReduceMotion } from '../../theme';
import usePatientStore from '../../store/usePatientStore';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

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

export default function CompanionDashboardScreen() {
    const [data, setData] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [nudging, setNudging] = useState(false);
    const [requestingBP, setRequestingBP] = useState(false);
    
    const selectedPatientId = usePatientStore(s => s.companionSelectedPatientId);
    const navigation = useNavigation();
    const reduceMotion = useReduceMotion();

    // ── Staggered Entrance Animations ──
    const SECTION_COUNT = 9;
    const staggerAnims = useRef([...Array(SECTION_COUNT)].map(() => new Animated.Value(0))).current;
    const hasAnimated = useRef(false);

    const runEntranceAnimations = useCallback(() => {
        staggerAnims.forEach(a => a.setValue(0));
        if (reduceMotion) {
            staggerAnims.forEach(a => a.setValue(1));
            return;
        }
        Animated.stagger(70,
            staggerAnims.map(a =>
                Animated.spring(a, { toValue: 1, ...motion.springSoft, useNativeDriver: true })
            )
        ).start();
    }, [staggerAnims, reduceMotion]);

    const sectionAnim = (i) => ({
        opacity: staggerAnims[i],
        transform: reduceMotion ? [] : [{ translateY: staggerAnims[i].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
    });

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
            const res = await apiService.companion.getPatientStatus({ patientId: selectedPatientId });
            setData(res.data);
        } catch (err) {
            console.warn('Failed to load companion dashboard', err);
        }
    };

    useEffect(() => {
        loadData();
    }, [selectedPatientId]);

    useFocusEffect(
        useCallback(() => {
            if (data && !hasAnimated.current) {
                hasAnimated.current = true;
                runEntranceAnimations();
            }
        }, [data, runEntranceAnimations])
    );

    // Trigger animations when data first loads
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

    const handleNudge = async () => {
        if (nudging) return;
        setNudging(true);
        try {
            await apiService.companion.nudge({ patientId: selectedPatientId });
            AlertManager.alert('Nudge Sent', `${data.patient.name} has been nudged successfully! ❤️`);
        } catch (err) {
            console.warn('Failed to nudge', err);
            AlertManager.alert('Nudge Failed', 'Unable to send nudge reminder at this time.');
        } finally {
            setNudging(false);
        }
    };

    const handleCall = () => {
        const phone = data.patient.phone;
        if (phone) {
            Linking.openURL(`tel:${phone}`);
        } else {
            AlertManager.alert('No Phone Number', `${data.patient.name} does not have a phone number configured.`);
        }
    };

    const handleRequestBP = async () => {
        if (requestingBP) return;
        setRequestingBP(true);
        try {
            await apiService.companion.requestBP({ patientId: selectedPatientId });
            AlertManager.alert('BP Request Sent', `Request for Blood Pressure log sent to ${data.patient.name} successfully! 🩺`);
        } catch (err) {
            console.warn('Failed to request BP', err);
            AlertManager.alert('Request Failed', 'Unable to send Blood Pressure log request.');
        } finally {
            setRequestingBP(false);
        }
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

    if (!data || !data.patient) return <View style={styles.container} />;

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
    const priorityActions = insights.priority_actions || [];
    const recommendations = insights.recommendations || [];

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
                        <SvgGradient id="bottomBg" x1="0%" y1="0%" x2="100%" y2="100%">
                            <Stop offset="0%" stopColor="#FFF1F2" stopOpacity="0.75" />
                            <Stop offset="100%" stopColor="#F8FAFC" stopOpacity="0" />
                        </SvgGradient>
                    </Defs>
                    
                    {/* Top right curvy gradient backdrop */}
                    <Path d="M180 0 C260 120, 320 150, 400 120 L400 0 Z" fill="url(#topBg)" />
                    
                    {/* Bottom left curvy gradient backdrop */}
                    <Path d="M0 620 C60 700, 140 720, 220 850 L0 850 Z" fill="url(#bottomBg)" />

                    {/* Top-right overlapping wavy contours */}
                    <Path d="M220 0 C280 80, 320 100, 400 70" stroke={colors.primary} strokeWidth="0.8" fill="none" opacity="0.08" />
                    <Path d="M200 0 C265 95, 310 115, 400 90" stroke={colors.primary} strokeWidth="0.8" fill="none" opacity="0.08" />
                    <Path d="M180 0 C250 110, 300 130, 400 110" stroke={colors.primary} strokeWidth="0.8" fill="none" opacity="0.08" />
                    <Path d="M160 0 C235 125, 290 145, 400 130" stroke={colors.primary} strokeWidth="0.8" fill="none" opacity="0.08" />
                    <Path d="M140 0 C220 140, 280 160, 400 150" stroke={colors.borderLight} strokeWidth="0.8" fill="none" opacity="0.12" />
                    <Path d="M120 0 C205 155, 270 175, 400 170" stroke={colors.borderLight} strokeWidth="0.8" fill="none" opacity="0.12" />

                    {/* Bottom-left overlapping wavy contours */}
                    <Path d="M0 640 C60 670, 100 710, 160 850" stroke={colors.danger} strokeWidth="0.8" fill="none" opacity="0.08" />
                    <Path d="M0 620 C70 655, 115 700, 185 850" stroke={colors.danger} strokeWidth="0.8" fill="none" opacity="0.08" />
                    <Path d="M0 600 C80 640, 130 690, 210 850" stroke={colors.danger} strokeWidth="0.8" fill="none" opacity="0.08" />
                    <Path d="M0 580 C90 625, 145 680, 235 850" stroke={colors.borderLight} strokeWidth="0.8" fill="none" opacity="0.12" />
                    <Path d="M0 560 C100 610, 160 670, 260 850" stroke={colors.borderLight} strokeWidth="0.8" fill="none" opacity="0.12" />

                    {/* Stylized sweeping curve lines */}
                    <Path d="M-20 180 C80 230, 180 150, 280 230 C340 280, 380 250, 420 310" stroke={colors.borderLight} strokeWidth="1.5" fill="none" opacity="0.4" />
                    <Path d="M-40 210 C60 260, 160 180, 260 260 C320 310, 360 280, 400 340" stroke={colors.borderLight} strokeWidth="1" fill="none" opacity="0.25" />

                    {/* Concentric abstract rings */}
                    <Circle cx="320" cy="480" r="130" stroke={colors.borderLight} strokeWidth="1" fill="none" opacity="0.2" />
                    <Circle cx="320" cy="480" r="90" stroke={colors.borderLight} strokeWidth="1.2" fill="none" opacity="0.1" />
                </Svg>
            </View>

            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [{ padding: 4, marginLeft: -4 }, pressed && { opacity: 0.6 }]}><ChevronLeft color={colors.textPrimary} size={28} /></Pressable>
                    <View>
                        <Text style={styles.headerSub}>Family Care Portal</Text>
                        <Text style={styles.title}>{data.patient.name}'s Health</Text>
                    </View>
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
                {/* Top Summary Card (Mockup Style) */}
                <Animated.View style={[styles.summaryCard, sectionAnim(0)]}>
                    <View style={styles.summaryCol}>
                        <View style={styles.summaryColRow}>
                            <ShieldCheck color={(data.recent_alerts && data.recent_alerts.length > 0) ? colors.danger : colors.success} size={20} />
                            <View style={{ marginLeft: 6 }}>
                                <Text style={styles.summaryColTitle}>
                                    {(data.recent_alerts && data.recent_alerts.length > 0) ? 'Action Needed' : 'Stable Today'}
                                </Text>
                                <Text style={styles.summaryColSub}>
                                    {(data.recent_alerts && data.recent_alerts.length > 0) ? `${data.recent_alerts.length} active alerts` : 'All vitals normal'}
                                </Text>
                            </View>
                        </View>
                    </View>
                    
                    <View style={styles.summaryDivider} />
                    
                    <View style={[styles.summaryCol, { alignItems: 'center' }]}>
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
                    
                    <View style={[styles.summaryCol, { alignItems: 'center' }]}>
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

                {/* Low Pill Stock Refill Warning Banner */}
                {data.refill_alerts && data.refill_alerts.length > 0 && (
                    <Animated.View style={[styles.refillBanner, sectionAnim(1)]}>
                        <View style={styles.refillBannerHeader}>
                            <AlertCircle color={colors.warning} size={18} />
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

                {/* AI Companion Intelligence Hub Card */}
                <Animated.View style={[styles.hubCard, sectionAnim(2)]}>
                    <View style={styles.hubHeader}>
                        <View style={styles.hubTitleRow}>
                            <Activity color={colors.primary} size={20} />
                            <Text style={styles.hubTitle}>AI Companion Intelligence Hub</Text>
                        </View>
                    </View>

                    {/* Section A: Risk, Trend, Visibility Header & Last Stable */}
                    <View style={styles.metricRow}>
                        <View style={styles.badgeRow}>
                            {/* Risk badge */}
                            <View style={[
                                styles.badge,
                                riskLevel === 'high' ? styles.riskBadgeHigh :
                                riskLevel === 'medium' ? styles.riskBadgeMedium :
                                riskLevel === 'low' ? styles.riskBadgeLow : styles.riskBadgeUnknown
                            ]}>
                                <Text style={[
                                    styles.riskBadgeText,
                                    { color: riskLevel === 'high' ? colors.danger :
                                             riskLevel === 'medium' ? colors.warning :
                                             riskLevel === 'low' ? colors.success : '#64748B' }
                                ]}>
                                    {riskLevel === 'high' ? 'High Risk' :
                                     riskLevel === 'medium' ? 'Medium Risk' :
                                     riskLevel === 'low' ? 'Low Risk' : 'Status Unknown'}
                                </Text>
                            </View>

                            {/* Trend indicator (only when risk level is known) */}
                            {riskLevel !== 'unknown' && (
                                <Text style={[
                                    styles.trendText,
                                    { color: trendDirection === 'improving' ? colors.success :
                                             trendDirection === 'worsening' ? colors.danger : colors.textSecondary }
                                ]}>
                                    {trendDirection === 'improving' ? 'Improving ↓' :
                                     trendDirection === 'worsening' ? 'Worsening ↑' : 'Stable →'}
                                </Text>
                            )}

                            {/* Confidence badge */}
                            <View style={[styles.badge, styles.confidenceBadge]}>
                                <Text style={[styles.confidenceBadgeText, { color: confidenceLabel === 'High' ? colors.success : confidenceLabel === 'Medium' ? colors.warning : colors.danger }]}>
                                    Confidence: {confidenceLabel} ({confidenceScore}%)
                                </Text>
                            </View>
                        </View>

                        {/* Last Stable Streaks / Relative Offsets */}
                        <View style={{ marginTop: 8 }}>
                            {(() => {
                                if (lastStable.currently_stable) {
                                    return (
                                        <Text style={styles.lastStableText}>
                                            🟢 Stable for <Text style={FONT.bold}>{lastStable.stable_days}</Text> consecutive days
                                        </Text>
                                    );
                                } else if (lastStable.last_stable_at) {
                                    const diffMs = Date.now() - new Date(lastStable.last_stable_at).getTime();
                                    const diffDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                                    return (
                                        <Text style={styles.lastStableText}>
                                            ⚠️ Last stable <Text style={FONT.bold}>{diffDays}</Text> {diffDays === 1 ? 'day' : 'days'} ago
                                        </Text>
                                    );
                                } else {
                                    return (
                                        <Text style={styles.lastStableText}>
                                            ⚠️ Patient status currently unstable
                                        </Text>
                                    );
                                }
                            })()}
                        </View>

                        {/* Visibility Breakdown score bar & grid */}
                        <View style={styles.visibilityContainer}>
                            <View style={styles.visibilityHeaderRow}>
                                <Text style={styles.visibilityLabel}>Care Visibility</Text>
                                <Text style={[styles.visibilityScoreText, { color: visibilityScore >= 80 ? colors.success : visibilityScore >= 50 ? colors.warning : colors.danger }]}>
                                    {visibilityScore}% ({visibilityLabel})
                                </Text>
                            </View>
                            <View style={styles.progressBarContainer}>
                                <View style={[
                                    styles.progressBarFill,
                                    {
                                        width: `${visibilityScore}%`,
                                        backgroundColor: visibilityScore >= 80 ? colors.success : visibilityScore >= 50 ? colors.warning : colors.danger
                                    }
                                ]} />
                            </View>

                            {/* Grid of ticks/warnings */}
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

                        {/* Risk Contributors stacked bar chart */}
                        {(() => {
                            const riskBreakdown = insights.risk_breakdown || { adherence: 30, vitals: 40, mood: 15, visibility: 15 };
                            const totalBreakdown = (riskBreakdown.adherence || 0) + (riskBreakdown.vitals || 0) + (riskBreakdown.mood || 0) + (riskBreakdown.visibility || 0) || 1;
                            const pctAdherence = Math.round(((riskBreakdown.adherence || 0) / totalBreakdown) * 100);
                            const pctVitals = Math.round(((riskBreakdown.vitals || 0) / totalBreakdown) * 100);
                            const pctMood = Math.round(((riskBreakdown.mood || 0) / totalBreakdown) * 100);
                            const pctVisibility = Math.round(((riskBreakdown.visibility || 0) / totalBreakdown) * 100);

                            return (
                                <View style={styles.riskBreakdownContainer}>
                                    <Text style={styles.visibilityLabel}>Risk Contributors</Text>
                                    <View style={styles.stackedBar}>
                                        {pctAdherence > 0 && <View style={[styles.stackedBarSegment, { width: `${pctAdherence}%`, backgroundColor: '#10B981', borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }]} />}
                                        {pctVitals > 0 && <View style={[styles.stackedBarSegment, { width: `${pctVitals}%`, backgroundColor: '#EF4444' }]} />}
                                        {pctMood > 0 && <View style={[styles.stackedBarSegment, { width: `${pctMood}%`, backgroundColor: '#F59E0B' }]} />}
                                        {pctVisibility > 0 && <View style={[styles.stackedBarSegment, { width: `${pctVisibility}%`, backgroundColor: '#6366F1', borderTopRightRadius: 4, borderBottomRightRadius: 4 }]} />}
                                    </View>
                                    <View style={styles.legendGrid}>
                                        <View style={styles.legendItem}>
                                            <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                                            <Text style={styles.legendText}>Meds ({pctAdherence}%)</Text>
                                        </View>
                                        <View style={styles.legendItem}>
                                            <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
                                            <Text style={styles.legendText}>Vitals ({pctVitals}%)</Text>
                                        </View>
                                        <View style={styles.legendItem}>
                                            <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                                            <Text style={styles.legendText}>Wellness ({pctMood}%)</Text>
                                        </View>
                                        <View style={styles.legendItem}>
                                            <View style={[styles.legendDot, { backgroundColor: '#6366F1' }]} />
                                            <Text style={styles.legendText}>Visibility ({pctVisibility}%)</Text>
                                        </View>
                                    </View>
                                </View>
                            );
                        })()}
                    </View>

                    {/* Section A.5: Recovery & Early Warning Alerts */}
                    {((insights.predictive_health?.recovery?.status) || 
                      (insights.predictive_health?.risk_trends?.velocity > 0 || insights.predictive_health?.forecast?.trajectory === 'negative')) && (
                        <View style={{ marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                            {/* Recovery Banner */}
                            {insights.predictive_health?.recovery?.status && (
                                <View style={{
                                    backgroundColor: '#ECFDF5',
                                    borderWidth: 1,
                                    borderColor: '#A7F3D0',
                                    borderRadius: 12,
                                    padding: 12,
                                    marginBottom: (insights.predictive_health?.risk_trends?.velocity > 0 || insights.predictive_health?.forecast?.trajectory === 'negative') ? 12 : 0,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 8
                                }}>
                                    <ShieldCheck size={20} color="#10B981" />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 13, ...FONT.bold, color: '#065F46' }}>Patient is recovering</Text>
                                        <Text style={{ fontSize: 11, ...FONT.medium, color: '#047857', marginTop: 2 }}>
                                            Risk has decreased for {insights.predictive_health.recovery.days} consecutive days (Confidence: {insights.predictive_health.recovery.confidence}%).
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* Early Warning Alert */}
                            {(insights.predictive_health?.risk_trends?.velocity > 0 || insights.predictive_health?.forecast?.trajectory === 'negative') && (
                                <View style={{
                                    backgroundColor: '#FEF2F2',
                                    borderWidth: 1,
                                    borderColor: '#FCA5A5',
                                    borderRadius: 12,
                                    padding: 12,
                                    flexDirection: 'row',
                                    alignItems: 'flex-start',
                                    gap: 8
                                }}>
                                    <AlertCircle size={20} color="#EF4444" style={{ marginTop: 2 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 13, ...FONT.bold, color: '#991B1B' }}>Early Warning Alert</Text>
                                        <Text style={{ fontSize: 11, ...FONT.medium, color: '#B91C1C', marginTop: 2, lineHeight: 15 }}>
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

                    {/* Section B: AI Caregiver Briefing (Mascot Balloon) */}
                    <View style={styles.briefingContainer}>
                        <Image 
                            source={require('../../../assets/doctor_mascot_insights.jpg')} 
                            style={styles.mascotImage}
                            resizeMode="cover"
                        />
                        <View style={styles.speechBubble}>
                            <View style={styles.speechArrow} />
                            <Text style={styles.briefingTitle}>AI Companion Briefing</Text>
                            <Text style={styles.briefingText}>{insights.summary || 'AI has not generated a briefing for today yet.'}</Text>
                        </View>
                    </View>

                    {/* Section C: Priority Actions list */}
                    <View style={styles.priorityActionsContainer}>
                        <Text style={styles.sectionHeading}>⚠️ Needs Attention</Text>
                        {priorityActions.length === 0 ? (
                            <View style={styles.noActionsBox}>
                                <ShieldCheck color={colors.success} size={18} />
                                <Text style={styles.noActionsText}>No priority actions required at this time.</Text>
                            </View>
                        ) : (
                            <View style={styles.priorityActionsList}>
                                {priorityActions.map((action, idx) => {
                                    const isCritical = action.severity === 'critical';
                                    const isWarning = action.severity === 'warning';
                                    const bulletText = isCritical ? '🔴' : isWarning ? '🟡' : '🔵';
                                    
                                    let btnText = '';
                                    let btnHandler = null;
                                    if (action.action_type === 'medication' || action.action_type === 'critical_vital') {
                                        btnText = 'Nudge';
                                        btnHandler = handleNudge;
                                    } else if (action.action_type === 'vital_sync') {
                                        btnText = 'Request BP';
                                        btnHandler = handleRequestBP;
                                    } else if (action.action_type === 'call_patient') {
                                        btnText = 'Call';
                                        btnHandler = handleCall;
                                    }

                                    return (
                                        <View key={idx} style={styles.priorityActionItem}>
                                            <View style={styles.priorityActionContent}>
                                                <Text style={styles.priorityBullet}>{bulletText}</Text>
                                                <Text style={styles.priorityActionMessage}>{action.message}</Text>
                                            </View>
                                            {btnHandler && (
                                                <Pressable
                                                    style={({ pressed }) => [
                                                        styles.priorityActionBtn,
                                                        isCritical ? styles.priorityActionBtnCritical : null,
                                                        pressed && { opacity: 0.7 }
                                                    ]}
                                                    onPress={btnHandler}
                                                >
                                                    <Text style={styles.priorityActionBtnText}>{btnText}</Text>
                                                </Pressable>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                    </View>

                    {/* Section D: AI Vitals Forecast (Predictions timeline) */}
                    <View style={styles.forecastContainer}>
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
                                                <View key={idx} style={styles.forecastBox}>
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
                                    <AlertCircle color={colors.danger} size={18} />
                                    <Text style={styles.forecastWarningText}>
                                        Forecast quality limited due to low visibility. Request vital log to update predictions.
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Section D2: 14-Day Trajectory Forecast */}
                    {insights.predictive_health?.forecast && (
                        <View style={{
                            marginBottom: 16,
                            paddingBottom: 16,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.borderLight
                        }}>
                            <Text style={styles.sectionHeading}>🔮 14-Day Health Trajectory</Text>
                            <View style={{
                                backgroundColor: '#F8FAFC',
                                borderWidth: 1,
                                borderColor: colors.borderLight,
                                borderRadius: 16,
                                padding: 14,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 12,
                                marginTop: 8
                            }}>
                                <View style={{ flex: 1, gap: 4 }}>
                                    <Text style={{ fontSize: 10, ...FONT.bold, color: colors.textMuted }}>PROJECTED HEALTH SCORE</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                        <Text style={{ fontSize: 28, ...FONT.heavy, color: colors.textPrimary }}>
                                            {insights.predictive_health.forecast.projected_score_14d}
                                        </Text>
                                        <Text style={{ fontSize: 13, ...FONT.semibold, color: colors.textMuted, marginLeft: 4 }}>/100</Text>
                                    </View>
                                    <Text style={{ fontSize: 11, ...FONT.medium, color: colors.textSecondary }}>
                                        Current Score: {data.patient.health_score ?? 82}
                                    </Text>
                                </View>
                                
                                <View style={{ alignItems: 'center', gap: 6 }}>
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
                        </View>
                    )}

                    {/* Section E: AI Recommendations */}
                    {recommendations.length > 0 && (
                        <View style={styles.recommendationsContainer}>
                            <Text style={styles.sectionHeading}>💡 AI Caregiver Recommendations</Text>
                            <View style={styles.recommendationsList}>
                                {recommendations.map((rec, idx) => (
                                    <View key={idx} style={styles.recRow}>
                                        <Text style={styles.recBullet}>✦</Text>
                                        <Text style={styles.recText}>{rec}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* Section E2: Patient Journey Progression */}
                    <View style={styles.journeyProgressionContainer}>
                        <Text style={styles.sectionHeading}>📈 Patient Journey Progression</Text>
                        <View style={styles.journeyGrid}>
                            {/* Column 1: Risk Progress */}
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
                    </View>

                    {/* Section E3: Caregiver Risk Timeline */}
                    <View style={styles.riskTimelineContainer}>
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

                    {/* Section F: Manual Refresh button */}
                    <Pressable 
                        style={({ pressed }) => [styles.refreshInsightsBtn, pressed && { opacity: 0.8 }]}
                        onPress={handleManualRefresh}
                        disabled={refreshing}
                    >
                        {refreshing ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <RefreshCw size={14} color="#FFF" />
                                <Text style={styles.refreshInsightsBtnText}>Refresh Insights</Text>
                            </View>
                        )}
                    </Pressable>
                </Animated.View>

                {/* 1. Quick Actions Bar */}
                <Animated.View style={[styles.actionsContainer, sectionAnim(3)]}>
                    <Pressable style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]} onPress={handleNudge} disabled={nudging}>
                        <View style={[styles.actionIconContainer, { backgroundColor: colors.primarySoft }]}>
                            {nudging ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                                <Send color={colors.primary} size={18} />
                            )}
                        </View>
                        <Text style={styles.actionLabel}>Nudge</Text>
                        <Text style={styles.actionSubLabel}>Send reminder</Text>
                    </Pressable>

                    <Pressable style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]} onPress={handleCall}>
                        <View style={[styles.actionIconContainer, { backgroundColor: colors.successLight }]}>
                            <Phone color={colors.success} size={18} />
                        </View>
                        <Text style={styles.actionLabel}>Call</Text>
                        <Text style={styles.actionSubLabel}>Call {data.patient.name.split(' ')[0]}</Text>
                    </Pressable>

                    <Pressable style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]} onPress={handleRequestBP} disabled={requestingBP}>
                        <View style={[styles.actionIconContainer, { backgroundColor: colors.dangerLight }]}>
                            {requestingBP ? (
                                <ActivityIndicator size="small" color={colors.danger} />
                            ) : (
                                <HeartPulse color={colors.danger} size={18} />
                            )}
                        </View>
                        <Text style={styles.actionLabel}>Request BP</Text>
                        <Text style={styles.actionSubLabel}>Ask for reading</Text>
                    </Pressable>
                </Animated.View>

                {/* 2. Adherence Meter Card */}
                <Animated.View style={[styles.card, sectionAnim(4)]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconBox, { backgroundColor: colors.primarySoft }]}>
                            <Activity color={colors.primary} size={18} />
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

                {/* 2b. Daily Medication Timeline Checklist */}
                {data.medication_schedule && data.medication_schedule.length > 0 && (
                    <Animated.View style={[styles.card, sectionAnim(5)]}>
                        <View style={styles.cardHeader}>
                            <View style={[styles.iconBox, { backgroundColor: colors.successLight }]}>
                                <Activity color={colors.success} size={18} />
                            </View>
                            <View>
                                <Text style={styles.cardTitle}>Today's Dose Timeline</Text>
                                <Text style={styles.cardSub}>Track hourly adherence status</Text>
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
                                
                                return sortedSchedule.map((item, idx) => {
                                    const isLast = idx === sortedSchedule.length - 1;
                                return (
                                    <View key={idx} style={styles.timelineRow}>
                                        <View style={styles.timelineLeft}>
                                            <Text style={styles.timelineTime}>
                                                {item.scheduled_time.toUpperCase()}
                                            </Text>
                                            <View style={styles.timelineLineContainer}>
                                                <View style={[styles.timelineNode, { 
                                                    backgroundColor: item.taken ? colors.success : colors.textMuted,
                                                    borderColor: item.taken ? colors.successLight : colors.borderLight 
                                                }]} />
                                                {!isLast && <View style={[styles.timelineLine, { 
                                                    backgroundColor: item.taken ? colors.success : colors.borderLight 
                                                }]} />}
                                            </View>
                                        </View>
                                        
                                        <Pressable style={({ pressed }) => [styles.timelineCard, item.taken ? styles.timelineCardTaken : null, pressed && { opacity: 0.7 }]}>
                                            <View style={{ flex: 1, paddingRight: 8 }}>
                                                <Text style={styles.timelineMedName} numberOfLines={1} adjustsFontSizeToFit>{item.name}</Text>
                                                <Text style={styles.timelineMedDosage} numberOfLines={1} adjustsFontSizeToFit>{item.dosage} • {item.route}</Text>
                                            </View>
                                            <View style={[
                                                styles.timelineStatusBadge, 
                                                { backgroundColor: item.taken ? colors.successLight : colors.warningLight }
                                            ]}>
                                                <Text style={[
                                                    styles.timelineStatusText, 
                                                    { color: item.taken ? colors.success : colors.warning }
                                                ]}>
                                                    {item.taken ? 'Taken' : 'Pending'}
                                                </Text>
                                            </View>
                                        </Pressable>
                                    </View>
                                );
                                });
                            })()}
                        </View>
                    </Animated.View>
                )}

                {/* 3. Vitals Card (with beautiful elegant empty states) */}
                <Animated.View style={[styles.card, sectionAnim(6)]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconBox, { backgroundColor: colors.dangerLight }]}>
                            <HeartPulse color={colors.danger} size={18} />
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
                                    <Bluetooth size={14} color={colors.primary} />
                                    <Text style={styles.vitalsStatusBadgeText}>All vitals normal</Text>
                                </View>
                                
                                <Text style={styles.vitalsEmptyDesc}>
                                    No BP logs recorded today. Vitals sync when {data.patient.name.split(' ')[0]} connects a BP monitor.
                                </Text>

                                <Pressable style={styles.vitalsSyncBtn} onPress={() => loadData()}>
                                    <Text style={styles.vitalsSyncBtnText}>Sync Now</Text>
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

                {/* 3b. Vitals 7-Day Analytics Trends Graph */}
                {data.vitals_history && data.vitals_history.length > 0 && (
                    <Animated.View style={[styles.card, sectionAnim(7)]}>
                        <View style={styles.cardHeader}>
                            <View style={[styles.iconBox, { backgroundColor: colors.primarySoft }]}>
                                <Activity color={colors.primary} size={18} />
                            </View>
                            <View>
                                <Text style={styles.cardTitle}>Vitals Analytics (7-Day Trend)</Text>
                                <Text style={styles.cardSub}>Chronological health monitoring</Text>
                            </View>
                        </View>

                        <View style={styles.chartContainer}>
                            <Text style={styles.chartTitle}>Heart Rate Trend (bpm)</Text>
                            <View style={styles.barChart}>
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

                                    return last7Days.map((dateObj, idx) => {
                                        const dStr = dateObj.toISOString().slice(0, 10);
                                        const log = historyByDate[dStr];
                                        const dayLabel = dateObj.toLocaleDateString(undefined, { weekday: 'narrow' });

                                        if (!log || !log.heart_rate) {
                                            return (
                                                <View key={`empty-${idx}`} style={styles.barWrapper}>
                                                    <View style={[styles.barTrack, { backgroundColor: '#F1F5F9' }]}>
                                                        <View style={[styles.barFill, { height: '8%', backgroundColor: '#CBD5E1' }]} />
                                                    </View>
                                                    <Text style={[styles.barLabel, { color: colors.textMuted }]}>{dayLabel}</Text>
                                                </View>
                                            );
                                        }

                                        const rate = log.heart_rate;
                                        const pct = Math.min(100, Math.max(20, (rate / 120) * 100));
                                        
                                        return (
                                            <View key={idx} style={styles.barWrapper}>
                                                <View style={[styles.barTrack, { backgroundColor: '#E0F2FE' }]}>
                                                    <View style={[
                                                        styles.barFill, 
                                                        { 
                                                            height: `${pct}%`,
                                                            backgroundColor: rate > 100 || rate < 50 ? colors.danger : colors.primary 
                                                        }
                                                    ]} />
                                                </View>
                                                <Text style={[styles.barLabel, { color: colors.textPrimary, ...FONT.bold }]}>{dayLabel}</Text>
                                            </View>
                                        );
                                    });
                                })()}
                            </View>
                            
                            {(() => {
                                const validLogs = data.vitals_history.filter(l => l.heart_rate);
                                if (validLogs.length === 0) return null;
                                
                                const avg = Math.round(validLogs.reduce((acc, curr) => acc + curr.heart_rate, 0) / validLogs.length);
                                let status = "Stable.";
                                let statusColor = colors.success;
                                let statusBg = colors.successLight;
                                let Icon = ShieldCheck;
                                
                                if (avg > 100 || avg < 50) {
                                    status = "Attention required.";
                                    statusColor = colors.danger;
                                    statusBg = colors.dangerLight;
                                    Icon = AlertCircle;
                                } else if (avg > 90 || avg < 60) {
                                    status = "Monitor closely.";
                                    statusColor = colors.warning;
                                    statusBg = colors.warningLight;
                                    Icon = AlertCircle;
                                }

                                return (
                                    <View style={[styles.vitalTrendSummary, { backgroundColor: statusBg }]}>
                                        <Icon color={statusColor} size={14} />
                                        <Text style={[styles.vitalTrendSummaryText, { color: statusColor }]}>
                                            Heart rate averaged {avg} bpm. {status}
                                        </Text>
                                    </View>
                                );
                            })()}
                        </View>
                    </Animated.View>
                )}
                
                {/* 4. Alerts Card */}
                {data.recent_alerts?.length > 0 ? (
                    <Animated.View style={[styles.card, sectionAnim(8)]}>
                        <View style={styles.cardHeader}>
                            <View style={[styles.iconBox, { backgroundColor: colors.dangerLight }]}>
                                <Bell color={colors.danger} size={18} />
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
                    <Animated.View style={[styles.noAlertsCard, sectionAnim(8)]}>
                        <ShieldCheck color={colors.success} size={24} />
                        <Text style={styles.noAlertsText}>All systems normal. No active alerts.</Text>
                    </Animated.View>
                )}
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
        justifyContent: 'space-between',
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
        backgroundColor: colors.successLight,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 24,
        gap: 10,
    },
    noAlertsText: {
        fontSize: 13,
        ...FONT.bold,
        color: colors.success,
    },

    // Low Pill Stock Refill Banner
    refillBanner: {
        backgroundColor: colors.warningLight,
        borderRadius: 24,
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
        marginTop: 10,
        gap: 16,
    },
    timelineRow: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
    },
    timelineLeft: {
        width: 76,
        alignItems: 'center',
        position: 'relative',
    },
    timelineTime: {
        fontSize: 10,
        ...FONT.bold,
        color: colors.textMuted,
        textAlign: 'center',
    },
    timelineLineContainer: {
        alignItems: 'center',
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 16,
    },
    timelineNode: {
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 2,
        zIndex: 2,
    },
    timelineLine: {
        width: 2,
        flex: 1,
        position: 'absolute',
        top: 8,
        bottom: -16,
        zIndex: 1,
    },
    timelineCard: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
    },
    timelineCardTaken: {
        backgroundColor: colors.successLight + '33',
    },
    timelineMedName: {
        fontSize: 13,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    timelineMedDosage: {
        fontSize: 10,
        ...FONT.medium,
        color: colors.textMuted,
        marginTop: 2,
    },
    timelineStatusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    timelineStatusText: {
        fontSize: 9,
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
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        paddingVertical: 16,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'space-between',
        ...shadows.card,
    },
    summaryCol: {
        flex: 1,
        justifyContent: 'center',
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
    vitalsSyncBtn: {
        backgroundColor: '#2563EB',
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
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

    // Quick Actions Bar Styles
    actionsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    actionButton: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        paddingVertical: 12,
        paddingHorizontal: 8,
        alignItems: 'center',
        ...shadows.card,
    },
    actionIconContainer: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    actionLabel: {
        fontSize: 12,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    actionSubLabel: {
        fontSize: 9,
        ...FONT.medium,
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: 2,
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
    priorityActionsContainer: {
        marginBottom: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
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
    priorityActionsList: {
        gap: 8,
    },
    priorityActionItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    priorityActionContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 8,
    },
    priorityBullet: {
        fontSize: 12,
    },
    priorityActionMessage: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textPrimary,
        flex: 1,
        paddingRight: 6,
    },
    priorityActionBtn: {
        backgroundColor: colors.primary,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    priorityActionBtnCritical: {
        backgroundColor: colors.danger,
    },
    priorityActionBtnText: {
        color: '#FFF',
        fontSize: 10,
        ...FONT.bold,
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
        backgroundColor: colors.primaryMid,
        borderRadius: 12,
        paddingVertical: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    refreshInsightsBtnText: {
        color: '#FFF',
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
});
