import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Platform, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Phone, CheckCircle2, ChevronRight, Activity, AlertCircle } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../lib/api';
import { colors } from '../../theme';

export default function CallerHomeScreen({ navigation }) {
    const { displayName } = useAuth();
    const [patients, setPatients] = useState([]);
    const [summary, setSummary] = useState({ total: 0, called: 0, pending: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchTodayPatients();
    }, []);

    const fetchTodayPatients = async () => {
        try {
            setLoading(true);
            setError('');
            const res = await apiService.callers.getTodayPatients();
            setPatients(res.data.patients || []);
            setSummary(res.data.summary || { total: 0, called: 0, pending: 0 });
        } catch (err) {
            console.warn('Failed to fetch today patients:', err.message);
            setError('Failed to load patient list');
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'completed': return colors.success;
            case 'attempted': return colors.warning;
            case 'missed': return colors.danger;
            case 'refused': return colors.danger;
            case 'escalated': return '#9333EA';
            case 'pending':
            default: return '#94A3B8';
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <LinearGradient
                    colors={['#0A2463', '#1E5FAD']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.headerGradient}
                >
                    <View style={styles.radialGlow} />

                    <Text style={styles.greeting}>Caller Desk: {displayName}</Text>
                    <Text style={styles.dateLabel}>
                        Today's Patients — {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>

                    <View style={styles.progressContainer}>
                        <View style={styles.progressTextRow}>
                            <Text style={styles.progressTxt}>{summary.called} / {summary.total} Called</Text>
                            <Text style={styles.progressPct}>
                                {summary.total > 0 ? Math.round((summary.called / summary.total) * 100) : 0}%
                            </Text>
                        </View>
                        <View style={styles.progressBarBg}>
                            <View 
                                style={[
                                    styles.progressBarFill, 
                                    { width: `${summary.total > 0 ? (summary.called / summary.total) * 100 : 0}%` }
                                ]} 
                            />
                        </View>
                    </View>
                </LinearGradient>
            </View>

            {loading ? (
                <View style={[styles.listContent, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
                    <ActivityIndicator size="large" color={colors.accent} />
                </View>
            ) : error ? (
                <View style={[styles.listContent, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
                    <AlertCircle size={32} color={colors.danger} style={{ marginBottom: 12 }} />
                    <Text style={{ color: colors.danger, fontWeight: '600' }}>{error}</Text>
                    <Pressable onPress={fetchTodayPatients} style={{ marginTop: 12 }}><Text style={{ color: colors.accent, fontWeight: '700' }}>Retry</Text></Pressable>
                </View>
            ) : (

            <FlatList
                data={patients}
                keyExtractor={item => item.id || item._id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                   <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
                       <CheckCircle2 size={48} color={colors.success} style={{ marginBottom: 16, opacity: 0.5 }} />
                       <Text style={{ fontSize: 16, color: '#64748B', fontWeight: '600' }}>No patients assigned for today.</Text>
                   </View>
                }
                renderItem={({ item }) => {
                    const statusColor = getStatusColor(item.call_status);
                    const primaryCondition = item.conditions?.[0]?.name || 'Routine Care';
                    return (
                        <Pressable style={styles.card}>
                            <View style={[styles.cardAccent, { backgroundColor: statusColor }]} />

                            <View style={styles.cardHeader}>
                                <View>
                                    <Text style={styles.patientName}>{item.name}</Text>
                                    <Text style={styles.patientMeta}>{item.age || '--'} yrs • {primaryCondition}</Text>
                                </View>
                                <View style={[styles.statusChip, { backgroundColor: statusColor + '15', borderColor: statusColor }]}>
                                    <Text style={[styles.statusTxt, { color: statusColor }]}>{item.call_status}</Text>
                                </View>
                            </View>

                            <View style={styles.cardActions}>
                                <Pressable style={styles.actionBtnPrimary}>
                                    <Phone size={14} color="#FFF" />
                                    <Text style={styles.actionBtnPrimaryTxt}>Log Call</Text>
                                </Pressable>

                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <Pressable style={styles.actionBtnOutlined}>
                                        <Text style={styles.actionBtnTxt}>No Answer</Text>
                                    </Pressable>
                                    <Pressable style={styles.actionBtnDanger}>
                                        <Text style={styles.actionBtnDangerTxt}>Refused</Text>
                                    </Pressable>
                                </View>
                            </View>
                        </Pressable>
                    );
                }}
            />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F7FB' },

    header: { paddingBottom: 16 },
    headerGradient: {
        paddingTop: Platform.OS === 'ios' ? 70 : 50,
        paddingBottom: 32, paddingHorizontal: 20,
        borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 6,
        overflow: 'hidden',
    },
    radialGlow: { position: 'absolute', right: -50, top: -20, width: 250, height: 250, borderRadius: 125, backgroundColor: 'rgba(58,134,255,0.4)', blurRadius: 40 },

    greeting: { fontSize: 13, color: '#BDD4EE', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, zIndex: 2 },
    dateLabel: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginTop: 4, marginBottom: 20, zIndex: 2 },

    progressContainer: { marginTop: 4, zIndex: 2 },
    progressTextRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    progressTxt: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
    progressPct: { color: colors.accent, fontSize: 14, fontWeight: '700' },
    progressBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3 },
    progressBarFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 3 },

    listContent: { paddingHorizontal: 16, paddingBottom: 40 },
    card: {
        backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, paddingLeft: 20, marginBottom: 12, overflow: 'hidden',
        borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1,
    },
    cardAccent: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4 },

    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    patientName: { fontSize: 16, fontWeight: '700', color: '#1A202C' },
    patientMeta: { fontSize: 13, color: '#64748B', marginTop: 3 },
    statusChip: {
        borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
    },
    statusTxt: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },

    cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    actionBtnPrimary: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6,
    },
    actionBtnPrimaryTxt: { color: '#FFF', fontSize: 13, fontWeight: '600' },

    actionBtnOutlined: {
        borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 6,
    },
    actionBtnTxt: { color: '#4A5568', fontSize: 13, fontWeight: '600' },

    actionBtnDanger: {
        backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 6,
    },
    actionBtnDangerTxt: { color: colors.danger, fontSize: 13, fontWeight: '600' },
});
