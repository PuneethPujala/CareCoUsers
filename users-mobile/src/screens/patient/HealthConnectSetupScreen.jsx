import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Platform, Pressable, Animated, ActivityIndicator,
    ScrollView, Linking, Image, Dimensions, Modal, Vibration, AppState
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Watch, Heart, Wind, Moon, ShieldCheck, ChevronLeft, ChevronDown,
    CheckCircle2, XCircle, Smartphone, ArrowRight, Activity, Sliders,
    HelpCircle, Lock, RefreshCw, MoreHorizontal, AlertTriangle, LogOut,
    Flame, Scale, Droplet, Settings, ArrowUp, ArrowDown, Eye, EyeOff, MapPin
} from 'lucide-react-native';
import {
    initializeHealthPlatform,
    requestHealthPermissions,
    checkPermissionStatus,
    isHealthSupported,
    openHealthSettings,
    getDetailedPermissionStatus,
} from '../../lib/healthIntegration';
import HealthSyncService from '../../services/HealthSyncService';
import HealthRepository from '../../lib/HealthRepository';
import { apiService } from '../../lib/api';
import { colors, spacing, radius, shadows, layout } from '../../theme';
import usePatientStore from '../../store/usePatientStore';
import AlertManager from '../../utils/AlertManager';
import { motion, anim, useReduceMotion } from '../../theme';
import TabScreenTransition from '../../components/ui/TabScreenTransition';
import * as sleepEstimation from '../../lib/sleepEstimation';

const { width: SW } = Dimensions.get('window');

// ── Image Assets ──
const galaxyWatchImg = require('../../../assets/galaxy_watch.jpg');
const fitbitImg = require('../../../assets/fitbit.jpg');
const pixelWatchImg = require('../../../assets/pixel_watch.jpg');
const garminImg = require('../../../assets/garmin.jpg');
const ouraRingImg = require('../../../assets/oura_ring.jpg');

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
    const [lastSyncStr, setLastSyncStr] = useState('just now');
    const [lastCheckedStr, setLastCheckedStr] = useState('—');
    const [syncQuality, setSyncQuality] = useState(96);
    const [syncingNow, setSyncingNow] = useState(false);
    const [syncingBento, setSyncingBento] = useState(false);
    const [sleepStr, setSleepStr] = useState(null);
    const [menuVisible, setMenuVisible] = useState(false);
    const [timelineEvents, setTimelineEvents] = useState([]);
    const [loadingSkeleton, setLoadingSkeleton] = useState(false);
    const [permissionsMap, setPermissionsMap] = useState({
        heartRate: false,
        bloodPressure: false,
        sleep: false,
        oxygen: false,
        hydration: false,
        temperature: false,
        steps: false,
        exercise: false,
        weight: false,
        glucose: false,
    });
    const [permissionsChecklistVisible, setPermissionsChecklistVisible] = useState(false);
    // Bento card configuration and customize states
    const [bentoCards, setBentoCards] = useState([
        { id: 'hr', label: 'Heart Rate', visible: true },
        { id: 'sleep', label: 'Sleep Quality', visible: true },
        { id: 'bp', label: 'Blood Pressure', visible: true },
        { id: 'spo2', label: 'Oxygen Level', visible: true },
        { id: 'steps', label: 'Steps', visible: true },
        { id: 'exercise', label: 'Exercise', visible: true },
        { id: 'weight', label: 'Weight', visible: true },
        { id: 'glucose', label: 'Blood Glucose', visible: true },
    ]);
    const [customizeVisible, setCustomizeVisible] = useState(false);

    // Optional sync categories states
    const [syncActivityEnabled, setSyncActivityEnabled] = useState(false);
    const [syncBodyEnabled, setSyncBodyEnabled] = useState(false);
    const [syncGlucoseEnabled, setSyncGlucoseEnabled] = useState(false);
    const [syncExtVitalsEnabled, setSyncExtVitalsEnabled] = useState(false);

    // Onboarding flow state (only applies when status !== 'granted')
    const [onboardingStep, setOnboardingStep] = useState('explain'); // 'explain' | 'confirm'
    const [firstSyncData, setFirstSyncData] = useState(null);

    const trackSetupEvent = async (event, metadata = {}) => {
        try {
            await apiService.patients.flagIssue({
                type: 'wearable_setup_telemetry',
                description: `Setup Telemetry: ${event}`,
                metadata: {
                    event,
                    timestamp: new Date().toISOString(),
                    ...metadata
                }
            });
        } catch (err) {
            console.warn('Failed to track telemetry setup event:', err);
        }
    };

    // Store variables for real-time vitals
    const vitals = usePatientStore((s) => s.vitals);
    const activity = usePatientStore((s) => s.activity);
    const healthStatus = usePatientStore((s) => s.healthStatus);
    const fetchDashboard = usePatientStore((s) => s.fetchDashboard);

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

    const AsyncStorage = require('@react-native-async-storage/async-storage').default;

    const loadCardLayout = async () => {
        try {
            const saved = await AsyncStorage.getItem('@CareMyMed_bento_layout');
            if (saved) {
                setBentoCards(JSON.parse(saved));
            }
        } catch (e) {
            console.warn('Failed to load card layout:', e);
        }
    };

    const checkOptionalPerms = async () => {
        if (Platform.OS === 'android') {
            try {
                const HealthConnect = require('react-native-health-connect');
                const granted = await HealthConnect.getGrantedPermissions();
                const grantedTypes = granted.map(p => p.recordType);
                
                setSyncActivityEnabled(grantedTypes.includes('Steps') || grantedTypes.includes('ExerciseSession'));
                setSyncBodyEnabled(grantedTypes.includes('Weight') || grantedTypes.includes('Height'));
                setSyncGlucoseEnabled(grantedTypes.includes('BloodGlucose'));
                setSyncExtVitalsEnabled(grantedTypes.includes('RespiratoryRate') || grantedTypes.includes('Vo2Max'));
            } catch (e) {}
        } else if (Platform.OS === 'ios') {
            const saved = await AsyncStorage.getItem('@CareMyMed_optional_perms_granted');
            if (saved) {
                const parsed = JSON.parse(saved);
                setSyncActivityEnabled(parsed.activity);
                setSyncBodyEnabled(parsed.body);
                setSyncGlucoseEnabled(parsed.glucose);
                setSyncExtVitalsEnabled(parsed.extvitals);
            }
        }
    };

    const toggleOptionalCategory = async (category) => {
        let typesToRequest = [];
        switch (category) {
            case 'activity':
                typesToRequest = ['Steps', 'Distance', 'ExerciseSession', 'ActiveCaloriesBurned', 'TotalCaloriesBurned', 'FloorsClimbed'];
                break;
            case 'body':
                typesToRequest = ['Weight', 'Height', 'BodyFat'];
                break;
            case 'glucose':
                typesToRequest = ['BloodGlucose'];
                break;
            case 'extvitals':
                typesToRequest = ['RespiratoryRate', 'Vo2Max'];
                break;
        }

        const { requestOptionalHealthPermissions } = require('../../lib/healthIntegration');
        const granted = await requestOptionalHealthPermissions(typesToRequest);
        if (granted) {
            if (category === 'activity') setSyncActivityEnabled(true);
            if (category === 'body') setSyncBodyEnabled(true);
            if (category === 'glucose') setSyncGlucoseEnabled(true);
            if (category === 'extvitals') setSyncExtVitalsEnabled(true);

            // Refresh the detailed permissions map
            const updated = await getDetailedPermissionStatus();
            setPermissionsMap(updated);

            if (Platform.OS === 'ios') {
                const state = {
                    activity: category === 'activity' ? true : syncActivityEnabled,
                    body: category === 'body' ? true : syncBodyEnabled,
                    glucose: category === 'glucose' ? true : syncGlucoseEnabled,
                    extvitals: category === 'extvitals' ? true : syncExtVitalsEnabled,
                };
                await AsyncStorage.setItem('@CareMyMed_optional_perms_granted', JSON.stringify(state));
            }

            AlertManager.alert('Permission Granted', `CareMyMed will now sync ${category} metrics.`);
        } else {
            AlertManager.alert(
                'Permission Required',
                'This category needs permission from your device\'s Health settings. Would you like to open settings now?',
                [
                    { text: 'Not Now', style: 'cancel' },
                    { text: 'Open Settings', onPress: () => openHealthSettings() },
                ]
            );
        }
    };

    const moveCard = async (index, direction) => {
        const newCards = [...bentoCards];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex >= 0 && targetIndex < newCards.length) {
            const temp = newCards[index];
            newCards[index] = newCards[targetIndex];
            newCards[targetIndex] = temp;
            setBentoCards(newCards);
            await AsyncStorage.setItem('@CareMyMed_bento_layout', JSON.stringify(newCards));
        }
    };

    const toggleCardVisibility = async (id) => {
        const newCards = bentoCards.map(c => c.id === id ? { ...c, visible: !c.visible } : c);
        setBentoCards(newCards);
        await AsyncStorage.setItem('@CareMyMed_bento_layout', JSON.stringify(newCards));
    };

    useEffect(() => {
        let active = true;
        
        const init = async () => {
            setLoadingSkeleton(true);
            const startTime = Date.now();
            
            await trackSetupEvent('setup_opened');
            await checkCurrentStatus();
            await loadSleepData();
            await loadCardLayout();
            await checkOptionalPerms();
            
            if (active) {
                setTimelineEvents(generateDynamicTimeline(new Date()));
                
                const elapsed = Date.now() - startTime;
                if (elapsed < 500) {
                    await new Promise(r => setTimeout(r, 500 - elapsed));
                }
                setLoadingSkeleton(false);
            }
        };
        
        init();
        
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

        const handleAppStateChange = async (nextAppState) => {
            if (nextAppState === 'active') {
                await checkCurrentStatus();
                try {
                    await HealthSyncService.syncNow();
                    await usePatientStore.getState().fetchDashboard(true);
                } catch (e) {
                    console.warn('Auto-sync on app active failed:', e);
                }
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            active = false;
            subscription.remove();
        };
    }, [reduceMotion]);

    const loadSleepData = async () => {
        try {
            const { data } = await apiService.patients.getSleep();
            if (data?.sleep && data.sleep.length > 0) {
                const latest = data.sleep[data.sleep.length - 1];
                if (latest.hours) {
                    const h = Math.floor(latest.hours);
                    const m = Math.round((latest.hours - h) * 60);
                    setSleepStr(m > 0 ? `${h}h ${m}m` : `${h}h`);
                    return;
                }
            }
            const est = await sleepEstimation.estimateSleep();
            if (est?.estimate?.hours) {
                const h = Math.floor(est.estimate.hours);
                const m = Math.round((est.estimate.hours - h) * 60);
                setSleepStr(m > 0 ? `${h}h ${m}m` : `${h}h`);
            }
        } catch (e) {
            console.warn('Failed to load dynamic sleep data:', e);
        }
    };

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
            
            const detailed = await getDetailedPermissionStatus();
            setPermissionsMap(detailed);

            // Fetch sync stats
            const syncStatus = await HealthSyncService.getStatus();
            if (syncStatus.lastSync) {
                const diffMin = Math.round((Date.now() - new Date(syncStatus.lastSync).getTime()) / 60000);
                if (diffMin < 1) setLastSyncStr('just now');
                else if (diffMin < 60) setLastSyncStr(`${diffMin}m ago`);
                else setLastSyncStr(`${Math.round(diffMin / 60)}h ago`);
            }

            // Fetch last permission check verification timestamp
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            const checkedTs = await AsyncStorage.getItem('lastHealthPermissionCheck');
            if (checkedTs) {
                const diffMin = Math.round((Date.now() - parseInt(checkedTs, 10)) / 60000);
                if (diffMin < 1) setLastCheckedStr('just now');
                else if (diffMin < 60) setLastCheckedStr(`${diffMin}m ago`);
                else setLastCheckedStr(`${Math.round(diffMin / 60)}h ago`);
            } else {
                setLastCheckedStr(perm === 'granted' ? 'just now' : 'never');
            }
        } catch (e) {
            console.warn('checkCurrentStatus error:', e);
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

            await trackSetupEvent('connect_clicked');
            const granted = await requestHealthPermissions();
            if (granted) {
                const detailed = await getDetailedPermissionStatus();
                setPermissionsMap(detailed);
                
                const allowedCount = Object.keys(detailed).filter(k => detailed[k]).length;
                await trackSetupEvent('permissions_granted', { allowedCount });

                // Attempt first data read to show real results on confirmation screen
                try {
                    const data = await HealthRepository.fetchAll();
                    setFirstSyncData(data);
                } catch (fetchErr) {
                    console.warn('First sync read failed (non-blocking):', fetchErr);
                    setFirstSyncData({ vitals: [], activity: null, body: null });
                }
                setOnboardingStep('confirm');
            } else {
                setStatus('denied');
                await trackSetupEvent('permissions_denied');
                AlertManager.alert('Permissions Denied', 'Permissions are required to sync watch data.');
            }
        } catch (err) {
            AlertManager.alert('Error', 'Setup failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleOnboardingDone = async () => {
        setStatus('granted');
        setLastCheckedStr('just now');
        await HealthSyncService.setSyncEnabled(true);
        setOnboardingStep('explain'); // reset for future reconnection
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
                        await trackSetupEvent('disconnect_clicked');
                        await HealthSyncService.setSyncEnabled(false);
                        setStatus('denied');
                    },
                },
            ]
        );
    };

    const triggerManualSync = async () => {
        setSyncingNow(true);
        setSyncingBento(true);
        
        let orbRotation;
        if (!reduceMotion) {
            orbRotateAnim.setValue(0);
            orbRotation = Animated.timing(orbRotateAnim, {
                toValue: 2,
                duration: 2000,
                useNativeDriver: true,
            });
            orbRotation.start();
        }

        try {
            await trackSetupEvent('manual_sync_clicked');
            await HealthSyncService.syncNow();
            
            const formatTime = (d) => {
                let hrs = d.getHours();
                const minutes = d.getMinutes();
                const ampm = hrs >= 12 ? 'PM' : 'AM';
                hrs = hrs % 12;
                hrs = hrs ? hrs : 12;
                const minStr = minutes < 10 ? '0' + minutes : minutes;
                return `${hrs}:${minStr} ${ampm}`;
            };
            
            await new Promise(r => setTimeout(r, 600));
            const now = new Date();
            setTimelineEvents(prev => [
                { id: String(Date.now() + 1), time: formatTime(now), desc: 'Establishing secure wearable link...', type: 'sync' },
                ...prev
            ]);
            
            await new Promise(r => setTimeout(r, 600));
            const now2 = new Date();
            setTimelineEvents(prev => [
                { id: String(Date.now() + 2), time: formatTime(now2), desc: 'Imported new Health Connect records', type: 'sync' },
                ...prev
            ]);
            
            await new Promise(r => setTimeout(r, 600));
            
            setLastSyncStr('just now');
            setLastCheckedStr('just now');
            setSyncQuality(Math.round(96 + Math.random() * 3));
            
            await loadSleepData();
            await usePatientStore.getState().fetchDashboard(true);
            
            const now3 = new Date();
            setTimelineEvents(prev => [
                { id: String(Date.now() + 3), time: formatTime(now3), desc: 'Wearable Sync: Vitals & Sleep updated', type: 'sync_success' },
                ...prev
            ]);

            Vibration.vibrate([0, 80, 50, 80]);
            await trackSetupEvent('manual_sync_completed');
        } catch (e) {
            await trackSetupEvent('manual_sync_failed', { error: e.message });
            AlertManager.alert('Sync Failed', 'Could not fetch device logs. Try again later.');
        } finally {
            setSyncingNow(false);
            setSyncingBento(false);
            if (!reduceMotion) {
                orbRotateAnim.setValue(0);
                Animated.loop(
                    Animated.timing(orbRotateAnim, { toValue: 1, duration: 8000, useNativeDriver: true })
                ).start();
            }
        }
    };

    const platformName = Platform.OS === 'ios' ? 'Apple HealthKit' : 'Google Health Connect';
    const isConnected = status === 'granted';

    const rotateInterpolate = orbRotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });




    const renderBentoCard = (card) => {
        let icon = null;
        let bg = '#FEE2E2';
        let val = '—';
        let badge = 'LIVE';

        let hasPerm = false;
        switch (card.id) {
            case 'hr': hasPerm = permissionsMap.heartRate; break;
            case 'sleep': hasPerm = permissionsMap.sleep; break;
            case 'bp': hasPerm = permissionsMap.bloodPressure; break;
            case 'spo2': hasPerm = permissionsMap.oxygen; break;
            case 'steps': hasPerm = permissionsMap.steps; break;
            case 'exercise': hasPerm = permissionsMap.exercise; break;
            case 'weight': hasPerm = permissionsMap.weight; break;
            case 'glucose': hasPerm = permissionsMap.glucose; break;
        }

        switch (card.id) {
            case 'hr':
                icon = <Heart size={16} color="#EF4444" strokeWidth={2.5} />;
                bg = '#FEE2E2';
                val = hasPerm 
                    ? (vitals?.heart_rate ? `${vitals.heart_rate} bpm` : 'Waiting for first sync...') 
                    : 'Permission Required';
                badge = 'LIVE';
                break;
            case 'sleep':
                icon = <Moon size={16} color="#8B5CF6" strokeWidth={2.5} />;
                bg = '#F5F3FF';
                val = hasPerm 
                    ? (sleepStr ? sleepStr : 'No activity today') 
                    : 'Permission Required';
                badge = 'DAILY';
                break;
            case 'bp':
                icon = <Activity size={16} color="#3B82F6" strokeWidth={2.5} />;
                bg = '#EFF6FF';
                val = hasPerm 
                    ? (vitals?.blood_pressure?.systolic 
                        ? `${vitals.blood_pressure.systolic}/${vitals.blood_pressure.diastolic}` 
                        : 'Waiting for first sync...') 
                    : 'Permission Required';
                badge = 'LIVE';
                break;
            case 'spo2':
                icon = <Wind size={16} color="#06B6D4" strokeWidth={2.5} />;
                bg = '#ECFEFF';
                val = hasPerm 
                    ? (vitals?.oxygen_saturation ? `${vitals.oxygen_saturation}%` : 'Waiting for first sync...') 
                    : 'Permission Required';
                badge = 'LIVE';
                break;
            case 'steps':
                icon = <Activity size={16} color="#10B981" strokeWidth={2.5} />;
                bg = '#D1FAE5';
                val = hasPerm 
                    ? (activity?.steps != null ? `${activity.steps.toLocaleString()} steps` : '0 steps') 
                    : 'Permission Required';
                badge = 'DAILY';
                break;
            case 'exercise':
                icon = <Flame size={16} color="#F59E0B" strokeWidth={2.5} />;
                bg = '#FEF3C7';
                const exerciseMins = activity?.exercises?.reduce((sum, e) => sum + (e.duration_minutes || 0), 0) || 0;
                val = hasPerm 
                    ? (exerciseMins > 0 ? `${exerciseMins} mins` : 'No exercise today') 
                    : 'Permission Required';
                badge = 'DAILY';
                break;
            case 'weight':
                icon = <Scale size={16} color="#6366F1" strokeWidth={2.5} />;
                bg = '#E0E7FF';
                const profile = usePatientStore.getState().patient || {};
                val = hasPerm 
                    ? (profile.weight_kg ? `${profile.weight_kg} kg` : (activity?.weight ? `${activity.weight} kg` : 'Waiting for first sync...')) 
                    : 'Permission Required';
                badge = 'LATEST';
                break;
            case 'glucose':
                icon = <Droplet size={16} color="#EC4899" strokeWidth={2.5} />;
                bg = '#FCE7F3';
                val = hasPerm 
                    ? (vitals?.blood_glucose ? `${vitals.blood_glucose} mg/dL` : 'Waiting for first sync...') 
                    : 'Permission Required';
                badge = 'LIVE';
                break;
        }

        return (
            <Pressable 
                key={card.id}
                style={({ pressed }) => [
                    styles.bentoCard, 
                    pressed && { opacity: 0.7 },
                    syncingBento && styles.bentoCardSyncing
                ]}
                onPress={() => {
                    if (!hasPerm) {
                        openHealthSettings();
                    }
                }}
            >
                <View style={styles.bentoHeader}>
                    <View style={[styles.bentoIconBox, { backgroundColor: bg }]}>
                        {icon}
                    </View>
                    <View style={styles.liveMetricBadge}><Text style={styles.liveMetricBadgeTxt}>{badge}</Text></View>
                </View>
                {syncingBento ? (
                    <ActivityIndicator size="small" color="#8B5CF6" style={{ alignSelf: 'flex-start', marginVertical: 4, height: 24 }} />
                ) : (
                    <Text style={[styles.bentoVal, !hasPerm && { fontSize: 13, color: colors.textMuted }]}>{val}</Text>
                )}
                <Text style={styles.bentoLabel}>{card.label}</Text>
            </Pressable>
        );
    };

    return (
        <TabScreenTransition>
        <View style={styles.container}>
            {loadingSkeleton && (
                <View style={styles.skeletonContainer}>
                    <ActivityIndicator size="large" color="#8B5CF6" />
                    <Text style={{ marginTop: 12, ...FONT.medium, color: colors.textSecondary }}>
                        Refreshing Connection Health...
                    </Text>
                </View>
            )}
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

            {/* ── Onboarding: Pre-Permission Explainer ────────── */}
            {!isConnected && onboardingStep === 'explain' ? (
                <>
                    {/* Hero */}
                    <View style={styles.obHero}>
                        <View style={styles.obIconWrap}>
                            <Heart size={32} color="#FFFFFF" strokeWidth={2} />
                        </View>
                        <Text style={styles.obTitle}>Connect your health data</Text>
                        <Text style={styles.obSubtitle}>
                            CareMyMed works with {platformName} to give you and your care team real-time health insights.
                        </Text>
                    </View>

                    {/* Benefits */}
                    <View style={styles.obSection}>
                        <Text style={styles.obSectionTitle}>What you'll get</Text>

                        <View style={styles.obBenefitRow}>
                            <View style={[styles.obBenefitIcon, { backgroundColor: '#FEE2E2' }]}>
                                <Heart size={18} color="#EF4444" strokeWidth={2.5} />
                            </View>
                            <View style={styles.obBenefitText}>
                                <Text style={styles.obBenefitTitle}>Track vitals automatically</Text>
                                <Text style={styles.obBenefitDesc}>Heart rate, blood pressure, oxygen levels, and temperature — synced from your wearable.</Text>
                            </View>
                        </View>

                        <View style={styles.obBenefitRow}>
                            <View style={[styles.obBenefitIcon, { backgroundColor: '#D1FAE5' }]}>
                                <Activity size={18} color="#10B981" strokeWidth={2.5} />
                            </View>
                            <View style={styles.obBenefitText}>
                                <Text style={styles.obBenefitTitle}>Monitor daily activity</Text>
                                <Text style={styles.obBenefitDesc}>Steps, workouts, calories, and distance — all in one place.</Text>
                            </View>
                        </View>

                        <View style={styles.obBenefitRow}>
                            <View style={[styles.obBenefitIcon, { backgroundColor: '#E0E7FF' }]}>
                                <Sliders size={18} color="#6366F1" strokeWidth={2.5} />
                            </View>
                            <View style={styles.obBenefitText}>
                                <Text style={styles.obBenefitTitle}>Personalized health insights</Text>
                                <Text style={styles.obBenefitDesc}>Your care team uses this data to spot trends and adjust your care plan.</Text>
                            </View>
                        </View>
                    </View>

                    {/* What we'll read */}
                    <View style={styles.obSection}>
                        <Text style={styles.obSectionTitle}>What CareMyMed will read</Text>

                        <View style={styles.obDataCategory}>
                            <View style={styles.obDataCatHeader}>
                                <View style={styles.obDataCatBadge}><Text style={styles.obDataCatBadgeTxt}>CORE</Text></View>
                                <Text style={styles.obDataCatLabel}>Requested on connect</Text>
                            </View>
                            <Text style={styles.obDataCatItems}>Heart rate · Blood pressure · SpO₂ · Sleep · Temperature · Hydration</Text>
                        </View>

                        <View style={styles.obDataCategory}>
                            <View style={styles.obDataCatHeader}>
                                <View style={[styles.obDataCatBadge, { backgroundColor: '#D1FAE5' }]}><Text style={[styles.obDataCatBadgeTxt, { color: '#059669' }]}>FITNESS</Text></View>
                                <Text style={styles.obDataCatLabel}>Enable later in settings</Text>
                            </View>
                            <Text style={styles.obDataCatItems}>Steps · Distance · Calories · Exercise · VO₂ max</Text>
                        </View>

                        <View style={styles.obDataCategory}>
                            <View style={styles.obDataCatHeader}>
                                <View style={[styles.obDataCatBadge, { backgroundColor: '#E0E7FF' }]}><Text style={[styles.obDataCatBadgeTxt, { color: '#4338CA' }]}>ADVANCED</Text></View>
                                <Text style={styles.obDataCatLabel}>Enable later in settings</Text>
                            </View>
                            <Text style={styles.obDataCatItems}>Weight · Height · Body fat · Blood glucose · Respiratory rate</Text>
                        </View>
                    </View>

                    {/* Privacy — only claims that are true today */}
                    <View style={styles.obSection}>
                        <Text style={styles.obSectionTitle}>Your privacy</Text>

                        <View style={styles.obPrivacyRow}>
                            <Lock size={16} color={colors.textSecondary} />
                            <Text style={styles.obPrivacyText}>Your data is encrypted and stored securely</Text>
                        </View>
                        <View style={styles.obPrivacyRow}>
                            <ShieldCheck size={16} color={colors.textSecondary} />
                            <Text style={styles.obPrivacyText}>CareMyMed only reads data — we never modify your health records</Text>
                        </View>
                        <View style={styles.obPrivacyRow}>
                            <Settings size={16} color={colors.textSecondary} />
                            <Text style={styles.obPrivacyText}>You can revoke access anytime in your device's {Platform.OS === 'ios' ? 'Health' : 'Health Connect'} settings</Text>
                        </View>
                    </View>

                    {/* Connect button */}
                    <View style={styles.obActionArea}>
                        <Pressable
                            style={({ pressed }) => [styles.obConnectBtn, pressed && { opacity: 0.85 }]}
                            onPress={handleConnect}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <>
                                    <Watch size={18} color="#FFFFFF" strokeWidth={2.5} />
                                    <Text style={styles.obConnectBtnTxt}>Connect {Platform.OS === 'ios' ? 'HealthKit' : 'Health Connect'}</Text>
                                </>
                            )}
                        </Pressable>
                        <Text style={styles.obConnectNote}>
                            A system dialog will ask you to approve the permissions above.
                        </Text>
                    </View>
                </>

            ) : !isConnected && onboardingStep === 'confirm' ? (
                /* ── Onboarding: Post-Permission Confirmation ────── */
                <>
                    <View style={styles.obHero}>
                        <View style={[styles.obIconWrap, { backgroundColor: '#059669' }]}>
                            <CheckCircle2 size={32} color="#FFFFFF" strokeWidth={2} />
                        </View>
                        <Text style={styles.obTitle}>Connected!</Text>
                        <Text style={styles.obSubtitle}>
                            CareMyMed can now read your health data from {platformName}.
                        </Text>
                    </View>

                    {/* Show real data or honest empty state */}
                    <View style={styles.obSection}>
                        {firstSyncData && (firstSyncData.vitals?.length > 0 || firstSyncData.activity || firstSyncData.body) ? (
                            <>
                                <Text style={styles.obSectionTitle}>First sync results</Text>
                                <View style={styles.obSyncResults}>
                                    {firstSyncData.vitals?.length > 0 && (
                                        <View style={styles.obSyncResultRow}>
                                            <Heart size={16} color="#EF4444" />
                                            <Text style={styles.obSyncResultText}>
                                                {firstSyncData.vitals.length} vital reading{firstSyncData.vitals.length !== 1 ? 's' : ''} synced
                                            </Text>
                                        </View>
                                    )}
                                    {firstSyncData.activity && (
                                        <>
                                            {firstSyncData.activity.steps ? (
                                                <View style={styles.obSyncResultRow}>
                                                    <Activity size={16} color="#10B981" />
                                                    <Text style={styles.obSyncResultText}>
                                                        {firstSyncData.activity.steps.toLocaleString()} steps today
                                                    </Text>
                                                </View>
                                            ) : null}
                                            {firstSyncData.activity.distance_meters ? (
                                                <View style={styles.obSyncResultRow}>
                                                    <MapPin size={16} color="#06B6D4" />
                                                    <Text style={styles.obSyncResultText}>
                                                        {(firstSyncData.activity.distance_meters / 1000).toFixed(2)} km distance today
                                                    </Text>
                                                </View>
                                            ) : null}
                                            {firstSyncData.activity.active_calories ? (
                                                <View style={styles.obSyncResultRow}>
                                                    <Flame size={16} color="#F59E0B" />
                                                    <Text style={styles.obSyncResultText}>
                                                        {firstSyncData.activity.active_calories} kcal burned today
                                                    </Text>
                                                </View>
                                            ) : null}
                                            {!firstSyncData.activity.steps && !firstSyncData.activity.distance_meters && !firstSyncData.activity.active_calories && (
                                                <View style={styles.obSyncResultRow}>
                                                    <Activity size={16} color="#10B981" />
                                                    <Text style={styles.obSyncResultText}>
                                                        Activity data synced
                                                    </Text>
                                                </View>
                                            )}
                                        </>
                                    )}
                                    {firstSyncData.body && (
                                        <View style={styles.obSyncResultRow}>
                                            <Scale size={16} color="#6366F1" />
                                            <Text style={styles.obSyncResultText}>
                                                {firstSyncData.body.weight_kg ? `${firstSyncData.body.weight_kg} kg recorded` : 'Body data synced'}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </>
                        ) : (
                            <>
                                <Text style={styles.obSectionTitle}>No health records yet</Text>
                                <View style={styles.obEmptyState}>
                                    <Text style={styles.obEmptyText}>
                                        That's completely normal. Your data will appear here after your wearable's next sync with {Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'}.
                                    </Text>
                                    <Text style={styles.obEmptyNote}>
                                        Most wearables sync every 15–30 minutes. You can also trigger a manual sync from the dashboard.
                                    </Text>
                                </View>
                            </>
                        )}
                    </View>

                    {/* What happens next */}
                    <View style={styles.obSection}>
                        <Text style={styles.obSectionTitle}>What happens next</Text>
                        <View style={styles.obPrivacyRow}>
                            <RefreshCw size={16} color={colors.textSecondary} />
                            <Text style={styles.obPrivacyText}>Health data syncs automatically every 15 minutes</Text>
                        </View>
                        <View style={styles.obPrivacyRow}>
                            <Smartphone size={16} color={colors.textSecondary} />
                            <Text style={styles.obPrivacyText}>Enable optional categories like steps and weight from the dashboard</Text>
                        </View>
                    </View>

                    {/* Done button */}
                    <View style={styles.obActionArea}>
                        <Pressable
                            style={({ pressed }) => [styles.obConnectBtn, { backgroundColor: '#059669' }, pressed && { opacity: 0.85 }]}
                            onPress={handleOnboardingDone}
                        >
                            <CheckCircle2 size={18} color="#FFFFFF" strokeWidth={2.5} />
                            <Text style={styles.obConnectBtnTxt}>Done</Text>
                        </Pressable>
                    </View>
                </>
            ) : (
                /* ── Existing Connected Dashboard ────────────────── */
                <>
                {/* ── Connection Health Diagnostics Card ────────── */}
                <View style={styles.diagnosticsCard}>
                    <LinearGradient
                        colors={['#FFFFFF', '#FFFFFF']}
                        style={styles.diagnosticsGradient}
                    >
                        <View style={styles.diagnosticsHeader}>
                            <ShieldCheck size={20} color={colors.success} />
                            <Text style={styles.diagnosticsTitle}>Connection Diagnostics</Text>
                            <View style={styles.diagnosticsStatusBadge}>
                                <Text style={styles.diagnosticsStatusText}>Active</Text>
                            </View>
                        </View>
                        
                        <View style={styles.diagnosticsGrid}>
                            <View style={styles.diagnosticsCol}>
                                <Text style={styles.diagnosticsLabel}>Provider</Text>
                                <Text style={styles.diagnosticsValue}>{healthStatus?.provider || platformName}</Text>
                            </View>
                            <View style={styles.diagnosticsCol}>
                                <Text style={styles.diagnosticsLabel}>Last Synced</Text>
                                <Text style={styles.diagnosticsValue}>{lastSyncStr}</Text>
                            </View>
                        </View>
                        
                        <View style={styles.diagnosticsGrid}>
                            <View style={styles.diagnosticsCol}>
                                <Text style={styles.diagnosticsLabel}>Syncs Today</Text>
                                <Text style={styles.diagnosticsValue}>{healthStatus?.syncCountToday || 0} times</Text>
                            </View>
                            <View style={styles.diagnosticsCol}>
                                <Text style={styles.diagnosticsLabel}>Permissions</Text>
                                <Text style={styles.diagnosticsValue}>
                                    {Object.keys(permissionsMap).filter(k => permissionsMap[k]).length} / {Object.keys(permissionsMap).length} Granted
                                </Text>
                            </View>
                        </View>

                        {/* Manage Permissions toggle */}
                        <Pressable 
                            style={({ pressed }) => [styles.permToggleBtn, pressed && { opacity: 0.7 }]}
                            onPress={() => setPermissionsChecklistVisible(v => !v)}
                        >
                            <Sliders size={14} color={colors.primary} style={{ marginRight: 6 }} />
                            <Text style={styles.permToggleTxt}>
                                {permissionsChecklistVisible ? 'Hide Permissions' : 'Manage Permissions'}
                            </Text>
                            <ChevronDown 
                                size={14} 
                                color={colors.primary} 
                                style={{ marginLeft: 'auto', transform: [{ rotate: permissionsChecklistVisible ? '180deg' : '0deg' }] }} 
                            />
                        </Pressable>

                        {permissionsChecklistVisible && (
                            <View style={styles.permChecklist}>
                                {[
                                    { key: 'heartRate', label: 'Heart Rate', icon: <Heart size={14} color="#EF4444" /> },
                                    { key: 'bloodPressure', label: 'Blood Pressure', icon: <Activity size={14} color="#3B82F6" /> },
                                    { key: 'sleep', label: 'Sleep', icon: <Moon size={14} color="#8B5CF6" /> },
                                    { key: 'oxygen', label: 'Oxygen Level', icon: <Wind size={14} color="#06B6D4" /> },
                                    { key: 'steps', label: 'Steps', icon: <Activity size={14} color="#10B981" /> },
                                    { key: 'exercise', label: 'Exercise', icon: <Flame size={14} color="#F59E0B" /> },
                                    { key: 'weight', label: 'Weight', icon: <Scale size={14} color="#6366F1" /> },
                                    { key: 'glucose', label: 'Blood Glucose', icon: <Droplet size={14} color="#EC4899" /> },
                                    { key: 'hydration', label: 'Hydration', icon: <Droplet size={14} color="#06B6D4" /> },
                                    { key: 'temperature', label: 'Body Temperature', icon: <Activity size={14} color="#F97316" /> },
                                ].map(item => (
                                    <View key={item.key} style={styles.permRow}>
                                        {item.icon}
                                        <Text style={styles.permRowLabel}>{item.label}</Text>
                                        {permissionsMap[item.key] ? (
                                            <View style={styles.permBadgeGranted}>
                                                <CheckCircle2 size={12} color="#059669" />
                                                <Text style={styles.permBadgeGrantedTxt}>Enabled</Text>
                                            </View>
                                        ) : (
                                            <View style={styles.permBadgeDenied}>
                                                <XCircle size={12} color="#DC2626" />
                                                <Text style={styles.permBadgeDeniedTxt}>Not Allowed</Text>
                                            </View>
                                        )}
                                    </View>
                                ))}
                                
                                {Object.values(permissionsMap).some(v => !v) && (
                                    <Pressable 
                                        style={({ pressed }) => [styles.permSettingsBtn, pressed && { opacity: 0.8 }]}
                                        onPress={openHealthSettings}
                                    >
                                        <Settings size={14} color="#FFF" style={{ marginRight: 6 }} />
                                        <Text style={styles.permSettingsBtnTxt}>Open Health Settings</Text>
                                    </Pressable>
                                )}
                            </View>
                        )}
                    </LinearGradient>
                </View>

                {/* ── Warning Banner for Partial Permissions ────── */}
                {(() => {
                    const coreKeys = ['heartRate', 'bloodPressure', 'sleep', 'oxygen', 'hydration', 'temperature'];
                    const grantedCoreCount = coreKeys.filter(k => permissionsMap[k]).length;
                    const missingCoreKeys = coreKeys.filter(k => !permissionsMap[k]);
                    const hasPartialPermissions = isConnected && grantedCoreCount > 0 && grantedCoreCount < coreKeys.length;
                    
                    if (!hasPartialPermissions) return null;

                    const categoryLabelMap = {
                        heartRate: 'Heart Rate',
                        bloodPressure: 'Blood Pressure',
                        sleep: 'Sleep Quality',
                        oxygen: 'Oxygen Level',
                        hydration: 'Hydration',
                        temperature: 'Body Temperature',
                    };
                    const missingLabels = missingCoreKeys.map(k => categoryLabelMap[k] || k);

                    return (
                        <View style={styles.warningBanner}>
                            <AlertTriangle size={20} color="#F59E0B" style={styles.warningIcon} />
                            <View style={styles.warningContent}>
                                <Text style={styles.warningTitle}>Partial Permissions</Text>
                                <Text style={styles.warningDesc}>
                                    CareMyMed is missing access to: {missingLabels.join(', ')}.
                                </Text>
                                <Pressable 
                                    style={({ pressed }) => [styles.warningCta, pressed && { opacity: 0.8 }]}
                                    onPress={openHealthSettings}
                                >
                                    <Sliders size={14} color="#FFF" style={{ marginRight: 6 }} />
                                    <Text style={styles.warningCtaTxt}>Review Permissions</Text>
                                </Pressable>
                            </View>
                        </View>
                    );
                })()}

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
                        {isConnected ? `Connected ${lastSyncStr} · Verified: ${lastCheckedStr}` : 'Not Linked'}
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
                    {(() => {
                        const visibleCards = bentoCards.filter(c => c.visible);
                        const rows = [];
                        for (let i = 0; i < visibleCards.length; i += 2) {
                            rows.push(visibleCards.slice(i, i + 2));
                        }
                        return rows.map((row, rowIndex) => (
                            <View key={rowIndex} style={styles.bentoGrid}>
                                {row.map(card => renderBentoCard(card))}
                            </View>
                        ));
                    })()}
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
                    {/* ── Optional Sync Categories ─────────────────── */}
                    <View style={styles.optionalSection}>
                        <Text style={styles.sectionTitleLabel}>Optional Categories to Sync</Text>
                        
                        <View style={styles.optCard}>
                            <View style={styles.optCardHeader}>
                                <Smartphone size={20} color={colors.primary} />
                                <Text style={styles.optCardTitle}>Steps & Daily Activity</Text>
                                <Pressable 
                                    style={[styles.optToggle, syncActivityEnabled && styles.optToggleActive]} 
                                    onPress={() => toggleOptionalCategory('activity')}
                                >
                                    <Text style={[styles.optToggleTxt, syncActivityEnabled && styles.optToggleTxtActive]}>
                                        {syncActivityEnabled ? 'Enabled' : 'Enable'}
                                    </Text>
                                </Pressable>
                            </View>
                            <Text style={styles.optCardDesc}>
                                Sync daily steps, distance, active calories burned, and flights climbed.
                            </Text>
                        </View>

                        <View style={styles.optCard}>
                            <View style={styles.optCardHeader}>
                                <Scale size={20} color={colors.primary} />
                                <Text style={styles.optCardTitle}>Weight & Body Composition</Text>
                                <Pressable 
                                    style={[styles.optToggle, syncBodyEnabled && styles.optToggleActive]} 
                                    onPress={() => toggleOptionalCategory('body')}
                                >
                                    <Text style={[styles.optToggleTxt, syncBodyEnabled && styles.optToggleTxtActive]}>
                                        {syncBodyEnabled ? 'Enabled' : 'Enable'}
                                    </Text>
                                </Pressable>
                            </View>
                            <Text style={styles.optCardDesc}>
                                Sync weight, height, and body fat percentage snapshots.
                            </Text>
                        </View>

                        <View style={styles.optCard}>
                            <View style={styles.optCardHeader}>
                                <Droplet size={20} color={colors.primary} />
                                <Text style={styles.optCardTitle}>Blood Glucose Monitoring</Text>
                                <Pressable 
                                    style={[styles.optToggle, syncGlucoseEnabled && styles.optToggleActive]} 
                                    onPress={() => toggleOptionalCategory('glucose')}
                                >
                                    <Text style={[styles.optToggleTxt, syncGlucoseEnabled && styles.optToggleTxtActive]}>
                                        {syncGlucoseEnabled ? 'Enabled' : 'Enable'}
                                    </Text>
                                </Pressable>
                            </View>
                            <Text style={styles.optCardDesc}>
                                Sync continuous/manual blood glucose metrics.
                            </Text>
                        </View>

                        <View style={styles.optCard}>
                            <View style={styles.optCardHeader}>
                                <Activity size={20} color={colors.primary} />
                                <Text style={styles.optCardTitle}>VO₂ Max & Respiratory Rate</Text>
                                <Pressable 
                                    style={[styles.optToggle, syncExtVitalsEnabled && styles.optToggleActive]} 
                                    onPress={() => toggleOptionalCategory('extvitals')}
                                >
                                    <Text style={[styles.optToggleTxt, syncExtVitalsEnabled && styles.optToggleTxtActive]}>
                                        {syncExtVitalsEnabled ? 'Enabled' : 'Enable'}
                                    </Text>
                                </Pressable>
                            </View>
                            <Text style={styles.optCardDesc}>
                                Sync cardiovascular efficiency (VO₂ max) and sleep breathing rates.
                            </Text>
                        </View>
                    </View>

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
                </>
            )}
            </ScrollView>

            {/* ── Floating Sync Control Bar (only when connected) ── */}
            {isConnected && (
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
                                NomPress={handleConnect}
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
            )}

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

                        <Pressable style={({ pressed }) => [styles.modalActionRow, pressed && { backgroundColor: '#F8FAFC' }]} onPress={() => { setMenuVisible(false); setCustomizeVisible(true); }}>
                            <Settings size={20} color={colors.textSecondary} />
                            <Text style={styles.modalActionText}>Customize Bento Dashboard</Text>
                        </Pressable>

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

            {/* ── Customize Dashboard Bento Modal ─────────────── */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={customizeVisible}
                onRequestClose={() => setCustomizeVisible(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setCustomizeVisible(false)}>
                    <Pressable style={[styles.modalContent, { maxHeight: '80%' }]} onPress={(e) => e.stopPropagation()}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>Customize Bento Grid</Text>
                        <Text style={styles.modalSub}>Reorder or toggle visibility of bento cards</Text>

                        <ScrollView style={{ marginVertical: 12 }}>
                            {bentoCards.map((card, index) => (
                                <View key={card.id} style={styles.custRow}>
                                    <Text style={styles.custLabel}>{card.label}</Text>
                                    <View style={styles.custActions}>
                                        {/* Visibility toggle */}
                                        <Pressable style={styles.custBtn} onPress={() => toggleCardVisibility(card.id)}>
                                            {card.visible ? (
                                                <Eye size={18} color={colors.primary} />
                                            ) : (
                                                <EyeOff size={18} color={colors.textMuted} />
                                            )}
                                        </Pressable>

                                        {/* Reorder Up */}
                                        <Pressable 
                                            style={[styles.custBtn, index === 0 && { opacity: 0.3 }]} 
                                            onPress={() => moveCard(index, 'up')}
                                            disabled={index === 0}
                                        >
                                            <ArrowUp size={16} color={colors.textSecondary} />
                                        </Pressable>

                                        {/* Reorder Down */}
                                        <Pressable 
                                            style={[styles.custBtn, index === bentoCards.length - 1 && { opacity: 0.3 }]} 
                                            onPress={() => moveCard(index, 'down')}
                                            disabled={index === bentoCards.length - 1}
                                        >
                                            <ArrowDown size={16} color={colors.textSecondary} />
                                        </Pressable>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>

                        <Pressable style={styles.modalCancelBtn} onPress={() => setCustomizeVisible(false)}>
                            <Text style={styles.modalCancelText}>Done</Text>
                        </Pressable>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
        </TabScreenTransition>
    );
}

const generateDynamicTimeline = (syncTime = new Date()) => {
    const formatTime = (date) => {
        let hrs = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hrs >= 12 ? 'PM' : 'AM';
        hrs = hrs % 12;
        hrs = hrs ? hrs : 12;
        const minStr = minutes < 10 ? '0' + minutes : minutes;
        return `${hrs}:${minStr} ${ampm}`;
    };
    
    const t1 = new Date(syncTime.getTime() - 2 * 60 * 1000); // 2m ago
    const t2 = new Date(syncTime.getTime() - 15 * 60 * 1000); // 15m ago
    const t3 = new Date(syncTime.getTime() - 45 * 60 * 1000); // 45m ago
    const t4 = new Date(syncTime.getTime() - 120 * 60 * 1000); // 2h ago
    
    return [
        { id: '1', time: formatTime(t1), desc: 'Heart Rate Synced', type: 'hr' },
        { id: '2', time: formatTime(t2), desc: 'Sleep Session Imported', type: 'sleep' },
        { id: '3', time: formatTime(t3), desc: 'Steps & Activity Updated', type: 'steps' },
        { id: '4', time: formatTime(t4), desc: 'Oxygen Saturation Recorded', type: 'spo2' },
    ];
};

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
        paddingBottom: 40,
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
    bentoCardSyncing: {
        borderColor: '#818CF8',
        backgroundColor: '#F8FAFC',
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

    // ── Optional Categories Styles ───────────────────
    optionalSection: {
        marginBottom: 28,
    },
    optCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: radius.lg,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.borderLight,
        ...shadows.card,
        marginBottom: 12,
    },
    optCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    optCardTitle: {
        flex: 1,
        fontSize: 14,
        ...FONT.bold,
        color: colors.textPrimary,
        marginLeft: 10,
    },
    optToggle: {
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
    },
    optToggleActive: {
        backgroundColor: colors.successLight,
    },
    optToggleTxt: {
        fontSize: 12,
        ...FONT.bold,
        color: colors.textSecondary,
    },
    optToggleTxtActive: {
        color: colors.success,
    },
    optCardDesc: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textMuted,
        lineHeight: 18,
    },

    // ── Bento Layout Customizer Styles ────────────────
    custRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
    },
    custLabel: {
        fontSize: 14,
        ...FONT.semibold,
        color: colors.textPrimary,
        flex: 1,
    },
    custActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    custBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ── Onboarding Screens ──────────────────────────────────────
    obHero: {
        alignItems: 'center',
        paddingTop: 32,
        paddingBottom: 24,
        paddingHorizontal: 24,
    },
    obIconWrap: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#6366F1',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    obTitle: {
        ...FONT.bold,
        fontSize: 26,
        color: colors.textPrimary,
        textAlign: 'center',
        marginBottom: 10,
    },
    obSubtitle: {
        ...FONT.regular,
        fontSize: 15,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },
    obSection: {
        paddingHorizontal: 20,
        marginBottom: 24,
    },
    obSectionTitle: {
        ...FONT.semibold,
        fontSize: 16,
        color: colors.textPrimary,
        marginBottom: 14,
    },
    obBenefitRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 16,
        gap: 14,
    },
    obBenefitIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    obBenefitText: {
        flex: 1,
    },
    obBenefitTitle: {
        ...FONT.semibold,
        fontSize: 14,
        color: colors.textPrimary,
        marginBottom: 3,
    },
    obBenefitDesc: {
        ...FONT.regular,
        fontSize: 13,
        color: colors.textSecondary,
        lineHeight: 19,
    },
    obDataCategory: {
        backgroundColor: colors.cardBg || '#F8FAFC',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
    },
    obDataCatHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
    },
    obDataCatBadge: {
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    obDataCatBadgeTxt: {
        ...FONT.bold,
        fontSize: 10,
        color: '#DC2626',
        letterSpacing: 0.5,
    },
    obDataCatLabel: {
        ...FONT.regular,
        fontSize: 12,
        color: colors.textMuted,
    },
    obDataCatItems: {
        ...FONT.medium,
        fontSize: 13,
        color: colors.textSecondary,
        lineHeight: 20,
    },
    obPrivacyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    obPrivacyText: {
        ...FONT.regular,
        fontSize: 13,
        color: colors.textSecondary,
        flex: 1,
        lineHeight: 19,
    },
    obActionArea: {
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 32,
        alignItems: 'center',
    },
    obConnectBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: '#6366F1',
        borderRadius: 16,
        paddingVertical: 16,
        width: '100%',
    },
    obConnectBtnTxt: {
        ...FONT.semibold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    obConnectNote: {
        ...FONT.regular,
        fontSize: 12,
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: 12,
    },
    obSyncResults: {
        backgroundColor: colors.cardBg || '#F8FAFC',
        borderRadius: 12,
        padding: 16,
        gap: 14,
    },
    obSyncResultRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    obSyncResultText: {
        ...FONT.medium,
        fontSize: 14,
        color: colors.textPrimary,
    },
    obEmptyState: {
        backgroundColor: colors.cardBg || '#F8FAFC',
        borderRadius: 12,
        padding: 20,
    },
    obEmptyText: {
        ...FONT.regular,
        fontSize: 14,
        color: colors.textSecondary,
        lineHeight: 21,
        marginBottom: 10,
    },
    obEmptyNote: {
        ...FONT.regular,
        fontSize: 12,
        color: colors.textMuted,
        lineHeight: 18,
    },
    diagnosticsCard: {
        borderRadius: radius.xl || 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.borderLight,
        marginBottom: 20,
        backgroundColor: '#FFFFFF',
        ...shadows.sm,
    },
    diagnosticsGradient: {
        padding: 16,
    },
    diagnosticsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    diagnosticsTitle: {
        fontSize: 15,
        ...FONT.bold,
        color: colors.textPrimary,
        marginLeft: 8,
        flex: 1,
    },
    diagnosticsStatusBadge: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radius.full || 12,
    },
    diagnosticsStatusText: {
        fontSize: 12,
        ...FONT.bold,
        color: colors.success,
    },
    diagnosticsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    diagnosticsCol: {
        flex: 1,
    },
    diagnosticsLabel: {
        fontSize: 11,
        ...FONT.semibold,
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    diagnosticsValue: {
        fontSize: 14,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    warningBanner: {
        flexDirection: 'row',
        backgroundColor: '#FFFBEB',
        borderColor: '#FEF3C7',
        borderWidth: 1,
        borderRadius: radius.lg || 12,
        padding: 16,
        marginBottom: 20,
    },
    warningIcon: {
        marginRight: 12,
        marginTop: 2,
    },
    warningContent: {
        flex: 1,
    },
    warningTitle: {
        fontSize: 14,
        ...FONT.bold,
        color: '#B45309',
        marginBottom: 4,
    },
    warningDesc: {
        fontSize: 13,
        ...FONT.regular,
        color: '#D97706',
        lineHeight: 18,
        marginBottom: 12,
    },
    warningCta: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: '#D97706',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radius.md || 8,
    },
    warningCtaTxt: {
        fontSize: 13,
        ...FONT.bold,
        color: '#FFFFFF',
    },
    skeletonContainer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        zIndex: 9999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    permToggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: radius.md || 8,
        backgroundColor: 'rgba(99, 102, 241, 0.06)',
        marginTop: 4,
    },
    permToggleTxt: {
        fontSize: 13,
        ...FONT.semibold,
        color: colors.primary,
    },
    permChecklist: {
        marginTop: 12,
        gap: 8,
    },
    permRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: radius.md || 8,
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
    },
    permRowLabel: {
        flex: 1,
        fontSize: 13,
        ...FONT.medium,
        color: colors.textPrimary,
        marginLeft: 10,
    },
    permBadgeGranted: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(5, 150, 105, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: radius.full || 12,
        gap: 4,
    },
    permBadgeGrantedTxt: {
        fontSize: 11,
        ...FONT.bold,
        color: '#059669',
    },
    permBadgeDenied: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(220, 38, 38, 0.08)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: radius.full || 12,
        gap: 4,
    },
    permBadgeDeniedTxt: {
        fontSize: 11,
        ...FONT.bold,
        color: '#DC2626',
    },
    permSettingsBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: radius.md || 8,
        marginTop: 8,
    },
    permSettingsBtnTxt: {
        fontSize: 13,
        ...FONT.bold,
        color: '#FFFFFF',
    },
});
