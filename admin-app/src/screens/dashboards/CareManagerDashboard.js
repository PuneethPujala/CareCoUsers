import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, StatusBar, Animated, Dimensions } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Theme } from '../../theme/theme';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import { apiService } from '../../lib/api';
import { Colors, Shadows, Spacing, Typography, Radius } from '../../theme/colors';

const { width: SW } = Dimensions.get('window');

// ── Helpers ──
function getCapacityConfig(pct) {
    if (pct >= 90) return { color: '#EF4444', bg: '#FEF2F2', label: 'CRITICAL LOAD', icon: 'alert-triangle' };
    if (pct >= 70) return { color: '#F59E0B', bg: '#FFFBEB', label: 'HIGH TRAFFIC', icon: 'trending-up' };
    return { color: '#10B981', bg: '#F0FDF4', label: 'SYSTEM HEALTHY', icon: 'check-circle' };
}

export default function CareManagerDashboard({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({ totalCallers: 0, totalPatients: 0, unassignedPatients: 0 });
    const [capacity, setCapacity] = useState(null);
    const [performers, setPerformers] = useState([]);

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    const fetchDashboardData = async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        try {
            // Auto-reconcile: silently assign any unassigned patients to available callers
            try {
                await apiService.manager.reconcile();
            } catch (reconErr) {
                // Non-blocking — dashboard loads even if reconciliation fails
                console.log('[Reconciliation] Skipped:', reconErr?.message);
            }

            const res = await apiService.dashboard.getCareManagerStats();
            setStats(res.data.stats || { totalCallers: 0, totalPatients: 0, unassignedPatients: 0 });
            setCapacity(res.data.capacity || null);
            setPerformers(res.data.performers || []);
            
            // Trigger load animation
            fadeAnim.setValue(0);
            slideAnim.setValue(20);
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true })
            ]).start();

        } catch (err) {
            console.error('[CareManagerDashboard] Error:', err);
        } finally {
            if (!isSilent) setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => { fetchDashboardData(); }, []);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchDashboardData(true); }, []);

    const pct = capacity?.utilizationPct ?? 0;
    const capConfig = getCapacityConfig(pct);

    const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <GradientHeader 
                title="Workspace" 
                subtitle={currentDate} 
                onBack={null} 
            />

            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.content}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
            >
                {loading ? (
                    <View style={{ gap: 16 }}>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <SkeletonLoader variant="stat" style={{ flex: 1, height: 120, borderRadius: 24 }} />
                            <SkeletonLoader variant="stat" style={{ flex: 1, height: 120, borderRadius: 24 }} />
                        </View>
                        <SkeletonLoader variant="card" style={{ height: 200, borderRadius: 24 }} />
                    </View>
                ) : (
                    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                        
                        {/* ── Alert Banner ── */}
                        {stats.unassignedPatients > 0 && (
                            <TouchableOpacity style={s.alertBanner} activeOpacity={0.9} onPress={() => navigation.navigate('PatientsList', { unassigned: 'true' })}>
                                <LinearGradient colors={['#EF4444', '#DC2626']} style={StyleSheet.absoluteFill} start={{x:0, y:0}} end={{x:1, y:1}} />
                                <View style={s.alertIconBox}>
                                    <Feather name="alert-circle" size={20} color="#EF4444" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[s.alertTitle, Theme.typography.common]}>Action Required</Text>
                                    <Text style={[s.alertDesc, Theme.typography.common]}>
                                        {stats.unassignedPatients} patient{stats.unassignedPatients > 1 ? 's' : ''} pending assignment
                                    </Text>
                                </View>
                                <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.8)" />
                            </TouchableOpacity>
                        )}

                        {/* ── Key Metrics ── */}
                        <View style={s.metricsRow}>
                            <TouchableOpacity 
                                style={s.metricCard} 
                                activeOpacity={0.8}
                                onPress={() => navigation.navigate('TeamList', { role: 'caller' })}
                            >
                                <View style={s.metricIconBgBlue}>
                                    <Feather name="headphones" size={22} color="#0F172A" />
                                </View>
                                <Text style={[s.metricValue, Theme.typography.common]}>{stats.totalCallers}</Text>
                                <Text style={[s.metricLabel, Theme.typography.common]}>Active Callers</Text>
                                <Ionicons name="people" size={80} color="#F1F5F9" style={s.metricBgIcon} />
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={s.metricCard} 
                                activeOpacity={0.8}
                                onPress={() => navigation.navigate('PatientsList')}
                            >
                                <View style={s.metricIconBgEmerald}>
                                    <Feather name="heart" size={22} color="#0F172A" />
                                </View>
                                <Text style={[s.metricValue, Theme.typography.common]}>{stats.totalPatients}</Text>
                                <Text style={[s.metricLabel, Theme.typography.common]}>Total Patients</Text>
                                <Ionicons name="fitness" size={80} color="#F1F5F9" style={s.metricBgIcon} />
                            </TouchableOpacity>
                        </View>

                        {/* ── Predictor Card (Matches System Capacity Theme) ── */}
                        {capacity && capacity.dailyGrowthRate !== undefined && (() => {
                            const isMaxed = capacity.daysUntilFull === null || capacity.daysUntilFull === 0;
                            const isWarning = capacity.daysUntilFull > 0 && capacity.daysUntilFull <= 14;

                            const themeColor = isMaxed ? '#EF4444' : isWarning ? '#F59E0B' : '#10B981';
                            const bgColor = isMaxed ? '#FEF2F2' : isWarning ? '#FFFBEB' : '#ECFDF5';

                            return (
                                <View style={[s.premiumCard, { marginBottom: 24 }]}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.metricLabel}>AI CAPACITY FORECAST</Text>
                                            <Text style={[s.capacityValue, { fontSize: 24, lineHeight: 30, color: '#0F172A', marginTop: 4 }]}>
                                                {isMaxed
                                                    ? 'Capacity Maxed Out'
                                                    : capacity.daysUntilFull === -1
                                                        ? 'Healthy Growth Rate'
                                                        : `Slots fill in ${capacity.daysUntilFull} days`}
                                            </Text>
                                        </View>
                                        <View style={[s.capacityBadge, { backgroundColor: bgColor }]}>
                                            <Feather name={isMaxed ? 'alert-triangle' : 'activity'} size={12} color={themeColor} style={{ marginRight: 4 }} />
                                            <Text style={[s.capacityBadgeText, { color: themeColor }]}>
                                                {isMaxed ? 'CRITICAL' : isWarning ? 'WARNING' : 'HEALTHY'}
                                            </Text>
                                        </View>
                                    </View>
                                    
                                    <View style={s.forecastGrid}>
                                        <View style={s.forecastItem}>
                                            <View style={s.forecastIconWrap}><Feather name="trending-up" size={14} color="#64748B" /></View>
                                            <Text style={s.forecastVal}>+{capacity.dailyGrowthRate}</Text>
                                            <Text style={s.forecastLbl}>Patients / Day</Text>
                                        </View>
                                        <View style={s.forecastDivider} />
                                        <View style={[s.forecastItem, { flex: 2, alignItems: 'flex-start', paddingLeft: 16 }]}>
                                            <Text style={[s.metricLabel, { color: '#475569', fontSize: 12, marginBottom: 4 }]}>Recommendation</Text>
                                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>
                                                {isMaxed 
                                                    ? 'Hire additional callers immediately.' 
                                                    : isWarning 
                                                        ? 'Prepare to scale workforce soon.' 
                                                        : 'Sufficient caller capacity active.'
                                                }
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            );
                        })()}

                        {/* ── System Capacity ── */}
                        <Text style={[s.sectionTitle, Theme.typography.common]}>System Capacity</Text>
                        <View style={s.premiumCard}>
                            <View style={s.capacityHeader}>
                                <View>
                                    <Text style={[s.capacityValue, { color: capConfig.color }]}>{pct}%</Text>
                                    <Text style={s.capacitySubtext}>{capacity?.assignedPatients ?? 0} out of {capacity?.maxCapacity ?? 0} active</Text>
                                </View>
                                <View style={[s.capacityBadge, { backgroundColor: capConfig.bg }]}>
                                    <Feather name={capConfig.icon} size={12} color={capConfig.color} style={{marginRight: 4}} />
                                    <Text style={[s.capacityBadgeText, { color: capConfig.color }]}>{capConfig.label}</Text>
                                </View>
                            </View>

                            <View style={s.progressBarTrack}>
                                <View style={[s.progressBarFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: capConfig.color }]} />
                            </View>

                            <View style={s.forecastGrid}>
                                <View style={s.forecastItem}>
                                    <View style={s.forecastIconWrap}><Feather name="unlock" size={14} color="#64748B" /></View>
                                    <Text style={s.forecastVal}>{capacity?.availableSlots ?? 0}</Text>
                                    <Text style={s.forecastLbl}>Slots Free</Text>
                                </View>
                                <View style={s.forecastDivider} />
                                <View style={s.forecastItem}>
                                    <View style={s.forecastIconWrap}><Feather name="trending-up" size={14} color="#64748B" /></View>
                                    <Text style={s.forecastVal}>+{capacity?.dailyGrowthRate ?? 0}</Text>
                                    <Text style={s.forecastLbl}>Growth / Day</Text>
                                </View>
                                <View style={s.forecastDivider} />
                                <View style={s.forecastItem}>
                                    <View style={s.forecastIconWrap}><Feather name="calendar" size={14} color="#64748B" /></View>
                                    <Text style={s.forecastVal}>{capacity?.daysUntilFull === -1 ? '∞' : (capacity?.daysUntilFull ?? '—')}</Text>
                                    <Text style={s.forecastLbl}>Days Left</Text>
                                </View>
                            </View>

                            {capacity?.callersNeeded > 0 && (
                                <TouchableOpacity
                                    style={s.actionRowInline}
                                    activeOpacity={0.8}
                                    onPress={() => navigation.navigate('CreateUser', { allowedRole: 'caller' })}
                                >
                                    <LinearGradient colors={['rgba(99, 102, 241, 0.1)', 'rgba(99, 102, 241, 0.05)']} style={StyleSheet.absoluteFill} />
                                    <Feather name="user-plus" size={18} color="#4F46E5" />
                                    <Text style={s.actionRowInlineText}>Hire {capacity.callersNeeded} more caller{capacity.callersNeeded > 1 ? 's' : ''} to maintain capacity</Text>
                                    <Feather name="arrow-right" size={16} color="#4F46E5" />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* ── Quick Tools ── */}
                        <Text style={[s.sectionTitle, Theme.typography.common, { marginTop: 8 }]}>Management Tools</Text>
                        <View style={s.toolsGrid}>
                            <TouchableOpacity style={s.toolCard} activeOpacity={0.8} onPress={() => navigation.navigate('CreateUser', { allowedRole: 'caller' })}>
                                <View style={[s.toolIcon, { backgroundColor: '#EEF2FF' }]}>
                                    <Feather name="plus-circle" size={24} color="#4F46E5" />
                                </View>
                                <Text style={s.toolLabel}>Onboard Caller</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.toolCard} activeOpacity={0.8} onPress={() => navigation.navigate('PatientsList')}>
                                <View style={[s.toolIcon, { backgroundColor: '#F0FDF4' }]}>
                                    <Feather name="users" size={24} color="#10B981" />
                                </View>
                                <Text style={s.toolLabel}>Patient Roster</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.toolCard} activeOpacity={0.8} onPress={() => navigation.navigate('TeamList', { role: 'caller' })}>
                                <View style={[s.toolIcon, { backgroundColor: '#FDF4FF' }]}>
                                    <Feather name="layout" size={24} color="#C026D3" />
                                </View>
                                <Text style={s.toolLabel}>Staff Directory</Text>
                            </TouchableOpacity>
                        </View>

                        {/* ── Top Performers ── */}
                        <View style={s.sectionHeader}>
                            <Text style={[s.sectionTitle, Theme.typography.common, { marginBottom: 0 }]}>Team Performance</Text>
                            <TouchableOpacity onPress={() => navigation.navigate('TeamList', { role: 'caller' })}>
                                <Text style={s.viewAllBtn}>See All</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={s.premiumCardList}>
                            {performers.length === 0 ? (
                                <View style={s.emptyState}>
                                    <Ionicons name="stats-chart-outline" size={40} color="#CBD5E1" />
                                    <Text style={s.emptyStateText}>Analytics pending minimum call volume</Text>
                                </View>
                            ) : (
                                performers.map((p, i) => (
                                    <View key={p.id || i}>
                                        {i > 0 && <View style={s.listDivider} />}
                                        <TouchableOpacity
                                            style={s.performerRow}
                                            activeOpacity={0.7}
                                            onPress={() => navigation.navigate('CallerDetail', { callerId: p.id })}
                                        >
                                            <View style={s.performerAvatar}>
                                                <LinearGradient colors={['#F1F5F9', '#E2E8F0']} style={StyleSheet.absoluteFill} />
                                                <Text style={s.performerInitials}>{p.name?.charAt(0)}</Text>
                                            </View>
                                            <View style={s.performerInfo}>
                                                <Text style={s.performerName} numberOfLines={1}>{p.name}</Text>
                                                <Text style={s.performerStats}>{p.calls} total sessions</Text>
                                            </View>
                                            <View style={s.scoreBadge}>
                                                <Feather name="star" size={12} color="#059669" />
                                                <Text style={s.scoreText}>{p.score}%</Text>
                                            </View>
                                            <Feather name="chevron-right" size={16} color="#CBD5E1" style={{ marginLeft: 8 }} />
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                        </View>

                    </Animated.View>
                )}
            </ScrollView>
        </View>
    );
}

// ═══════════════════════════════
// HD Premium Production Styles
// ═══════════════════════════════
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F4F7F9' },
    scroll: { flex: 1 },
    content: { padding: 20, paddingBottom: 120 },

    // ── Greeting ──
    greetingContainer: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 24,
        marginTop: 4
    },
    greetingText: { fontSize: 15, fontWeight: '600', color: '#64748B' },
    greetingName: { fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5, marginTop: 2 },
    profileThumb: { 
        width: 48, height: 48, borderRadius: 24, 
        justifyContent: 'center', alignItems: 'center', 
        overflow: 'hidden', 
        borderWidth: 2, borderColor: '#FFFFFF',
        ...Shadows.md 
    },
    profileThumbText: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },

    // ── Alert Banner ──
    alertBanner: {
        flexDirection: 'row', alignItems: 'center',
        padding: 16, borderRadius: 20,
        marginBottom: 24, overflow: 'hidden',
        ...Shadows.lg, shadowColor: '#DC2626'
    },
    alertIconBox: { 
        width: 40, height: 40, borderRadius: 12, 
        backgroundColor: '#FFFFFF', 
        justifyContent: 'center', alignItems: 'center', 
        marginRight: 16 
    },
    alertTitle: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', marginBottom: 2 },
    alertDesc: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.9)' },

    // ── Metrics ──
    metricsRow: { flexDirection: 'row', gap: 16, marginBottom: 28 },
    metricCard: {
        flex: 1, backgroundColor: '#FFFFFF',
        borderRadius: 24, padding: 20,
        ...Shadows.md, overflow: 'hidden',
        borderWidth: 1, borderColor: '#F1F5F9'
    },
    metricIconBgBlue: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#DBEAFE' },
    metricIconBgEmerald: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#D1FAE5' },
    metricValue: { fontSize: 32, fontWeight: '800', color: '#0F172A', letterSpacing: -1 },
    metricLabel: { fontSize: 13, fontWeight: '600', color: '#64748B', marginTop: 4 },
    metricBgIcon: { position: 'absolute', right: -15, bottom: -15, opacity: 0.5, transform: [{ rotate: '-15deg' }] },

    // ── Section Headers ──
    sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 16, letterSpacing: -0.3 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16, marginTop: 8 },
    viewAllBtn: { fontSize: 13, fontWeight: '700', color: '#4F46E5', backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },

    // ── Global Premium Card ──
    premiumCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24,
        padding: 24, marginBottom: 28,
        borderWidth: 1, borderColor: '#F1F5F9',
        ...Shadows.lg, shadowColor: '#94A3B8'
    },
    premiumCardList: {
        backgroundColor: '#FFFFFF', borderRadius: 24,
        marginBottom: 28, paddingVertical: 8,
        borderWidth: 1, borderColor: '#F1F5F9',
        ...Shadows.lg, shadowColor: '#94A3B8'
    },

    // ── Old Glass Styles removed ──

    // ── Capacity Details ──
    capacityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    capacityValue: { fontSize: 40, fontWeight: '800', letterSpacing: -1.5, lineHeight: 45 },
    capacitySubtext: { fontSize: 13, fontWeight: '600', color: '#64748B' },
    capacityBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    capacityBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    progressBarTrack: { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', marginBottom: 24 },
    progressBarFill: { height: '100%', borderRadius: 4 },
    
    // Forecast Grid
    forecastGrid: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
    forecastItem: { flex: 1, alignItems: 'center' },
    forecastIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginBottom: 8, ...Shadows.sm },
    forecastVal: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
    forecastLbl: { fontSize: 11, fontWeight: '600', color: '#64748B', marginTop: 2 },
    forecastDivider: { width: 1, backgroundColor: '#E2E8F0', marginHorizontal: 8 },

    actionRowInline: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, marginTop: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E0E7FF' },
    actionRowInlineText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#3730A3', marginLeft: 12 },

    // ── Tools Grid ──
    toolsGrid: { flexDirection: 'row', gap: 12, marginBottom: 28 },
    toolCard: { 
        flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, 
        padding: 16, alignItems: 'center',
        borderWidth: 1, borderColor: '#F1F5F9',
        ...Shadows.md
    },
    toolIcon: { width: 50, height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    toolLabel: { fontSize: 12, fontWeight: '700', color: '#1E293B', textAlign: 'center' },

    // ── Performers List ──
    performerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
    performerAvatar: { 
        width: 44, height: 44, borderRadius: 14, 
        justifyContent: 'center', alignItems: 'center', 
        marginRight: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: '#F1F5F9'
    },
    performerInitials: { fontSize: 16, fontWeight: '800', color: '#475569' },
    performerInfo: { flex: 1 },
    performerName: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
    performerStats: { fontSize: 12, fontWeight: '600', color: '#64748B' },
    scoreBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#D1FAE5' },
    scoreText: { fontSize: 12, fontWeight: '800', color: '#059669', marginLeft: 4 },
    listDivider: { height: 1, backgroundColor: '#F1F5F9', marginLeft: 80, marginRight: 20 },
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
    emptyStateText: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginTop: 12 }
});
