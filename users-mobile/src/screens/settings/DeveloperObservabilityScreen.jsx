import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
    ArrowLeft, CloudOff, RefreshCw, CheckCircle, XCircle, 
    Download, ChevronDown, ChevronUp, Cpu, Clock, 
    Settings, HelpCircle, Activity, ChevronRight
} from 'lucide-react-native';
import usePatientStore from '../../store/usePatientStore';
import OfflineSyncService from '../../lib/OfflineSyncService';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Device from 'expo-device';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DeveloperObservabilityScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const { 
        syncState, pendingSyncCount, simulateOffline, 
        setSimulateOffline, lastSyncTimestamp,
        networkSimulationMode, setNetworkSimulationMode 
    } = usePatientStore();
    
    const [replayHistory, setReplayHistory] = useState([]);
    const [showOemGuide, setShowOemGuide] = useState(false);

    useEffect(() => {
        fetchDeveloperData();
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

    const manufacturer = Device.manufacturer || 'Generic';
    const oemInstructions = getOemInstructions(manufacturer);

    function getOemInstructions(mfg) {
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
        if (brand.includes('oppo') || brand.includes('realme')) {
            return {
                title: 'OPPO / Realme Custom Power Saver',
                steps: [
                    'Go to Settings -> App Management -> CareMyMed.',
                    'Tap "Power Saver" and choose "Allow Background Running".',
                    'Allow High Background Power Consumption.'
                ]
            };
        }
        if (brand.includes('vivo')) {
            return {
                title: 'VIVO High Power Consumption Guide',
                steps: [
                    'Open Settings -> Battery -> High background power consumption.',
                    'Find CareMyMed and allow high background power run.',
                    'Enable Autostart permissions.'
                ]
            };
        }
        if (brand.includes('huawei')) {
            return {
                title: 'Huawei Manual App Launch',
                steps: [
                    'Go to Settings -> Battery -> App launch.',
                    'Turn OFF "Manage automatically" for CareMyMed.',
                    'Enable: "Auto-launch", "Secondary launch", and "Run in background".'
                ]
            };
        }
        if (brand.includes('motorola') || brand.includes('moto')) {
            return {
                title: 'Motorola Battery Settings',
                steps: [
                    'Settings -> Apps -> Special app access -> Battery optimization.',
                    'Select CareMyMed and set to "Don\'t optimize".'
                ]
            };
        }
        if (Platform.OS === 'ios') {
            return {
                title: 'iOS Background Refresh',
                steps: [
                    'Settings -> General -> Background App Refresh.',
                    'Ensure it is enabled for WiFi & Mobile Data.',
                    'Confirm CareMyMed is toggled ON.'
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
    }

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

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft size={24} color="#0F172A" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Developer Observability</Text>
                <TouchableOpacity onPress={handleExportDiagnostics} style={styles.exportButton}>
                    <Download size={20} color="#2563EB" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                
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

// Clean helper style function
const sectionDescStyle = (history) => {
    return {
        fontSize: 13, 
        color: '#64748B', 
        marginBottom: history.length === 0 ? 0 : 16, 
        lineHeight: 18 
    };
};

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
    primaryButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 }
});
