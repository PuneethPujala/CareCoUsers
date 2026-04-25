import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, Platform, Pressable, Animated, ActivityIndicator, Dimensions, Alert, Modal, TextInput, RefreshControl, DeviceEventEmitter, InteractionManager, LayoutAnimation, UIManager } from 'react-native';
import PremiumFormModal from '../../components/ui/PremiumFormModal';
import { Pill, Sunrise, Sun, Moon, CheckCircle2, Circle, Bell, Activity, Plus, Coffee, Utensils, BedDouble, AlertCircle, Calendar, Pencil, Clock, PillBottle, Syringe, X, MessageCircle, ChevronDown, ChevronUp, Info } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle as SvgCircle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { colors } from '../../theme';
import { apiService } from '../../lib/api';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../../lib/supabase';
import { Upload } from 'lucide-react-native';
import usePatientStore from '../../store/usePatientStore';
import { Buffer } from 'buffer';

const { width } = Dimensions.get('window');

const ACCENT_MAP = { morning: '#0D9488', afternoon: '#0F766E', night: '#134E4A' };
const TIME_LABELS = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' };

const FONT = {
    regular: { fontFamily: 'Inter_400Regular' },
    medium: { fontFamily: 'Inter_500Medium' },
    semiBold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

if (Platform.OS === 'android') {
    if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }
}


const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

const CircularProgress = ({ progress = 0, size = 64, strokeWidth = 6, color = '#0D9488' }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const animatedProgress = useRef(new Animated.Value(0)).current;
    const [displayProgress, setDisplayProgress] = useState(0);

    useEffect(() => {
        const listener = animatedProgress.addListener(({ value }) => {
            setDisplayProgress(Math.round(value));
        });
        return () => animatedProgress.removeListener(listener);
    }, [animatedProgress]);

    useEffect(() => {
        Animated.spring(animatedProgress, {
            toValue: progress,
            friction: 8,
            tension: 40,
            useNativeDriver: false,
        }).start();
    }, [progress, animatedProgress]);

    const strokeDashoffset = animatedProgress.interpolate({
        inputRange: [0, 100],
        outputRange: [circumference, 0],
        extrapolate: 'clamp'
    });
    
    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Defs>
                    <SvgLinearGradient id="circGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <Stop offset="0%" stopColor="#60A5FA" />
                        <Stop offset="100%" stopColor="#1E3A8A" />
                    </SvgLinearGradient>
                </Defs>
                <SvgCircle cx={size/2} cy={size/2} r={radius} stroke="#F1F5F9" strokeWidth={strokeWidth} fill="none" />
                <AnimatedCircle 
                    cx={size/2} cy={size/2} r={radius} 
                    stroke="url(#circGrad)" strokeWidth={strokeWidth} fill="none" 
                    strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} 
                    strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} 
                />
            </Svg>
            <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>{displayProgress}%</Text>
            </View>
        </View>
    );
};

const AnimatedBar = ({ percentage }) => {
    const animHeight = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(animHeight, {
            toValue: percentage,
            friction: 8,
            tension: 40,
            useNativeDriver: false,
        }).start();
    }, [percentage, animHeight]);

    const height = animHeight.interpolate({
        inputRange: [0, 100],
        outputRange: ['8%', '100%'],
        extrapolate: 'clamp'
    });

    const backgroundColor = animHeight.interpolate({
        inputRange: [0, 1, 100],
        outputRange: ['#E2E8F0', '#93C5FD', '#2563EB'],
        extrapolate: 'clamp'
    });

    return (
        <View style={styles.chartBarBg}>
            <Animated.View style={[styles.chartBarFill, { height, backgroundColor }]} />
        </View>
    );
};

const ITEM_HEIGHT = 44; // Increased for better tap targets and visibility
const VISIBLE_ITEMS = 5;

const WheelColumn = ({ data, selectedValue, onValueChange, width: colWidth }) => {
    const scrollRef = useRef(null);
    const paddingItems = Math.floor(VISIBLE_ITEMS / 2);
    const isProgrammaticScroll = useRef(false);

    useEffect(() => {
        const idx = data.indexOf(selectedValue);
        if (idx >= 0 && scrollRef.current) {
            isProgrammaticScroll.current = true;
            setTimeout(() => {
                try { scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: false }); } catch(e) {}
                setTimeout(() => { isProgrammaticScroll.current = false; }, 50);
            }, 50);
        }
    }, [selectedValue, data]);

    const handleScroll = useCallback((event) => {
        if (isProgrammaticScroll.current) return;
        const y = event.nativeEvent.contentOffset.y;
        const index = Math.round(y / ITEM_HEIGHT);
        if (index >= 0 && index < data.length && data[index] !== selectedValue) {
            onValueChange(data[index]);
        }
    }, [data, selectedValue, onValueChange]);

    const handleTap = useCallback((index) => {
        isProgrammaticScroll.current = true;
        onValueChange(data[index]);
        if (scrollRef.current) {
            try { scrollRef.current.scrollTo({ y: index * ITEM_HEIGHT, animated: true }); } catch(e) {}
        }
        setTimeout(() => { isProgrammaticScroll.current = false; }, 300);
    }, [data, onValueChange]);

    return (
        <View style={{ height: ITEM_HEIGHT * VISIBLE_ITEMS, width: colWidth || 60, overflow: 'hidden' }}>
            <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_HEIGHT}
                decelerationRate="fast"
                onScroll={handleScroll}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: ITEM_HEIGHT * paddingItems, paddingBottom: ITEM_HEIGHT * paddingItems }}
                nestedScrollEnabled
            >
                {data.map((item, index) => {
                    const isSelected = item === selectedValue;
                    return (
                        <Pressable key={item} onPress={() => handleTap(index)} style={{ height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{
                                fontSize: isSelected ? 22 : 16,
                                fontWeight: isSelected ? '700' : '400',
                                color: isSelected ? '#0F172A' : '#94A3B8',
                                opacity: isSelected ? 1 : 0.6
                            }}>{item}</Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const CustomTimePickerModal = ({ visible, onClose, onSave, initialTime }) => {
    const [hours, setHours] = useState('12');
    const [minutes, setMinutes] = useState('00');
    const [ampm, setAmpm] = useState('AM');

    useEffect(() => {
        if (visible && initialTime) {
            const parts = initialTime.split(':');
            let hr = parseInt(parts[0] || '12', 10);
            const mn = parts[1] || '00';
            const isPm = hr >= 12;
            if (hr === 0) hr = 12;
            else if (hr > 12) hr -= 12;
            setHours(hr.toString().padStart(2, '0'));
            setMinutes(mn);
            setAmpm(isPm ? 'PM' : 'AM');
        }
    }, [visible, initialTime]);

    if (!visible) return null;

    const hoursData = Array.from({length: 12}, (_, i) => (i + 1).toString().padStart(2, '0'));
    const minutesData = Array.from({length: 60}, (_, i) => i.toString().padStart(2, '0'));
    const ampmData = ['AM', 'PM'];

    const handleSave = () => {
        let hr24 = parseInt(hours, 10);
        if (ampm === 'PM' && hr24 !== 12) hr24 += 12;
        if (ampm === 'AM' && hr24 === 12) hr24 = 0;
        onSave(`${hr24.toString().padStart(2, '0')}:${minutes}`);
    };

    const pickerHeight = ITEM_HEIGHT * VISIBLE_ITEMS;

    return (
        <Modal visible transparent animationType="fade">
            <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', alignItems: 'center' }}>
                <Pressable onPress={e => e.stopPropagation()} style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 28, width: 310, shadowColor: '#000', shadowOffset: {width: 0, height: 16}, shadowOpacity: 0.12, shadowRadius: 32, elevation: 10 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A', textAlign: 'center', marginBottom: 20 }}>Select time</Text>
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: pickerHeight, position: 'relative' }}>
                        {/* Highlight band behind selected row */}
                        <View pointerEvents="none" style={{ position: 'absolute', top: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2), left: 16, right: 16, height: ITEM_HEIGHT, borderRadius: 12, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' }} />
                        
                        <WheelColumn data={hoursData} selectedValue={hours} onValueChange={setHours} width={70} />
                        <Text style={{ fontSize: 24, fontWeight: '700', color: '#0F172A', marginHorizontal: 4 }}>:</Text>
                        <WheelColumn data={minutesData} selectedValue={minutes} onValueChange={setMinutes} width={70} />
                        <View style={{ width: 16 }} />
                        <WheelColumn data={ampmData} selectedValue={ampm} onValueChange={setAmpm} width={60} />
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 28, gap: 8 }}>
                        <Pressable onPress={onClose} style={{ paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, alignItems: 'center' }}>
                            <Text style={{ fontSize: 15, fontWeight: '600', color: '#64748B' }}>Cancel</Text>
                        </Pressable>
                        <Pressable onPress={handleSave} style={{ backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, alignItems: 'center' }}>
                            <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFF' }}>Save</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
};

const TimePill = ({ type, timeStr, timeVal }) => {
    let IconCmp, color;
    if (type === 'morning') { IconCmp = Sunrise; color = '#2563EB'; }
    else if (type === 'afternoon') { IconCmp = Sun; color = '#F59E0B'; }
    else { IconCmp = Moon; color = '#1E3A8A'; }

    return (
        <>
            <View style={styles.timeSectionHeaderWrapper}>
                <View style={styles.timeBadgeMinimal}>
                    <IconCmp size={18} color={color} strokeWidth={2.5} />
                    <Text style={[styles.timeBadgeTxt, { color, marginLeft: 8 }]}>{timeStr}</Text>
                </View>
                {timeVal && <Text style={styles.timeBadgeTime}>{timeVal}</Text>}
            </View>
            <View style={styles.timeSectionDivider} />
        </>
    );
};

const AnimatedMedCard = ({ med, onToggle }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const [expanded, setExpanded] = useState(false);
    const swipeableRef = useRef(null);

    const handlePress = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(!expanded);
    };

    let IconCmp = Pill;
    if (med.type === 'afternoon') IconCmp = PillBottle;
    if (med.type === 'night') IconCmp = Syringe;

    const renderLeftActions = (progress, dragX) => {
        const trans = dragX.interpolate({
            inputRange: [0, 50, 100, 101],
            outputRange: [-20, 0, 0, 1],
        });
        return (
            <Pressable style={styles.swipeLeftAction} onPress={() => { swipeableRef.current?.close(); if(!med.taken) onToggle(med); }}>
                <Animated.View style={[styles.swipeActionContent, { transform: [{ translateX: trans }] }]}>
                    <CheckCircle2 size={24} color="#FFF" />
                    <Text style={styles.swipeActionText}>Take</Text>
                </Animated.View>
            </Pressable>
        );
    };

    const renderRightActions = (progress, dragX) => {
        const trans = dragX.interpolate({
            inputRange: [-100, -50, 0],
            outputRange: [0, 0, 20],
        });
        return (
            <Pressable style={styles.swipeRightAction} onPress={() => { swipeableRef.current?.close(); Alert.alert('Snoozed', 'Reminder paused for 30 mins.'); }}>
                <Animated.View style={[styles.swipeActionContent, { transform: [{ translateX: trans }] }]}>
                    <Clock size={24} color="#FFF" />
                    <Text style={styles.swipeActionText}>Snooze</Text>
                </Animated.View>
            </Pressable>
        );
    };

    return (
        <View style={styles.timelineNodeContainer}>
            {/* The Timeline Line Segment */}
            <View style={[styles.timelineLine, med.taken && { backgroundColor: '#22C55E' }]} />
            <View style={[styles.timelineDot, med.taken && { backgroundColor: '#22C55E', borderColor: '#DCFCE7' }]} />
            
            <View style={styles.timelineCardWrapper}>
                <Swipeable 
                    ref={swipeableRef}
                    renderLeftActions={med.taken ? null : renderLeftActions} 
                    renderRightActions={med.taken ? null : renderRightActions}
                    onSwipeableLeftOpen={() => {
                        if (!med.taken && onToggle) onToggle(med);
                        swipeableRef.current?.close();
                    }}
                    friction={2}
                    leftThreshold={40}
                    rightThreshold={40}
                >
                    <Pressable onPress={handlePress} style={[styles.medCard, med.taken && styles.medCardTaken]}>
                        <View style={styles.medCardInner}>
                            <View style={[styles.medIconBox, med.taken ? { backgroundColor: '#DCFCE7' } : { backgroundColor: '#EFF6FF' }]}>
                                {med.taken ? (
                                    <CheckCircle2 size={20} color="#16A34A" strokeWidth={2.5} />
                                ) : (
                                    <IconCmp size={20} color="#3B82F6" strokeWidth={2.5} />
                                )}
                            </View>
                            <View style={styles.medContentMinimal}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text style={[styles.medTitleMinimal, med.taken && { color: '#16A34A' }]}>{med.name}</Text>
                                    {med.taken && (
                                        <View style={styles.takenBadge}>
                                            <CheckCircle2 size={10} color="#16A34A" />
                                            <Text style={styles.takenBadgeText}>Taken</Text>
                                        </View>
                                    )}
                                </View>
                                <View style={styles.medMetaRow}>
                                    <Text style={styles.medSubMinimal}>
                                        {med.preferred_time ? `${med.preferred_time} • ` : ''}
                                        {med.dosage}
                                    </Text>
                                    {med.verifiedByCaller && (
                                        <View style={styles.verifiedBadge}>
                                            <CheckCircle2 size={10} color="#059669" />
                                            <Text style={styles.verifiedTxt}>Verified by Care Team</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                            <View style={{ padding: 4 }}>
                                {expanded ? <ChevronUp size={20} color="#94A3B8" /> : <ChevronDown size={20} color="#94A3B8" />}
                            </View>
                        </View>
                        
                        {expanded && (
                            <View style={styles.medExpandedSection}>
                                <View style={styles.instructionBanner}>
                                    <Info size={16} color="#3B82F6" style={{ marginTop: 2 }} />
                                    <Text style={styles.instructionText}>{med.instructions || 'No special instructions provided.'}</Text>
                                </View>
                            </View>
                        )}
                    </Pressable>
                </Swipeable>
            </View>
        </View>
    );
};


export default function MedicationsScreen({ navigation }) {
    // ── Zustand store subscriptions ─────────────────────────
    const patient = usePatientStore((s) => s.patient);
    const schedule = usePatientStore((s) => s.medicationSchedule);
    const adherence = usePatientStore((s) => s.weeklyAdherence);
    const preferences = usePatientStore((s) => s.callPreferences);
    const storeFetchMedications = usePatientStore((s) => s.fetchMedications);
    const storeSavePrefs = usePatientStore((s) => s.saveCallPreferences);
    const storeOptimisticToggle = usePatientStore((s) => s.optimisticToggleMed);

    // Local-only UI state
    const [loading, setLoading] = useState(true);
    const [showPrefModal, setShowPrefModal] = useState(false);
    const [tempPrefs, setTempPrefs] = useState({ morning: '09:00', afternoon: '14:00', night: '20:00' });
    const [savingPrefs, setSavingPrefs] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [activePicker, setActivePicker] = useState(null);
    const [requestingMod, setRequestingMod] = useState(false);
    const [modRequested, setModRequested] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);

    // Confirmation & Optimistic UI State
    const [confirmingMed, setConfirmingMed] = useState(null);
    const [isConfirmVisible, setIsConfirmVisible] = useState(false);

    const staggerAnims = useRef([...Array(10)].map(() => new Animated.Value(0))).current;
    const lastFetchRef = useRef(0);
    const optimisticMedsRef = useRef({});

    const runAnimations = useCallback(() => {
        staggerAnims.forEach(anim => anim.setValue(0));
        Animated.stagger(80,
            staggerAnims.map(anim =>
                Animated.spring(anim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true })
            )
        ).start();
    }, [staggerAnims]);

    const loadMedicinesData = useCallback(async (isRefresh = false, isBackground = false) => {
        try {
            await storeFetchMedications();
            if (!isRefresh && !isBackground) runAnimations();
        } catch (err) {
            console.warn('Failed to load medications:', err.message);
        } finally {
            setLoading(false);
            if (isRefresh) setRefreshing(false);
        }
    }, [runAnimations, storeFetchMedications]);

    const hasAnimated = useRef(false);
    useFocusEffect(
        useCallback(() => {
            // Defer fetch until after screen transition animation completes (60fps fix)
            const task = InteractionManager.runAfterInteractions(() => {
                loadMedicinesData(false, true).then(() => {
                    if (!hasAnimated.current) {
                        hasAnimated.current = true;
                        runAnimations();
                    }
                });
            });
            // Poll every 2 minutes (was 15s — caused JS thread congestion)
            const interval = setInterval(() => loadMedicinesData(true, true), 120000);
            return () => { task.cancel(); clearInterval(interval); };
        }, [loadMedicinesData, runAnimations])
    );

    useEffect(() => {
        // No longer need DeviceEventEmitter — Zustand handles cross-screen sync
        return () => {};
    }, []);

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        loadMedicinesData(true);
    }, [loadMedicinesData]);

    const handleConfirmToggle = async () => {
        if (!confirmingMed) return;
        const med = confirmingMed;
        
        setIsConfirmVisible(false);
        setConfirmingMed(null);

        try {
            await storeOptimisticToggle(med, !med.taken);
        } catch (err) {
            console.warn('[Optimistic] Mark failed:', err.message);
            Alert.alert('Update Failed', 'Could not sync with server. Please check your connection.');
        }
    };

    const handleMedIconPress = useCallback((med) => {
        if (med.taken) return; // ONE-WAY: User cannot unmark once confirmed
        
        setConfirmingMed(med);
        setIsConfirmVisible(true);
    }, [schedule]);

    const handleSavePreferences = async () => {
        setSavingPrefs(true);
        try {
            await storeSavePrefs(tempPrefs);
            setShowPrefModal(false);
        } catch (err) {
            Alert.alert('Error', 'Failed to save preferences');
        } finally {
            setSavingPrefs(false);
        }
    };

    const allMeds = [...(schedule.morning || []), ...(schedule.afternoon || []), ...(schedule.night || [])];
    const takenCount = allMeds.filter(m => m.taken).length;
    const progressPerc = allMeds.length > 0 ? (takenCount / allMeds.length) * 100 : 0;

    if (loading) {
        return (
            <LinearGradient colors={['#F8FAFC', '#EEF2FF']} style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={'#6366F1'} />
            </LinearGradient>
        );
    }

    if (patient?.subscription?.plan === 'free') {
        return (
            <LinearGradient colors={['#F8FAFC', '#EEF2FF']} style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
                <View style={styles.upgradeIconWrap}><Pill size={32} color={'#6366F1'} /></View>
                <Text style={styles.upgradeTitle}>Premium Feature</Text>
                <Text style={styles.upgradeBody}>Medication tracking and adherence insights are included in the Premium Plan. Upgrade to manage your daily schedule.</Text>
            </LinearGradient>
        );
    }

    const handleUploadPrescription = async () => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                if (Platform.OS === 'web') window.alert('Permission needed to upload prescriptions.');
                else Alert.alert('Permission needed', 'Sorry, we need camera roll permissions to make this work!');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.8,
                base64: true, // Request base64 for reliable cross-device upload
            });

            if (!result.canceled && result.assets[0]) {
                setUploadingImage(true);
                const asset = result.assets[0];
                const ext = 'jpg';
                
                const randomHash = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
                const fileName = `${patient.supabase_uid}/${randomHash}.${ext}`;

                // Resize + compress aggressively to avoid React Native bridge JSON truncation (which causes 400 Bad Request due to malformed JSON)
                const manipResult = await ImageManipulator.manipulateAsync(
                    asset.uri,
                    [{ resize: { width: 800 } }], 
                    { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                );

                // Convert base64 to ArrayBuffer for reliable upload across all Android devices
                const base64Data = manipResult.base64;
                if (!base64Data) throw new Error('Failed to generate base64 from image.');

                // Send directly to backend to bypass frontend RLS issues
                await apiService.patients.uploadPrescription({ 
                    file_base64: base64Data, 
                    content_type: 'image/jpeg' 
                });
                
                if (Platform.OS === 'web') window.alert('Success: Prescription securely uploaded for caregiver review.');
                else Alert.alert('Success', 'Prescription securely uploaded for caregiver review.');
                
                loadMedicinesData(true);
            }
        } catch (error) {
            console.error('Upload Error:', error.response?.data || error);
            const serverError = error.response?.data?.error || error.message || 'There was an issue uploading your file. Ensure your connection is stable.';
            if (Platform.OS === 'web') window.alert('Upload Failed: ' + serverError);
            else Alert.alert('Upload Failed', serverError);
        } finally {
            setUploadingImage(false);
        }
    };

    return (
        <LinearGradient colors={['#F8FAFC', '#EEF2FF']} style={styles.container}>
            <View style={[styles.headerWrap, { zIndex: 10 }]}>
                <Animated.View style={[styles.minimalHeader, { opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
                    <View style={styles.mainHeaderRow}>
                        <View style={styles.headerLeft}>
                            <Text style={styles.headerLabel}>CARE RECORD</Text>
                            <Text style={styles.headerTitle}>Medications</Text>
                        </View>
                        <View style={styles.headerRight}>
                            <Pressable style={styles.headerBtn} onPress={() => navigation.navigate('Notifications')}>
                                <Bell size={20} color={'#0F172A'} strokeWidth={2.5} />
                            </Pressable>
                        </View>
                    </View>
                </Animated.View>
            </View>

            <ScrollView 
                style={styles.body} 
                contentContainerStyle={styles.bodyContent} 
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6366F1" />}
            >
                {allMeds.length === 0 ? (
                    <Animated.View style={[styles.emptyStateContainer, { opacity: staggerAnims[1], transform: [{ scale: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }]}>
                        <View style={styles.emptyIconCircle}>
                            <Calendar size={40} color="#6366F1" strokeWidth={1.5} />
                        </View>
                        <Text style={styles.emptyTitle}>You're all clear!</Text>
                        <Text style={styles.emptyBody}>You have no medications scheduled for today. Kick back and relax, or set your preferred call times below.</Text>
                        <Pressable style={styles.emptyAddBtn} onPress={() => { setShowPrefModal(true); setTempPrefs(preferences); }}>
                            <Clock size={16} color="#FFF" style={{ marginRight: 6 }} />
                            <Text style={styles.emptyAddBtnTxt}>Set Preferences</Text>
                        </Pressable>

                        {/* Request Modification in Empty State */}
                        <Pressable 
                            style={[styles.requestModifyBtn, { marginTop: 16, alignSelf: 'stretch' }, modRequested && { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]} 
                            disabled={requestingMod || modRequested}
                            onPress={async () => {
                                setRequestingMod(true);
                                try {
                                    await apiService.patients.requestMedicationModification({ description: 'Patient requests their caller to add/review medications on next call.' });
                                    setModRequested(true);
                                    if (Platform.OS === 'web') window.alert('Request sent! Your caregiver will discuss medications on your next call.');
                                    else Alert.alert('Request Sent ✓', 'Your caregiver will discuss your medications on your next call.');
                                } catch (e) {
                                    if (Platform.OS === 'web') window.alert('Could not send request. Please try again.');
                                    else Alert.alert('Error', 'Could not send request. Please try again.');
                                } finally {
                                    setRequestingMod(false);
                                }
                            }}
                        >
                            {requestingMod ? (
                                <ActivityIndicator size="small" color="#3B82F6" />
                            ) : modRequested ? (
                                <>
                                    <CheckCircle2 size={18} color="#16A34A" strokeWidth={2.5} />
                                    <Text style={[styles.requestModifyTxt, { color: '#16A34A' }]}>Request Sent to Caregiver</Text>
                                </>
                            ) : (
                                <>
                                    <MessageCircle size={18} color="#3B82F6" strokeWidth={2.5} />
                                    <Text style={styles.requestModifyTxt}>Request Caller to Add Medications</Text>
                                </>
                            )}
                        </Pressable>

                        {/* Direct Prescription Upload in Empty State */}
                        <Pressable 
                            style={[styles.requestModifyBtn, { marginTop: 12, alignSelf: 'stretch', backgroundColor: '#FFF', borderColor: '#D1D5DB' }]} 
                            disabled={uploadingImage}
                            onPress={handleUploadPrescription}
                        >
                            {uploadingImage ? (
                                <ActivityIndicator size="small" color="#10B981" />
                            ) : (
                                <>
                                    <Upload size={18} color="#10B981" strokeWidth={2.5} />
                                    <Text style={[styles.requestModifyTxt, { color: '#10B981' }]}>Upload Physical Prescription</Text>
                                </>
                            )}
                        </Pressable>

                        {patient?.uploaded_prescriptions?.length > 0 && (
                            <View style={{ marginTop: 24, width: '100%' }}>
                                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#64748B', marginBottom: 8 }}>RECENT UPLOADS</Text>
                                {patient.uploaded_prescriptions.map((upload, idx) => (
                                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: '#FFF', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: upload.status === 'reviewed' ? '#DCFCE7' : upload.status === 'rejected' ? '#FEE2E2' : '#FEF9C3', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                                {upload.status === 'reviewed' ? <CheckCircle2 size={16} color="#16A34A" /> : upload.status === 'rejected' ? <X size={16} color="#DC2626" /> : <Clock size={16} color="#CA8A04" />}
                                            </View>
                                            <View>
                                                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#0F172A' }}>Prescription Slip</Text>
                                                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B' }}>{new Date(upload.uploaded_at).toLocaleDateString()}</Text>
                                            </View>
                                        </View>
                                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: upload.status === 'reviewed' ? '#16A34A' : upload.status === 'rejected' ? '#DC2626' : '#CA8A04', textTransform: 'capitalize' }}>
                                            {upload.status}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </Animated.View>
                ) : (
                    <>
                        {/* Daily Progress Hero */}
                        <Animated.View style={{ opacity: staggerAnims[1], transform: [{ scale: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }}>
                            <View style={styles.heroCardMinimal}>
                                <View style={styles.heroLeftMinimal}>
                                    <Text style={styles.heroTitleMinimal}>TODAY'S PROGRESS</Text>
                                    <View style={styles.heroProgressRow}>
                                        <Text style={styles.heroCountLarge}>{takenCount}</Text>
                                        <Text style={styles.heroCountTotal}> / {allMeds.length}</Text>
                                    </View>
                                    <View style={styles.streakBadgeMinimal}>
                                        <Text style={styles.streakBadgeTxtMinimal}>Meds taken</Text>
                                    </View>
                                </View>
                                <CircularProgress progress={progressPerc} size={76} strokeWidth={6} color="#3B82F6" />
                            </View>
                        </Animated.View>

                        {/* Weekly Adherence Mini Bar */}
                        <Animated.View style={{ opacity: staggerAnims[2], transform: [{ translateY: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                            <View style={styles.weeklyCardMinimal}>
                                <Text style={styles.weeklyTitleMinimal}>WEEKLY ADHERENCE</Text>
                                <View style={styles.chartRow}>
                                    {adherence.map((d, i) => (
                                        <View key={i} style={styles.chartCol}>
                                            <AnimatedBar percentage={d.p} />
                                            <Text style={styles.chartDayLabelMinimal}>{d.day.charAt(0)}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        </Animated.View>

                        {/* List Schedule Sections */}
                        {/* Visual Timeline Schedule Sections */}
                        <Animated.View style={{ opacity: staggerAnims[3], transform: [{ translateY: staggerAnims[3].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                            <View style={styles.timelineContainer}>
                                {/* Morning */}
                                {schedule.morning.length > 0 && (
                                    <>
                                        {schedule.morning.map((med, idx) => (
                                            <AnimatedMedCard key={med.id} med={med} onToggle={handleMedIconPress} />
                                        ))}
                                    </>
                                )}

                                {/* Afternoon */}
                                {schedule.afternoon.length > 0 && (
                                    <>
                                        {schedule.afternoon.map((med, idx) => (
                                            <AnimatedMedCard key={med.id} med={med} onToggle={handleMedIconPress} />
                                        ))}
                                    </>
                                )}

                                {/* Night */}
                                {schedule.night.length > 0 && (
                                    <>
                                        {schedule.night.map((med, idx) => (
                                            <AnimatedMedCard key={med.id} med={med} onToggle={handleMedIconPress} />
                                        ))}
                                    </>
                                )}
                            </View>
                        </Animated.View>

                        <Animated.View style={{ opacity: staggerAnims[4], transform: [{ translateY: staggerAnims[4].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }], marginTop: 24 }}>
                            <Pressable 
                                style={[styles.requestModifyBtn, modRequested && { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]} 
                                disabled={requestingMod || modRequested}
                                onPress={async () => {
                                    setRequestingMod(true);
                                    try {
                                        await apiService.patients.requestMedicationModification({ description: 'Patient requests medication review/modification on next call.' });
                                        setModRequested(true);
                                        if (Platform.OS === 'web') window.alert('Request sent! Your caregiver will discuss medications on your next call.');
                                        else Alert.alert('Request Sent ✓', 'Your caregiver will discuss your medications on your next call.');
                                    } catch (e) {
                                        if (Platform.OS === 'web') window.alert('Could not send request. Please try again.');
                                        else Alert.alert('Error', 'Could not send request. Please try again.');
                                    } finally {
                                        setRequestingMod(false);
                                    }
                                }}
                            >
                                {requestingMod ? (
                                    <ActivityIndicator size="small" color="#3B82F6" />
                                ) : modRequested ? (
                                    <>
                                        <CheckCircle2 size={18} color="#16A34A" strokeWidth={2.5} />
                                        <Text style={[styles.requestModifyTxt, { color: '#16A34A' }]}>Request Sent to Caregiver</Text>
                                    </>
                                ) : (
                                    <>
                                        <Pencil size={18} color="#3B82F6" strokeWidth={2.5} />
                                        <Text style={styles.requestModifyTxt}>Request to Modify Medications</Text>
                                    </>
                                )}
                            </Pressable>

                            <Pressable 
                                style={[styles.requestModifyBtn, { marginTop: 12, backgroundColor: '#FFF', borderColor: '#D1D5DB' }]} 
                                disabled={uploadingImage}
                                onPress={handleUploadPrescription}
                            >
                                {uploadingImage ? (
                                    <ActivityIndicator size="small" color="#10B981" />
                                ) : (
                                    <>
                                        <Upload size={18} color="#10B981" strokeWidth={2.5} />
                                        <Text style={[styles.requestModifyTxt, { color: '#10B981' }]}>Upload New Prescription</Text>
                                    </>
                                )}
                            </Pressable>

                            {patient?.uploaded_prescriptions?.length > 0 && (
                                <View style={{ marginTop: 24, paddingHorizontal: 4 }}>
                                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#64748B', marginBottom: 12 }}>UPLOADED PRESCRIPTIONS</Text>
                                    {patient.uploaded_prescriptions.map((upload, idx) => (
                                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#FFFFFF', borderRadius: 16, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 8, elevation: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: upload.status === 'reviewed' ? '#DCFCE7' : upload.status === 'rejected' ? '#FEE2E2' : '#FEF9C3', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                                    {upload.status === 'reviewed' ? <CheckCircle2 size={20} color="#16A34A" /> : upload.status === 'rejected' ? <X size={20} color="#DC2626" /> : <Clock size={20} color="#CA8A04" />}
                                                </View>
                                                <View>
                                                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#0F172A' }}>Doctor's Slip</Text>
                                                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#64748B' }}>{new Date(upload.uploaded_at).toLocaleDateString()}</Text>
                                                </View>
                                            </View>
                                            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: upload.status === 'reviewed' ? '#16A34A' : upload.status === 'rejected' ? '#DC2626' : '#CA8A04', textTransform: 'capitalize' }}>
                                                {upload.status}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </Animated.View>
                    </>
                )}
            </ScrollView>

            {/* Floating Action Button */}
            <Animated.View style={[styles.fabWrapper, { opacity: staggerAnims[5], transform: [{ scale: staggerAnims[5].interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }] }]}>
                <Pressable style={styles.fabShadow} onPress={() => { setShowPrefModal(true); setTempPrefs(preferences); setActivePicker(null); }}>
                    <LinearGradient colors={['#60A5FA', '#1E3A8A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabMinimal}>
                        <Plus size={24} color="#FFF" strokeWidth={2.5} />
                    </LinearGradient>
                </Pressable>
            </Animated.View>

            {/* Preferences Modal */}
            <PremiumFormModal
                visible={showPrefModal}
                title="Call Preferences"
                onClose={() => setShowPrefModal(false)}
                onSave={handleSavePreferences}
                saveText={savingPrefs ? 'Saving...' : 'Save Preferences'}
                saving={savingPrefs}
            >
                <Text style={styles.modalDesc}>Set the time you prefer our team to call you for each medication slot. We'll call within 30 minutes of this time.</Text>
                
                {['morning', 'afternoon', 'night'].map(slot => (
                    <View key={slot} style={styles.prefRow}>
                        <Text style={styles.prefLabel}>{slot.charAt(0).toUpperCase() + slot.slice(1)}</Text>
                        <Pressable style={styles.timeInputBox} onPress={() => setActivePicker(slot)}>
                            <Clock size={16} color="#94A3B8" />
                            <Text style={styles.timeInputTxt}>{tempPrefs[slot]}</Text>
                        </Pressable>
                    </View>
                ))}
            </PremiumFormModal>

            <CustomTimePickerModal 
                visible={!!activePicker} 
                initialTime={activePicker ? tempPrefs[activePicker] : '12:00'} 
                onClose={() => setActivePicker(null)} 
                onSave={(val) => {
                    if (activePicker) {
                        setTempPrefs(p => ({ ...p, [activePicker]: val }));
                    }
                    setActivePicker(null);
                }} 
            />

            {/* Premium Confirmation Modal */}
            <Modal visible={isConfirmVisible} transparent animationType="fade">
                <View style={styles.confirmOverlay}>
                    <View style={styles.confirmCard}>
                        <View style={styles.confirmHeader}>
                            <View style={[styles.confirmIconWrap, { backgroundColor: confirmingMed?.taken ? '#F1F5F9' : '#DBEAFE' }]}>
                                {confirmingMed?.taken ? (
                                    <Clock size={28} color="#64748B" />
                                ) : (
                                    <CheckCircle2 size={28} color="#2563EB" />
                                )}
                            </View>
                        </View>
                        
                        <Text style={styles.confirmTitle}>
                            {confirmingMed?.taken ? 'Undo Record?' : 'Confirm Intake'}
                        </Text>
                        <Text style={styles.confirmText}>
                            {confirmingMed?.taken 
                                ? `Do you want to mark "${confirmingMed?.name}" as not taken?` 
                                : `Have you taken your "${confirmingMed?.name}" medication?`}
                        </Text>
                        
                        <View style={styles.confirmActionRow}>
                            <Pressable 
                                style={styles.confirmCancelBtn} 
                                onPress={() => { setIsConfirmVisible(false); setConfirmingMed(null); }}
                            >
                                <Text style={styles.confirmCancelTxt}>Nevermind</Text>
                            </Pressable>
                            <Pressable 
                                style={[styles.confirmYesBtn, { backgroundColor: confirmingMed?.taken ? '#64748B' : '#2563EB' }]} 
                                onPress={handleConfirmToggle}
                            >
                                <Text style={styles.confirmYesTxt}>
                                    {confirmingMed?.taken ? 'Yes, Undo' : 'Yes, I took it'}
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </LinearGradient>
    );

}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    headerWrap: { zIndex: 10 },
    minimalHeader: { paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingHorizontal: 24, paddingBottom: 16, backgroundColor: 'transparent' },
    mainHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerLeft: { flex: 1 },
    headerLabel: { fontSize: 13, fontWeight: '800', color: '#6366F1', letterSpacing: 1.5, marginBottom: 4 },
    headerTitle: { fontSize: 32, fontWeight: '800', color: '#0F172A', letterSpacing: -1 },
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    headerBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: 20, paddingBottom: 140, paddingTop: 12 },

    // Empty State
    emptyStateContainer: { backgroundColor: '#FFF', borderRadius: 28, padding: 32, alignItems: 'center', marginTop: 32, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#6366F1', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 4 },
    emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 8, textAlign: 'center' },
    emptyBody: { fontSize: 15, fontWeight: '500', color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    emptyAddBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#6366F1', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 100 },
    emptyAddBtnTxt: { fontSize: 15, fontWeight: '700', color: '#FFF' },

    // Upgrade State
    upgradeIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    upgradeTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 12 },
    upgradeBody: { fontSize: 16, fontWeight: '500', color: '#64748B', textAlign: 'center', lineHeight: 24 },

    // Hero Minimal Progress
    heroCardMinimal: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 },
    heroLeftMinimal: { flex: 1 },
    heroTitleMinimal: { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
    heroProgressRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 },
    heroCountLarge: { fontSize: 32, fontWeight: '800', color: '#0F172A' },
    heroCountTotal: { fontSize: 18, fontWeight: '600', color: '#94A3B8', marginLeft: 4 },
    streakBadgeMinimal: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
    streakBadgeTxtMinimal: { fontSize: 11, fontWeight: '600', color: '#1D4ED8' },

    // Weekly Minimal Card
    weeklyCardMinimal: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, marginBottom: 28, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 },
    weeklyTitleMinimal: { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 1, marginBottom: 20, textTransform: 'uppercase' },
    chartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 0 },
    chartCol: { alignItems: 'center', width: '12%' },
    chartBarBg: { width: '100%', height: 60, backgroundColor: 'transparent', justifyContent: 'flex-end' },
    chartBarFill: { width: '100%', borderRadius: 0 },
    chartDayLabelMinimal: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 8 },

    // Section Headers
    timelineContainer: { paddingLeft: 8, paddingRight: 0, marginTop: 16 },
    timeSectionHeaderWrapper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, marginTop: 12, paddingHorizontal: 4 },
    timeBadgeMinimal: { flexDirection: 'row', alignItems: 'center' },
    timeBadgeTxt: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    timeBadgeTime: { fontSize: 13, fontWeight: '700', color: '#94A3B8', letterSpacing: 1 },
    timeSectionDivider: { height: 1, backgroundColor: '#F1F5F9', marginBottom: 20, marginHorizontal: 4 },

    // Timeline Visuals
    timelineNodeContainer: { flexDirection: 'row', position: 'relative', marginBottom: 16 },
    timelineLine: { position: 'absolute', left: 8, top: 24, bottom: -40, width: 2, backgroundColor: '#E2E8F0', zIndex: 1 },
    timelineDot: { position: 'absolute', left: 4, top: 24, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFF', borderWidth: 2, borderColor: '#CBD5E1', zIndex: 2 },
    timelineCardWrapper: { flex: 1, paddingLeft: 32 },

    // Swipe Actions
    swipeLeftAction: { flex: 1, backgroundColor: '#22C55E', justifyContent: 'center', borderRadius: 24, paddingLeft: 24 },
    swipeRightAction: { flex: 1, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'flex-end', borderRadius: 24, paddingRight: 24 },
    swipeActionContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    swipeActionText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

    // Medication Card Minimal
    medCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2, borderWidth: 1, borderColor: '#F1F5F9' },
    medCardInner: { flexDirection: 'row', padding: 16, alignItems: 'center' },
    medIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    medContentMinimal: { flex: 1 },
    medMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
    verifiedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 8, borderWidth: 1, borderColor: '#D1FAE5' },
    verifiedTxt: { fontSize: 10, fontWeight: '700', color: '#059669', marginLeft: 3, textTransform: 'uppercase' },
    medTitleMinimal: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
    medSubMinimal: { fontSize: 13, color: '#64748B', fontWeight: '500' },
    textStrikethrough: { textDecorationLine: 'line-through', color: '#94A3B8' },
    medCardTaken: {
        backgroundColor: '#F0FDF4',
        borderColor: '#DCFCE7',
    },
    takenBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    },
    takenBadgeText: { fontSize: 10, fontWeight: '700', color: '#16A34A' },
    medExpandedSection: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 },
    instructionBanner: { flexDirection: 'row', backgroundColor: '#EFF6FF', padding: 12, borderRadius: 12, gap: 8 },
    instructionText: { flex: 1, fontSize: 13, color: '#1E3A8A', fontWeight: '500', lineHeight: 18 },
    checkboxTouch: { padding: 4 },
    checkboxMinimal: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },

    // FAB Minimal
    fabWrapper: { position: 'absolute', bottom: Platform.OS === 'ios' ? 110 : 100, right: 24, zIndex: 100 },
    fabShadow: { shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6, borderRadius: 28, overflow: 'hidden' },
    fabMinimal: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
    modalDesc: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 24 },
    prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, marginBottom: 12 },
    prefLabel: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
    timeInputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', width: 110, justifyContent: 'center' },
    timeInputTxt: { fontSize: 16, fontWeight: '600', color: '#0F172A', marginLeft: 8 },
    saveBtnWrapper: { marginTop: 12, borderRadius: 16, overflow: 'hidden' },
    saveBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
    saveBtnTxt: { fontSize: 16, fontWeight: '700', color: '#FFF' },

    // Request Modify
    requestModifyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 12, backgroundColor: '#EFF6FF', borderRadius: 16, borderWidth: 1, borderColor: '#BFDBFE', borderStyle: 'dashed' },
    requestModifyTxt: { fontSize: 14, fontWeight: '700', color: '#3B82F6', marginLeft: 8, flexShrink: 1, textAlign: 'center' },

    // Confirmation Modal
    confirmOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    confirmCard: { backgroundColor: '#FFF', borderRadius: 32, padding: 32, width: '100%', maxWidth: 340, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 30, elevation: 12 },
    confirmIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    confirmTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 12 },
    confirmText: { fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
    confirmActionRow: { flexDirection: 'row', gap: 12, width: '100%' },
    confirmCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
    confirmCancelTxt: { fontSize: 15, fontWeight: '700', color: '#64748B' },
    confirmYesBtn: { flex: 2, paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
    confirmYesTxt: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
