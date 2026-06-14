import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
    StatusBar, Platform, ScrollView, RefreshControl
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ArrowLeft, Bell, CheckCircle2, ChevronRight, Activity, Clock,
    Pill, MessageSquare, AlertTriangle, Phone, ExternalLink
} from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import usePatientStore from '../../store/usePatientStore';
import { apiService, handleApiError } from '../../lib/api';
import AlertManager from '../../utils/AlertManager';

export default function InterventionCenterScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const companionSelectedPatientId = usePatientStore(state => state.companionSelectedPatientId);
    
    const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'history'
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    
    const [pendingInterventions, setPendingInterventions] = useState([]);
    const [completedFeed, setCompletedFeed] = useState([]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const params = companionSelectedPatientId ? { patientId: companionSelectedPatientId } : {};
            const res = await apiService.companion.getInterventions(params);
            
            setPendingInterventions(res.data.active_interventions || []);
            setCompletedFeed(res.data.completed_feed || []);
        } catch (err) {
            console.warn('[InterventionCenter] Failed to fetch:', err.message);
            AlertManager.alert('Error', 'Could not load interventions.', [{ text: 'OK' }], { type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            const params = companionSelectedPatientId ? { patientId: companionSelectedPatientId } : {};
            const res = await apiService.companion.getInterventions(params);
            setPendingInterventions(res.data.active_interventions || []);
            setCompletedFeed(res.data.completed_feed || []);
        } catch (err) {
            console.warn('[InterventionCenter] Refresh failed:', err.message);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [companionSelectedPatientId]);

    const handleCompleteIntervention = async (interventionId, type) => {
        try {
            const res = await apiService.companion.completeIntervention({ interventionId });
            if (res.data) {
                AlertManager.alert(
                    'Success',
                    getSuccessMessage(type),
                    [{ text: 'OK' }],
                    { type: 'success' }
                );
                // Refresh data
                handleRefresh();
            }
        } catch (err) {
            console.warn('[InterventionCenter] Failed to complete:', err.message);
            const apiErr = handleApiError(err);
            AlertManager.alert('Error', apiErr.message, [{ text: 'OK' }], { type: 'error' });
        }
    };

    const getSuccessMessage = (type) => {
        switch (type) {
            case 'medication_reminder':
                return 'Medication reminder nudge sent successfully to the patient.';
            case 'bp_request':
                return 'Vitals log request sent successfully to the patient.';
            case 'checkin_call':
                return 'Wellness check-in call registered successfully.';
            case 'escalation_contact':
                return 'Escalation coordinator contact recorded.';
            default:
                return 'Action completed successfully.';
        }
    };

    const getPriorityColor = (score) => {
        if (score >= 80) return colors.danger;
        if (score >= 50) return colors.warning;
        return colors.primary;
    };

    const getPriorityLabel = (score) => {
        if (score >= 80) return 'CRITICAL';
        if (score >= 50) return 'MEDIUM';
        return 'LOW';
    };

    const getInterventionIcon = (type) => {
        switch (type) {
            case 'medication_reminder':
                return <Pill size={18} color="#EA580C" />;
            case 'bp_request':
                return <Activity size={18} color="#0EA5E9" />;
            case 'checkin_call':
                return <Phone size={18} color="#16A34A" />;
            case 'escalation_contact':
                return <AlertTriangle size={18} color="#DC2626" />;
            default:
                return <Bell size={18} color="#6366F1" />;
        }
    };

    const getActionButtonLabel = (type) => {
        switch (type) {
            case 'medication_reminder':
                return 'Send Nudge';
            case 'bp_request':
                return 'Request BP';
            case 'checkin_call':
                return 'Log Call';
            case 'escalation_contact':
                return 'Contact Coordinator';
            default:
                return 'Complete Action';
        }
    };

    const getCompletedLabel = (type) => {
        switch (type) {
            case 'medication_reminder':
                return 'Medication Nudge Sent';
            case 'bp_request':
                return 'BP Log Requested';
            case 'checkin_call':
                return 'Check-in Call Completed';
            case 'escalation_contact':
                return 'Coordinator Contacted';
            default:
                return 'Intervention Completed';
        }
    };

    const renderHeader = () => (
        <View style={styles.header}>
            <View style={styles.headerRow}>
                <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft size={22} color="#1E293B" />
                </Pressable>
                <View style={styles.titleContainer}>
                    <Text style={styles.headerTitle}>Intervention Center</Text>
                    <Text style={styles.headerSub}>Proactive Prescriptive Care & Automation</Text>
                </View>
            </View>
            
            <View style={styles.tabBar}>
                <Pressable
                    style={[styles.tabBtn, activeTab === 'pending' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('pending')}
                >
                    <Text style={[styles.tabBtnText, activeTab === 'pending' && styles.tabBtnTextActive]}>
                        Recommended ({pendingInterventions.length})
                    </Text>
                </Pressable>
                <Pressable
                    style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('history')}
                >
                    <Text style={[styles.tabBtnText, activeTab === 'history' && styles.tabBtnTextActive]}>
                        Completed Feed
                    </Text>
                </Pressable>
            </View>
        </View>
    );

    const renderPendingItem = ({ item }) => {
        const priorityColor = getPriorityColor(item.priority_score);
        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={styles.iconBox}>
                        {getInterventionIcon(item.type)}
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{item.reason}</Text>
                        <Text style={styles.cardDetails}>{item.details}</Text>
                    </View>
                    <View style={[styles.priorityBadge, { backgroundColor: priorityColor + '15' }]}>
                        <Text style={[styles.priorityBadgeText, { color: priorityColor }]}>
                            {getPriorityLabel(item.priority_score)}
                        </Text>
                    </View>
                </View>

                <View style={styles.cardActions}>
                    <Pressable
                        style={[styles.actionBtn, { backgroundColor: priorityColor }]}
                        onPress={() => handleCompleteIntervention(item._id, item.type)}
                    >
                        <Text style={styles.actionBtnText}>{getActionButtonLabel(item.type)}</Text>
                    </Pressable>
                </View>
            </View>
        );
    };

    const renderHistoryItem = ({ item }) => (
        <View style={styles.historyCard}>
            <View style={styles.historyRow}>
                <CheckCircle2 size={16} color="#22C55E" />
                <View style={{ flex: 1 }}>
                    <Text style={styles.historyTitle}>{getCompletedLabel(item.type)}</Text>
                    <Text style={styles.historyMeta}>
                        Completed {new Date(item.completed_at || item.updated_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                    </Text>
                </View>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            {renderHeader()}
            
            {loading && !refreshing ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Loading intervention logs...</Text>
                </View>
            ) : (
                <FlatList
                    data={activeTab === 'pending' ? pendingInterventions : completedFeed}
                    keyExtractor={item => item._id}
                    renderItem={activeTab === 'pending' ? renderPendingItem : renderHistoryItem}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
                    }
                    ListEmptyComponent={() => (
                        <View style={styles.emptyContainer}>
                            <CheckCircle2 size={40} color="#CBD5E1" />
                            <Text style={styles.emptyText}>
                                {activeTab === 'pending'
                                    ? 'All clear! No pending interventions required today.'
                                    : 'No completed interventions logged yet.'}
                            </Text>
                        </View>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    header: {
        backgroundColor: '#FFFFFF',
        paddingTop: Platform.OS === 'ios' ? 44 : 20,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.screen,
        paddingVertical: 14,
        gap: 12,
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleContainer: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: '#1E293B',
    },
    headerSub: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '500',
    },
    tabBar: {
        flexDirection: 'row',
        paddingHorizontal: spacing.screen,
        paddingBottom: 10,
        gap: 12,
    },
    tabBtn: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: radius.full,
        backgroundColor: '#F1F5F9',
    },
    tabBtnActive: {
        backgroundColor: '#EEF2FF',
        borderWidth: 1,
        borderColor: '#C7D2FE',
    },
    tabBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#64748B',
    },
    tabBtnTextActive: {
        color: '#6366F1',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        color: '#64748B',
        fontWeight: '600',
    },
    listContent: {
        padding: spacing.screen,
        gap: 12,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'flex-start',
    },
    iconBox: {
        width: 38,
        height: 38,
        borderRadius: 10,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#1E293B',
        lineHeight: 20,
    },
    cardDetails: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '600',
        marginTop: 4,
    },
    priorityBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    priorityBadgeText: {
        fontSize: 9,
        fontWeight: '800',
    },
    cardActions: {
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        marginTop: 14,
        paddingTop: 12,
        alignItems: 'flex-end',
    },
    actionBtn: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: radius.md,
    },
    actionBtnText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    historyCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 14,
    },
    historyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    historyTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1E293B',
    },
    historyMeta: {
        fontSize: 11,
        color: '#94A3B8',
        fontWeight: '500',
        marginTop: 2,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        gap: 12,
    },
    emptyText: {
        fontSize: 13,
        color: '#94A3B8',
        fontWeight: '600',
        textAlign: 'center',
        lineHeight: 18,
    },
});
