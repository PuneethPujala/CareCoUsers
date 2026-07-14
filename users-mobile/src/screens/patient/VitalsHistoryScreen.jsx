import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Platform, Pressable,
    ActivityIndicator, KeyboardAvoidingView, Dimensions, Animated,
    useWindowDimensions, Modal, DeviceEventEmitter, StatusBar
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart } from 'react-native-chart-kit';
import NetInfo from '@react-native-community/netinfo';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
    ChevronLeft, ChevronRight, Heart, Activity, Wind, Droplets,
    AlertTriangle, WifiOff, RefreshCw, Calendar, Clock, Sparkles,
    Maximize2, X, Plus, Zap, Watch, CheckCircle2, AlertCircle,
    TrendingUp, TrendingDown, Minus, BarChart3, PlusCircle,
    ChevronDown, ChevronUp
} from 'lucide-react-native';
import Svg, { Line, Path, Circle } from 'react-native-svg';
import axios from 'axios';
import api, { apiService } from '../../lib/api';
import { handleAxiosError } from '../../lib/axiosInstance';
import { colors, layout } from '../../theme';
import SmartInput from '../../components/ui/SmartInput';
import TabScreenTransition from '../../components/ui/TabScreenTransition';
import AnimatedCard from '../../components/ui/AnimatedCard';
import AnimatedCounter from '../../components/ui/AnimatedCounter';
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
    propsForDots: { r: '5', strokeWidth: '2.5', stroke: '#FFFFFF' },
    propsForBackgroundLines: { stroke: '#F1F5F9', strokeDasharray: '' },
    style: { borderRadius: 16 },
    paddingRight: 40,
});

const CHART_DEFS = [
    {
        id: 'heart_rate', title: 'Heart Rate', unit: 'bpm', yLabel: 'bpm',
        icon: Heart, accent: '#EF4444', bgTint: '#FFF5F5',
        extract: (v) => v.heart_rate || 0,
        normalRange: [60, 100],
        insight: (val) => val < 60 ? 'A little lower than usual. Nothing urgent — just worth keeping an eye on.' : val > 100 ? 'A bit higher than your usual range. Worth noting for your next appointment.' : 'Your heart rate looks steady today.',
    },
    {
        id: 'blood_pressure', title: 'BP Systolic', unit: 'mmHg', yLabel: 'mmHg',
        icon: Activity, accent: '#6366F1', accentAlt: '#94A3B8', bgTint: '#F5F3FF',
        extract: (v) => v.blood_pressure?.systolic || 0,
        extractAlt: (v) => v.blood_pressure?.diastolic || 0,
        legend: ['Systolic', 'Diastolic'],
        normalRange: [90, 130],
        insight: (val) => val > 130 ? 'That reading is a little higher than usual. Worth mentioning at your next appointment.' : 'Your blood pressure looks healthy.',
    },
    {
        id: 'oxygen_saturation', title: 'SpO₂', unit: '%', yLabel: 'SpO₂',
        icon: Wind, accent: '#06B6D4', bgTint: '#ECFEFF',
        extract: (v) => v.oxygen_saturation || 0,
        normalRange: [95, 100],
        insight: (val) => val < 95 ? 'A touch below the typical range. Some slow deep breaths might help.' : 'Your oxygen levels look great.',
    },
    {
        id: 'hydration', title: 'Hydration', unit: '%', yLabel: '%',
        icon: Droplets, accent: '#0EA5E9', bgTint: '#F0F9FF',
        extract: (v) => v.hydration || 0,
        normalRange: [60, 100],
        insight: (val) => val < 60 ? 'A little on the low side. A glass of water when you can.' : 'Hydration is looking good today.',
    },
];

const getClinicalStatus = (metricId, value, diastolicVal) => {
    if (value === null || value === undefined || value === 0) {
        return { label: 'No data', color: '#94A3B8', icon: AlertCircle, dot: '#94A3B8' };
    }
    
    if (metricId === 'heart_rate') {
        if (value < 60) return { label: 'Low', color: '#3B82F6', icon: AlertCircle, dot: '#3B82F6' };
        if (value > 100) return { label: 'Elevated', color: '#EF4444', icon: AlertTriangle, dot: '#EF4444' };
        return { label: 'Normal', color: '#10B981', icon: CheckCircle2, dot: '#10B981' };
    }
    
    if (metricId === 'blood_pressure') {
        const sys = value;
        const dia = diastolicVal || 80;
        if (sys > 130 || dia > 85) return { label: 'Elevated', color: '#EF4444', icon: AlertTriangle, dot: '#EF4444' };
        if (sys < 90 || dia < 60) return { label: 'Low', color: '#3B82F6', icon: AlertCircle, dot: '#3B82F6' };
        return { label: 'Normal', color: '#10B981', icon: CheckCircle2, dot: '#10B981' };
    }
    
    if (metricId === 'oxygen_saturation') {
        if (value < 95) return { label: 'Low Oxygen', color: '#EF4444', icon: AlertCircle, dot: '#EF4444' };
        return { label: 'Normal', color: '#10B981', icon: CheckCircle2, dot: '#10B981' };
    }
    
    if (metricId === 'hydration') {
        if (value < 60) return { label: 'Low Hydration', color: '#F59E0B', icon: AlertTriangle, dot: '#F59E0B' };
        return { label: 'Normal', color: '#10B981', icon: CheckCircle2, dot: '#10B981' };
    }
    
    return { label: 'Normal', color: '#10B981', icon: CheckCircle2, dot: '#10B981' };
};

const getComparisonText = (metricId, latestVal, vitalsList) => {
    if (!vitalsList || vitalsList.length <= 1) return 'Stable today';
    
    const def = CHART_DEFS.find(c => c.id === metricId);
    if (!def) return 'Stable';
    
    const otherVals = vitalsList.slice(1).map(def.extract).filter(v => v > 0);
    if (!otherVals.length) return 'Stable today';
    
    const avg = otherVals.reduce((a, b) => a + b, 0) / otherVals.length;
    const diff = latestVal - avg;
    const sign = diff > 0 ? '+' : '';
    
    if (Math.abs(diff) < 1) return 'Stable vs average';
    return `${sign}${diff.toFixed(0)} ${def.unit} vs average`;
};

const getDateRangeForRange = (range, customStart, customEnd) => {
    const end = new Date();
    const start = new Date();
    if (range === 'today') {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
    } else if (range === '7d') {
        start.setDate(end.getDate() - 6);
        start.setHours(0, 0, 0, 0);
    } else if (range === '30d') {
        start.setDate(end.getDate() - 29);
        start.setHours(0, 0, 0, 0);
    } else if (range === 'custom') {
        return { start: customStart || new Date(), end: customEnd || new Date() };
    }
    return { start, end };
};

class ChartErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true };
    }
    componentDidCatch(error, errorInfo) {
        console.warn('Chart render error:', error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <View style={{ height: 200, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9' }}>
                    <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '500' }}>Chart unavailable</Text>
                </View>
            );
        }
        return this.props.children;
    }
}

const getMinSpanData = (metricId, timeRange, rangeData, mainData, vitals, extractAlt) => {
    const MIN_SPANS = {
        heart_rate: 30,
        blood_pressure: 40,
        oxygen_saturation: 10,
        hydration: 20,
    };

    const targetSpan = MIN_SPANS[metricId] || 10;
    let dataMax = 0;
    let dataMin = 0;

    if (timeRange !== 'today' && rangeData && rangeData.length > 0) {
        const allMaxs = rangeData.map(d => d.max || 0);
        const allMins = rangeData.map(d => d.min || 0);
        const allY = rangeData.map(d => d.y || 0);
        
        dataMax = Math.max(...allMaxs, ...allY, 0);
        dataMin = Math.min(...allMins.filter(v => v > 0), ...allY.filter(v => v > 0), dataMax);
        
        const currentSpan = dataMax - dataMin;
        if (currentSpan < targetSpan) {
            const pad = (targetSpan - currentSpan) / 2;
            dataMax += pad;
            dataMin = Math.max(0, dataMin - pad);
        }
        return {
            maxData: rangeData.map(() => dataMax),
            minData: rangeData.map(() => dataMin),
        };
    } else {
        const altData = extractAlt ? vitals.map(v => Number(extractAlt(v)) || 0).reverse() : [];
        const allVals = [...(mainData || []), ...altData].filter(v => v > 0);
        
        dataMax = allVals.length > 0 ? Math.max(...allVals) : 0;
        dataMin = allVals.length > 0 ? Math.min(...allVals) : 0;
        
        const currentSpan = dataMax - dataMin;
        if (currentSpan < targetSpan) {
            const pad = (targetSpan - currentSpan) / 2;
            dataMax += pad;
            dataMin = Math.max(0, dataMin - pad);
        }
        return {
            maxData: (mainData || []).map(() => dataMax),
            minData: (mainData || []).map(() => dataMin),
        };
    }
};

export default function VitalsHistoryScreen({ navigation, route }) {
    // ─── State & Refs ────────────────────────────────────────────
    const [vitals, setVitals] = useState([]);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [dataRefreshing, setDataRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [isOffline, setIsOffline] = useState(false);

    const [timeRange, setTimeRange] = useState('7d'); // 'today', '7d', '30d', 'custom'
    const [customStartDate, setCustomStartDate] = useState(new Date());
    const [customEndDate, setCustomEndDate] = useState(new Date());
    const [showCustomStartPicker, setShowCustomStartPicker] = useState(false);
    const [showCustomEndPicker, setShowCustomEndPicker] = useState(false);

    // Request tracking & Abort controllers
    const chartRequestRef = useRef(0);
    const chartAbortControllerRef = useRef(null);

    // Animation values
    const scrollY = useRef(new Animated.Value(0)).current;
    const dataFadeAnim = useRef(new Animated.Value(1)).current;
    const fadeAnim = useRef(new Animated.Value(1)).current;

    const { width: windowW, height: windowH } = useWindowDimensions();
    const isLandscape = windowW > windowH;
    const [isFullscreen, setIsFullscreen] = useState(false);

    const [isLoggingExpanded, setIsLoggingExpanded] = useState(false);
    const [formValues, setFormValues] = useState({
        heart_rate: '', systolic: '', diastolic: '', oxygen_saturation: '', hydration: '',
    });
    const [formError, setFormError] = useState(null);
    const [activeMetricId, setActiveMetricId] = useState(route?.params?.activeMetricId || 'heart_rate');

    useEffect(() => {
        if (route?.params?.activeMetricId) {
            setActiveMetricId(route.params.activeMetricId);
        }
    }, [route?.params?.activeMetricId]);

    const [syncStatus, setSyncStatus] = useState({
        enabled: false,
        connected: false,
        permissionStatus: 'unavailable',
        lastSync: null,
        readingsToday: 0,
        syncing: false,
        latestSource: 'health_connect',
    });

    const patient = usePatientStore((state) => state.patient);

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

    // ─── Fetch Vitals ─────────────────────────────────────────────
    const fetchChartData = useCallback(async () => {
        if (isOffline) {
            setError('You are offline. Please connect to the internet to view your vitals history.');
            setLoading(false);
            return;
        }

        // Abort previous in-flight request
        if (chartAbortControllerRef.current) {
            chartAbortControllerRef.current.abort();
        }
        const controller = new AbortController();
        chartAbortControllerRef.current = controller;

        const requestId = Date.now();
        chartRequestRef.current = requestId;
        setError(null);

        const { start, end } = getDateRangeForRange(timeRange, customStartDate, customEndDate);

        try {
            if (initialLoading) setLoading(true);
            else {
                setDataRefreshing(true);
                Animated.timing(dataFadeAnim, { toValue: 0.3, duration: 150, useNativeDriver: true }).start();
            }

            const res = await api.get('/users/patients/me/vitals', {
                params: {
                    start_date: start.toISOString(),
                    end_date: end.toISOString(),
                },
                signal: controller.signal,
            });

            if (requestId === chartRequestRef.current) {
                setVitals(res.data.vitals || []);
            }
        } catch (err) {
            if (axios.isCancel(err)) {
                return;
            }
            if (requestId === chartRequestRef.current) {
                setError(handleAxiosError(err));
            }
        } finally {
            if (requestId === chartRequestRef.current) {
                setLoading(false);
                setInitialLoading(false);
                setDataRefreshing(false);
                Animated.timing(dataFadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
            }
        }
    }, [timeRange, customStartDate, customEndDate, isOffline, initialLoading, dataFadeAnim]);

    const debounceChartRef = useRef(null);
    useEffect(() => {
        if (debounceChartRef.current) clearTimeout(debounceChartRef.current);
        debounceChartRef.current = setTimeout(() => fetchChartData(), 300);
        return () => clearTimeout(debounceChartRef.current);
    }, [fetchChartData]);

    useEffect(() => {
        fetchSyncStatus();
    }, [fetchSyncStatus]);

    useEffect(() => {
        const sub1 = DeviceEventEmitter.addListener('VITALS_UPDATED', () => {
            fetchChartData();
            fetchSyncStatus();
        });
        const sub2 = DeviceEventEmitter.addListener('VITALS_SYNCED', () => {
            fetchChartData();
            fetchSyncStatus();
        });
        return () => {
            sub1.remove();
            sub2.remove();
        };
    }, [fetchChartData, fetchSyncStatus]);

    // ─── Log vitals handler ──────────────────────────────────────
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
                date: new Date().toISOString(),
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
                setIsLoggingExpanded(false);
                setFormValues({ heart_rate: '', systolic: '', diastolic: '', oxygen_saturation: '', hydration: '' });
                setVitals(prev => [payload, ...prev]);
            } else {
                await apiService.patients.logVitals(payload);
                setIsLoggingExpanded(false);
                setFormValues({ heart_rate: '', systolic: '', diastolic: '', oxygen_saturation: '', hydration: '' });
                DeviceEventEmitter.emit('VITALS_UPDATED', { source: 'manual' });
                fetchChartData();
            }
        } catch (err) {
            setFormError(handleAxiosError(err));
        } finally {
            setLoading(false);
        }
    };

    // ─── Helpers ─────────────────────────────────────────────────
    const adjustCustomDate = (setter, days) => {
        setDataRefreshing(true);
        Animated.timing(dataFadeAnim, { toValue: 0.3, duration: 100, useNativeDriver: true }).start();
        setter(prev => { const d = new Date(prev); d.setDate(d.getDate() + days); return d; });
    };

    const formatDate = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

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
        }).reverse();
    }, [vitals]);

    const getStats = (id) => {
        const def = CHART_DEFS.find(c => c.id === id);
        if (!def || !vitals.length) return null;
        const data = vitals.map(def.extract).filter(v => v > 0);
        if (!data.length) return null;
        const avgVal = data.reduce((a, b) => a + b, 0) / data.length;
        const minVal = Math.min(...data);
        const maxVal = Math.max(...data);
        
        let altAvg, altMin, altMax;
        if (def.extractAlt) {
            const altData = vitals.map(def.extractAlt).filter(v => v > 0);
            if (altData.length) {
                altAvg = altData.reduce((a, b) => a + b, 0) / altData.length;
                altMin = Math.min(...altData);
                altMax = Math.max(...altData);
            }
        }
        return {
            avg: altAvg ? `${avgVal.toFixed(0)}/${altAvg.toFixed(0)}` : avgVal.toFixed(1),
            min: altMin ? `${minVal.toFixed(0)}/${altMin.toFixed(0)}` : minVal.toFixed(0),
            max: altMax ? `${maxVal.toFixed(0)}/${altMax.toFixed(0)}` : maxVal.toFixed(0),
            unit: def.unit
        };
    };

    // ─── NetInfo ─────────────────────────────────────────────────
    useEffect(() => {
        const unsub = NetInfo.addEventListener(state => setIsOffline(!state.isConnected));
        return () => unsub();
    }, []);

    // Animations setup
    const staggerAnims = useRef([...Array(5)].map(() => new Animated.Value(0))).current;
    const runAnimations = useCallback(() => {
        staggerAnims.forEach(a => a.setValue(0));
        Animated.stagger(100, staggerAnims.map(a =>
            Animated.timing(a, { toValue: 1, duration: 600, useNativeDriver: true })
        )).start();
    }, [staggerAnims]);

    useFocusEffect(useCallback(() => { runAnimations(); return () => {}; }, [runAnimations]));

    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, visible: false, value: 0, label: '' });
    const tooltipFade = useRef(new Animated.Value(0)).current;

    const showTooltip = (x, y, value, label) => {
        setTooltipPos({ x, y, visible: true, value, label });
        Animated.timing(tooltipFade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    };
    const hideTooltip = () => {
        Animated.timing(tooltipFade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() =>
            setTooltipPos(prev => ({ ...prev, visible: false }))
        );
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

    // ─── Render: Metric Selector Tabs ────────────────────────────
    const renderMetricSelector = () => (
        <View style={styles.metricSelectorContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricTabsContent}>
                {CHART_DEFS.map(m => {
                    const isActive = activeMetricId === m.id;
                    return (
                        <Pressable
                            key={m.id}
                            onPress={() => handleMetricChange(m.id)}
                            style={[
                                styles.metricTab,
                                isActive && { backgroundColor: m.accent, borderColor: m.accent }
                            ]}
                        >
                            <m.icon size={15} color={isActive ? '#FFFFFF' : m.accent} strokeWidth={2.5} />
                            <Text style={[styles.metricTabText, isActive && styles.metricTabTextActive]}>
                                {m.title.replace('BP ', '')}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );

    // ─── Render: Latest Reading Hero Card ────────────────────────
    const renderHeroCard = (def) => {
        if (!vitals.length) {
            return (
                <View style={[styles.heroCard, { height: 130, justifyContent: 'center' }]}>
                    <View style={styles.emptyHeroContent}>
                        <Heart size={28} color="#94A3B8" />
                        <Text style={styles.emptyHeroText}>No data available for this range</Text>
                    </View>
                </View>
            );
        }

        const latest = vitals[0];
        const latestVal = def.extract(latest);
        const altVal = def.extractAlt ? def.extractAlt(latest) : null;
        
        const status = getClinicalStatus(def.id, latestVal, altVal);
        const comparison = getComparisonText(def.id, latestVal, vitals);
        
        const StatusIcon = status.icon;
        const timeStr = new Date(latest.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }).toLowerCase();
        const dateStr = new Date(latest.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

        return (
            <Animated.View style={[{ opacity: staggerAnims[0] }]}>
                <AnimatedCard 
                    pressScale={0.98} 
                    hapticType="selection"
                    style={[styles.heroCard, { minHeight: 130, borderWidth: 0 }]}
                >
                    <View style={styles.heroTop}>
                        <View style={styles.heroLeft}>
                            <View style={[styles.heroIconCircle, { backgroundColor: def.bgTint }]}>
                                <def.icon size={22} color={def.accent} strokeWidth={2.5} />
                            </View>
                            <View>
                                <Text style={styles.heroLabel}>Latest {def.title}</Text>
                                <View style={styles.heroValueContainer}>
                                    {altVal ? (
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <AnimatedCounter 
                                                value={latestVal} 
                                                decimals={0} 
                                                style={styles.heroValue}
                                            />
                                            <Text style={styles.heroValue}>/</Text>
                                            <AnimatedCounter 
                                                value={altVal} 
                                                decimals={0} 
                                                style={styles.heroValue}
                                            />
                                        </View>
                                    ) : (
                                        <AnimatedCounter 
                                            value={latestVal} 
                                            decimals={def.id === 'heart_rate' ? 0 : 1} 
                                            style={styles.heroValue}
                                        />
                                    )}
                                    <Text style={styles.heroUnit}> {def.unit}</Text>
                                </View>
                            </View>
                        </View>
                        
                        <View style={[styles.statusBadge, { backgroundColor: status.color + '15' }]}>
                            <StatusIcon size={12} color={status.color} strokeWidth={3} style={{ marginRight: 4 }} />
                            <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
                        </View>
                    </View>
                    
                    <View style={styles.heroFooter}>
                        <Text style={styles.heroComparisonText}>
                            <TrendingUp size={11} color="#64748B" style={{ marginRight: 4 }} />
                            {comparison}
                        </Text>
                        <Text style={styles.heroTimeText}>
                            Updated {dateStr} at {timeStr}
                        </Text>
                    </View>
                </AnimatedCard>
            </Animated.View>
        );
    };

    // ─── Render: Time Range Selector ─────────────────────────────
    const renderTimeRangeSelector = () => (
        <View style={styles.timeRangeContainer}>
            {['today', '7d', '30d', 'custom'].map(r => {
                let label = '';
                if (r === 'today') label = 'Today';
                else if (r === '7d') label = '7 Days';
                else if (r === '30d') label = '30 Days';
                else if (r === 'custom') label = 'Custom';
                
                const isActive = timeRange === r;
                return (
                    <Pressable
                        key={r}
                        onPress={() => {
                            setTimeRange(r);
                            setDataRefreshing(true);
                            Animated.timing(dataFadeAnim, { toValue: 0.3, duration: 100, useNativeDriver: true }).start();
                        }}
                        style={[styles.rangeBtn, isActive && styles.rangeBtnActive]}
                    >
                        <Text style={[styles.rangeTxt, isActive && styles.rangeTxtActive]}>{label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );

    // ─── Render: Custom Date Pickers ─────────────────────────────
    const renderCustomDatePicker = () => {
        if (timeRange !== 'custom') return null;
        return (
            <Animated.View style={[styles.datePickerContainer, { opacity: staggerAnims[1] }]}>
                <View style={styles.datePickerRow}>
                    <Pressable style={styles.dateArrow} onPress={() => adjustCustomDate(setCustomStartDate, -1)}>
                        <ChevronLeft size={16} color="#64748B" />
                    </Pressable>
                    <Pressable style={styles.dateBox} onPress={() => setShowCustomStartPicker(true)}>
                        <Text style={styles.dateLabel}>Start Date</Text>
                        <Text style={styles.dateValue}>{formatDate(customStartDate)}</Text>
                    </Pressable>
                    <Pressable style={styles.dateArrow} onPress={() => adjustCustomDate(setCustomStartDate, 1)}>
                        <ChevronRight size={16} color="#64748B" />
                    </Pressable>
                </View>
                
                <View style={[styles.datePickerRow, { marginTop: 10 }]}>
                    <Pressable style={styles.dateArrow} onPress={() => adjustCustomDate(setCustomEndDate, -1)}>
                        <ChevronLeft size={16} color="#64748B" />
                    </Pressable>
                    <Pressable style={styles.dateBox} onPress={() => setShowCustomEndPicker(true)}>
                        <Text style={styles.dateLabel}>End Date</Text>
                        <Text style={styles.dateValue}>{formatDate(customEndDate)}</Text>
                    </Pressable>
                    <Pressable style={styles.dateArrow} onPress={() => adjustCustomDate(setCustomEndDate, 1)}>
                        <ChevronRight size={16} color="#64748B" />
                    </Pressable>
                </View>

                {showCustomStartPicker && (
                    <DateTimePicker value={customStartDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(e, d) => { setShowCustomStartPicker(false); if (d) setCustomStartDate(d); }} />
                )}
                {showCustomEndPicker && (
                    <DateTimePicker value={customEndDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(e, d) => { setShowCustomEndPicker(false); if (d) setCustomEndDate(d); }} />
                )}
            </Animated.View>
        );
    };

    // ─── Render: Quick Stats (Unified Card) ──────────────────────
    const renderQuickStats = (def) => {
        const stats = getStats(def.id);
        if (!stats) return null;

        const getFontSize = (val) => {
            const str = String(val || '');
            if (str.length > 5) return 15; // e.g. "125/76"
            if (str.length > 3) return 18; // e.g. "120"
            return 22; // default e.g. "72", "98"
        };

        return (
            <Animated.View style={[{ opacity: fadeAnim }, styles.statsCardContainer]}>
                <View style={styles.statsUnifiedCard}>
                    <View style={styles.statColumn}>
                        <View style={styles.statHeader}>
                            <Text style={styles.statLabel}>Average</Text>
                            <BarChart3 size={12} color="#64748B" />
                        </View>
                        <View style={styles.statValueRow}>
                            <Text style={[styles.statValue, { fontSize: getFontSize(stats.avg) }]}>{stats.avg}</Text>
                            <Text style={styles.statUnit}>{stats.unit}</Text>
                        </View>
                    </View>
                    
                    <View style={styles.statDivider} />
                    
                    <View style={styles.statColumn}>
                        <View style={styles.statHeader}>
                            <Text style={styles.statLabel}>Lowest</Text>
                            <TrendingDown size={12} color="#10B981" />
                        </View>
                        <View style={styles.statValueRow}>
                            <Text style={[styles.statValue, { fontSize: getFontSize(stats.min) }]}>{stats.min}</Text>
                            <Text style={styles.statUnit}>{stats.unit}</Text>
                        </View>
                    </View>
                    
                    <View style={styles.statDivider} />
                    
                    <View style={styles.statColumn}>
                        <View style={styles.statHeader}>
                            <Text style={styles.statLabel}>Highest</Text>
                            <TrendingUp size={12} color="#EF4444" />
                        </View>
                        <View style={styles.statValueRow}>
                            <Text style={[styles.statValue, { fontSize: getFontSize(stats.max) }]}>{stats.max}</Text>
                            <Text style={styles.statUnit}>{stats.unit}</Text>
                        </View>
                    </View>
                </View>
            </Animated.View>
        );
    };

    // ─── Render: Trend Chart ─────────────────────────────────────
    const renderTrendChart = (def) => {
        if (!vitals.length) {
            return (
                <View style={styles.chartCard}>
                    <View style={styles.emptyChartBox}>
                        <Text style={styles.emptyChartText}>No records for this period</Text>
                    </View>
                </View>
            );
        }

        const mainData = vitals.map(v => Number(def.extract(v)) || 0).reverse();
        const labels = vitals.map(v => {
            const d = new Date(v.date);
            return timeRange === 'today'
                ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase()
                : `${d.getMonth() + 1}/${d.getDate()}`;
        }).reverse();
        
        const rangeData = timeRange !== 'today' ? getRangeData(def.id) : [];
        const hasData = mainData.some(v => v > 0) || rangeData.some(d => (d.y || 0) > 0);

        const { maxData: finalMaxData, minData: finalMinData } = getMinSpanData(
            def.id,
            timeRange,
            rangeData,
            mainData,
            vitals,
            def.extractAlt
        );

        const chartConfig = {
            ...makeChartConfig(def.accent),
            fillShadowGradient: def.accent, fillShadowGradientOpacity: 0.15,
            fillShadowGradientFrom: def.accent, fillShadowGradientTo: '#FFFFFF',
            useShadowColorFromDataset: false,
        };

        // Trend Summary Sentence
        let trendSummary = 'Stable over the selected period.';
        let TrendIcon = Minus;
        let trendColor = '#64748B';
        if (mainData.length >= 2) {
            const first = mainData[0];
            const last = mainData[mainData.length - 1];
            const pct = ((last - first) / first) * 100;
            if (pct > 5) {
                trendSummary = `Upward trend (${pct.toFixed(0)}% increase)`;
                TrendIcon = TrendingUp;
                trendColor = '#EF4444';
            } else if (pct < -5) {
                trendSummary = `Downward trend (${Math.abs(pct).toFixed(0)}% decrease)`;
                TrendIcon = TrendingDown;
                trendColor = '#10B981';
            }
        }

        return (
            <Animated.View style={[
                styles.chartCard,
                { borderTopColor: def.accent, opacity: Animated.multiply(staggerAnims[2], dataFadeAnim) }
            ]}>
                <View style={styles.chartTitleRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.chartTitle}>{def.title} Trend</Text>
                        <Text style={styles.chartSubtitle}>
                            {timeRange === 'today' ? "Today's readings" : `Last ${timeRange === '7d' ? '7 days' : '30 days'} history`}
                        </Text>
                    </View>
                    <Pressable onPress={() => setIsFullscreen(true)} style={styles.expandBtn}>
                        <Maximize2 size={16} color="#64748B" />
                    </Pressable>
                </View>

                {timeRange !== 'today' && rangeData.length > 0 ? (
                    <View style={styles.victoryContainer}>
                        <ChartErrorBoundary>
                            <View>
                                <LineChart
                                    data={{
                                        labels: rangeData.map((d, i) => i % Math.ceil(rangeData.length / 6) === 0 ? d.x : ''),
                                        datasets: [
                                            { data: finalMaxData, color: () => 'transparent', strokeWidth: 0, withDots: false },
                                            { data: finalMinData, color: () => 'transparent', strokeWidth: 0, withDots: false },
                                            { data: rangeData.map(d => d.y || 0), color: () => def.accent, strokeWidth: 3 },
                                        ],
                                    }}
                                    width={SCREEN_W - 80} height={220} chartConfig={chartConfig}
                                    bezier={rangeData.length > 1} style={styles.chart}
                                    withVerticalLines={false} fromZero={false}
                                    onDataPointClick={({ x, y, value, index }) => showTooltip(x, y, value, rangeData[index].x)}
                                    decorator={() => renderChartInteraction(def)}
                                />
                                {tooltipPos.visible && <Pressable style={StyleSheet.absoluteFill} onPress={hideTooltip} />}
                            </View>
                        </ChartErrorBoundary>
                    </View>
                ) : hasData ? (
                    <ChartErrorBoundary>
                        <View>
                            <LineChart
                                data={{
                                    labels: labels.map((l, i) => i % Math.ceil(labels.length / 5) === 0 ? l : ''),
                                    datasets: [
                                        { data: finalMaxData, color: () => 'transparent', strokeWidth: 0, withDots: false },
                                        { data: finalMinData, color: () => 'transparent', strokeWidth: 0, withDots: false },
                                        { data: mainData, color: () => def.accent, strokeWidth: 3 },
                                        ...(def.extractAlt ? [{ data: vitals.map(v => Number(def.extractAlt(v)) || 0).reverse(), color: () => '#94A3B840', strokeWidth: 2, withDots: false }] : [])
                                    ]
                                }}
                                width={SCREEN_W - 80} height={200} chartConfig={chartConfig}
                                bezier={mainData.length > 1} style={styles.chart}
                                withVerticalLines={false} fromZero={false}
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

                <View style={styles.trendSummaryRow}>
                    <TrendIcon size={14} color={trendColor} style={{ marginRight: 6 }} />
                    <Text style={[styles.trendSummaryText, { color: trendColor }]}>{trendSummary}</Text>
                </View>
            </Animated.View>
        );
    };

    // ─── Render: Chart Interaction Decorator ──────────────────────
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

    // ─── Render: Fullscreen Chart ───────────────────────────
    const renderFullscreenChart = () => {
        const def = CHART_DEFS.find(c => c.id === activeMetricId);
        if (!def || !vitals.length) return null;
        const mainData = vitals.map(v => Number(def.extract(v)) || 0).reverse();
        const labels = vitals.map(v => {
            const d = new Date(v.date);
            return timeRange === 'today'
                ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase()
                : `${d.getMonth() + 1}/${d.getDate()}`;
        }).reverse();
        const rangeData = timeRange !== 'today' ? getRangeData(def.id) : [];

        const { maxData: finalMaxData, minData: finalMinData } = getMinSpanData(
            def.id,
            timeRange,
            rangeData,
            mainData,
            vitals,
            def.extractAlt
        );

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
                            {timeRange !== 'today' ? 'Trend Analysis' : "Today's Readings"} ({vitals.length} logs)
                        </Text>
                    </View>
                    <ChartErrorBoundary>
                        <View style={{ width: w, height: h, alignSelf: 'center' }}>
                            <LineChart
                                data={{
                                    labels: timeRange !== 'today'
                                        ? rangeData.map((d, i) => i % Math.ceil(rangeData.length / 12) === 0 ? d.x : '')
                                        : labels.map((l, i) => i % Math.ceil(labels.length / 10) === 0 ? l : ''),
                                    datasets: [
                                        { data: finalMaxData, color: () => 'transparent', strokeWidth: 0, withDots: false },
                                        { data: finalMinData, color: () => 'transparent', strokeWidth: 0, withDots: false },
                                        ...(timeRange !== 'today' ? [
                                            { data: rangeData.map(d => d.y || 0), color: () => def.accent, strokeWidth: 4 }
                                        ] : [
                                            { data: mainData, color: () => def.accent, strokeWidth: 3 },
                                            ...(def.extractAlt ? [{ data: vitals.map(v => Number(def.extractAlt(v)) || 0).reverse(), color: () => '#94A3B840', strokeWidth: 2, withDots: false }] : [])
                                        ])
                                    ],
                                    legend: timeRange !== 'today' ? ['Max', 'Min', 'Avg'] : (def.legend ? ['', '', ...def.legend] : []),
                                }}
                                width={w} height={h} chartConfig={chartConfig}
                                bezier={timeRange !== 'today' ? rangeData.length > 1 : mainData.length > 1}
                                style={styles.landscapeChart}
                                withVerticalLines={false} fromZero={false}
                                onDataPointClick={({ x, y, value, index }) => showTooltip(x, y, value, timeRange !== 'today' ? rangeData[index].x : labels[index])}
                                decorator={() => renderChartInteraction(def)}
                            />
                            {tooltipPos.visible && <Pressable style={[StyleSheet.absoluteFill, { zIndex: 50 }]} onPress={hideTooltip} />}
                        </View>
                    </ChartErrorBoundary>
                </View>
            </Modal>
        );
    };

    // ─── Render: AI Health Coach Card ────────────────────────────
    const renderAIHealthCoach = (def) => {
        if (!def || !vitals.length) return null;
        
        const latest = vitals[0];
        const val = def.extract(latest);
        const clinicalText = def.insight ? def.insight(val) : 'Stable readings recorded.';
        
        const adherenceDetails = usePatientStore.getState().adherenceDetails;
        const isAdherenceHigh = adherenceDetails?.rate >= 80 || adherenceDetails?.streak >= 3;

        return (
            <Animated.View style={[{ opacity: fadeAnim }, styles.coachCard]}>
                <View style={styles.coachHeader}>
                    <View style={styles.coachTitleGroup}>
                        <View style={styles.coachIconBubble}>
                            <Sparkles size={16} color="#6366F1" fill="#6366F1" />
                        </View>
                        <Text style={styles.coachTitle}>Today's Insight</Text>
                    </View>
                </View>

                <View style={styles.coachBody}>
                    <Text style={styles.coachInsightText}>{clinicalText}</Text>
                    
                    <View style={styles.coachDivider} />

                    <View style={styles.coachAdherenceRow}>
                        <CheckCircle2 size={14} color="#6366F1" style={{ marginRight: 8 }} />
                        <Text style={styles.coachAdherenceText}>
                            {isAdherenceHigh
                                ? "Excellent medication adherence matches your stable vital trends."
                                : "Consistency in taking prescribed medications can help improve your vital trends."}
                        </Text>
                    </View>
                </View>
            </Animated.View>
        );
    };

    // ─── Render: Timeline List ───────────────────────────────────
    const renderTimeline = (def) => {
        if (!vitals.length) return null;
        return (
            <Animated.View style={[{ opacity: staggerAnims[3] }, { marginTop: 12 }]}>
                <Text style={styles.historyTitle}>History Logs</Text>
                <View style={styles.timelineContainer}>
                    <View style={styles.timelineLine} />
                    {vitals.map((log, idx) => {
                        const isLast = idx === vitals.length - 1;
                        const value = def.extract(log);
                        const altValue = def.extractAlt ? def.extractAlt(log) : null;
                        const status = getClinicalStatus(def.id, value, altValue);
                        
                        const formattedValue = altValue ? `${value}/${altValue}` : value;
                        const timeStr = new Date(log.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }).toLowerCase();
                        const dateStr = new Date(log.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

                        return (
                            <View key={log._id || idx} style={[styles.timelineItem, isLast && { marginBottom: 0 }]}>
                                <View style={styles.timelineDotOuter}>
                                    <View style={[styles.timelineDotInner, { backgroundColor: status.dot }]} />
                                </View>
                                
                                <View style={styles.timelineContent}>
                                    <View style={styles.timelineHeader}>
                                        <View style={styles.timelineTimeRow}>
                                            <Text style={styles.timelineValue}>{formattedValue} {def.unit}</Text>
                                            <Text style={styles.timelineTime}>{dateStr} · {timeStr}</Text>
                                        </View>
                                        
                                        {log.source && log.source !== 'manual' ? (
                                            <Text style={styles.timelineSource}>Synced</Text>
                                        ) : (
                                            <Text style={styles.timelineSource}>Manual</Text>
                                        )}
                                    </View>
                                </View>
                            </View>
                        );
                    })}
                </View>
            </Animated.View>
        );
    };

    // ─── Render: Skeletons ────────────────────────────────────────
    const renderHeroCardSkeleton = () => (
        <View style={[styles.skeletonHeroCard, { marginBottom: 20 }]}>
            <View style={styles.skeletonHeroTop}>
                <View style={{ gap: 8 }}>
                    <SkeletonItem width={100} height={12} borderRadius={4} />
                    <SkeletonItem width={140} height={18} borderRadius={6} />
                    <SkeletonItem width={110} height={14} borderRadius={4} />
                </View>
                <SkeletonItem width={60} height={22} borderRadius={11} />
            </View>
            <View style={styles.skeletonHeroChips}>
                {[...Array(4)].map((_, i) => (
                    <View key={i} style={styles.skeletonHeroChip}>
                        <SkeletonItem width={20} height={20} borderRadius={10} style={{ marginBottom: 6 }} />
                        <SkeletonItem width={35} height={10} borderRadius={3} style={{ marginBottom: 6 }} />
                        <SkeletonItem width={40} height={14} borderRadius={4} />
                    </View>
                ))}
            </View>
        </View>
    );

    const renderSummaryStatsSkeleton = () => (
        <View style={styles.statsCardContainer}>
            <View style={styles.statsUnifiedCard}>
                <View style={styles.statColumn}>
                    <SkeletonItem width={40} height={10} borderRadius={3} style={{ marginBottom: 8 }} />
                    <SkeletonItem width={60} height={22} borderRadius={6} />
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statColumn}>
                    <SkeletonItem width={40} height={10} borderRadius={3} style={{ marginBottom: 8 }} />
                    <SkeletonItem width={60} height={22} borderRadius={6} />
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statColumn}>
                    <SkeletonItem width={40} height={10} borderRadius={3} style={{ marginBottom: 8 }} />
                    <SkeletonItem width={60} height={22} borderRadius={6} />
                </View>
            </View>
        </View>
    );

    const renderChartCardSkeleton = () => (
        <View style={[styles.chartCard, { borderTopColor: '#E2E8F0', height: 260, justifyContent: 'center' }]}>
            <ActivityIndicator color="#6366F1" size="small" />
        </View>
    );

    const renderAIHealthCoachSkeleton = () => (
        <View style={[styles.coachCard, { marginBottom: 20 }]}>
            <View style={styles.coachHeader}>
                <View style={styles.coachTitleGroup}>
                    <View style={styles.coachIconBubble}>
                        <SkeletonItem width={16} height={16} borderRadius={8} />
                    </View>
                    <SkeletonItem width={100} height={14} borderRadius={4} />
                </View>
            </View>
            <View style={styles.coachBody}>
                <SkeletonItem width="100%" height={16} borderRadius={4} style={{ marginBottom: 8 }} />
                <SkeletonItem width="90%" height={16} borderRadius={4} style={{ marginBottom: 8 }} />
                <SkeletonItem width="60%" height={16} borderRadius={4} style={{ marginBottom: 12 }} />
                <View style={styles.coachDivider} />
                <View style={styles.coachAdherenceRow}>
                    <SkeletonItem width={14} height={14} borderRadius={7} style={{ marginRight: 6 }} />
                    <SkeletonItem width="80%" height={12} borderRadius={3} />
                </View>
            </View>
        </View>
    );

    const renderErrorBanner = () => {
        if (!error && !isOffline) return null;
        return (
            <View style={[styles.errorBanner, isOffline && { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                {isOffline ? <Clock size={18} color="#DC2626" /> : <AlertTriangle size={18} color="#DC2626" />}
                <Text style={styles.errorText}>
                    {isOffline ? 'Offline Mode Active. Changes will sync automatically when connected.' : error}
                </Text>
                {!isOffline && error && (
                    <Pressable style={styles.retryBtn} onPress={fetchChartData}>
                        <RefreshCw size={13} color="#FFF" />
                        <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                )}
            </View>
        );
    };

    // ─── Main Render ─────────────────────────────────────────────
    const def = CHART_DEFS.find(c => c.id === activeMetricId);
    const isChartLoadingState = loading || dataRefreshing;

    return (
        <TabScreenTransition>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
                {renderFullscreenChart()}
                <View style={[styles.container]}>
                    {renderHeader()}
                    
                    {/* Ambient Glow Backdrop */}
                    <LinearGradient colors={['#EEF2FF', 'rgba(238,242,255,0.0)', 'rgba(248,250,252,0.0)']} style={styles.ambientGlow} />

                    <Animated.ScrollView
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
                        scrollEventThrottle={16}
                    >
                        <>
                            {/* 1. Metric tabs */}
                            {renderMetricSelector()}

                            {/* 2. Latest Reading Hero Card */}
                            {isChartLoadingState ? renderHeroCardSkeleton() : renderHeroCard(def)}

                            {/* 3. Time Range chips */}
                            {renderTimeRangeSelector()}
                            {renderCustomDatePicker()}

                            {/* Error and sync warnings */}
                            {renderErrorBanner()}

                            {/* 4. Quick Stats & Chart Analytics */}
                            {isChartLoadingState ? (
                                <>
                                    {renderSummaryStatsSkeleton()}
                                    {renderChartCardSkeleton()}
                                    {renderAIHealthCoachSkeleton()}
                                </>
                            ) : vitals.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <View style={styles.emptyIconCircle}>
                                        <Heart size={34} color="#6366F1" />
                                    </View>
                                    <Text style={styles.emptyTitle}>Start tracking your vitals</Text>
                                    <Text style={styles.emptySub}>
                                        Log your first reading to unlock trends, AI insights, and personalized health summaries.
                                    </Text>
                                </View>
                            ) : (
                                <>
                                    {renderQuickStats(def)}
                                    {renderTrendChart(def)}
                                    {renderAIHealthCoach(def)}
                                    {renderTimeline(def)}
                                </>
                            )}

                            {/* 5. Collapsible Log Form Drawer */}
                            <Animated.View style={[styles.chartCard, { borderTopColor: '#6366F1', marginTop: 12 }]}>
                                <Pressable 
                                    style={styles.logToggleRow} 
                                    onPress={() => { setIsLoggingExpanded(!isLoggingExpanded); setFormError(null); }}
                                >
                                    <View style={styles.logTitleGroup}>
                                        <PlusCircle size={18} color="#6366F1" />
                                        <Text style={styles.chartTitle}>Log New Reading</Text>
                                    </View>
                                    {isLoggingExpanded ? <ChevronUp size={18} color="#64748B" /> : <ChevronDown size={18} color="#64748B" />}
                                </Pressable>

                                {isLoggingExpanded && (
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
                        </>
                    </Animated.ScrollView>
                </View>
            </KeyboardAvoidingView>
        </TabScreenTransition>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    ambientGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 280, zIndex: 0 },
    scrollContent: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 110 : 90, paddingBottom: layout.TAB_BAR_CLEARANCE + 20 },

    /* Glass Header */
    glassHeader: {
        position: 'absolute', top: 0, left: 0, right: 0,
        height: Platform.OS === 'ios' ? 100 : 80,
        zIndex: 100, justifyContent: 'flex-end', paddingBottom: 10,
    },
    headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
    headerBackBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    headerTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', letterSpacing: -0.3 },
    headerBorderLine: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, backgroundColor: '#E2E8F0' },

    /* Metric Selector Tabs */
    metricSelectorContainer: { marginBottom: 16, zIndex: 1 },
    metricTabsContent: { paddingHorizontal: 2, gap: 10, paddingBottom: 4 },
    metricTab: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 16, paddingVertical: 10, borderRadius: 30,
        backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1
    },
    metricTabText: { fontSize: 13, fontWeight: '800', color: '#475569' },
    metricTabTextActive: { color: '#FFFFFF' },

    /* Hero Card */
    heroCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 20,
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2
    },
    emptyHeroContent: { paddingVertical: 30, alignItems: 'center', gap: 10 },
    emptyHeroText: { color: '#64748B', fontSize: 13, fontWeight: '600' },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    heroLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    heroIconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    heroLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
    heroValueContainer: { flexDirection: 'row', alignItems: 'baseline' },
    heroValue: { fontSize: 32, fontWeight: '900', color: '#0F172A', letterSpacing: -1 },
    heroUnit: { fontSize: 13, fontWeight: '800', color: '#64748B' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    statusBadgeText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.3 },
    heroFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F8FAFC', paddingTop: 14 },
    heroComparisonText: { fontSize: 12, fontWeight: '700', color: '#64748B', flexDirection: 'row', alignItems: 'center' },
    heroTimeText: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },

    /* Time Range Chips */
    timeRangeContainer: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    rangeBtn: { flex: 1, paddingVertical: 9, borderRadius: 20, backgroundColor: '#FFFFFF', borderHeight: 1.5, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
    rangeBtnActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
    rangeTxt: { fontSize: 12, fontWeight: '800', color: '#64748B' },
    rangeTxtActive: { color: '#FFFFFF' },

    /* Custom Date Pickers */
    datePickerContainer: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' },
    datePickerRow: { flexDirection: 'row', alignItems: 'center' },
    dateArrow: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    dateBox: { flex: 1, marginHorizontal: 8, backgroundColor: '#F9FAFB', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
    dateLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 2, letterSpacing: 0.5 },
    dateValue: { fontSize: 13, fontWeight: '900', color: '#0F172A' },

    /* Stats Scroll & Unified Card */
    statsCardContainer: { marginBottom: 20 },
    statsUnifiedCard: {
        backgroundColor: '#FFFFFF', borderRadius: 20, paddingVertical: 16, paddingHorizontal: 12,
        flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.02, shadowRadius: 8, elevation: 2
    },
    statColumn: { flex: 1, alignItems: 'center' },
    statDivider: { width: 1, height: 32, backgroundColor: '#E2E8F0' },
    statsScroll: { gap: 10, paddingBottom: 4 },
    statHeader: { flexDirection: 'row', gap: 4, alignItems: 'center', marginBottom: 6 },
    statLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 },
    statValueRow: { flexDirection: 'column', alignItems: 'center', marginTop: 2 },
    statValue: { fontSize: 22, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
    statUnit: { fontSize: 10, fontWeight: '700', color: '#94A3B8', marginTop: 2 },

    /* Chart Card */
    chartCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 20,
        borderWidth: 1, borderColor: '#F1F5F9', borderTopWidth: 3,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2
    },
    chartTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    chartTitle: { fontSize: 15, fontWeight: '900', color: '#0F172A' },
    chartSubtitle: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 1 },
    chart: { borderRadius: 16, marginLeft: -10 },
    expandBtn: { padding: 6, backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#F1F5F9' },
    trendSummaryRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F8FAFC', paddingTop: 12, marginTop: 10 },
    trendSummaryText: { fontSize: 12, fontWeight: '800' },

    emptyChartBox: { height: 130, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', borderStyle: 'dashed' },
    emptyChartText: { color: '#94A3B8', fontStyle: 'italic', fontSize: 13, fontWeight: '500' },

    /* Victory range box */
    victoryContainer: { marginTop: 6 },

    /* AI Coach Card */
    coachCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 20,
        borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2
    },
    coachHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    coachTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    coachIconBubble: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
    coachTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
    coachBody: { marginTop: 2 },
    coachInsightText: { fontSize: 13, fontWeight: '700', color: '#1E293B', lineHeight: 18 },
    coachDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },
    coachAdherenceRow: { flexDirection: 'row', alignItems: 'center' },
    coachAdherenceText: { fontSize: 12, color: '#4F46E5', fontWeight: '700', flex: 1 },

    /* Timeline Journals */
    historyTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
    timelineContainer: { paddingLeft: 12, position: 'relative', marginTop: 4 },
    timelineLine: { position: 'absolute', left: 4, top: 12, bottom: 12, width: 1.5, backgroundColor: '#E2E8F0' },
    timelineItem: { flexDirection: 'row', position: 'relative', marginBottom: 12 },
    timelineDotOuter: { position: 'absolute', left: -12.5, top: 13, width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
    timelineDotInner: { width: 5, height: 5, borderRadius: 2.5 },
    timelineContent: {
        flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12,
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.01, shadowRadius: 4, elevation: 1
    },
    timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    timelineTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    timelineValue: { fontSize: 13, fontWeight: '900', color: '#0F172A' },
    timelineTime: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
    timelineSource: { fontSize: 10, fontWeight: '800', color: '#6366F1', backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6 },

    /* Form Card */
    logToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    logTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    formArea: { marginTop: 14 },
    formDivider: { height: 1, backgroundColor: '#F1F5F9', marginBottom: 14 },
    formRow: { flexDirection: 'row', gap: 12, marginBottom: 2 },
    formGroup: { flex: 1, marginBottom: 2 },
    formSectionLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 8 },
    submitBtn: { marginTop: 16, borderRadius: 14, overflow: 'hidden' },
    submitGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
    submitTxt: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },

    /* Error Banner */
    errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, padding: 12, gap: 8, marginBottom: 12 },
    errorText: { flex: 1, color: '#991B1B', fontSize: 12, fontWeight: '600', lineHeight: 16 },
    retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DC2626', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    retryText: { color: '#FFF', fontSize: 11, fontWeight: '700' },

    /* Empty State */
    emptyState: { alignItems: 'center', paddingVertical: 32 },
    emptyIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    emptyTitle: { color: '#0F172A', fontSize: 16, fontWeight: '800' },
    emptySub: { color: '#64748B', fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 24, lineHeight: 18 },

    /* Skeletons spacing */
    skeletonHeroCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.02, shadowRadius: 6, elevation: 1 },
    skeletonHeroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    skeletonHeroChips: { flexDirection: 'row', gap: 8 },
    skeletonHeroChip: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 16, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    skeletonStatCard: { width: 120, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14, borderWidth: 1, borderColor: '#F1F5F9', borderTopWidth: 3 },

    /* Landscape / Fullscreen */
    landscapeContainer: { flex: 1, backgroundColor: '#FFFFFF', padding: 16, justifyContent: 'center' },
    landscapeHeader: { position: 'absolute', top: 20, left: 24, zIndex: 90 },
    landscapeTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A' },
    landscapeSubtitle: { fontSize: 12, fontWeight: '700', color: '#64748B', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
    landscapeChart: { borderRadius: 20, alignSelf: 'center' },
    closeFullscreenBtn: { position: 'absolute', top: 20, right: 20, zIndex: 1000, backgroundColor: '#F1F5F9', width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 6 },
});
