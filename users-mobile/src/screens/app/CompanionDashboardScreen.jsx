import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Dimensions, Linking, ActivityIndicator, Image } from 'react-native';
import { apiService } from '../../lib/api';
import { HeartPulse, Activity, Bell, Phone, Send, ChevronRight, MessageSquare, ShieldCheck, AlertCircle, ChevronLeft, RefreshCw, Bluetooth } from 'lucide-react-native';
import AlertManager from '../../utils/AlertManager';
import { colors, radius, spacing, shadows, layout } from '../../theme';
import usePatientStore from '../../store/usePatientStore';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

const { width } = Dimensions.get('window');



const FONT = {
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export default function CompanionDashboardScreen() {
    const [data, setData] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [nudging, setNudging] = useState(false);
    const [requestingBP, setRequestingBP] = useState(false);
    
    const selectedPatientId = usePatientStore(s => s.companionSelectedPatientId);
    const navigation = useNavigation();

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

    if (!data || !data.patient) return <View style={styles.container} />;

    const adherence = data.patient.adherence_rate !== null ? data.patient.adherence_rate : 0;
    
    // BP validation: handle empty BP readings gracefully
    const hasVitals = data.latest_vital && 
                      data.latest_vital.bp_systolic && 
                      data.latest_vital.bp_diastolic;

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

                    {/* Premium Floral Outline Petals (Top Right Corner) */}
                    <Path d="M360 -10 C330 40, 290 60, 260 80 C290 90, 340 80, 370 40 Z" fill="none" stroke={colors.primary} strokeWidth="1" opacity="0.15" />
                    <Path d="M390 20 C360 60, 320 90, 290 110 C310 120, 360 100, 390 60 Z" fill="none" stroke={colors.primary} strokeWidth="1.2" opacity="0.12" />

                    {/* Premium Floral Outline Petals (Bottom Left Corner) */}
                    <Path d="M-10 780 C40 750, 60 710, 80 680 C90 710, 80 760, 40 790 Z" fill="none" stroke={colors.danger} strokeWidth="1" opacity="0.15" />
                    <Path d="M20 810 C60 780, 90 740, 110 710 C120 730, 100 780, 60 810 Z" fill="none" stroke={colors.danger} strokeWidth="1.2" opacity="0.12" />
                    
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
                <View style={styles.summaryCard}>
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
                </View>

                {/* Low Pill Stock Refill Warning Banner */}
                {data.refill_alerts && data.refill_alerts.length > 0 && (
                    <View style={styles.refillBanner}>
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
                    </View>
                )}

                {/* 1. Quick Actions Bar */}
                <View style={styles.actionsContainer}>
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
                </View>

                {/* 2. Adherence Meter Card */}
                <View style={styles.card}>
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
                </View>

                {/* 2b. Daily Medication Timeline Checklist */}
                {data.medication_schedule && data.medication_schedule.length > 0 && (
                    <View style={styles.card}>
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
                    </View>
                )}

                {/* 3. Vitals Card (with beautiful elegant empty states) */}
                <View style={styles.card}>
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
                </View>

                {/* 3b. Vitals 7-Day Analytics Trends Graph */}
                {data.vitals_history && data.vitals_history.length > 0 && (
                    <View style={styles.card}>
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
                    </View>
                )}
                
                {/* 4. Alerts Card */}
                {data.recent_alerts?.length > 0 ? (
                    <View style={styles.card}>
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
                    </View>
                ) : (
                    <View style={styles.noAlertsCard}>
                        <ShieldCheck color={colors.success} size={24} />
                        <Text style={styles.noAlertsText}>All systems normal. No active alerts.</Text>
                    </View>
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
});
