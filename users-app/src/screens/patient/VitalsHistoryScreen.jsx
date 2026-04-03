import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Platform, Pressable,
    ActivityIndicator, TextInput, KeyboardAvoidingView, Dimensions, Animated,
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
    Maximize2, X
} from 'lucide-react-native';
import Svg, { Line, Path, Circle } from 'react-native-svg';
import axiosInstance, { handleAxiosError } from '../../lib/axiosInstance';
import { apiService } from '../../lib/api';
import { colors } from '../../theme';

// ─── Simple Error Boundary ───────────────────────────────────
class ChartErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(error) { return { hasError: true }; }
    componentDidCatch(error, errorInfo) { console.error("Chart Error:", error, errorInfo); }
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

// ─── Chart configuration builder (light theme) ─────────────────
const makeChartConfig = (accentColor) => ({
    backgroundGradientFrom: '#FFFFFF',
    backgroundGradientTo: '#FFFFFF',
    decimalPlaces: 0,
    color: (opacity = 1) => {
        if (accentColor && accentColor.startsWith('#')) {
            const r = parseInt(accentColor.slice(1, 3), 16);
            const g = parseInt(accentColor.slice(3, 5), 16);
            const b = parseInt(accentColor.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }
        return accentColor ? accentColor.replace(')', `, ${opacity})`).replace('rgb', 'rgba') : `rgba(0,0,0,${opacity})`;
    },
    labelColor: () => '#94A3B8',
    propsForDots: { r: '5', strokeWidth: '2', stroke: '#FFFFFF' },
    propsForBackgroundLines: { stroke: '#F1F5F9', strokeDasharray: '' },
    style: { borderRadius: 16 },
    paddingRight: 40,
});

// ─── Metric definitions ────────────────────────────────────────
const CHART_DEFS = [
    {
        id: 'heart_rate', title: 'Heart rate', unit: 'bpm', yLabel: 'bpm',
        icon: Heart, accent: '#CC5B31', bgTint: '#FFF7F5',
        extract: (v) => v.heart_rate || 0,
        normalRange: [60, 100],
        insight: (val) => val < 60 ? "Your heart rate is slightly lower than usual." : val > 100 ? "Heart rate is a bit elevated. Take it easy!" : "Your heart rate is perfectly in the zone today.",
    },
    {
        id: 'blood_pressure', title: 'BP systolic', unit: 'mmHg', yLabel: 'mmHg',
        icon: Activity, accent: '#4B88D6', accentAlt: '#94A3B8',
        bgTint: '#F0F7FF',
        extract: (v) => v.blood_pressure?.systolic || 0,
        extractAlt: (v) => v.blood_pressure?.diastolic || 0,
        legend: ['Systolic', 'Diastolic'],
        normalRange: [90, 140],
        insight: (val) => val > 140 ? "Systolic pressure is high. Avoid caffeine." : "Your blood pressure is within a healthy range.",
    },
    {
        id: 'oxygen_saturation', title: 'SpO₂', unit: '%', yLabel: 'SpO₂',
        icon: Wind, accent: '#4DA379', bgTint: '#F0F9F5',
        extract: (v) => v.oxygen_saturation || 0,
        normalRange: [95, 100],
        insight: (val) => val < 95 ? "SpO₂ is slightly low. Try deep breathing." : "Your oxygen saturation is excellent.",
    },
    {
        id: 'hydration', title: 'Hydration', unit: '%', yLabel: '%',
        icon: Droplets, accent: '#376DAF', bgTint: '#EFF6FF',
        extract: (v) => v.hydration || 0,
        normalRange: [60, 100],
        insight: (val) => val < 60 ? "Drink some water! You're below optimal hydration." : "Great job staying hydrated today!",
    },
];

// ─── Predictive insight engine ─────────────────────────────────
const getInsight = (data, label, isSingle) => {
    if (!data || data.length < 2) {
        if (isSingle && data.length === 1) {
            return { emoji: '📌', text: `Single reading recorded today. Log more to see trends.`, type: 'stable' };
        }
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

    if (pctChange > 5) return { text: `Your ${label} is trending higher ${periodText}.`, type: 'warning' };
    if (pctChange < -5) return { text: `Your ${label} is improving ${periodText}.`, type: 'positive' };
    return { text: `Your ${label} has been stable ${periodText}.`, type: 'stable' };
};

const insightBgs = { warning: '#FEF3C7', positive: '#DCFCE7', stable: '#F0F9FF' };
const insightColors = { warning: '#92400E', positive: '#166534', stable: '#1E40AF' };


export default function VitalsHistoryScreen({ navigation }) {
    // ─── State ──────────────────────────────────────────────────
    const [vitals, setVitals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isOffline, setIsOffline] = useState(false);

    // Date range state (Charts)
    const [rangeMode, setRangeMode] = useState('single');
    const [startDate, setStartDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date());

    // History list state (Independent)
    const [historyLogs, setHistoryLogs] = useState([]);
    const [historyDate, setHistoryDate] = useState(new Date());

    const { width: windowW, height: windowH } = useWindowDimensions();
    const isLandscape = windowW > windowH;
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showHistoryPicker, setShowHistoryPicker] = useState(false);
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);

    // Log vitals form
    const [isLogging, setIsLogging] = useState(false);
    const [formValues, setFormValues] = useState({
        heart_rate: '', systolic: '', diastolic: '', oxygen_saturation: '', hydration: '',
    });
    const [formError, setFormError] = useState(null);
    const [activeMetricId, setActiveMetricId] = useState('heart_rate');

    // Interactive Tooltip State
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, visible: false, value: 0, label: "" });
    const tooltipFade = useRef(new Animated.Value(0)).current;
    const scrollY = useRef(new Animated.Value(0)).current;

    const showTooltip = (x, y, value, label) => {
        setTooltipPos({ x, y, visible: true, value, label });
        Animated.timing(tooltipFade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    };

    const hideTooltip = () => {
        Animated.timing(tooltipFade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
            setTooltipPos(prev => ({ ...prev, visible: false }));
        });
    };

    // ─── Animations ─────────────────────────────────────────────
    const staggerAnims = useRef([...Array(5)].map(() => new Animated.Value(0))).current;

    const runAnimations = useCallback(() => {
        staggerAnims.forEach(anim => anim.setValue(0));
        Animated.stagger(100, staggerAnims.map(anim =>
            Animated.timing(anim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            })
        )).start();
    }, [staggerAnims]);

    useFocusEffect(
        useCallback(() => {
            runAnimations();
            return () => {};
        }, [runAnimations])
    );

    // ─── NetInfo: offline detection ─────────────────────────────
    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener((state) => {
            setIsOffline(!state.isConnected);
        });
        return () => unsubscribe();
    }, []);

    // ─── Fetch All Data (Consolidated to fix 429) ───────────────
    const lastRequestRef = useRef(0);
    const fetchAllData = useCallback(async () => {
        if (isOffline) {
            setError('You are offline. Please connect to the internet to view your vitals history.');
            setLoading(false);
            return;
        }

        // Throttle rapid requests (min 400ms between calls)
        const now = Date.now();
        if (now - lastRequestRef.current < 400) return;
        lastRequestRef.current = now;

        setError(null);
        try {
            setLoading(true);
            
            // Consolidate parallel requests: Charts and History List
            // If the dates match, we can even reuse the same response if the backend allows, 
            // but for now, we'll just use Promise.all to ensure they don't fire sequentially 
            // and trigger separate re-renders.
            
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
        }
    }, [startDate, endDate, rangeMode, historyDate, isOffline]);

    // Debounced fetch for date changes
    const debounceRef = useRef(null);
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            fetchAllData();
        }, 300); // 300ms debounce
        return () => clearTimeout(debounceRef.current);
    }, [fetchAllData]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener('VITALS_UPDATED', () => {
            lastRequestRef.current = 0;
            fetchAllData();
        });
        return () => sub.remove();
    }, [fetchAllData]);

    // ─── Chart labels ───────────────────────────────────────────
    const chartLabels = useMemo(() => {
        if (!vitals.length) return [];
        return vitals.map((v) => {
            const d = new Date(v.date);
            if (rangeMode === 'single') {
                return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
            }
            return `${d.getMonth() + 1}/${d.getDate()}`;
        });
    }, [vitals, rangeMode]);

    // ─── Submit new vitals ──────────────────────────────────────
    // ─── Submit new vitals ──────────────────────────────────────
    const handleLogVitals = async () => {
        setFormError(null);
        const hr = Number(formValues.heart_rate);
        const sys = Number(formValues.systolic);
        const dia = Number(formValues.diastolic);
        const o2 = Number(formValues.oxygen_saturation);
        const hyd = Number(formValues.hydration);

        if (!hr || !sys || !dia || !o2 || !hyd) {
            setFormError('All fields are required.');
            return;
        }

        try {
            setLoading(true);
            await apiService.patients.logVitals({
                date: new Date().toISOString(),
                heart_rate: hr,
                blood_pressure: { systolic: sys, diastolic: dia },
                oxygen_saturation: o2,
                hydration: hyd,
            });
            setIsLogging(false);
            setFormValues({ heart_rate: '', systolic: '', diastolic: '', oxygen_saturation: '', hydration: '' });
            DeviceEventEmitter.emit('VITALS_UPDATED');
            fetchAllData();
        } catch (err) {
            setFormError(handleAxiosError(err));
        } finally {
            setLoading(false);
        }
    };

    // ─── Date helpers ───────────────────────────────────────────
    const adjustDate = (setter, days) => {
        setter((prev) => {
            const d = new Date(prev);
            d.setDate(d.getDate() + days);
            return d;
        });
    };
    const formatDate = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    
    // Animation for tab switching
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
            return {
                x: key,
                y: vals.reduce((a, b) => a + b, 0) / vals.length,
                min: Math.min(...vals),
                max: Math.max(...vals)
            };
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

        // Readings per day
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

        let status = 'Within normal';
        let statusColor = '#10B981';

        if (id === 'heart_rate') {
            if (avgVal > 100 || avgVal < 60) { status = 'Outside range'; statusColor = '#EF4444'; }
        } else if (id === 'oxygen_saturation') {
            if (avgVal < 95) { status = 'Below normal'; statusColor = '#EF4444'; }
        } else if (id === 'blood_pressure') {
            if (avgVal > 140 || (altAvg && altAvg > 90)) { status = 'Elevated'; statusColor = '#EF4444'; }
            else if (avgVal < 90 || (altAvg && altAvg < 60)) { status = 'Low'; statusColor = '#EF4444'; }
        }

        return {
            avg: altAvg ? `${avgVal.toFixed(0)}/${altAvg.toFixed(0)}` : avgVal.toFixed(1),
            min: altMin ? `${minVal.toFixed(0)}/${altMin.toFixed(0)}` : minVal.toFixed(0),
            max: altMax ? `${maxVal.toFixed(0)}/${altMax.toFixed(0)}` : maxVal.toFixed(0),
            readingsPerDay,
            unit: def.unit,
            status,
            statusColor
        };
    };

    const renderSummaryStats = () => {
        const stats = getStats(activeMetricId);
        if (!stats) return null;

        return (
            <Animated.ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.statsScroll}
                style={{ opacity: fadeAnim }}
            >
                <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Avg</Text>
                    <View style={styles.statValueRow}>
                        <Text style={styles.statValue}>{stats.avg}</Text>
                        <Text style={styles.statUnit}>{stats.unit}</Text>
                    </View>
                    <Text style={[styles.statStatus, { color: stats.statusColor }]}>
                        {stats.status}
                    </Text>
                </View>

                <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Lowest</Text>
                    <View style={styles.statValueRow}>
                        <Text style={styles.statValue}>{stats.min}</Text>
                        <Text style={styles.statUnit}>{stats.unit}</Text>
                    </View>
                    <Text style={styles.statSub}>min recorded</Text>
                </View>

                <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Highest</Text>
                    <View style={styles.statValueRow}>
                        <Text style={styles.statValue}>{stats.max}</Text>
                        <Text style={styles.statUnit}>{stats.unit}</Text>
                    </View>
                    <Text style={styles.statSub}>max recorded</Text>
                </View>

                {rangeMode !== 'single' && (
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Readings/day</Text>
                        <View style={styles.statValueRow}>
                            <Text style={styles.statValue}>{stats.readingsPerDay}</Text>
                        </View>
                        <Text style={styles.statSub}>on average</Text>
                    </View>
                )}
            </Animated.ScrollView>
        );
    };


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
            fillShadowGradient: def.accent,
            fillShadowGradientOpacity: 0.2,
            fillShadowGradientFrom: def.accent,
            fillShadowGradientTo: '#FFFFFF',
            useShadowColorFromDataset: false,
        };

        const w = windowW - 40;
        const h = windowH - 80;

        return (
            <Modal
                visible={isFullscreen || isLandscape}
                supportedOrientations={['portrait', 'landscape']}
                animationType="fade"
                onRequestClose={() => setIsFullscreen(false)}
            >
                <View style={[styles.landscapeContainer, { width: windowW, height: windowH }]}>
                    <Pressable 
                        style={styles.closeFullscreenBtn} 
                        onPress={() => { setIsFullscreen(false); }}
                        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                    >
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
                                        ? rangeData.map((d, i) => i % Math.ceil(rangeData.length / 12) === 0 ? d.x : "")
                                        : labels.map((l, i) => i % Math.ceil(labels.length / 10) === 0 ? l : ""),
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
                                width={w}
                                height={h}
                                chartConfig={chartConfig}
                                bezier={rangeMode === 'range' ? rangeData.length > 1 : mainData.length > 1}
                                style={styles.landscapeChart}
                                onDataPointClick={({ x, y, value, index }) => 
                                    showTooltip(x, y, value, rangeMode === 'range' ? rangeData[index].x : labels[index])
                                }
                                decorator={() => renderChartInteraction(def)}
                            />
                            {tooltipPos.visible && (
                                <Pressable 
                                    style={[StyleSheet.absoluteFill, { zIndex: 50 }]} 
                                    onPress={hideTooltip} 
                                />
                            )}
                            
                            {rangeMode === 'range' && (
                                <Svg position="absolute" top={0} left={0} width={w} height={h} pointerEvents="none">
                                    <Path 
                                        d={(() => {
                                            const rd = rangeData;
                                            if (rd.length < 2) return "";
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
                                        fill={def.accent} 
                                        fillOpacity={0.1} 
                                    />
                                </Svg>
                            )}
                        </View>
                    </ChartErrorBoundary>
                </View>
            </Modal>
        );
    };



    // ─── Render Interaction Decorator ──────────────────────────
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
                    <Text style={[styles.tooltipValue, { color: def.accent }]}>
                        {value} <Text style={styles.tooltipUnit}>{def.unit}</Text>
                    </Text>
                    <View style={styles.tooltipArrow} />
                </View>
            </Animated.View>
        );
    };

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
            fillShadowGradient: def.accent,
            fillShadowGradientOpacity: 0.2,
            fillShadowGradientFrom: def.accent,
            fillShadowGradientTo: '#FFFFFF',
            useShadowColorFromDataset: false,
        };

        return (
            <Animated.View style={[styles.chartCard, { opacity: staggerAnims[2], transform: [{ translateY: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
                <View style={styles.chartTitleRow}>
                    <View style={[styles.chartIconPill, { backgroundColor: def.accent + '15' }]}>
                        <def.icon size={22} color={def.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.chartTitle}>{def.title}</Text>
                        <Text style={styles.chartUnit}>{rangeMode === 'single' ? "Today's readings" : "Trend analysis"}</Text>
                    </View>
                    <Pressable onPress={() => setIsFullscreen(true)} style={styles.expandBtn}>
                        <Maximize2 size={20} color="#64748B" />
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
                                        labels: rangeData.map((d, i) => i % Math.ceil(rangeData.length / 6) === 0 ? d.x : ""),
                                        datasets: [
                                            { data: rangeData.map(d => d.max || 0), color: () => 'transparent', strokeWidth: 0, withDots: false },
                                            { data: rangeData.map(d => d.min || 0), color: () => 'transparent', strokeWidth: 0, withDots: false },
                                            { data: rangeData.map(d => d.y || 0), color: () => def.accent, strokeWidth: 3 },
                                        ],
                                    }}
                                    width={SCREEN_W - 80}
                                    height={240}
                                    chartConfig={chartConfig}
                                    bezier={rangeData.length > 1}
                                    style={styles.chart}
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
                                    labels: labels.map((l, i) => i % Math.ceil(labels.length / 5) === 0 ? l : ""),
                                    datasets: [
                                        { data: mainData, color: () => def.accent, strokeWidth: 3 },
                                        ...(def.extractAlt ? [{ data: vitals.map(v => Number(def.extractAlt(v)) || 0).reverse(), color: () => '#94A3B840', strokeWidth: 2, withDots: false }] : [])
                                    ]
                                }}
                                width={SCREEN_W - 80}
                                height={220}
                                chartConfig={chartConfig}
                                bezier={mainData.length > 1}
                                style={styles.chart}
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

    // ─── Error Banner ───────────────────────────────────────────
    const renderHeader = () => {
        const headerOpacity = scrollY.interpolate({
            inputRange: [0, 50],
            outputRange: [0, 1],
            extrapolate: 'clamp',
        });

        return (
            <Animated.View style={[styles.glassHeaderContainer, { borderBottomWidth: headerOpacity }]}>
                <LinearGradient
                    colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.8)']}
                    style={StyleSheet.absoluteFill}
                />
                <View style={styles.headerContent}>
                    <Pressable onPress={() => navigation.goBack()} style={styles.headerActionBtn}>
                        <ChevronLeft size={24} color="#1E293B" />
                    </Pressable>
                    <Text style={styles.headerTitle}>Vitals History</Text>
                    <View style={{ width: 44 }} />
                </View>
            </Animated.View>
        );
    };

    const renderIntelligenceCard = (def) => {
        if (!def || !vitals.length) return null;
        const latest = vitals[0];
        const val = def.extract(latest);
        const text = def.insight ? def.insight(val) : "Stable readings recorded.";
        
        return (
            <Animated.View style={[styles.insightCard, { opacity: fadeAnim }]}>
                <LinearGradient
                    colors={[def.accent + '15', '#FFFFFF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.insightGradient}
                />
                <View style={[styles.insightDot, { backgroundColor: def.accent }]} />
                <View style={styles.insightContent}>
                    <Text style={styles.insightLabel}>Daily Intelligence</Text>
                    <Text style={styles.insightText}>{text}</Text>
                </View>
                <Sparkles size={20} color={def.accent} style={styles.insightIcon} />
            </Animated.View>
        );
    };

    const renderSkeleton = () => (
        <View style={styles.skeletonContainer}>
            <View style={[styles.skeletonItem, { height: 120, borderRadius: 24 }]} />
            <View style={[styles.skeletonItem, { height: 40, width: '60%', borderRadius: 12, marginVertical: 20 }]} />
            <View style={[styles.skeletonItem, { height: 240, borderRadius: 24 }]} />
            <View style={[styles.skeletonItem, { height: 80, borderRadius: 16, marginTop: 20 }]} />
        </View>
    );
    const renderErrorBanner = () => {
        if (!error) return null;
        return (
            <View style={styles.errorBanner}>
                {isOffline
                    ? <WifiOff size={20} color="#DC2626" />
                    : <AlertTriangle size={20} color="#DC2626" />
                }
                <Text style={styles.errorText}>{error}</Text>
                {!isOffline && (
                    <Pressable style={styles.retryBtn} onPress={fetchAllData}>
                        <RefreshCw size={14} color="#FFF" />
                        <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                )}
            </View>
        );
    };

    const renderMetricTabs = () => (
        <View style={styles.metricTabsWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricTabsContent}>
                {CHART_DEFS.map((m) => {
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
                            <Text style={[
                                styles.metricTabText, 
                                isActive && styles.metricTabTextActive
                            ]}>
                                {m.title}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );

    // ─── Main Render ────────────────────────────────────────────
    const def = CHART_DEFS.find(c => c.id === activeMetricId);

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {renderFullscreenChart()}
            <View style={[styles.container, { backgroundColor: def ? def.bgTint : '#FFFFFF' }]}>
                {renderHeader()}

                <Animated.ScrollView 
                    contentContainerStyle={styles.scrollContent} 
                    showsVerticalScrollIndicator={false}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                        { useNativeDriver: true }
                    )}
                    scrollEventThrottle={16}
                >
                    <View style={{ height: Platform.OS === 'ios' ? 100 : 80 }} />

                    {loading ? renderSkeleton() : (
                        <>
                            {/* ── Log Vitals Form (top for easy access) ── */}
                            <Animated.View style={[styles.chartCard, { opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
                                <Pressable
                                    style={styles.logToggleRow}
                                    onPress={() => { setIsLogging(!isLogging); setFormError(null); }}
                                >
                                    <Text style={styles.chartTitle}>Log Today's Vitals</Text>
                                    <View style={[styles.addBadge, isLogging && styles.addBadgeCancel]}>
                                        <Text style={[styles.addBadgeTxt, isLogging && styles.addBadgeCancelTxt]}>{isLogging ? 'Cancel' : '+ Add Entry'}</Text>
                                    </View>
                                </Pressable>

                                {isLogging && (
                                    <View style={styles.formArea}>
                                        {formError && (
                                            <View style={[styles.errorBanner, { marginBottom: 12 }]}>
                                                <AlertTriangle size={16} color="#DC2626" />
                                                <Text style={styles.errorText}>{formError}</Text>
                                            </View>
                                        )}

                                        <View style={styles.formRow}>
                                            <View style={styles.formGroup}>
                                                <Text style={styles.formLabel}>Heart Rate (bpm)</Text>
                                                <TextInput style={styles.formInput} keyboardType="numeric" placeholder="72" placeholderTextColor="#94A3B8"
                                                    value={formValues.heart_rate} onChangeText={(t) => setFormValues((p) => ({ ...p, heart_rate: t }))} />
                                            </View>
                                            <View style={styles.formGroup}>
                                                <Text style={styles.formLabel}>O₂ Saturation (%)</Text>
                                                <TextInput style={styles.formInput} keyboardType="numeric" placeholder="98" placeholderTextColor="#94A3B8"
                                                    value={formValues.oxygen_saturation} onChangeText={(t) => setFormValues((p) => ({ ...p, oxygen_saturation: t }))} />
                                            </View>
                                        </View>

                                        <Text style={[styles.formLabel, { marginTop: 14 }]}>Blood Pressure (mmHg)</Text>
                                        <View style={styles.formRow}>
                                            <View style={styles.formGroup}>
                                                <TextInput style={styles.formInput} keyboardType="numeric" placeholder="Systolic (120)" placeholderTextColor="#94A3B8"
                                                    value={formValues.systolic} onChangeText={(t) => setFormValues((p) => ({ ...p, systolic: t }))} />
                                            </View>
                                            <View style={styles.formGroup}>
                                                <TextInput style={styles.formInput} keyboardType="numeric" placeholder="Diastolic (80)" placeholderTextColor="#94A3B8"
                                                    value={formValues.diastolic} onChangeText={(t) => setFormValues((p) => ({ ...p, diastolic: t }))} />
                                            </View>
                                        </View>

                                        <View style={styles.formGroup}>
                                            <Text style={[styles.formLabel, { marginTop: 14 }]}>Hydration (%)</Text>
                                            <TextInput style={styles.formInput} keyboardType="numeric" placeholder="65" placeholderTextColor="#94A3B8"
                                                value={formValues.hydration} onChangeText={(t) => setFormValues((p) => ({ ...p, hydration: t }))} />
                                        </View>

                                        <Pressable style={styles.submitBtn} onPress={handleLogVitals}>
                                            {loading
                                                ? <ActivityIndicator color="#FFF" />
                                                : <Text style={styles.submitTxt}>Save Record</Text>
                                            }
                                        </Pressable>
                                    </View>
                                )}
                            </Animated.View>

                            {/* ── Date Picker Section ─────────────────── */}
                            <Animated.View style={[styles.dateSection, { opacity: staggerAnims[1], transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
                                <View style={styles.dateToggle}>
                                    {['single', 'range'].map((m) => (
                                        <Pressable
                                            key={m}
                                            style={[styles.toggleBtn, rangeMode === m && styles.toggleBtnActive]}
                                            onPress={() => setRangeMode(m)}
                                        >
                                            <View style={[styles.dateToggleIcon, rangeMode === m && styles.dateToggleIconActive]}>
                                                <Calendar size={14} color={rangeMode === m ? "#3B86FF" : "#94A3B8"} />
                                            </View>
                                            <Text style={[styles.toggleTxt, rangeMode === m && styles.toggleTxtActive]}>
                                                {m === 'single' ? 'Single Date' : 'Date Range'}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>

                                <View style={styles.dateRow}>
                                    <Pressable style={styles.dateArrow} onPress={() => adjustDate(setStartDate, -1)}>
                                        <ChevronLeft size={20} color="#64748B" />
                                    </Pressable>
                                    <Pressable 
                                        style={({ pressed }) => [
                                            styles.dateBox,
                                            { opacity: pressed ? 0.6 : 1 }
                                        ]}
                                        onPress={() => setShowStartPicker(true)}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        <Text style={styles.dateLabel}>{rangeMode === 'single' ? 'Date' : 'Start'}</Text>
                                        <Text style={styles.dateValue}>{formatDate(startDate)}</Text>
                                    </Pressable>
                                    <Pressable style={styles.dateArrow} onPress={() => adjustDate(setStartDate, 1)}>
                                        <ChevronRight size={20} color="#64748B" />
                                    </Pressable>
                                </View>

                                {showStartPicker && (
                                    <DateTimePicker
                                        value={startDate}
                                        mode="date"
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        onChange={(event, selectedDate) => {
                                            setShowStartPicker(false);
                                            if (selectedDate) {
                                                setStartDate(selectedDate);
                                            }
                                        }}
                                    />
                                )}

                                {rangeMode === 'range' && (
                                    <>
                                        <View style={styles.dateRow}>
                                            <Pressable style={styles.dateArrow} onPress={() => adjustDate(setEndDate, -1)}>
                                                <ChevronLeft size={20} color="#64748B" />
                                            </Pressable>
                                            <Pressable 
                                                style={({ pressed }) => [
                                                    styles.dateBox,
                                                    { opacity: pressed ? 0.6 : 1 }
                                                ]}
                                                onPress={() => setShowEndPicker(true)}
                                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                            >
                                                <Text style={styles.dateLabel}>End</Text>
                                                <Text style={styles.dateValue}>{formatDate(endDate)}</Text>
                                            </Pressable>
                                            <Pressable style={styles.dateArrow} onPress={() => adjustDate(setEndDate, 1)}>
                                                <ChevronRight size={20} color="#64748B" />
                                            </Pressable>
                                        </View>

                                        {showEndPicker && (
                                            <DateTimePicker
                                                value={endDate}
                                                mode="date"
                                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                                onChange={(event, selectedDate) => {
                                                    setShowEndPicker(false);
                                                    if (selectedDate) {
                                                        setEndDate(selectedDate);
                                                    }
                                                }}
                                            />
                                        )}
                                    </>
                                )}
                            </Animated.View>

                            {/* ── Metric Selection ────────────────────── */}
                            {vitals.length > 0 && renderMetricTabs()}

                            {/* ── Error / Offline Banner ──────────────── */}
                            {renderErrorBanner()}

                            {/* ── Empty State ──────────────────────────── */}
                            {!loading && !error && vitals.length === 0 && (
                                <View style={styles.emptyState}>
                                    <View style={styles.emptyIconCircle}>
                                        <Heart size={36} color="#3B86FF" />
                                    </View>
                                    <Text style={styles.emptyTitle}>No vitals recorded</Text>
                                    <Text style={styles.emptySub}>Log your first vitals entry above to start tracking trends.</Text>
                                </View>
                            )}

                            {/* ── Summary Stats ────────────────────────── */}
                            {!loading && vitals.length > 0 && renderSummaryStats(def)}

                            {/* ── Charts ───────────────────────────────── */}
                            {!loading && vitals.length > 0 && renderChartCard(def)}

                            {renderIntelligenceCard(def)}

                            {/* ── History List ─────────────────────────── */}
                            <Animated.View style={[styles.historySection, { opacity: staggerAnims[3], transform: [{ translateY: staggerAnims[3].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
                                
                                {/* History Header & Independent Date Picker */}
                                <View style={styles.historySectionHeader}>
                                    <Text style={styles.historyTitle}>Recent Logs</Text>
                                    <View style={styles.historyDateControl}>
                                        <Pressable style={styles.historyArrow} onPress={() => adjustDate(setHistoryDate, -1)}>
                                            <ChevronLeft size={16} color="#64748B" />
                                        </Pressable>
                                        <Pressable 
                                            style={({ pressed }) => [
                                                styles.historyDateBox,
                                                { opacity: pressed ? 0.5 : 1 }
                                            ]}
                                            onPress={() => setShowHistoryPicker(true)}
                                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        >
                                            <Text style={styles.historyDateValue}>{formatDate(historyDate)}</Text>
                                        </Pressable>
                                        <Pressable style={styles.historyArrow} onPress={() => adjustDate(setHistoryDate, 1)}>
                                            <ChevronRight size={16} color="#64748B" />
                                        </Pressable>
                                    </View>
                                </View>

                                {showHistoryPicker && (
                                    <DateTimePicker
                                        value={historyDate}
                                        mode="date"
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        onChange={(event, selectedDate) => {
                                            setShowHistoryPicker(false);
                                            if (selectedDate) {
                                                setHistoryDate(selectedDate);
                                            }
                                        }}
                                    />
                                )}

                                {/* Logs List */}
                                {historyLogs.length === 0 ? (
                                    <View style={styles.historyEmpty}>
                                        <Text style={styles.historyEmptyText}>No logs recorded on this date.</Text>
                                    </View>
                                ) : (
                                    historyLogs.slice().reverse().map((log, idx) => (
                                        <View key={log._id || idx} style={styles.historyCard}>
                                            <View style={styles.historyHeader}>
                                                <View style={styles.historyDateRow}>
                                                    <Clock size={14} color="#3B86FF" />
                                                    <Text style={styles.historyDate}>
                                                        {new Date(log.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }).toLowerCase()}
                                                    </Text>
                                                </View>
                                            </View>
                                            <View style={styles.historyGrid}>
                                                <View style={styles.historyItem}>
                                                    <View style={styles.historyLabelRow}>
                                                        <Heart size={12} color="#EF4444" />
                                                        <Text style={styles.historyLabel}>Heart Rate</Text>
                                                    </View>
                                                    <Text style={styles.historyValue}>{log.heart_rate} <Text style={styles.historyUnit}>bpm</Text></Text>
                                                </View>
                                                <View style={styles.historyItem}>
                                                    <View style={styles.historyLabelRow}>
                                                        <Activity size={12} color="#3B86FF" />
                                                        <Text style={styles.historyLabel}>Blood Pressure</Text>
                                                    </View>
                                                    <Text style={styles.historyValue}>{log.blood_pressure?.systolic}/{log.blood_pressure?.diastolic} <Text style={styles.historyUnit}>mmHg</Text></Text>
                                                </View>
                                                <View style={styles.historyItem}>
                                                    <View style={styles.historyLabelRow}>
                                                        <Wind size={12} color="#22C55E" />
                                                        <Text style={styles.historyLabel}>SpO₂</Text>
                                                    </View>
                                                    <Text style={styles.historyValue}>{log.oxygen_saturation} <Text style={styles.historyUnit}>%</Text></Text>
                                                </View>
                                                <View style={styles.historyItem}>
                                                    <View style={styles.historyLabelRow}>
                                                        <Droplets size={12} color="#06B6D4" />
                                                        <Text style={styles.historyLabel}>Hydration</Text>
                                                    </View>
                                                    <Text style={styles.historyValue}>{log.hydration} <Text style={styles.historyUnit}>%</Text></Text>
                                                </View>
                                            </View>
                                        </View>
                                    ))
                                )}
                            </Animated.View>
                        </>
                    )}
                </Animated.ScrollView>
            </View>
        </KeyboardAvoidingView>
    );
}


// ─── Styles (Light Premium Theme — consistent with HomeScreen) ──
const styles = StyleSheet.create({
    container: { flex: 1 },

    /* Glass Header */
    glassHeaderContainer: {
        position: 'absolute', top: 0, left: 0, right: 0, height: Platform.OS === 'ios' ? 100 : 80,
        zIndex: 100, borderBottomColor: '#F1F5F9',
        justifyContent: 'flex-end', paddingBottom: 10,
    },
    headerContent: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20,
    },
    headerActionBtn: {
        width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.5)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '900', color: '#1E293B' },

    /* Intelligence Card */
    insightCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 20,
        flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: 'rgba(0,0,0,0.05)', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 1, shadowRadius: 16, elevation: 4,
    },
    insightGradient: { position: 'absolute', inset: 0 },
    insightDot: { width: 8, height: 8, borderRadius: 4, marginRight: 14 },
    insightContent: { flex: 1 },
    insightLabel: { fontSize: 13, fontWeight: '800', color: '#64748B', marginBottom: 4, textTransform: 'uppercase' },
    insightText: { fontSize: 16, fontWeight: '700', color: '#1E293B', lineHeight: 22 },
    insightIcon: { opacity: 0.6 },

    /* Skeleton Loader */
    skeletonContainer: { gap: 20 },
    skeletonItem: { backgroundColor: '#F1F5F9' },

    scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 },

    /* Date Picker */
    dateSection: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, marginBottom: 20,
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#6366F1', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.06, shadowRadius: 24, elevation: 8,
    },
    dateToggle: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 18, padding: 5, marginBottom: 24, borderWidth: 1, borderColor: '#E2E8F0' },
    toggleBtn: { flex: 1, flexDirection: 'row', gap: 8, paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    toggleBtnActive: { backgroundColor: '#FFFFFF', shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 3 },
    dateToggleIcon: { opacity: 0.4 },
    dateToggleIconActive: { opacity: 1 },
    toggleTxt: { fontSize: 13, fontWeight: '700', color: '#64748B' },
    toggleTxtActive: { color: '#1E293B', fontWeight: '900' },

    dateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    dateArrow: {
        width: 48, height: 48, borderRadius: 16,
        backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    dateBox: {
        flex: 1, marginHorizontal: 16, backgroundColor: '#F9FAFB',
        borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16,
        borderWidth: 1, borderColor: '#E2E8F0',
        alignItems: 'center',
    },
    dateLabel: { fontSize: 10, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 1 },
    dateValue: { fontSize: 16, fontWeight: '900', color: '#1E293B', letterSpacing: -0.3 },

    /* Error Banner */
    errorBanner: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
        borderRadius: 16, padding: 14, gap: 10, marginBottom: 16,
    },
    errorText: { flex: 1, color: '#991B1B', fontSize: 13, fontWeight: '600', lineHeight: 18 },
    retryBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#DC2626', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
    },
    retryText: { color: '#FFF', fontSize: 12, fontWeight: '700' },

    /* Loading */
    loadingBox: { alignItems: 'center', paddingVertical: 60 },
    loadingText: { color: '#94A3B8', marginTop: 12, fontSize: 14, fontWeight: '500' },

    /* Empty State */
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyIconCircle: {
        width: 80, height: 80, borderRadius: 40, backgroundColor: '#EFF6FF',
        alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        borderWidth: 2, borderColor: '#DBEAFE',
    },
    emptyTitle: { color: '#1E293B', fontSize: 18, fontWeight: '700' },
    emptySub: { color: '#64748B', fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },

    /* Chart Cards */
    chartCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 24,
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#6366F1', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.06, shadowRadius: 20, elevation: 6,
    },
    chartTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    chartIconPill: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    chartTitle: { fontSize: 17, fontWeight: '800', color: '#1E293B' },
    chartUnit: { fontSize: 13, color: '#94A3B8', fontWeight: '700' },
    chart: { borderRadius: 16, marginLeft: -10 },

    metricTabsWrapper: { marginBottom: 20, marginTop: 4 },
    metricTabsContent: { paddingHorizontal: 4, gap: 12, paddingBottom: 4 },
    metricTab: {
        paddingHorizontal: 24, paddingVertical: 12, borderRadius: 30,
        backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E2E8F0',
    },
    metricTabText: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
    metricTabTextActive: { color: '#FFFFFF' },

    emptyChartBox: { height: 140, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', borderStyle: 'dashed' },
    emptyChartText: { color: '#94A3B8', fontStyle: 'italic', fontSize: 14, fontWeight: '500' },

    insightRow: { marginTop: 18, borderRadius: 14, padding: 16, borderLeftWidth: 4 },
    insightText: { fontSize: 14, lineHeight: 22, fontWeight: '700' },

    /* Stats Cards */
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24, marginHorizontal: -4 },
    statsScroll: { paddingHorizontal: 4, paddingBottom: 12 },
    statCard: {
        width: 155, backgroundColor: '#F9FAFB', borderRadius: 16, padding: 16, marginRight: 12,
        borderWidth: 0,    },
    statLabel: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 10 },
    statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 4 },
    statValue: { fontSize: 32, fontWeight: '900', color: '#1E293B', letterSpacing: -1 },
    statUnit: { fontSize: 15, fontWeight: '700', color: '#64748B' },
    statStatus: { fontSize: 13, fontWeight: '800', marginTop: 8 },
    statSub: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginTop: 4 },

    /* Log Form */
    logToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    addBadge: { backgroundColor: '#F0F7FF', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: '#DBEAFE' },
    addBadgeTxt: { color: '#3B86FF', fontSize: 14, fontWeight: '900' },
    addBadgeCancel: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
    addBadgeCancelTxt: { color: '#EF4444' },

    formArea: { marginTop: 24 },
    formRow: { flexDirection: 'row', gap: 16 },
    formGroup: { flex: 1, marginBottom: 4 },
    formLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },
    formInput: {
        backgroundColor: '#FCFDFD', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14,
        paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#1E293B', fontWeight: '700',
    },

    submitBtn: {
        borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 24,
        overflow: 'hidden', backgroundColor: '#3B86FF',
        shadowColor: '#3B86FF', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
    },
    submitTxt: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

    /* History List */
    historySection: { marginTop: 10 },
    historySectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingHorizontal: 4 },
    historyTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
    
    historyDateControl: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#F1F5F9' },
    historyArrow: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    historyDateBox: { paddingHorizontal: 10, paddingVertical: 4 },
    historyDateValue: { fontSize: 13, fontWeight: '700', color: '#1E293B' },

    historyEmpty: { alignItems: 'center', paddingVertical: 20 },
    historyEmptyText: { color: '#94A3B8', fontSize: 14, fontStyle: 'italic' },

    historyCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 16,
        borderWidth: 1, borderColor: '#F1F5F9', borderLeftWidth: 4, borderLeftColor: '#3B86FF',
        shadowColor: 'rgba(10, 36, 99, 0.05)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 16, elevation: 3,
    },
    historyHeader: { borderBottomWidth: 1, borderBottomColor: '#F8FAFC', paddingBottom: 14, marginBottom: 16 },
    historyDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    historyDate: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
    historyGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 20 },
    historyItem: { width: '50%' },
    historyLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
    historyLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 },
    historyValue: { fontSize: 18, fontWeight: '900', color: '#1E293B' },
    historyUnit: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },

    /* Landscape View */
    landscapeContainer: { flex: 1, backgroundColor: '#FFFFFF', padding: 16, justifyContent: 'center' },
    landscapeHeader: { position: 'absolute', top: 20, left: 24, zIndex: 90 },
    landscapeTitle: { fontSize: 24, fontWeight: '900', color: '#1E293B' },
    landscapeSubtitle: { fontSize: 13, fontWeight: '700', color: '#64748B', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
    landscapeChart: { borderRadius: 20, alignSelf: 'center' },

    closeFullscreenBtn: {
        position: 'absolute', top: 20, right: 20, zIndex: 1000,
        backgroundColor: '#F1F5F9', width: 48, height: 48, borderRadius: 24,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 8,
    },
    expandBtn: {
        padding: 4,
    },

    /* Chart Elements */
    victoryContainer: { marginTop: 10 },
    legendRow: { flexDirection: 'row', gap: 16, marginBottom: 20, paddingHorizontal: 4 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    legendLine: { width: 20, height: 3, borderRadius: 2 },
    legendBox: { width: 14, height: 14, borderRadius: 4, borderWidth: 1.5 },
    legendDash: { width: 18, height: 2, borderBottomWidth: 1.5, borderColor: '#CBD5E1', borderStyle: 'dashed' },
    legendText: { fontSize: 14, fontWeight: '700', color: '#475569' },
    
    quickRangeRow: { flexDirection: 'row', gap: 8, marginTop: 16, justifyContent: 'flex-end' },
    quickRangeBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 24, backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#E9ECEF' },
    quickRangeText: { fontSize: 13, fontWeight: '800', color: '#495057' },
    /* Tooltip */
    tooltipContainer: {
        position: 'absolute', width: 100, backgroundColor: '#1E293B',
        borderRadius: 12, padding: 8, alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 10,
        zIndex: 1000,
    },
    tooltipLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', marginBottom: 2 },
    tooltipValue: { fontSize: 13, fontWeight: '900' },
    tooltipUnit: { fontSize: 10, fontWeight: '700', color: '#94A3B8' },
    tooltipArrow: {
        position: 'absolute', bottom: -6, left: 45,
        width: 12, height: 12, backgroundColor: '#1E293B',
        transform: [{ rotate: '45deg' }],
    },
});
