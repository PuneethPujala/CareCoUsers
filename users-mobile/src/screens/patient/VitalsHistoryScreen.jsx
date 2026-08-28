import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Platform, Pressable,
    ActivityIndicator, KeyboardAvoidingView, Dimensions, Animated,
    useWindowDimensions, Modal, DeviceEventEmitter, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart } from 'react-native-chart-kit';
import NetInfo from '@react-native-community/netinfo';
import CustomCalendarPicker from '../../components/ui/CustomCalendarPicker';
import {
    ChevronLeft, ChevronRight, Heart, Activity, Wind, Droplets,
    TriangleAlert, WifiOff, RefreshCw, Calendar, Clock, Sparkles,
    Maximize2, X, Plus, Zap, Watch, CircleCheckBig, CircleAlert,
    TrendingUp, TrendingDown, Minus, BarChart3, PlusCircle,
    ChevronDown, ChevronUp, ArrowUpRight, ShieldCheck
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
import BottomSheetWrapper from '../../components/ui/BottomSheetWrapper';
import Reanimated, { 
    FadeIn, FadeInDown, FadeOut, 
    useSharedValue, useAnimatedStyle, 
    withRepeat, withSequence, withTiming, Easing 
} from 'react-native-reanimated';

// ─── Pulsing Indicator for Latest Point ──────────────────────
const PulsingDot = ({ latestX, latestY, hasLatestPoint, color }) => {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(0.8);

    useEffect(() => {
        scale.value = withRepeat(
            withSequence(
                withTiming(2.2, { duration: 1800, easing: Easing.out(Easing.ease) }),
                withTiming(1, { duration: 0 })
            ),
            -1,
            false
        );
        opacity.value = withRepeat(
            withSequence(
                withTiming(0, { duration: 1800, easing: Easing.out(Easing.ease) }),
                withTiming(0.8, { duration: 0 })
            ),
            -1,
            false
        );
    }, [scale, opacity]);

    const pulseStyle = useAnimatedStyle(() => {
        if (!hasLatestPoint.value || (latestX.value === 0 && latestY.value === 0)) {
            return { opacity: 0 };
        }
        return {
            transform: [
                { translateX: latestX.value - 10 },
                { translateY: latestY.value - 10 },
                { scale: scale.value }
            ],
            opacity: opacity.value,
        };
    });

    const centerStyle = useAnimatedStyle(() => {
        if (!hasLatestPoint.value || (latestX.value === 0 && latestY.value === 0)) {
            return { opacity: 0 };
        }
        return {
            transform: [
                { translateX: latestX.value - 3 },
                { translateY: latestY.value - 3 }
            ],
        };
    });

    const glowStyle = useAnimatedStyle(() => {
        if (!hasLatestPoint.value || (latestX.value === 0 && latestY.value === 0)) {
            return { opacity: 0 };
        }
        return {
            transform: [
                { translateX: latestX.value - 15 },
                { translateY: latestY.value - 15 }
            ],
        };
    });

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* Glow Layer */}
            <Reanimated.View style={[{
                position: 'absolute',
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: color,
                opacity: 0.15,
            }, glowStyle]} />

            {/* Pulsing Ring Layer */}
            <Reanimated.View style={[{
                position: 'absolute',
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: color,
                backgroundColor: 'transparent',
            }, pulseStyle]} />

            {/* Core Center Dot */}
            <Reanimated.View style={[{
                position: 'absolute',
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: color,
                borderWidth: 1,
                borderColor: '#FFFFFF',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.2,
                shadowRadius: 1,
                elevation: 2,
            }, centerStyle]} />
        </View>
    );
};

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
        const boosted = Math.max(opacity, 0.7);
        if (accentColor && accentColor.startsWith('#')) {
            const r = parseInt(accentColor.slice(1, 3), 16);
            const g = parseInt(accentColor.slice(3, 5), 16);
            const b = parseInt(accentColor.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${boosted})`;
        }
        return accentColor ? accentColor.replace(')', `, ${boosted})`).replace('rgb', 'rgba') : `rgba(0,0,0,${boosted})`;
    },
    labelColor: () => '#64748B',
    propsForDots: { r: '5.5', strokeWidth: '2.5', stroke: '#FFFFFF' },
    propsForBackgroundLines: { stroke: '#F1F5F9', strokeDasharray: '' },
    style: { borderRadius: 16 },
    paddingRight: 32,
    paddingTop: 16,
});

const CHART_DEFS = [
    {
        id: 'heart_rate', title: 'Heart Rate', unit: 'bpm', yLabel: 'bpm',
        icon: Heart, accent: '#EF4444', bgTint: '#FFF5F5',
        extract: (v) => v.heart_rate || 0,
        normalRange: [60, 100],
        insight: (val) => val < 60 ? 'A little lower than usual. Nothing urgent — just worth keeping an eye on.' : val > 100 ? 'A bit higher than your usual range. Worth noting for your next appointment.' : 'Your heart rate looks steady and within the healthy target zone.',
        recommendation: 'Regular aerobic activity and steady hydration support consistent cardiac health.',
    },
    {
        id: 'blood_pressure', title: 'BP Systolic', unit: 'mmHg', yLabel: 'mmHg',
        icon: Activity, accent: '#6366F1', accentAlt: '#94A3B8', bgTint: '#F5F3FF',
        extract: (v) => v.blood_pressure?.systolic || 0,
        extractAlt: (v) => v.blood_pressure?.diastolic || 0,
        legend: ['Systolic', 'Diastolic'],
        normalRange: [90, 130],
        insight: (val) => val > 130 ? 'That reading is slightly higher than optimal. Worth reviewing with your care team.' : val < 90 ? 'Systolic reading is on the lower side. Ensure adequate fluid intake.' : 'Your blood pressure is within normal clinical limits.',
        recommendation: 'Low-sodium meals and daily medication timing maintain optimal vascular pressure.',
    },
    {
        id: 'oxygen_saturation', title: 'SpO₂', unit: '%', yLabel: 'SpO₂',
        icon: Wind, accent: '#06B6D4', bgTint: '#ECFEFF',
        extract: (v) => v.oxygen_saturation || 0,
        normalRange: [95, 100],
        insight: (val) => val < 95 ? 'A touch below typical range. Some slow, deep breaths in a seated position can help.' : 'Your blood oxygen saturation is optimal.',
        recommendation: 'Deep breathing exercises and well-ventilated rooms keep oxygenation steady.',
    },
    {
        id: 'hydration', title: 'Hydration', unit: '%', yLabel: '%',
        icon: Droplets, accent: '#0EA5E9', bgTint: '#F0F9FF',
        extract: (v) => v.hydration || 0,
        normalRange: [60, 100],
        insight: (val) => val < 60 ? 'A little on the low side. Drink a glass of water when convenient.' : 'Hydration levels are well balanced today.',
        recommendation: 'Aim for 6-8 glasses of water daily spread evenly across morning and afternoon.',
    },
];

const getClinicalStatus = (metricId, value, diastolicVal) => {
    if (value === null || value === undefined || value === 0) {
        return { label: 'No data', color: '#94A3B8', icon: CircleAlert, dot: '#94A3B8' };
    }
    
    if (metricId === 'heart_rate') {
        if (value < 60) return { label: 'Low', color: '#3B82F6', icon: CircleAlert, dot: '#3B82F6' };
        if (value > 100) return { label: 'Elevated', color: '#EF4444', icon: TriangleAlert, dot: '#EF4444' };
        return { label: 'Normal', color: '#10B981', icon: CircleCheckBig, dot: '#10B981' };
    }
    
    if (metricId === 'blood_pressure') {
        const sys = value;
        const dia = diastolicVal || 80;
        if (sys > 130 || dia > 85) return { label: 'Elevated', color: '#EF4444', icon: TriangleAlert, dot: '#EF4444' };
        if (sys < 90 || dia < 60) return { label: 'Low', color: '#3B82F6', icon: CircleAlert, dot: '#3B82F6' };
        return { label: 'Normal', color: '#10B981', icon: CircleCheckBig, dot: '#10B981' };
    }
    
    if (metricId === 'oxygen_saturation') {
        if (value < 95) return { label: 'Low Oxygen', color: '#EF4444', icon: CircleAlert, dot: '#EF4444' };
        return { label: 'Normal', color: '#10B981', icon: CircleCheckBig, dot: '#10B981' };
    }
    
    if (metricId === 'hydration') {
        if (value < 60) return { label: 'Low Hydration', color: '#F59E0B', icon: TriangleAlert, dot: '#F59E0B' };
        return { label: 'Normal', color: '#10B981', icon: CircleCheckBig, dot: '#10B981' };
    }
    
    return { label: 'Normal', color: '#10B981', icon: CircleCheckBig, dot: '#10B981' };
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
                <View style={{ height: 180, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9' }}>
                    <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>Chart preview unavailable</Text>
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
    const insets = useSafeAreaInsets();

    // ─── State & Refs ────────────────────────────────────────────
    const [vitals, setVitals] = useState([]);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [dataRefreshing, setDataRefreshing] = useState(false);
    const [selectedDetailLog, setSelectedDetailLog] = useState(null);
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

    // Reanimated Shared Values for Pulsing Indicator coordinates
    const latestX = useSharedValue(0);
    const latestY = useSharedValue(0);
    const hasLatestPoint = useSharedValue(false);

    useEffect(() => {
        hasLatestPoint.value = false;
    }, [activeMetricId, timeRange]);

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
    const fetchChartData = useCallback(async (isInitial = false) => {
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
            if (isInitial) setLoading(true);
            else setDataRefreshing(true);

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
            }
        }
    }, [timeRange, customStartDate, customEndDate, isOffline]);

    const debounceChartRef = useRef(null);
    useEffect(() => {
        if (debounceChartRef.current) clearTimeout(debounceChartRef.current);
        debounceChartRef.current = setTimeout(() => {
            fetchChartData(initialLoading);
        }, 200);
        return () => clearTimeout(debounceChartRef.current);
    }, [timeRange, customStartDate, customEndDate]);

    useEffect(() => {
        fetchSyncStatus();
    }, [fetchSyncStatus]);

    useEffect(() => {
        const sub1 = DeviceEventEmitter.addListener('VITALS_UPDATED', () => {
            fetchChartData(false);
            fetchSyncStatus();
        });
        const sub2 = DeviceEventEmitter.addListener('VITALS_SYNCED', () => {
            fetchChartData(false);
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
                fetchChartData(false);
            }
        } catch (err) {
            setFormError(handleAxiosError(err));
        } finally {
            setLoading(false);
        }
    };

    // ─── Helpers ─────────────────────────────────────────────────
    const adjustCustomDate = (setter, days) => {
        setter(prev => { const d = new Date(prev); d.setDate(d.getDate() + days); return d; });
    };

    const formatDate = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    const handleMetricChange = (id) => {
        if (id === activeMetricId) return;
        Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
            setActiveMetricId(id);
            Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
        });
    };

    const getRangeData = useCallback((id) => {
        const def = CHART_DEFS.find(c => c.id === id);
        if (!def || !vitals.length) return [];

        const numDays = timeRange === '30d' ? 30 : timeRange === '7d' ? 7 : 0;
        
        if (numDays > 0) {
            const now = new Date();
            const daysList = [];
            for (let i = numDays - 1; i >= 0; i--) {
                const d = new Date(now);
                d.setDate(now.getDate() - i);
                const month = d.toLocaleString('en-US', { month: 'short' });
                const day = d.getDate();
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const label = `${day} ${month}`;
                daysList.push({ key, label, date: d });
            }

            // Group vitals by YYYY-MM-DD
            const grouped = {};
            vitals.forEach(v => {
                const d = new Date(v.date);
                const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                if (!grouped[k]) grouped[k] = [];
                const val = def.extract(v);
                if (val > 0) grouped[k].push(val);
            });

            // Find latest reading as baseline carry-forward
            const validReadings = vitals.map(def.extract).filter(v => v > 0);
            let baseline = validReadings.length > 0 ? validReadings[0] : (def.normalRange ? (def.normalRange[0] + def.normalRange[1]) / 2 : 75);

            return daysList.map(slot => {
                const dayVals = grouped[slot.key];
                if (dayVals && dayVals.length > 0) {
                    const avg = dayVals.reduce((a, b) => a + b, 0) / dayVals.length;
                    baseline = avg;
                    return {
                        x: slot.label,
                        y: Math.round(avg),
                        min: Math.min(...dayVals),
                        max: Math.max(...dayVals),
                        hasActualLog: true,
                    };
                }
                return {
                    x: slot.label,
                    y: Math.round(baseline),
                    min: Math.round(baseline),
                    max: Math.round(baseline),
                    hasActualLog: false,
                };
            });
        }

        // For 'today' or 'custom'
        const grouped = vitals.reduce((acc, v) => {
            const d = new Date(v.date);
            const key = timeRange === 'today'
                ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase()
                : `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`;
            if (!acc[key]) acc[key] = [];
            const val = def.extract(v);
            if (val > 0) acc[key].push(val);
            return acc;
        }, {});

        const keys = Object.keys(grouped);
        if (keys.length === 1) {
            const singleVal = grouped[keys[0]].reduce((a, b) => a + b, 0) / grouped[keys[0]].length;
            return [
                { x: keys[0], y: singleVal, min: singleVal, max: singleVal, hasActualLog: true },
                { x: keys[0], y: singleVal, min: singleVal, max: singleVal, hasActualLog: true }
            ];
        }

        return keys.map(key => {
            const vals = grouped[key];
            const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
            return { x: key, y: Math.round(avg), min: Math.min(...vals), max: Math.max(...vals), hasActualLog: true };
        }).reverse();
    }, [vitals, timeRange]);

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

    // Stagger animation
    const staggerAnims = useRef([...Array(5)].map(() => new Animated.Value(0))).current;
    const runAnimations = useCallback(() => {
        staggerAnims.forEach(a => a.setValue(0));
        Animated.stagger(80, staggerAnims.map(a =>
            Animated.timing(a, { toValue: 1, duration: 450, useNativeDriver: true })
        )).start();
    }, [staggerAnims]);

    useFocusEffect(useCallback(() => { runAnimations(); return () => {}; }, [runAnimations]));

    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, visible: false, value: 0, label: '' });
    const tooltipFade = useRef(new Animated.Value(0)).current;

    const showTooltip = (x, y, value, label) => {
        setTooltipPos({ x, y, visible: true, value, label });
        Animated.timing(tooltipFade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    };
    const hideTooltip = () => {
        Animated.timing(tooltipFade, { toValue: 0, duration: 150, useNativeDriver: true }).start(() =>
            setTooltipPos(prev => ({ ...prev, visible: false }))
        );
    };

    // Header dimensions derived from insets
    const headerPaddingTop = Math.max(insets.top, 24);
    const headerHeight = headerPaddingTop + 58;

    // ─── Render: Header ──────────────────────────────────────────
    const renderHeader = () => {
        const headerOpacity = scrollY.interpolate({ inputRange: [0, 40], outputRange: [0, 1], extrapolate: 'clamp' });
        return (
            <View style={[styles.glassHeader, { height: headerHeight, paddingTop: headerPaddingTop }]}>
                <LinearGradient colors={['rgba(255,255,255,0.98)', 'rgba(255,255,255,0.92)']} style={StyleSheet.absoluteFill} />
                <View style={styles.headerContent}>
                    <Pressable 
                        onPress={() => navigation.goBack()} 
                        style={styles.headerBackBtn}
                        hitSlop={10}
                    >
                        <ChevronLeft size={22} color="#0F172A" strokeWidth={2.5} />
                    </Pressable>
                    <View style={styles.headerTitleCenter}>
                        <Text style={styles.headerEyebrow}>HEALTH TELEMETRY</Text>
                        <Text style={styles.headerTitle}>Vitals History</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>
                <Animated.View style={[styles.headerBorderLine, { opacity: headerOpacity }]} />
            </View>
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
        if (!vitals.length) return null;

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
                <Text style={styles.sectionEyebrow}>CURRENT BIOMETRIC STATE</Text>
                <AnimatedCard 
                    pressScale={0.98} 
                    hapticType="selection"
                    sharedTransitionTag={`vitals_card_${def.id}`}
                    style={styles.heroCardContainer}
                    innerStyle={styles.heroCardInner}
                >
                    <View style={styles.heroTop}>
                        <View style={styles.heroLeft}>
                            <View style={[styles.heroIconCircle, { backgroundColor: def.bgTint }]}>
                                <def.icon size={22} color={def.accent} strokeWidth={2.5} />
                            </View>
                            <View>
                                <Text style={styles.heroLabel}>LATEST {def.title}</Text>
                                <View style={styles.heroValueContainer}>
                                    {altVal ? (
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <AnimatedCounter 
                                                value={latestVal} 
                                                decimals={0} 
                                                style={styles.heroValue}
                                                fromValue={def.id === 'blood_pressure' ? 80 : 50}
                                            />
                                            <Text style={styles.heroValue}>/</Text>
                                            <AnimatedCounter 
                                                value={altVal} 
                                                decimals={0} 
                                                style={styles.heroValue}
                                                fromValue={50}
                                            />
                                        </View>
                                    ) : (
                                        <AnimatedCounter 
                                            value={latestVal} 
                                            decimals={def.id === 'heart_rate' ? 0 : 1} 
                                            style={styles.heroValue}
                                            fromValue={def.id === 'heart_rate' ? 50 : def.id === 'oxygen_saturation' ? 80 : 40}
                                        />
                                    )}
                                    <Text style={styles.heroUnit}> {def.unit}</Text>
                                </View>
                            </View>
                        </View>
                        
                        <View style={[styles.statusBadge, { backgroundColor: status.color + '15' }]}>
                            <StatusIcon size={13} color={status.color} strokeWidth={2.5} style={{ marginRight: 4 }} />
                            <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
                        </View>
                    </View>
                    
                    <View style={styles.heroFooter}>
                        <View style={styles.heroComparisonRow}>
                            <TrendingUp size={12} color="#64748B" style={{ marginRight: 4 }} />
                            <Text style={styles.heroComparisonText}>{comparison}</Text>
                        </View>
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

                <CustomCalendarPicker
                    visible={showCustomStartPicker}
                    onClose={() => setShowCustomStartPicker(false)}
                    initialDate={customStartDate}
                    title="Start Date"
                    onSelectDate={(d) => {
                        if (d) setCustomStartDate(d);
                    }}
                />
                <CustomCalendarPicker
                    visible={showCustomEndPicker}
                    onClose={() => setShowCustomEndPicker(false)}
                    initialDate={customEndDate}
                    title="End Date"
                    onSelectDate={(d) => {
                        if (d) setCustomEndDate(d);
                    }}
                />
            </Animated.View>
        );
    };

    // ─── Render: Quick Stats (Unified Card) ──────────────────────
    const renderQuickStats = (def) => {
        const stats = getStats(def.id);
        if (!stats) return null;

        const getFontSize = (val) => {
            const str = String(val || '');
            if (str.length > 5) return 16;
            if (str.length > 3) return 19;
            return 22;
        };

        const renderStatValue = (val) => {
            const str = String(val || '');
            if (str.includes('/')) {
                const parts = str.split('/');
                const val1 = Number(parts[0]) || 0;
                const val2 = Number(parts[1]) || 0;
                const fontSize = getFontSize(str);
                return (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <AnimatedCounter value={val1} decimals={0} style={[styles.statValue, { fontSize, minWidth: 28, textAlign: 'right' }]} />
                        <Text style={[styles.statValue, { fontSize, marginTop: -2 }]}>/</Text>
                        <AnimatedCounter value={val2} decimals={0} style={[styles.statValue, { fontSize, minWidth: 28, textAlign: 'left' }]} />
                    </View>
                );
            }
            const num = Number(str);
            if (isNaN(num)) {
                return <Text style={[styles.statValue, { fontSize: getFontSize(str) }]}>{str}</Text>;
            }
            const decimals = str.includes('.') ? 1 : 0;
            return (
                <AnimatedCounter 
                    value={num} 
                    decimals={decimals} 
                    style={[styles.statValue, { fontSize: getFontSize(str), minWidth: 36, textAlign: 'center' }]} 
                />
            );
        };

        return (
            <Animated.View style={[{ opacity: staggerAnims[1] }, styles.statsCardContainer]}>
                <Text style={styles.sectionEyebrow}>METRIC SUMMARY</Text>
                <View style={styles.statsUnifiedCard}>
                    <View style={styles.statColumn}>
                        <View style={styles.statHeader}>
                            <Text style={styles.statLabel}>Average</Text>
                            <BarChart3 size={12} color="#64748B" />
                        </View>
                        <View style={styles.statValueRow}>
                            {renderStatValue(stats.avg)}
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
                            {renderStatValue(stats.min)}
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
                            {renderStatValue(stats.max)}
                            <Text style={styles.statUnit}>{stats.unit}</Text>
                        </View>
                    </View>
                </View>
            </Animated.View>
        );
    };

    // ─── Render: Trend Chart ─────────────────────────────────────
    const renderTrendChart = (def) => {
        if (!vitals.length) return null;

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
            fillShadowGradient: def.accent, 
            fillShadowGradientOpacity: 0.15,
            fillShadowGradientFrom: def.accent, 
            fillShadowGradientTo: '#FFFFFF',
            useShadowColorFromDataset: false,
        };

        // Trend Summary Sentence
        let trendSummary = 'Stable telemetry over selected timeframe.';
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

        const chartWidth = Math.max(SCREEN_W - 76, 280);

        return (
            <Animated.View style={{ opacity: staggerAnims[2], marginBottom: 20 }}>
                <Text style={styles.sectionEyebrow}>TELEMETRY TRENDS</Text>
                <View style={styles.chartCard}>
                    <View style={[styles.cardTopAccent, { backgroundColor: def.accent }]} />
                    <View style={styles.chartTitleRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.chartTitle}>{def.title} Trend</Text>
                            <Text style={styles.chartSubtitle}>
                                {timeRange === 'today' ? "Today's readings" : `Last ${timeRange === '7d' ? '7 days' : '30 days'} history`}
                            </Text>
                        </View>
                        <Pressable onPress={() => setIsFullscreen(true)} style={styles.expandBtn} hitSlop={8}>
                            <Maximize2 size={16} color="#64748B" />
                        </Pressable>
                    </View>

                    {dataRefreshing ? (
                        <View style={{ height: 210, justifyContent: 'center', alignItems: 'center' }}>
                            <ActivityIndicator color={def.accent} size="small" />
                        </View>
                    ) : timeRange !== 'today' && rangeData.length > 0 ? (
                        <View style={styles.victoryContainer}>
                            <ChartErrorBoundary>
                                <View style={{ alignItems: 'center' }}>
                                    <LineChart
                                        data={{
                                            labels: rangeData.map((d, i) => (i === 0 || i === Math.floor(rangeData.length / 2) || i === rangeData.length - 1) ? d.x : ''),
                                            datasets: [
                                                { data: finalMaxData, color: () => 'transparent', strokeWidth: 0, withDots: false },
                                                { data: finalMinData, color: () => 'transparent', strokeWidth: 0, withDots: false },
                                                { data: rangeData.map(d => d.y || 0), color: () => def.accent, strokeWidth: 3 },
                                            ],
                                        }}
                                        width={chartWidth} 
                                        height={210} 
                                        chartConfig={chartConfig}
                                        bezier={rangeData.length > 2} 
                                        style={styles.chart}
                                        withVerticalLines={false} 
                                        fromZero={false}
                                        onDataPointClick={({ x, y, value, index }) => showTooltip(x, y, value, rangeData[index]?.x || '')}
                                        decorator={() => (
                                            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                                                {renderChartInteraction(def)}
                                                <PulsingDot latestX={latestX} latestY={latestY} hasLatestPoint={hasLatestPoint} color={def.accent} />
                                            </View>
                                        )}
                                        renderDotContent={({ x, y, index }) => {
                                            // Place pulsing dot on the latest actual logged day or the last item
                                            const lastActualIdx = rangeData.reduce((acc, d, i) => d.hasActualLog ? i : acc, -1);
                                            const targetIdx = lastActualIdx !== -1 ? lastActualIdx : rangeData.length - 1;
                                            if (index === targetIdx) {
                                                latestX.value = x;
                                                latestY.value = y;
                                                hasLatestPoint.value = true;
                                            }
                                            return null;
                                        }}
                                    />
                                    {tooltipPos.visible && <Pressable style={StyleSheet.absoluteFill} onPress={hideTooltip} />}
                                </View>
                            </ChartErrorBoundary>
                        </View>
                    ) : hasData ? (
                        <ChartErrorBoundary>
                            <View style={{ alignItems: 'center' }}>
                                <LineChart
                                    data={{
                                        labels: labels.map((l, i) => (i === 0 || i === Math.floor(labels.length / 2) || i === labels.length - 1) ? l : ''),
                                        datasets: [
                                            { data: finalMaxData, color: () => 'transparent', strokeWidth: 0, withDots: false },
                                            { data: finalMinData, color: () => 'transparent', strokeWidth: 0, withDots: false },
                                            { data: mainData.length === 1 ? [mainData[0], mainData[0]] : mainData, color: () => def.accent, strokeWidth: 3 },
                                            ...(def.extractAlt ? [{ data: vitals.map(v => Number(def.extractAlt(v)) || 0).reverse(), color: () => '#94A3B840', strokeWidth: 2, withDots: false }] : [])
                                        ]
                                    }}
                                    width={chartWidth} 
                                    height={200} 
                                    chartConfig={chartConfig}
                                    bezier={mainData.length > 2} 
                                    style={styles.chart}
                                    withVerticalLines={false} 
                                    fromZero={false}
                                    onDataPointClick={({ x, y, value, index }) => showTooltip(x, y, value, labels[index] || '')}
                                    decorator={() => (
                                        <View style={StyleSheet.absoluteFill} pointerEvents="none">
                                            {renderChartInteraction(def)}
                                            <PulsingDot latestX={latestX} latestY={latestY} hasLatestPoint={hasLatestPoint} color={def.accent} />
                                        </View>
                                    )}
                                    renderDotContent={({ x, y, index }) => {
                                        if (index === mainData.length - 1) {
                                            latestX.value = x;
                                            latestY.value = y;
                                            hasLatestPoint.value = true;
                                        }
                                        return null;
                                    }}
                                />
                                {tooltipPos.visible && <Pressable style={StyleSheet.absoluteFill} onPress={hideTooltip} />}
                            </View>
                        </ChartErrorBoundary>
                    ) : (
                        <View style={styles.emptyChartBox}>
                            <Text style={styles.emptyChartText}>No records logged for this period</Text>
                        </View>
                    )}

                    <View style={styles.trendSummaryRow}>
                        <TrendIcon size={14} color={trendColor} style={{ marginRight: 6 }} />
                        <Text style={[styles.trendSummaryText, { color: trendColor }]}>{trendSummary}</Text>
                    </View>
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
                <Svg height="240" width={SCREEN_W - 64} style={{ position: 'absolute' }}>
                    <Line x1={x} y1={0} x2={x} y2={240} stroke={def.accent} strokeWidth="1.5" strokeDasharray="5, 5" />
                    <Circle cx={x} cy={y} r={6} fill="#FFFFFF" stroke={def.accent} strokeWidth="3" />
                </Svg>
                <View style={[styles.tooltipContainer, { top: y - 65, left: Math.max(x - 50, 10) }]}>
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
                        <X size={24} color="#1E293B" strokeWidth={2.5} />
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
                                        ? rangeData.map((d, i) => i % Math.ceil(rangeData.length / 10) === 0 ? d.x : '')
                                        : labels.map((l, i) => i % Math.ceil(labels.length / 8) === 0 ? l : ''),
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
                                bezier={timeRange !== 'today' ? rangeData.length > 2 : mainData.length > 2}
                                style={styles.landscapeChart}
                                withVerticalLines={false} fromZero={false}
                                onDataPointClick={({ x, y, value, index }) => showTooltip(x, y, value, timeRange !== 'today' ? rangeData[index]?.x || '' : labels[index] || '')}
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
        const altVal = def.extractAlt ? def.extractAlt(latest) : null;
        const status = getClinicalStatus(def.id, val, altVal);
        const clinicalText = def.insight ? def.insight(val) : 'Stable readings recorded.';
        const recommendationText = def.recommendation || 'Consistency in taking prescribed medications helps maintain steady vital trends.';
        
        const adherenceDetails = usePatientStore.getState().adherenceDetails;
        const isAdherenceHigh = adherenceDetails?.rate >= 80 || adherenceDetails?.streak >= 3;

        return (
            <Animated.View style={{ opacity: staggerAnims[3], marginBottom: 20 }}>
                <Text style={styles.sectionEyebrow}>CLINICAL INSIGHTS</Text>
                <View style={styles.coachCard}>
                    <View style={styles.coachHeader}>
                        <View style={styles.coachTitleGroup}>
                            <View style={[styles.coachIconBubble, { backgroundColor: def.bgTint }]}>
                                <Sparkles size={16} color={def.accent} fill={def.accent} />
                            </View>
                            <View>
                                <Text style={styles.coachTitle}>Biometric Analysis</Text>
                                <Text style={styles.coachSubtitle}>Personalized Telemetry Summary</Text>
                            </View>
                        </View>
                        <View style={[styles.coachStatusPill, { backgroundColor: status.color + '15' }]}>
                            <View style={[styles.coachStatusDot, { backgroundColor: status.color }]} />
                            <Text style={[styles.coachStatusPillText, { color: status.color }]}>{status.label}</Text>
                        </View>
                    </View>

                    <View style={styles.coachBody}>
                        <Text style={styles.coachInsightText}>{clinicalText}</Text>
                        
                        <View style={styles.coachRecommendationBox}>
                            <ShieldCheck size={16} color="#4F46E5" style={{ marginTop: 2, marginRight: 10 }} />
                            <Text style={styles.coachRecommendationText}>{recommendationText}</Text>
                        </View>

                        <View style={styles.coachAdherenceRow}>
                            <CircleCheckBig size={14} color="#6366F1" style={{ marginRight: 8 }} />
                            <Text style={styles.coachAdherenceText}>
                                {isAdherenceHigh
                                    ? "Medication Adherence: Consistent routine aligns with stable vitals."
                                    : "Care Tip: Taking medications on time improves vital stability."}
                            </Text>
                        </View>
                    </View>
                </View>
            </Animated.View>
        );
    };

    // ─── Render: Timeline List ───────────────────────────────────
    const renderTimeline = (def) => {
        if (!vitals.length) return null;
        return (
            <Animated.View style={[{ opacity: staggerAnims[4] }, { marginBottom: 20 }]}>
                <Text style={styles.sectionEyebrow}>RECENT READINGS</Text>
                <View style={styles.timelineCardList}>
                    {vitals.map((log, idx) => {
                        const value = def.extract(log);
                        const altValue = def.extractAlt ? def.extractAlt(log) : null;
                        const status = getClinicalStatus(def.id, value, altValue);
                        
                        const formattedValue = altValue ? `${value}/${altValue}` : value;
                        const timeStr = new Date(log.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }).toLowerCase();
                        const dateStr = new Date(log.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                        const isDeviceSync = log.source && log.source !== 'manual';

                        return (
                            <Pressable 
                                key={log._id || idx}
                                onPress={() => setSelectedDetailLog(log)}
                                style={({ pressed }) => [
                                    styles.readingCard,
                                    pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }
                                ]}
                            >
                                <View style={styles.readingCardLeft}>
                                    <View style={[styles.readingIconCircle, { backgroundColor: def.bgTint }]}>
                                        <def.icon size={18} color={def.accent} strokeWidth={2.5} />
                                    </View>
                                    <View>
                                        <View style={styles.readingValueRow}>
                                            <Text style={styles.readingValue}>{formattedValue}</Text>
                                            <Text style={styles.readingUnit}>{def.unit}</Text>
                                        </View>
                                        <Text style={styles.readingDate}>{dateStr} · {timeStr}</Text>
                                    </View>
                                </View>

                                <View style={styles.readingCardRight}>
                                    <View style={[styles.readingStatusBadge, { backgroundColor: status.color + '15' }]}>
                                        <View style={[styles.readingStatusDot, { backgroundColor: status.color }]} />
                                        <Text style={[styles.readingStatusText, { color: status.color }]}>{status.label}</Text>
                                    </View>
                                    <Text style={[styles.readingSourceBadge, isDeviceSync && styles.readingSourceSync]}>
                                        {isDeviceSync ? 'Synced' : 'Manual'}
                                    </Text>
                                </View>
                            </Pressable>
                        );
                    })}
                </View>
            </Animated.View>
        );
    };

    // ─── Render: Unified Empty State ─────────────────────────────
    const renderUnifiedEmptyState = (def) => (
        <Animated.View style={[styles.emptyContainer, { opacity: staggerAnims[0] }]}>
            <View style={styles.emptyCard}>
                <View style={[styles.emptyIconCircle, { backgroundColor: def.bgTint }]}>
                    <def.icon size={36} color={def.accent} strokeWidth={2} />
                </View>
                <Text style={styles.emptyTitle}>No {def.title} Records</Text>
                <Text style={styles.emptySub}>
                    Log your first {def.title.toLowerCase()} reading to unlock automated trends, health coach insights, and telemetry charts.
                </Text>
                <Pressable 
                    style={styles.emptyActionBtn}
                    onPress={() => {
                        setIsLoggingExpanded(true);
                    }}
                >
                    <LinearGradient colors={['#6366F1', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emptyActionGradient}>
                        <PlusCircle size={16} color="#FFFFFF" />
                        <Text style={styles.emptyActionTxt}>Log {def.title} Now</Text>
                    </LinearGradient>
                </Pressable>
            </View>
        </Animated.View>
    );

    // ─── Render: Skeletons ────────────────────────────────────────
    const renderHeroCardSkeleton = () => (
        <View style={[styles.skeletonHeroCard, { marginBottom: 20 }]}>
            <View style={styles.skeletonHeroTop}>
                <View style={{ gap: 8 }}>
                    <SkeletonItem width={100} height={12} borderRadius={4} />
                    <SkeletonItem width={140} height={24} borderRadius={6} />
                    <SkeletonItem width={110} height={14} borderRadius={4} />
                </View>
                <SkeletonItem width={70} height={24} borderRadius={12} />
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
        <View style={[styles.chartCard, { height: 240, justifyContent: 'center' }]}>
            <View style={[styles.cardTopAccent, { backgroundColor: '#E2E8F0' }]} />
            <ActivityIndicator color="#6366F1" size="small" />
        </View>
    );

    const renderErrorBanner = () => {
        if (!error && !isOffline) return null;
        return (
            <View style={[styles.errorBanner, isOffline && { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                {isOffline ? <Clock size={18} color="#DC2626" /> : <TriangleAlert size={18} color="#DC2626" />}
                <Text style={styles.errorText}>
                    {isOffline ? 'Offline Mode Active. Changes will sync automatically when connected.' : error}
                </Text>
                {!isOffline && error && (
                    <Pressable style={styles.retryBtn} onPress={() => fetchChartData(false)}>
                        <RefreshCw size={13} color="#FFF" />
                        <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                )}
            </View>
        );
    };

    // ─── Main Render ─────────────────────────────────────────────
    const def = CHART_DEFS.find(c => c.id === activeMetricId) || CHART_DEFS[0];

    return (
        <TabScreenTransition>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
                {renderFullscreenChart()}
                <View style={styles.container}>
                    {renderHeader()}
                    
                    {/* Ambient Glow Backdrop */}
                    <LinearGradient colors={['#EEF2FF', 'rgba(238,242,255,0.0)', 'rgba(248,250,252,0.0)']} style={styles.ambientGlow} />

                    <Animated.ScrollView
                        contentContainerStyle={[
                            styles.scrollContent,
                            { paddingTop: headerHeight + 14 }
                        ]}
                        showsVerticalScrollIndicator={false}
                        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
                        scrollEventThrottle={16}
                    >
                        {/* 1. Metric tabs */}
                        {renderMetricSelector()}

                        {/* 2. Latest Reading Hero Card */}
                        {initialLoading ? renderHeroCardSkeleton() : renderHeroCard(def)}

                        {/* 3. Time Range chips */}
                        {renderTimeRangeSelector()}
                        {renderCustomDatePicker()}

                        {/* Error and sync warnings */}
                        {renderErrorBanner()}

                        {/* 4. Quick Stats & Chart Analytics */}
                        {initialLoading ? (
                            <>
                                {renderSummaryStatsSkeleton()}
                                {renderChartCardSkeleton()}
                            </>
                        ) : vitals.length === 0 ? (
                            renderUnifiedEmptyState(def)
                        ) : (
                            <>
                                {renderQuickStats(def)}
                                {renderTrendChart(def)}
                                {renderAIHealthCoach(def)}
                                {renderTimeline(def)}
                            </>
                        )}

                        {/* 5. Collapsible Log Form Drawer */}
                        <Animated.View style={{ marginTop: 8, marginBottom: 16 }}>
                            <Text style={styles.sectionEyebrow}>LOG NEW READING</Text>
                            <View style={styles.formCardContainer}>
                                <View style={[styles.cardTopAccent, { backgroundColor: '#6366F1' }]} />
                                <Pressable 
                                    style={styles.logToggleRow} 
                                    onPress={() => { setIsLoggingExpanded(!isLoggingExpanded); setFormError(null); }}
                                >
                                    <View style={styles.logTitleGroup}>
                                        <View style={styles.logIconCircle}>
                                            <PlusCircle size={20} color="#6366F1" />
                                        </View>
                                        <View>
                                            <Text style={styles.formTitle}>Record Vitals Entry</Text>
                                            <Text style={styles.formSubtitle}>Manual telemetry measurement</Text>
                                        </View>
                                    </View>
                                    {isLoggingExpanded ? <ChevronUp size={20} color="#64748B" /> : <ChevronDown size={20} color="#64748B" />}
                                </Pressable>

                                {isLoggingExpanded && (
                                    <View style={styles.formArea}>
                                        {formError && (
                                            <View style={[styles.errorBanner, { marginBottom: 14 }]}>
                                                <TriangleAlert size={15} color="#DC2626" />
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
                                                    : <><Zap size={16} color="#FFF" /><Text style={styles.submitTxt}>Save Biometric Reading</Text></>
                                                }
                                            </LinearGradient>
                                        </Pressable>
                                    </View>
                                )}
                            </View>
                        </Animated.View>
                    </Animated.ScrollView>

                    {/* Vitals Log Detail Bottom Sheet */}
                    <BottomSheetWrapper
                        isOpen={selectedDetailLog !== null}
                        onClose={() => setSelectedDetailLog(null)}
                        snapPoints={['42%', '65%']}
                        title={def ? `${def.title} Log Details` : "Log Details"}
                    >
                        {selectedDetailLog && (() => {
                            const log = selectedDetailLog;
                            const value = def.extract(log);
                            const altValue = def.extractAlt ? def.extractAlt(log) : null;
                            const status = getClinicalStatus(def.id, value, altValue);
                            const formattedValue = altValue ? `${value}/${altValue}` : value;
                            
                            const timeStr = new Date(log.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                            const dateStr = new Date(log.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                            const sourceLabel = log.source && log.source !== 'manual' ? "Device / Wearable Sync" : "Manual Log Entry";
                            
                            return (
                                <View style={{ gap: 18 }}>
                                    {/* Prominent display */}
                                    <View style={{ alignItems: 'center', backgroundColor: '#F8FAFC', padding: 22, borderRadius: 20, borderWidth: 1, borderColor: '#F1F5F9', gap: 6 }}>
                                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.8 }}>Recorded Measurement</Text>
                                        <Text style={{ fontSize: 36, fontWeight: '900', color: '#0F172A' }}>
                                            {formattedValue} <Text style={{ fontSize: 18, color: '#64748B', fontWeight: '700' }}>{def.unit}</Text>
                                        </Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: status.dot + '15', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginTop: 4 }}>
                                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: status.dot }} />
                                            <Text style={{ fontSize: 12, fontWeight: '800', color: status.dot, textTransform: 'uppercase', letterSpacing: 0.5 }}>{status.label}</Text>
                                        </View>
                                    </View>

                                    {/* Log Meta Details */}
                                    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden' }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                                            <Text style={{ fontSize: 14, color: '#64748B', fontWeight: '600' }}>Log Date</Text>
                                            <Text style={{ fontSize: 14, color: '#0F172A', fontWeight: '700' }}>{dateStr}</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                                            <Text style={{ fontSize: 14, color: '#64748B', fontWeight: '600' }}>Log Time</Text>
                                            <Text style={{ fontSize: 14, color: '#0F172A', fontWeight: '700' }}>{timeStr}</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 15 }}>
                                            <Text style={{ fontSize: 14, color: '#64748B', fontWeight: '600' }}>Source</Text>
                                            <Text style={{ fontSize: 14, color: '#0F172A', fontWeight: '700' }}>{sourceLabel}</Text>
                                        </View>
                                    </View>

                                    {/* Dismiss button */}
                                    <Pressable
                                        onPress={() => setSelectedDetailLog(null)}
                                        style={{
                                            backgroundColor: '#F1F5F9',
                                            paddingVertical: 14,
                                            borderRadius: 16,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginTop: 6
                                        }}
                                    >
                                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#475569' }}>Close Details</Text>
                                    </Pressable>
                                </View>
                            );
                        })()}
                    </BottomSheetWrapper>
                </View>
            </KeyboardAvoidingView>
        </TabScreenTransition>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    ambientGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 280, zIndex: 0 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: layout.TAB_BAR_CLEARANCE + 32 },

    /* Glass Header */
    glassHeader: {
        position: 'absolute', 
        top: 0, 
        left: 0, 
        right: 0,
        zIndex: 100, 
        justifyContent: 'center',
    },
    headerContent: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingHorizontal: 18,
        height: 52,
    },
    headerTitleCenter: { 
        flex: 1, 
        alignItems: 'center', 
        justifyContent: 'center',
    },
    headerBackBtn: { 
        width: 40, 
        height: 40, 
        borderRadius: 12, 
        backgroundColor: '#FFFFFF', 
        alignItems: 'center', 
        justifyContent: 'center', 
        borderWidth: 1, 
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    headerEyebrow: { 
        fontSize: 10, 
        fontWeight: '800', 
        color: '#7C3AED', 
        letterSpacing: 1.2, 
        textTransform: 'uppercase', 
        marginBottom: 1,
    },
    headerTitle: { 
        fontSize: 17, 
        fontWeight: '900', 
        color: '#0F172A', 
        letterSpacing: -0.3,
    },
    headerBorderLine: { 
        position: 'absolute', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        height: 1, 
        backgroundColor: '#E2E8F0',
    },

    sectionEyebrow: {
        fontSize: 11,
        fontWeight: '800',
        color: '#7C3AED',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginBottom: 10,
        marginLeft: 2,
    },

    /* Metric Selector Tabs */
    metricSelectorContainer: { marginBottom: 16, zIndex: 10 },
    metricTabsContent: { paddingHorizontal: 2, gap: 10, paddingBottom: 4 },
    metricTab: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 16, paddingVertical: 10, borderRadius: 30,
        backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
        overflow: 'hidden',
    },
    metricTabText: { fontSize: 13, fontWeight: '800', color: '#475569' },
    metricTabTextActive: { color: '#FFFFFF' },

    /* Hero Card */
    heroCardContainer: { marginBottom: 20 },
    heroCardInner: { padding: 18 },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    heroLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    heroIconCircle: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
    heroLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
    heroValueContainer: { flexDirection: 'row', alignItems: 'baseline' },
    heroValue: { fontSize: 32, fontWeight: '900', color: '#0F172A', letterSpacing: -1 },
    heroUnit: { fontSize: 13, fontWeight: '800', color: '#64748B' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    statusBadgeText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.3 },
    heroFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F8FAFC', paddingTop: 14 },
    heroComparisonRow: { flexDirection: 'row', alignItems: 'center' },
    heroComparisonText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
    heroTimeText: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },

    /* Time Range Chips */
    timeRangeContainer: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    rangeBtn: { flex: 1, paddingVertical: 9, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    rangeBtnActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
    rangeTxt: { fontSize: 12, fontWeight: '800', color: '#64748B' },
    rangeTxtActive: { color: '#FFFFFF' },

    /* Custom Date Pickers */
    datePickerContainer: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
    datePickerRow: { flexDirection: 'row', alignItems: 'center' },
    dateArrow: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
    dateBox: { flex: 1, marginHorizontal: 8, backgroundColor: '#F9FAFB', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
    dateLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 2, letterSpacing: 0.5 },
    dateValue: { fontSize: 13, fontWeight: '900', color: '#0F172A' },

    /* Stats Scroll & Unified Card */
    statsCardContainer: { marginBottom: 20 },
    statsUnifiedCard: {
        backgroundColor: '#FFFFFF', borderRadius: 20, paddingVertical: 16, paddingHorizontal: 12,
        flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden',
        shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2
    },
    statColumn: { flex: 1, alignItems: 'center' },
    statDivider: { width: 1, height: 32, backgroundColor: '#E2E8F0' },
    statHeader: { flexDirection: 'row', gap: 4, alignItems: 'center', marginBottom: 6 },
    statLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 },
    statValueRow: { flexDirection: 'column', alignItems: 'center', marginTop: 2 },
    statValue: { fontSize: 22, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
    statUnit: { fontSize: 10, fontWeight: '700', color: '#94A3B8', marginTop: 2 },

    /* Chart Card */
    chartCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, marginBottom: 20,
        borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden', position: 'relative',
        shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2
    },
    cardTopAccent: { 
        position: 'absolute', 
        top: 1, 
        left: 1, 
        right: 1, 
        height: 3, 
        borderTopLeftRadius: 23, 
        borderTopRightRadius: 23 
    },
    chartTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingTop: 4 },
    chartTitle: { fontSize: 15, fontWeight: '900', color: '#0F172A' },
    chartSubtitle: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 1 },
    chart: { borderRadius: 16, marginVertical: 4 },
    expandBtn: { padding: 6, backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
    trendSummaryRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12, marginTop: 8 },
    trendSummaryText: { fontSize: 12, fontWeight: '800' },

    emptyChartBox: { height: 130, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed' },
    emptyChartText: { color: '#94A3B8', fontStyle: 'italic', fontSize: 13, fontWeight: '500' },
    victoryContainer: { marginTop: 4 },

    /* AI Coach Card */
    coachCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 20,
        borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden', shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2
    },
    coachHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    coachTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    coachIconBubble: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    coachTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
    coachSubtitle: { fontSize: 11, fontWeight: '600', color: '#94A3B8', marginTop: 1 },
    coachStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
    coachStatusDot: { width: 6, height: 6, borderRadius: 3 },
    coachStatusPillText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
    coachBody: { marginTop: 2 },
    coachInsightText: { fontSize: 14, fontWeight: '700', color: '#1E293B', lineHeight: 21 },
    coachRecommendationBox: { 
        flexDirection: 'row', 
        backgroundColor: '#F5F3FF', 
        borderRadius: 14, 
        padding: 12, 
        marginTop: 12,
        borderWidth: 1, 
        borderColor: '#EDE9FE' 
    },
    coachRecommendationText: { fontSize: 12, fontWeight: '600', color: '#4338CA', lineHeight: 18, flex: 1 },
    coachAdherenceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
    coachAdherenceText: { fontSize: 12, color: '#4F46E5', fontWeight: '700', flex: 1 },

    /* Recent Readings Card List */
    timelineCardList: { gap: 10 },
    readingCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        padding: 15,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 1,
    },
    readingCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    readingIconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    readingValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    readingValue: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
    readingUnit: { fontSize: 12, fontWeight: '700', color: '#64748B' },
    readingDate: { fontSize: 11, fontWeight: '600', color: '#94A3B8', marginTop: 2 },
    readingCardRight: { alignItems: 'flex-end', gap: 4 },
    readingStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
    readingStatusDot: { width: 5, height: 5, borderRadius: 2.5 },
    readingStatusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    readingSourceBadge: { fontSize: 10, fontWeight: '700', color: '#64748B', backgroundColor: '#F1F5F9', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
    readingSourceSync: { color: '#6366F1', backgroundColor: '#EEF2FF' },

    /* Unified Empty State */
    emptyContainer: { marginBottom: 20 },
    emptyCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 28,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 10,
        elevation: 2,
    },
    emptyIconCircle: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    emptyTitle: { color: '#0F172A', fontSize: 17, fontWeight: '900' },
    emptySub: { color: '#64748B', fontSize: 13, marginTop: 8, textAlign: 'center', paddingHorizontal: 12, lineHeight: 20 },
    emptyActionBtn: { marginTop: 18, borderRadius: 14, overflow: 'hidden', width: '100%' },
    emptyActionGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
    emptyActionTxt: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

    /* Form Card */
    formCardContainer: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18,
        borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden', position: 'relative',
        shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2
    },
    logToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
    logTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    logIconCircle: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
    formTitle: { fontSize: 15, fontWeight: '900', color: '#0F172A' },
    formSubtitle: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 1 },
    formArea: { marginTop: 16 },
    formDivider: { height: 1, backgroundColor: '#F1F5F9', marginBottom: 16 },
    formRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
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

    /* Skeletons */
    skeletonHeroCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.02, shadowRadius: 6, elevation: 1 },
    skeletonHeroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },

    /* Landscape / Fullscreen */
    landscapeContainer: { flex: 1, backgroundColor: '#FFFFFF', padding: 16, justifyContent: 'center' },
    landscapeHeader: { position: 'absolute', top: 20, left: 24, zIndex: 90 },
    landscapeTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A' },
    landscapeSubtitle: { fontSize: 12, fontWeight: '700', color: '#64748B', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
    landscapeChart: { borderRadius: 20, alignSelf: 'center' },
    closeFullscreenBtn: { position: 'absolute', top: 20, right: 20, zIndex: 1000, backgroundColor: '#F1F5F9', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 6 },
    tooltipContainer: { position: 'absolute', backgroundColor: '#0F172A', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
    tooltipLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    tooltipValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
    tooltipUnit: { color: '#94A3B8', fontSize: 10, fontWeight: '600' },
    tooltipArrow: { position: 'absolute', bottom: -5, width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 5, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#0F172A' },
});
