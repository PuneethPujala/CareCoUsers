import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
    StatusBar, Platform, RefreshControl, Animated, ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ArrowLeft, Bell, CheckCircle2, ChevronRight, Activity, Clock,
    Pill, MessageSquare, AlertTriangle, Phone, ExternalLink,
    ShieldCheck, AlertCircle, Sparkles
} from 'lucide-react-native';
import { colors, radius, spacing, typography, shadows, layout } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import usePatientStore from '../../store/usePatientStore';
import { apiService, handleApiError } from '../../lib/api';
import AlertManager from '../../utils/AlertManager';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import CompanionHeader from '../../components/ui/CompanionHeader';

const FONT = {
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

const SkeletonItem = ({ width, height, borderRadius = 8, style }) => {
    const anim = useRef(new Animated.Value(0.3)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
            ])
        ).start();
    }, [anim]);
    return <Animated.View style={[{ width, height, borderRadius, backgroundColor: '#E2E8F0', opacity: anim }, style]} />;
};

export default function InterventionCenterScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const companionSelectedPatientId = usePatientStore(state => state.companionSelectedPatientId);
    
    const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'history'
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    
    const [pendingInterventions, setPendingInterventions] = useState([]);
    const [completedFeed, setCompletedFeed] = useState([]);

    const fetchData = async () => {
        if (!companionSelectedPatientId) {
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            const params = { patientId: companionSelectedPatientId };
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
        if (!companionSelectedPatientId) {
            setRefreshing(false);
            return;
        }
        setRefreshing(true);
        try {
            const params = { patientId: companionSelectedPatientId };
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
        if (!companionSelectedPatientId) return;
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
                return <Pill size={18} color={colors.primary} />;
            case 'bp_request':
                return <Activity size={18} color={colors.warning} />;
            case 'checkin_call':
                return <Phone size={18} color={colors.success} />;
            case 'escalation_contact':
                return <AlertTriangle size={18} color={colors.danger} />;
            default:
                return <Bell size={18} color={colors.primary} />;
        }
    };

    const getInterventionActionTitle = (type) => {
        switch (type) {
            case 'medication_reminder':
                return 'Medication Nudge';
            case 'bp_request':
                return 'Vitals Request';
            case 'checkin_call':
                return 'Wellness Call';
            case 'escalation_contact':
                return 'Emergency Escalation';
            default:
                return 'Care Action';
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

    const getCTAColor = (type) => {
        switch (type) {
            case 'medication_reminder':
                return colors.primary;
            case 'bp_request':
                return colors.warning;
            case 'checkin_call':
                return colors.success;
            case 'escalation_contact':
                return colors.danger;
            default:
                return colors.primary;
        }
    };

    // Calculate dynamic counts
    const criticalCount = pendingInterventions.filter(i => i.priority_score >= 80).length;
    const moderateCount = pendingInterventions.filter(i => i.priority_score >= 50 && i.priority_score < 80).length;
    const lowCount = pendingInterventions.filter(i => i.priority_score < 50).length;


    const renderCareStatusHero = () => {
        const totalPending = pendingInterventions.length;
        if (totalPending === 0) {
            return (
                <View style={styles.heroContainerAllClear}>
                    <View style={styles.heroHeaderRow}>
                        <View style={styles.heroIconBoxAllClear}>
                            <ShieldCheck size={22} color={colors.success} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.heroTitleAllClear}>All Clear</Text>
                            <Text style={styles.heroSubAllClear}>No recommended care interventions needed. The patient is currently stable.</Text>
                        </View>
                    </View>
                </View>
            );
        }

        return (
            <View style={styles.heroContainerAttention}>
                <View style={styles.heroHeaderRow}>
                    <View style={styles.heroIconBoxAttention}>
                        <AlertCircle size={22} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.heroTitleAttention}>Command Center Attention</Text>
                        <Text style={styles.heroSubAttention}>
                            {totalPending} Recommended Action{totalPending > 1 ? 's' : ''} Pending
                        </Text>
                    </View>
                </View>
                <View style={styles.heroBreakdownContainer}>
                    {criticalCount > 0 && (
                        <View style={[styles.heroBadgePill, { backgroundColor: colors.danger + '10' }]}>
                            <Text style={[styles.heroBadgeText, { color: colors.danger }]}>
                                🔴 {criticalCount} Critical
                            </Text>
                        </View>
                    )}
                    {moderateCount > 0 && (
                        <View style={[styles.heroBadgePill, { backgroundColor: colors.warning + '10' }]}>
                            <Text style={[styles.heroBadgeText, { color: colors.warning }]}>
                                🟡 {moderateCount} Moderate
                            </Text>
                        </View>
                    )}
                    {lowCount > 0 && (
                        <View style={[styles.heroBadgePill, { backgroundColor: colors.primary + '10' }]}>
                            <Text style={[styles.heroBadgeText, { color: colors.primary }]}>
                                🟢 {lowCount} Low
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    const renderSegmentTabs = () => (
        <View style={styles.segmentContainer}>
            <Pressable
                style={[styles.segmentTab, activeTab === 'pending' && styles.segmentTabActive]}
                onPress={() => setActiveTab('pending')}
            >
                <Text style={[styles.segmentTabText, activeTab === 'pending' && styles.segmentTabTextActive]}>
                    Recommended
                </Text>
                <View style={[styles.segmentBadge, activeTab === 'pending' ? styles.segmentBadgeActive : styles.segmentBadgeInactive]}>
                    <Text style={[styles.segmentBadgeText, activeTab === 'pending' ? styles.segmentBadgeTextActive : styles.segmentBadgeTextInactive]}>
                        {pendingInterventions.length}
                    </Text>
                </View>
            </Pressable>
            <Pressable
                style={[styles.segmentTab, activeTab === 'history' && styles.segmentTabActive]}
                onPress={() => setActiveTab('history')}
            >
                <Text style={[styles.segmentTabText, activeTab === 'history' && styles.segmentTabTextActive]}>
                    Completed Feed
                </Text>
                <View style={[styles.segmentBadge, activeTab === 'history' ? styles.segmentBadgeActive : styles.segmentBadgeInactive]}>
                    <Text style={[styles.segmentBadgeText, activeTab === 'history' ? styles.segmentBadgeTextActive : styles.segmentBadgeTextInactive]}>
                        {completedFeed.length}
                    </Text>
                </View>
            </Pressable>
        </View>
    );

    const renderPendingItem = ({ item }) => {
        const priorityColor = getPriorityColor(item.priority_score);
        const priorityLabel = getPriorityLabel(item.priority_score);
        const priorityEmoji = item.priority_score >= 80 ? '🔴' : item.priority_score >= 50 ? '🟡' : '🟢';
        const ctaColor = getCTAColor(item.type);

        return (
            <View style={styles.interventionCard}>
                {/* Priority Badge First */}
                <View style={styles.cardPriorityRow}>
                    <View style={[styles.priorityBadge, { backgroundColor: priorityColor + '10' }]}>
                        <Text style={[styles.priorityBadgeText, { color: priorityColor }]}>
                            {priorityEmoji} {priorityLabel}
                        </Text>
                    </View>
                </View>

                {/* Content Second */}
                <View style={styles.cardBody}>
                    <View style={styles.actionHeaderRow}>
                        <View style={[styles.actionIconContainer, { backgroundColor: ctaColor + '10' }]}>
                            {getInterventionIcon(item.type)}
                        </View>
                        <Text style={styles.actionHeaderTitle}>
                            {getInterventionActionTitle(item.type)}
                        </Text>
                    </View>
                    <Text style={styles.actionReason}>{item.reason}</Text>
                    <Text style={styles.actionDetails}>{item.details}</Text>
                </View>

                {/* CTA Action Bottom */}
                <View style={styles.actionDivider} />
                <View style={styles.actionContainer}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.actionButton,
                            { backgroundColor: ctaColor },
                            pressed && { opacity: 0.85 }
                        ]}
                        onPress={() => handleCompleteIntervention(item._id, item.type)}
                    >
                        <Text style={styles.actionButtonText}>{getActionButtonLabel(item.type)}</Text>
                        <Clock size={14} color="#FFF" style={{ marginLeft: 6 }} />
                    </Pressable>
                </View>
            </View>
        );
    };

    const renderHistoryItem = ({ item, index }) => {
        const isLast = index === completedFeed.length - 1;
        const formattedTime = new Date(item.completed_at || item.updated_at).toLocaleString([], {
            hour: '2-digit',
            minute: '2-digit',
            month: 'short',
            day: 'numeric'
        });

        return (
            <View style={styles.historyRowItem} key={item._id || index}>
                <View style={styles.historyLineCol}>
                    <View style={styles.historyNodeCircle}>
                        <CheckCircle2 size={14} color="#FFF" />
                    </View>
                    {!isLast && <View style={styles.historyVerticalLine} />}
                </View>
                <View style={styles.historyContentCol}>
                    <View style={styles.historyCardHeader}>
                        <Text style={styles.historyCardTitle}>{getCompletedLabel(item.type)}</Text>
                        <Text style={styles.historyCardTime}>{formattedTime}</Text>
                    </View>
                    <Text style={styles.historyCardReason}>{item.reason || 'Completed successfully'}</Text>
                </View>
            </View>
        );
    };

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

                    {/* Stylized high-end wavy/curved lines */}
                    <Path d="M-20 180 C80 230, 180 150, 280 230 C340 280, 380 250, 420 310" stroke={colors.borderLight} strokeWidth="1.5" fill="none" opacity="0.6" />
                    <Path d="M-40 210 C60 260, 160 180, 260 260 C320 310, 360 280, 400 340" stroke="#E2E8F0" strokeWidth="1" fill="none" opacity="0.35" />

                    {/* Premium Floral Outline Petals (Top Right Corner) */}
                    <Path d="M360 -10 C330 40, 290 60, 260 80 C290 90, 340 80, 370 40 Z" fill="none" stroke={colors.primary} strokeWidth="1" opacity="0.15" />
                    <Path d="M330 -20 C300 20, 260 40, 230 50 C260 60, 310 50, 340 20 Z" fill="none" stroke={colors.primary} strokeWidth="0.8" opacity="0.1" />

                    {/* Premium Floral Outline Petals (Bottom Left Corner) */}
                    <Path d="M-10 780 C40 750, 60 710, 80 680 C90 710, 80 760, 40 790 Z" fill="none" stroke={colors.danger} strokeWidth="1" opacity="0.15" />
                    <Path d="M20 810 C60 780, 90 740, 110 710 C120 730, 100 780, 60 810 Z" fill="none" stroke="#EF4444" strokeWidth="1.2" opacity="0.12" />
                    
                    {/* Concentric abstract rings */}
                    <Circle cx="320" cy="480" r="130" stroke="#E2E8F0" strokeWidth="1" fill="none" opacity="0.28" />
                    <Circle cx="320" cy="480" r="90" stroke="#E2E8F0" strokeWidth="1.2" fill="none" opacity="0.18" />
                </Svg>
            </View>

            <CompanionHeader
                style={{ backgroundColor: 'transparent', borderBottomWidth: 0, shadowColor: 'transparent', elevation: 0 }}
                subtitle="Care Automation"
                title="Intervention Center"
                onBack={() => navigation.goBack()}
            />
            
            {loading && !refreshing ? (
                <ScrollView contentContainerStyle={styles.listContent}>
                    {/* Care Status Hero Skeleton */}
                    <View style={[styles.heroContainerAttention, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0', gap: 12 }]}>
                        <View style={styles.heroHeaderRow}>
                            <SkeletonItem width={36} height={36} borderRadius={10} />
                            <View style={{ flex: 1, gap: 6 }}>
                                <SkeletonItem width={180} height={15} />
                                <SkeletonItem width={120} height={12} />
                            </View>
                        </View>
                        <View style={[styles.heroBreakdownContainer, { borderColor: '#E2E8F0' }]}>
                            <SkeletonItem width={80} height={20} borderRadius={8} />
                            <SkeletonItem width={80} height={20} borderRadius={8} />
                        </View>
                    </View>

                    {/* Segment Tabs Skeleton */}
                    <View style={[styles.segmentContainer, { marginTop: 16 }]}>
                        <View style={[styles.segmentTab, { gap: 6 }]}>
                            <SkeletonItem width={80} height={13} />
                            <SkeletonItem width={20} height={16} borderRadius={10} />
                        </View>
                        <View style={[styles.segmentTab, { gap: 6 }]}>
                            <SkeletonItem width={80} height={13} />
                            <SkeletonItem width={20} height={16} borderRadius={10} />
                        </View>
                    </View>

                    {/* Recommended Cards Skeletons */}
                    <View style={{ gap: 12, marginTop: 16 }}>
                        {[1, 2].map((item) => (
                            <View key={item} style={styles.interventionCard}>
                                <View style={styles.cardPriorityRow}>
                                    <SkeletonItem width={70} height={18} borderRadius={6} />
                                </View>
                                <View style={[styles.cardBody, { gap: 8 }]}>
                                    <View style={styles.actionHeaderRow}>
                                        <SkeletonItem width={30} height={30} borderRadius={8} />
                                        <SkeletonItem width={120} height={14} />
                                    </View>
                                    <SkeletonItem width="100%" height={13} />
                                    <SkeletonItem width="90%" height={12} />
                                </View>
                                <View style={styles.actionDivider} />
                                <View style={styles.actionContainer}>
                                    <SkeletonItem width={120} height={32} borderRadius={radius.md} />
                                </View>
                            </View>
                        ))}
                    </View>
                </ScrollView>
            ) : (
                <FlatList
                    ListHeaderComponent={
                        <View style={{ gap: 16, marginBottom: 16 }}>
                            {renderCareStatusHero()}
                            {renderSegmentTabs()}
                        </View>
                    }
                    data={activeTab === 'pending' ? pendingInterventions : completedFeed}
                    keyExtractor={item => item._id}
                    renderItem={activeTab === 'pending' ? renderPendingItem : renderHistoryItem}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
                    }
                    ListEmptyComponent={() => (
                        <View style={styles.emptyContainer}>
                            {activeTab === 'pending' ? (
                                <>
                                    <Text style={styles.emptyEmoji}>✨</Text>
                                    <Text style={styles.emptyTitle}>All Clear</Text>
                                    <Text style={styles.emptyText}>
                                        No interventions are needed today. The patient is currently stable.
                                    </Text>
                                </>
                            ) : (
                                <>
                                    <Text style={styles.emptyEmoji}>📋</Text>
                                    <Text style={styles.emptyTitle}>Feed Empty</Text>
                                    <Text style={styles.emptyText}>
                                        No completed interventions logged yet.
                                    </Text>
                                </>
                            )}
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
        backgroundColor: colors.background,
    },
    header: {
        backgroundColor: colors.surface,
        paddingTop: Platform.OS === 'ios' ? 50 : 24,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
        ...shadows.sm,
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
        fontSize: 20,
        ...FONT.heavy,
        color: colors.textPrimary,
    },
    headerSub: {
        fontSize: 12,
        color: colors.textMuted,
        ...FONT.semibold,
        marginTop: 1,
    },
    
    // Care Status Hero Panel Styles
    heroContainerAllClear: {
        backgroundColor: '#ECFDF5',
        borderRadius: radius.xl,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: '#A7F3D0',
        ...shadows.sm,
    },
    heroIconBoxAllClear: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#D1FAE5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroTitleAllClear: {
        fontSize: 15,
        ...FONT.heavy,
        color: '#065F46',
    },
    heroSubAllClear: {
        fontSize: 12,
        ...FONT.medium,
        color: '#047857',
        marginTop: 2,
        lineHeight: 16,
    },
    heroContainerAttention: {
        backgroundColor: '#EEF2FF',
        borderRadius: radius.xl,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: '#C7D2FE',
        ...shadows.sm,
    },
    heroHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    heroIconBoxAttention: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#E0E7FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroTitleAttention: {
        fontSize: 15,
        ...FONT.heavy,
        color: '#1E1B4B',
    },
    heroSubAttention: {
        fontSize: 12,
        ...FONT.bold,
        color: '#312E81',
        marginTop: 2,
    },
    heroBreakdownContainer: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#C7D2FE',
    },
    heroBadgePill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    heroBadgeText: {
        fontSize: 11,
        ...FONT.bold,
    },

    // Segment tab bar capsule styles
    segmentContainer: {
        flexDirection: 'row',
        backgroundColor: '#F1F5F9',
        borderRadius: radius.full,
        padding: 4,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    segmentTab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: radius.full,
        gap: 6,
    },
    segmentTabActive: {
        backgroundColor: colors.surface,
        ...shadows.sm,
    },
    segmentTabText: {
        fontSize: 13,
        ...FONT.bold,
        color: colors.textSecondary,
    },
    segmentTabTextActive: {
        color: colors.primary,
    },
    segmentBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    segmentBadgeActive: {
        backgroundColor: colors.primarySoft,
    },
    segmentBadgeInactive: {
        backgroundColor: '#E2E8F0',
    },
    segmentBadgeText: {
        fontSize: 10,
        ...FONT.heavy,
    },
    segmentBadgeTextActive: {
        color: colors.primary,
    },
    segmentBadgeTextInactive: {
        color: colors.textSecondary,
    },

    // Recommended actions card styles
    interventionCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        padding: 16,
        borderWidth: 1.5,
        borderColor: colors.borderLight,
        ...shadows.card,
        marginBottom: 4,
    },
    cardPriorityRow: {
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    priorityBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    priorityBadgeText: {
        fontSize: 9,
        ...FONT.heavy,
    },
    cardBody: {
        gap: 6,
    },
    actionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    actionIconContainer: {
        width: 30,
        height: 30,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionHeaderTitle: {
        fontSize: 14,
        ...FONT.heavy,
        color: colors.textPrimary,
    },
    actionReason: {
        fontSize: 13,
        ...FONT.semibold,
        color: colors.textPrimary,
        lineHeight: 18,
    },
    actionDetails: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textMuted,
        lineHeight: 16,
    },
    actionDivider: {
        height: 1,
        backgroundColor: colors.borderLight,
        marginVertical: 12,
    },
    actionContainer: {
        alignItems: 'flex-end',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: radius.md,
        ...shadows.sm,
    },
    actionButtonText: {
        color: '#FFF',
        fontSize: 12,
        ...FONT.bold,
    },

    // Timeline completed history list styles
    historyRowItem: {
        flexDirection: 'row',
        gap: 12,
    },
    historyLineCol: {
        alignItems: 'center',
        width: 24,
    },
    historyNodeCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.success,
        alignItems: 'center',
        justifyContent: 'center',
        ...shadows.sm,
    },
    historyVerticalLine: {
        width: 3,
        flex: 1,
        backgroundColor: colors.borderLight,
        marginVertical: 4,
    },
    historyContentCol: {
        flex: 1,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: radius.lg,
        padding: 12,
        ...shadows.sm,
        marginBottom: 12,
    },
    historyCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    historyCardTitle: {
        fontSize: 13,
        ...FONT.heavy,
        color: colors.textPrimary,
    },
    historyCardTime: {
        fontSize: 10,
        ...FONT.semibold,
        color: colors.textMuted,
    },
    historyCardReason: {
        fontSize: 11,
        ...FONT.medium,
        color: colors.textSecondary,
        lineHeight: 15,
    },

    // Common layout styles
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        color: colors.textSecondary,
        ...FONT.semibold,
    },
    listContent: {
        padding: spacing.screen,
        paddingBottom: layout.TAB_BAR_CLEARANCE,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        gap: 8,
    },
    emptyEmoji: {
        fontSize: 36,
        marginBottom: 4,
    },
    emptyTitle: {
        fontSize: 15,
        ...FONT.heavy,
        color: colors.textPrimary,
    },
    emptyText: {
        fontSize: 12,
        color: colors.textMuted,
        ...FONT.medium,
        textAlign: 'center',
        lineHeight: 18,
        paddingHorizontal: 20,
    },
});
