import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Animated, Dimensions } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../../theme/theme';
import { Shadows } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import EmptyState from '../../components/common/EmptyState';
import { apiService } from '../../lib/api';

const { width } = Dimensions.get('window');
const FILTERS = ['All', 'Completed', 'Missed'];

// Simple inline animated bar chart for analytics
const InlineBarChart = ({ logs }) => {
    // Basic aggregation: Group last 5 days
    const chartData = [...Array(5)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (4 - i));
        return { 
            day: d.toLocaleDateString('en-US', { weekday: 'short' }), 
            dateKey: d.toDateString(),
            completed: 0,
            missed: 0 
        };
    });

    logs.forEach(c => {
        if (!c.scheduledTime) return;
        const cDate = new Date(c.scheduledTime).toDateString();
        const target = chartData.find(d => d.dateKey === cDate);
        if (target) {
            if (c.status === 'completed') target.completed += 1;
            else if (['missed', 'no_answer'].includes(c.status)) target.missed += 1;
        }
    });

    const maxVal = Math.max(...chartData.map(d => d.completed + d.missed), 10);
    const chartHeight = 80;

    return (
        <View style={s.chartCard}>
            <Text style={s.chartTitle}>5-Day Performance Metrics</Text>
            
            <View style={s.chartBarsWrap}>
                {chartData.map((d, i) => {
                    const completedH = (d.completed / maxVal) * chartHeight;
                    const missedH = (d.missed / maxVal) * chartHeight;
                    return (
                        <View key={i} style={s.barCol}>
                            <View style={[s.barTrack, { height: chartHeight }]}>
                                {/* Stacked bars */}
                                {d.missed > 0 && <View style={[s.barMissed, { height: missedH }]} />}
                                {d.completed > 0 && <View style={[s.barDone, { height: completedH, bottom: missedH > 0 ? missedH : 0 }]} />}
                            </View>
                            <Text style={s.barLbl}>{d.day}</Text>
                        </View>
                    );
                })}
            </View>
            <View style={s.chartLegend}>
                <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: '#10B981' }]} />
                    <Text style={s.legendTxt}>Completed</Text>
                </View>
                <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: '#EF4444' }]} />
                    <Text style={s.legendTxt}>Missed</Text>
                </View>
            </View>
        </View>
    );
};

export default function CallHistoryScreen({ navigation }) {
    const [filter, setFilter] = useState('All');
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [calls, setCalls] = useState([]);

    const fetchCalls = useCallback(async (isRefresh = false) => {
        try {
            if (!isRefresh) setLoading(true);
            const res = await apiService.calls.getHistory();
            setCalls(res.data?.calls || []);
        } catch (error) {
            console.error('Failed to fetch call history:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchCalls(); }, [fetchCalls]);

    const onRefresh = useCallback(() => { setRefreshing(true); fetchCalls(true); }, [fetchCalls]);

    const getFormattedDate = (dateString) => {
        if (!dateString) return 'Unknown Date';
        const date = new Date(dateString);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (date.toDateString() === today.toDateString()) return 'Today';
        if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    };

    const getFormattedTime = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getMoodColor = (mood, isDone) => {
        const m = (mood || (isDone ? 'good' : 'bad')).toLowerCase();
        if (m === 'good' || m === 'happy') return ['#10B981', '#34D399']; // Emerald Green
        if (m === 'bad' || m === 'sad' || m === 'unwell') return ['#EF4444', '#F87171']; // Red
        return ['#F59E0B', '#FBBF24']; // Amber
    };

    let filtered = calls;
    if (filter === 'Completed') filtered = calls.filter(c => c.status === 'completed');
    if (filter === 'Missed') filtered = calls.filter(c => ['missed', 'no_answer'].includes(c.status));

    // Group by date
    const grouped = {};
    filtered.forEach(c => {
        const dLabel = getFormattedDate(c.scheduledTime);
        if (!grouped[dLabel]) grouped[dLabel] = [];
        grouped[dLabel].push(c);
    });

    return (
        <View style={s.container}>
            <GradientHeader title="Call Telemetry" subtitle={`Total Log: ${calls.length} Routings`} />

            {/* ── Premium Pills ── */}
            <View style={s.filterRow}>
                {FILTERS.map(f => (
                    <TouchableOpacity key={f} onPress={() => setFilter(f)}
                        style={[s.filterTab, filter === f && s.filterActive]} activeOpacity={0.8}>
                        <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f}</Text>
                        {filter === f && <Feather name="check" size={14} color="#FFFFFF" style={{ marginLeft: 6 }} />}
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView 
                style={s.body} 
                contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 20 }} 
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
            >
                {/* ── Inline Analytics Bar ── */}
                {!loading && calls.length > 0 && <InlineBarChart logs={calls} />}

                {loading && !refreshing ? (
                    <View style={{ paddingTop: 40, alignItems: 'center' }}>
                        <Text style={{ textAlign: 'center', color: '#64748B', fontSize: 13, fontWeight: '600' }}>Fetching telemetry logs...</Text>
                    </View>
                ) : filtered.length === 0 ? (
                    <View style={s.emptyCard}>
                        <Ionicons name="recording-outline" size={80} color="#F8FAFC" style={s.emptyBgIcon} />
                        <View style={s.emptyIconWrap}>
                            <Feather name="clipboard" size={32} color="#94A3B8" />
                        </View>
                        <Text style={s.emptyTitle}>Log Empty</Text>
                        <Text style={s.emptySub}>{`There are no ${filter.toLowerCase()} telemetry logs in this frame.`}</Text>
                    </View>
                ) : (
                    Object.entries(grouped).map(([date, groupCalls]) => (
                        <View key={date} style={s.dateGroup}>
                            <Text style={s.dateLabel}>{date}</Text>
                            <View style={{ gap: 14 }}>
                                {groupCalls.map(c => {
                                    const isDone = c.status === 'completed';
                                    const mColors = getMoodColor(c.patientMood, isDone);
                                    
                                    return (
                                        <TouchableOpacity key={c._id} style={s.callCard} activeOpacity={0.8}
                                            onPress={() => navigation.navigate('PatientDetail', { patientId: c.patientId?._id })}>
                                            <View style={s.callRow}>
                                                
                                                <View style={s.moodIconBox}>
                                                    <LinearGradient colors={mColors} style={StyleSheet.absoluteFill} />
                                                    <Feather name={isDone ? 'phone-call' : 'phone-missed'} size={20} color="#FFFFFF" />
                                                </View>
                                                
                                                <View style={{ flex: 1, paddingRight: 12 }}>
                                                    <Text style={s.callPatient} numberOfLines={1}>{c.patientId?.fullName || 'Unknown Route'}</Text>
                                                    <View style={s.callMetrics}>
                                                        <Feather name="clock" size={12} color="#94A3B8" />
                                                        <Text style={s.callSub}>{getFormattedTime(c.scheduledTime)}</Text>
                                                        {isDone && <Text style={s.callDot}>•</Text>}
                                                        {isDone && <Text style={s.callSub}>{c.durationFormatted || '--'}</Text>}
                                                    </View>
                                                </View>
                                                
                                                <View style={[s.statusPill, { backgroundColor: isDone ? '#F0FDF4' : '#FEF2F2', borderColor: isDone ? '#D1FAE5' : '#FECACA' }]}>
                                                    <Text style={[s.statusText, { color: isDone ? '#10B981' : '#EF4444' }]}>
                                                        {(c.status || '').replace('_', ' ').toUpperCase()}
                                                    </Text>
                                                </View>
                                            </View>
                                            
                                            {/* ── Call Details & Medications ── */}
                                            {isDone && c.medicationSummary && (
                                                <View style={s.medsSummaryBox}>
                                                    <View style={s.medsSummaryHeader}>
                                                        <Text style={s.medsSummaryTitle}>Medications Verified</Text>
                                                        <View style={[s.medsSummaryCountBox, { backgroundColor: c.medicationSummary.confirmed === c.medicationSummary.total && c.medicationSummary.total > 0 ? '#ECFDF5' : '#FEF2F2' }]}>
                                                            <Text style={[s.medsSummaryCountTxt, { color: c.medicationSummary.confirmed === c.medicationSummary.total && c.medicationSummary.total > 0 ? '#059669' : '#EF4444' }]}>
                                                                {c.medicationSummary.confirmed} / {c.medicationSummary.total}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    {c.medicationSummary.details && c.medicationSummary.details.length > 0 && (
                                                        <View style={s.medsDetailList}>
                                                            {c.medicationSummary.details.map((m, i) => (
                                                                <View key={i} style={s.medsDetailItem}>
                                                                    <Feather name={m.confirmed ? "check" : "x"} size={12} color={m.confirmed ? "#10B981" : "#EF4444"} />
                                                                    <Text style={s.medsDetailName}>{m.name}</Text>
                                                                </View>
                                                            ))}
                                                        </View>
                                                    )}
                                                </View>
                                            )}
                                            
                                            {c.notes ? (
                                                <View style={s.notesBox}>
                                                    <Feather name="align-left" size={12} color="#94A3B8" />
                                                    <Text style={s.notesText}>"{c.notes}"</Text>
                                                </View>
                                            ) : null}
                                            
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F7F9' },
    body: { flex: 1 },
    
    // Filters
    filterRow: { 
        flexDirection: 'row', 
        paddingHorizontal: 20, 
        paddingVertical: 16, 
        gap: 12, 
        backgroundColor: '#F4F7F9',
        justifyContent: 'center'
    },
    filterTab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.sm },
    filterActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5', ...Shadows.md, shadowColor: '#4F46E5' },
    filterText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
    filterTextActive: { color: '#FFFFFF', fontWeight: '800' },
    
    // Lists
    dateGroup: { marginTop: 10, marginBottom: 20 },
    dateLabel: { fontSize: 12, fontWeight: '800', color: '#94A3B8', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1, marginLeft: 4 },
    
    callCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20,
        borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.md, shadowColor: '#64748B', shadowOpacity: 0.08
    },
    callRow: { flexDirection: 'row', alignItems: 'center' },
    moodIconBox: { width: 50, height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 16, overflow: 'hidden' },
    
    callPatient: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 6, letterSpacing: -0.2 },
    
    callMetrics: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    callSub: { fontSize: 12, fontWeight: '600', color: '#64748B' },
    callDot: { fontSize: 10, color: '#CBD5E1' },
    
    statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
    statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

    // Empty state
    emptyCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 20 },
    emptyBgIcon: { position: 'absolute', opacity: 0.5 },
    emptyIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
    emptySub: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, maxWidth: '80%' },
    
    // Meds Summary
    medsSummaryBox: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
    medsSummaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    medsSummaryTitle: { fontSize: 13, fontWeight: '700', color: '#64748B' },
    medsSummaryCountBox: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    medsSummaryCountTxt: { fontSize: 12, fontWeight: '800' },
    medsDetailList: { marginTop: 10, gap: 6, backgroundColor: '#F8FAFC', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#F1F5F9' },
    medsDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    medsDetailName: { fontSize: 13, color: '#334155', fontWeight: '500' },
    
    // Notes Box
    notesBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
    notesText: { fontSize: 13, color: '#64748B', fontStyle: 'italic', flex: 1, lineHeight: 18 },

    // Inline Bar Chart
    chartCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24,
        marginBottom: 24, marginTop: 10,
        borderWidth: 1, borderColor: '#F1F5F9',
        ...Shadows.md
    },
    chartTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 20 },
    chartBarsWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 100, marginBottom: 20, paddingHorizontal: 10 },
    barCol: { alignItems: 'center', width: 30 },
    barTrack: { width: 14, backgroundColor: '#F8FAFC', borderRadius: 7, overflow: 'hidden', justifyContent: 'flex-end', borderWidth: 1, borderColor: '#F1F5F9' },
    barMissed: { width: '100%', backgroundColor: '#EF4444', position: 'absolute', zIndex: 1 },
    barDone: { width: '100%', backgroundColor: '#10B981', position: 'absolute', zIndex: 2, borderTopLeftRadius: 7, borderTopRightRadius: 7 },
    barLbl: { fontSize: 10, fontWeight: '700', color: '#94A3B8', marginTop: 10, textTransform: 'uppercase' },

    chartLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 16 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendTxt: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }
});
