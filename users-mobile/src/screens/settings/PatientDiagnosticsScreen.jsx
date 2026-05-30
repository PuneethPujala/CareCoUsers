import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { 
    ArrowLeft, Activity, CloudOff, RefreshCw, Smartphone, 
    CheckCircle, XCircle, Clock, AlertTriangle, 
    Shield, ShieldAlert, Key, Heart
} from 'lucide-react-native';
import usePatientStore from '../../store/usePatientStore';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import api, { getApiTokens } from '../../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';

export default function PatientDiagnosticsScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const { user, profile } = useAuth();
    const { syncState, pendingSyncCount, lastSyncTimestamp } = usePatientStore();
    
    const [backendHealth, setBackendHealth] = useState(null);
    const [loading, setLoading] = useState(false);
    const [fcmToken, setFcmToken] = useState('Checking...');
    const [notificationPermissions, setNotificationPermissions] = useState('Checking...');
    const [pingLatency, setPingLatency] = useState(0);
    const [offlineQueue, setOfflineQueue] = useState([]);
    const [clockDrift, setClockDrift] = useState(null);
    const [replayHistory, setReplayHistory] = useState([]);
    const [lifecycleHistory, setLifecycleHistory] = useState([]);
    const [sessionHealth, setSessionHealth] = useState({
        authenticated: false,
        expiresAt: null,
        tokenAgeSeconds: null,
        sessionValid: false
    });

    const fetchDiagnostics = async () => {
        setLoading(true);
        const start = Date.now();

        // 1. Session Health
        try {
            const apiTok = await getApiTokens();
            if (apiTok && apiTok.access_token) {
                const expiresAt = apiTok.expires_at; // Unix timestamp in seconds
                const nowSec = Math.floor(Date.now() / 1000);
                const isExpired = expiresAt ? nowSec >= expiresAt : false;
                setSessionHealth({
                    authenticated: !!user,
                    expiresAt: expiresAt ? new Date(expiresAt * 1000).toLocaleTimeString() : 'N/A',
                    tokenAgeSeconds: expiresAt ? Math.max(0, expiresAt - nowSec) : null,
                    sessionValid: !isExpired && !!user
                });
            } else {
                setSessionHealth({
                    authenticated: !!user,
                    expiresAt: 'N/A',
                    tokenAgeSeconds: null,
                    sessionValid: !!user
                });
            }
        } catch (e) {
            setSessionHealth(prev => ({ ...prev, sessionValid: false }));
        }

        // 2. Fetch Backend API Health & Clock Drift
        try {
            const res = await api.get('/admin/observability/system-health');
            setBackendHealth(res.data);
            const end = Date.now();
            setPingLatency(end - start);
            
            if (res.data && res.data.timestamp) {
                const serverTime = new Date(res.data.timestamp).getTime();
                const clientMidpoint = start + ((end - start) / 2);
                const drift = Math.abs(serverTime - clientMidpoint);
                setClockDrift(drift);
            }
        } catch (err) {
            console.error('Failed to fetch diagnostics backend stats:', err);
            setBackendHealth(null);
            setClockDrift(null);
        }

        // 3. Fetch Notifications Status
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

        // 4. Fetch Offline Queue & Logs
        try {
            const queueStr = await AsyncStorage.getItem('offline_mutation_queue');
            setOfflineQueue(queueStr ? JSON.parse(queueStr) : []);

            const replayStr = await AsyncStorage.getItem('offline_replay_history');
            setReplayHistory(replayStr ? JSON.parse(replayStr) : []);

            const lifecycleStr = await AsyncStorage.getItem('app_lifecycle_history');
            setLifecycleHistory(lifecycleStr ? JSON.parse(lifecycleStr) : []);
        } catch (e) {
            setOfflineQueue([]);
        }

        setLoading(false);
    };

    // Run diagnostics when screen focuses
    useFocusEffect(
        useCallback(() => {
            fetchDiagnostics();
        }, [])
    );

    const getRelativeTime = (timestamp) => {
        if (!timestamp) return '';
        const diffMs = Date.now() - timestamp;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'just now';
        if (diffMin === 1) return '1 min ago';
        return `${diffMin} mins ago`;
    };

    const getQueueItemLabel = (item) => {
        const timeStr = getRelativeTime(item.timestamp);
        switch (item.type) {
            case 'MARK_MED_TAKEN':
            case 'MARK_SLOT_TAKEN':
                return `${item.payload?.medicine_name || 'Medication'} Marked Taken • ${timeStr}`;
            case 'LOG_VITALS':
                return `Vitals Logged • ${timeStr}`;
            default:
                return `${item.type.replace(/_/g, ' ')} • ${timeStr}`;
        }
    };

    // Overall Health Score Calculation
    const calculateHealthScore = () => {
        let score = 100;
        
        // 1. Clock Drift (Deduct up to 30 points)
        if (clockDrift !== null && clockDrift > 5000) {
            score -= 30;
        }

        // 2. Device Token Health (Deduct up to 25 points)
        if (fcmToken === 'Failed to retrieve' || fcmToken === 'Checking...') {
            score -= 25;
        }

        // 3. Notification Permissions (Deduct up to 20 points)
        if (notificationPermissions !== 'granted') {
            score -= 20;
        }

        // 4. Session Validity (Deduct up to 15 points)
        if (!sessionHealth.sessionValid) {
            score -= 15;
        }

        // 5. Sync State (Deduct up to 10 points)
        if (syncState === 'failed') {
            score -= 10;
        }

        // 6. Offline Queue items (Deduct 5 points per item, max 20)
        const queueDeduction = Math.min(20, offlineQueue.length * 5);
        score -= queueDeduction;

        return Math.max(0, score);
    };

    const score = calculateHealthScore();
    let scoreColor = '#16A34A'; // Green
    let scoreLabel = '🟢 Excellent';
    if (score < 70) {
        scoreColor = '#DC2626'; // Red
        scoreLabel = '🔴 Action Required';
    } else if (score < 90) {
        scoreColor = '#D97706'; // Amber
        scoreLabel = '🟡 Needs Attention';
    }

    const StatRow = ({ label, value, status = 'neutral' }) => (
        <View style={styles.statRow}>
            <Text style={styles.statLabel}>{label}</Text>
            <View style={styles.statValueContainer}>
                {status === 'good' && <CheckCircle size={14} color="#16A34A" style={styles.statIcon} />}
                {status === 'bad' && <XCircle size={14} color="#DC2626" style={styles.statIcon} />}
                {status === 'warning' && <AlertTriangle size={14} color="#D97706" style={styles.statIcon} />}
                <Text style={[
                    styles.statValue, 
                    status === 'good' && {color: '#16A34A'}, 
                    status === 'bad' && {color: '#DC2626'},
                    status === 'warning' && {color: '#D97706'}
                ]}>
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
                <Text style={styles.headerTitle}>Device Health Check</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView 
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={loading} onRefresh={fetchDiagnostics} colors={["#2563EB"]} />
                }
            >
                {/* ── Overall Health Score Card ──────────────────────────── */}
                <View style={[styles.scoreCard, { borderColor: scoreColor }]}>
                    <View style={styles.scoreContainer}>
                        <Text style={[styles.scoreNumber, { color: scoreColor }]}>{score}</Text>
                        <Text style={styles.scoreMax}>/100</Text>
                    </View>
                    <Text style={[styles.scoreStatusLabel, { color: scoreColor }]}>{scoreLabel}</Text>
                    <Text style={styles.scoreSub}>Based on current system parameters</Text>
                </View>

                {/* ── Session Health Card ──────────────────────────── */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Key size={20} color="#6366F1" />
                        <Text style={styles.cardTitle}>Session Health</Text>
                    </View>
                    <StatRow label="Authenticated" value={sessionHealth.authenticated ? 'Yes' : 'No'} status={sessionHealth.authenticated ? 'good' : 'bad'} />
                    <StatRow label="Session Valid" value={sessionHealth.sessionValid ? 'Active' : 'Expired/Invalid'} status={sessionHealth.sessionValid ? 'good' : 'bad'} />
                    <StatRow label="Token Expires At" value={sessionHealth.expiresAt} />
                    {sessionHealth.tokenAgeSeconds !== null && (
                        <StatRow 
                            label="Time Left" 
                            value={`${Math.floor(sessionHealth.tokenAgeSeconds / 60)} mins`} 
                            status={sessionHealth.tokenAgeSeconds > 300 ? 'good' : 'warning'} 
                        />
                    )}
                </View>

                {/* ── Offline Sync Status ──────────────────────────────── */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <RefreshCw size={20} color="#2563EB" />
                        <Text style={styles.cardTitle}>Sync Status</Text>
                    </View>
                    <StatRow 
                        label="Sync State" 
                        value={syncState.toUpperCase()} 
                        status={syncState === 'synced' ? 'good' : (syncState === 'failed' ? 'bad' : 'neutral')} 
                    />
                    <StatRow label="Last Successful Sync" value={lastSyncTimestamp ? new Date(lastSyncTimestamp).toLocaleTimeString() : 'Never'} />
                </View>

                {/* ── Queue State Card ─────────────────────────────────── */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <CloudOff size={20} color="#E28743" />
                        <Text style={styles.cardTitle}>Queue State</Text>
                    </View>
                    <StatRow label="Pending Sync Count" value={offlineQueue.length} status={offlineQueue.length > 0 ? 'warning' : 'good'} />
                    {offlineQueue.length > 0 && (
                        <View style={styles.queueDetails}>
                            <Text style={styles.queueHeader}>Pending Mutations Checklist:</Text>
                            {offlineQueue.map((item, idx) => (
                                <View key={idx} style={styles.queueItemRow}>
                                    <View style={styles.queueItemBullet} />
                                    <Text style={styles.queueItemText} numberOfLines={1}>
                                        {getQueueItemLabel(item)}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* ── Device Token Health ───────────────────────────────── */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Smartphone size={20} color="#7C3AED" />
                        <Text style={styles.cardTitle}>Device Token Health</Text>
                    </View>
                    <StatRow 
                        label="FCM Token" 
                        value={fcmToken.length > 20 ? 'Retrieved Successfully' : fcmToken} 
                        status={fcmToken.length > 20 ? 'good' : 'bad'} 
                    />
                    {fcmToken.length > 20 && (
                        <Text style={styles.tokenPreview} numberOfLines={1}>
                            Preview: {fcmToken.substring(0, 30)}...
                        </Text>
                    )}
                    {backendHealth ? (
                        <>
                            <StatRow 
                                label="Active Server Tokens" 
                                value={backendHealth.tokens?.active} 
                                status={backendHealth.tokens?.active > 0 ? 'good' : 'warning'}
                            />
                            <StatRow 
                                label="Stale Server Tokens" 
                                value={backendHealth.tokens?.stale} 
                                status={backendHealth.tokens?.stale > 0 ? 'bad' : 'good'} 
                            />
                        </>
                    ) : (
                        <Text style={styles.smallErrorText}>Could not retrieve token status from backend.</Text>
                    )}
                </View>

                {/* ── Notification Status Card ─────────────────────────── */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Activity size={20} color="#F43F5E" />
                        <Text style={styles.cardTitle}>Notification Status</Text>
                    </View>
                    <StatRow 
                        label="System Permission" 
                        value={notificationPermissions.toUpperCase()} 
                        status={notificationPermissions === 'granted' ? 'good' : 'bad'} 
                    />
                    {backendHealth ? (
                        <>
                             <StatRow 
                                 label={backendHealth.is_patient_scoped ? "Patient Delivery Rate" : "Global Delivery Rate"} 
                                 value={backendHealth.notifications_7d?.total_attempted === 0 ? 'N/A (No history)' : backendHealth.notifications_7d?.success_rate} 
                                 status={backendHealth.notifications_7d?.total_attempted === 0 ? 'neutral' : (parseFloat(backendHealth.notifications_7d?.success_rate) > 90 ? 'good' : 'warning')}
                             />
                            <StatRow 
                                label="Delivered (7 Days)" 
                                value={backendHealth.notifications_7d?.delivered} 
                            />
                            <StatRow 
                                label="Failed (7 Days)" 
                                value={backendHealth.notifications_7d?.failed} 
                                status={backendHealth.notifications_7d?.failed > 0 ? 'warning' : 'good'}
                            />
                        </>
                    ) : (
                        <Text style={styles.smallErrorText}>Could not fetch notification metrics from backend.</Text>
                    )}
                </View>

                {/* ── Clock Drift Card ─────────────────────────────────── */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Clock size={20} color="#0EA5E9" />
                        <Text style={styles.cardTitle}>Clock Drift</Text>
                    </View>
                    <StatRow 
                        label="Clock Drift" 
                        value={clockDrift !== null ? `${(clockDrift / 1000).toFixed(2)}s` : 'Measuring...'} 
                        status={clockDrift !== null && clockDrift < 5000 ? 'good' : (clockDrift !== null ? 'bad' : 'neutral')} 
                    />
                    <StatRow label="Ping Latency" value={`${pingLatency}ms`} status={pingLatency < 500 ? 'good' : 'bad'} />
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
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
    scrollContent: { padding: 16, paddingBottom: 40 },
    
    scoreCard: {
        backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20,
        marginBottom: 16, alignItems: 'center', borderWidth: 2,
        shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
    },
    scoreContainer: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8 },
    scoreNumber: { fontSize: 48, fontWeight: '800' },
    scoreMax: { fontSize: 18, color: '#64748B', fontWeight: '600' },
    scoreStatusLabel: { fontSize: 18, fontWeight: '700', marginTop: 4 },
    scoreSub: { fontSize: 12, color: '#94A3B8', marginTop: 4 },

    card: {
        backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
        marginBottom: 16,
        shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginLeft: 8 },
    
    statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    statLabel: { fontSize: 14, color: '#64748B', fontWeight: '500' },
    statValueContainer: { flexDirection: 'row', alignItems: 'center' },
    statIcon: { marginRight: 6 },
    statValue: { fontSize: 14, color: '#0F172A', fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    
    tokenPreview: { fontSize: 11, color: '#94A3B8', marginTop: -4, marginBottom: 8, fontStyle: 'italic' },
    smallErrorText: { fontSize: 12, color: '#DC2626', fontStyle: 'italic', marginVertical: 4 },
    
    queueDetails: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 10 },
    queueHeader: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 },
    queueItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
    queueItemBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D97706', marginRight: 8 },
    queueItemText: { fontSize: 12, color: '#64748B', flex: 1 },
});
