import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, Animated } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../../theme/theme';
import { Shadows } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import { apiService } from '../../lib/api';

export default function ReportsScreen({ navigation }) {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState(null);

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    const fetchReport = useCallback(async (isSilent = false) => {
        try {
            if (!isSilent) setLoading(true);
            const res = await apiService.dashboard.getCareManagerStats();
            setData(res.data);
            
            if (!isSilent) {
                fadeAnim.setValue(0);
                slideAnim.setValue(20);
                Animated.parallel([
                    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
                    Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true })
                ]).start();
            }
        } catch (err) {
            console.error('[Reports] Error fetching data:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [fadeAnim, slideAnim]);

    useEffect(() => { fetchReport(); }, [fetchReport]);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchReport(true); }, [fetchReport]);

    const stats = data?.stats || {};
    const cap = data?.capacity || {};
    const performers = data?.performers || [];

    // Safe numbers
    const activeCallers = stats.totalCallers || 0;
    const totalPatients = stats.totalPatients || 0;
    const unassigned = stats.unassignedPatients || 0;
    const utilization = cap.utilizationPct || 0;
    const maxCap = cap.maxCapacity || 0;
    const assigned = cap.assignedPatients || 0;
    const freeSlots = cap.availableSlots || 0;

    // Vertical Bar Chart Configuration
    const chartItems = [
        { label: 'Assigned', value: assigned, gradient: ['#6366F1', '#4F46E5'], color: '#4F46E5', trackBg: '#EEF2FF', icon: 'check-circle' },
        { label: 'Free Slots', value: freeSlots, gradient: ['#34D399', '#10B981'], color: '#10B981', trackBg: '#F0FDF4', icon: 'unlock' },
        { label: 'Pending', value: unassigned, gradient: ['#FBBF24', '#F59E0B'], color: '#F59E0B', trackBg: '#FFFBEB', icon: 'alert-circle' },
    ];
    const safeMax = Math.max(maxCap, unassigned, 1);

    return (
        <View style={s.root}>
            <GradientHeader 
                title="Analytics Report" 
                subtitle="Live Organizational Telemetry" 
                onBack={() => navigation.goBack()} 
            />

            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.content}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
            >
                {loading ? (
                    <View style={s.loadBox}>
                        <ActivityIndicator size="large" color="#4F46E5" />
                        <Text style={s.loadingText}>Compiling telemetry...</Text>
                    </View>
                ) : (
                    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                        
                        {/* ── 1. KPI Overview ── */}
                        <Text style={[s.sectionTitle, Theme.typography.common]}>Operational Overview</Text>
                        
                        <View style={s.statsRow}>
                            <View style={s.statCardFlex}>
                                <Ionicons name="people" size={50} color="#F8FAFC" style={s.cardBgIcon} />
                                <View style={[s.iconWrap, { backgroundColor: '#EEF2FF' }]}>
                                    <Feather name="headphones" size={16} color="#4F46E5" />
                                </View>
                                <Text style={[s.statVal, Theme.typography.common]}>{activeCallers}</Text>
                                <Text style={[s.statLbl, Theme.typography.common]}>Active Callers</Text>
                            </View>

                            <View style={s.statCardFlex}>
                                <Ionicons name="fitness" size={50} color="#F8FAFC" style={s.cardBgIcon} />
                                <View style={[s.iconWrap, { backgroundColor: '#F0FDF4' }]}>
                                    <Feather name="heart" size={16} color="#10B981" />
                                </View>
                                <Text style={[s.statVal, Theme.typography.common]}>{totalPatients}</Text>
                                <Text style={[s.statLbl, Theme.typography.common]}>Total Patients</Text>
                            </View>
                        </View>

                        <View style={s.statsRow}>
                            <View style={s.statCardFlex}>
                                <Ionicons name="warning" size={50} color="#F8FAFC" style={s.cardBgIcon} />
                                <View style={[s.iconWrap, { backgroundColor: '#FFFBEB' }]}>
                                    <Feather name="alert-circle" size={16} color="#F59E0B" />
                                </View>
                                <Text style={[s.statVal, Theme.typography.common]}>{unassigned}</Text>
                                <Text style={[s.statLbl, Theme.typography.common]}>Unassigned</Text>
                            </View>

                            <View style={s.statCardFlex}>
                                <Ionicons name="pulse" size={50} color="#F8FAFC" style={s.cardBgIcon} />
                                <View style={[s.iconWrap, { backgroundColor: '#F5F3FF' }]}>
                                    <Feather name="activity" size={16} color="#8B5CF6" />
                                </View>
                                <Text style={[s.statVal, Theme.typography.common]}>{utilization}%</Text>
                                <Text style={[s.statLbl, Theme.typography.common]}>Utilization</Text>
                            </View>
                        </View>

                        {/* ── 2. Capacity Distribution (Ultra Premium Vertical Bars) ── */}
                        <Text style={[s.sectionTitle, Theme.typography.common, { marginTop: 8 }]}>System Capacity</Text>
                        <View style={s.premiumCard}>
                            <View style={s.capacityHeader}>
                                <Text style={s.capacityTotalCount}>{maxCap}</Text>
                                <Text style={s.capacityTotalLabel}>Maximum System Slots</Text>
                            </View>

                            <View style={s.barChartContainer}>
                                {chartItems.map((item) => {
                                    const heightPct = Math.max((item.value / safeMax) * 100, 8); // min 8% to always show a tiny bubble
                                    return (
                                        <View key={item.label} style={s.barColumn}>
                                            {/* Floating Value Badge */}
                                            <View style={s.barValueBadge}>
                                                <Text style={[s.barValueText, { color: item.color }]}>{item.value}</Text>
                                            </View>
                                            
                                            {/* Vertical Bar */}
                                            <View style={[s.verticalTrack, { backgroundColor: item.trackBg }]}>
                                                <Animated.View style={[s.verticalFill, { height: `${heightPct}%` }]}>
                                                    <LinearGradient colors={item.gradient} style={StyleSheet.absoluteFill} />
                                                </Animated.View>
                                            </View>
                                            
                                            {/* Label & Icon */}
                                            <View style={s.barFooter}>
                                                <Feather name={item.icon} size={14} color={item.color} style={{marginBottom: 4}} />
                                                <Text style={s.barFooterLbl}>{item.label}</Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>

                        {/* ── 3. Growth & Forecast ── */}
                        <Text style={[s.sectionTitle, Theme.typography.common]}>Growth & Forecast</Text>
                        <View style={s.premiumCardList}>
                            <View style={s.forecastLineRow}>
                                <View style={[s.forecastIconBg, { backgroundColor: '#EEF2FF' }]}>
                                    <Feather name="trending-up" size={16} color="#4F46E5" />
                                </View>
                                <View style={s.forecastTextCol}>
                                    <Text style={s.forecastLineVal}>{cap.patientsLast7Days ?? 0}</Text>
                                    <Text style={s.forecastLineLbl}>New patients this week</Text>
                                </View>
                            </View>
                            
                            <View style={s.lineDivider} />
                            
                            <View style={s.forecastLineRow}>
                                <View style={[s.forecastIconBg, { backgroundColor: '#F0FDF4' }]}>
                                    <Feather name="zap" size={16} color="#10B981" />
                                </View>
                                <View style={s.forecastTextCol}>
                                    <Text style={s.forecastLineVal}>~{cap.dailyGrowthRate ?? 0}</Text>
                                    <Text style={s.forecastLineLbl}>Average daily growth</Text>
                                </View>
                            </View>

                            <View style={s.lineDivider} />
                            
                            <View style={s.forecastLineRow}>
                                <View style={[s.forecastIconBg, { backgroundColor: '#FFFBEB' }]}>
                                    <Feather name="clock" size={16} color="#F59E0B" />
                                </View>
                                <View style={s.forecastTextCol}>
                                    <Text style={s.forecastLineVal}>{cap.daysUntilFull === -1 ? '∞' : (cap.daysUntilFull ?? '—')}</Text>
                                    <Text style={s.forecastLineLbl}>Estimated days until system matches capacity</Text>
                                </View>
                            </View>
                            
                            {cap.callersNeeded > 0 && (
                                <>
                                    <View style={s.lineDivider} />
                                    <View style={s.forecastLineRow}>
                                        <View style={[s.forecastIconBg, { backgroundColor: '#FEF2F2' }]}>
                                            <Feather name="user-plus" size={16} color="#EF4444" />
                                        </View>
                                        <View style={s.forecastTextCol}>
                                            <Text style={[s.forecastLineVal, { color: '#EF4444' }]}>{cap.callersNeeded ?? 0}</Text>
                                            <Text style={s.forecastLineLbl}>Additional callers recommended</Text>
                                        </View>
                                    </View>
                                </>
                            )}
                        </View>

                        {/* ── 4. Top Performers ── */}
                        {performers.length > 0 && (
                            <>
                                <Text style={[s.sectionTitle, Theme.typography.common]}>Top Performers</Text>
                                <View style={s.premiumCardList}>
                                    {performers.map((p, i) => {
                                        const isTop3 = i < 3;
                                        return (
                                            <View key={p.id || i}>
                                                {i > 0 && <View style={s.listDivider} />}
                                                <View style={s.performerRow}>
                                                    
                                                    <View style={s.rankBadgeWrap}>
                                                        {i === 0 ? (
                                                            <LinearGradient colors={['#FDE68A', '#F59E0B']} style={StyleSheet.absoluteFill} />
                                                        ) : i === 1 ? (
                                                            <LinearGradient colors={['#E2E8F0', '#94A3B8']} style={StyleSheet.absoluteFill} />
                                                        ) : i === 2 ? (
                                                            <LinearGradient colors={['#FED7AA', '#F97316']} style={StyleSheet.absoluteFill} />
                                                        ) : (
                                                            <View style={{ backgroundColor: '#F8FAFC', flex: 1, borderWidth: 1, borderColor: '#E2E8F0' }} />
                                                        )}
                                                        <Text style={[s.rankNum, isTop3 && { color: '#FFFFFF' }]}>#{i + 1}</Text>
                                                    </View>
                                                    
                                                    <View style={s.performerInfo}>
                                                        <Text style={[s.performerName, Theme.typography.common]} numberOfLines={1}>{p.name}</Text>
                                                        <Text style={[s.performerSub, Theme.typography.common]} numberOfLines={1}>{p.calls} interactions registered</Text>
                                                    </View>
                                                    
                                                    <View style={s.scoreBox}>
                                                        <Text style={s.scoreText}>{p.score}%</Text>
                                                    </View>
                                                    
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            </>
                        )}
                        
                    </Animated.View>
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F4F7F9' },
    scroll: { flex: 1 },
    content: { padding: 20, paddingBottom: 120 },
    
    loadBox: { paddingVertical: 80, alignItems: 'center' },
    loadingText: { marginTop: 16, fontSize: 13, fontWeight: '600', color: '#64748B', letterSpacing: 0.5 },

    sectionTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A', letterSpacing: 1, marginTop: 20, marginBottom: 16, textTransform: 'uppercase' },

    // ── Safe 2x2 Stats Grid ──
    statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    statCardFlex: {
        flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16,
        borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.sharp, overflow: 'hidden'
    },
    cardBgIcon: { position: 'absolute', right: -10, bottom: -10, opacity: 0.7 },
    iconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    statVal: { fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
    statLbl: { fontSize: 12, fontWeight: '600', color: '#64748B', marginTop: 2 },

    // ── Premium Component Wrap ──
    premiumCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, paddingHorizontal: 20,
        borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.lg, shadowColor: '#64748B', shadowOpacity: 0.08, marginBottom: 16
    },
    premiumCardList: {
        backgroundColor: '#FFFFFF', borderRadius: 24, paddingVertical: 8,
        borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.lg, shadowColor: '#64748B', shadowOpacity: 0.08, marginBottom: 16
    },
    
    capacityHeader: { alignItems: 'center', marginBottom: 24, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 20 },
    capacityTotalCount: { fontSize: 36, fontWeight: '800', color: '#0F172A', letterSpacing: -1 },
    capacityTotalLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

    // ── Vertical Bar Chart ──
    barChartContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 260, paddingTop: 10 },
    barColumn: { alignItems: 'center', flex: 1 },
    barValueBadge: {
        backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
        borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.sm, marginBottom: 12, zIndex: 10
    },
    barValueText: { fontSize: 14, fontWeight: '800' },
    
    verticalTrack: { width: 44, height: 160, borderRadius: 22, overflow: 'hidden', justifyContent: 'flex-end' },
    verticalFill: { width: '100%', borderRadius: 22, overflow: 'hidden' },
    
    barFooter: { alignItems: 'center', marginTop: 12 },
    barFooterLbl: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 },

    // ── Forecast List Rows ──
    forecastLineRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
    forecastIconBg: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    forecastTextCol: { flex: 1 },
    forecastLineVal: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
    forecastLineLbl: { fontSize: 12, fontWeight: '500', color: '#64748B' },
    lineDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 4, marginLeft: 80, marginRight: 20 },

    // ── Performers ──
    performerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
    rankBadgeWrap: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginRight: 16 },
    rankNum: { fontSize: 14, fontWeight: '800', color: '#64748B' },
    performerInfo: { flex: 1, marginRight: 12 },
    performerName: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
    performerSub: { fontSize: 12, fontWeight: '500', color: '#64748B' },
    scoreBox: { backgroundColor: '#F0FDF4', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#D1FAE5' },
    scoreText: { fontSize: 12, fontWeight: '800', color: '#059669' },
    listDivider: { height: 1, backgroundColor: '#F1F5F9', marginLeft: 72, marginRight: 20 },
});
