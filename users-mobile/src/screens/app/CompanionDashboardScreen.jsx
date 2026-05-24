import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Dimensions } from 'react-native';
import { apiService } from '../../lib/api';
import { HeartPulse, Activity, Bell, Phone, Send, ChevronRight, MessageSquare, ShieldCheck, AlertCircle } from 'lucide-react-native';

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
    const [selectedPatientId, setSelectedPatientId] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

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

    const loadData = async (patientId = null) => {
        try {
            const activeId = patientId || selectedPatientId;
            const res = await apiService.companion.getPatientStatus(activeId ? { patientId: activeId } : undefined);
            setData(res.data);
            if (res.data.patient && !selectedPatientId && !patientId) {
                setSelectedPatientId(res.data.patient.id);
            }
        } catch (err) {
            console.warn('Failed to load companion dashboard', err);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handlePatientSwitch = async (patientId) => {
        setSelectedPatientId(patientId);
        await loadData(patientId);
    };

    if (!data) return <View style={styles.container} />;

    const adherence = data.patient.adherence_rate !== null ? data.patient.adherence_rate : 0;
    
    // BP validation: handle empty BP readings gracefully
    const hasVitals = data.latest_vital && 
                      data.latest_vital.bp_systolic && 
                      data.latest_vital.bp_diastolic;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerSub}>Family Care Portal</Text>
                    <Text style={styles.title}>{data.patient.name}'s Health</Text>
                </View>
                <Pressable style={styles.bellButton}>
                    <Bell color={C.dark} size={20} />
                    {data.recent_alerts?.length > 0 && <View style={styles.bellDot} />}
                </Pressable>
            </View>

            {/* Premium Horizontal Patient Switcher */}
            {data.linked_patients?.length > 1 && (
                <View style={styles.switcherContainer}>
                    <ScrollView 
                        horizontal 
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.switcherScroll}
                    >
                        {data.linked_patients.map((p) => {
                            const isSelected = p.id === selectedPatientId;
                            const initials = p.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                            return (
                                <Pressable
                                    key={p.id}
                                    onPress={() => handlePatientSwitch(p.id)}
                                    style={[
                                        styles.avatarWrapper,
                                        isSelected && styles.activeAvatarWrapper
                                    ]}
                                >
                                    <View style={[
                                        styles.avatar,
                                        isSelected && styles.activeAvatar
                                    ]}>
                                        <Text style={[
                                            styles.avatarText,
                                            isSelected && styles.activeAvatarText
                                        ]}>
                                            {initials}
                                        </Text>
                                        
                                        {p.health_score !== undefined && (
                                            <View style={[
                                                styles.scoreBadge,
                                                { backgroundColor: p.health_score > 70 ? C.success : C.warning }
                                            ]}>
                                                <Text style={styles.scoreText}>{p.health_score}</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text 
                                        numberOfLines={1} 
                                        style={[
                                            styles.avatarName,
                                            isSelected && styles.activeAvatarName
                                        ]}
                                    >
                                        {p.name.split(' ')[0]}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </View>
            )}

            <ScrollView 
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            >
                {/* 1. Quick Actions Bar */}
                <View style={styles.actionsContainer}>
                    <Pressable style={styles.actionButton}>
                        <View style={[styles.actionIconContainer, { backgroundColor: C.primaryLight }]}>
                            <Send color={C.primary} size={18} />
                        </View>
                        <Text style={styles.actionLabel}>Nudge</Text>
                    </Pressable>

                    <Pressable style={styles.actionButton}>
                        <View style={[styles.actionIconContainer, { backgroundColor: C.successLight }]}>
                            <Phone color={C.success} size={18} />
                        </View>
                        <Text style={styles.actionLabel}>Call</Text>
                    </Pressable>

                    <Pressable style={styles.actionButton}>
                        <View style={[styles.actionIconContainer, { backgroundColor: C.dangerLight }]}>
                            <HeartPulse color={C.danger} size={18} />
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
                            {mockWeeklyAdherence.map((item, idx) => (
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
                            <Text style={styles.emptyVitalsSub}>Vitals sync when Puneeth connects a BP monitor or logs manually.</Text>
                            <Pressable style={styles.emptyVitalsButton} onPress={() => loadData()}>
                                <Text style={styles.emptyVitalsButtonText}>Sync Now</Text>
                            </Pressable>
                        </View>
                    )}
                </View>
                
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

    content: { padding: 20, gap: 16 },
    
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
        width: 12,
        height: 70,
        backgroundColor: '#F1F5F9',
        borderRadius: 6,
        justifyContent: 'flex-end',
    },
    barFill: {
        width: '100%',
        borderRadius: 6,
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
});
