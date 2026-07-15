import React, { useEffect, useState, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, Pressable, TextInput, Clipboard
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
    ArrowLeft, CloudOff, RefreshCw, CheckCircle, XCircle, 
    Download, ChevronDown, ChevronUp, Cpu, Clock, 
    Settings, HelpCircle, Activity, ChevronRight, Sliders, Sparkles, Play, Copy, Save, Zap
} from 'lucide-react-native';
import usePatientStore from '../../store/usePatientStore';
import OfflineSyncService from '../../lib/OfflineSyncService';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Device from 'expo-device';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMotion } from '../../theme/MotionProvider';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence, withDelay } from 'react-native-reanimated';

// Default Config targets for comparing presets
const DEFAULT_CONFIG = {
    animationSpeed: 1.0,
    speed: 6.5,
    bounce: 6.0,
    smoothness: 5.0,
};

const PRESETS = {
    caremymed: { name: 'CareMyMed Default', speed: 6.5, bounce: 6.0, smoothness: 5.0 },
    apple: { name: 'Apple iOS', speed: 5.5, bounce: 4.5, smoothness: 7.0 },
    linear: { name: 'Linear App', speed: 8.0, bounce: 5.0, smoothness: 4.0 },
    calm: { name: 'Calm Health', speed: 3.0, bounce: 2.0, smoothness: 8.0 },
    playful: { name: 'Playful UI', speed: 7.0, bounce: 9.0, smoothness: 3.0 },
};

// ── Visual Compare Component: Card Lift ──────────────────────────────────────────
const CompareCard = ({ trigger, springConfig, title }) => {
    const scale = useSharedValue(1);
    const translateY = useSharedValue(0);

    useEffect(() => {
        if (trigger > 0) {
            scale.value = withSpring(1.06, springConfig, (finished) => {
                if (finished) scale.value = withSpring(1, springConfig);
            });
            translateY.value = withSpring(-12, springConfig, (finished) => {
                if (finished) translateY.value = withSpring(0, springConfig);
            });
        }
    }, [trigger]);

    const animStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: scale.value },
            { translateY: translateY.value }
        ]
    }));

    return (
        <Reanimated.View style={[styles.previewCellCard, animStyle]}>
            <Text style={styles.previewCellTitle}>{title}</Text>
            <View style={styles.previewCardVisual} />
        </Reanimated.View>
    );
};

// ── Visual Compare Component: Button Press ──────────────────────────────────────────
const CompareButton = ({ trigger, springConfig, title }) => {
    const scale = useSharedValue(1);

    useEffect(() => {
        if (trigger > 0) {
            scale.value = withSpring(0.92, springConfig, (finished) => {
                if (finished) scale.value = withSpring(1, springConfig);
            });
        }
    }, [trigger]);

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }]
    }));

    return (
        <Reanimated.View style={[styles.previewCellButton, animStyle]}>
            <Text style={styles.previewCellTitleBtn}>{title}</Text>
        </Reanimated.View>
    );
};

// ── Visual Compare Component: Typing Dots ──────────────────────────────────────────
const CompareTyping = ({ trigger, springConfig, title }) => {
    const dot1 = useSharedValue(0.8);
    const dot2 = useSharedValue(0.8);
    const dot3 = useSharedValue(0.8);

    useEffect(() => {
        if (trigger > 0) {
            dot1.value = withSequence(
                withTiming(1.3, { duration: 180 }),
                withSpring(0.8, springConfig)
            );
            dot2.value = withSequence(
                withDelay(80, withTiming(1.3, { duration: 180 })),
                withSpring(0.8, springConfig)
            );
            dot3.value = withSequence(
                withDelay(160, withTiming(1.3, { duration: 180 })),
                withSpring(0.8, springConfig)
            );
        }
    }, [trigger]);

    const style1 = useAnimatedStyle(() => ({ transform: [{ scale: dot1.value }] }));
    const style2 = useAnimatedStyle(() => ({ transform: [{ scale: dot2.value }] }));
    const style3 = useAnimatedStyle(() => ({ transform: [{ scale: dot3.value }] }));

    return (
        <View style={styles.previewCellTyping}>
            <Text style={styles.previewCellTitleTyping}>{title}</Text>
            <View style={styles.previewTypingRow}>
                <Reanimated.View style={[styles.previewDot, style1]} />
                <Reanimated.View style={[styles.previewDot, style2]} />
                <Reanimated.View style={[styles.previewDot, style3]} />
            </View>
        </View>
    );
};

export default function DeveloperObservabilityScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    
    // Global Motion Engine Context Hooks
    const { 
        motionOverrides, candidateOverrides, isPreviewing, 
        updateCandidateOverrides, applyCandidateOverrides, saveOverrides, resetOverrides,
        getSpringForConfig
    } = useMotion();

    const { 
        syncState, pendingSyncCount, simulateOffline, 
        setSimulateOffline, lastSyncTimestamp,
        networkSimulationMode, setNetworkSimulationMode 
    } = usePatientStore();
    
    const [replayHistory, setReplayHistory] = useState([]);
    const [showOemGuide, setShowOemGuide] = useState(false);
    
    // Live sandbox states
    const [previewType, setPreviewType] = useState('card'); // 'card', 'button', 'typing'
    const [triggerCount, setTriggerCount] = useState(0);
    const [jsonImportText, setJsonImportText] = useState('');
    const [activePreset, setActivePreset] = useState('caremymed');
    
    // Live JS FPS Tracker
    const [jsFps, setJsFps] = useState(60);

    useEffect(() => {
        fetchDeveloperData();

        // Calculate JS Thread frame rate scheduling lag
        let lastTime = Date.now();
        let frames = 0;
        let animationId;
        const calcFps = () => {
            frames++;
            const now = Date.now();
            if (now - lastTime >= 1000) {
                setJsFps(Math.min(60, Math.round((frames * 1000) / (now - lastTime))));
                frames = 0;
                lastTime = now;
            }
            animationId = requestAnimationFrame(calcFps);
        };
        animationId = requestAnimationFrame(calcFps);

        return () => {
            cancelAnimationFrame(animationId);
        };
    }, []);

    const fetchDeveloperData = async () => {
        try {
            const replayStr = await AsyncStorage.getItem('offline_replay_history');
            setReplayHistory(replayStr ? JSON.parse(replayStr) : []);
        } catch (e) {}
    };

    const handleForceSync = () => {
        setNetworkSimulationMode('online');
        setSimulateOffline(false);
        OfflineSyncService.flushQueue();
    };

    const handleOpenBatterySettings = async () => {
        if (Platform.OS === 'android') {
            try {
                await IntentLauncher.startActivityAsync('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
            } catch (e) {
                try {
                    await IntentLauncher.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', {
                        data: `package:${Constants.expoConfig?.android?.package || 'com.caremymed.users'}`
                    });
                } catch (err) {
                    Alert.alert("Error", "Could not open settings panel.");
                }
            }
        } else {
            Alert.alert("Information", "Background permissions on iOS are configured via system App settings.");
        }
    };

    const handleExportDiagnostics = async () => {
        try {
            const diagnostics = {
                timestamp: new Date().toISOString(),
                networkSimulationMode,
                device: {
                    os: Platform.OS,
                    version: Platform.Version,
                    model: Constants.deviceName,
                    app_version: Constants.expoConfig?.version,
                    manufacturer: Device.manufacturer,
                    brand: Device.brand,
                },
                state: {
                    syncState,
                    pendingSyncCount,
                    simulateOffline,
                    lastSyncTimestamp,
                },
                replayHistory
            };

            const fileUri = `${FileSystem.documentDirectory}dev_observability_${Date.now()}.json`;
            await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(diagnostics, null, 2));

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri);
            } else {
                Alert.alert("Export Error", "Sharing is not available on this device.");
            }
        } catch (err) {
            Alert.alert("Export Error", "Failed to export diagnostics.");
            console.error(err);
        }
    };

    const handleClearHistoryLogs = async () => {
        try {
            await AsyncStorage.removeItem('offline_replay_history');
            await AsyncStorage.removeItem('app_lifecycle_history');
            setReplayHistory([]);
            Alert.alert("Success", "Diagnostic history logs cleared.");
        } catch (e) {
            Alert.alert("Error", "Failed to clear logs.");
        }
    };

    const selectSimulationMode = (mode) => {
        setNetworkSimulationMode(mode);
        if (mode === 'offline') {
            setSimulateOffline(true);
            usePatientStore.getState().setSyncState('offline');
        } else {
            setSimulateOffline(false);
            if (mode === 'online') {
                OfflineSyncService.flushQueue();
            }
        }
    };

    const selectPreset = (key) => {
        setActivePreset(key);
        const config = PRESETS[key];
        if (config) {
            updateCandidateOverrides({
                speed: config.speed,
                bounce: config.bounce,
                smoothness: config.smoothness,
            });
            applyCandidateOverrides();
        }
    };

    const adjustParam = (field, delta) => {
        const current = candidateOverrides[field] || DEFAULT_CONFIG[field];
        let next = parseFloat((current + delta).toFixed(1));
        // Clamp boundaries: Speed, Bounce, Smoothness clamp between 1.0 and 10.0
        if (field === 'animationSpeed') {
            next = Math.max(0.1, Math.min(3.0, next));
        } else {
            next = Math.max(1.0, Math.min(10.0, next));
        }
        updateCandidateOverrides({ [field]: next });
        applyCandidateOverrides();
        setActivePreset('custom');
    };

    const handleImportJson = () => {
        try {
            const parsed = JSON.parse(jsonImportText);
            const speed = parsed.speed || DEFAULT_CONFIG.speed;
            const bounce = parsed.bounce || DEFAULT_CONFIG.bounce;
            const smoothness = parsed.smoothness || DEFAULT_CONFIG.smoothness;
            const multiplier = parsed.animationSpeed || DEFAULT_CONFIG.animationSpeed;

            updateCandidateOverrides({
                speed: Math.max(1.0, Math.min(10.0, speed)),
                bounce: Math.max(1.0, Math.min(10.0, bounce)),
                smoothness: Math.max(1.0, Math.min(10.0, smoothness)),
                animationSpeed: Math.max(0.1, Math.min(3.0, multiplier)),
            });
            applyCandidateOverrides();
            setActivePreset('custom');
            setJsonImportText('');
            Alert.alert("Import Success", "Motion configuration applied to preview!");
        } catch (e) {
            Alert.alert("Import Error", "Invalid configuration JSON. Please check syntax.");
        }
    };

    const handleCopyConfig = () => {
        const payload = JSON.stringify(candidateOverrides, null, 2);
        Clipboard.setString(payload);
        Alert.alert("Copied", "Motion configuration JSON copied to clipboard.");
    };

    const getOemInstructions = (mfg) => {
        const brand = (mfg || '').toLowerCase();
        if (brand.includes('samsung')) {
            return {
                title: 'Samsung Background Guide',
                steps: [
                    'Open System Settings -> Apps -> CareMyMed -> Battery.',
                    'Select "Unrestricted" settings.',
                    'Go to Settings -> Battery -> Background usage limits.',
                    'Add CareMyMed to "Never sleeping apps" whitelist.'
                ]
            };
        }
        if (brand.includes('xiaomi') || brand.includes('redmi') || brand.includes('mi')) {
            return {
                title: 'Xiaomi / Redmi Background Guide',
                steps: [
                    'Open Settings -> Apps -> Manage Apps -> CareMyMed.',
                    'Enable the "Autostart" toggle.',
                    'Tap "Battery Saver" and choose "No Restrictions".',
                    'Lock CareMyMed in the active App Switcher window.'
                ]
            };
        }
        if (brand.includes('oneplus')) {
            return {
                title: 'OnePlus Optimization Whitelist',
                steps: [
                    'Open settings -> Battery -> Battery Optimization.',
                    'Select CareMyMed and set to "Don\'t optimize".',
                    'Go to Settings -> Apps -> Auto-Launch, allow CareMyMed.'
                ]
            };
        }
        return {
            title: 'Android Battery Whitelist Settings',
            steps: [
                'Settings -> Apps -> Special access -> Battery optimization.',
                'Find CareMyMed and select "Don\'t Optimize" or "Unrestricted".'
            ]
        };
    };

    const manufacturer = Device.manufacturer || 'Generic';
    const oemInstructions = getOemInstructions(manufacturer);

    // Dynamic checks to highlight modified items
    const isModified = (field) => {
        return candidateOverrides[field] !== DEFAULT_CONFIG[field];
    };

    // Calculate spring physics configurations dynamically for rendering previews
    const defaultSpring = getSpringForConfig('default', DEFAULT_CONFIG);
    const savedSpring = getSpringForConfig('default', motionOverrides);
    const candidateSpring = getSpringForConfig('default', candidateOverrides);

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft size={24} color="#0F172A" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Motion Studio & Diagnostics</Text>
                <TouchableOpacity onPress={handleExportDiagnostics} style={styles.exportButton}>
                    <Download size={20} color="#2563EB" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                
                {/* ─── FEATURE SECTION: MOTION STUDIO ───────────────────────── */}
                <View style={[styles.card, { borderColor: '#8B5CF6', borderWidth: 1.5 }]}>
                    <View style={styles.cardHeaderJustified}>
                        <View style={styles.cardHeader}>
                            <Sparkles size={22} color="#8B5CF6" />
                            <Text style={[styles.cardTitle, { color: '#7C3AED' }]}>Motion Studio Sandbox</Text>
                        </View>
                        {isPreviewing && (
                            <View style={styles.previewTag}>
                                <Text style={styles.previewTagText}>Testing Mode</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.sectionDesc}>
                        Calibrate dynamic physics, switch preset packages, trigger slow-motion captures, and preview visual assets side-by-side.
                    </Text>

                    {/* 1. Presets */}
                    <Text style={styles.subsectionTitle}>Choose Animation Preset</Text>
                    <View style={styles.presetRow}>
                        {Object.keys(PRESETS).map((key) => (
                            <TouchableOpacity
                                key={key}
                                style={[
                                    styles.presetBtn,
                                    activePreset === key && styles.presetBtnActive
                                ]}
                                onPress={() => selectPreset(key)}
                            >
                                <Text style={[
                                    styles.presetBtnText,
                                    activePreset === key && styles.presetBtnTextActive
                                ]}>
                                    {PRESETS[key].name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={styles.divider} />

                    {/* 2. Calibration Sliders / Steppers */}
                    <Text style={styles.subsectionTitle}>Calibrate Parameters</Text>
                    
                    {/* Speed Slider */}
                    <View style={styles.controlRow}>
                        <View style={styles.controlLabelCol}>
                            <Text style={styles.controlLabel}>Speed</Text>
                            {isModified('speed') && <Text style={styles.modifiedIndicator}>• Modified</Text>}
                        </View>
                        <View style={styles.stepperContainer}>
                            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustParam('speed', -0.5)}>
                                <Text style={styles.stepBtnText}>-</Text>
                            </TouchableOpacity>
                            <Text style={styles.stepperVal}>{candidateOverrides.speed.toFixed(1)}</Text>
                            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustParam('speed', 0.5)}>
                                <Text style={styles.stepBtnText}>+</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Bounce Slider */}
                    <View style={styles.controlRow}>
                        <View style={styles.controlLabelCol}>
                            <Text style={styles.controlLabel}>Bounce</Text>
                            {isModified('bounce') && <Text style={styles.modifiedIndicator}>• Modified</Text>}
                        </View>
                        <View style={styles.stepperContainer}>
                            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustParam('bounce', -0.5)}>
                                <Text style={styles.stepBtnText}>-</Text>
                            </TouchableOpacity>
                            <Text style={styles.stepperVal}>{candidateOverrides.bounce.toFixed(1)}</Text>
                            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustParam('bounce', 0.5)}>
                                <Text style={styles.stepBtnText}>+</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Smoothness Slider */}
                    <View style={styles.controlRow}>
                        <View style={styles.controlLabelCol}>
                            <Text style={styles.controlLabel}>Smoothness</Text>
                            {isModified('smoothness') && <Text style={styles.modifiedIndicator}>• Modified</Text>}
                        </View>
                        <View style={styles.stepperContainer}>
                            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustParam('smoothness', -0.5)}>
                                <Text style={styles.stepBtnText}>-</Text>
                            </TouchableOpacity>
                            <Text style={styles.stepperVal}>{candidateOverrides.smoothness.toFixed(1)}</Text>
                            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustParam('smoothness', 0.5)}>
                                <Text style={styles.stepBtnText}>+</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Global Multiplier Selector */}
                    <View style={styles.controlRow}>
                        <View style={styles.controlLabelCol}>
                            <Text style={styles.controlLabel}>Global Multiplier</Text>
                            {isModified('animationSpeed') && <Text style={styles.modifiedIndicator}>• Modified</Text>}
                        </View>
                        <View style={styles.multiplierGrid}>
                            {[0.25, 0.5, 1.0, 2.0].map((rate) => (
                                <TouchableOpacity
                                    key={rate}
                                    style={[
                                        styles.rateBtn,
                                        candidateOverrides.animationSpeed === rate && styles.rateBtnActive
                                    ]}
                                    onPress={() => {
                                        updateCandidateOverrides({ animationSpeed: rate });
                                        applyCandidateOverrides();
                                        setActivePreset('custom');
                                    }}
                                >
                                    <Text style={[
                                        styles.rateBtnText,
                                        candidateOverrides.animationSpeed === rate && styles.rateBtnTextActive
                                    ]}>
                                        {rate}x
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Slow Motion Inspector Button */}
                    <Pressable
                        style={({ pressed }) => [
                            styles.slowMoHoldBtn,
                            pressed && styles.slowMoHoldBtnActive
                        ]}
                        onPressIn={() => {
                            updateCandidateOverrides({ animationSpeed: 0.15 });
                            applyCandidateOverrides();
                        }}
                        onPressOut={() => {
                            updateCandidateOverrides({ animationSpeed: 1.0 });
                            applyCandidateOverrides();
                        }}
                    >
                        <Zap size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.slowMoHoldText}>Hold to Slow-mo Inspect (0.15x)</Text>
                    </Pressable>

                    <View style={styles.divider} />

                    {/* 3. Live 3-Way Comparative sandbox */}
                    <View style={styles.cardHeaderJustified}>
                        <Text style={styles.subsectionTitle}>Live Visual Comparison</Text>
                        <View style={styles.selectorRow}>
                            {['card', 'button', 'typing'].map((type) => (
                                <TouchableOpacity
                                    key={type}
                                    style={[
                                        styles.selectorBadge,
                                        previewType === type && styles.selectorBadgeActive
                                    ]}
                                    onPress={() => setPreviewType(type)}
                                >
                                    <Text style={[
                                        styles.selectorBadgeText,
                                        previewType === type && styles.selectorBadgeTextActive
                                    ]}>
                                        {type.toUpperCase()}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.compareGrid}>
                        {previewType === 'card' && (
                            <>
                                <CompareCard title="System Default" springConfig={defaultSpring} trigger={triggerCount} />
                                <CompareCard title="Saved Config" springConfig={savedSpring} trigger={triggerCount} />
                                <CompareCard title="Candidate Preview" springConfig={candidateSpring} trigger={triggerCount} />
                            </>
                        )}
                        {previewType === 'button' && (
                            <>
                                <CompareButton title="Default" springConfig={defaultSpring} trigger={triggerCount} />
                                <CompareButton title="Saved" springConfig={savedSpring} trigger={triggerCount} />
                                <CompareButton title="Candidate" springConfig={candidateSpring} trigger={triggerCount} />
                            </>
                        )}
                        {previewType === 'typing' && (
                            <>
                                <CompareTyping title="Default" springConfig={defaultSpring} trigger={triggerCount} />
                                <CompareTyping title="Saved" springConfig={savedSpring} trigger={triggerCount} />
                                <CompareTyping title="Candidate" springConfig={candidateSpring} trigger={triggerCount} />
                            </>
                        )}
                    </View>

                    <TouchableOpacity style={styles.playButton} onPress={() => setTriggerCount(prev => prev + 1)}>
                        <Play size={16} color="#FFFFFF" fill="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.playButtonText}>Trigger Preview Animations</Text>
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    {/* 4. Action Panel */}
                    <View style={styles.actionGrid}>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#10B981' }]} onPress={saveOverrides}>
                            <Save size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                            <Text style={styles.actionBtnText}>Save to Device</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#4F46E5' }]} onPress={applyCandidateOverrides}>
                            <Play size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                            <Text style={styles.actionBtnText}>Apply Preview</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={[styles.actionGrid, { marginTop: 8 }]}>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#64748B' }]} onPress={() => resetOverrides('spring')}>
                            <Text style={styles.actionBtnText}>Reset Springs</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#64748B' }]} onPress={() => resetOverrides('speed')}>
                            <Text style={styles.actionBtnText}>Reset Speeds</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#DC2626' }]} onPress={() => resetOverrides('all')}>
                            <Text style={styles.actionBtnText}>Reset Everything</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.divider} />

                    {/* 5. Performance Monitor HUD */}
                    <Text style={styles.subsectionTitle}>Live Performance HUD</Text>
                    <View style={styles.perfRow}>
                        <View style={styles.perfItem}>
                            <Text style={styles.perfLabel}>JS Scheduling FPS</Text>
                            <Text style={[styles.perfValue, jsFps < 50 ? { color: '#DC2626' } : { color: '#16A34A' }]}>{jsFps} FPS</Text>
                        </View>
                        <View style={styles.perfItem}>
                            <Text style={styles.perfLabel}>JS Thread State</Text>
                            <Text style={[styles.perfValue, { color: '#16A34A' }]}>IDLE</Text>
                        </View>
                        <View style={styles.perfItem}>
                            <Text style={styles.perfLabel}>Skia Rasterizer</Text>
                            <Text style={[styles.perfValue, { color: '#16A34A' }]}>60 FPS</Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    {/* 6. Export/Import */}
                    <Text style={styles.subsectionTitle}>Export / Import Config JSON</Text>
                    <View style={styles.jsonWrapper}>
                        <TextInput
                            style={styles.jsonInput}
                            placeholder='Paste Motion JSON e.g. {"speed": 8, "bounce": 4, "smoothness": 5}'
                            placeholderTextColor="#94A3B8"
                            value={jsonImportText}
                            onChangeText={setJsonImportText}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <View style={styles.jsonActions}>
                            <TouchableOpacity style={styles.jsonBtn} onPress={handleImportJson}>
                                <Text style={styles.jsonBtnText}>Import</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.jsonBtn} onPress={handleCopyConfig}>
                                <Copy size={12} color="#475569" style={{ marginRight: 4 }} />
                                <Text style={styles.jsonBtnText}>Copy JSON</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* ─── Patient Diagnostics Navigation Card ───────────────── */}
                <TouchableOpacity 
                    style={[styles.card, styles.navCard]} 
                    onPress={() => navigation.navigate('PatientDiagnostics')}
                >
                    <View style={styles.navCardHeader}>
                        <Activity size={24} color="#2563EB" />
                        <View style={styles.navCardTitleContainer}>
                            <Text style={styles.navCardTitle}>Patient Diagnostics</Text>
                            <Text style={styles.navCardDesc}>Device token health, queue state, sync status, clock drift, session validity</Text>
                        </View>
                        <ChevronRight size={20} color="#64748B" />
                    </View>
                </TouchableOpacity>

                {/* ─── Network Simulation Chaos Settings ───────────────── */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <HelpCircle size={20} color="#E28743" />
                        <Text style={styles.cardTitle}>Network Simulation Chaos</Text>
                    </View>
                    <Text style={styles.sectionDesc}>
                        Inject simulated network latency and drops to verify offline queues, double-taps, and recovery behavior.
                    </Text>

                    <View style={styles.btnGrid}>
                        {['online', 'offline', 'flaky', 'slow'].map((mode) => (
                            <TouchableOpacity
                                key={mode}
                                style={[
                                    styles.modeBtn,
                                    networkSimulationMode === mode && styles.modeBtnActive,
                                    networkSimulationMode === mode && mode === 'offline' && { backgroundColor: '#DC2626' },
                                    networkSimulationMode === mode && mode === 'flaky' && { backgroundColor: '#D97706' },
                                ]}
                                onPress={() => selectSimulationMode(mode)}
                            >
                                <Text style={[
                                    styles.modeBtnText,
                                    networkSimulationMode === mode && styles.modeBtnTextActive
                                ]}>
                                    {mode.toUpperCase()}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    
                    <View style={styles.divider} />
                    
                    <StatRow label="Effective Simulation" value={networkSimulationMode.toUpperCase()} status={networkSimulationMode === 'online' ? 'good' : 'bad'} />
                </View>

                {/* ─── Offline Sync Status ──────────────────────────────── */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <RefreshCw size={20} color="#2563EB" />
                        <Text style={styles.cardTitle}>Offline Sync Queue</Text>
                    </View>
                    <StatRow label="Queue Length" value={pendingSyncCount} status={pendingSyncCount > 0 ? 'bad' : 'good'} />
                    <StatRow label="Sync State" value={syncState.toUpperCase()} status={syncState === 'synced' ? 'good' : (syncState === 'failed' ? 'bad' : 'neutral')} />
                    <StatRow label="Last Successful Sync" value={lastSyncTimestamp ? new Date(lastSyncTimestamp).toLocaleTimeString() : 'Never'} />
                    
                    <TouchableOpacity style={styles.primaryButton} onPress={handleForceSync}>
                        <Text style={styles.primaryButtonText}>Force Sync / Clear Offline Mode</Text>
                    </TouchableOpacity>
                </View>

                {/* ─── OEM Background Optimization Helper ───────────────── */}
                <View style={styles.card}>
                    <TouchableOpacity 
                        style={styles.cardHeaderToggle} 
                        onPress={() => setShowOemGuide(!showOemGuide)}
                    >
                        <View style={styles.cardHeader}>
                            <Cpu size={20} color="#8B5CF6" />
                            <Text style={styles.cardTitle}>{oemInstructions.title}</Text>
                        </View>
                        {showOemGuide ? <ChevronUp size={20} color="#64748B" /> : <ChevronDown size={20} color="#64748B" />}
                    </TouchableOpacity>

                    <Text style={styles.sectionDesc}>
                        Detected Brand: <Text style={{fontWeight: '700', color: '#0F172A'}}>{manufacturer}</Text>
                    </Text>

                    {showOemGuide && (
                        <View style={styles.oemGuideBox}>
                            {oemInstructions.steps.map((step, idx) => (
                                <View key={idx} style={styles.stepRow}>
                                    <Text style={styles.stepNum}>{idx + 1}</Text>
                                    <Text style={styles.stepText}>{step}</Text>
                                </View>
                            ))}
                            {Platform.OS === 'android' && (
                                <TouchableOpacity 
                                    style={styles.settingsLauncherBtn}
                                    onPress={handleOpenBatterySettings}
                                >
                                    <Settings size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                                    <Text style={styles.settingsLauncherBtnText}>Open Battery Settings</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </View>

                {/* ─── Replay Timeline History ──────────────────────────── */}
                <View style={styles.card}>
                    <View style={styles.cardHeaderJustified}>
                        <View style={styles.cardHeader}>
                            <Clock size={20} color="#06B6D4" />
                            <Text style={styles.cardTitle}>Replay Timeline History</Text>
                        </View>
                        <TouchableOpacity onPress={handleClearHistoryLogs}>
                            <Text style={styles.clearBtnText}>Clear</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={sectionDescStyle(replayHistory)}>
                        Chronological record of processed offline mutations.
                    </Text>

                    {replayHistory.length === 0 ? (
                        <Text style={styles.emptyHistoryText}>No replay events logged yet.</Text>
                    ) : (
                        <View style={styles.timelineList}>
                            {replayHistory.map((item, idx) => (
                                <View key={idx} style={styles.timelineItem}>
                                    <View style={styles.timelineDotLine}>
                                        <View style={[
                                            styles.timelineDot,
                                            item.status === 'success' ? styles.dotSuccess : styles.dotFailure
                                        ]} />
                                        {idx < replayHistory.length - 1 && <View style={styles.timelineLine} />}
                                    </View>
                                    <View style={styles.timelineContent}>
                                        <View style={styles.timelineHeaderRow}>
                                            <Text style={styles.timelineAction}>{item.action}</Text>
                                            <Text style={styles.timelineTime}>{item.local_time}</Text>
                                        </View>
                                        <Text style={styles.timelineStatus}>
                                            Status: <Text style={{fontWeight: '700', color: item.status === 'success' ? '#16A34A' : '#DC2626'}}>{item.status.toUpperCase()}</Text>
                                        </Text>
                                        {item.error && (
                                            <Text style={styles.timelineError}>{item.error}</Text>
                                        )}
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

            </ScrollView>
        </View>
    );
}

const StatRow = ({ label, value, status = 'neutral' }) => (
    <View style={styles.statRow}>
        <Text style={styles.statLabel}>{label}</Text>
        <View style={styles.statValueContainer}>
            {status === 'good' && <CheckCircle size={14} color="#16A34A" style={styles.statIcon} />}
            {status === 'bad' && <XCircle size={14} color="#DC2626" style={styles.statIcon} />}
            <Text style={[styles.statValue, status === 'good' && {color: '#16A34A'}, status === 'bad' && {color: '#DC2626'}]}>
                {value}
            </Text>
        </View>
    </View>
);

const sectionDescStyle = (history) => ({
    fontSize: 13, 
    color: '#64748B', 
    marginBottom: history.length === 0 ? 0 : 16, 
    lineHeight: 18 
});

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF',
        borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    },
    backButton: { padding: 8, marginLeft: -8 },
    exportButton: { padding: 8, marginRight: -8, backgroundColor: '#EFF6FF', borderRadius: 8 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
    scrollContent: { padding: 16, paddingBottom: 40 },
    
    card: {
        backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
        marginBottom: 16,
        shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
    },
    navCard: {
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        backgroundColor: '#F8FAFC',
        paddingVertical: 20
    },
    navCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    navCardTitleContainer: {
        flex: 1,
        marginLeft: 12,
        marginRight: 8
    },
    navCardTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1E293B'
    },
    navCardDesc: {
        fontSize: 12,
        color: '#64748B',
        marginTop: 4,
        lineHeight: 16
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center' },
    cardHeaderJustified: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    cardHeaderToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    cardTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginLeft: 8 },
    sectionDesc: { fontSize: 13, color: '#64748B', marginBottom: 16, lineHeight: 18 },
    
    statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    statLabel: { fontSize: 14, color: '#64748B', fontWeight: '500' },
    statValueContainer: { flexDirection: 'row', alignItems: 'center' },
    statIcon: { marginRight: 6 },
    statValue: { fontSize: 14, color: '#0F172A', fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    
    divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },
    
    btnGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    modeBtn: {
        flex: 1, minWidth: '45%', backgroundColor: '#F1F5F9', borderRadius: 8,
        paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0'
    },
    modeBtnActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    modeBtnText: { fontSize: 12, fontWeight: '700', color: '#475569' },
    modeBtnTextActive: { color: '#FFFFFF' },

    oemGuideBox: { marginTop: 12, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 8 },
    stepRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-start' },
    stepNum: { 
        fontSize: 11, fontWeight: '700', color: '#FFFFFF', backgroundColor: '#8B5CF6',
        borderRadius: 8, width: 16, height: 16, textAlign: 'center', marginRight: 8, marginTop: 2
    },
    stepText: { flex: 1, fontSize: 12, color: '#475569', lineHeight: 16 },
    settingsLauncherBtn: {
        flexDirection: 'row', backgroundColor: '#8B5CF6', borderRadius: 8,
        paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', marginTop: 12
    },
    settingsLauncherBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },

    clearBtnText: { fontSize: 13, fontWeight: '600', color: '#EF4444' },
    emptyHistoryText: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', textAlign: 'center', marginVertical: 12 },

    timelineList: { marginTop: 8 },
    timelineItem: { flexDirection: 'row', marginBottom: 12 },
    timelineDotLine: { alignItems: 'center', marginRight: 12 },
    timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
    dotSuccess: { backgroundColor: '#16A34A' },
    dotFailure: { backgroundColor: '#EF4444' },
    timelineLine: { width: 2, flex: 1, backgroundColor: '#E2E8F0', marginTop: 4 },
    timelineContent: { flex: 1 },
    timelineHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    timelineAction: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
    timelineTime: { fontSize: 11, color: '#94A3B8' },
    timelineStatus: { fontSize: 12, color: '#64748B' },
    timelineError: { fontSize: 11, color: '#EF4444', fontStyle: 'italic', marginTop: 2 },
    
    primaryButton: {
        backgroundColor: '#2563EB', borderRadius: 12, padding: 12,
        alignItems: 'center', marginTop: 12,
    },
    primaryButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },

    // ── Motion Studio Custom styles ──
    previewTag: {
        backgroundColor: '#F3E8FF',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    previewTagText: {
        fontSize: 10,
        color: '#7C3AED',
        fontWeight: '700',
    },
    subsectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 10,
    },
    presetRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 4,
    },
    presetBtn: {
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    presetBtnActive: {
        backgroundColor: '#8B5CF6',
        borderColor: '#8B5CF6',
    },
    presetBtnText: {
        fontSize: 11,
        color: '#475569',
        fontWeight: '600',
    },
    presetBtnTextActive: {
        color: '#FFFFFF',
    },
    controlRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    controlLabelCol: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    controlLabel: {
        fontSize: 13,
        color: '#475569',
        fontWeight: '600',
    },
    modifiedIndicator: {
        fontSize: 9,
        color: '#D97706',
        fontWeight: '800',
        marginLeft: 6,
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
    },
    stepperContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
    },
    stepBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#E2E8F0',
    },
    stepBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#475569',
    },
    stepperVal: {
        width: 38,
        textAlign: 'center',
        fontSize: 13,
        fontWeight: '700',
        color: '#1E293B',
    },
    multiplierGrid: {
        flexDirection: 'row',
        gap: 4,
    },
    rateBtn: {
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 6,
        width: 44,
        paddingVertical: 6,
        alignItems: 'center',
    },
    rateBtnActive: {
        backgroundColor: '#8B5CF6',
        borderColor: '#8B5CF6',
    },
    rateBtnText: {
        fontSize: 11,
        color: '#475569',
        fontWeight: '600',
    },
    rateBtnTextActive: {
        color: '#FFFFFF',
    },
    slowMoHoldBtn: {
        flexDirection: 'row',
        backgroundColor: '#374151',
        borderRadius: 8,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
    },
    slowMoHoldBtnActive: {
        backgroundColor: '#D97706',
    },
    slowMoHoldText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    selectorRow: {
        flexDirection: 'row',
        gap: 4,
    },
    selectorBadge: {
        backgroundColor: '#F1F5F9',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    selectorBadgeActive: {
        backgroundColor: '#1E293B',
    },
    selectorBadgeText: {
        fontSize: 9,
        fontWeight: '700',
        color: '#64748B',
    },
    selectorBadgeTextActive: {
        color: '#FFFFFF',
    },
    compareGrid: {
        flexDirection: 'row',
        gap: 8,
        justifyContent: 'space-between',
        marginVertical: 12,
    },
    previewCellCard: {
        flex: 1,
        height: 100,
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 8,
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    previewCardVisual: {
        width: '100%',
        height: 44,
        backgroundColor: '#E2E8F0',
        borderRadius: 8,
    },
    previewCellButton: {
        flex: 1,
        height: 70,
        backgroundColor: '#8B5CF6',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 2,
    },
    previewCellTitle: {
        fontSize: 10,
        fontWeight: '700',
        color: '#64748B',
        textAlign: 'center',
    },
    previewCellTitleBtn: {
        fontSize: 11,
        fontWeight: '800',
        color: '#FFFFFF',
        textAlign: 'center',
    },
    previewCellTyping: {
        flex: 1,
        height: 70,
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 8,
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    previewCellTitleTyping: {
        fontSize: 9,
        fontWeight: '700',
        color: '#64748B',
    },
    previewTypingRow: {
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
    },
    previewDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#8B5CF6',
    },
    playButton: {
        flexDirection: 'row',
        backgroundColor: '#1E293B',
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 4,
    },
    playButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    actionGrid: {
        flexDirection: 'row',
        gap: 8,
    },
    actionBtn: {
        flex: 1,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
    actionBtnText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    perfRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 12,
    },
    perfItem: {
        alignItems: 'center',
        flex: 1,
    },
    perfLabel: {
        fontSize: 10,
        color: '#64748B',
        fontWeight: '600',
        marginBottom: 4,
    },
    perfValue: {
        fontSize: 14,
        fontWeight: '800',
    },
    jsonWrapper: {
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 10,
    },
    jsonInput: {
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        color: '#0F172A',
        backgroundColor: '#FFFFFF',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 8,
        minHeight: 40,
        textAlignVertical: 'top',
        marginBottom: 8,
    },
    jsonActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
    },
    jsonBtn: {
        backgroundColor: '#E2E8F0',
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        flexDirection: 'row',
        alignItems: 'center',
    },
    jsonBtnText: {
        fontSize: 10,
        color: '#475569',
        fontWeight: '700',
    },
});
