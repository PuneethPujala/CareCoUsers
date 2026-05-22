import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
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

    const loadData = async () => {
        try {
            const res = await apiService.companion.getPatientStatus();
            setData(res.data);
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

    if (!data) return <View style={styles.container} />;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{data.patient.name}'s Health</Text>
            </View>

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
    header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, backgroundColor: C.surface },
    title: { fontSize: 24, ...FONT.heavy, color: C.dark },
    content: { padding: 20, gap: 16 },
    card: { backgroundColor: C.surface, padding: 20, borderRadius: 24, shadowColor: C.dark, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    cardTitle: { fontSize: 16, ...FONT.bold, color: C.mid },
    largeValue: { fontSize: 40, ...FONT.heavy, color: C.dark },
    cardSub: { fontSize: 14, ...FONT.medium, color: C.mid, marginTop: 4 },
    valueText: { fontSize: 18, ...FONT.bold, color: C.dark },
    alertText: { fontSize: 14, ...FONT.medium, color: C.danger, marginBottom: 6 },
});
