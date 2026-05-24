import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { apiService } from '../../lib/api';
import { HeartPulse, Activity, Bell } from 'lucide-react-native';

const C = {
    bg: '#F8FAFC',
    surface: '#FFFFFF',
    primary: '#0EA5E9',
    dark: '#0F172A',
    mid: '#475569',
    danger: '#EF4444',
    border: '#E2E8F0',
    accent: '#38BDF8',
    activeBg: '#E0F2FE',
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

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{data.patient.name}'s Health</Text>
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
                                                { backgroundColor: p.health_score > 70 ? '#10B981' : '#F59E0B' }
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
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Activity color={C.primary} size={20} />
                        <Text style={styles.cardTitle}>Adherence Rate</Text>
                    </View>
                    <Text style={styles.largeValue}>
                        {data.patient.adherence_rate !== null ? `${data.patient.adherence_rate}%` : 'N/A'}
                    </Text>
                    <Text style={styles.cardSub}>Current Streak: {data.patient.current_streak} days</Text>
                </View>

                {data.latest_vital && (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <HeartPulse color={C.danger} size={20} />
                            <Text style={styles.cardTitle}>Latest Vitals</Text>
                        </View>
                        <Text style={styles.valueText}>
                            BP: {data.latest_vital.bp_systolic}/{data.latest_vital.bp_diastolic}
                        </Text>
                    </View>
                )}
                
                {data.recent_alerts?.length > 0 && (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <Bell color={C.danger} size={20} />
                            <Text style={styles.cardTitle}>Recent Alerts</Text>
                        </View>
                        {data.recent_alerts.map(a => (
                            <Text key={a._id} style={styles.alertText}>• {a.description}</Text>
                        ))}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 12, backgroundColor: C.surface },
    title: { fontSize: 24, ...FONT.heavy, color: C.dark },
    
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
        opacity: 0.65,
    },
    activeAvatarWrapper: {
        opacity: 1,
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
        position: 'relative',
    },
    activeAvatar: {
        borderColor: C.primary,
        backgroundColor: C.activeBg,
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

    content: { padding: 24, gap: 16 },
    card: { backgroundColor: C.surface, padding: 20, borderRadius: 24, shadowColor: C.dark, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    cardTitle: { fontSize: 16, ...FONT.bold, color: C.mid },
    largeValue: { fontSize: 40, ...FONT.heavy, color: C.dark },
    cardSub: { fontSize: 14, ...FONT.medium, color: C.mid, marginTop: 4 },
    valueText: { fontSize: 18, ...FONT.bold, color: C.dark },
    alertText: { fontSize: 14, ...FONT.medium, color: C.danger, marginBottom: 6 },
});
