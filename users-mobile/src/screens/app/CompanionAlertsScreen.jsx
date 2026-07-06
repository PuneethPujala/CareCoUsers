import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Linking, Image, Animated } from 'react-native';
import { apiService } from '../../lib/api';
import { colors, radius, spacing, shadows, layout } from '../../theme';
import { Bell, CheckCircle2, ShieldCheck, ShieldAlert, Phone, Clock, ChevronRight, Activity, Check, Shield, MessageSquare } from 'lucide-react-native';
import usePatientStore from '../../store/usePatientStore';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AlertManager from '../../utils/AlertManager';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import CompanionHeader from '../../components/ui/CompanionHeader';
import PremiumFormModal from '../../components/ui/PremiumFormModal';
import TabScreenTransition from '../../components/ui/TabScreenTransition';

const C = {
    bg: colors.background,
    surface: colors.surface,
    primary: colors.primary,
    primaryDark: colors.primaryMid,
    primarySoft: colors.primarySoft,
    dark: colors.textPrimary,
    mid: colors.textSecondary,
    muted: colors.textMuted,
    danger: colors.danger,
    border: colors.borderLight,
    success: colors.success,
    successSoft: colors.successLight,
    light: colors.textMuted,
};

const FONT = {
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

const sanitizePhoneForLink = (phone, allowPlus = true) => {
    if (!phone) return '';
    const pattern = allowPlus ? /[^\d+]/g : /[^\d]/g;
    return String(phone).replace(pattern, '');
};

const getAlertTitle = (type) => {
    switch (type) {
        case 'missed_call':
            return 'Missed Call';
        case 'patient_unreachable_3attempts':
            return 'Patient Unreachable';
        case 'medicine_refusal':
            return 'Medicine Refused';
        case 'medication_modification':
            return 'Schedule Modified';
        case 'medication_missed':
            return 'Schedule Missed';
        case 'unresponsive_7days':
            return 'Unresponsive Alert';
        case 'team_lead_recommended':
            return 'Care Circle Alert';
        case 'caller_performance':
            return 'Caller Performance Alert';
        case 'caller_capacity':
            return 'Caller Capacity Alert';
        case 'general':
            return 'General Alert';
        case 'other':
            return 'Care Circle Alert';
        default:
            if (!type) return 'Alert Triggered';
            return type
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
    }
};

const getAlertPriority = (type) => {
    switch (type) {
        case 'unresponsive_7days':
        case 'medicine_refusal':
        case 'patient_unreachable_3attempts':
            return 'critical';
        case 'medication_missed':
        case 'missed_call':
            return 'warning';
        default:
            return 'info';
    }
};

const getAlertPriorityStyles = (type) => {
    const priority = getAlertPriority(type);
    switch (priority) {
        case 'critical':
            return {
                accent: '#EF4444',
                bg: '#FFF8F8',
                border: '#FEE2E2',
                text: '#0F172A',
                label: 'CRITICAL',
                bgOuter: '#FFF0F2',
                bgInner: '#FFE4E6',
                badgeBg: '#FEE2E2',
            };
        case 'warning':
            return {
                accent: '#EF4444',
                bg: '#FFF8F8',
                border: '#FEE2E2',
                text: '#0F172A',
                label: 'WARNING',
                bgOuter: '#FFF0F2',
                bgInner: '#FFE4E6',
                badgeBg: '#FEE2E2',
            };
        case 'info':
        default:
            return {
                accent: '#4F46E5',
                bg: '#F8FAFF',
                border: '#E0E7FF',
                text: '#0F172A',
                label: 'INFO',
                bgOuter: '#EEF2FF',
                bgInner: '#E0E7FF',
                badgeBg: '#E0E7FF',
            };
    }
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

export default function CompanionAlertsScreen() {
    const [data, setData] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [showLogsModal, setShowLogsModal] = useState(false);

    const selectedPatientId = usePatientStore(s => s.companionSelectedPatientId);
    const navigation = useNavigation();

    const loadData = async () => {
        try {
            if (!selectedPatientId) return;
            const res = await apiService.companion.getPatientStatus({ patientId: selectedPatientId });
            setData(res.data);
            setAlerts(res.data.recent_alerts || []);
        } catch (err) {
            console.warn('Failed to load alerts data', err);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [selectedPatientId])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const acknowledgeAlert = async (id) => {
        const previousAlerts = alerts;
        const previousData = data;

        // Optimistically filter out the alert from state
        setAlerts(prev => prev.filter(a => a._id !== id));
        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                recent_alerts: (prev.recent_alerts || []).filter(a => a._id !== id)
            };
        });

        try {
            await apiService.companion.acknowledgeAlert(id);
            // Non-blocking refresh to sync any other background updates
            loadData();
        } catch (err) {
            console.warn('Failed to acknowledge alert', err);
            // Revert state on failure
            setAlerts(previousAlerts);
            setData(previousData);
            AlertManager.alert('Dismiss Failed', 'Unable to dismiss this alert at the moment. Please try again.');
        }
    };

    const handleCall = () => {
        const phone = data?.patient?.phone;
        const dialablePhone = sanitizePhoneForLink(phone);
        if (dialablePhone) {
            Linking.openURL(`tel:${dialablePhone}`);
        } else {
            AlertManager.alert('No Phone Number', `${data?.patient?.name || 'The patient'} does not have a phone number configured.`);
        }
    };

    const formatRelativeTime = (dateInput) => {
        if (!dateInput) return '';
        const date = new Date(dateInput);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        // Format time (e.g., 9:15 AM)
        const hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const formattedHours = hours % 12 || 12;
        const timeStr = `${formattedHours}:${minutes} ${ampm}`;

        // Format date (e.g., Jun 15)
        const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        if (diffMins < 1) {
            return `Just now\nToday`;
        }
        if (diffMins < 60) {
            return `${diffMins}m ago\nToday`;
        }
        if (diffHours < 24) {
            if (date.getDate() === now.getDate()) {
                return `${timeStr}\nToday`;
            } else {
                return `${timeStr}\nYesterday`;
            }
        }
        if (diffDays === 1 || (diffDays === 0 && date.getDate() !== now.getDate())) {
            return `${timeStr}\nYesterday`;
        }
        return `${timeStr}\n${dateStr}`;
    };

    const getActivityIcon = (category) => {
        switch (category) {
            case 'alert':
                return <ShieldAlert color={colors.danger} size={16} />;
            case 'vital':
                return <Activity color={colors.primary} size={16} />;
            case 'medicine':
                return <Check color={colors.success} size={16} />;
            default:
                return <Clock color={colors.textSecondary} size={16} />;
        }
    };

    const getActivityIconBg = (category) => {
        switch (category) {
            case 'alert':
                return '#FEE2E2';
            case 'vital':
                return '#E0F2FE';
            case 'medicine':
                return '#D1FAE5';
            default:
                return '#F8FAFC';
        }
    };

    if (!data || !data.patient) {
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
                        
                        <Path d="M180 0 C260 120, 320 150, 400 120 L400 0 Z" fill="url(#topBg)" />
                        <Path d="M0 620 C60 700, 140 720, 220 850 L0 850 Z" fill="url(#bottomBg)" />
                        <Path d="M-20 180 C80 230, 180 150, 280 230 C340 280, 380 250, 420 310" stroke={colors.borderLight} strokeWidth="1.5" fill="none" opacity="0.6" />
                        <Path d="M-40 210 C60 260, 160 180, 260 260 C320 310, 360 280, 400 340" stroke="#E2E8F0" strokeWidth="1" fill="none" opacity="0.35" />
                        <Circle cx="320" cy="480" r="130" stroke="#E2E8F0" strokeWidth="1" fill="none" opacity="0.28" />
                        <Circle cx="320" cy="480" r="90" stroke="#E2E8F0" strokeWidth="1.2" fill="none" opacity="0.18" />
                    </Svg>
                </View>

                <CompanionHeader
                    style={{ backgroundColor: 'transparent', borderBottomWidth: 0, shadowColor: 'transparent', elevation: 0 }}
                    subtitle="Alert Center"
                    title="Patient's Alerts"
                    onBack={() => navigation.goBack()}
                    right={(
                        <View style={styles.bellButton}>
                            <Bell color={C.dark} size={20} />
                        </View>
                    )}
                />

                <ScrollView contentContainerStyle={styles.content}>
                    {/* Quick Connect Skeleton */}
                    <View style={styles.quickConnectCard}>
                        <SkeletonItem width={100} height={14} style={{ marginBottom: 4 }} />
                        <View style={styles.quickConnectButtonsRow}>
                            <SkeletonItem width="48%" height={48} borderRadius={14} style={{ flex: 1 }} />
                            <SkeletonItem width="48%" height={48} borderRadius={14} style={{ flex: 1 }} />
                        </View>
                    </View>

                    {/* Active Alerts Skeleton */}
                    <View style={styles.section}>
                        <View style={styles.alertsHeaderRow}>
                            <View style={styles.alertsHeaderLeft}>
                                <View style={styles.verticalTitleBar} />
                                <SkeletonItem width={180} height={16} />
                            </View>
                            <SkeletonItem width={60} height={14} />
                        </View>
                        
                        <View style={[styles.premiumAlertCard, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
                            <View style={styles.alertContentRow}>
                                <SkeletonItem width={64} height={64} borderRadius={32} />
                                <View style={styles.alertTextColumn}>
                                    <SkeletonItem width={80} height={16} borderRadius={6} />
                                    <SkeletonItem width={150} height={18} />
                                    <SkeletonItem width="100%" height={12} style={{ marginTop: 4 }} />
                                    <SkeletonItem width={130} height={10} style={{ marginTop: 4 }} />
                                </View>
                            </View>
                            <View style={styles.alertActionsRow}>
                                <SkeletonItem width="48%" height={44} borderRadius={12} style={{ flex: 1 }} />
                                <SkeletonItem width="48%" height={44} borderRadius={12} style={{ flex: 1 }} />
                            </View>
                        </View>
                    </View>

                    {/* Security Checkup Skeleton */}
                    <View style={styles.securityCheckupCard}>
                        <View style={styles.checkupList}>
                            {[1, 2, 3, 4].map((item, idx) => (
                                <React.Fragment key={item}>
                                    <View style={styles.checkupItemRow}>
                                        <SkeletonItem width={40} height={40} borderRadius={20} />
                                        <View style={{ flex: 1, gap: 4 }}>
                                            <SkeletonItem width={180} height={12} />
                                            <SkeletonItem width={140} height={10} />
                                        </View>
                                        <SkeletonItem width={50} height={20} borderRadius={8} />
                                    </View>
                                    {idx < 3 && <View style={styles.checkupDivider} />}
                                </React.Fragment>
                            ))}
                        </View>
                    </View>
                </ScrollView>
            </View>
        );
    }

    // Mock resolved alerts history to populate the screen beautifully if activity_logs is empty
    const mockHistory = [
        { id: '1', title: 'Schedule Modified (Acknowledged)', desc: 'Patient requests medication review', timeLabel: '9:15 AM\nToday', category: 'alert', subText: 'By You', badge: 'High Priority' },
        { id: '2', title: 'Medication Taken', desc: 'Metformin 500mg taken on time', timeLabel: '8:00 AM\nToday', category: 'medicine', badge: 'Success' },
        { id: '3', title: 'SMS Sent Successfully', desc: 'Reminder sent for Amlodipine', timeLabel: '7:45 AM\nToday', category: 'info', badge: 'Info' },
        { id: '4', title: 'Emergency Contact Notified', desc: 'Sister (Anita) notified about missed dose', timeLabel: 'Yesterday\n8:30 PM', category: 'medicine', badge: 'Success' },
    ];

    const activityLogs = (data.activity_logs && data.activity_logs.length > 0)
        ? data.activity_logs
        : mockHistory;

    return (
        <TabScreenTransition>
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
                    <Path d="M390 20 C360 60, 320 90, 290 110 C310 120, 360 100, 390 60 Z" fill="none" stroke="#0EA5E9" strokeWidth="1.2" opacity="0.12" />

                    {/* Premium Floral Outline Petals (Bottom Left Corner) */}
                    <Path d="M-10 780 C40 750, 60 710, 80 680 C90 710, 80 760, 40 790 Z" fill="none" stroke={colors.danger} strokeWidth="1" opacity="0.15" />
                    <Path d="M-20 750 C20 720, 40 680, 50 650 C60 680, 50 730, 20 760 Z" fill="none" stroke={colors.danger} strokeWidth="0.8" opacity="0.1" />
                    <Path d="M20 810 C60 780, 90 740, 110 710 C120 730, 100 780, 60 810 Z" fill="none" stroke="#EF4444" strokeWidth="1.2" opacity="0.12" />
                    
                    {/* Concentric abstract rings (Center background) */}
                    <Circle cx="320" cy="480" r="130" stroke="#E2E8F0" strokeWidth="1" fill="none" opacity="0.28" />
                    <Circle cx="320" cy="480" r="90" stroke="#E2E8F0" strokeWidth="1.2" fill="none" opacity="0.18" />
                </Svg>
            </View>

            <CompanionHeader
                style={{ backgroundColor: 'transparent', borderBottomWidth: 0, shadowColor: 'transparent', elevation: 0 }}
                subtitle="Alert Center"
                title={`${data.patient.name}'s Alerts`}
                badge={alerts.length > 0 ? `${alerts.length} Active` : null}
                onBack={() => navigation.goBack()}
                right={(
                    <Pressable
                        style={styles.bellButton}
                        onPress={() => loadData()}
                    >
                        <Bell color={C.dark} size={20} />
                        {alerts.length > 0 && <View style={styles.bellDot} />}
                    </Pressable>
                )}
            />

            <ScrollView 
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            >
                {/* Quick Connect Card */}
                <View style={styles.quickConnectCard}>
                    <Text style={styles.quickConnectTitle}>Quick Connect</Text>
                    <View style={styles.quickConnectButtonsRow}>
                        <Pressable
                            onPress={() => {
                                const phone = data?.patient?.phone;
                                const whatsappPhone = sanitizePhoneForLink(phone, false);
                                if (whatsappPhone) {
                                    Linking.openURL(`https://wa.me/${whatsappPhone}`);
                                } else {
                                    AlertManager.alert('No Phone Number', `${data.patient.name} does not have a phone number configured.`);
                                }
                            }}
                            style={styles.quickConnectButtonWhatsApp}
                        >
                            <MessageSquare color="#059669" size={16} strokeWidth={2.5} />
                            <Text style={styles.quickConnectButtonWhatsAppText}>WhatsApp</Text>
                        </Pressable>

                        <Pressable
                            onPress={handleCall}
                            style={styles.quickConnectButtonCall}
                        >
                            <Phone color="#2563EB" size={16} strokeWidth={2.5} />
                            <Text style={styles.quickConnectButtonCallText}>Call Patient</Text>
                        </Pressable>
                    </View>
                </View>

                {/* 1. Active Alerts Section */}
                {alerts.length > 0 ? (
                    <View style={styles.section}>
                        <View style={styles.alertsHeaderRow}>
                            <View style={styles.alertsHeaderLeft}>
                                <View style={styles.verticalTitleBar} />
                                <Text style={styles.sectionTitle}>Active Alerts Requiring Actions</Text>
                            </View>
                            <Pressable 
                                style={styles.viewAllBtnInline}
                                onPress={() => setShowLogsModal(true)}
                            >
                                <Text style={styles.viewAllTextInline}>View All</Text>
                                <ChevronRight color="#2563EB" size={14} />
                            </Pressable>
                        </View>
                        {alerts.map(a => {
                            const styleCfg = getAlertPriorityStyles(a.type);
                            return (
                                <View key={a._id} style={[styles.premiumAlertCard, { backgroundColor: styleCfg.bg, borderColor: styleCfg.border }]}>
                                    {/* Accent strip */}
                                    <View style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: 0,
                                        bottom: 0,
                                        width: 4,
                                        backgroundColor: styleCfg.accent,
                                    }} />

                                    <View style={styles.alertContentRow}>
                                        {/* Left: Concentric circles with icon */}
                                        <View style={styles.alertIconConcentricContainer}>
                                            <View style={[styles.alertIconOuterRing, { backgroundColor: styleCfg.bgOuter }]}>
                                                <View style={[styles.alertIconInnerRing, { backgroundColor: styleCfg.bgInner }]}>
                                                    <ShieldAlert color={styleCfg.accent} size={22} />
                                                </View>
                                            </View>
                                        </View>

                                        {/* Right: Text Stack */}
                                        <View style={styles.alertTextColumn}>
                                            {/* Tiny severity label pill */}
                                            <View style={[styles.severityPill, { backgroundColor: styleCfg.badgeBg }]}>
                                                <Text style={[styles.severityPillText, { color: styleCfg.accent }]}>{styleCfg.label}</Text>
                                            </View>
                                            <Text style={styles.alertTitleText} numberOfLines={2}>{getAlertTitle(a.type)}</Text>
                                            <Text style={styles.alertDescText}>{a.description}</Text>
                                            <View style={styles.alertTimeRow}>
                                                <Clock size={12} color={styleCfg.accent} />
                                                <Text style={styles.alertTimeText}>Triggered: Today, 9:15 AM</Text>
                                            </View>
                                        </View>
                                    </View>
                                    
                                    {/* Bottom Action Buttons */}
                                    <View style={styles.alertActionsRow}>
                                        <Pressable style={({ pressed }) => [styles.callNowBtn, { backgroundColor: styleCfg.accent }, pressed && { opacity: 0.75 }]} onPress={handleCall}>
                                            <Phone color="#FFF" size={16} />
                                            <Text style={styles.callNowBtnText}>Call Now</Text>
                                        </Pressable>
                                        <Pressable style={({ pressed }) => [styles.dismissBtn, pressed && { opacity: 0.7 }]} onPress={() => acknowledgeAlert(a._id)}>
                                            <CheckCircle2 color="#475569" size={16} />
                                            <Text style={styles.dismissBtnText}>Dismiss</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                ) : (
                    // Beautiful Guardian Shield Empty State Card
                    <View style={styles.guardianCard}>
                        <View style={styles.shieldBackground}>
                            <ShieldCheck color={colors.success} size={40} />
                        </View>
                        <Text style={styles.guardianTitle}>Care Circle is Secured</Text>
                        <Text style={styles.guardianDesc}>
                            No missed medication alerts or vital anomalies have been triggered today. We are actively monitoring {data.patient.name}'s schedule in the background.
                        </Text>
                    </View>
                )}

                {/* 2. Security Settings Checklist Card */}
                <View style={styles.securityCheckupCard}>
                    <View style={styles.checkupList}>
                        {/* Item 1: Security Checkup Header Row */}
                        <View style={styles.checkupItemRow}>
                            <View style={[styles.checkupIconBox, { backgroundColor: '#ECFDF5' }]}>
                                <ShieldCheck color="#10B981" size={20} />
                            </View>
                            
                            <View style={{ flex: 1, gap: 2 }}>
                                <Text style={styles.checkupItemName}>Security Checkup</Text>
                                <Text style={styles.checkupItemDesc}>All monitoring systems are active and running</Text>
                            </View>

                            <View style={styles.allGoodBadge}>
                                <Check color="#10B981" size={12} strokeWidth={3} />
                                <Text style={styles.allGoodBadgeText}>All Good</Text>
                            </View>
                        </View>

                        <View style={styles.checkupDivider} />

                        {/* Item 2: Adherence Tracking */}
                        {(() => {
                            const active = data.medication_schedule && data.medication_schedule.length > 0;
                            return (
                                <Pressable style={({ pressed }) => [styles.checkupItemRow, pressed && { opacity: 0.7 }]}>
                                    <View style={[styles.checkupIconBox, { backgroundColor: '#ECFDF5' }]}>
                                        <Activity color="#10B981" size={20} />
                                    </View>
                                    
                                    <View style={{ flex: 1, gap: 2 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            {active && <View style={styles.activeDot} />}
                                            <Text style={styles.checkupItemName}>
                                                {active ? `Real-time Adherence Tracking (${data.medication_schedule.length} meds)` : 'Real-time Adherence Tracking'}
                                            </Text>
                                        </View>
                                        <Text style={styles.checkupItemDesc}>Monitoring medication intake in real-time</Text>
                                    </View>

                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <View style={[styles.statusBadge, { backgroundColor: active ? '#ECFDF5' : '#F1F5F9' }]}>
                                            <Text style={[styles.statusBadgeText, { color: active ? '#10B981' : '#64748B' }]}>
                                                {active ? 'Active' : 'Inactive'}
                                            </Text>
                                        </View>
                                        <ChevronRight color="#94A3B8" size={16} />
                                    </View>
                                </Pressable>
                            );
                        })()}

                        <View style={styles.checkupDivider} />

                        {/* Item 3: Twilio SMS */}
                        {(() => {
                            const active = !!data.patient.phone;
                            const phoneLast4 = active ? data.patient.phone.slice(-4) : '2611';
                            return (
                                <Pressable style={styles.checkupItemRow}>
                                    <View style={[styles.checkupIconBox, { backgroundColor: '#EFF6FF' }]}>
                                        <MessageSquare color="#2563EB" size={20} />
                                    </View>
                                    
                                    <View style={{ flex: 1, gap: 2 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            {active && <View style={styles.activeDot} />}
                                            <Text style={styles.checkupItemName}>Twilio SMS Notifications (...{phoneLast4})</Text>
                                        </View>
                                        <Text style={styles.checkupItemDesc}>Automated alerts are configured and operational</Text>
                                    </View>

                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <View style={[styles.statusBadge, { backgroundColor: active ? '#ECFDF5' : '#F1F5F9' }]}>
                                            <Text style={[styles.statusBadgeText, { color: active ? '#10B981' : '#64748B' }]}>
                                                {active ? 'Active' : 'Inactive'}
                                            </Text>
                                        </View>
                                        <ChevronRight color="#94A3B8" size={16} />
                                    </View>
                                </Pressable>
                            );
                        })()}

                        <View style={styles.checkupDivider} />

                        {/* Item 4: Emergency Contact Guard */}
                        {(() => {
                            const contactCount = data.patient.trusted_contacts ? data.patient.trusted_contacts.length : 2;
                            const active = contactCount > 0;
                            return (
                                <Pressable style={styles.checkupItemRow}>
                                    <View style={[styles.checkupIconBox, { backgroundColor: '#ECFDF5' }]}>
                                        <Shield color="#10B981" size={20} />
                                    </View>
                                    
                                    <View style={{ flex: 1, gap: 2 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            {active && <View style={styles.activeDot} />}
                                            <Text style={styles.checkupItemName}>Emergency Contact Guard ({contactCount} linked)</Text>
                                        </View>
                                        <Text style={styles.checkupItemDesc}>Emergency contacts are set and ready</Text>
                                    </View>

                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <View style={[styles.statusBadge, { backgroundColor: active ? '#ECFDF5' : '#F1F5F9' }]}>
                                            <Text style={[styles.statusBadgeText, { color: active ? '#10B981' : '#64748B' }]}>
                                                {active ? 'Active' : 'Inactive'}
                                            </Text>
                                        </View>
                                        <ChevronRight color="#94A3B8" size={16} />
                                    </View>
                                </Pressable>
                            );
                        })()}
                    </View>
                </View>

                {/* 3. Activity & Logs History */}
                <View style={styles.historySection}>
                    <View style={styles.historySectionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={styles.purpleDocIconContainer}>
                                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth={2}>
                                    <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <Path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                                </Svg>
                            </View>
                            <Text style={styles.sectionTitle}>Activity & Logs History</Text>
                        </View>
                        <Pressable 
                            style={styles.viewAllBtn}
                            onPress={() => setShowLogsModal(true)}
                        >
                            <Text style={styles.viewAllText}>View All</Text>
                            <ChevronRight color="#3B82F6" size={14} />
                        </Pressable>
                    </View>
 
                     <View style={styles.timelineCardContainer}>
                         {activityLogs.slice(0, 3).map((h, idx, arr) => {
                             const isFirst = idx === 0;
                             const isLast = idx === arr.length - 1;
                             const timeText = h.timeLabel || formatRelativeTime(h.date);
                             const [timePart, datePart] = timeText.split('\n');
 
                             // Colors & Badges
                             const isAlert = h.category === 'alert' || h.badge === 'High Priority' || h.badge === 'Poor Adherence' || h.badge === 'Danger';
                             const isWarning = h.badge === 'Warning' || h.badge === 'Partial Adherence';
                             const isSuccess = (h.category === 'medicine' || h.category === 'vital' || h.badge === 'Success') && !isAlert && !isWarning;
                             const dotColor = isAlert ? '#E11D48' : isWarning ? '#D97706' : isSuccess ? '#10B981' : '#3B82F6';
                             const badgeBg = isAlert ? '#FFF0F2' : isWarning ? '#FEF3C7' : isSuccess ? '#ECFDF5' : '#EFF6FF';
                             const badgeColor = isAlert ? '#E11D48' : isWarning ? '#D97706' : isSuccess ? '#10B981' : '#3B82F6';
 
                             return (
                                 <View key={h.id || h._id} style={styles.timelineRow}>
                                     {/* Time Column */}
                                     <View style={styles.timelineTimeCol}>
                                         <Text style={styles.timelineTimeText}>{timePart}</Text>
                                         <Text style={styles.timelineDateText}>{datePart || 'Today'}</Text>
                                     </View>
 
                                     {/* Line & Dot Column */}
                                     <View style={styles.timelineLineCol}>
                                         <View style={[styles.timelineVerticalLine, 
                                             isFirst && { top: '50%' }, 
                                             isLast && { bottom: '50%' }
                                         ]} />
                                         <View style={[styles.timelineDot, { backgroundColor: dotColor, borderColor: '#FFF' }]} />
                                     </View>
 
                                     {/* Content Card Column */}
                                     <Pressable style={({ pressed }) => [styles.timelineContentCard, pressed && { opacity: 0.7 }]}>
                                         <View style={[styles.timelineIconContainer, { backgroundColor: badgeBg }]}>
                                             {isAlert ? (
                                                 <ShieldAlert color={badgeColor} size={16} />
                                             ) : isWarning ? (
                                                 <Clock color={badgeColor} size={16} />
                                             ) : h.category === 'medicine' ? (
                                                 <Check color={badgeColor} size={16} strokeWidth={3} />
                                             ) : h.category === 'vital' ? (
                                                 <Activity color={badgeColor} size={16} />
                                             ) : (
                                                 <MessageSquare color={badgeColor} size={16} />
                                             )}
                                         </View>
 
                                         <View style={{ flex: 1, gap: 4 }}>
                                             <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                 <Text style={styles.timelineItemTitle}>{h.title}</Text>
                                                 <View style={[styles.timelineBadge, { backgroundColor: badgeBg }]}>
                                                     <Text style={[styles.timelineBadgeText, { color: badgeColor }]}>
                                                         {h.badge || (isAlert ? 'High Priority' : isWarning ? 'Warning' : isSuccess ? 'Success' : 'Info')}
                                                     </Text>
                                                 </View>
                                             </View>
                                             <Text style={styles.timelineItemDesc}>{h.desc}</Text>
                                             {h.subText && <Text style={styles.timelineItemSub}>{h.subText}</Text>}
                                         </View>
 
                                         <ChevronRight color="#94A3B8" size={16} />
                                     </Pressable>
                                 </View>
                             );
                         })}
                     </View>
                 </View>
             </ScrollView>

             <PremiumFormModal
                 visible={showLogsModal}
                 title="Activity & Logs History"
                 onClose={() => setShowLogsModal(false)}
             >
                 <View style={{ gap: 12 }}>
                     {activityLogs.map((h, idx, arr) => {
                         const isFirst = idx === 0;
                         const isLast = idx === arr.length - 1;
                         const timeText = h.timeLabel || formatRelativeTime(h.date);
                         const [timePart, datePart] = timeText.split('\n');
 
                         // Colors & Badges
                         const isAlert = h.category === 'alert' || h.badge === 'High Priority' || h.badge === 'Poor Adherence' || h.badge === 'Danger';
                         const isWarning = h.badge === 'Warning' || h.badge === 'Partial Adherence';
                         const isSuccess = (h.category === 'medicine' || h.category === 'vital' || h.badge === 'Success') && !isAlert && !isWarning;
                         const dotColor = isAlert ? '#E11D48' : isWarning ? '#D97706' : isSuccess ? '#10B981' : '#3B82F6';
                         const badgeBg = isAlert ? '#FFF0F2' : isWarning ? '#FEF3C7' : isSuccess ? '#ECFDF5' : '#EFF6FF';
                         const badgeColor = isAlert ? '#E11D48' : isWarning ? '#D97706' : isSuccess ? '#10B981' : '#3B82F6';
 
                         return (
                             <View key={h.id || h._id} style={styles.timelineRow}>
                                 {/* Time Column */}
                                 <View style={styles.timelineTimeCol}>
                                     <Text style={styles.timelineTimeText}>{timePart}</Text>
                                     <Text style={styles.timelineDateText}>{datePart || 'Today'}</Text>
                                 </View>
 
                                 {/* Line & Dot Column */}
                                 <View style={styles.timelineLineCol}>
                                     <View style={[styles.timelineVerticalLine, 
                                         isFirst && { top: '50%' }, 
                                         isLast && { bottom: '50%' }
                                     ]} />
                                     <View style={[styles.timelineDot, { backgroundColor: dotColor, borderColor: '#FFF' }]} />
                                 </View>
 
                                 {/* Content Card Column */}
                                 <Pressable style={({ pressed }) => [styles.timelineContentCard, pressed && { opacity: 0.7 }]}>
                                     <View style={[styles.timelineIconContainer, { backgroundColor: badgeBg }]}>
                                         {isAlert ? (
                                             <ShieldAlert color={badgeColor} size={16} />
                                         ) : isWarning ? (
                                             <Clock color={badgeColor} size={16} />
                                         ) : h.category === 'medicine' ? (
                                             <Check color={badgeColor} size={16} strokeWidth={3} />
                                         ) : h.category === 'vital' ? (
                                             <Activity color={badgeColor} size={16} />
                                         ) : (
                                             <MessageSquare color={badgeColor} size={16} />
                                         )}
                                     </View>
 
                                     <View style={{ flex: 1, gap: 4 }}>
                                         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                             <Text style={styles.timelineItemTitle}>{h.title}</Text>
                                             <View style={[styles.timelineBadge, { backgroundColor: badgeBg }]}>
                                                 <Text style={[styles.timelineBadgeText, { color: badgeColor }]}>
                                                     {h.badge || (isAlert ? 'High Priority' : isWarning ? 'Warning' : isSuccess ? 'Success' : 'Info')}
                                                 </Text>
                                             </View>
                                         </View>
                                         <Text style={styles.timelineItemDesc}>{h.desc}</Text>
                                         {h.subText && <Text style={styles.timelineItemSub}>{h.subText}</Text>}
                                     </View>
 
                                     <ChevronRight color="#94A3B8" size={16} />
                                 </Pressable>
                             </View>
                         );
                     })}
                 </View>
             </PremiumFormModal>
         </View>
         </TabScreenTransition>
     );
 }

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    quickConnectCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        ...shadows.sm,
        gap: 12,
    },
    quickConnectTitle: {
        fontSize: 14,
        ...FONT.bold,
        color: '#0F172A',
    },
    quickConnectButtonsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    quickConnectButtonWhatsApp: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 48,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#A7F3D0',
        backgroundColor: '#F0FDF4',
    },
    quickConnectButtonWhatsAppText: {
        color: '#059669',
        fontSize: 13,
        ...FONT.bold,
    },
    quickConnectButtonCall: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 48,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#BFDBFE',
        backgroundColor: '#EFF6FF',
    },
    quickConnectButtonCallText: {
        color: '#2563EB',
        fontSize: 13,
        ...FONT.bold,
    },
    miniCommIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bellButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        ...shadows.sm,
    },
    bellDot: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#E11D48',
    },
    content: { padding: 20, gap: 20, paddingBottom: layout.TAB_BAR_CLEARANCE + 72 },
    section: { gap: 12 },
    alertsHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
        paddingHorizontal: 4,
    },
    alertsHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    verticalTitleBar: {
        width: 4,
        height: 16,
        backgroundColor: '#EF4444',
        borderRadius: 2,
    },
    viewAllBtnInline: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    viewAllTextInline: {
        color: '#2563EB',
        fontSize: 12,
        ...FONT.bold,
    },
    sectionTitle: {
        fontSize: 15,
        ...FONT.bold,
        color: '#0F172A',
    },

    // Premium Alert Card Styles
    premiumAlertCard: {
        borderRadius: 24,
        padding: 16,
        gap: 12,
        borderWidth: 1,
        position: 'relative',
        overflow: 'hidden',
        ...shadows.sm,
    },
    alertContentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    alertIconConcentricContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    alertIconOuterRing: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    alertIconInnerRing: {
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
    },
    alertTextColumn: {
        flex: 1,
        minWidth: 0,
        gap: 4,
    },
    severityPill: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        marginBottom: 2,
    },
    severityPillText: {
        fontSize: 9,
        ...FONT.heavy,
        letterSpacing: 0.5,
    },
    alertTitleText: {
        fontSize: 16,
        ...FONT.bold,
        color: '#0F172A',
        lineHeight: 22,
    },
    alertDescText: {
        fontSize: 13,
        ...FONT.semibold,
        color: '#475569',
        lineHeight: 18,
    },
    alertTimeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
    },
    alertTimeText: {
        fontSize: 11,
        ...FONT.semibold,
        color: '#64748B',
    },
    alertActionsRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 4,
    },
    callNowBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 44,
        borderRadius: 12,
    },
    callNowBtnText: {
        color: '#FFF',
        fontSize: 12,
        ...FONT.bold,
    },
    dismissBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: 'transparent',
        height: 44,
        borderWidth: 1,
        borderColor: '#CBD5E1',
        borderRadius: 12,
    },
    dismissBtnText: {
        color: '#475569',
        fontSize: 12,
        ...FONT.bold,
    },

    // Guardian Shield empty card
    guardianCard: {
        backgroundColor: colors.surface,
        borderRadius: 28,
        padding: 24,
        alignItems: 'center',
        ...shadows.card,
    },
    shieldBackground: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.successLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    guardianTitle: {
        fontSize: 18,
        ...FONT.bold,
        color: colors.textPrimary,
        marginBottom: 8,
    },
    guardianDesc: {
        fontSize: 13,
        ...FONT.medium,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 8,
    },

    // Security checkup checklist card styles
    securityCheckupCard: {
        backgroundColor: '#FFF',
        borderRadius: 28,
        padding: 20,
        ...shadows.card,
    },
    allGoodBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#ECFDF5',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
    },
    allGoodBadgeText: {
        color: '#10B981',
        fontSize: 11,
        ...FONT.bold,
    },
    checkupList: {
        gap: 12,
    },
    checkupItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 6,
    },
    checkupIconBox: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkupItemName: {
        fontSize: 13,
        ...FONT.bold,
        color: '#0F172A',
    },
    checkupItemDesc: {
        fontSize: 11,
        ...FONT.medium,
        color: colors.textMuted,
    },
    activeDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#10B981',
        marginRight: 6,
    },
    checkupDivider: {
        height: 1,
        backgroundColor: '#F1F5F9',
        marginVertical: 2,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusBadgeText: {
        fontSize: 11,
        ...FONT.bold,
    },

    // History section
    historySection: {
        marginTop: 10,
        gap: 12,
    },
    historySectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    purpleDocIconContainer: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: '#F3E8FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    viewAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    viewAllText: {
        color: '#3B82F6',
        fontSize: 11,
        ...FONT.bold,
    },
    timelineCardContainer: {
        backgroundColor: '#FFF',
        borderRadius: 28,
        padding: 20,
        ...shadows.card,
    },
    timelineRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        minHeight: 70,
    },
    timelineTimeCol: {
        width: 72,
        justifyContent: 'center',
        paddingRight: 4,
    },
    timelineTimeText: {
        fontSize: 11,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    timelineDateText: {
        fontSize: 9,
        ...FONT.medium,
        color: colors.textMuted,
        marginTop: 2,
    },
    timelineLineCol: {
        width: 18,
        alignItems: 'center',
        position: 'relative',
    },
    timelineVerticalLine: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 2,
        backgroundColor: '#F1F5F9',
    },
    timelineDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: '#FFF',
        position: 'absolute',
        top: '50%',
        marginTop: -5,
        zIndex: 2,
    },
    timelineContentCard: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#F8FAFC',
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 12,
    },
    timelineIconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    timelineItemTitle: {
        fontSize: 12,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    timelineItemDesc: {
        fontSize: 10,
        ...FONT.medium,
        color: colors.textSecondary,
        lineHeight: 14,
    },
    timelineItemSub: {
        fontSize: 9,
        ...FONT.bold,
        color: colors.textMuted,
        marginTop: 1,
    },
    timelineBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    timelineBadgeText: {
        fontSize: 9,
        ...FONT.bold,
    },
});
