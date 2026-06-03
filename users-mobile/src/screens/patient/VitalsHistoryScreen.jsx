import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Platform, Pressable,
    ActivityIndicator, KeyboardAvoidingView, Dimensions, Animated,
    useWindowDimensions, Modal, DeviceEventEmitter
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart } from 'react-native-chart-kit';
import NetInfo from '@react-native-community/netinfo';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
    ChevronLeft, ChevronRight, Heart, Activity, Wind, Droplets,
    AlertTriangle, WifiOff, RefreshCw, Calendar, Clock, Sparkles,
    Maximize2, X, Plus, Zap, Watch, CheckCircle2, AlertCircle
} from 'lucide-react-native';
import Svg, { Line, Path, Circle } from 'react-native-svg';
import axiosInstance, { handleAxiosError } from '../../lib/axiosInstance';
import { apiService } from '../../lib/api';
import { colors, layout } from '../../theme';
import SmartInput from '../../components/ui/SmartInput';
import OfflineSyncService from '../../lib/OfflineSyncService';
import HealthSyncService from '../../services/HealthSyncService';
import usePatientStore from '../../store/usePatientStore';

// ─── Skeleton Loader ──────────────────────────────────────────
const SkeletonItem = ({ width, height, borderRadius = 8, style }) => {
    const anim = useRef(new Animated.Value(0.3)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true })
            ])
        ).start();
    }, [anim]);
    return <Animated.View style={[{ width, height, borderRadius, backgroundColor: '#E2E8F0', opacity: anim }, style]} />;
};

// ─── Chart Error Boundary ─────────────────────────────────────
class ChartErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { hasError: false }; }
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(error, info) { console.error('Chart Error:', error, info); }
    render() {
        if (this.state.hasError) {
            return (
                <View style={styles.emptyChartBox}>
                    <Text style={styles.emptyChartText}>Something went wrong while rendering this chart.</Text>
                </View>
            );
        }
        return this.props.children;
    }
}

const SCREEN_W = Dimensions.get('window').width;

const makeChartConfig = (accentColor) => ({
    backgroundGradientFrom: '#FFFFFF',
    backgroundGradientTo: '#FFFFFF',
    decimalPlaces: 0,
    strokeWidth: 3,
    color: (opacity = 1) => {
        const boosted = Math.max(opacity, 0.6);
        if (accentColor && accentColor.startsWith('#')) {
            const r = parseInt(accentColor.slice(1, 3), 16);
            const g = parseInt(accentColor.slice(3, 5), 16);
            const b = parseInt(accentColor.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${boosted})`;
        }
        return accentColor ? accentColor.replace(')', `, ${boosted})`).replace('rgb', 'rgba') : `rgba(0,0,0,${boosted})`;
    },
    labelColor: () => '#64748B',
    propsForDots: { r: '6', strokeWidth: '3', stroke: '#FFFFFF' },
    propsForBackgroundLines: { stroke: '#E8ECF2', strokeDasharray: '' },
    style: { borderRadius: 16 },
    paddingRight: 40,
});

const CHART_DEFS = [
    {
        id: 'heart_rate', title: 'Heart Rate', unit: 'bpm', yLabel: 'bpm',
        icon: Heart, accent: '#CC5B31', bgTint: '#FFF7F5',
        extract: (v) => v.heart_rate || 0,
        normalRange: [60, 100],
        insight: (val) => val < 60 ? 'A little lower than usual. Nothing urgent — just worth keeping an eye on.' : val > 100 ? 'A bit higher than your usual range. Worth noting for your next appointment.' : 'Your heart rate looks steady today.',
    },
    {
        id: 'blood_pressure', title: 'BP Systolic', unit: 'mmHg', yLabel: 'mmHg',
        icon: Activity, accent: '#4B88D6', accentAlt: '#94A3B8', bgTint: '#F0F7FF',
        extract: (v) => v.blood_pressure?.systolic || 0,
        extractAlt: (v) => v.blood_pressure?.diastolic || 0,
        legend: ['Systolic', 'Diastolic'],
        normalRange: [90, 140],
        insight: (val) => val > 140 ? 'That reading is a little higher than usual. Worth mentioning at your next appointment.' : 'Your blood pressure looks healthy.',
    },
    {
        id: 'oxygen_saturation', title: 'SpO₂', unit: '%', yLabel: 'SpO₂',
        icon: Wind, accent: '#4DA379', bgTint: '#F0F9F5',
        extract: (v) => v.oxygen_saturation || 0,
        normalRange: [95, 100],
        insight: (val) => val < 95 ? 'A touch below the typical range. Some slow deep breaths might help.' : 'Your oxygen levels look great.',
    },
    {
        id: 'hydration', title: 'Hydration', unit: '%', yLabel: '%',
        icon: Droplets, accent: '#376DAF', bgTint: '#EFF6FF',
        extract: (v) => v.hydration || 0,
        normalRange: [60, 100],
        insight: (val) => val < 60 ? 'A little on the low side. A glass of water when you can.' : 'Hydration is looking good today.',
    },
];

const getInsight = (data, label, isSingle) => {
    if (!data || data.length < 2) {
        if (isSingle && data.length === 1) return { text: 'Single reading recorded today. Log more to see trends.', type: 'stable' };
        return null;
    }
    const mid = Math.floor(data.length / 2);
    const firstHalf = data.slice(0, mid).filter(v => v > 0);
    const secondHalf = data.slice(mid).filter(v => v > 0);
    if (!firstHalf.length || !secondHalf.length) return null;
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const pctChange = ((avgSecond - avgFirst) / avgFirst) * 100;
    const periodText = isSingle ? 'today' : 'over the selected period';
    if (pctChange > 5) return { text: `Your ${label} has been a bit higher ${periodText}. Worth keeping an eye on.`, type: 'warning' };
    if (pctChange < -5) return { text: `Your ${label} is improving ${periodText}.`, type: 'positive' };
    return { text: `Your ${label} has been stable ${periodText}.`, type: 'stable' };
};

// Shared metric chip configs (used in hero card and history cards)
const METRIC_CHIPS = [
    { key: 'hr',   icon: Heart,    color: '#CC5B31', bg: '#FFF7F5', border: '#FECACA', label: 'Heart Rate', unit: 'bpm',  getValue: (log) => log.heart_rate ?? '—' },
    { key: 'bp',   icon: Activity, color: '#4B88D6', bg: '#F0F7FF', border: '#BFDBFE', label: 'BP',         unit: 'mmHg', getValue: (log) => `${log.blood_pressure?.systolic ?? '—'}/${log.blood_pressure?.diastolic ?? '—'}` },
    { key: 'spo2', icon: Wind,     color: '#4DA379', bg: '#F0F9F5', border: '#BBF7D0', label: 'SpO₂',       unit: '%',    getValue: (log) => log.oxygen_saturation ?? '—' },
    { key: 'hyd',  icon: Droplets, color: '#376DAF', bg: '#EFF6FF', border: '#BFDBFE', label: 'Hydration',  unit: '%',    getValue: (log) => log.hydration ?? '—' },
];

export default function VitalsHistoryScreen({ navigation }) {
    // ─── State (unchanged) ──────────────────────────────────────
    const [vitals, setVitals] = useState([]);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [dataRefreshing, setDataRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [isOffline, setIsOffline] = useState(false);

    const [rangeMode, setRangeMode] = useState('single');
    const [startDate, setStartDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date());

    const [historyLogs, setHistoryLogs] = useState([]);
    const [historyDate, setHistoryDate] = useState(new Date());

    const { width: windowW, height: windowH } = useWindowDimensions();
    const isLandscape = windowW > windowH;
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showHistoryPicker, setShowHistoryPicker] = useState(false);
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);

    const [isLogging, setIsLogging] = useState(false);
    const [formValues, setFormValues] = useState({
        heart_rate: '', systolic: '', diastolic: '', oxygen_saturation: '', hydration: '',
    });
    const [formError, setFormError] = useState(null);
    const [activeMetricId, setActiveMetricId] = useState('heart_rate');

    // Smartwatch Synchronization States & Diagnostics
    const [syncStatus, setSyncStatus] = useState({
        enabled: false,
        connected: false,
        permissionStatus: 'unavailable',
        lastSync: null,
        readingsToday: 0,
        syncing: false,
        latestSource: 'health_connect',
    });

    const fetchSyncStatus = useCallback(async () => {
        try {
            const status = await HealthSyncService.getStatus();
            const res = await apiService.patients.getSyncStatus().catch(() => null);
            if (res?.data) {
                setSyncStatus(prev => ({
                    ...prev,
                    ...status,
                    lastSync: res.data.last_sync ? new Date(res.data.last_sync) : status.lastSync,
                    readingsToday: res.data.readings_today ?? status.readingsToday,
                    connected: res.data.connected ?? status.connected,
                    latestSource: res.data.source || status.source || 'health_connect',
                }));
            } else {
                setSyncStatus(prev => ({ ...prev, ...status }));
            }
        } catch (err) {
            console.warn('Failed to fetch sync status:', err.message);
        }
    }, []);

    // 7-Day Data Coverage calculation
    const coverageMetrics = useMemo(() => {
        const last7Days = [...Array(7)].map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toISOString().slice(0, 10);
        });

        let hrCount = 0;
        let bpCount = 0;
        let spo2Count = 0;

        last7Days.forEach(dateStr => {
            const hasHr = vitals.some(v => v.date && v.date.slice(0, 10) === dateStr && v.heart_rate != null);
            const hasBp = vitals.some(v => v.date && v.date.slice(0, 10) === dateStr && v.blood_pressure?.systolic != null);
            const hasSpo2 = vitals.some(v => v.date && v.date.slice(0, 10) === dateStr && v.oxygen_saturation != null);

            if (hasHr) hrCount++;
            if (hasBp) bpCount++;
            if (hasSpo2) spo2Count++;
        });

        return {
            heartRate: Math.round((hrCount / 7) * 100),
            bloodPressure: Math.round((bpCount / 7) * 100),
            oxygenSaturation: Math.round((spo2Count / 7) * 100),
        };
    }, [vitals]);

    // 🧠 AI Trend Insights Synthesis Engine
    const trendInsights = useMemo(() => {
        if (!vitals || vitals.length === 0) return null;

        // 1. Filter records from the last 7 days
        const oneDayMs = 24 * 60 * 60 * 1000;
        const nowMs = Date.now();
        const logs7Days = vitals.filter(v => {
            const timeDiff = nowMs - new Date(v.date).getTime();
            return timeDiff <= 7 * oneDayMs;
        });

        const total7DayLogs = logs7Days.length;
        if (total7DayLogs === 0) return null;

        // Source awareness percentages
        const wearable7DayLogs = logs7Days.filter(v => v.source && v.source !== 'manual').length;
        const wearablePct = Math.round((wearable7DayLogs / total7DayLogs) * 100);
        const manualPct = 100 - wearablePct;

        // Partition dates: Recent (last 3 days) vs Baseline (previous 4 days)
        const recentLogs = logs7Days.filter(v => {
            const timeDiff = nowMs - new Date(v.date).getTime();
            return timeDiff <= 3 * oneDayMs;
        });
        const baselineLogs = logs7Days.filter(v => {
            const timeDiff = nowMs - new Date(v.date).getTime();
            return timeDiff > 3 * oneDayMs && timeDiff <= 7 * oneDayMs;
        });

        // --- HEART RATE TREND ---
        const hrRecent = recentLogs.map(v => v.heart_rate).filter(h => h > 0);
        const hrBaseline = baselineLogs.map(v => v.heart_rate).filter(h => h > 0);
        const hrCount = logs7Days.filter(v => v.heart_rate > 0).length;

        let hrLabel = 'Stable';
        let hrColor = '#10B981'; // Green
        let hrThemeKey = 'stable';
        if (hrRecent.length > 0 && hrBaseline.length > 0) {
            const hrRecentAvg = hrRecent.reduce((a, b) => a + b, 0) / hrRecent.length;
            const hrBaselineAvg = hrBaseline.reduce((a, b) => a + b, 0) / hrBaseline.length;
            const diff = hrRecentAvg - hrBaselineAvg;
            if (diff >= 5) {
                hrLabel = 'Slightly Higher';
                hrColor = '#F59E0B'; // Orange
                hrThemeKey = 'warning';
            } else if (diff <= -5) {
                hrLabel = 'Slightly Lower';
                hrColor = '#6366F1'; // Indigo
                hrThemeKey = 'stable';
            }
        }

        let hrConfidence = 'Low';
        if (hrCount >= 14) hrConfidence = 'High';
        else if (hrCount >= 6) hrConfidence = 'Medium';

        // --- BLOOD PRESSURE TREND ---
        const bpRecent = recentLogs.map(v => v.blood_pressure?.systolic).filter(s => s > 0);
        const bpBaseline = baselineLogs.map(v => v.blood_pressure?.systolic).filter(s => s > 0);
        const bpCount = logs7Days.filter(v => v.blood_pressure?.systolic > 0).length;

        let bpLabel = 'Stable';
        let bpColor = '#10B981';
        let bpThemeKey = 'stable';
        if (bpRecent.length > 0 && bpBaseline.length > 0) {
            const bpRecentAvg = bpRecent.reduce((a, b) => a + b, 0) / bpRecent.length;
            const bpBaselineAvg = bpBaseline.reduce((a, b) => a + b, 0) / bpBaseline.length;
            const diff = bpRecentAvg - bpBaselineAvg;
            if (diff >= 8) {
                bpLabel = 'Trending Up';
                bpColor = '#F59E0B';
                bpThemeKey = 'warning';
            } else if (diff <= -8) {
                bpLabel = 'Improving';
                bpColor = '#10B981';
                bpThemeKey = 'improving';
            }
        }

        let bpConfidence = 'Low';
        if (bpCount >= 14) bpConfidence = 'High';
        else if (bpCount >= 6) bpConfidence = 'Medium';

        // --- OXYGEN SATURATION (SpO₂) ---
        const spo2Logs = logs7Days.map(v => v.oxygen_saturation).filter(o => o > 0);
        const spo2Count = spo2Logs.length;
        const lowestSpo2 = spo2Logs.length > 0 ? Math.min(...spo2Logs) : 100;
        const avgSpo2 = spo2Logs.length > 0 ? Math.round(spo2Logs.reduce((a, b) => a + b, 0) / spo2Logs.length) : 0;

        let spo2Label = 'Normal Range';
        let spo2Desc = `Oxygen readings remain within normal range, averaging ${avgSpo2}%.`;
        let spo2ThemeKey = 'normal';
        if (lowestSpo2 < 95 && spo2Count > 0) {
            spo2Label = 'Occasional Dips';
            spo2Desc = 'Recent oxygen readings have occasionally fallen below your usual range.';
            spo2ThemeKey = 'dips';
        }

        let spo2Confidence = 'Low';
        if (spo2Count >= 14) spo2Confidence = 'High';
        else if (spo2Count >= 6) spo2Confidence = 'Medium';

        return {
            wearablePct,
            manualPct,
            heartRate: { label: hrLabel, color: hrColor, confidence: hrConfidence, readings: hrCount, theme: hrThemeKey },
            bloodPressure: { label: bpLabel, color: bpColor, confidence: bpConfidence, readings: bpCount, theme: bpThemeKey },
            oxygen: { label: spo2Label, desc: spo2Desc, confidence: spo2Confidence, readings: spo2Count, theme: spo2ThemeKey }
        };
    }, [vitals]);

    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, visible: false, value: 0, label: '' });
    const tooltipFade = useRef(new Animated.Value(0)).current;
    const scrollY = useRef(new Animated.Value(0)).current;
    const dataFadeAnim = useRef(new Animated.Value(1)).current;

    const showTooltip = (x, y, value, label) => {
        setTooltipPos({ x, y, visible: true, value, label });
        Animated.timing(tooltipFade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    };
    const hideTooltip = () => {
        Animated.timing(tooltipFade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() =>
            setTooltipPos(prev => ({ ...prev, visible: false }))
        );
    };

    // ─── Animations (unchanged) ──────────────────────────────────
    const staggerAnims = useRef([...Array(5)].map(() => new Animated.Value(0))).current;
    const runAnimations = useCallback(() => {
        staggerAnims.forEach(a => a.setValue(0));
        Animated.stagger(100, staggerAnims.map(a =>
            Animated.timing(a, { toValue: 1, duration: 600, useNativeDriver: true })
        )).start();
    }, [staggerAnims]);

    useFocusEffect(useCallback(() => { runAnimations(); return () => {}; }, [runAnimations]));

    // ─── NetInfo (unchanged) ─────────────────────────────────────
    useEffect(() => {
        const unsub = NetInfo.addEventListener(state => setIsOffline(!state.isConnected));
        return () => unsub();
    }, []);

    // ─── Fetch (unchanged) ──────────────────────────────────────
    const lastRequestRef = useRef(0);
    const fetchAllData = useCallback(async () => {
        if (isOffline) {
            setError('You are offline. Please connect to the internet to view your vitals history.');
            setLoading(false);
            return;
        }
        const now = Date.now();
        if (now - lastRequestRef.current < 400) return;
        lastRequestRef.current = now;
        setError(null);
        try {
            if (initialLoading) setLoading(true);
            else {
                setDataRefreshing(true);
                Animated.timing(dataFadeAnim, { toValue: 0.4, duration: 150, useNativeDriver: true }).start();
            }
            const [vitalsRes, historyRes] = await Promise.all([
                apiService.patients.getVitals({
                    start_date: startDate.toISOString(),
                    end_date: rangeMode === 'single' ? startDate.toISOString() : endDate.toISOString(),
                }),
                apiService.patients.getVitals({
                    start_date: historyDate.toISOString(),
                    end_date: historyDate.toISOString(),
                })
            ]);
            setVitals(vitalsRes.data.vitals || []);
            setHistoryLogs(historyRes.data.vitals || []);
        } catch (err) {
            setError(handleAxiosError(err));
        } finally {
            setLoading(false);
            setInitialLoading(false);
            setDataRefreshing(false);
            Animated.timing(dataFadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        }
    }, [startDate, endDate, rangeMode, historyDate, isOffline, initialLoading, dataFadeAnim]);

    const debounceRef = useRef(null);
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchAllData(), 300);
        return () => clearTimeout(debounceRef.current);
    }, [fetchAllData]);

    useEffect(() => {
        fetchSyncStatus();
    }, [fetchSyncStatus]);

    useEffect(() => {
        const sub1 = DeviceEventEmitter.addListener('VITALS_UPDATED', () => {
            lastRequestRef.current = 0;
            fetchAllData();
            fetchSyncStatus();
        });
        const sub2 = DeviceEventEmitter.addListener('VITALS_SYNCED', () => {
            lastRequestRef.current = 0;
            fetchAllData();
            fetchSyncStatus();
        });
        return () => {
            sub1.remove();
            sub2.remove();
        };
    }, [fetchAllData, fetchSyncStatus]);

    // ─── Chart labels (unchanged) ────────────────────────────────
    const chartLabels = useMemo(() => {
        if (!vitals.length) return [];
        return vitals.map(v => {
            const d = new Date(v.date);
            if (rangeMode === 'single') return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
            return `${d.getMonth() + 1}/${d.getDate()}`;
        });
    }, [vitals, rangeMode]);

    // ─── Log vitals handler (unchanged) ─────────────────────────
    const handleLogVitals = async () => {
        setFormError(null);
        const hr = Number(formValues.heart_rate);
        const sys = Number(formValues.systolic);
        const dia = Number(formValues.diastolic);
        const o2 = Number(formValues.oxygen_saturation);
        const hyd = Number(formValues.hydration);
        if (!hr || !sys || !dia || !o2 || !hyd) { setFormError('All fields are required.'); return; }
        try {
            setLoading(true);
            const payload = {
                date: new Date().toISOString(), // Preserves the exact moment of measurement
                heart_rate: hr,
                blood_pressure: { systolic: sys, diastolic: dia },
                oxygen_saturation: o2,
                hydration: hyd,
            };

            if (isOffline) {
                await OfflineSyncService.enqueueMutation({
                    type: 'LOG_VITALS',
                    payload
                });
                // Optimistically clear form and show success
                setIsLogging(false);
                setFormValues({ heart_rate: '', systolic: '', diastolic: '', oxygen_saturation: '', hydration: '' });
                
                // Add to local state optimistically
                setVitals(prev => [payload, ...prev]);
                
            } else {
                await apiService.patients.logVitals(payload);
                setIsLogging(false);
                setFormValues({ heart_rate: '', systolic: '', diastolic: '', oxygen_saturation: '', hydration: '' });
                DeviceEventEmitter.emit('VITALS_UPDATED');
                fetchAllData();
            }
        } catch (err) {
            setFormError(handleAxiosError(err));
        } finally {
            setLoading(false);
        }
    };

    // ─── Date helpers (unchanged) ────────────────────────────────
    const adjustDate = (setter, days) => {
        setter(prev => { const d = new Date(prev); d.setDate(d.getDate() + days); return d; });
    };
    const formatDate = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    const fadeAnim = useRef(new Animated.Value(1)).current;
    const handleMetricChange = (id) => {
        if (id === activeMetricId) return;
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
            setActiveMetricId(id);
            Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        });
    };

    const getRangeData = useCallback((id) => {
        const def = CHART_DEFS.find(c => c.id === id);
        if (!def || !vitals.length) return [];
        const grouped = vitals.reduce((acc, v) => {
            const d = new Date(v.date);
            const key = `${d.getMonth() + 1}/${d.getDate()}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(def.extract(v));
            return acc;
        }, {});
        return Object.keys(grouped).map(key => {
            const vals = grouped[key].filter(v => v > 0);
            if (!vals.length) return { x: key, y: 0, min: 0, max: 0 };
            return { x: key, y: vals.reduce((a, b) => a + b, 0) / vals.length, min: Math.min(...vals), max: Math.max(...vals) };
        });
    }, [vitals]);

    const setQuickRange = (days) => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days + 1);
        setRangeMode('range');
        setStartDate(start);
        setEndDate(end);
    };

    const getStats = (id) => {
        const def = CHART_DEFS.find(c => c.id === id);
        if (!def || !vitals.length) return null;
        const data = vitals.map(def.extract).filter(v => v > 0);
        if (!data.length) return null;
        const avgVal = data.reduce((a, b) => a + b, 0) / data.length;
        const minVal = Math.min(...data);
        const maxVal = Math.max(...data);
        const days = new Set(vitals.map(v => new Date(v.date).toDateString())).size;
        const readingsPerDay = (vitals.length / (days || 1)).toFixed(1);
        let altAvg, altMin, altMax;
        if (def.extractAlt) {
            const altData = vitals.map(def.extractAlt).filter(v => v > 0);
            if (altData.length) {
                altAvg = altData.reduce((a, b) => a + b, 0) / altData.length;
                altMin = Math.min(...altData);
                altMax = Math.max(...altData);
            }
        }
        let status = 'Looking good'; let statusColor = '#10B981';
        if (id === 'heart_rate') {
            if (avgVal > 100 || avgVal < 60) { status = 'Worth watching'; statusColor = '#F59E0B'; }
        } else if (id === 'oxygen_saturation') {
            if (avgVal < 95) { status = 'A bit low'; statusColor = '#F59E0B'; }
        } else if (id === 'blood_pressure') {
            if (avgVal > 140 || (altAvg && altAvg > 90)) { status = 'A bit high'; statusColor = '#F59E0B'; }
            else if (avgVal < 90 || (altAvg && altAvg < 60)) { status = 'A bit low'; statusColor = '#F59E0B'; }
        }
        return {
            avg: altAvg ? `${avgVal.toFixed(0)}/${altAvg.toFixed(0)}` : avgVal.toFixed(1),
            min: altMin ? `${minVal.toFixed(0)}/${altMin.toFixed(0)}` : minVal.toFixed(0),
            max: altMax ? `${maxVal.toFixed(0)}/${altMax.toFixed(0)}` : maxVal.toFixed(0),
            readingsPerDay, unit: def.unit, status, statusColor
        };
    };

    // ─── Manual Sync Trigger & Animation ────────────────────────
    const [manualSyncing, setManualSyncing] = useState(false);
    const syncRotateAnim = useRef(new Animated.Value(0)).current;

    const handleManualSync = async () => {
        if (manualSyncing) return;
        setManualSyncing(true);
        Animated.loop(
            Animated.timing(syncRotateAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
        ).start();

        try {
            await HealthSyncService.syncNow();
            await fetchSyncStatus();
            lastRequestRef.current = 0;
            await fetchAllData();
        } catch (err) {
            console.error('Manual sync failed:', err);
        } finally {
            syncRotateAnim.stopAnimation();
            syncRotateAnim.setValue(0);
            setManualSyncing(false);
        }
    };



    // ─── Render: Header ──────────────────────────────────────────
    const renderHeader = () => {
        const headerOpacity = scrollY.interpolate({ inputRange: [0, 50], outputRange: [0, 1], extrapolate: 'clamp' });
        return (
            <Animated.View style={styles.glassHeader}>
                <LinearGradient colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.85)']} style={StyleSheet.absoluteFill} />
                <View style={styles.headerContent}>
                    <Pressable onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
                        <ChevronLeft size={22} color="#1E293B" strokeWidth={2.5} />
                    </Pressable>
                    <Text style={styles.headerTitle}>Vitals History</Text>
                    <View style={{ width: 44 }} />
                </View>
                <Animated.View style={[styles.headerBorderLine, { opacity: headerOpacity }]} />
            </Animated.View>
        );
    };

    // ─── Render: Hero Summary Card (new) ─────────────────────────
    const renderHeroCard = () => {
        if (!vitals.length) return null;
        const latest = vitals[0];
        const readingTime = new Date(latest.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const readingDate = new Date(latest.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        return (
            <Animated.View style={[{ opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }, { marginBottom: 20 }]}>
                <LinearGradient colors={['#3730A3', '#4F46E5', '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
                    <View style={styles.heroDecorCircle1} />
                    <View style={styles.heroDecorCircle2} />
                    <View style={styles.heroTop}>
                        <View>
                            <Text style={styles.heroEyebrow}>Latest Reading</Text>
                            <Text style={styles.heroDate}>{readingDate} · {readingTime}</Text>
                            
                            {/* Hero Lineage Badge */}
                            {latest.source && latest.source !== 'manual' ? (
                                <View style={styles.heroSourceBadge}>
                                    <Watch size={10} color="#FFFFFF" style={{ marginRight: 4 }} />
                                    <Text style={styles.heroSourceBadgeText}>
                                        Synced: {latest.source === 'health_connect' ? 'Health Connect' : latest.source === 'healthkit' ? 'Apple Health' : latest.source}
                                    </Text>
                                </View>
                            ) : (
                                <View style={[styles.heroSourceBadge, { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]}>
                                    <Text style={styles.heroSourceBadgeText}>✍️ Manual Entry</Text>
                                </View>
                            )}
                        </View>
                        {!latest._id ? (
                            <View style={[styles.heroLiveBadge, { backgroundColor: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.3)', opacity: 0.8 }]}>
                                <Clock size={10} color="#FFFFFF" style={{ marginRight: 4 }} />
                                <Text style={styles.heroLiveText}>Pending Sync</Text>
                            </View>
                        ) : (
                            <View style={styles.heroLiveBadge}>
                                <View style={styles.heroLiveDot} />
                                <Text style={styles.heroLiveText}>Live</Text>
                            </View>
                        )}
                    </View>
                    <View style={styles.heroChipsRow}>
                        {METRIC_CHIPS.map(m => (
                            <View key={m.key} style={styles.heroChip}>
                                <m.icon size={11} color="rgba(255,255,255,0.65)" />
                                <Text style={styles.heroChipLabel}>{m.label}</Text>
                                <Text style={styles.heroChipValue}>{m.getValue(latest)}</Text>
                                <Text style={styles.heroChipUnit}>{m.unit}</Text>
                            </View>
                        ))}
                    </View>
                </LinearGradient>
            </Animated.View>
        );
    };

    // ─── Render: Metric Tabs (with icons) ────────────────────────
    const renderMetricTabs = () => (
        <View style={styles.metricTabsWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricTabsContent}>
                {CHART_DEFS.map(m => {
                    const isActive = activeMetricId === m.id;
                    return (
                        <Pressable
                            key={m.id}
                            onPress={() => handleMetricChange(m.id)}
                            style={[styles.metricTab, isActive && { backgroundColor: m.accent, borderColor: m.accent, shadowColor: m.accent }]}
                        >
                            <m.icon size={14} color={isActive ? '#FFFFFF' : m.accent} />
                            <Text style={[styles.metricTabText, isActive && styles.metricTabTextActive]}>{m.title}</Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );

    // ─── Render: Summary Stats ───────────────────────────────────
    const renderSummaryStats = () => {
        const stats = getStats(activeMetricId);
        const def = CHART_DEFS.find(c => c.id === activeMetricId);
        if (!stats || !def) return null;
        return (
            <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsScroll} style={{ opacity: fadeAnim, marginBottom: 20 }}>
                <View style={[styles.statCard, { borderTopColor: def.accent }]}>
                    <Text style={[styles.statAccentLabel, { color: def.accent }]}>Average</Text>
                    <View style={styles.statValueRow}>
                        <Text style={styles.statValue}>{stats.avg}</Text>
                        <Text style={styles.statUnit}>{stats.unit}</Text>
                    </View>
                    <View style={[styles.statStatusBadge, { backgroundColor: stats.statusColor + '18' }]}>
                        <Text style={[styles.statStatus, { color: stats.statusColor }]}>{stats.status}</Text>
                    </View>
                </View>
                <View style={[styles.statCard, { borderTopColor: '#10B981' }]}>
                    <Text style={[styles.statAccentLabel, { color: '#10B981' }]}>Lowest</Text>
                    <View style={styles.statValueRow}>
                        <Text style={styles.statValue}>{stats.min}</Text>
                        <Text style={styles.statUnit}>{stats.unit}</Text>
                    </View>
                    <Text style={styles.statSub}>min recorded</Text>
                </View>
                <View style={[styles.statCard, { borderTopColor: '#F59E0B' }]}>
                    <Text style={[styles.statAccentLabel, { color: '#F59E0B' }]}>Highest</Text>
                    <View style={styles.statValueRow}>
                        <Text style={styles.statValue}>{stats.max}</Text>
                        <Text style={styles.statUnit}>{stats.unit}</Text>
                    </View>
                    <Text style={styles.statSub}>max recorded</Text>
                </View>
                {rangeMode !== 'single' && (
                    <View style={[styles.statCard, { borderTopColor: '#8B5CF6' }]}>
                        <Text style={[styles.statAccentLabel, { color: '#8B5CF6' }]}>Readings/Day</Text>
                        <View style={styles.statValueRow}>
                            <Text style={styles.statValue}>{stats.readingsPerDay}</Text>
                        </View>
                        <Text style={styles.statSub}>on average</Text>
                    </View>
                )}
            </Animated.ScrollView>
        );
    };

    // ─── Render: Fullscreen Chart (unchanged logic) ──────────────
    const renderFullscreenChart = () => {
        const def = CHART_DEFS.find(c => c.id === activeMetricId);
        if (!def || !vitals.length) return null;
        const mainData = vitals.map(v => Number(def.extract(v)) || 0).reverse();
        const labels = vitals.map(v => {
            const d = new Date(v.date);
            return rangeMode === 'single'
                ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }).reverse();
        const rangeData = rangeMode === 'range' ? getRangeData(def.id) : [];
        const chartConfig = {
            ...makeChartConfig(def.accent),
            fillShadowGradient: def.accent, fillShadowGradientOpacity: 0.2,
            fillShadowGradientFrom: def.accent, fillShadowGradientTo: '#FFFFFF',
            useShadowColorFromDataset: false,
        };
        const w = windowW - 40;
        const h = windowH - 80;
        return (
            <Modal visible={isFullscreen || isLandscape} supportedOrientations={['portrait', 'landscape']} animationType="fade" onRequestClose={() => setIsFullscreen(false)}>
                <View style={[styles.landscapeContainer, { width: windowW, height: windowH }]}>
                    <Pressable style={styles.closeFullscreenBtn} onPress={() => setIsFullscreen(false)} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
                        <X size={26} color="#1E293B" strokeWidth={2.5} />
                    </Pressable>
                    <View style={styles.landscapeHeader}>
                        <Text style={styles.landscapeTitle}>{def.title}</Text>
                        <Text style={styles.landscapeSubtitle}>
                            {rangeMode === 'range' ? 'Trend Analysis' : "Today's Readings"} ({vitals.length} logs)
                        </Text>
                    </View>
                    <ChartErrorBoundary>
                        <View style={{ width: w, height: h, alignSelf: 'center' }}>
                            <LineChart
                                data={{
                                    labels: rangeMode === 'range'
                                        ? rangeData.map((d, i) => i % Math.ceil(rangeData.length / 12) === 0 ? d.x : '')
                                        : labels.map((l, i) => i % Math.ceil(labels.length / 10) === 0 ? l : ''),
                                    datasets: rangeMode === 'range' ? [
                                        { data: rangeData.map(d => d.max || 0), color: () => 'transparent', strokeWidth: 0, withDots: false },
                                        { data: rangeData.map(d => d.min || 0), color: () => 'transparent', strokeWidth: 0, withDots: false },
                                        { data: rangeData.map(d => d.y || 0), color: () => def.accent, strokeWidth: 4 },
                                    ] : [
                                        { data: mainData, color: () => def.accent, strokeWidth: 3 },
                                        ...(def.extractAlt ? [{ data: vitals.map(v => Number(def.extractAlt(v)) || 0).reverse(), color: () => '#94A3B840', strokeWidth: 2, withDots: false }] : [])
                                    ],
                                    legend: rangeMode === 'range' ? ['Max', 'Min', 'Avg'] : (def.legend || []),
                                }}
                                width={w} height={h} chartConfig={chartConfig}
                                bezier={rangeMode === 'range' ? rangeData.length > 1 : mainData.length > 1}
                                style={styles.landscapeChart}
                                onDataPointClick={({ x, y, value, index }) => showTooltip(x, y, value, rangeMode === 'range' ? rangeData[index].x : labels[index])}
                                decorator={() => renderChartInteraction(def)}
                            />
                            {tooltipPos.visible && <Pressable style={[StyleSheet.absoluteFill, { zIndex: 50 }]} onPress={hideTooltip} />}
                            {rangeMode === 'range' && (
                                <Svg position="absolute" top={0} left={0} width={w} height={h} pointerEvents="none">
                                    <Path
                                        d={(() => {
                                            const rd = rangeData;
                                            if (rd.length < 2) return '';
                                            const xs = w / (rd.length - 1);
                                            const allV = rd.flatMap(d => [d.min, d.max]).filter(v => v > 0);
                                            const minV = Math.min(...allV) * 0.9;
                                            const maxV = Math.max(...allV) * 1.1;
                                            const r = maxV - minV;
                                            const gy = (v) => h - ((v - minV) / (r || 1)) * h;
                                            let pd = `M 0 ${gy(rd[0].max)}`;
                                            for (let i = 1; i < rd.length; i++) pd += ` L ${i * xs} ${gy(rd[i].max)}`;
                                            for (let i = rd.length - 1; i >= 0; i--) pd += ` L ${i * xs} ${gy(rd[i].min)}`;
                                            return pd + ' Z';
                                        })()}
                                        fill={def.accent} fillOpacity={0.1}
                                    />
                                </Svg>
                            )}
                        </View>
                    </ChartErrorBoundary>
                </View>
            </Modal>
        );
    };

    // ─── Render: Chart Interaction Decorator (unchanged) ─────────
    const renderChartInteraction = (def) => {
        const { x, y, visible, value, label } = tooltipPos;
        if (!visible) return null;
        return (
            <Animated.View style={{ opacity: tooltipFade, pointerEvents: 'none', position: 'absolute' }}>
                <Svg height="240" width={SCREEN_W - 80} style={{ position: 'absolute' }}>
                    <Line x1={x} y1={0} x2={x} y2={240} stroke={def.accent} strokeWidth="1.5" strokeDasharray="5, 5" />
                    <Circle cx={x} cy={y} r={6} fill="#FFFFFF" stroke={def.accent} strokeWidth="3" />
                </Svg>
                <View style={[styles.tooltipContainer, { top: y - 65, left: x - 50 }]}>
                    <Text style={styles.tooltipLabel}>{label}</Text>
                    <Text style={[styles.tooltipValue, { color: def.accent }]}>{value} <Text style={styles.tooltipUnit}>{def.unit}</Text></Text>
                    <View style={styles.tooltipArrow} />
                </View>
            </Animated.View>
        );
    };

    // ─── Render: Chart Card ──────────────────────────────────────
    const renderChartCard = (def) => {
        if (!def || !vitals.length) return null;
        const mainData = vitals.map(v => Number(def.extract(v)) || 0).reverse();
        const labels = vitals.map(v => {
            const d = new Date(v.date);
            return rangeMode === 'single'
                ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }).reverse();
        const rangeData = rangeMode === 'range' ? getRangeData(def.id) : [];
        const hasData = mainData.some(v => v > 0) || rangeData.some(d => (d.y || 0) > 0);
        const chartConfig = {
            ...makeChartConfig(def.accent),
            fillShadowGradient: def.accent, fillShadowGradientOpacity: 0.2,
            fillShadowGradientFrom: def.accent, fillShadowGradientTo: '#FFFFFF',
            useShadowColorFromDataset: false,
        };

        return (
            <Animated.View style={[styles.chartCard, { borderTopColor: def.accent, opacity: Animated.multiply(staggerAnims[2], dataFadeAnim), transform: [{ translateY: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
                <View style={styles.chartTitleRow}>
                    <View style={[styles.chartIconPill, { backgroundColor: def.accent + '18' }]}>
                        <def.icon size={20} color={def.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.chartTitle}>{def.title}</Text>
                        <Text style={styles.chartSubtitle}>{rangeMode === 'single' ? "Today's readings" : 'Trend analysis'}</Text>
                    </View>
                    <Pressable onPress={() => setIsFullscreen(true)} style={styles.expandBtn}>
                        <Maximize2 size={18} color="#64748B" />
                    </Pressable>
                </View>

                {rangeMode === 'range' && rangeData.length > 0 ? (
                    <View style={styles.victoryContainer}>
                        <View style={styles.legendRow}>
                            <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: def.accent }]} /><Text style={styles.legendText}>Avg</Text></View>
                            <View style={styles.legendItem}><View style={[styles.legendBox, { borderColor: def.accent }]} /><Text style={styles.legendText}>Range</Text></View>
                        </View>
                        <ChartErrorBoundary>
                            <View>
                                <LineChart
                                    data={{
                                        labels: rangeData.map((d, i) => i % Math.ceil(rangeData.length / 6) === 0 ? d.x : ''),
                                        datasets: [
                                            { data: rangeData.map(d => d.max || 0), color: () => 'transparent', strokeWidth: 0, withDots: false },
                                            { data: rangeData.map(d => d.min || 0), color: () => 'transparent', strokeWidth: 0, withDots: false },
                                            { data: rangeData.map(d => d.y || 0), color: () => def.accent, strokeWidth: 3 },
                                        ],
                                    }}
                                    width={SCREEN_W - 80} height={240} chartConfig={chartConfig}
                                    bezier={rangeData.length > 1} style={styles.chart}
                                    onDataPointClick={({ x, y, value, index }) => showTooltip(x, y, value, rangeData[index].x)}
                                    decorator={() => renderChartInteraction(def)}
                                />
                                {tooltipPos.visible && <Pressable style={StyleSheet.absoluteFill} onPress={hideTooltip} />}
                            </View>
                        </ChartErrorBoundary>
                        <View style={styles.quickRangeRow}>
                            {[7, 14, 30].map(d => (
                                <Pressable key={d} style={styles.quickRangeBtn} onPress={() => setQuickRange(d)}>
                                    <Text style={styles.quickRangeText}>{d} days</Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                ) : hasData ? (
                    <ChartErrorBoundary>
                        <View>
                            <LineChart
                                data={{
                                    labels: labels.map((l, i) => i % Math.ceil(labels.length / 5) === 0 ? l : ''),
                                    datasets: [
                                        { data: mainData, color: () => def.accent, strokeWidth: 3 },
                                        ...(def.extractAlt ? [{ data: vitals.map(v => Number(def.extractAlt(v)) || 0).reverse(), color: () => '#94A3B840', strokeWidth: 2, withDots: false }] : [])
                                    ]
                                }}
                                width={SCREEN_W - 80} height={220} chartConfig={chartConfig}
                                bezier={mainData.length > 1} style={styles.chart}
                                onDataPointClick={({ x, y, value, index }) => showTooltip(x, y, value, labels[index])}
                                decorator={() => renderChartInteraction(def)}
                            />
                            {tooltipPos.visible && <Pressable style={StyleSheet.absoluteFill} onPress={hideTooltip} />}
                        </View>
                    </ChartErrorBoundary>
                ) : (
                    <View style={styles.emptyChartBox}>
                        <Text style={styles.emptyChartText}>No records for this period</Text>
                    </View>
                )}
            </Animated.View>
        );
    };

    // ─── Render: AI Health Coach Card ────────────────────────────
    const renderAIHealthCoach = (def) => {
        if (!def || !vitals.length) return null;
        
        const latest = vitals[0];
        const val = def.extract(latest);
        const text = def.insight ? def.insight(val) : 'Stable readings recorded.';
        
        // Let's get trend details if they exist in trendInsights
        let trendDetail = null;
        if (trendInsights) {
            if (def.id === 'heart_rate') trendDetail = trendInsights.heartRate;
            else if (def.id === 'blood_pressure') trendDetail = trendInsights.bloodPressure;
            else if (def.id === 'oxygen_saturation') trendDetail = trendInsights.oxygen;
        }

        const themes = {
            stable: { bg: '#F0FDF4', border: '#DCFCE7', text: '#15803D' },
            improving: { bg: '#F0FDF4', border: '#DCFCE7', text: '#15803D' },
            warning: { bg: '#FFFBEB', border: '#FEF3C7', text: '#B45309' },
            normal: { bg: '#F0FDF4', border: '#DCFCE7', text: '#15803D' },
            dips: { bg: '#FEF2F2', border: '#FEE2E2', text: '#B91C1C' }
        };
        const getTheme = (key) => themes[key] || themes.stable;
        
        const adherenceDetails = usePatientStore.getState().adherenceDetails;
        const isAdherenceHigh = adherenceDetails?.rate >= 80 || adherenceDetails?.streak >= 3;

        return (
            <Animated.View style={[{ opacity: fadeAnim }, styles.coachCard]}>
                <View style={styles.coachHeader}>
                    <View style={styles.coachTitleGroup}>
                        <View style={styles.coachIconBubble}>
                            <Sparkles size={18} color="#6366F1" fill="#6366F1" />
                        </View>
                        <Text style={styles.coachTitle}>AI Health Coach</Text>
                    </View>
                    {trendDetail && (
                        <View style={[styles.coachStatusBadge, { backgroundColor: getTheme(trendDetail.theme).bg, borderColor: getTheme(trendDetail.theme).border }]}>
                            <Text style={[styles.coachStatusText, { color: getTheme(trendDetail.theme).text }]}>
                                {trendDetail.label}
                            </Text>
                        </View>
                    )}
                </View>

                <View style={styles.coachBody}>
                    <Text style={styles.coachInsightText}>{text}</Text>
                    
                    {trendDetail && trendDetail.confidence && (
                        <Text style={styles.coachSubtext}>
                            7-Day Trend: {trendDetail.label.toLowerCase()} • {trendDetail.confidence} confidence ({trendDetail.readings} readings)
                        </Text>
                    )}

                    <View style={styles.coachDivider} />

                    <View style={styles.coachAdherenceRow}>
                        <CheckCircle2 size={13} color="#6366F1" style={{ marginRight: 6 }} />
                        <Text style={styles.coachAdherenceText}>
                            {isAdherenceHigh
                                ? "Excellent medication adherence matches your stable vital trends."
                                : "Consistency in your meds can help improve your vital trends."}
                        </Text>
                    </View>
                </View>
            </Animated.View>
        );
    };

    // ─── Render: Skeleton ────────────────────────────────────────
    const renderSkeleton = () => (
        <View style={{ gap: 20 }}>
            <SkeletonItem width="100%" height={140} borderRadius={24} />
            <SkeletonItem width="100%" height={110} borderRadius={24} />
            <SkeletonItem width="60%" height={28} borderRadius={10} />
            <SkeletonItem width="100%" height={260} borderRadius={24} />
            <SkeletonItem width="100%" height={80} borderRadius={20} />
            <SkeletonItem width="100%" height={80} borderRadius={20} />
        </View>
    );

    // ─── Render: Error Banner ────────────────────────────────────
    const renderErrorBanner = () => {
        if (!error && !isOffline) return null;
        return (
            <View style={[styles.errorBanner, isOffline && { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                {isOffline ? <Clock size={18} color="#DC2626" /> : <AlertTriangle size={18} color="#DC2626" />}
                <Text style={styles.errorText}>
                    {isOffline ? 'Offline Mode Active. Changes will sync automatically when connected.' : error}
                </Text>
                {!isOffline && error && (
                    <Pressable style={styles.retryBtn} onPress={fetchAllData}>
                        <RefreshCw size={13} color="#FFF" />
                        <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                )}
            </View>
        );
    };

    // ─── Main Render ─────────────────────────────────────────────
    const def = CHART_DEFS.find(c => c.id === activeMetricId);

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            {renderFullscreenChart()}
            <View style={[styles.container, { backgroundColor: def ? def.bgTint : '#F8FAFC' }]}>
                {renderHeader()}

                <Animated.ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
                    scrollEventThrottle={16}
                >
                    {initialLoading ? renderSkeleton() : (
                        <>

                            {/* ── Hero Summary Card ───────────── */}
                            {renderHeroCard()}

                            {/* ── Log Vitals Card ─────────────── */}
                            <Animated.View style={[styles.chartCard, { borderTopColor: '#6366F1', opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
                                <Pressable style={styles.logToggleRow} onPress={() => { setIsLogging(!isLogging); setFormError(null); }}>
                                    <View style={styles.logTitleGroup}>
                                        <View style={styles.logIconBubble}>
                                            <Zap size={14} color="#6366F1" />
                                        </View>
                                        <Text style={styles.chartTitle}>Log Vitals</Text>
                                    </View>
                                    <LinearGradient
                                        colors={isLogging ? ['#FEE2E2', '#FEE2E2'] : ['#6366F1', '#818CF8']}
                                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                        style={styles.addBadge}
                                    >
                                        <Plus size={13} color={isLogging ? '#EF4444' : '#FFF'} strokeWidth={3} />
                                        <Text style={[styles.addBadgeTxt, isLogging && styles.addBadgeCancelTxt]}>
                                            {isLogging ? 'Cancel' : 'Add Entry'}
                                        </Text>
                                    </LinearGradient>
                                </Pressable>

                                {isLogging && (
                                    <View style={styles.formArea}>
                                        {formError && (
                                            <View style={[styles.errorBanner, { marginBottom: 12 }]}>
                                                <AlertTriangle size={15} color="#DC2626" />
                                                <Text style={styles.errorText}>{formError}</Text>
                                            </View>
                                        )}

                                        <View style={styles.formDivider} />

                                        <View style={styles.formRow}>
                                            <View style={styles.formGroup}>
                                                <SmartInput label="Heart Rate (bpm)" keyboardType="numeric" placeholder="72"
                                                    value={formValues.heart_rate} onChangeText={t => setFormValues(p => ({ ...p, heart_rate: t }))} />
                                            </View>
                                            <View style={styles.formGroup}>
                                                <SmartInput label="O₂ Saturation (%)" keyboardType="numeric" placeholder="98"
                                                    value={formValues.oxygen_saturation} onChangeText={t => setFormValues(p => ({ ...p, oxygen_saturation: t }))} />
                                            </View>
                                        </View>

                                        <Text style={styles.formSectionLabel}>Blood Pressure (mmHg)</Text>
                                        <View style={styles.formRow}>
                                            <View style={styles.formGroup}>
                                                <SmartInput keyboardType="numeric" placeholder="Systolic (120)"
                                                    value={formValues.systolic} onChangeText={t => setFormValues(p => ({ ...p, systolic: t }))} />
                                            </View>
                                            <View style={styles.formGroup}>
                                                <SmartInput keyboardType="numeric" placeholder="Diastolic (80)"
                                                    value={formValues.diastolic} onChangeText={t => setFormValues(p => ({ ...p, diastolic: t }))} />
                                            </View>
                                        </View>

                                        <SmartInput label="Hydration (%)" keyboardType="numeric" placeholder="65"
                                            value={formValues.hydration} onChangeText={t => setFormValues(p => ({ ...p, hydration: t }))} />

                                        <Pressable style={styles.submitBtn} onPress={handleLogVitals}>
                                            <LinearGradient colors={['#6366F1', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGradient}>
                                                {loading
                                                    ? <ActivityIndicator color="#FFF" />
                                                    : <><Zap size={15} color="#FFF" /><Text style={styles.submitTxt}>Save Vitals</Text></>
                                                }
                                            </LinearGradient>
                                        </Pressable>
                                    </View>
                                )}
                            </Animated.View>

                            {/* ── Date Picker ─────────────────── */}
                            <Animated.View style={[styles.dateSection, { opacity: staggerAnims[1], transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
                                <View style={styles.dateToggle}>
                                    {['single', 'range'].map(m => (
                                        <Pressable key={m} style={[styles.toggleBtn, rangeMode === m && styles.toggleBtnActive]} onPress={() => setRangeMode(m)}>
                                            <Calendar size={13} color={rangeMode === m ? '#6366F1' : '#94A3B8'} />
                                            <Text style={[styles.toggleTxt, rangeMode === m && styles.toggleTxtActive]}>
                                                {m === 'single' ? 'Single Date' : 'Date Range'}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>

                                <View style={styles.dateRow}>
                                    <Pressable style={styles.dateArrow} onPress={() => adjustDate(setStartDate, -1)}>
                                        <ChevronLeft size={18} color="#64748B" />
                                    </Pressable>
                                    <Pressable style={({ pressed }) => [styles.dateBox, { opacity: pressed ? 0.6 : 1 }]} onPress={() => setShowStartPicker(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                        <Text style={styles.dateLabel}>{rangeMode === 'single' ? 'Date' : 'Start'}</Text>
                                        <Text style={styles.dateValue}>{formatDate(startDate)}</Text>
                                    </Pressable>
                                    <Pressable style={styles.dateArrow} onPress={() => adjustDate(setStartDate, 1)}>
                                        <ChevronRight size={18} color="#64748B" />
                                    </Pressable>
                                </View>

                                {showStartPicker && (
                                    <DateTimePicker value={startDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        onChange={(e, d) => { setShowStartPicker(false); if (d) setStartDate(d); }} />
                                )}

                                {rangeMode === 'range' && (
                                    <>
                                        <View style={styles.dateRow}>
                                            <Pressable style={styles.dateArrow} onPress={() => adjustDate(setEndDate, -1)}>
                                                <ChevronLeft size={18} color="#64748B" />
                                            </Pressable>
                                            <Pressable style={({ pressed }) => [styles.dateBox, { opacity: pressed ? 0.6 : 1 }]} onPress={() => setShowEndPicker(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                                <Text style={styles.dateLabel}>End</Text>
                                                <Text style={styles.dateValue}>{formatDate(endDate)}</Text>
                                            </Pressable>
                                            <Pressable style={styles.dateArrow} onPress={() => adjustDate(setEndDate, 1)}>
                                                <ChevronRight size={18} color="#64748B" />
                                            </Pressable>
                                        </View>
                                        {showEndPicker && (
                                            <DateTimePicker value={endDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                                onChange={(e, d) => { setShowEndPicker(false); if (d) setEndDate(d); }} />
                                        )}
                                    </>
                                )}
                            </Animated.View>

                            {/* ── Metric Tabs ─────────────────── */}
                            {vitals.length > 0 && renderMetricTabs()}

                            {/* ── Error / Offline ─────────────── */}
                            {renderErrorBanner()}

                            {/* ── Empty State ─────────────────── */}
                            {!loading && !error && vitals.length === 0 && (
                                <View style={styles.emptyState}>
                                    <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.emptyIconCircle}>
                                        <Heart size={34} color="#6366F1" />
                                    </LinearGradient>
                                    <Text style={styles.emptyTitle}>No vitals recorded</Text>
                                    <Text style={styles.emptySub}>Log your first entry above to start tracking your health trends.</Text>
                                </View>
                            )}

                            {/* ── Summary Stats ───────────────── */}
                            {!loading && vitals.length > 0 && renderSummaryStats()}

                            {/* ── Chart ───────────────────────── */}
                            {!loading && vitals.length > 0 && renderChartCard(def)}

                            {/* ── AI Health Coach ──────────────── */}
                            {renderAIHealthCoach(def)}

                            {/* ── History List ────────────────── */}
                            <Animated.View style={[{ opacity: staggerAnims[3], transform: [{ translateY: staggerAnims[3].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }, { marginTop: 8 }]}>
                                <View style={styles.historySectionHeader}>
                                    <Text style={styles.historyTitle}>Recent Logs</Text>
                                    <View style={styles.historyDateControl}>
                                        <Pressable style={styles.historyArrow} onPress={() => adjustDate(setHistoryDate, -1)}>
                                            <ChevronLeft size={15} color="#64748B" />
                                        </Pressable>
                                        <Pressable style={({ pressed }) => [styles.historyDateBox, { opacity: pressed ? 0.5 : 1 }]} onPress={() => setShowHistoryPicker(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                            <Text style={styles.historyDateValue}>{formatDate(historyDate)}</Text>
                                        </Pressable>
                                        <Pressable style={styles.historyArrow} onPress={() => adjustDate(setHistoryDate, 1)}>
                                            <ChevronRight size={15} color="#64748B" />
                                        </Pressable>
                                    </View>
                                </View>

                                {showHistoryPicker && (
                                    <DateTimePicker value={historyDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        onChange={(e, d) => { setShowHistoryPicker(false); if (d) setHistoryDate(d); }} />
                                )}

                                {historyLogs.length === 0 ? (
                                    <View style={styles.historyEmpty}>
                                        <Text style={styles.historyEmptyText}>No logs recorded on this date.</Text>
                                    </View>
                                ) : (
                                    <View style={styles.timelineContainer}>
                                        <View style={styles.timelineLine} />
                                        {historyLogs.slice().reverse().map((log, idx) => {
                                            const isLast = idx === historyLogs.length - 1;
                                            return (
                                                <View key={log._id || idx} style={[styles.timelineItem, isLast && { marginBottom: 0 }]}>
                                                    <View style={styles.timelineDotOuter}>
                                                        <View style={styles.timelineDotInner} />
                                                    </View>
                                                    
                                                    <View style={styles.timelineContent}>
                                                        <View style={styles.timelineHeader}>
                                                            <View style={styles.timelineTimeRow}>
                                                                <Text style={styles.timelineTime}>
                                                                    {new Date(log.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }).toLowerCase()}
                                                                </Text>
                                                                {log.source && log.source !== 'manual' ? (
                                                                    <Text style={styles.timelineSource}>
                                                                        via {log.source === 'health_connect' ? 'Health Connect' : log.source === 'healthkit' ? 'Apple Health' : log.source}
                                                                    </Text>
                                                                ) : (
                                                                    <Text style={styles.timelineSource}>via Manual</Text>
                                                                )}
                                                            </View>
                                                            <Text style={styles.timelineIndex}>#{historyLogs.length - idx}</Text>
                                                        </View>

                                                        <View style={styles.timelineMetricsRow}>
                                                            {METRIC_CHIPS.map(m => (
                                                                <View key={m.key} style={styles.timelineMetricBadge}>
                                                                    <m.icon size={11} color={m.color} style={{ marginRight: 4 }} />
                                                                    <Text style={styles.timelineMetricLabel}>{m.label}</Text>
                                                                    <Text style={[styles.timelineMetricValue, { color: m.color }]}>
                                                                        {m.getValue(log)}
                                                                        <Text style={styles.timelineMetricUnit}> {m.unit}</Text>
                                                                    </Text>
                                                                </View>
                                                            ))}
                                                        </View>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                )}
                            </Animated.View>
                        </>
                    )}
                </Animated.ScrollView>
            </View>
        </KeyboardAvoidingView>
    );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 110 : 90, paddingBottom: layout.TAB_BAR_CLEARANCE + 20 },

    /* Glass Header */
    glassHeader: {
        position: 'absolute', top: 0, left: 0, right: 0,
        height: Platform.OS === 'ios' ? 100 : 80,
        zIndex: 100, justifyContent: 'flex-end', paddingBottom: 10,
    },
    headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
    headerBackBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    headerTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', letterSpacing: -0.3 },
    headerBorderLine: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, backgroundColor: '#E2E8F0' },

    /* Hero Card */
    heroCard: { borderRadius: 28, padding: 24, overflow: 'hidden' },
    heroDecorCircle1: { position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.07)' },
    heroDecorCircle2: { position: 'absolute', bottom: -20, left: -20, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.05)' },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    heroEyebrow: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 },
    heroDate: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
    heroLiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    heroLiveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#34D399' },
    heroLiveText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
    heroChipsRow: { flexDirection: 'row', gap: 8 },
    heroChip: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 12, alignItems: 'center', gap: 3 },
    heroChipLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5 },
    heroChipValue: { fontSize: 16, fontWeight: '900', color: '#FFFFFF' },
    heroChipUnit: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },

    /* Metric Tabs */
    metricTabsWrapper: { marginBottom: 20 },
    metricTabsContent: { paddingHorizontal: 2, gap: 10, paddingBottom: 4 },
    metricTab: {
        flexDirection: 'row', alignItems: 'center', gap: 7,
        paddingHorizontal: 18, paddingVertical: 11, borderRadius: 30,
        backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E2E8F0',
        shadowColor: 'transparent', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 0,
    },
    metricTabText: { fontSize: 14, fontWeight: '800', color: '#475569' },
    metricTabTextActive: { color: '#FFFFFF' },

    /* Stats */
    statsScroll: { paddingHorizontal: 2, paddingBottom: 4, gap: 12 },
    statCard: {
        width: 160, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18,
        borderTopWidth: 3, borderTopColor: '#6366F1',
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4,
    },
    statAccentLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
    statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 10 },
    statValue: { fontSize: 30, fontWeight: '900', color: '#0F172A', letterSpacing: -1 },
    statUnit: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
    statStatusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
    statStatus: { fontSize: 12, fontWeight: '800' },
    statSub: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },

    /* Chart Card */
    chartCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 20,
        borderWidth: 1, borderColor: '#F1F5F9', borderTopWidth: 3, borderTopColor: '#6366F1',
        shadowColor: '#6366F1', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 20, elevation: 6,
    },
    chartTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    chartIconPill: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    chartTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
    chartSubtitle: { fontSize: 12, color: '#94A3B8', fontWeight: '600', marginTop: 1 },
    chart: { borderRadius: 16, marginLeft: -10 },
    expandBtn: { padding: 8, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#F1F5F9' },

    emptyChartBox: { height: 130, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', borderStyle: 'dashed' },
    emptyChartText: { color: '#94A3B8', fontStyle: 'italic', fontSize: 14, fontWeight: '500' },

    /* Date Section */
    dateSection: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, marginBottom: 20,
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 3,
    },
    dateToggle: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 16, padding: 4, marginBottom: 20 },
    toggleBtn: { flex: 1, flexDirection: 'row', gap: 7, paddingVertical: 11, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    toggleBtnActive: { backgroundColor: '#FFFFFF', shadowColor: '#6366F1', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
    toggleTxt: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
    toggleTxtActive: { color: '#0F172A', fontWeight: '900' },
    dateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    dateArrow: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    dateBox: { flex: 1, marginHorizontal: 12, backgroundColor: '#F9FAFB', borderRadius: 16, paddingVertical: 13, paddingHorizontal: 16, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
    dateLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 3, letterSpacing: 0.8 },
    dateValue: { fontSize: 15, fontWeight: '900', color: '#0F172A' },

    /* Intelligence Card */
    insightCard: {
        borderRadius: 20, padding: 18, marginBottom: 20, flexDirection: 'row', alignItems: 'center',
        gap: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9',
    },
    insightIconBubble: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    insightBody: { flex: 1 },
    insightEyebrow: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
    insightText: { fontSize: 14, fontWeight: '700', color: '#1E293B', lineHeight: 20 },

    /* Log Form */
    logToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    logTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logIconBubble: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
    addBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
    addBadgeTxt: { color: '#FFF', fontSize: 13, fontWeight: '800' },
    addBadgeCancelTxt: { color: '#EF4444' },
    formArea: { marginTop: 18 },
    formDivider: { height: 1, backgroundColor: '#F1F5F9', marginBottom: 18 },
    formRow: { flexDirection: 'row', gap: 14, marginBottom: 4 },
    formGroup: { flex: 1, marginBottom: 4 },
    formSectionLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginTop: 10 },
    submitBtn: { marginTop: 20, borderRadius: 16, overflow: 'hidden', shadowColor: '#6366F1', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
    submitGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
    submitTxt: { color: '#FFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },

    /* Error Banner */
    errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 14, padding: 14, gap: 10, marginBottom: 16 },
    errorText: { flex: 1, color: '#991B1B', fontSize: 13, fontWeight: '600', lineHeight: 18 },
    retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#DC2626', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
    retryText: { color: '#FFF', fontSize: 12, fontWeight: '700' },

    /* Empty State */
    emptyState: { alignItems: 'center', paddingVertical: 24 },
    emptyIconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    emptyTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800' },
    emptySub: { color: '#64748B', fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },

    /* History Section */
    historySectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    historyTitle: { fontSize: 19, fontWeight: '900', color: '#0F172A' },
    historyDateControl: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 14, padding: 4, borderWidth: 1, borderColor: '#F1F5F9' },
    historyArrow: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
    historyDateBox: { paddingHorizontal: 10, paddingVertical: 3 },
    historyDateValue: { fontSize: 12, fontWeight: '700', color: '#334155' },
    historyEmpty: { alignItems: 'center', paddingVertical: 28, gap: 10 },
    historyEmptyText: { color: '#94A3B8', fontSize: 14, fontStyle: 'italic' },

    /* History Card */
    historyCard: {
        backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 14,
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3,
    },
    historyCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
    historyTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    historyTimeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#6366F1' },
    historyTime: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
    historyEntryBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    historyEntryNum: { fontSize: 12, fontWeight: '800', color: '#6366F1' },
    historyChipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    historyChip: { flex: 1, minWidth: '45%', borderRadius: 14, padding: 10, borderWidth: 1 },
    historyChipTop: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
    historyChipLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
    historyChipValue: { fontSize: 17, fontWeight: '900' },
    historyChipUnit: { fontSize: 11, fontWeight: '600', opacity: 0.7 },

    /* Legend & Range */
    victoryContainer: { marginTop: 8 },
    legendRow: { flexDirection: 'row', gap: 16, marginBottom: 16, paddingHorizontal: 4 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    legendLine: { width: 18, height: 3, borderRadius: 2 },
    legendBox: { width: 13, height: 13, borderRadius: 4, borderWidth: 1.5 },
    legendText: { fontSize: 13, fontWeight: '700', color: '#475569' },
    quickRangeRow: { flexDirection: 'row', gap: 8, marginTop: 14, justifyContent: 'flex-end' },
    quickRangeBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
    quickRangeText: { fontSize: 12, fontWeight: '800', color: '#475569' },

    /* Tooltip */
    tooltipContainer: { position: 'absolute', width: 100, backgroundColor: '#0F172A', borderRadius: 12, padding: 8, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 10, zIndex: 1000 },
    tooltipLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', marginBottom: 2 },
    tooltipValue: { fontSize: 13, fontWeight: '900' },
    tooltipUnit: { fontSize: 10, fontWeight: '700', color: '#94A3B8' },
    tooltipArrow: { position: 'absolute', bottom: -6, left: 45, width: 12, height: 12, backgroundColor: '#0F172A', transform: [{ rotate: '45deg' }] },

    /* Landscape / Fullscreen */
    landscapeContainer: { flex: 1, backgroundColor: '#FFFFFF', padding: 16, justifyContent: 'center' },
    landscapeHeader: { position: 'absolute', top: 20, left: 24, zIndex: 90 },
    landscapeTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A' },
    landscapeSubtitle: { fontSize: 12, fontWeight: '700', color: '#64748B', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
    landscapeChart: { borderRadius: 20, alignSelf: 'center' },
    closeFullscreenBtn: { position: 'absolute', top: 20, right: 20, zIndex: 1000, backgroundColor: '#F1F5F9', width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 6 },

    /* AI Health Coach */
    coachCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 18,
        elevation: 4,
        overflow: 'hidden',
    },
    coachHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    coachTitleGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    coachIconBubble: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: '#EEF2FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    coachTitle: {
        fontSize: 15,
        fontWeight: '900',
        color: '#0F172A',
    },
    coachStatusBadge: {
        borderWidth: 1,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    coachStatusText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    coachBody: {
        marginTop: 4,
    },
    coachInsightText: {
        fontSize: 14,
        fontWeight: '800',
        color: '#1E293B',
        lineHeight: 20,
    },
    coachSubtext: {
        fontSize: 11,
        color: '#94A3B8',
        fontWeight: '600',
        marginTop: 6,
    },
    coachDivider: {
        height: 1,
        backgroundColor: '#F1F5F9',
        marginVertical: 14,
    },
    coachAdherenceRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    coachAdherenceText: {
        fontSize: 12,
        color: '#4F46E5',
        fontWeight: '700',
        flex: 1,
    },

    /* Timeline Journals */
    timelineContainer: {
        paddingLeft: 16,
        position: 'relative',
        marginTop: 8,
    },
    timelineLine: {
        position: 'absolute',
        left: 4,
        top: 12,
        bottom: 12,
        width: 2,
        backgroundColor: '#E2E8F0',
    },
    timelineItem: {
        flexDirection: 'row',
        position: 'relative',
        marginBottom: 16,
    },
    timelineDotOuter: {
        position: 'absolute',
        left: -17,
        top: 14,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#EEF2FF',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    timelineDotInner: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#6366F1',
    },
    timelineContent: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 14,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
    },
    timelineHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    timelineTimeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    timelineTime: {
        fontSize: 13,
        fontWeight: '800',
        color: '#0F172A',
    },
    timelineSource: {
        fontSize: 10,
        fontWeight: '700',
        color: '#94A3B8',
    },
    timelineIndex: {
        fontSize: 11,
        fontWeight: '800',
        color: '#6366F1',
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    timelineMetricsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    timelineMetricBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    timelineMetricLabel: {
        fontSize: 9,
        fontWeight: '700',
        color: '#64748B',
        marginRight: 4,
        textTransform: 'uppercase',
    },
    timelineMetricValue: {
        fontSize: 11,
        fontWeight: '800',
    },
    timelineMetricUnit: {
        fontSize: 9,
        fontWeight: '600',
        color: '#94A3B8',
    },
    sourceBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 },
    sourceBadgeText: { fontSize: 9, fontWeight: '800' },
    heroSourceBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.18)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 6 },
    heroSourceBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
});
