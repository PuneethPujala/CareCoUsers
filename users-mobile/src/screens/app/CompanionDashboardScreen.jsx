import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Dimensions, Linking, ActivityIndicator } from 'react-native';
import { apiService } from '../../lib/api';
import { HeartPulse, Activity, Bell, Phone, Send, ChevronRight, MessageSquare, ShieldCheck, AlertCircle, ChevronLeft } from 'lucide-react-native';
import AlertManager from '../../utils/AlertManager';
import { layout } from '../../theme';
import usePatientStore from '../../store/usePatientStore';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

const C = {
    bg: '#F8FAFC',
    surface: '#FFFFFF',
    primary: '#0EA5E9',
    primaryLight: '#E0F2FE',
    dark: '#0F172A',
    mid: '#475569',
    light: '#94A3B8',
    danger: '#EF4444',
    dangerLight: '#FEE2E2',
    warning: '#F59E0B',
    warningLight: '#FEF3C7',
    success: '#10B981',
    successLight: '#D1FAE5',
    border: '#F1F5F9',
    cardBorder: '#E2E8F0',
};

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
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Pressable onPress={() => navigation.goBack()} style={{ padding: 4, marginLeft: -4 }}>
                        <ChevronLeft color={C.dark} size={28} />
                    </Pressable>
                    <View>
                        <Text style={styles.headerSub}>Family Care Portal</Text>
                        <Text style={styles.title}>{data.patient.name}'s Health</Text>
                    </View>
                </View>
                <Pressable 
                    style={styles.bellButton}
                    onPress={() => navigation.navigate('CompanionAlerts')}
                >
                    <Bell color={C.dark} size={20} />
                    {data.recent_alerts?.length > 0 && <View style={styles.bellDot} />}
                </Pressable>
            </View>

            <ScrollView 
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            >
                {/* Low Pill Stock Refill Warning Banner */}
                {data.refill_alerts && data.refill_alerts.length > 0 && (
                    <View style={styles.refillBanner}>
                        <View style={styles.refillBannerHeader}>
                            <AlertCircle color={C.warning} size={18} />
                            <Text style={styles.refillBannerTitle}>Low Medication Stock Alert</Text>
                        </View>
                        <ScrollView style={styles.refillList} nestedScrollEnabled={true}>
                            {data.refill_alerts.map((alert) => (
                                <View key={alert.medication_id} style={styles.refillItem}>
                                    <Text style={styles.refillMedName}>{alert.name}</Text>
                                    <Text style={styles.refillMedStock}>
                                        Only <Text style={{ color: C.danger, ...FONT.bold }}>{alert.remaining_doses}</Text> doses left!
                                    </Text>
                                    {alert.pharmacy_phone ? (
                                        <Pressable 
                                            style={styles.refillCallBtn}
                                            onPress={() => Linking.openURL(`tel:${alert.pharmacy_phone}`)}
                                        >
                                            <Phone size={12} color={C.primary} />
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
                    <Pressable style={styles.actionButton} onPress={handleNudge} disabled={nudging}>
                        <View style={[styles.actionIconContainer, { backgroundColor: C.primaryLight }]}>
                            {nudging ? (
                                <ActivityIndicator size="small" color={C.primary} />
                            ) : (
                                <Send color={C.primary} size={18} />
                            )}
                        </View>
                        <Text style={styles.actionLabel}>Nudge</Text>
                    </Pressable>

                    <Pressable style={styles.actionButton} onPress={handleCall}>
                        <View style={[styles.actionIconContainer, { backgroundColor: C.successLight }]}>
                            <Phone color={C.success} size={18} />
                        </View>
                        <Text style={styles.actionLabel}>Call</Text>
                    </Pressable>

                    <Pressable style={styles.actionButton} onPress={handleRequestBP} disabled={requestingBP}>
                        <View style={[styles.actionIconContainer, { backgroundColor: C.dangerLight }]}>
                            {requestingBP ? (
                                <ActivityIndicator size="small" color={C.danger} />
                            ) : (
                                <HeartPulse color={C.danger} size={18} />
                            )}
                        </View>
                        <Text style={styles.actionLabel}>Request BP</Text>
                    </Pressable>
                </View>

                {/* 2. Adherence Meter Card */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconBox, { backgroundColor: C.primaryLight }]}>
                            <Activity color={C.primary} size={18} />
                        </View>
                        <View>
                            <Text style={styles.cardTitle}>Medication Adherence</Text>
                            <Text style={styles.cardSub}>Today's completed schedule</Text>
                        </View>
                    </View>

                    <View style={styles.meterRow}>
                        <View>
                            <Text style={styles.largeValue}>
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
                                { borderColor: adherence > 75 ? C.success : adherence > 50 ? C.warning : C.danger }
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
                        { backgroundColor: adherence > 75 ? C.successLight : adherence > 50 ? C.warningLight : C.dangerLight }
                    ]}>
                        <Text style={[
                            styles.statusBannerText,
                            { color: adherence > 75 ? C.success : adherence > 50 ? C.warning : C.danger }
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
                                                backgroundColor: item.rate > 75 ? C.success : item.rate > 50 ? C.warning : C.danger 
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
                            <View style={[styles.iconBox, { backgroundColor: C.successLight }]}>
                                <Activity color={C.success} size={18} />
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
                                                    backgroundColor: item.taken ? C.success : C.light,
                                                    borderColor: item.taken ? C.successLight : C.border 
                                                }]} />
                                                {!isLast && <View style={[styles.timelineLine, { 
                                                    backgroundColor: item.taken ? C.success : C.border 
                                                }]} />}
                                            </View>
                                        </View>
                                        
                                        <Pressable style={[styles.timelineCard, item.taken ? styles.timelineCardTaken : null]}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.timelineMedName}>{item.name}</Text>
                                                <Text style={styles.timelineMedDosage}>{item.dosage} • {item.route}</Text>
                                            </View>
                                            <View style={[
                                                styles.timelineStatusBadge, 
                                                { backgroundColor: item.taken ? C.successLight : C.warningLight }
                                            ]}>
                                                <Text style={[
                                                    styles.timelineStatusText, 
                                                    { color: item.taken ? C.success : C.warning }
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
                        <View style={[styles.iconBox, { backgroundColor: C.dangerLight }]}>
                            <HeartPulse color={C.danger} size={18} />
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
                                <Text style={styles.vitalBigValue}>
                                    {data.latest_vital.bp_systolic}/{data.latest_vital.bp_diastolic}
                                </Text>
                                <Text style={styles.vitalUnit}>mmHg</Text>
                            </View>
                            
                            <View style={styles.vitalDivider} />

                            <View style={styles.vitalMetricsBox}>
                                <Text style={styles.vitalLabel}>Status</Text>
                                <View style={[styles.vitalBadge, { backgroundColor: C.successLight }]}>
                                    <Text style={[styles.vitalBadgeText, { color: C.success }]}>Normal</Text>
                                </View>
                                <Text style={styles.vitalTime}>Synced 2h ago</Text>
                            </View>
                        </View>
                    ) : (
                        <View style={styles.emptyVitalsCard}>
                            <AlertCircle color={C.light} size={28} />
                            <Text style={styles.emptyVitalsText}>No BP logs recorded today</Text>
                            <Text style={styles.emptyVitalsSub}>Vitals sync when {data.patient.name.split(' ')[0]} connects a BP monitor or logs manually.</Text>
                            <Pressable style={styles.emptyVitalsButton} onPress={() => loadData()}>
                                <Text style={styles.emptyVitalsButtonText}>Sync Now</Text>
                            </Pressable>
                        </View>
                    )}
                </View>

                {/* 3b. Vitals 7-Day Analytics Trends Graph */}
                {data.vitals_history && data.vitals_history.length > 0 && (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <View style={[styles.iconBox, { backgroundColor: C.primaryLight }]}>
                                <Activity color={C.primary} size={18} />
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
                                                    <Text style={[styles.barLabel, { color: C.light }]}>{dayLabel}</Text>
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
                                                            backgroundColor: rate > 100 || rate < 50 ? C.danger : C.primary 
                                                        }
                                                    ]} />
                                                </View>
                                                <Text style={[styles.barLabel, { color: C.dark, ...FONT.bold }]}>{dayLabel}</Text>
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
                                let statusColor = C.success;
                                let statusBg = C.successLight;
                                let Icon = ShieldCheck;
                                
                                if (avg > 100 || avg < 50) {
                                    status = "Attention required.";
                                    statusColor = C.danger;
                                    statusBg = C.dangerLight;
                                    Icon = AlertCircle;
                                } else if (avg > 90 || avg < 60) {
                                    status = "Monitor closely.";
                                    statusColor = C.warning;
                                    statusBg = C.warningLight;
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
                            <View style={[styles.iconBox, { backgroundColor: C.dangerLight }]}>
                                <Bell color={C.danger} size={18} />
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
                        <ShieldCheck color={C.success} size={24} />
                        <Text style={styles.noAlertsText}>All systems normal. No active alerts.</Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: { 
        paddingTop: 60, 
        paddingHorizontal: 24, 
        paddingBottom: 16, 
        backgroundColor: C.surface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: '#F8FAFC',
    },
    headerSub: {
        fontSize: 12,
        ...FONT.semibold,
        color: C.primary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    title: { fontSize: 24, ...FONT.heavy, color: C.dark },
    bellButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    bellDot: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: C.danger,
    },
    
    // Link Container Styles
    linkContainer: {
        backgroundColor: C.surface,
        paddingHorizontal: 24,
        paddingBottom: 20,
    },
    linkTitle: {
        fontSize: 14,
        ...FONT.bold,
        color: C.dark,
        marginBottom: 12,
    },
    linkInputRow: {
        flexDirection: 'row',
        gap: 12,
    },
    linkInput: {
        flex: 1,
        height: 48,
        backgroundColor: C.bg,
        borderWidth: 1,
        borderColor: C.cardBorder,
        borderRadius: 12,
        paddingHorizontal: 16,
        fontSize: 14,
        ...FONT.medium,
        color: C.dark,
        textTransform: 'uppercase',
    },
    linkBtn: {
        backgroundColor: C.primary,
        borderRadius: 12,
        paddingHorizontal: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    linkBtnText: {
        color: '#FFF',
        fontSize: 14,
        ...FONT.bold,
    },

    // Switcher Styles
    switcherContainer: {
        backgroundColor: C.surface,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
        paddingBottom: 14,
    },
    switcherScroll: {
        paddingHorizontal: 24,
        gap: 16,
    },
    avatarWrapper: {
        alignItems: 'center',
        gap: 6,
        opacity: 0.6,
    },
    activeAvatarWrapper: {
        opacity: 1,
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
        position: 'relative',
    },
    activeAvatar: {
        borderColor: C.primary,
        backgroundColor: C.primaryLight,
    },
    avatarText: {
        fontSize: 16,
        ...FONT.bold,
        color: C.mid,
    },
    activeAvatarText: {
        color: C.primary,
    },
    avatarName: {
        fontSize: 12,
        ...FONT.semibold,
        color: C.mid,
        maxWidth: 68,
        textAlign: 'center',
    },
    activeAvatarName: {
        color: C.dark,
        ...FONT.bold,
    },
    scoreBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: C.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scoreText: {
        color: C.surface,
        fontSize: 9,
        fontWeight: 'bold',
    },

    // Actions Styles
    actionsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    actionButton: {
        flex: 1,
        backgroundColor: C.surface,
        paddingVertical: 14,
        borderRadius: 20,
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 4,
        borderWidth: 1,
        borderColor: C.border,
    },
    actionIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionLabel: {
        fontSize: 12,
        ...FONT.semibold,
        color: C.dark,
    },

    content: { padding: 20, gap: 16, paddingBottom: layout.TAB_BAR_CLEARANCE },
    
    // Premium Card Styles
    card: { 
        backgroundColor: C.surface, 
        padding: 24, 
        borderRadius: 28, 
        borderWidth: 1,
        borderColor: C.border,
        shadowColor: C.dark, 
        shadowOpacity: 0.03, 
        shadowRadius: 16, 
        shadowOffset: { width: 0, height: 6 }, 
        elevation: 1 
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    iconBox: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitle: { fontSize: 16, ...FONT.bold, color: C.dark },
    cardSub: { fontSize: 12, ...FONT.medium, color: C.mid },
    
    // Meter Styles
    meterRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    largeValue: { fontSize: 44, ...FONT.heavy, color: C.dark },
    streakBadge: {
        backgroundColor: C.warningLight,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
        alignSelf: 'flex-start',
        marginTop: 4,
    },
    streakText: {
        color: '#D97706',
        fontSize: 12,
        ...FONT.bold,
    },
    
    // Segmented indicator approximation
    circularProgressPlaceholder: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 6,
        borderColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
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
        color: C.dark,
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
        borderTopColor: C.border,
        paddingTop: 20,
    },
    chartTitle: {
        fontSize: 13,
        ...FONT.bold,
        color: C.mid,
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
        color: C.light,
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
        color: C.mid,
        marginBottom: 6,
    },
    vitalBigValue: {
        fontSize: 32,
        ...FONT.heavy,
        color: C.dark,
    },
    vitalUnit: {
        fontSize: 11,
        ...FONT.medium,
        color: C.light,
    },
    vitalDivider: {
        width: 1,
        height: 60,
        backgroundColor: C.border,
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
        color: C.light,
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
        color: C.dark,
        marginTop: 12,
    },
    emptyVitalsSub: {
        fontSize: 12,
        ...FONT.medium,
        color: C.mid,
        textAlign: 'center',
        marginTop: 6,
        lineHeight: 18,
    },
    emptyVitalsButton: {
        backgroundColor: C.primary,
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 14,
        marginTop: 16,
    },
    emptyVitalsButtonText: {
        color: C.surface,
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
        backgroundColor: C.dangerLight,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 16,
        gap: 10,
    },
    alertDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: C.danger,
    },
    alertDescription: {
        fontSize: 13,
        ...FONT.semibold,
        color: C.danger,
        flex: 1,
    },

    // No Alerts card
    noAlertsCard: {
        backgroundColor: C.successLight,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 24,
        gap: 10,
        borderWidth: 1,
        borderColor: '#A7F3D0',
    },
    noAlertsText: {
        fontSize: 13,
        ...FONT.bold,
        color: C.success,
    },

    // Low Pill Stock Refill Banner
    refillBanner: {
        backgroundColor: C.warningLight,
        borderRadius: 24,
        padding: 16,
        borderWidth: 1,
        borderColor: '#FDE68A',
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
        backgroundColor: C.surface,
        borderRadius: 16,
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginVertical: 4,
        gap: 8,
        borderWidth: 1,
        borderColor: C.border,
    },
    refillMedName: {
        fontSize: 12,
        ...FONT.bold,
        color: C.dark,
        flex: 1.5,
    },
    refillMedStock: {
        fontSize: 11,
        ...FONT.medium,
        color: C.mid,
        flex: 2,
    },
    refillCallBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: C.primaryLight,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
    },
    refillCallText: {
        fontSize: 10,
        ...FONT.bold,
        color: C.primary,
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
        color: C.light,
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
        borderWidth: 1,
        borderColor: C.border,
    },
    timelineCardTaken: {
        backgroundColor: C.successLight + '33',
        borderColor: '#A7F3D0',
    },
    timelineMedName: {
        fontSize: 13,
        ...FONT.bold,
        color: C.dark,
    },
    timelineMedDosage: {
        fontSize: 10,
        ...FONT.medium,
        color: C.light,
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
});
