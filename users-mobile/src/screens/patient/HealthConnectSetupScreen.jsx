import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Platform, Pressable, Animated, ActivityIndicator,
    ScrollView, Linking, TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Watch, Heart, Wind, Moon, ShieldCheck, ChevronLeft,
    CheckCircle2, XCircle, Smartphone, ArrowRight, Activity, Sliders,
} from 'lucide-react-native';
import {
    initializeHealthPlatform,
    requestHealthPermissions,
    checkPermissionStatus,
    isHealthSupported,
} from '../../lib/healthIntegration';
import HealthSyncService from '../../services/HealthSyncService';
import { apiService } from '../../lib/api';
import { colors } from '../../theme';

import AlertManager from '../../utils/AlertManager';
const FEATURES = [
    {
        icon: Heart,
        color: '#EF4444',
        bg: '#FEF2F2',
        title: 'Heart Rate Monitoring',
        desc: 'Continuous pulse tracking from your smartwatch.',
    },
    {
        icon: Wind,
        color: '#06B6D4',
        bg: '#ECFEFF',
        title: 'Blood Oxygen (SpO₂)',
        desc: 'Track oxygen saturation levels passively.',
    },
    {
        icon: Activity,
        color: '#3B82F6',
        bg: '#EFF6FF',
        title: 'Blood Pressure',
        desc: 'Sync BP readings from supported devices.',
    },
    {
        icon: Moon,
        color: '#8B5CF6',
        bg: '#F5F3FF',
        title: 'Sleep Tracking',
        desc: 'Sleep session data for Night Guardian mode.',
    },
];

const COMPATIBLE_DEVICES = Platform.OS === 'ios'
    ? ['Apple Watch Series 4+', 'Withings ScanWatch', 'Omron HeartGuide']
    : ['Samsung Galaxy Watch', 'Fitbit Sense/Versa', 'Google Pixel Watch', 'Garmin Venu', 'Oura Ring'];

export default function HealthConnectSetupScreen({ navigation }) {
    const [status, setStatus] = useState('checking'); // 'checking' | 'unavailable' | 'denied' | 'granted'
    const [loading, setLoading] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnims = useRef(FEATURES.map(() => new Animated.Value(0))).current;

    // Manual Logging States (real readings from the user)
    const [manualHeartRate, setManualHeartRate] = useState('');
    const [manualSystolic, setManualSystolic] = useState('');
    const [manualDiastolic, setManualDiastolic] = useState('');
    const [manualSpO2, setManualSpO2] = useState('');
    const [manualLogging, setManualLogging] = useState(false);

    const handleManualLog = async () => {
        const hr = parseInt(manualHeartRate, 10);
        const spo2 = parseInt(manualSpO2, 10);
        const sys = parseInt(manualSystolic, 10);
        const dia = parseInt(manualDiastolic, 10);

        if (isNaN(hr) || hr < 30 || hr > 250) {
            AlertManager.alert('Invalid Entry', 'Heart rate must be between 30 and 250 BPM.');
            return;
        }
        if (isNaN(spo2) || spo2 < 50 || spo2 > 100) {
            AlertManager.alert('Invalid Entry', 'SpO₂ level must be between 50% and 100%.');
            return;
        }
        if (isNaN(sys) || sys < 60 || sys > 250) {
            AlertManager.alert('Invalid Entry', 'Systolic pressure must be between 60 and 250 mmHg.');
            return;
        }
        if (isNaN(dia) || dia < 40 || dia > 150) {
            AlertManager.alert('Invalid Entry', 'Diastolic pressure must be between 40 and 150 mmHg.');
            return;
        }

        setManualLogging(true);
        try {
            const response = await apiService.patients.logVitals({
                date: new Date().toISOString(),
                heart_rate: hr,
                blood_pressure: { systolic: sys, diastolic: dia },
                oxygen_saturation: spo2,
                hydration: 80,
                source: 'manual',
                notes: 'Manual vital log entry.'
            });

            if (response.status === 201 || response.status === 200) {
                AlertManager.alert(
                    '✅ Vitals Saved',
                    'Your manual vitals have been logged successfully.',
                    [{ text: 'OK' }]
                );
                // Clear fields on success so they are ready for next entry
                setManualHeartRate('');
                setManualSpO2('');
                setManualSystolic('');
                setManualDiastolic('');
            } else {
                AlertManager.alert('Failed', 'Could not record manual vitals.');
            }
        } catch (err) {
            console.error('Manual vital log failed:', err);
            AlertManager.alert('Error', 'Unable to save vitals. Please check connection.');
        } finally {
            setManualLogging(false);
        }
    };

    useEffect(() => {
        checkCurrentStatus();
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
        Animated.stagger(120,
            slideAnims.map(anim =>
                Animated.spring(anim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true })
            )
        ).start();
    }, []);

    const checkCurrentStatus = async () => {
        if (!isHealthSupported()) {
            setStatus('unavailable');
            return;
        }

        try {
            const initialized = await initializeHealthPlatform();
            if (!initialized) {
                setStatus('unavailable');
                return;
            }
            const perm = await checkPermissionStatus();
            setStatus(perm);
        } catch {
            setStatus('unavailable');
        }
    };

    const handleConnect = async () => {
        setLoading(true);
        try {
            const initialized = await initializeHealthPlatform();
            if (!initialized) {
                AlertManager.alert(
                    Platform.OS === 'android' ? 'Health Connect Required' : 'HealthKit Unavailable',
                    Platform.OS === 'android'
                        ? 'Please install Google Health Connect from the Play Store to continue.'
                        : 'HealthKit is not available on this device.',
                    Platform.OS === 'android'
                        ? [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Open Play Store', onPress: () => Linking.openURL('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata') },
                        ]
                        : [{ text: 'OK' }]
                );
                return;
            }

            const granted = await requestHealthPermissions();
            if (granted) {
                setStatus('granted');
                // Enable sync service and trigger first sync
                await HealthSyncService.setSyncEnabled(true);
                AlertManager.alert(
                    '✅ Connected!',
                    'Your wearable data will now sync automatically with CareMyMed. You\'ll see your readings on the home dashboard.',
                    [{ text: 'Go to Dashboard', onPress: () => navigation.goBack() }]
                );
            } else {
                setStatus('denied');
                AlertManager.alert(
                    'Permissions Denied',
                    'CareMyMed needs health data access to monitor your vitals. You can grant permissions later from your device settings.'
                );
            }
        } catch (err) {
            console.error('Health connect setup failed:', err);
            AlertManager.alert('Error', 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async () => {
        AlertManager.alert(
            'Disconnect Wearable',
            'Stop syncing health data from your wearable device?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Disconnect',
                    style: 'destructive',
                    onPress: async () => {
                        await HealthSyncService.setSyncEnabled(false);
                        setStatus('denied');
                    },
                },
            ]
        );
    };

    const platformName = Platform.OS === 'ios' ? 'Apple HealthKit' : 'Google Health Connect';
    const isConnected = status === 'granted';

    return (
        <LinearGradient colors={['#F8FAFC', '#EEF2FF']} style={styles.container}>
            {/* ── Header ──────────────────────────────────────── */}
            <View style={styles.header}>
                <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft size={24} color={colors.primary} strokeWidth={2.5} />
                </Pressable>
                <Text style={styles.headerTitle}>Wearable Setup</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* ── Hero Card ──────────────────────────────────── */}
                <Animated.View style={[styles.heroCard, { opacity: fadeAnim }]}>
                    <LinearGradient
                        colors={isConnected ? ['#059669', '#10B981'] : ['#1E40AF', '#3B82F6']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.heroGradient}
                    >
                        <View style={styles.heroIconContainer}>
                            {isConnected ? (
                                <ShieldCheck size={48} color="#FFFFFF" strokeWidth={1.5} />
                            ) : (
                                <Watch size={48} color="#FFFFFF" strokeWidth={1.5} />
                            )}
                        </View>
                        <Text style={styles.heroTitle}>
                            {isConnected ? 'Wearable Connected' : 'Connect Your Wearable'}
                        </Text>
                        <Text style={styles.heroDesc}>
                            {isConnected
                                ? `CareMyMed is actively syncing vitals from ${platformName}. Your health data is being monitored in real-time.`
                                : `Link your smartwatch via ${platformName} for automatic, passive health monitoring. No manual logging needed.`
                            }
                        </Text>

                        {/* Status Badge */}
                        <View style={[styles.statusPill, isConnected ? styles.statusPillGreen : styles.statusPillBlue]}>
                            {isConnected
                                ? <CheckCircle2 size={14} color="#FFFFFF" />
                                : <Smartphone size={14} color="#FFFFFF" />
                            }
                            <Text style={styles.statusPillText}>
                                {status === 'checking' ? 'Checking...' :
                                    status === 'unavailable' ? 'Not Available' :
                                        status === 'denied' ? 'Not Connected' :
                                            'Active & Syncing'}
                            </Text>
                        </View>
                    </LinearGradient>
                </Animated.View>

                {/* ── Manual Logging Card ────────────────────────────────────────── */}
                {!isConnected && (
                    <View style={styles.manualCard}>
                        <View style={styles.manualHeader}>
                            <View style={[styles.simIconBg, { backgroundColor: '#FDF2F8' }]}>
                                <Sliders size={20} color="#DB2777" />
                            </View>
                            <Text style={styles.manualTitle}>Log Vitals Manually</Text>
                        </View>
                        
                        <Text style={styles.manualDesc}>
                            Don't have a smartwatch? Type your latest measurements below to record them immediately.
                        </Text>

                        <View style={styles.manualRow}>
                            <View style={styles.inputContainer}>
                                <Text style={styles.inputLabel}>Heart Rate</Text>
                                <View style={styles.inputWrapper}>
                                    <TextInput
                                        style={styles.textInput}
                                        value={manualHeartRate}
                                        onChangeText={setManualHeartRate}
                                        keyboardType="numeric"
                                        maxLength={3}
                                        placeholder="e.g. 72"
                                        placeholderTextColor="#94A3B8"
                                    />
                                    <Text style={styles.inputUnit}>BPM</Text>
                                </View>
                            </View>

                            <View style={styles.inputContainer}>
                                <Text style={styles.inputLabel}>SpO₂ Level</Text>
                                <View style={styles.inputWrapper}>
                                    <TextInput
                                        style={styles.textInput}
                                        value={manualSpO2}
                                        onChangeText={setManualSpO2}
                                        keyboardType="numeric"
                                        maxLength={3}
                                        placeholder="e.g. 98"
                                        placeholderTextColor="#94A3B8"
                                    />
                                    <Text style={styles.inputUnit}>%</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.manualRow}>
                            <View style={styles.inputContainer}>
                                <Text style={styles.inputLabel}>Sys Pressure</Text>
                                <View style={styles.inputWrapper}>
                                    <TextInput
                                        style={styles.textInput}
                                        value={manualSystolic}
                                        onChangeText={setManualSystolic}
                                        keyboardType="numeric"
                                        maxLength={3}
                                        placeholder="e.g. 120"
                                        placeholderTextColor="#94A3B8"
                                    />
                                    <Text style={styles.inputUnit}>mmHg</Text>
                                </View>
                            </View>

                            <View style={styles.inputContainer}>
                                <Text style={styles.inputLabel}>Dia Pressure</Text>
                                <View style={styles.inputWrapper}>
                                    <TextInput
                                        style={styles.textInput}
                                        value={manualDiastolic}
                                        onChangeText={setManualDiastolic}
                                        keyboardType="numeric"
                                        maxLength={3}
                                        placeholder="e.g. 80"
                                        placeholderTextColor="#94A3B8"
                                    />
                                    <Text style={styles.inputUnit}>mmHg</Text>
                                </View>
                            </View>
                        </View>

                        <Pressable
                            style={[styles.manualSubmitBtn, manualLogging && styles.manualSubmitBtnDisabled]}
                            onPress={handleManualLog}
                            disabled={manualLogging}
                        >
                            {manualLogging ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <Text style={styles.manualSubmitBtnText}>Log Vitals Now</Text>
                            )}
                        </Pressable>
                    </View>
                )}

                {/* ── Data Types ─────────────────────────────────── */}
                <Text style={styles.sectionLabel}>WHAT CareMyMed READS</Text>
                {FEATURES.map((feature, i) => (
                    <Animated.View
                        key={feature.title}
                        style={[
                            styles.featureCard,
                            {
                                opacity: slideAnims[i],
                                transform: [{
                                    translateY: slideAnims[i].interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [20, 0],
                                    }),
                                }],
                            },
                        ]}
                    >
                        <View style={[styles.featureIcon, { backgroundColor: feature.bg }]}>
                            <feature.icon size={22} color={feature.color} strokeWidth={2.5} />
                        </View>
                        <View style={styles.featureContent}>
                            <Text style={styles.featureTitle}>{feature.title}</Text>
                            <Text style={styles.featureDesc}>{feature.desc}</Text>
                        </View>
                        {isConnected && (
                            <CheckCircle2 size={20} color="#22C55E" />
                        )}
                    </Animated.View>
                ))}

                {/* ── Compatible Devices ─────────────────────────── */}
                <Text style={styles.sectionLabel}>COMPATIBLE DEVICES</Text>
                <View style={styles.devicesCard}>
                    {COMPATIBLE_DEVICES.map((device, i) => (
                        <View key={i} style={styles.deviceRow}>
                            <View style={styles.deviceDot} />
                            <Text style={styles.deviceText}>{device}</Text>
                        </View>
                    ))}
                    <Text style={styles.deviceNote}>
                        Any device that syncs to {Platform.OS === 'ios' ? 'Apple Health' : 'Google Health Connect'} will work with CareMyMed.
                    </Text>
                </View>

                {/* ── Action Button ──────────────────────────────── */}
                <View style={styles.actionContainer}>
                    {isConnected ? (
                        <>
                            <Pressable
                                style={styles.syncNowBtn}
                                onPress={async () => {
                                    setLoading(true);
                                    await HealthSyncService.syncNow();
                                    setLoading(false);
                                    AlertManager.alert('Sync Complete', 'Your latest health data has been synced.');
                                }}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <>
                                        <Text style={styles.syncNowText}>Sync Now</Text>
                                        <ArrowRight size={18} color="#FFFFFF" />
                                    </>
                                )}
                            </Pressable>
                            <Pressable style={styles.disconnectBtn} onPress={handleDisconnect}>
                                <XCircle size={16} color="#EF4444" />
                                <Text style={styles.disconnectText}>Disconnect Wearable</Text>
                            </Pressable>
                        </>
                    ) : (
                        <Pressable
                            style={[styles.connectBtn, (status === 'unavailable' || loading) && styles.connectBtnDisabled]}
                            onPress={handleConnect}
                            disabled={status === 'unavailable' || loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <>
                                    <Watch size={20} color="#FFFFFF" strokeWidth={2.5} />
                                    <Text style={styles.connectBtnText}>
                                        {status === 'unavailable'
                                            ? `${platformName} Not Available`
                                            : `Connect via ${platformName}`
                                        }
                                    </Text>
                                </>
                            )}
                        </Pressable>
                    )}
                </View>

                {/* ── Privacy Note ───────────────────────────────── */}
                <View style={styles.privacyCard}>
                    <ShieldCheck size={16} color="#64748B" />
                    <Text style={styles.privacyText}>
                        Your health data is encrypted and stored securely. CareMyMed only reads data — it never writes to or modifies your health records.
                    </Text>
                </View>
            </ScrollView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    // ── Simulator Card ────────────────────────────
    simCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20,
        marginBottom: 20, borderWidth: 1, borderColor: '#EEF2FF',
        shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05, shadowRadius: 12, elevation: 3,
    },
    simHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    simIconBg: {
        width: 40, height: 40, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
    },
    simTitle: {
        fontSize: 16, fontWeight: '700', color: '#1E293B',
    },
    simSubtitle: {
        fontSize: 12, color: '#64748B', marginTop: 1,
    },
    toggleBtn: {
        padding: 4,
    },
    toggleTrack: {
        width: 46, height: 26, borderRadius: 13,
        padding: 2, justifyContent: 'center',
    },
    toggleTrackActive: {
        backgroundColor: '#4F46E5',
    },
    toggleTrackInactive: {
        backgroundColor: '#E2E8F0',
    },
    toggleThumb: {
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: '#FFFFFF',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15, shadowRadius: 2, elevation: 2,
    },
    toggleThumbActive: {
        alignSelf: 'flex-end',
    },
    toggleThumbInactive: {
        alignSelf: 'flex-start',
    },
    simBody: {
        marginTop: 16, paddingTop: 16,
        borderTopWidth: 1, borderTopColor: '#F1F5F9',
    },
    simBodyText: {
        fontSize: 13, color: '#475569', lineHeight: 18, marginBottom: 16,
    },
    simSyncBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#4F46E5', borderRadius: 14, paddingVertical: 14,
    },
    simSyncBtnDisabled: {
        backgroundColor: '#94A3B8',
    },
    simSyncBtnText: {
        fontSize: 14, fontWeight: '700', color: '#FFFFFF',
    },

    // ── Manual Logging Card ───────────────────────
    manualCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20,
        marginBottom: 20, borderWidth: 1, borderColor: '#FDF2F8',
        shadowColor: '#DB2777', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04, shadowRadius: 12, elevation: 3,
    },
    manualHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12,
    },
    manualTitle: {
        fontSize: 16, fontWeight: '700', color: '#1E293B',
    },
    manualDesc: {
        fontSize: 13, color: '#64748B', lineHeight: 18, marginBottom: 16,
    },
    manualRow: {
        flexDirection: 'row', justifyContent: 'space-between', gap: 12,
        marginBottom: 12,
    },
    inputContainer: {
        flex: 1,
    },
    inputLabel: {
        fontSize: 11, fontWeight: '700', color: '#94A3B8',
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
    },
    inputWrapper: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#F8FAFC', borderRadius: 12,
        borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12,
    },
    textInput: {
        flex: 1, height: 44, fontSize: 15, fontWeight: '600', color: '#1E293B',
        padding: 0,
    },
    inputUnit: {
        fontSize: 12, fontWeight: '600', color: '#64748B', marginLeft: 4,
    },
    manualSubmitBtn: {
        backgroundColor: '#DB2777', borderRadius: 14, paddingVertical: 14,
        alignItems: 'center', justifyContent: 'center', marginTop: 8,
    },
    manualSubmitBtnDisabled: {
        backgroundColor: '#94A3B8',
    },
    manualSubmitBtnText: {
        fontSize: 14, fontWeight: '700', color: '#FFFFFF',
    },

    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 60 : 48,
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    headerTitle: {
        fontSize: 18, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5,
    },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },

    // ── Hero Card ─────────────────────────────────
    heroCard: {
        borderRadius: 28, overflow: 'hidden', marginBottom: 28,
        shadowColor: '#0A2463', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15, shadowRadius: 24, elevation: 8,
    },
    heroGradient: {
        padding: 28, alignItems: 'center',
    },
    heroIconContainer: {
        width: 88, height: 88, borderRadius: 44,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 20,
    },
    heroTitle: {
        fontSize: 24, fontWeight: '800', color: '#FFFFFF',
        textAlign: 'center', marginBottom: 8, letterSpacing: -0.5,
    },
    heroDesc: {
        fontSize: 14, color: 'rgba(255,255,255,0.85)',
        textAlign: 'center', lineHeight: 22, marginBottom: 20,
        paddingHorizontal: 8,
    },
    statusPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    },
    statusPillGreen: { backgroundColor: 'rgba(255,255,255,0.2)' },
    statusPillBlue: { backgroundColor: 'rgba(255,255,255,0.15)' },
    statusPillText: {
        fontSize: 13, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3,
    },

    // ── Section Labels ────────────────────────────
    sectionLabel: {
        fontSize: 12, fontWeight: '800', color: '#94A3B8',
        letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14, marginLeft: 4,
    },

    // ── Feature Cards ─────────────────────────────
    featureCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18,
        marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
    },
    featureIcon: {
        width: 48, height: 48, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center', marginRight: 14,
    },
    featureContent: { flex: 1 },
    featureTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 2 },
    featureDesc: { fontSize: 13, color: '#64748B', lineHeight: 18 },

    // ── Devices Card ──────────────────────────────
    devicesCard: {
        backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20,
        marginBottom: 28, borderWidth: 1, borderColor: '#F1F5F9',
    },
    deviceRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 8,
    },
    deviceDot: {
        width: 6, height: 6, borderRadius: 3, backgroundColor: '#3B82F6',
    },
    deviceText: { fontSize: 14, color: '#334155', fontWeight: '500' },
    deviceNote: {
        fontSize: 12, color: '#94A3B8', marginTop: 12,
        lineHeight: 18, fontStyle: 'italic',
    },

    // ── Action Buttons ────────────────────────────
    actionContainer: { marginBottom: 20, gap: 12 },
    connectBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 10, backgroundColor: '#2563EB', borderRadius: 18,
        paddingVertical: 18, 
        shadowColor: '#2563EB', shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
    },
    connectBtnDisabled: { backgroundColor: '#94A3B8', shadowOpacity: 0 },
    connectBtnText: {
        fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3,
    },
    syncNowBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, backgroundColor: '#059669', borderRadius: 18,
        paddingVertical: 18,
        shadowColor: '#059669', shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
    },
    syncNowText: {
        fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3,
    },
    disconnectBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, backgroundColor: '#FEF2F2', borderRadius: 18,
        paddingVertical: 14, borderWidth: 1, borderColor: '#FECACA',
    },
    disconnectText: {
        fontSize: 14, fontWeight: '600', color: '#EF4444',
    },

    // ── Privacy Card ──────────────────────────────
    privacyCard: {
        flexDirection: 'row', gap: 10,
        backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16,
        borderWidth: 1, borderColor: '#E2E8F0',
        marginBottom: 20,
    },
    privacyText: {
        flex: 1, fontSize: 12, color: '#64748B', lineHeight: 18,
    },
});
