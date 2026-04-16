import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, StatusBar, Animated } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../../theme/theme';
import { Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import { apiService } from '../../lib/api';

export default function CallerDashboard({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState(null);
    const [nextCall, setNextCall] = useState(null);
    const [callQueue, setCallQueue] = useState([]);

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;
    const progressAnim = useRef(new Animated.Value(0)).current;

    const fetchDashboardData = useCallback(async (isSilent = false) => {
        try {
            if (!isSilent) setLoading(true);
            const [dashRes, queueRes] = await Promise.all([
                apiService.caretaker.getDashboard(),
                apiService.caretaker.getCallQueue()
            ]);
            
            setStats(dashRes.data?.stats);
            setNextCall(dashRes.data?.nextCall);
            
            // Calculate and trigger Progress Animation
            const callsTotal = dashRes.data?.stats?.calls?.today?.total || 0;
            const callsCompleted = dashRes.data?.stats?.calls?.today?.completed || 0;
            const computedProgress = callsTotal === 0 ? 0 : (callsCompleted / callsTotal) * 100;
            
            // Format calls for the queue
            const callsData = (queueRes.data?.calls || []).map(call => ({
                id: call._id,
                name: call.patientId?.fullName || 'Unknown',
                patientId: call.patientId?._id,
                time: new Date(call.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                rawScheduledTime: call.scheduledTime,
                meds: call.medicationCount || 0,
                overdue: call.isOverdue || false,
                status: call.status || 'pending',
                attempts: call.attempts || 0,
                failedAttempts: call.failedAttempts || 0,
                patientAge: call.patientAge
            }));
            
            setCallQueue(callsData);

            if (!isSilent) {
                fadeAnim.setValue(0);
                slideAnim.setValue(25);
                progressAnim.setValue(0);
                
                Animated.parallel([
                    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
                    Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
                    Animated.spring(progressAnim, { toValue: computedProgress, bounciness: 6, delay: 200, useNativeDriver: false })
                ]).start();
            } else {
                Animated.spring(progressAnim, { toValue: computedProgress, bounciness: 6, useNativeDriver: false }).start();
            }
        } catch (error) {
            console.error('[CallerDashboard] Error fetching data:', error);
        } finally {
            if (!isSilent) setLoading(false);
            setRefreshing(false);
        }
    }, [fadeAnim, slideAnim]);

    useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchDashboardData(true);
    }, [fetchDashboardData]);

    const handleEmergencySOS = () => {
        Alert.alert(
            'Emergency SOS',
            'Are you sure you want to trigger emergency assistance?',
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: 'Call Emergency', 
                    style: 'destructive',
                    onPress: () => navigation.navigate('Emergency')
                }
            ]
        );
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <GradientHeader 
                title="Caller Dashboard" 
                subtitle="Daily Telemetry & Routing" 
                onBack={null} 
            />

            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.content}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
            >
                {/* ── Dashboard Stats ── */}

                {loading && !refreshing ? (
                    <View style={{ gap: 16 }}>
                        <View style={s.statsGridRow}>
                            <SkeletonLoader variant="stat" style={{ flex: 1, height: 110 }} />
                            <SkeletonLoader variant="stat" style={{ flex: 1, height: 110 }} />
                            <SkeletonLoader variant="stat" style={{ flex: 1, height: 110 }} />
                        </View>
                        <SkeletonLoader variant="card" style={{ height: 140 }} />
                        <SkeletonLoader variant="card" style={{ height: 180 }} />
                    </View>
                ) : (
                    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                        
                        {/* ── Action Metrics Grid ── */}
                        <View style={s.statsGridRow}>
                            <View style={s.kpiBlock}>
                                <Ionicons name="headset" size={40} color="#F8FAFC" style={s.kpiBgIcon} />
                                <View style={[s.kpiIconSquare, { backgroundColor: '#EEF2FF' }]}>
                                    <Feather name="headphones" size={16} color="#4F46E5" />
                                </View>
                                <Text style={s.kpiVal}>{stats?.calls?.today?.total || 0}</Text>
                                <Text style={s.kpiLbl}>Assigned</Text>
                            </View>

                            <View style={s.kpiBlock}>
                                <Ionicons name="checkmark-circle" size={40} color="#F8FAFC" style={s.kpiBgIcon} />
                                <View style={[s.kpiIconSquare, { backgroundColor: '#F0FDF4' }]}>
                                    <Feather name="check" size={16} color="#10B981" />
                                </View>
                                <Text style={s.kpiVal}>{stats?.calls?.today?.completed || 0}</Text>
                                <Text style={s.kpiLbl}>Completed</Text>
                            </View>

                            <View style={s.kpiBlock}>
                                <Ionicons name="time" size={40} color="#F8FAFC" style={s.kpiBgIcon} />
                                <View style={[s.kpiIconSquare, { backgroundColor: '#FFFBEB' }]}>
                                    <Feather name="clock" size={16} color="#F59E0B" />
                                </View>
                                <Text style={s.kpiVal}>{stats?.calls?.today?.pending || 0}</Text>
                                <Text style={s.kpiLbl}>Pending</Text>
                            </View>
                        </View>

                        {/* ── Daily Routing Progress ── */}
                        <View style={s.progressCard}>
                            <View style={s.progressHeader}>
                                <View style={s.progressLabelBox}>
                                    <View style={s.progressDot} />
                                    <Text style={s.progressTitle}>SHIFT ROUTING COMPLETION</Text>
                                </View>
                                <Text style={s.progressPercent}>{Math.round((stats?.calls?.today?.completed || 0) / Math.max((stats?.calls?.today?.total || 1), 1) * 100)}%</Text>
                            </View>
                            <View style={s.progressTrack}>
                                <Animated.View 
                                    style={[
                                        s.progressFill, 
                                        { 
                                            width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) 
                                        }
                                    ]} 
                                >
                                    <LinearGradient colors={['#3B82F6', '#2563EB']} style={StyleSheet.absoluteFill} start={{x:0, y:0}} end={{x:1, y:0}} />
                                </Animated.View>
                            </View>
                            <Text style={s.progressSubtext}>
                                {stats?.calls?.today?.completed || 0} of {stats?.calls?.today?.total || 0} calls completed this shift
                            </Text>
                        </View>

                        {/* ── Performance Twin Card ── */}
                        <View style={s.twinCard}>
                            <View style={s.twinHalf}>
                                <View style={[s.twinIcon, { backgroundColor: '#F5F3FF' }]}>
                                    <Feather name="activity" size={18} color="#8B5CF6" />
                                </View>
                                <View>
                                    <Text style={s.twinVal}>{stats?.adherence || 0}%</Text>
                                    <Text style={s.twinLbl}>Patient Adherence</Text>
                                </View>
                            </View>
                            
                            <View style={s.twinDivider} />
                            
                            <View style={s.twinHalf}>
                                <View style={[s.twinIcon, { backgroundColor: '#F1F5F9' }]}>
                                    <Feather name="watch" size={18} color="#64748B" />
                                </View>
                                <View>
                                    <Text style={s.twinVal}>
                                        {stats?.performance?.avgDuration
                                            ? `${Math.floor(stats.performance.avgDuration / 60)}m ${Math.round(stats.performance.avgDuration % 60)}s`
                                            : '0m 0s'}
                                    </Text>
                                    <Text style={s.twinLbl}>Avg Call Time</Text>
                                </View>
                            </View>
                        </View>

                        {/* ── Active Focus Protocol (Next Call) ── */}
                        {nextCall && (
                            <View style={[s.section, { marginTop: 12 }]}>
                                <Text style={s.sectionHeaderTitle}>Up Next Priority</Text>
                                <TouchableOpacity 
                                    style={s.focusCardWrapper} 
                                    activeOpacity={0.9}
                                    onPress={() => navigation.navigate('ActiveCall', { callId: nextCall.id, patientId: nextCall.patientId, patientName: nextCall.patient, scheduledTime: nextCall.scheduledTime })}
                                >
                                    <LinearGradient colors={['#0F172A', '#1E293B']} style={s.focusCardInner}>
                                        <Ionicons name="call" size={100} color="#1E293B" style={s.focusBgIcon} />
                                        
                                        <View style={s.focusTopRow}>
                                            <View style={s.focusAvatar}>
                                                <LinearGradient colors={['#4F46E5', '#6366F1']} style={StyleSheet.absoluteFill} />
                                                <Text style={s.focusInitials}>{nextCall.patient?.charAt(0) || 'P'}</Text>
                                                <View style={s.focusAvatarGlow}>
                                                    <View style={s.focusAvatarDot} />
                                                </View>
                                            </View>
                                            
                                            <View style={s.focusDetails}>
                                                <Text style={s.focusName} numberOfLines={1}>{nextCall.patient}</Text>
                                                <Text style={s.focusTime}>
                                                    {new Date(nextCall.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • In {nextCall.timeUntil}
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={s.focusActionRow}>
                                            <View style={s.focusPill}>
                                                <Feather name="info" size={12} color="#CBD5E1" />
                                                <Text style={s.focusPillText}>{nextCall.medCount || 0} Scheduled Meds</Text>
                                            </View>
                                            <View style={s.focusActionBtn}>
                                                <Feather name="phone-call" size={16} color="#FFFFFF" />
                                                <Text style={s.focusActionTxt}>Start Call</Text>
                                            </View>
                                        </View>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* ── Pending Queue ── */}
                        <View style={s.section}>
                            <View style={s.queueTitleRow}>
                                <Text style={s.sectionHeaderTitle}>Routing Queue</Text>
                                <View style={s.queueCountBadge}>
                                    <Text style={s.queueCountTxt}>{callQueue.filter(c => c.status === 'pending' || c.status === 'missed').length} UPCOMING</Text>
                                </View>
                            </View>
                            
                            {callQueue.length === 0 ? (
                                <View style={s.emptyQueueCard}>
                                    <View style={s.emptyQueueIconWrap}>
                                        <Feather name="coffee" size={28} color="#94A3B8" />
                                    </View>
                                    <Text style={s.emptyQueueTitle}>All Clear</Text>
                                    <Text style={s.emptyQueueSub}>You have completed all scheduled calls for today. Great job!</Text>
                                </View>
                            ) : (
                                <View style={s.queueListContainer}>
                                    {callQueue.map((call, index) => (
                                        <View key={call.id}>
                                            {index > 0 && <View style={s.queueDivider} />}
                                            <TouchableOpacity 
                                                style={[s.queueItemRow, call.overdue && s.queueItemOverdue]}
                                                activeOpacity={0.7}
                                                onPress={() => {
                                                    if (call.status === 'pending' || call.status === 'missed') {
                                                        navigation.navigate('ActiveCall', { 
                                                            callId: call.id, 
                                                            patientId: call.patientId, 
                                                            patientName: call.name, 
                                                            scheduledTime: call.rawScheduledTime 
                                                        });
                                                    } else {
                                                        navigation.navigate('PatientDetail', { patientId: call.patientId });
                                                    }
                                                }}
                                            >
                                                <View style={s.queueAvatarWrap}>
                                                    <LinearGradient colors={call.overdue ? ['#FEF2F2', '#FEE2E2'] : ['#F8FAFC', '#F1F5F9']} style={StyleSheet.absoluteFill} />
                                                    <Text style={[s.queueAvatarLetter, call.overdue && { color: '#EF4444' }]}>{call.name.charAt(0)}</Text>
                                                </View>
                                                
                                                <View style={s.queueItemDetails}>
                                                    <Text style={s.queueItemName}>{call.name}</Text>
                                                    <View style={s.queueItemMetrics}>
                                                        <Feather name="clock" size={10} color="#64748B" />
                                                        <Text style={s.queueItemTime}>{call.time}</Text>
                                                        <Text style={s.queueItemDot}>•</Text>
                                                        <Text style={s.queueItemMeds}>{call.meds} meds</Text>
                                                        {(call.status === 'pending' && call.failedAttempts > 0) && (
                                                            <>
                                                                <Text style={s.queueItemDot}>•</Text>
                                                                <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '800' }}>Attempt {call.failedAttempts + 1}/3</Text>
                                                            </>
                                                        )}
                                                        {call.status === 'missed' && (
                                                            <>
                                                                <Text style={s.queueItemDot}>•</Text>
                                                                <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '800' }}>Max Attempts Reached</Text>
                                                            </>
                                                        )}
                                                    </View>
                                                </View>

                                                <View style={s.queueStatusBlock}>
                                                    {call.overdue ? (
                                                        <View style={s.overdueBadge}>
                                                            <Feather name="alert-circle" size={10} color="#EF4444" />
                                                            <Text style={s.overdueText}>LATE</Text>
                                                        </View>
                                                    ) : call.status === 'completed' ? (
                                                        <View style={s.completedBadge}>
                                                            <Feather name="check" size={12} color="#10B981" />
                                                        </View>
                                                    ) : (
                                                        <View style={s.arrowBox}>
                                                            <Feather name="chevron-right" size={16} color="#CBD5E1" />
                                                        </View>
                                                    )}
                                                </View>
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>

                        {/* ── Emergency Action ── */}
                        <TouchableOpacity style={s.emergencySOSBtn} activeOpacity={0.85} onPress={handleEmergencySOS}>
                            <Feather name="alert-triangle" size={18} color="#FFFFFF" />
                            <Text style={s.emergencySOSTxt}>Trigger Emergency SOS</Text>
                        </TouchableOpacity>

                    </Animated.View>
                )}
            </ScrollView>
        </View>
    );
}

// ══════════════════════════════════════════
// Solid HD Premium Aesthetic
// ══════════════════════════════════════════
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F4F7F9' },
    scroll: { flex: 1 },
    content: { padding: 20, paddingBottom: 140 },

    // Hero
    heroGroup: { marginBottom: 24, paddingTop: 10 },
    heroDateBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginBottom: 12 },
    heroDateText: { fontSize: 11, fontWeight: '800', color: '#4F46E5', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 6 },
    heroTitle: { fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5, marginBottom: 4 },
    heroSubtitle: { fontSize: 14, fontWeight: '500', color: '#64748B' },

    // KPIs
    statsGridRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    kpiBlock: {
        flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16,
        borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.sm, overflow: 'hidden'
    },
    kpiBgIcon: { position: 'absolute', bottom: -10, right: -10, opacity: 0.6 },
    kpiIconSquare: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    kpiVal: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
    kpiLbl: { fontSize: 11, fontWeight: '700', color: '#94A3B8', marginTop: 4, textTransform: 'uppercase' },

    // Progress Bar
    progressCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20,
        borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.md, marginBottom: 24
    },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
    progressLabelBox: { flexDirection: 'row', alignItems: 'center' },
    progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2563EB', marginRight: 8 },
    progressTitle: { fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 0.5 },
    progressPercent: { fontSize: 28, fontWeight: '900', color: '#0F172A', letterSpacing: -1, lineHeight: 30 },
    progressTrack: { height: 16, backgroundColor: '#EEF2FF', borderRadius: 8, overflow: 'hidden', marginBottom: 16 },
    progressFill: { height: '100%', borderRadius: 8 },
    progressSubtext: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },

    // Twin Card
    twinCard: {
        flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20,
        borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.md, marginBottom: 32
    },
    twinHalf: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    twinIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    twinVal: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
    twinLbl: { fontSize: 11, fontWeight: '600', color: '#64748B', marginTop: 2, textTransform: 'uppercase' },
    twinDivider: { width: 1, backgroundColor: '#F1F5F9', marginHorizontal: 20 },

    // Sections
    section: { marginBottom: 32 },
    sectionHeaderTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16, paddingLeft: 4 },
    
    // Focus Active Protocol
    focusCardWrapper: { borderRadius: 24, ...Shadows.lg, shadowColor: '#0F172A', shadowOpacity: 0.15 },
    focusCardInner: { borderRadius: 24, padding: 24, overflow: 'hidden' },
    focusBgIcon: { position: 'absolute', right: -20, top: -20, opacity: 0.05, transform: [{rotate: '-15deg'}] },
    
    focusTopRow: { flexDirection: 'row', alignItems: 'center' },
    focusAvatar: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#334155' },
    focusInitials: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
    focusAvatarGlow: { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#0F172A', padding: 2, borderRadius: 10 },
    focusAvatarDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981' },
    focusDetails: { flex: 1 },
    focusName: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
    focusTime: { fontSize: 13, fontWeight: '500', color: '#94A3B8' },

    focusActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
    focusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
    focusPillText: { fontSize: 12, fontWeight: '600', color: '#CBD5E1' },
    focusActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
    focusActionTxt: { fontSize: 13, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase' },

    // Queue 
    queueTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    queueCountBadge: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#EEF2FF', borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#E0E7FF' },
    queueCountTxt: { fontSize: 11, fontWeight: '800', color: '#4F46E5', letterSpacing: 0.5 },
    
    queueListContainer: { backgroundColor: '#FFFFFF', borderRadius: 24, paddingVertical: 8, borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.md },
    queueItemRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
    queueItemOverdue: { backgroundColor: '#FEF2F2' },
    queueAvatarWrap: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 16, overflow: 'hidden' },
    queueAvatarLetter: { fontSize: 16, fontWeight: '800', color: '#64748B' },
    queueItemDetails: { flex: 1, marginRight: 12 },
    queueItemName: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
    queueItemMetrics: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    queueItemTime: { fontSize: 12, fontWeight: '600', color: '#64748B' },
    queueItemDot: { fontSize: 10, color: '#CBD5E1', marginHorizontal: 2 },
    queueItemMeds: { fontSize: 12, fontWeight: '600', color: '#64748B' },
    
    queueStatusBlock: { justifyContent: 'center', alignItems: 'center' },
    overdueBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },
    overdueText: { fontSize: 10, fontWeight: '800', color: '#EF4444' },
    completedBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#D1FAE5', justifyContent: 'center', alignItems: 'center' },
    arrowBox: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    queueDivider: { height: 1, backgroundColor: '#F1F5F9', marginLeft: 80, marginRight: 20 },

    emptyQueueCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.md },
    emptyQueueIconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    emptyQueueTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 6 },
    emptyQueueSub: { fontSize: 13, fontWeight: '500', color: '#64748B', textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },

    // Emergency
    emergencySOSBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#EF4444', borderRadius: 20, paddingVertical: 20, ...Shadows.lg, shadowColor: '#EF4444', shadowOpacity: 0.3 },
    emergencySOSTxt: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 1 },
});
