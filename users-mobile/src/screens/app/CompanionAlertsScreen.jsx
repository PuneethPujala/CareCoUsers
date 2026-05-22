import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { apiService } from '../../lib/api';
import { Bell, CheckCircle } from 'lucide-react-native';

const C = {
    bg: '#F8FAFC',
    surface: '#FFFFFF',
    primary: '#0EA5E9',
    dark: '#0F172A',
    mid: '#475569',
    muted: '#94A3B8',
    danger: '#EF4444',
    success: '#22C55E',
};

const FONT = {
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export default function CompanionAlertsScreen() {
    const [alerts, setAlerts] = useState([]);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = async () => {
        try {
            const res = await apiService.companion.getPatientStatus();
            setAlerts(res.data.recent_alerts || []);
        } catch (err) {
            console.warn('Failed to load alerts', err);
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

    const acknowledgeAlert = async (id) => {
        try {
            await apiService.companion.acknowledgeAlert(id);
            setAlerts(alerts.filter(a => a._id !== id));
        } catch (err) {
            console.warn('Failed to acknowledge alert', err);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Care Alerts</Text>
            </View>

            <ScrollView 
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            >
                {alerts.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Bell color={C.muted} size={48} />
                        <Text style={styles.emptyText}>All good! No recent alerts.</Text>
                    </View>
                ) : (
                    alerts.map(a => (
                        <View key={a._id} style={styles.card}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.cardTitle}>Attention Needed</Text>
                                <Text style={styles.cardDesc}>{a.description}</Text>
                            </View>
                            <Pressable style={styles.ackBtn} onPress={() => acknowledgeAlert(a._id)}>
                                <CheckCircle color="#FFF" size={20} />
                                <Text style={styles.ackText}>Got it</Text>
                            </Pressable>
                        </View>
                    ))
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, backgroundColor: C.surface },
    title: { fontSize: 24, ...FONT.heavy, color: C.dark },
    content: { padding: 20, gap: 16, flexGrow: 1 },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.7 },
    emptyText: { fontSize: 16, ...FONT.medium, color: C.mid, marginTop: 16 },
    card: { 
        backgroundColor: '#FEF2F2', padding: 20, borderRadius: 24, 
        flexDirection: 'row', alignItems: 'center', gap: 16,
        borderWidth: 1, borderColor: '#FCA5A5'
    },
    cardTitle: { fontSize: 16, ...FONT.bold, color: C.danger, marginBottom: 4 },
    cardDesc: { fontSize: 14, ...FONT.medium, color: '#7F1D1D' },
    ackBtn: { 
        backgroundColor: C.success, paddingHorizontal: 12, paddingVertical: 8, 
        borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6
    },
    ackText: { color: '#FFF', fontSize: 14, ...FONT.bold }
});
