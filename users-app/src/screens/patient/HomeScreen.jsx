import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Pressable, Animated, ActivityIndicator, TextInput, KeyboardAvoidingView, TouchableOpacity, DeviceEventEmitter } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Pill, PhoneCall, CalendarCheck, Sunrise, Sun, Moon,
    Sparkles, ChevronRight, PhoneIncoming, TrendingUp, Activity, CalendarDays, CheckCircle2, Circle, Bell,
    Heart, Wind, Thermometer, Droplets, MapPin, AlertTriangle, PillBottle, Syringe, WifiOff
} from 'lucide-react-native';
import { handleAxiosError } from '../../lib/axiosInstance';
import { colors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../lib/api';
import { getCache, setCache, CACHE_KEYS } from '../../lib/CacheService';
import { useFocusEffect } from '@react-navigation/native';

const ACCENT_MAP = { morning: colors.success, afternoon: colors.warning, night: '#8B5CF6' };
const TIME_LABELS = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' };

const TimeBadge = ({ type, timeStr }) => {
    let IconCmp, bg, color;
    if (type === 'morning') { IconCmp = Sunrise; bg = '#DCFCE7'; color = colors.success; }
    else if (type === 'afternoon') { IconCmp = Sun; bg = '#FEF3C7'; color = colors.warning; }
    else { IconCmp = Moon; bg = '#EDE9FE'; color = '#8B5CF6'; }

    return (
        <View style={[styles.timeBadge, { backgroundColor: bg }]}>
            <IconCmp size={14} color={color} strokeWidth={2.5} />
            <Text style={[styles.timeBadgeTxt, { color }]}>{timeStr}</Text>
        </View>
    );
};

const VitalsCard = ({ label, value, unit, icon: Icon, color, status = 'Stable' }) => {
    const isLogged = status === 'Recorded';
    return (
        <View
            style={[
                styles.vitalsCardPremium,
                { backgroundColor: isLogged ? '#FFFFFF' : '#F8FAFC' },
                !isLogged && { borderStyle: 'dashed', borderColor: '#E2E8F0', opacity: 0.85 },
            ]}
        >
            <View style={styles.vitalsRowTop}>
                <View style={[styles.vitalsIconBoxPremium, { backgroundColor: color + (isLogged ? '15' : '08') }]}>
                    <Icon size={20} color={isLogged ? color : '#94A3B8'} strokeWidth={2.5} />
                </View>
                <View style={[styles.statusBadge, { backgroundColor: isLogged ? color + '10' : '#F1F5F9' }]}>
                    <View style={[styles.statusDot, { backgroundColor: isLogged ? color : '#CBD5E1' }]} />
                    <Text style={[styles.statusText, { color: isLogged ? color : '#94A3B8' }]}>{status}</Text>
                </View>
            </View>

            <View style={styles.vitalsMainInfo}>
                <Text style={styles.vitalsLabelPremium}>{label}</Text>
                <View style={styles.vitalsValueRow}>
                    <Text style={[styles.vitalsValuePremium, !isLogged && { color: '#CBD5E1' }]}>{value}</Text>
                    <Text style={styles.vitalsUnitPremium}>{unit}</Text>
                </View>
            </View>

            {isLogged ? (
                <View style={styles.trendContainer}>
                    <TrendingUp size={14} color="#22C55E" />
                    <Text style={styles.trendText}>Logged today</Text>
                </View>
            ) : (
                <View style={styles.trendContainer}>
                    <Activity size={14} color="#94A3B8" />
                    <Text style={[styles.trendText, { color: '#94A3B8' }]}>Tap History to log</Text>
                </View>
            )}
        </View>
    );
};

const MedicationCard = ({ med, onCheck }) => {
    const [taken, setTaken] = useState(med.taken);
    const [scale] = useState(new Animated.Value(1));

    useEffect(() => {
        setTaken(med.taken);
    }, [med.taken]);

    const handleCheck = async () => {
        const newVal = !taken;
        Animated.sequence([
            Animated.timing(scale, { toValue: 0.9, duration: 100, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1.1, duration: 100, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }),
        ]).start();
        
        setTaken(newVal);
        
        try {
            await apiService.medicines.markMedicine({ medicine_name: med.name, scheduled_time: med.type, taken: newVal });
            if (onCheck) onCheck(med);
        } catch (err) {
            console.warn('Failed to mark medicine:', err.message);
            setTaken(!newVal);
        }
    };

    const isTakenOpacity = taken ? 0.7 : 1;

    let IconCmp = Pill;
    if (med.type === 'afternoon') IconCmp = PillBottle;
    if (med.type === 'night') IconCmp = Syringe;

    return (
        <View style={[styles.medCard, { opacity: isTakenOpacity }]}>
            <View style={styles.medCardInner}>
                <View style={[styles.medIconBox, { backgroundColor: '#EFF6FF' }]}>
                    <IconCmp size={20} color="#3B82F6" strokeWidth={2.5} />
                </View>
                <View style={styles.medContentMinimal}>
                    <Text style={[styles.medTitleMinimal, taken && styles.textStrikethrough]}>{med.name}</Text>
                    <Text style={styles.medSubMinimal}>{med.dosage} {med.instructions ? `• ${med.instructions}` : ''}</Text>
                </View>
                <Pressable onPress={handleCheck} style={styles.checkboxTouch}>
                    <Animated.View style={[{ transform: [{ scale }] }, styles.checkboxMinimal]}>
                        {taken && <CheckCircle2 color="#3B82F6" fill="#FFF" size={24} />}
                        {!taken && <CheckCircle2 color="#CBD5E1" size={24} />}
                    </Animated.View>
                </Pressable>
            </View>
        </View>
    );
};

export default function PatientHomeScreen({ navigation }) {
    const { displayName, profile } = useAuth();
    const [patient, setPatient] = useState(null);
    const [meds, setMeds] = useState([]);
    const [vitals, setVitals] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isCached, setIsCached] = useState(false);

    // Log vitals form state
    const [isLogging, setIsLogging] = useState(false);
    const [formValues, setFormValues] = useState({
        heart_rate: '', systolic: '', diastolic: '', oxygen_saturation: '', hydration: '',
    });
    const [formError, setFormError] = useState(null);
    const [submitLoading, setSubmitLoading] = useState(false);

    const staggerAnims = useRef([...Array(10)].map(() => new Animated.Value(0))).current;

    const runAnimations = useCallback(() => {
        staggerAnims.forEach(anim => anim.setValue(0));
        Animated.stagger(100,
            staggerAnims.map(anim =>
                Animated.spring(anim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true })
            )
        ).start();
    }, [staggerAnims]);


    const lastFetchRef = useRef(0);

    const fetchData = useCallback(async (skipCache = false) => {
        try {
            // ── Step 1: Load from cache instantly ──────────────────────
            if (!skipCache) {
                const cached = await getCache(CACHE_KEYS.HOME_DASHBOARD);
                if (cached) {
                    const { patient: cPatient, vitals: cVitals, meds: cMeds } = cached.data;
                    setPatient(cPatient);
                    setVitals(cVitals);
                    setMeds(cMeds);
                    setIsCached(true);
                    setLoading(false); // Instant — no spinner
                }
            }

            // ── Step 2: Fetch fresh data from network ─────────────────
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);

            const [pRes, vRes, medsRes] = await Promise.all([
                apiService.patients.getMe(),
                apiService.patients.getVitals({ 
                    start_date: todayStart.toISOString(), 
                    end_date: todayEnd.toISOString() 
                }),
                apiService.medicines.getToday()
            ]);

            const freshPatient = pRes.data.patient;
            setPatient(freshPatient);

            const todayVitals = vRes.data.vitals;
            const freshVitals = (todayVitals && todayVitals.length > 0) ? todayVitals[todayVitals.length - 1] : null;
            setVitals(freshVitals);

            const freshMeds = (medsRes.data.log?.medicines || []).map((m) => ({
                id: `${m.medicine_name}_${m.scheduled_time}`,
                name: m.medicine_name,
                dosage: m.dosage || (m.scheduled_time === 'morning' ? '500mg' : m.scheduled_time === 'afternoon' ? '5mg' : '10mg'),
                instructions: m.instructions || (m.scheduled_time === 'morning' ? 'Take with food' : m.scheduled_time === 'afternoon' ? 'Take after lunch' : 'Take before sleep'),
                time: TIME_LABELS[m.scheduled_time] || m.scheduled_time,
                type: m.scheduled_time,
                taken: m.taken,
                accent: ACCENT_MAP[m.scheduled_time] || colors.accent,
            }));
            setMeds(freshMeds);
            setIsCached(false);

            // ── Step 3: Persist to cache for offline use ───────────────
            await setCache(CACHE_KEYS.HOME_DASHBOARD, {
                patient: freshPatient,
                vitals: freshVitals,
                meds: freshMeds,
            }, 60); // 60-minute TTL
        } catch (err) {
            console.warn('Failed to fetch dashboard data:', err.message);
            // If network fails but we loaded cached data above, it remains visible.
            // If no cache was loaded either, the empty state will show.
        } finally {
            setLoading(false);
        }
    }, []);

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
            setSubmitLoading(true);
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
            await fetchData(true);
        } catch (err) {
            setFormError(handleAxiosError(err));
        } finally {
            setSubmitLoading(false);
        }
    };

    useEffect(() => {
        const medsSub = DeviceEventEmitter.addListener('MEDS_UPDATED', () => {
            lastFetchRef.current = 0;
            fetchData(true);
        });
        const vitalsSub = DeviceEventEmitter.addListener('VITALS_UPDATED', () => {
            lastFetchRef.current = 0;
            fetchData(true);
        });
        return () => {
            medsSub.remove();
            vitalsSub.remove();
        };
    }, [fetchData]);

    // Use focus effect to refresh data when returning from Vitals History/Log
    const hasAnimated = useRef(false);
    useFocusEffect(
        useCallback(() => {
            fetchData().then(() => {
                if (!hasAnimated.current) {
                    hasAnimated.current = true;
                    runAnimations();
                }
            });
            return () => {};
        }, [fetchData, runAnimations])
    );


    const toggleMed = async (med) => {
        const newTaken = !med.taken;
        setMeds(prev => prev.map(m => m.id === med.id ? { ...m, taken: newTaken } : m));
        try {
            await apiService.medicines.markMedicine({ medicine_name: med.name, scheduled_time: med.type, taken: newTaken });
            DeviceEventEmitter.emit('MEDS_UPDATED');
        } catch (err) {
            console.warn('Failed to mark med:', err.message);
            setMeds(prev => prev.map(m => m.id === med.id ? { ...m, taken: !newTaken } : m));
        }
    };

    const takenCount = meds.filter(m => m.taken).length;
    const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning,';
        if (hour < 17) return 'Good Afternoon,';
        return 'Good Evening,';
    };

    // Derived stats
    let daysPremiumRemaining = 0;
    if (patient?.subscription?.expires_at) {
        const diffTime = new Date(patient.subscription.expires_at) - new Date();
        daysPremiumRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }
    const callsFreq = patient?.call_frequency_days || 7;

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={colors.accent} />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <LinearGradient colors={['#F8FAFC', '#EEF2FF']} style={[styles.container, { position: 'relative' }]}>
                <View style={[styles.headerWrap, { zIndex: 10, elevation: 10 }]}>
                    <Animated.View style={[styles.minimalHeader, { opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
                        {/* Location at the very top */}
                        <Pressable 
                            onPress={() => navigation.navigate('LocationSearch')}
                            style={({ pressed }) => [
                                styles.locationPill,
                                { opacity: pressed ? 0.8 : 1 }
                            ]}
                        >
                            <View style={styles.locationIconBox}>
                                <MapPin size={10} color="#FFFFFF" fill="#FFFFFF" />
                            </View>
                            <Text style={styles.locationLabel} numberOfLines={1}>
                                {patient?.city || profile?.city || 'Detecting...'}
                            </Text>
                            <ChevronRight size={10} color={colors.primary} strokeWidth={3} />
                        </Pressable>

                        {/* Main Row: Name, Bell, Avatar */}
                        <View style={styles.mainHeaderRow}>
                            <View style={styles.headerLeft}>
                                <View style={styles.greetingGroupCompact}>
                                    <Text style={styles.greetingGreeting}>{getGreeting()}</Text>
                                    <Text style={styles.greetingNameCompact}>{(patient?.name || displayName)?.split(' ')[0] || 'User'}</Text>
                                </View>
                            </View>

                            <View style={styles.headerRight}>
                                <Pressable 
                                    style={styles.bellBtnGlass} 
                                    onPress={() => navigation.navigate('Notifications')}
                                >
                                    <Bell size={20} color={colors.primary} strokeWidth={2.5} />
                                    <View style={styles.bellBadgePremium} />
                                </Pressable>
                                
                                <TouchableOpacity 
                                    activeOpacity={0.8}
                                    style={styles.avatarContainerPremium}
                                    onPress={() => navigation.navigate('Profile')}
                                >
                                    <View style={styles.avatarOuterRing}>
                                        <View style={styles.avatarInnerPremium}>
                                            <Text style={styles.avatarTxtPremium}>{displayName?.charAt(0) || 'U'}</Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Date Badge shifted to bottom or integrated if needed, keeping it subtle for height reduction */}
                        <View style={styles.dateBadge}>
                            <CalendarDays size={12} color="#94A3B8" />
                            <Text style={styles.dateLabelCompact}>{dateStr}</Text>
                        </View>
                    </Animated.View>
                </View>

            <ScrollView 
                style={styles.body} 
                contentContainerStyle={styles.bodyContent} 
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {isCached && (
                    <View style={styles.offlineBanner}>
                        <WifiOff size={14} color="#92400E" />
                        <Text style={styles.offlineBannerText}>Showing cached data • Pull to refresh</Text>
                    </View>
                )}
                <Animated.View style={[styles.headerStatsRow, { opacity: staggerAnims[1], transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
                    <View style={styles.statMiniCardEnhanced}>
                        <View style={[styles.statIconBox, { backgroundColor: 'rgba(14,165,233,0.1)' }]}><Pill size={18} color="#0EA5E9" /></View>
                        <Text style={styles.statMiniVal}>{takenCount}/{meds.length}</Text>
                        <Text style={styles.statMiniLabel}>Meds Taken</Text>
                    </View>
                    <View style={styles.statMiniCardEnhanced}>
                        <View style={[styles.statIconBox, { backgroundColor: 'rgba(34,197,94,0.1)' }]}><PhoneCall size={18} color="#22C55E" /></View>
                        <Text style={styles.statMiniVal}>{callsFreq}</Text>
                        <Text style={styles.statMiniLabel}>Days/Call</Text>
                    </View>
                    <View style={styles.statMiniCardEnhanced}>
                        <View style={[styles.statIconBox, { backgroundColor: 'rgba(234,179,8,0.1)' }]}><CalendarCheck size={18} color="#EAB308" /></View>
                        <Text style={styles.statMiniVal}>{daysPremiumRemaining}</Text>
                        <Text style={styles.statMiniLabel}>Days Premium</Text>
                    </View>
                </Animated.View>

                <Animated.View style={{ opacity: staggerAnims[2], transform: [{ translateY: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>TODAY'S MEDICATIONS</Text>
                        {meds.map(med => <MedicationCard key={med.id} med={med} onCheck={toggleMed} />)}
                        {meds.length === 0 && <Text style={{ color: '#94A3B8', fontStyle: 'italic', marginTop: 10 }}>No medications scheduled for today.</Text>}
                    </View>
                </Animated.View>

                <Animated.View style={{ opacity: staggerAnims[3], transform: [{ translateY: staggerAnims[3].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={styles.section}>
                        <View style={styles.sectionHeaderRow}>
                            <Text style={styles.sectionHeader}>MY VITALS</Text>
                            <Pressable style={styles.viewAllBtn} onPress={() => navigation.navigate('VitalsHistory')}>
                                <Text style={styles.viewAllText}>History</Text>
                                <ChevronRight size={14} color="#64748B" />
                            </Pressable>
                        </View>
                        
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vitalsScroll}>
                            <VitalsCard label="Heart Rate" value={vitals?.heart_rate || '—'} unit="bpm" icon={Heart} color="#EF4444" status={vitals?.heart_rate ? 'Recorded' : 'Not Logged'} />
                            <VitalsCard label="Blood Pressure" value={vitals?.blood_pressure?.systolic ? `${vitals.blood_pressure.systolic}/${vitals.blood_pressure.diastolic}` : '—'} unit="mmHg" icon={Activity} color="#3B86FF" status={vitals?.blood_pressure?.systolic ? 'Recorded' : 'Not Logged'} />
                            <VitalsCard label="Oxygen" value={vitals?.oxygen_saturation != null ? vitals.oxygen_saturation : '—'} unit="%" icon={Wind} color="#06B6D4" status={vitals?.oxygen_saturation != null ? 'Recorded' : 'Not Logged'} />
                            <VitalsCard label="Hydration" value={vitals?.hydration != null ? vitals.hydration : '—'} unit="%" icon={Droplets} color="#0EA5E9" status={vitals?.hydration != null ? 'Recorded' : 'Not Logged'} />
                        </ScrollView>

                        {/* ── Log Vitals Form ──────────────────────── */}
                        <View style={styles.chartCardLog}>
                            <Pressable
                                style={styles.logToggleRow}
                                onPress={() => { setIsLogging(!isLogging); setFormError(null); }}
                            >
                                <Text style={styles.chartTitleLog}>Log Today's Vitals</Text>
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

                                    <Pressable style={styles.submitBtn} onPress={handleLogVitals} disabled={submitLoading}>
                                        {submitLoading
                                            ? <ActivityIndicator color="#FFF" />
                                            : <Text style={styles.submitTxt}>Save Record</Text>
                                        }
                                    </Pressable>
                                </View>
                            )}
                        </View>
                    </View>
                </Animated.View>

                <Animated.View style={{ opacity: staggerAnims[4], transform: [{ translateY: staggerAnims[4].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={styles.section}>
                        <View style={[styles.tipCardEnhanced, { backgroundColor: '#FFFFFF' }]}>
                            <View style={styles.tipTitleRow}>
                                <View style={styles.tipIconBox}><Sparkles size={16} color="#0EA5E9" /></View>
                                <Text style={styles.tipLabel}>DAILY HEALTH TIP</Text>
                            </View>
                            <Text style={styles.tipBodyText}>Stay hydrated! Drinking 8 glasses of water daily helps manage blood pressure and significantly improves kidney function.</Text>
                        </View>
                    </View>
                </Animated.View>

                <Animated.View style={{ opacity: staggerAnims[5], transform: [{ translateY: staggerAnims[5].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>QUICK ACTIONS</Text>
                        <View style={styles.quickGrid}>
                            <Pressable style={styles.quickCardEnhanced} onPress={() => navigation.navigate('MyCaller')}>
                                <View style={styles.quickContent}>
                                    <View style={[styles.quickIconBoxEnhanced, { backgroundColor: '#E0F2FE' }]}><PhoneIncoming size={20} color="#0284C7" /></View>
                                    <View style={styles.quickTextView}><Text style={styles.quickCardTitle}>Call History</Text><Text style={styles.quickCardSub}>View logs</Text></View>
                                </View><ChevronRight size={18} color="#CBD5E1" />
                            </Pressable>

                            <Pressable style={styles.quickCardEnhanced} onPress={() => navigation.navigate('Medications')}>
                                <View style={styles.quickContent}>
                                    <View style={[styles.quickIconBoxEnhanced, { backgroundColor: '#DCFCE7' }]}><TrendingUp size={20} color="#16A34A" /></View>
                                    <View style={styles.quickTextView}><Text style={styles.quickCardTitle}>Adherence</Text><Text style={styles.quickCardSub}>94% Weekly</Text></View>
                                </View><ChevronRight size={18} color="#CBD5E1" />
                            </Pressable>

                            <Pressable style={styles.quickCardEnhanced} onPress={() => navigation.navigate('HealthProfile')}>
                                <View style={styles.quickContent}>
                                    <View style={[styles.quickIconBoxEnhanced, { backgroundColor: '#F3E8FF' }]}><Activity size={20} color="#9333EA" /></View>
                                    <View style={styles.quickTextView}><Text style={styles.quickCardTitle}>Health Profile</Text><Text style={styles.quickCardSub}>Updated</Text></View>
                                </View><ChevronRight size={18} color="#CBD5E1" />
                            </Pressable>

                            <Pressable style={styles.quickCardEnhanced}>
                                <View style={styles.quickContent}>
                                    <View style={[styles.quickIconBoxEnhanced, { backgroundColor: '#FEF3C7' }]}><CalendarDays size={20} color="#D97706" /></View>
                                    <View style={styles.quickTextView}><Text style={styles.quickCardTitle}>Schedule</Text><Text style={styles.quickCardSub}>Next Appt</Text></View>
                                </View><ChevronRight size={18} color="#CBD5E1" />
                            </Pressable>
                        </View>
                    </View>
                </Animated.View>
            </ScrollView>
            </LinearGradient>
        </KeyboardAvoidingView>
    );

}
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },

    offlineBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#FEF3C7',
        borderWidth: 1,
        borderColor: '#FDE68A',
        borderRadius: 12,
        paddingVertical: 8,
        paddingHorizontal: 14,
        marginBottom: 16,
    },
    offlineBannerText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#92400E',
    },

    minimalHeader: { paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingHorizontal: 24, paddingBottom: 16, backgroundColor: 'transparent' },

    headerContent: { zIndex: 2 },
    mainHeaderRow: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center'
    },
    headerLeft: { flex: 1 },
    headerRight: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 12 
    },

    locationPill: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 22, alignSelf: 'flex-start', marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0',
    },
    locationIconBox: {
        width: 16, height: 16, borderRadius: 8, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', marginRight: 6,
    },
    locationLabel: { fontSize: 10, color: '#3B82F6', fontWeight: '800', marginRight: 4, letterSpacing: 0.2, textTransform: 'uppercase' },

    greetingGroupCompact: { flexDirection: 'column', alignItems: 'flex-start' },
    greetingGreeting: { fontSize: 13, color: '#6366F1', fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
    greetingNameCompact: { fontSize: 32, fontWeight: '800', color: '#0F172A', letterSpacing: -1 },

    dateBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
    },
    dateLabelCompact: { fontSize: 13, color: '#94A3B8', fontWeight: '700' },

    bellBtnGlass: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
    bellBadgePremium: { 
        position: 'absolute', 
        top: 11, 
        right: 11, 
        width: 7, 
        height: 7, 
        borderRadius: 3.5, 
        backgroundColor: '#EF4444', 
        borderWidth: 1.5, 
        borderColor: '#1E40AF' 
    },

    avatarContainerPremium: {
        shadowColor: 'rgba(0,0,0,0.1)',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
    },
    avatarOuterRing: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
    avatarInnerPremium: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
    avatarTxtPremium: { fontSize: 16, fontWeight: '900', color: colors.primaryDark },

    headerStatsRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 0, // No longer overlaying
        paddingBottom: 20,
        width: '100%',
    },
    statMiniCardEnhanced: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 12,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 10,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#F1F5F9'
    },
    statIconBox: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    statMiniVal: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
    statMiniLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', marginTop: 2, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },

    body: { flex: 1, width: '100%' },
    bodyContent: { paddingHorizontal: 20, paddingBottom: 110, paddingTop: 12, width: '100%' },

    section: { marginBottom: 32, width: '100%' },
    sectionHeader: { fontSize: 13, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16, marginLeft: 4 },

    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingRight: 4 },
    viewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    viewAllText: { fontSize: 13, fontWeight: '700', color: '#64748B' },

    vitalsScroll: { paddingRight: 24, gap: 16 },
    vitalsCardPremium: {
        width: 170,
        borderRadius: 24,
        padding: 20,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 10,
        elevation: 2,
    },
    vitalsRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    vitalsIconBoxPremium: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

    vitalsMainInfo: { marginBottom: 16 },
    vitalsLabelPremium: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 4 },
    vitalsValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    vitalsValuePremium: { fontSize: 24, fontWeight: '800', color: '#1E293B' },
    vitalsUnitPremium: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },

    trendContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    trendText: { fontSize: 11, color: '#64748B', fontWeight: '500' },

    medCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 24, marginBottom: 16, overflow: 'hidden', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2, borderWidth: 1, borderColor: '#F1F5F9' },
    medCardInner: { flexDirection: 'row', padding: 20, alignItems: 'center' },
    medIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    medContentMinimal: { flex: 1 },
    medTitleMinimal: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
    medSubMinimal: { fontSize: 13, color: '#64748B', fontWeight: '500' },
    textStrikethrough: { textDecorationLine: 'line-through', color: '#94A3B8' },
    checkboxTouch: { padding: 4 },
    checkboxMinimal: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },

    tipCardEnhanced: { borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 },
    tipTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    tipIconBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(14,165,233,0.1)', alignItems: 'center', justifyContent: 'center' },
    tipLabel: { fontSize: 12, fontWeight: '800', color: '#0EA5E9', letterSpacing: 1 },
    tipBodyText: { fontSize: 15, color: '#334155', lineHeight: 24, fontWeight: '500' },

    quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    quickCardEnhanced: { width: '47.5%', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: '#F1F5F9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#0A2463', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4 },
    quickContent: { flex: 1, gap: 12 },
    quickIconBoxEnhanced: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    quickTextView: { flex: 1 },
    quickCardTitle: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
    quickCardSub: { fontSize: 12, color: '#64748B', marginTop: 3, fontWeight: '600' },

    /* Log Form Styles */
    chartCardLog: {
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginTop: 24,
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: 'rgba(10, 36, 99, 0.1)', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 1, shadowRadius: 20, elevation: 5,
    },
    chartTitleLog: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
    logToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    addBadge: { backgroundColor: 'rgba(59,134,255,0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
    addBadgeTxt: { color: '#3B86FF', fontSize: 13, fontWeight: '700' },
    addBadgeCancel: { backgroundColor: 'rgba(239,68,68,0.1)' },
    addBadgeCancelTxt: { color: '#EF4444' },

    formArea: { marginTop: 20 },
    formRow: { flexDirection: 'row', gap: 12 },
    formGroup: { flex: 1, marginBottom: 4 },
    formLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 },
    formInput: {
        backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: '#1E293B', fontWeight: '500',
    },

    submitBtn: {
        borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20,
        overflow: 'hidden', backgroundColor: '#3B86FF',
        shadowColor: '#3B86FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
    },
    submitTxt: { color: '#FFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },

    errorBanner: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
        borderRadius: 16, padding: 14, gap: 10,
    },
    errorText: { flex: 1, color: '#991B1B', fontSize: 13, fontWeight: '600', lineHeight: 18 },
});

