import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Activity, CloudOff, RefreshCw, Smartphone, CheckCircle, XCircle, Download } from 'lucide-react-native';
import usePatientStore from '../../store/usePatientStore';
import OfflineSyncService from '../../lib/OfflineSyncService';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import apiService from '../../lib/apiService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DeveloperObservabilityScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const { patient, syncState, pendingSyncCount, simulateOffline, setSimulateOffline, lastSyncTimestamp } = usePatientStore();
    
    const [backendHealth, setBackendHealth] = useState(null);
    const [loadingHealth, setLoadingHealth] = useState(true);
    const [fcmToken, setFcmToken] = useState('Checking...');
    const [notificationPermissions, setNotificationPermissions] = useState('Checking...');
    const [pingLatency, setPingLatency] = useState(0);
    const [offlineQueueRaw, setOfflineQueueRaw] = useState([]);

    useEffect(() => {
        fetchDiagnostics();
    }, []);

    const fetchDiagnostics = async () => {
        setLoadingHealth(true);
        
        // 1. Fetch Backend API Health
        const start = Date.now();
        try {
            const res = await apiService.api.get('/admin/observability/system-health');
            setBackendHealth(res.data);
            setPingLatency(Date.now() - start);
        } catch (err) {
            console.error('Failed to fetch observability stats:', err);
            setBackendHealth(null);
        }

        // 2. Fetch Notifications Status
        try {
            const { status } = await Notifications.getPermissionsAsync();
            setNotificationPermissions(status);
            const token = await Notifications.getExpoPushTokenAsync({
                projectId: Constants.expoConfig?.extra?.eas?.projectId || "eb48e026-64fa-4fc6-b63e-ab4cc8630713"
            });
            setFcmToken(token.data);
        } catch (e) {
            setFcmToken('Failed to retrieve');
        }

        // 3. Fetch Raw Queue
        try {
            const queueStr = await AsyncStorage.getItem('OFFLINE_MUTATION_QUEUE');
            setOfflineQueueRaw(queueStr ? JSON.parse(queueStr) : []);
        } catch (e) {}

        setLoadingHealth(false);
    };

    const handleForceSync = () => {
        setSimulateOffline(false);
        OfflineSyncService.flushQueue();
    };

    const handleExportDiagnostics = async () => {
        try {
            const diagnostics = {
                timestamp: new Date().toISOString(),
                device: {
                    os: Platform.OS,
                    version: Platform.Version,
                    model: Constants.deviceName,
                    app_version: Constants.expoConfig?.version,
                },
                state: {
                    syncState,
                    pendingSyncCount,
                    simulateOffline,
                    lastSyncTimestamp,
                },
                notifications: {
                    permission: notificationPermissions,
                    hasToken: fcmToken !== 'Checking...' && fcmToken !== 'Failed to retrieve',
                },
                backendHealth,
                rawQueue: offlineQueueRaw,
            };

            const fileUri = `${FileSystem.documentDirectory}diagnostics_${Date.now()}.json`;
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

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft size={24} color="#0F172A" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>System Observability</Text>
                <TouchableOpacity onPress={handleExportDiagnostics} style={styles.exportButton}>
                    <Download size={20} color="#2563EB" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                
                {/* ─── Sync Status ──────────────────────────────────────── */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <RefreshCw size={20} color="#2563EB" />
                        <Text style={styles.cardTitle}>Offline Sync</Text>
                    </View>
                    <StatRow label="Queue Length" value={pendingSyncCount} status={pendingSyncCount > 0 ? 'bad' : 'good'} />
                    <StatRow label="Sync State" value={syncState.toUpperCase()} status={syncState === 'synced' ? 'good' : (syncState === 'failed' ? 'bad' : 'neutral')} />
                    <StatRow label="Last Successful Sync" value={lastSyncTimestamp ? new Date(lastSyncTimestamp).toLocaleTimeString() : 'Never'} />
                    
                    <View style={styles.divider} />
                    
                    <View style={styles.actionRow}>
                        <Text style={styles.statLabel}>Simulate Offline Mode</Text>
                        <Switch
                            value={simulateOffline}
                            onValueChange={(val) => {
                                setSimulateOffline(val);
                                if (!val) OfflineSyncService.flushQueue();
                            }}
                            trackColor={{ false: "#CBD5E1", true: "#DC2626" }}
                        />
                    </View>
                    <TouchableOpacity style={styles.primaryButton} onPress={handleForceSync}>
                        <Text style={styles.primaryButtonText}>Force Sync Retry</Text>
                    </TouchableOpacity>
                </View>

                {/* ─── API Health ───────────────────────────────────────── */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Activity size={20} color="#059669" />
                        <Text style={styles.cardTitle}>Backend API Health</Text>
                    </View>
                    <StatRow label="Ping Latency" value={`${pingLatency}ms`} status={pingLatency < 500 ? 'good' : 'bad'} />
                    {loadingHealth ? (
                        <Text style={styles.loadingText}>Fetching backend stats...</Text>
                    ) : backendHealth ? (
                        <>
                            <StatRow label="Notifications (7d)" value={`${backendHealth.notifications_7d?.delivered} Delivered / ${backendHealth.notifications_7d?.failed} Failed`} />
                            <StatRow label="Global Delivery Rate" value={backendHealth.notifications_7d?.success_rate} status={parseFloat(backendHealth.notifications_7d?.success_rate) > 95 ? 'good' : 'bad'} />
                            <StatRow label="Active Tokens" value={backendHealth.tokens?.active} />
                            <StatRow label="Stale Tokens" value={backendHealth.tokens?.stale} status={backendHealth.tokens?.stale > 0 ? 'bad' : 'good'} />
                        </>
                    ) : (
                        <Text style={styles.errorText}>Could not reach backend.</Text>
                    )}
                    <TouchableOpacity style={styles.secondaryButton} onPress={fetchDiagnostics}>
                        <Text style={styles.secondaryButtonText}>Refresh Health</Text>
                    </TouchableOpacity>
                </View>

                {/* ─── Device Diagnostics ───────────────────────────────── */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Smartphone size={20} color="#7C3AED" />
                        <Text style={styles.cardTitle}>Device Diagnostics</Text>
                    </View>
                    <StatRow label="Platform" value={`${Platform.OS} ${Platform.Version}`} />
                    <StatRow label="Device Model" value={Constants.deviceName} />
                    <StatRow label="App Version" value={Constants.expoConfig?.version || '1.0.0'} />
                    <View style={styles.divider} />
                    <StatRow label="Push Permissions" value={notificationPermissions} status={notificationPermissions === 'granted' ? 'good' : 'bad'} />
                    <StatRow label="FCM Token" value={fcmToken.length > 20 ? `${fcmToken.substring(0, 15)}...` : fcmToken} />
                </View>

            </ScrollView>
        </View>
    );
}

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
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    cardTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginLeft: 8 },
    
    statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    statLabel: { fontSize: 14, color: '#64748B', fontWeight: '500' },
    statValueContainer: { flexDirection: 'row', alignItems: 'center' },
    statIcon: { marginRight: 6 },
    statValue: { fontSize: 14, color: '#0F172A', fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    
    divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },
    actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    
    primaryButton: {
        backgroundColor: '#2563EB', borderRadius: 12, padding: 12,
        alignItems: 'center', marginTop: 12,
    },
    primaryButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
    
    secondaryButton: {
        backgroundColor: '#F1F5F9', borderRadius: 12, padding: 12,
        alignItems: 'center', marginTop: 12,
    },
    secondaryButtonText: { color: '#475569', fontWeight: '600', fontSize: 14 },
    
    loadingText: { color: '#64748B', fontSize: 14, fontStyle: 'italic', marginVertical: 8 },
    errorText: { color: '#DC2626', fontSize: 14, fontWeight: '500', marginVertical: 8 },
});
