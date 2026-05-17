import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, StatusBar, Animated, Modal, Dimensions } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { Theme } from '../../theme/theme';
import { Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
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
    const [confirmModal, setConfirmModal] = useState({ visible: false, callId: null, patientId: null, patientName: '', scheduledTime: null, attempts: 0 });
    const modalScaleAnim = useRef(new Animated.Value(0)).current;
    const modalOpacityAnim = useRef(new Animated.Value(0)).current;

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

    useFocusEffect(
        useCallback(() => {
            fetchDashboardData();
        }, [fetchDashboardData])
    );

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchDashboardData(true);
    }, [fetchDashboardData]);

    const openConfirmModal = (callId, patientId, patientName, scheduledTime, attempts = 0) => {
        setConfirmModal({ visible: true, callId, patientId, patientName, scheduledTime, attempts });
        modalScaleAnim.setValue(0.85);
        modalOpacityAnim.setValue(0);
        Animated.parallel([
            Animated.spring(modalScaleAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
            Animated.timing(modalOpacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();
    };

    const closeConfirmModal = () => {
        Animated.parallel([
            Animated.timing(modalScaleAnim, { toValue: 0.85, duration: 150, useNativeDriver: true }),
            Animated.timing(modalOpacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        ]).start(() => {
            setConfirmModal({ visible: false, callId: null, patientId: null, patientName: '', scheduledTime: null, attempts: 0 });
        });
    };

    const confirmAndNavigate = () => {
        const { callId, patientId, patientName, scheduledTime } = confirmModal;
        setConfirmModal({ visible: false, callId: null, patientId: null, patientName: '', scheduledTime: null, attempts: 0 });
        navigation.navigate('ActiveCall', { callId, patientId, patientName, scheduledTime });
    };

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
                                    onPress={() => openConfirmModal(nextCall.id, nextCall.patientId, nextCall.patient, nextCall.scheduledTime, nextCall.failedAttempts || 0)}
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
                                                        openConfirmModal(call.id, call.patientId, call.name, call.rawScheduledTime, call.failedAttempts || 0);
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

            {/* ── Call Confirmation Modal ── */}
            <Modal
                visible={confirmModal.visible}
                transparent={true}
                animationType="none"
                statusBarTranslucent={true}
                onRequestClose={closeConfirmModal}
            >
                <View style={s.cmOverlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeConfirmModal} />
                    <Animated.View style={[s.cmSheet, { opacity: modalOpacityAnim, transform: [{ scale: modalScaleAnim }] }]}>
                        
                        {/* ── Hero Icon with Glow Rings ── */}
                        <View style={s.cmHeroSection}>
                            <View style={s.cmIconOuterRing}>
                                <View style={s.cmIconMiddleRing}>
                                    <View style={s.cmIconCircle}>
                                        <LinearGradient colors={['#4F46E5', '#6366F1']} style={StyleSheet.absoluteFill} />
                                        <Ionicons name="call" size={26} color="#FFFFFF" />
                                    </View>
                                </View>
                            </View>
                            <Text style={s.cmTitle}>Confirm Call</Text>
                            <Text style={s.cmSubtitle}>You're about to connect with a patient</Text>
                        </View>

                        {/* ── Divider ── */}
                        <View style={s.cmDivider} />

                        {/* ── Patient Row ── */}
                        <View style={s.cmPatientRow}>
                            <View style={s.cmAvatar}>
                                <LinearGradient colors={['#6366F1', '#818CF8']} style={StyleSheet.absoluteFill} />
                                <Text style={s.cmAvatarLetter}>{confirmModal.patientName?.charAt(0) || 'P'}</Text>
                            </View>
                            <View style={s.cmPatientInfo}>
                                <Text style={s.cmPatientName} numberOfLines={1}>{confirmModal.patientName}</Text>
                                <View style={s.cmMetaRow}>
                                    {confirmModal.scheduledTime && (
                                        <>
                                            <Feather name="clock" size={11} color="#94A3B8" />
                                            <Text style={s.cmMetaText}>
                                                {new Date(confirmModal.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </Text>
                                        </>
                                    )}
                                </View>
                            </View>
                            <View style={s.cmStatusChip}>
                                <View style={s.cmStatusDot} />
                                <Text style={s.cmStatusText}>Ready</Text>
                            </View>
                        </View>

                        {/* ── Attempt Donut ── */}
                        {(() => {
                            const used = confirmModal.attempts || 0;
                            const total = 3;
                            const left = Math.max(total - used - 1, 0);
                            
                            // SVG donut params
                            const size = 100;
                            const strokeWidth = 10;
                            const radius = (size - strokeWidth) / 2;
                            const circumference = 2 * Math.PI * radius;
                            const gap = 8; // gap in px between segments
                            const segmentLength = (circumference - gap * total) / total;
                            
                            const getSegmentProps = (index) => {
                                const offset = index * (segmentLength + gap);
                                return {
                                    strokeDasharray: `${segmentLength} ${circumference - segmentLength}`,
                                    strokeDashoffset: -offset,
                                };
                            };
                            
                            const getColor = (index) => {
                                if (index < used) return '#EF4444';
                                if (index === used) return '#F59E0B';
                                return '#E8ECF1';
                            };

                            return (
                                <View style={s.cmDonutSection}>
                                    <View style={s.cmDonutRow}>
                                        <View style={s.cmDonutWrap}>
                                            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                                                {[0, 1, 2].map(i => (
                                                    <Circle
                                                        key={i}
                                                        cx={size / 2}
                                                        cy={size / 2}
                                                        r={radius}
                                                        fill="none"
                                                        stroke={getColor(i)}
                                                        strokeWidth={strokeWidth}
                                                        strokeLinecap="round"
                                                        transform={`rotate(-90 ${size / 2} ${size / 2})`}
                                                        {...getSegmentProps(i)}
                                                    />
                                                ))}
                                            </Svg>
                                            <View style={s.cmDonutCenter}>
                                                <Text style={s.cmDonutNum}>{used + 1}</Text>
                                                <Text style={s.cmDonutOf}>of {total}</Text>
                                            </View>
                                        </View>

                                        <View style={s.cmDonutLegend}>
                                            <Text style={s.cmDonutLegendTitle}>SHIFT ATTEMPTS</Text>
                                            {used > 0 && (
                                                <View style={s.cmLegendItem}>
                                                    <View style={[s.cmLegendDot, { backgroundColor: '#EF4444' }]} />
                                                    <Text style={s.cmLegendLabel}>{used} Used</Text>
                                                </View>
                                            )}
                                            <View style={s.cmLegendItem}>
                                                <View style={[s.cmLegendDot, { backgroundColor: '#F59E0B' }]} />
                                                <Text style={[s.cmLegendLabel, { color: '#0F172A', fontWeight: '700' }]}>This Call</Text>
                                            </View>
                                            {left > 0 && (
                                                <View style={s.cmLegendItem}>
                                                    <View style={[s.cmLegendDot, { backgroundColor: '#E8ECF1' }]} />
                                                    <Text style={s.cmLegendLabel}>{left} Remaining</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>

                                    <View style={s.cmShiftNote}>
                                        <Feather name="alert-circle" size={13} color={used >= 2 ? '#EF4444' : '#94A3B8'} />
                                        <Text style={[s.cmShiftNoteText, used >= 2 && { color: '#EF4444', fontWeight: '600' }]}>
                                            {used >= 2
                                                ? 'Final attempt this shift — no retries if unanswered.'
                                                : 'Unnecessary calls waste limited shift attempts.'}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })()}

                        {/* ── Buttons ── */}
                        <View style={s.cmBtnRow}>
                            <TouchableOpacity style={s.cmBtnCancel} activeOpacity={0.7} onPress={closeConfirmModal}>
                                <Text style={s.cmBtnCancelText}>Not Now</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.cmBtnConfirm} activeOpacity={0.85} onPress={confirmAndNavigate}>
                                <LinearGradient colors={['#4F46E5', '#4338CA']} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFill} />
                                <Ionicons name="call" size={17} color="#FFFFFF" />
                                <Text style={s.cmBtnConfirmText}>Start Call</Text>
                            </TouchableOpacity>
                        </View>

                    </Animated.View>
                </View>
            </Modal>
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

    // ═══ Confirmation Modal ═══
    cmOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    cmSheet: {
        width: '100%', maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 28,
        ...Shadows.lg, shadowColor: '#1E293B', shadowOpacity: 0.15, shadowRadius: 30, shadowOffset: { width: 0, height: 12 },
        elevation: 20,
    },

    // Hero
    cmHeroSection: { alignItems: 'center', paddingTop: 36, paddingBottom: 24, paddingHorizontal: 32 },
    cmIconOuterRing: {
        width: 88, height: 88, borderRadius: 44,
        backgroundColor: '#EEF2FF',
        justifyContent: 'center', alignItems: 'center',
    },
    cmIconMiddleRing: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: '#E0E7FF',
        justifyContent: 'center', alignItems: 'center',
    },
    cmIconCircle: {
        width: 56, height: 56, borderRadius: 28,
        justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    },
    cmTitle: { fontSize: 21, fontWeight: '800', color: '#0F172A', marginTop: 20, letterSpacing: -0.3 },
    cmSubtitle: { fontSize: 13.5, fontWeight: '500', color: '#94A3B8', marginTop: 6, textAlign: 'center', lineHeight: 19 },

    // Divider
    cmDivider: { height: 1, backgroundColor: '#F1F5F9', marginHorizontal: 28 },

    // Patient
    cmPatientRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 20 },
    cmAvatar: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginRight: 14 },
    cmAvatarLetter: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
    cmPatientInfo: { flex: 1 },
    cmPatientName: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 3 },
    cmMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    cmMetaText: { fontSize: 12.5, fontWeight: '500', color: '#94A3B8' },
    cmStatusChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F0FDF4', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: '#D1FAE5' },
    cmStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
    cmStatusText: { fontSize: 11, fontWeight: '700', color: '#059669', textTransform: 'uppercase', letterSpacing: 0.3 },

    // Donut Chart
    cmDonutSection: { paddingHorizontal: 28, paddingBottom: 18 },
    cmDonutRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
    cmDonutWrap: { width: 100, height: 100, justifyContent: 'center', alignItems: 'center' },
    cmDonutCenter: {
        position: 'absolute', width: 60, height: 60, borderRadius: 30,
        backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
        ...Shadows.sm, shadowColor: '#64748B', shadowOpacity: 0.06,
    },
    cmDonutNum: { fontSize: 22, fontWeight: '900', color: '#0F172A', letterSpacing: -1 },
    cmDonutOf: { fontSize: 11, fontWeight: '600', color: '#94A3B8', marginTop: -2 },
    
    // Legend
    cmDonutLegend: { flex: 1, gap: 10 },
    cmDonutLegendTitle: { fontSize: 10, fontWeight: '900', color: '#CBD5E1', letterSpacing: 1.5, marginBottom: 2 },
    cmLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cmLegendDot: { width: 8, height: 8, borderRadius: 4 },
    cmLegendLabel: { fontSize: 13, fontWeight: '500', color: '#64748B' },
    
    // Shift Note
    cmShiftNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingHorizontal: 2 },
    cmShiftNoteText: { fontSize: 12, fontWeight: '500', color: '#94A3B8', flex: 1 },

    // Buttons
    cmBtnRow: { flexDirection: 'row', gap: 10, padding: 28, paddingTop: 20 },
    cmBtnCancel: { flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#E2E8F0' },
    cmBtnCancelText: { fontSize: 15, fontWeight: '700', color: '#64748B' },
    cmBtnConfirm: { flex: 1.5, flexDirection: 'row', gap: 8, paddingVertical: 16, borderRadius: 16, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', ...Shadows.md, shadowColor: '#4F46E5', shadowOpacity: 0.25 },
    cmBtnConfirmText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
});
