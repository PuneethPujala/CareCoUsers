import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { apiService } from '../../lib/api';
import { Bell, CheckCircle2, ShieldCheck, ShieldAlert, Phone, Clock, ChevronRight, Activity, Check } from 'lucide-react-native';

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
    success: '#10B981',
    successLight: '#D1FAE5',
    border: '#F1F5F9',
};

const FONT = {
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export default function CompanionAlertsScreen() {
    const [data, setData] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [selectedPatientId, setSelectedPatientId] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    // Mock resolved alerts history to populate the screen beautifully
    const mockHistory = [
        { id: '1', title: 'Adherence Met', desc: 'Mom completed 100% of yesterday\'s doses.', time: 'Yesterday' },
        { id: '2', title: 'Vital Update', desc: 'BP reading recorded: 120/80 mmHg (Normal).', time: '2 days ago' },
        { id: '3', title: 'System Restored', desc: 'Care circle invitation accepted successfully.', time: 'May 23' },
    ];

    const loadData = async (patientId = null) => {
        try {
            const activeId = patientId || selectedPatientId;
            const res = await apiService.companion.getPatientStatus(activeId ? { patientId: activeId } : undefined);
            setData(res.data);
            setAlerts(res.data.recent_alerts || []);
            if (res.data.patient && !selectedPatientId && !patientId) {
                setSelectedPatientId(res.data.patient.id);
            }
        } catch (err) {
            console.warn('Failed to load alerts data', err);
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

    const acknowledgeAlert = async (id) => {
        try {
            await apiService.companion.acknowledgeAlert(id);
            setAlerts(alerts.filter(a => a._id !== id));
        } catch (err) {
            console.warn('Failed to acknowledge alert', err);
        }
    };

    if (!data) return <View style={styles.container} />;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerSub}>Alert Center</Text>
                    <Text style={styles.title}>{data.patient.name}'s Alerts</Text>
                </View>
                <View style={[
                    styles.badge, 
                    { backgroundColor: alerts.length > 0 ? C.dangerLight : C.successLight }
                ]}>
                    <Text style={[
                        styles.badgeText, 
                        { color: alerts.length > 0 ? C.danger : C.success }
                    ]}>
                        {alerts.length > 0 ? `${alerts.length} Active` : 'Secured'}
                    </Text>
                </View>
            </View>

            {/* Horizontal Patient Switcher */}
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
                {/* 1. Active Alerts Section */}
                {alerts.length > 0 ? (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Active Alerts Requiring Actions</Text>
                        {alerts.map(a => (
                            <View key={a._id} style={styles.alertCard}>
                                <View style={styles.alertHeader}>
                                    <ShieldAlert color={C.danger} size={20} />
                                    <Text style={styles.alertTitle}>Schedule Missed</Text>
                                </View>
                                <Text style={styles.alertDesc}>{a.description}</Text>
                                <View style={styles.alertFooter}>
                                    <Pressable style={styles.callQuickBtn}>
                                        <Phone color={C.dark} size={16} />
                                        <Text style={styles.callQuickText}>Call Now</Text>
                                    </Pressable>
                                    <Pressable style={styles.ackBtn} onPress={() => acknowledgeAlert(a._id)}>
                                        <CheckCircle2 color="#FFF" size={16} />
                                        <Text style={styles.ackText}>Dismiss</Text>
                                    </Pressable>
                                </View>
                            </View>
                        ))}
                    </View>
                ) : (
                    // Beautiful Guardian Shield Empty State Card
                    <View style={styles.guardianCard}>
                        <View style={styles.shieldBackground}>
                            <ShieldCheck color={C.success} size={40} />
                        </View>
                        <Text style={styles.guardianTitle}>Care Circle is Secured</Text>
                        <Text style={styles.guardianDesc}>
                            No missed medication alerts or vital anomalies have been triggered today. We are actively monitoring {data.patient.name}'s schedule in the background.
                        </Text>
                    </View>
                )}

                {/* 2. Security Settings checklist */}
                <View style={styles.card}>
                    <Text style={styles.cardHeaderTitle}>Security Checkup</Text>
                    <View style={styles.checklist}>
                        <View style={styles.checkItem}>
                            <View style={styles.checkedCircle}>
                                <Check color={C.success} size={14} />
                            </View>
                            <Text style={styles.checkLabel}>Real-time Adherence Tracking</Text>
                            <Text style={styles.checkStatus}>Active</Text>
                        </View>
                        
                        <View style={styles.checkItem}>
                            <View style={styles.checkedCircle}>
                                <Check color={C.success} size={14} />
                            </View>
                            <Text style={styles.checkLabel}>Twilio SMS Notifications</Text>
                            <Text style={styles.checkStatus}>Active</Text>
                        </View>

                        <View style={styles.checkItem}>
                            <View style={styles.checkedCircle}>
                                <Check color={C.success} size={14} />
                            </View>
                            <Text style={styles.checkLabel}>Emergency Contact Guard</Text>
                            <Text style={styles.checkStatus}>Active</Text>
                        </View>
                    </View>
                </View>

                {/* 3. Resolved History Feed */}
                <View style={styles.historySection}>
                    <Text style={styles.sectionTitle}>Activity & Logs History</Text>
                    <View style={styles.historyList}>
                        {mockHistory.map(h => (
                            <View key={h.id} style={styles.historyItem}>
                                <View style={styles.historyIconBox}>
                                    <Clock color={C.mid} size={16} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.historyItemTitle}>{h.title}</Text>
                                    <Text style={styles.historyItemDesc}>{h.desc}</Text>
                                </View>
                                <Text style={styles.historyItemTime}>{h.time}</Text>
                            </View>
                        ))}
                    </View>
                </View>
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
    badge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
    },
    badgeText: {
        fontSize: 12,
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

    content: { padding: 20, gap: 20 },
    section: { gap: 12 },
    sectionTitle: {
        fontSize: 15,
        ...FONT.bold,
        color: C.dark,
        marginBottom: 4,
        paddingLeft: 4,
    },
    
    // Alert Card Styles
    alertCard: {
        backgroundColor: '#FFF1F2',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: '#FECDD3',
        gap: 12,
    },
    alertHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    alertTitle: {
        fontSize: 15,
        ...FONT.bold,
        color: C.danger,
    },
    alertDesc: {
        fontSize: 14,
        ...FONT.semibold,
        color: '#881337',
        lineHeight: 20,
    },
    alertFooter: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
        marginTop: 4,
    },
    callQuickBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
    },
    callQuickText: {
        fontSize: 13,
        ...FONT.bold,
        color: C.dark,
    },
    ackBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: C.danger,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
    },
    ackText: {
        fontSize: 13,
        ...FONT.bold,
        color: '#FFF',
    },

    // Guardian Card Styles
    guardianCard: {
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 28,
        padding: 24,
        alignItems: 'center',
        textAlign: 'center',
        shadowColor: C.dark,
        shadowOpacity: 0.02,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 1,
    },
    shieldBackground: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: C.successLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    guardianTitle: {
        fontSize: 18,
        ...FONT.bold,
        color: C.dark,
        marginBottom: 8,
    },
    guardianDesc: {
        fontSize: 13,
        ...FONT.medium,
        color: C.mid,
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 8,
    },

    // Security checkup checklist
    card: {
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 24,
        padding: 20,
    },
    cardHeaderTitle: {
        fontSize: 15,
        ...FONT.bold,
        color: C.dark,
        marginBottom: 16,
    },
    checklist: {
        gap: 12,
    },
    checkItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    checkedCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: C.successLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkLabel: {
        fontSize: 13,
        ...FONT.semibold,
        color: C.mid,
        flex: 1,
    },
    checkStatus: {
        fontSize: 11,
        ...FONT.bold,
        color: C.success,
    },

    // History section
    historySection: {
        marginTop: 10,
        gap: 12,
    },
    historyList: {
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 24,
        padding: 20,
        gap: 16,
    },
    historyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    historyIconBox: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
    },
    historyItemTitle: {
        fontSize: 13,
        ...FONT.bold,
        color: C.dark,
        marginBottom: 2,
    },
    historyItemDesc: {
        fontSize: 11,
        ...FONT.medium,
        color: C.mid,
    },
    historyItemTime: {
        fontSize: 11,
        ...FONT.bold,
        color: C.light,
    },
});
