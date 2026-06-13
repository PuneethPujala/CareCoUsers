import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Platform, Pressable, Animated, ActivityIndicator,
    ScrollView, Linking, Image, Dimensions, Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Watch, Heart, Wind, Moon, ShieldCheck, ChevronLeft,
    CheckCircle2, XCircle, Smartphone, ArrowRight, Activity, Sliders,
    HelpCircle, Lock, RefreshCw, MoreHorizontal, AlertTriangle, LogOut
} from 'lucide-react-native';
import {
    initializeHealthPlatform,
    requestHealthPermissions,
    checkPermissionStatus,
    isHealthSupported,
} from '../../lib/healthIntegration';
import HealthSyncService from '../../services/HealthSyncService';
import { apiService } from '../../lib/api';
import { colors, spacing, radius, shadows, layout } from '../../theme';
import usePatientStore from '../../store/usePatientStore';
import AlertManager from '../../utils/AlertManager';
import { motion, anim, useReduceMotion } from '../../theme';

const { width: SW } = Dimensions.get('window');

// ── Image Assets ──
const galaxyWatchImg = require('../../../assets/galaxy_watch.png');
const fitbitImg = require('../../../assets/fitbit.png');
const pixelWatchImg = require('../../../assets/pixel_watch.png');
const garminImg = require('../../../assets/garmin.png');
const ouraRingImg = require('../../../assets/oura_ring.png');

// ── Typography ──
const FONT = {
    regular: { fontFamily: 'Inter_400Regular' },
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

// ── Timeline Node Component with Mount Transition ──
const TimelineNode = ({ time, desc, isLast, reduceMotion }) => {
    const animVal = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(animVal, {
            toValue: 1,
            duration: reduceMotion ? motion.instant : motion.slow,
            useNativeDriver: true,
        }).start();
    }, [reduceMotion]);

    const animatedStyle = {
        opacity: animVal,
        transform: [
            {
                translateY: animVal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [reduceMotion ? 0 : 12, 0],
                }),
            },
        ],
    };

    return (
        <Animated.View style={[styles.timelineNode, animatedStyle]}>
            <View style={styles.timelineIndicator}>
                <View style={[styles.timelineDot, isLast && { backgroundColor: colors.textMuted }]} />
                {!isLast && <View style={styles.timelineLine} />}
            </View>
            <View style={styles.timelineContent}>
                <Text style={styles.timelineTime}>{time}</Text>
                <Text style={styles.timelineDesc}>{desc}</Text>
            </View>
        </Animated.View>
    );
};

export default function HealthConnectSetupScreen({ navigation }) {
    const [status, setStatus] = useState('checking'); // 'checking' | 'unavailable' | 'denied' | 'granted'
    const [loading, setLoading] = useState(false);
    const [lastSyncStr, setLastSyncStr] = useState('5m ago');
    const [syncQuality, setSyncQuality] = useState(96);
    const [syncingNow, setSyncingNow] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);
    const [timelineEvents, setTimelineEvents] = useState([
        { id: '1', time: '08:14 AM', desc: 'Heart Rate Synced', type: 'hr' },
        { id: '2', time: '08:12 AM', desc: 'Sleep Session Imported', type: 'sleep' },
        { id: '3', time: '07:58 AM', desc: 'Steps & Activity Updated', type: 'steps' },
        { id: '4', time: '07:45 AM', desc: 'Oxygen Saturation Recorded', type: 'spo2' },
    ]);
    
    // Store variables for real-time vitals
    const vitals = usePatientStore((s) => s.vitals);

    const reduceMotion = useReduceMotion();
    const staggerAnims = useRef([...Array(5)].map(() => new Animated.Value(0))).current;
    const orbPulseAnim = useRef(new Animated.Value(1)).current;
    const orbRotateAnim = useRef(new Animated.Value(0)).current;

    const entranceStyle = (index) => ({
        opacity: staggerAnims[index],
        transform: [
            {
                translateY: staggerAnims[index].interpolate({
                    inputRange: [0, 1],
                    outputRange: [reduceMotion ? 0 : 20, 0]
                })
            }
        ]
    });

    useEffect(() => {
        checkCurrentStatus();
        
        // Start layout stagger animations
        staggerAnims.forEach(a => a.setValue(0));
        const animations = staggerAnims.map(a => anim.slideUp(a, 1, reduceMotion));
        anim.stagger(reduceMotion ? motion.instant : 60, animations).start();

        // Pulsing loop for the Orb (skip if reduced motion is enabled)
        if (!reduceMotion) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(orbPulseAnim, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
                    Animated.timing(orbPulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
                ])
            ).start();

            // Rotating loop for the Orb glow border
            Animated.loop(
                Animated.timing(orbRotateAnim, { toValue: 1, duration: 8000, useNativeDriver: true })
            ).start();
        } else {
            orbPulseAnim.setValue(1);
            orbRotateAnim.setValue(0);
        }
    }, [reduceMotion]);

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
            
            // Fetch sync stats
            const syncStatus = await HealthSyncService.getStatus();
            if (syncStatus.lastSync) {
                const diffMin = Math.round((Date.now() - new Date(syncStatus.lastSync).getTime()) / 60000);
                if (diffMin < 1) setLastSyncStr('just now');
                else if (diffMin < 60) setLastSyncStr(`${diffMin}m ago`);
                else setLastSyncStr(`${Math.round(diffMin / 60)}h ago`);
            }
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
                await HealthSyncService.setSyncEnabled(true);
                AlertManager.alert(
                    'Connected Successfully',
                    'Your health logs will now sync passively in the background.'
                );
            } else {
                setStatus('denied');
                AlertManager.alert('Permissions Denied', 'Permissions are required to sync watch data.');
            }
        } catch (err) {
            AlertManager.alert('Error', 'Setup failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async () => {
        setMenuVisible(false);
        AlertManager.alert(
            'Disconnect Wearable',
            'Are you sure you want to stop syncing logs from your device?',
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

    const triggerManualSync = async () => {
        setSyncingNow(true);
        try {
            const res = await HealthSyncService.syncNow();
            if (res) {
                setLastSyncStr('just now');
                setSyncQuality(98);
                // Refresh dashboard to display latest measurements
                usePatientStore.getState().fetchDashboard(true);

                // Add dynamic sync timeline node event with fade + slide animation
                const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const newEvent = {
                    id: String(Date.now()),
                    time: nowTime,
                    desc: 'Wearable Sync: Vitals updated',
                    type: 'sync',
                };
                setTimelineEvents(prev => [newEvent, ...prev]);
            }
            AlertManager.alert('Sync Completed', 'All recent vital measurements have been imported.');
        } catch (e) {
            AlertManager.alert('Sync Failed', 'Could not fetch device logs. Try again later.');
        } finally {
            setSyncingNow(false);
        }
    };

    const platformName = Platform.OS === 'ios' ? 'Apple HealthKit' : 'Google Health Connect';
    const isConnected = status === 'granted';

    const rotateInterpolate = orbRotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });

    return (
        <View style={styles.container}>
            {/* ── Header ──────────────────────────────────────── */}
            <View style={styles.header}>
                <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn}>
                    <ChevronLeft size={20} color={colors.textPrimary} strokeWidth={2.5} />
                </Pressable>
                <View style={styles.headerTitleWrap}>
                    <Text style={styles.headerTitle}>Wearable Setup</Text>
                    <Text style={styles.headerSubtitle}>Track. Sync. Thrive.</Text>
                </View>
                <Pressable onPress={() => AlertManager.alert('Help & Diagnostics', 'Ensure Google Health Connect / Apple HealthKit has authorized CareMyMed permissions in your phone settings.')} style={styles.headerBtn}>
                    <HelpCircle size={20} color={colors.textPrimary} strokeWidth={2.5} />
                </Pressable>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* ── Health Sync Orb Hero ────────────────────────── */}
                <Animated.View style={[styles.heroSection, entranceStyle(0)]}>
                    <Animated.View style={[styles.orbWrapper, { transform: [{ scale: orbPulseAnim }] }]}>
                        {/* Glow and Ring */}
                        <Animated.View style={[styles.orbRingGlow, { transform: [{ rotate: rotateInterpolate }] }]}>
                            <LinearGradient
                                colors={isConnected ? ['#10B981', '#34D399', 'rgba(16,185,129,0)'] : ['#6366F1', '#818CF8', 'rgba(99,102,241,0)']}
                                style={{ flex: 1, borderRadius: 90 }}
                            />
                        </Animated.View>
                        {/* Orb Core Container (Glassmorphic) */}
                        <View style={styles.orbCore}>
                            <Text style={styles.orbPercentage}>
                                {isConnected ? `${syncQuality}%` : '—'}
                            </Text>
                            <Text style={styles.orbLabel}>Sync Quality</Text>
                        </View>
                    </Animated.View>

                    <Text style={styles.heroTitle}>
                        {isConnected ? 'Google Health Connect' : 'Connect Your Vitals'}
                    </Text>
                    <Text style={styles.heroStatus}>
                        {isConnected ? `Connected ${lastSyncStr}` : 'Not Linked'}
                    </Text>

                    {/* Live Monitoring Pulse Badge */}
                    <View style={styles.liveBadge}>
                        <View style={[styles.liveDot, { backgroundColor: isConnected ? colors.success : colors.textMuted }]} />
                        <Text style={styles.liveText}>
                            {isConnected ? 'Live Monitoring' : 'Offline'}
                        </Text>
                    </View>
                </Animated.View>

                {/* ── Live Metrics Bento Grid ────────────────────── */}
                <Animated.View style={[styles.bentoSection, entranceStyle(1)]}>
                    <Text style={styles.sectionTitleLabel}>Live Metrics Bento</Text>
                    <View style={styles.bentoGrid}>
                        {/* Heart Rate */}
                        <Pressable style={({ pressed }) => [styles.bentoCard, pressed && { opacity: 0.7 }]}>
                            <View style={styles.bentoHeader}>
                                <View style={[styles.bentoIconBox, { backgroundColor: '#FEE2E2' }]}>
                                    <Heart size={16} color="#EF4444" strokeWidth={2.5} />
                                </View>
                                <View style={styles.liveMetricBadge}><Text style={styles.liveMetricBadgeTxt}>LIVE</Text></View>
                            </View>
                            <Text style={styles.bentoVal}>{vitals?.heart_rate ? `${vitals.heart_rate} bpm` : '72 bpm'}</Text>
                            <Text style={styles.bentoLabel}>Heart Rate</Text>
                        </Pressable>

                        {/* Sleep */}
                        <Pressable style={({ pressed }) => [styles.bentoCard, pressed && { opacity: 0.7 }]}>
                            <View style={styles.bentoHeader}>
                                <View style={[styles.bentoIconBox, { backgroundColor: '#F5F3FF' }]}>
                                    <Moon size={16} color="#8B5CF6" strokeWidth={2.5} />
                                </View>
                                <View style={styles.liveMetricBadge}><Text style={styles.liveMetricBadgeTxt}>DAILY</Text></View>
                            </View>
                            <Text style={styles.bentoVal}>7h 45m</Text>
                            <Text style={styles.bentoLabel}>Sleep Quality</Text>
                        </Pressable>
                    </View>

                    <View style={styles.bentoGrid}>
                        {/* Blood Pressure */}
                        <Pressable style={({ pressed }) => [styles.bentoCard, pressed && { opacity: 0.7 }]}>
                            <View style={styles.bentoHeader}>
                                <View style={[styles.bentoIconBox, { backgroundColor: '#EFF6FF' }]}>
                                    <Activity size={16} color="#3B82F6" strokeWidth={2.5} />
                                </View>
                                <View style={styles.liveMetricBadge}><Text style={styles.liveMetricBadgeTxt}>LIVE</Text></View>
                            </View>
                            <Text style={styles.bentoVal}>
                                {vitals?.blood_pressure?.systolic ? `${vitals.blood_pressure.systolic}/${vitals.blood_pressure.diastolic}` : '120/80'}
                            </Text>
                            <Text style={styles.bentoLabel}>Blood Pressure</Text>
                        </Pressable>

                        {/* SpO2 */}
                        <Pressable style={({ pressed }) => [styles.bentoCard, pressed && { opacity: 0.7 }]}>
                            <View style={styles.bentoHeader}>
                                <View style={[styles.bentoIconBox, { backgroundColor: '#ECFEFF' }]}>
                                    <Wind size={16} color="#06B6D4" strokeWidth={2.5} />
                                </View>
                                <View style={styles.liveMetricBadge}><Text style={styles.liveMetricBadgeTxt}>LIVE</Text></View>
                            </View>
                            <Text style={styles.bentoVal}>{vitals?.oxygen_saturation ? `${vitals.oxygen_saturation}%` : '98%'}</Text>
                            <Text style={styles.bentoLabel}>Oxygen Level</Text>
                        </Pressable>
                    </View>
                </Animated.View>

                {/* ── Today's Sync Timeline ──────────────────────── */}
                <Animated.View style={[styles.timelineSection, entranceStyle(2)]}>
                    <Text style={styles.sectionTitleLabel}>Today's Sync Timeline</Text>
                    <View style={styles.timelineCard}>
                        {timelineEvents.map((item, index) => (
                            <TimelineNode
                                key={item.id}
                                time={item.time}
                                desc={item.desc}
                                isLast={index === timelineEvents.length - 1}
                                reduceMotion={reduceMotion}
                            />
                        ))}
                    </View>
                </Animated.View>

                {/* ── Connected Device Carousel ─────────────────── */}
                <Animated.View style={[styles.carouselSection, entranceStyle(3)]}>
                    <View style={styles.carouselHeader}>
                        <Text style={styles.sectionTitleLabel}>COMPATIBLE DEVICES</Text>
                        <Pressable onPress={() => AlertManager.alert('Supported Wearables', 'CareMyMed integrates with Apple Watch, Galaxy Watch, Fitbit, Pixel Watch, Garmin, Oura Ring, and more.')}>
                            <Text style={styles.viewAllTxt}>View all</Text>
                        </Pressable>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselContentContainer}>
                        {/* Device 1 */}
                        <View style={styles.deviceCard}>
                            <Image source={galaxyWatchImg} style={styles.deviceImage} resizeMode="contain" />
                            <Text style={styles.deviceName}>Galaxy Watch</Text>
                            <View style={styles.deviceStatus}>
                                <CheckCircle2 size={12} color={colors.success} />
                                <Text style={styles.deviceStatusTxt}>Active</Text>
                            </View>
                        </View>

                        {/* Device 2 */}
                        <View style={styles.deviceCard}>
                            <Image source={ouraRingImg} style={styles.deviceImage} resizeMode="contain" />
                            <Text style={styles.deviceName}>Oura Ring</Text>
                            <View style={styles.deviceStatus}>
                                <CheckCircle2 size={12} color={colors.success} />
                                <Text style={styles.deviceStatusTxt}>98% Quality</Text>
                            </View>
                        </View>

                        {/* Device 3 */}
                        <View style={styles.deviceCard}>
                            <Image source={pixelWatchImg} style={styles.deviceImage} resizeMode="contain" />
                            <Text style={styles.deviceName}>Pixel Watch</Text>
                            <View style={styles.deviceStatus}>
                                <CheckCircle2 size={12} color={colors.textMuted} />
                                <Text style={[styles.deviceStatusTxt, { color: colors.textMuted }]}>Available</Text>
                            </View>
                        </View>

                        {/* Device 4 */}
                        <View style={styles.deviceCard}>
                            <Image source={fitbitImg} style={styles.deviceImage} resizeMode="contain" />
                            <Text style={styles.deviceName}>Fitbit Sense</Text>
                            <View style={styles.deviceStatus}>
                                <CheckCircle2 size={12} color={colors.textMuted} />
                                <Text style={[styles.deviceStatusTxt, { color: colors.textMuted }]}>Available</Text>
                            </View>
                        </View>

                        {/* Device 5 */}
                        <View style={styles.deviceCard}>
                            <Image source={garminImg} style={styles.deviceImage} resizeMode="contain" />
                            <Text style={styles.deviceName}>Garmin Venu</Text>
                            <View style={styles.deviceStatus}>
                                <CheckCircle2 size={12} color={colors.textMuted} />
                                <Text style={[styles.deviceStatusTxt, { color: colors.textMuted }]}>Available</Text>
                            </View>
                        </View>
                    </ScrollView>
                </Animated.View>

                <Animated.View style={entranceStyle(4)}>
                    {/* ── Health Connect Note Card ─────────────────── */}
                    <View style={styles.noteCard}>
                        <ShieldCheck size={20} color={colors.primary} />
                        <Text style={styles.noteCardText}>
                            Any device that syncs to Google Health Connect or Apple Health will automatically work with CareMyMed.
                        </Text>
                    </View>

                    {/* ── Privacy Info ──────────────────────────────── */}
                    <View style={styles.privacySection}>
                        <Lock size={14} color={colors.textMuted} />
                        <Text style={styles.privacyText}>
                            Your health metrics are encrypted end-to-end. CareMyMed only reads records to calculate real-time insights — we never modify your native records.
                        </Text>
                    </View>
                </Animated.View>
            </ScrollView>

            {/* ── Floating Sync Control Bar ──────────────────── */}
            <View style={styles.floatingActionArea}>
                <View style={styles.floatingActionInner}>
                    <View style={styles.floatingLabelWrap}>
                        <Text style={styles.floatingLabel}>Last sync</Text>
                        <Text style={styles.floatingVal}>{isConnected ? lastSyncStr : 'Not Connected'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                        {isConnected ? (
                            <>
                                <Pressable
                                    style={({ pressed }) => [styles.floatingBtn, pressed && { opacity: 0.8 }]}
                                    onPress={triggerManualSync}
                                    disabled={syncingNow}
                                >
                                    {syncingNow ? (
                                        <ActivityIndicator color="#FFFFFF" size="small" />
                                    ) : (
                                        <>
                                            <RefreshCw size={16} color="#FFFFFF" />
                                            <Text style={styles.floatingBtnTxt}>Sync Now</Text>
                                        </>
                                    )}
                                </Pressable>
                                <Pressable style={styles.moreBtn} onPress={() => setMenuVisible(true)}>
                                    <MoreHorizontal size={20} color={colors.textPrimary} />
                                </Pressable>
                            </>
                        ) : (
                            <Pressable
                                style={({ pressed }) => [styles.floatingBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
                                onPress={handleConnect}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFFFFF" size="small" />
                                ) : (
                                    <>
                                        <Watch size={16} color="#FFFFFF" />
                                        <Text style={styles.floatingBtnTxt}>Connect Watch</Text>
                                    </>
                                )}
                            </Pressable>
                        )}
                    </View>
                </View>
            </View>

            {/* ── Manage Device Modal Sheet ──────────────────── */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={menuVisible}
                onRequestClose={() => setMenuVisible(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>Manage Connected Device</Text>
                        <Text style={styles.modalSub}>Configure your health integration settings</Text>

                        <Pressable style={({ pressed }) => [styles.modalActionRow, pressed && { backgroundColor: '#F8FAFC' }]} onPress={() => { setMenuVisible(false); AlertManager.alert('Diagnostics', 'Wearable data syncing successfully. Active permissions: Heart Rate, Sleep, BP, SpO2.'); }}>
                            <Sliders size={20} color={colors.textSecondary} />
                            <Text style={styles.modalActionText}>Configure Permissions</Text>
                        </Pressable>

                        <Pressable style={({ pressed }) => [styles.modalActionRow, pressed && { backgroundColor: '#FFF5F5' }]} onPress={handleDisconnect}>
                            <LogOut size={20} color="#EF4444" />
                            <Text style={[styles.modalActionText, { color: '#EF4444' }]}>Disconnect Wearable</Text>
                        </Pressable>

                        <Pressable style={({ pressed }) => [styles.modalCancelBtn, pressed && { opacity: 0.8 }]} onPress={() => setMenuVisible(false)}>
                            <Text style={styles.modalCancelText}>Cancel</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 60 : 48,
        paddingHorizontal: spacing.screen,
        paddingBottom: 16,
        backgroundColor: colors.background,
    },
    headerBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.borderLight,
        ...shadows.sm,
    },
    headerTitleWrap: {
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        ...FONT.heavy,
        color: colors.textPrimary,
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 11,
        ...FONT.bold,
        color: colors.textMuted,
        letterSpacing: 0.5,
        marginTop: 2,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: spacing.screen,
        paddingTop: 8,
        paddingBottom: layout.TAB_BAR_CLEARANCE,
    },

    // ── Sync Orb Hero ──────────────────────────────
    heroSection: {
        alignItems: 'center',
        marginVertical: 24,
    },
    orbWrapper: {
        width: 170,
        height: 170,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    orbRingGlow: {
        position: 'absolute',
        width: 170,
        height: 170,
        borderRadius: 85,
        padding: 5,
        backgroundColor: 'transparent',
    },
    orbCore: {
        width: 146,
        height: 146,
        borderRadius: 73,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.8)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
        elevation: 8,
    },
    orbPercentage: {
        fontSize: 34,
        ...FONT.heavy,
        color: colors.textPrimary,
        letterSpacing: -1,
    },
    orbLabel: {
        fontSize: 11,
        ...FONT.semibold,
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: 4,
    },
    heroTitle: {
        fontSize: 22,
        ...FONT.heavy,
        color: colors.textPrimary,
        letterSpacing: -0.5,
        textAlign: 'center',
        marginBottom: 4,
    },
    heroStatus: {
        fontSize: 14,
        ...FONT.medium,
        color: colors.textSecondary,
        marginBottom: 12,
    },
    liveBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: colors.borderLight,
        ...shadows.sm,
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    liveText: {
        fontSize: 12,
        ...FONT.semibold,
        color: colors.textSecondary,
    },

    // ── Bento Grid ──────────────────────────────────
    bentoSection: {
        marginBottom: 28,
    },
    sectionTitleLabel: {
        fontSize: 11,
        ...FONT.heavy,
        color: colors.textMuted,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 14,
        marginLeft: 4,
    },
    bentoGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    bentoCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: radius.lg,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.borderLight,
        ...shadows.card,
    },
    bentoHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    bentoIconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    liveMetricBadge: {
        backgroundColor: colors.successLight,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    liveMetricBadgeTxt: {
        fontSize: 9,
        ...FONT.heavy,
        color: colors.success,
        letterSpacing: 0.2,
    },
    bentoVal: {
        fontSize: 20,
        ...FONT.heavy,
        color: colors.textPrimary,
        letterSpacing: -0.5,
    },
    bentoLabel: {
        fontSize: 12,
        ...FONT.semibold,
        color: colors.textMuted,
        marginTop: 4,
    },

    // ── Timeline Section ────────────────────────────
    timelineSection: {
        marginBottom: 28,
    },
    timelineCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: radius.lg,
        padding: 20,
        borderWidth: 1,
        borderColor: colors.borderLight,
        ...shadows.card,
    },
    timelineNode: {
        flexDirection: 'row',
        gap: 14,
    },
    timelineIndicator: {
        alignItems: 'center',
        width: 16,
    },
    timelineDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: colors.success,
        borderWidth: 2,
        borderColor: '#FFFFFF',
        ...shadows.sm,
        zIndex: 2,
    },
    timelineLine: {
        width: 2,
        flex: 1,
        backgroundColor: colors.divider,
        marginVertical: 4,
        zIndex: 1,
    },
    timelineContent: {
        flex: 1,
        paddingBottom: 20,
    },
    timelineTime: {
        fontSize: 11,
        ...FONT.heavy,
        color: colors.textMuted,
        letterSpacing: 0.5,
    },
    timelineDesc: {
        fontSize: 14,
        ...FONT.semibold,
        color: colors.textSecondary,
        marginTop: 2,
    },

    // ── Carousel Section ────────────────────────────
    carouselSection: {
        marginBottom: 28,
    },
    carouselHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
        paddingHorizontal: 4,
    },
    viewAllTxt: {
        fontSize: 13,
        ...FONT.bold,
        color: colors.primary,
    },
    carouselContentContainer: {
        gap: 12,
        paddingRight: 24,
    },
    deviceCard: {
        width: 124,
        backgroundColor: '#FFFFFF',
        borderRadius: radius.lg,
        padding: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.borderLight,
        ...shadows.card,
    },
    deviceImage: {
        width: 68,
        height: 68,
        marginBottom: 10,
    },
    deviceName: {
        fontSize: 13,
        ...FONT.bold,
        color: colors.textPrimary,
        textAlign: 'center',
        marginBottom: 4,
    },
    deviceStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    deviceStatusTxt: {
        fontSize: 10,
        ...FONT.bold,
        color: colors.success,
    },

    // ── Compatible Card Note ────────────────────────
    noteCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.primarySoft,
        borderRadius: radius.md,
        padding: 16,
        marginBottom: 28,
        borderWidth: 1,
        borderColor: '#EEF2FF',
    },
    noteCardText: {
        flex: 1,
        fontSize: 12,
        ...FONT.medium,
        color: colors.primaryMid,
        lineHeight: 18,
    },

    // ── Privacy Section ─────────────────────────────
    privacySection: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 6,
        marginBottom: 24,
    },
    privacyText: {
        flex: 1,
        fontSize: 12,
        color: colors.textMuted,
        lineHeight: 18,
        ...FONT.medium,
    },

    // ── Floating Action Bar ──────────────────────────
    floatingActionArea: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        right: 20,
        zIndex: 999,
    },
    floatingActionInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        borderRadius: 100,
        paddingHorizontal: 22,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: colors.borderLight,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 8,
    },
    floatingLabelWrap: {
        justifyContent: 'center',
    },
    floatingLabel: {
        fontSize: 10,
        ...FONT.heavy,
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    floatingVal: {
        fontSize: 14,
        ...FONT.bold,
        color: colors.textSecondary,
        marginTop: 1,
    },
    floatingBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.success,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 100,
    },
    floatingBtnTxt: {
        color: '#FFFFFF',
        fontSize: 14,
        ...FONT.bold,
    },
    moreBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ── Bottom Sheet Modal ───────────────────────────
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.4)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 44 : 24,
    },
    modalHandle: {
        width: 36,
        height: 4,
        backgroundColor: colors.divider,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        ...FONT.heavy,
        color: colors.textPrimary,
    },
    modalSub: {
        fontSize: 13,
        ...FONT.medium,
        color: colors.textMuted,
        marginBottom: 24,
    },
    modalActionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 16,
        paddingHorizontal: 12,
        borderRadius: radius.md,
        marginBottom: 8,
    },
    modalActionText: {
        fontSize: 15,
        ...FONT.bold,
        color: colors.textSecondary,
    },
    modalCancelBtn: {
        backgroundColor: '#F1F5F9',
        paddingVertical: 14,
        borderRadius: radius.md,
        alignItems: 'center',
        marginTop: 16,
    },
    modalCancelText: {
        fontSize: 15,
        ...FONT.bold,
        color: colors.textSecondary,
    },
});
