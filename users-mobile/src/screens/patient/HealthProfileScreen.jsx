import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, ActivityIndicator, Animated, Pressable, Linking, Modal, TouchableWithoutFeedback, TextInput, KeyboardAvoidingView, Alert, FlatList, Switch, Keyboard } from 'react-native';
import PremiumFormModal from '../../components/ui/PremiumFormModal';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { TriangleAlert, ShieldCheck, HeartPulse, Activity, Stethoscope, Droplet, User, CalendarDays, Watch, Flame, Phone, Plus, Edit2, X, Trash2, CheckCircle2, RefreshCw, AlertTriangle, ChevronDown, Upload, Siren, Dna, Info } from 'lucide-react-native';
import { apiService } from '../../lib/api';
import { initializeHealthPlatform, requestHealthPermissions, fetchDailyVitalsSummary, isHealthSupported } from '../../lib/healthIntegration';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COUNTRY_CODES, parsePhoneWithCode, validatePhone } from '../../utils/phoneUtils';

// ── Skeleton Loader ──────────────────────────────────────────
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

const C = {
  primary: '#6366F1', primaryDark: '#4338CA', primarySoft: '#EEF2FF',
  cardBg: '#FFFFFF', pageBg: '#F8FAFC',
  dark: '#0F172A', mid: '#334155', muted: '#94A3B8', light: '#CBD5E1',
  border: '#F1F5F9', borderMid: '#E2E8F0',
  success: '#10B981', successBg: '#D1FAE5',
  danger: '#F43F5E', dangerBg: '#FFE4E6',
  warning: '#F59E0B', warningBg: '#FEF3C7',
  accent: '#06B6D4',
};

const FONT = {
  regular: { fontFamily: 'Inter_400Regular' },
  medium: { fontFamily: 'Inter_500Medium' },
  semibold: { fontFamily: 'Inter_600SemiBold' },
  bold: { fontFamily: 'Inter_700Bold' },
  heavy: { fontFamily: 'Inter_800ExtraBold' },
};

const ALLERGY_SEVERITY = {
  mild: { bg: '#FEF9C3', text: '#854D0E', border: '#FDE68A' },
  moderate: { bg: '#FFEDD5', text: '#9A3412', border: '#FDBA74' },
  severe: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
};

const CONDITION_STATUS = {
  active: { bg: '#FEE2E2', text: '#991B1B' },
  managed: { bg: '#DCFCE7', text: '#166534' },
  resolved: { bg: '#F0F9FF', text: '#075985' },
};

// UI Component for selecting options horizontally
const ChipSelector = ({ options, selected, onSelect, vertical = false }) => (
    <ScrollView 
        horizontal={!vertical} 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={vertical ? s.chipVerticalWrap : s.chipSelectorWrap}
    >
        {options.map((opt) => {
            const isSelected = selected === opt.value;
            return (
                <Pressable
                    key={opt.value}
                    style={[s.selectChip, isSelected && s.selectChipActive, vertical && { width: '100%', marginBottom: 10 }]}
                    onPress={() => onSelect(opt.value)}
                >
                    <Text style={[s.selectChipTxt, isSelected && s.selectChipTxtActive]}>{opt.label}</Text>
                </Pressable>
            );
        })}
    </ScrollView>
);

export default function HealthProfileScreen({ navigation }) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [healthSdkReady, setHealthSdkReady] = useState(false);

    useEffect(() => {
        if (isHealthSupported()) {
            initializeHealthPlatform().then(ready => setHealthSdkReady(ready));
        }
    }, []);

    const handleWearableSync = async () => {
        if (!healthSdkReady) {
            Alert.alert('Unsupported', 'Health integration is not available on this device.');
            return;
        }
        
        setIsSyncing(true);
        try {
            const hasPermissions = await requestHealthPermissions();
            if (!hasPermissions) {
                Alert.alert('Permission Denied', 'Please enable health permissions in your system settings to seamlessly sync vitals.');
                setIsSyncing(false);
                return;
            }

            const vitals = await fetchDailyVitalsSummary();
            
            // If they have any data at all, sync it
            if (vitals.heart_rate || vitals.oxygen_saturation || vitals.systolic) {
                // Post to our backend
                await apiService.patients.logVitals({
                    heart_rate: vitals.heart_rate || 70, // use default if some are missing but others present, or handle carefully
                    blood_pressure: {
                        systolic: vitals.systolic || 120,
                        diastolic: vitals.diastolic || 80
                    },
                    oxygen_saturation: vitals.oxygen_saturation || 98,
                    hydration: 50, // HealthKit rarely guarantees hydration, send placeholder
                    source: Platform.OS === 'android' ? 'health_connect' : 'healthkit'
                });
                Alert.alert('Sync Complete', 'Successfully securely pulled your latest smartwatch data into Samvaya.');
            } else {
                Alert.alert('No Data Found', "We couldn't find any recent vitals recorded by your watch today.");
            }
        } catch (e) {
            console.error(e);
            Alert.alert('Sync Error', 'An error occurred while connecting to your health data.');
        } finally {
            setIsSyncing(false);
        }
    };

    const staggerAnims = useRef([...Array(10)].map(() => new Animated.Value(0))).current;
    
    // Modal states
    const [modalVisible, setModalVisible] = useState(false);
    const [editingType, setEditingType] = useState(null);
    const [formState, setFormState] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [datePickerField, setDatePickerField] = useState(null); // 'date' | 'date_given'
    const [countryCodeModal, setCountryCodeModal] = useState(false);
    
    const backdropAnim = useRef(new Animated.Value(0)).current;
    const modalAnim = useRef(new Animated.Value(0)).current;

    const runAnimations = useCallback(() => {
        staggerAnims.forEach(anim => anim.setValue(0));
        Animated.stagger(60,
            staggerAnims.map(anim =>
                Animated.spring(anim, { toValue: 1, friction: 8, tension: 45, useNativeDriver: true })
            )
        ).start();
    }, [staggerAnims]);

    const loadProfile = async () => {
        try {
            const { data } = await apiService.patients.getProfile();
            setProfile(data);
        } catch (err) {
            console.warn('Failed to load health profile:', err.message);
            try {
               const res = await apiService.patients.getMe();
               if (res.data.patient?.subscription?.plan === 'free') {
                   setProfile({ freePlan: true });
               }
            } catch (e) {}
        } finally {
            setLoading(false);
        }
    };

    const hasAnimated = useRef(false);

    useFocusEffect(
        useCallback(() => {
            loadProfile().then(() => {
                if (!hasAnimated.current) {
                    hasAnimated.current = true;
                    runAnimations();
                }
            });
        }, [runAnimations])
    );

    const openModal = (type, item = null) => {
        setEditingType(type);
        if (item) {
            if (type === 'gp' && item.gp_phone) {
                const parsed = parsePhoneWithCode(item.gp_phone);
                setFormState({ ...item, gp_phone: parsed.number, gp_phoneCode: parsed.code });
            } else {
                setFormState({ ...item });
            }
        } else {
            // defaults
            if (type === 'condition') setFormState({ name: '', status: 'managed', severity: 'moderate', notes: '' });
            else if (type === 'allergy') setFormState({ name: '', severity: 'moderate', reaction: '' });
            else if (type === 'vitals') setFormState({ height_cm: profile?.lifestyle?.height_cm || '', weight_kg: profile?.lifestyle?.weight_kg || '' });
            else if (type === 'habits') setFormState({ smoking_status: profile?.lifestyle?.smoking_status || 'never', alcohol_use: profile?.lifestyle?.alcohol_use || 'none' });
            else if (type === 'activity') setFormState({ exercise_frequency: profile?.lifestyle?.exercise_frequency || 'none', mobility_level: profile?.lifestyle?.mobility_level || 'full', mobility_aids: profile?.lifestyle?.mobility_aids?.join(', ') || '' });
            else if (type === 'identity') setFormState({ blood_type: profile?.blood_type || 'unknown', dietary_restrictions: profile?.lifestyle?.dietary_restrictions?.join(', ') || '' });
            else if (type === 'contact') setFormState({ name: '', phone: '', relation: '', is_emergency: false, can_view_data: false });
            else if (type === 'gp') {
                const parsed = parsePhoneWithCode(profile?.gp?.phone || '');
                setFormState({ gp_name: profile?.gp?.name || '', gp_phone: parsed.number, gp_phoneCode: parsed.code, gp_email: profile?.gp?.email || '' });
            }
            else if (type === 'history') setFormState({ event: '', date: '', notes: '' });
            else if (type === 'medication') setFormState({ name: '', dosage: '', frequency: 'daily', times: ['morning'], prescribed_by: '', is_active: true });
            else if (type === 'vaccination') setFormState({ name: '', administered_by: '' });
            else if (type === 'appointment') setFormState({ title: '', doctor_name: '', location: '', status: 'upcoming' });
        }
        
        setModalVisible(true);
        Animated.parallel([
            Animated.timing(backdropAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.spring(modalAnim, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true })
        ]).start();
    };

    const closeModal = () => {
        Animated.parallel([
            Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(modalAnim, { toValue: 0, duration: 220, useNativeDriver: true })
        ]).start(() => {
            setModalVisible(false);
            setEditingType(null);
            setFormState({});
            setShowDatePicker(false);
            setShowTimePicker(false);
        });
    };
    
    const getCollectionName = (type) => {
        if (type === 'history') return 'medical_history';
        if (type === 'allergy') return 'allergies';
        if (type === 'contact') return 'trusted-contacts';
        return type + 's';
    };

    const executeDelete = async (collection, id) => {
        try {
            setIsSaving(true);
            await apiService.patients.deleteHealthItem(collection, id);
            await loadProfile();
            closeModal();
        } catch (e) {
            if (Platform.OS === 'web') window.alert("Could not delete item");
            else Alert.alert("Error", "Could not delete item");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = (collection, id) => {
        if (Platform.OS === 'web') {
            if (window.confirm("Are you sure you want to permanently delete this item?")) {
                executeDelete(collection, id);
            }
        } else {
            Alert.alert("Confirm Delete", "Are you sure you want to permanently delete this item?", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => executeDelete(collection, id) }
            ]);
        }
    };

    const handleSave = async () => {
        // Validation logic to prevent empty critical fields
        if (['condition', 'allergy', 'medication', 'vaccination', 'contact'].includes(editingType) && !formState.name) {
            return Platform.OS === 'web' ? window.alert('Please provide a valid name.') : Alert.alert('Missing Field', 'Please provide a valid name.');
        }
        if (['contact'].includes(editingType) && !formState.phone) {
            return Platform.OS === 'web' ? window.alert('Please provide a phone number.') : Alert.alert('Missing Field', 'Please provide a phone number.');
        }
        if (editingType === 'history' && !formState.event) {
            return Platform.OS === 'web' ? window.alert('Please provide an event name.') : Alert.alert('Missing Field', 'Please provide an event name.');
        }
        if (editingType === 'appointment' && (!formState.title || !formState.doctor_name)) {
            return Platform.OS === 'web' ? window.alert('Please provide appointment details.') : Alert.alert('Missing Field', 'Please provide appointment details.');
        }
        
        // ── Date Range Validation ──
        if (['history', 'condition', 'allergy'].includes(editingType) && formState.date) {
            if (new Date(formState.date) > new Date()) {
                return Alert.alert('Invalid Date', 'Date cannot be in the future.');
            }
        }
        if (editingType === 'vaccination' && formState.date_given) {
            if (new Date(formState.date_given) > new Date()) {
                return Alert.alert('Invalid Date', 'Vaccination date cannot be in the future.');
            }
        }
        if (editingType === 'appointment' && formState.date) {
            const today = new Date();
            today.setHours(0,0,0,0);
            if (new Date(formState.date) < today && formState.status === 'upcoming') {
                return Alert.alert('Invalid Date', 'Upcoming appointment date cannot be in the past.');
            }
        }

        if (editingType === 'gp' && formState.gp_phone) {
            const phoneErr = validatePhone(formState.gp_phone, formState.gp_phoneCode);
            if (phoneErr) {
                return Alert.alert('Invalid Phone', phoneErr);
            }
        }

        // ── Vitals range validation ──
        if (editingType === 'vitals') {
            const h = Number(formState.height_cm);
            const w = Number(formState.weight_kg);
            if (formState.height_cm && (h < 50 || h > 300)) {
                return Platform.OS === 'web' ? window.alert('Height must be between 50–300 cm.') : Alert.alert('Invalid Height', 'Height must be between 50 and 300 cm.');
            }
            if (formState.weight_kg && (w < 10 || w > 500)) {
                return Platform.OS === 'web' ? window.alert('Weight must be between 10–500 kg.') : Alert.alert('Invalid Weight', 'Weight must be between 10 and 500 kg.');
            }
            if (h && w) {
                const bmi = w / Math.pow(h / 100, 2);
                if (bmi < 10 || bmi > 60) {
                    return Alert.alert('Invalid Vitals', `The calculated BMI of ${bmi.toFixed(1)} seems highly unlikely. Please verify your height and weight inputs.`);
                }
            }
        }

        // ── Duplicate entry prevention ──
        if (!formState._id) {
            const checkDuplicate = (list, key) => list.some(item => item[key]?.toLowerCase().trim() === formState[key]?.toLowerCase().trim());
            if (editingType === 'condition' && checkDuplicate(conditions, 'name')) {
                return Platform.OS === 'web' ? window.alert('This condition already exists.') : Alert.alert('Duplicate', 'This condition already exists in your health profile.');
            }
            if (editingType === 'allergy' && checkDuplicate(allergies, 'name')) {
                return Platform.OS === 'web' ? window.alert('This allergy already exists.') : Alert.alert('Duplicate', 'This allergy already exists in your health profile.');
            }
            if (editingType === 'medication' && checkDuplicate(medications, 'name')) {
                return Platform.OS === 'web' ? window.alert('This medication already exists.') : Alert.alert('Duplicate', 'This medication already exists in your health profile.');
            }
            if (editingType === 'vaccination' && checkDuplicate(vaccinations, 'name')) {
                return Platform.OS === 'web' ? window.alert('This vaccination already exists.') : Alert.alert('Duplicate', 'This vaccination already exists in your health profile.');
            }
            if (editingType === 'history' && medical_history.some(item => item.event?.toLowerCase().trim() === formState.event?.toLowerCase().trim())) {
                return Platform.OS === 'web' ? window.alert('This medical history entry already exists.') : Alert.alert('Duplicate', 'This entry already exists in your medical history.');
            }
        }
        
        setIsSaving(true);
        try {
            let payload = { ...formState };
            
            if (editingType === 'gp' && formState.gp_phone) {
                payload.gp_phone = `${formState.gp_phoneCode}${formState.gp_phone.replace(/[^0-9]/g, '')}`;
            }

            if (['vitals', 'habits', 'activity', 'identity'].includes(editingType)) {
                let aids = [];
                let diets = [];
                if (formState.mobility_aids) aids = formState.mobility_aids.split(',').map(s=>s.trim()).filter(s=>s);
                if (formState.dietary_restrictions) diets = formState.dietary_restrictions.split(',').map(s=>s.trim()).filter(s=>s);
                payload = { ...profile?.lifestyle, ...formState, mobility_aids: aids, dietary_restrictions: diets };
            }

            let res;
            if (editingType === 'condition') res = await apiService.patients.updateConditions(payload);
            else if (editingType === 'allergy') res = await apiService.patients.updateAllergies(payload);
            else if (['vitals', 'habits', 'activity', 'identity'].includes(editingType)) {
                res = await apiService.patients.updateLifestyle(payload);
                if (editingType === 'identity') {
                    await apiService.patients.updateMe({ blood_type: formState.blood_type });
                }
            }
            else if (editingType === 'contact') {
                if (formState._id) res = await apiService.patients.updateTrustedContact(formState._id, payload);
                else res = await apiService.patients.addTrustedContact(payload);
            }
            else if (editingType === 'gp') res = await apiService.patients.updatePrimaryDoctor(payload);
            else if (editingType === 'history') res = await apiService.patients.updateMedicalHistory({ ...payload, date: payload.date ? new Date(payload.date) : new Date() });
            else if (editingType === 'medication') res = await apiService.patients.updateMedications(payload);
            else if (editingType === 'vaccination') res = await apiService.patients.updateVaccinations({ ...payload, date_given: payload.date_given ? new Date(payload.date_given) : new Date() });
            else if (editingType === 'appointment') res = await apiService.patients.updateAppointments({ ...payload, date: payload.date ? new Date(payload.date) : new Date() });
            
            await loadProfile();
            closeModal();
        } catch (error) {
            if (Platform.OS === 'web') window.alert('Failed to save data. Please check your inputs.');
            else Alert.alert('Error', 'Failed to save data. Please check your inputs.');
            console.warn(error);
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return (
            <View style={[s.container, { padding: 20, paddingTop: Platform.OS === 'android' ? 60 : 40 }]}>
                {/* Header Skeleton */}
                <SkeletonItem width={150} height={28} borderRadius={12} style={{ marginBottom: 24 }} />
                
                {/* Metrics Cards Skeleton */}
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                    <SkeletonItem width="48%" height={100} borderRadius={20} />
                    <SkeletonItem width="48%" height={100} borderRadius={20} />
                </View>

                {/* Vitals Graph/Section Skeleton */}
                <SkeletonItem width="100%" height={160} borderRadius={24} style={{ marginBottom: 24 }} />

                {/* Health Data List Skeleton */}
                <SkeletonItem width={180} height={20} borderRadius={10} style={{ marginBottom: 16 }} />
                <SkeletonItem width="100%" height={80} borderRadius={20} style={{ marginBottom: 12 }} />
                <SkeletonItem width="100%" height={80} borderRadius={20} style={{ marginBottom: 12 }} />
            </View>
        );
    }
    if (profile?.freePlan) return (
            <View style={[s.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
                <View style={s.upgradeIconWrap}><ShieldCheck size={32} color={C.primary} /></View>
                <Text style={s.upgradeTitle}>Premium Feature</Text>
                <Text style={s.upgradeBody}>Your centralized health profile is included in the Basic Plan. Upgrade on the Home screen to build your health profile.</Text>
            </View>
        );

    const { conditions = [], allergies = [], medical_history = [], medications = [], vaccinations = [], appointments = [], lifestyle = {}, gp = {}, age } = profile || {};
    
    // BMI Logic
    const calculateBMI = (h, w) => { if (!h || !w) return null; const hm = h / 100; return (w / (hm * hm)).toFixed(1); };
    const bmi = calculateBMI(lifestyle.height_cm, lifestyle.weight_kg);
    const getBmiStyle = (val) => {
        if (!val) return { bg: 'rgba(59,130,246,0.1)', text: '#FFF', iconBg: 'rgba(59,130,246,0.2)', icon: '#60A5FA', label: 'BMI' };
        const v = parseFloat(val);
        if (v < 18.5) return { bg: 'rgba(245,158,11,0.1)', text: '#FFF', iconBg: 'rgba(245,158,11,0.2)', icon: '#FBBF24', label: 'Underweight' };
        if (v < 25) return { bg: 'rgba(16,185,129,0.1)', text: '#FFF', iconBg: 'rgba(16,185,129,0.2)', icon: '#34D399', label: 'Normal' };
        if (v < 30) return { bg: 'rgba(245,158,11,0.1)', text: '#FFF', iconBg: 'rgba(245,158,11,0.2)', icon: '#FBBF24', label: 'Overweight' };
        return { bg: 'rgba(239,68,68,0.1)', text: '#FFF', iconBg: 'rgba(239,68,68,0.2)', icon: '#F87171', label: 'Obese' };
    };
    const bmiTheme = getBmiStyle(bmi);

    const renderHeader = (title, typeToAdd) => (
        <View style={s.sectionHeaderRow}>
            <Text style={s.sectionHeaderBase}>{title}</Text>
            <Pressable style={({pressed}) => [s.addBtn, pressed && {opacity: 0.7}]} onPress={() => openModal(typeToAdd)}>
                <Plus size={16} color="#FFF" strokeWidth={3} />
            </Pressable>
        </View>
    );

    // Form Dropdown Options
    const severityOptions = [{label: 'Mild', value: 'mild'}, {label: 'Moderate', value: 'moderate'}, {label: 'Severe', value: 'severe'}];
    const statusOptions = [{label: 'Active', value: 'active'}, {label: 'Managed', value: 'managed'}, {label: 'Resolved/Cured', value: 'resolved'}];
    const smokeOptions = [{label: 'Non-Smoker', value: 'never'}, {label: 'Smoker', value: 'current'}, {label: 'Former', value: 'former'}];
    const alcoholOptions = [{label: 'Non-Drinker', value: 'none'}, {label: 'Occasional', value: 'occasional'}, {label: 'Frequent', value: 'heavy'}];
    const exerciseOptions = [{label: 'No Activity', value: 'none'}, {label: 'Light (Walks, Stretching)', value: 'light'}, {label: 'Moderate (Gym, Jogging)', value: 'moderate'}, {label: 'Highly Active (Heavy Cardio)', value: 'active'}];
    const mobilityOptions = [{label: 'Full', value: 'full'}, {label: 'Limited', value: 'limited'}, {label: 'Wheelchair', value: 'wheelchair'}, {label: 'Bedridden', value: 'bedridden'}];
    const frequencyOptions = [{label: 'Daily', value: 'daily'}, {label: 'Weekly', value: 'weekly'}, {label: 'As Needed', value: 'as_needed'}];
    const timeOptions = [{label: 'Morning', value: 'morning'}, {label: 'Afternoon', value: 'afternoon'}, {label: 'Evening', value: 'evening'}, {label: 'Night', value: 'night'}];

    const toggleTime = (t) => {
        let times = formState.times || [];
        if (times.includes(t)) times = times.filter(x => x !== t);
        else times = [...times, t];
        setFormState({...formState, times});
    };

    return (
        <LinearGradient colors={['#F8FAFC', '#EEF2FF']} style={s.container}>
            <View style={s.headerWrap}>
                <Animated.View style={[s.minimalHeader, { opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
                    <View style={s.mainHeaderRow}>
                        <View style={s.headerLeft}>
                            <Text style={s.headerLabel}>CARE RECORD</Text>
                            <Text style={s.headerTitle}>Health Profile</Text>
                        </View>
                        <View style={s.headerRight}>
                            <View style={s.ageBadge}>
                                <Text style={s.ageBadgeTxt}>{age ? `${age} Yrs` : 'No Age Set'}</Text>
                            </View>
                        </View>
                    </View>
                </Animated.View>
            </View>

            <ScrollView style={s.body} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false}>
                {/* 0. IDENTITY & EMERGENCY (BENTO) */}
                <Animated.View style={{ opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        <View style={s.sectionHeaderRow}>
                            <Text style={s.sectionHeaderBase}>IDENTITY & SAFETY</Text>
                        </View>
                        <View style={s.bentoGrid}>
                            <Pressable style={s.bentoPressable} onPress={() => openModal('identity')}>
                                <LinearGradient colors={['#FF6B6B', '#EE5253']} style={s.bentoBoxGradient}>
                                    <View style={s.bentoIconGlass}><Dna size={16} color="#FFF" /></View>
                                    <Text style={s.bentoValWhite}>{profile?.blood_type !== 'unknown' ? profile?.blood_type : '—'}</Text>
                                    <Text style={s.bentoLblWhite}>Blood Type</Text>
                                </LinearGradient>
                            </Pressable>
                            <Pressable style={s.bentoPressable} onPress={() => openModal('identity')}>
                                <LinearGradient colors={['#10B981', '#059669']} style={s.bentoBoxGradient}>
                                    <View style={s.bentoIconGlass}><Info size={16} color="#FFF" /></View>
                                    <Text style={s.bentoValWhite} numberOfLines={1}>{profile?.lifestyle?.dietary_restrictions?.length ? profile?.lifestyle?.dietary_restrictions[0] : 'None'}</Text>
                                    <Text style={s.bentoLblWhite}>Diet / Restrictions</Text>
                                </LinearGradient>
                            </Pressable>
                            <Pressable style={s.bentoPressable} onPress={() => openModal('contact')}>
                                <LinearGradient colors={['#F59E0B', '#D97706']} style={s.bentoBoxGradient}>
                                    <View style={s.bentoIconGlass}><Siren size={16} color="#FFF" /></View>
                                    <Text style={s.bentoValWhite} numberOfLines={1}>{profile?.trusted_contacts?.find(c => c.is_emergency)?.name || 'Not Set'}</Text>
                                    <Text style={s.bentoLblWhite}>Emergency</Text>
                                </LinearGradient>
                            </Pressable>
                        </View>
                    </View>
                </Animated.View>

                {/* 1. CONDITIONS */}
                <Animated.View style={{ opacity: staggerAnims[1], transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        {renderHeader('CURRENT CONDITIONS', 'condition')}
                        <View style={s.cardStack}>
                            {conditions.map((c, i) => {
                                const statStyle = CONDITION_STATUS[c.status] || CONDITION_STATUS.active;
                                return (
                                    <Pressable key={i} style={s.rowItemEnhanced} onPress={() => openModal('condition', c)}>
                                        <View style={[s.iconBg, { backgroundColor: statStyle.bg }]}><Activity size={18} color={statStyle.text} /></View>
                                        <View style={s.rowInfo}>
                                            <Text style={s.rowTitle}>{c.name}</Text>
                                            <Text style={s.rowSub}>{c.diagnosed_on ? new Date(c.diagnosed_on).getFullYear() : 'Unknown'} • <Text style={{textTransform: 'capitalize'}}>{c.severity || 'Unspecified'}</Text></Text>
                                        </View>
                                        <View style={[s.pill, { backgroundColor: statStyle.bg }]}><Text style={[s.pillTxt, { color: statStyle.text, textTransform: 'capitalize' }]}>{c.status}</Text></View>
                                    </Pressable>
                                );
                            })}
                            {conditions.length === 0 && <Text style={s.emptyRowTxt}>No active conditions</Text>}
                        </View>
                    </View>
                </Animated.View>

                {/* 2. ALLERGIES */}
                <Animated.View style={{ opacity: staggerAnims[2], transform: [{ translateY: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        {renderHeader('ALLERGIES', 'allergy')}
                        <View style={s.card}>
                            <View style={s.chipWrap}>
                                {allergies.map((a, i) => {
                                    const sevStyle = ALLERGY_SEVERITY[a.severity] || ALLERGY_SEVERITY.moderate;
                                    return (
                                        <Pressable key={i} style={[s.chipEnhanced, { backgroundColor: sevStyle.bg, borderColor: sevStyle.border }]} onPress={() => openModal('allergy', a)}>
                                            <TriangleAlert size={14} color={sevStyle.text} style={{ marginRight: 6 }} />
                                            <Text style={[s.chipTxt, { color: sevStyle.text }]}>{a.name}</Text>
                                        </Pressable>
                                    );
                                })}
                                {allergies.length === 0 && <Text style={s.emptyRowTxt}>No known allergies</Text>}
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {/* 3. MEDICAL HISTORY */}
                <Animated.View style={{ opacity: staggerAnims[3], transform: [{ translateY: staggerAnims[3].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        {renderHeader('MEDICAL HISTORY', 'history')}
                        <View style={s.card}>
                            <View style={s.timelineContainer}>
                                {medical_history.map((h, i) => (
                                    <Pressable key={i} style={s.timelineRow} onPress={() => openModal('history', h)}>
                                        <View style={s.timelineLeft}>
                                            <View style={s.timelineDot} />
                                            {i < medical_history.length - 1 && <View style={s.timelineLine} />}
                                        </View>
                                        <View style={s.timelineContent}>
                                            <Text style={s.timelineDate}>{h.date ? new Date(h.date).toLocaleDateString('en-IN') : 'Unknown'}</Text>
                                            <Text style={s.timelineTitle}>{h.event}</Text>
                                            {h.notes && <Text style={s.timelineDesc}>{h.notes}</Text>}
                                        </View>
                                    </Pressable>
                                ))}
                                {medical_history.length === 0 && <Text style={s.emptyRowTxt}>No medical history recorded</Text>}
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {/* 4. MEDICATION LIST */}
                <Animated.View style={{ opacity: staggerAnims[4], transform: [{ translateY: staggerAnims[4].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        {renderHeader('CURRENT MEDICATIONS', 'medication')}
                        <View style={s.cardStack}>
                            {medications.filter(m => m.is_active !== false).map((m, i) => (
                                <Pressable key={i} style={s.rowItemEnhanced} onPress={() => openModal('medication', m)}>
                                    <View style={[s.iconBg, { backgroundColor: '#EEF2FF' }]}><Droplet size={18} color="#6366F1" /></View>
                                    <View style={s.rowInfo}>
                                        <Text style={s.rowTitle}>{m.name}</Text>
                                        <Text style={s.rowSub}>{m.dosage} • {m.frequency}</Text>
                                    </View>
                                </Pressable>
                            ))}
                            {medications.filter(m => m.is_active !== false).length === 0 && <Text style={s.emptyRowTxt}>No active medications</Text>}
                        </View>
                    </View>

                    {medications.some(m => m.is_active === false) && (
                        <View style={[s.section, { marginTop: -12 }]}>
                            <Text style={[s.sectionHeaderBase, { fontSize: 11, marginBottom: 12, opacity: 0.6 }]}>PREVIOUS MEDICATIONS (HISTORY)</Text>
                            <View style={[s.cardStack, { opacity: 0.7 }]}>
                                {medications.filter(m => m.is_active === false).map((m, i) => (
                                    <Pressable key={i} style={s.rowItemEnhanced} onPress={() => openModal('medication', m)}>
                                        <View style={[s.iconBg, { backgroundColor: '#F1F5F9' }]}><Droplet size={18} color="#94A3B8" /></View>
                                        <View style={s.rowInfo}>
                                            <Text style={[s.rowTitle, { color: '#64748B' }]}>{m.name}</Text>
                                            <Text style={s.rowSub}>{m.dosage} • {m.frequency}</Text>
                                        </View>
                                        <View style={[s.pill, { backgroundColor: '#F1F5F9' }]}><Text style={[s.pillTxt, { color: '#64748B' }]}>Inactive</Text></View>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    )}
                </Animated.View>

                {/* 5. VACCINATIONS */}
                <Animated.View style={{ opacity: staggerAnims[5], transform: [{ translateY: staggerAnims[5].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        {renderHeader('VACCINATIONS', 'vaccination')}
                        <View style={s.cardStack}>
                            {vaccinations.map((vac, i) => (
                                <Pressable key={i} style={s.rowItemEnhanced} onPress={() => openModal('vaccination', vac)}>
                                    <View style={[s.iconBg, { backgroundColor: '#F0FDF4' }]}><ShieldCheck size={18} color="#16A34A" /></View>
                                    <View style={s.rowInfo}>
                                        <Text style={s.rowTitle}>{vac.name}</Text>
                                        <Text style={s.rowSub}>Given: {vac.date_given ? new Date(vac.date_given).toLocaleDateString() : 'Unknown'}</Text>
                                    </View>
                                </Pressable>
                            ))}
                            {vaccinations.length === 0 && <Text style={s.emptyRowTxt}>No vaccinations recorded</Text>}
                        </View>
                    </View>
                </Animated.View>

                {/* 6. APPOINTMENTS */}
                <Animated.View style={{ opacity: staggerAnims[6], transform: [{ translateY: staggerAnims[6].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        {renderHeader('UPCOMING APPOINTMENTS', 'appointment')}
                        <View style={s.cardStack}>
                            {appointments.map((app, i) => (
                                <Pressable key={i} style={s.rowItemEnhanced} onPress={() => openModal('appointment', app)}>
                                    <View style={[s.iconBg, { backgroundColor: '#FFF7ED' }]}><CalendarDays size={18} color="#EA580C" /></View>
                                    <View style={s.rowInfo}>
                                        <Text style={s.rowTitle}>{app.title}</Text>
                                        <Text style={s.rowSub}>{app.doctor_name} • {new Date(app.date).toLocaleDateString()}</Text>
                                    </View>
                                </Pressable>
                            ))}
                            {appointments.length === 0 && <Text style={s.emptyRowTxt}>No upcoming appointments</Text>}
                        </View>
                    </View>
                </Animated.View>

                {/* 7. LIFESTYLE (BENTO CLICKABLES) */}
                <Animated.View style={{ opacity: staggerAnims[7], transform: [{ translateY: staggerAnims[7].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        <View style={s.sectionHeaderRow}>
                            <Text style={s.sectionHeaderBase}>VITALS & HABITS</Text>
                        </View>
                        <View style={s.bentoGrid}>
                            <Pressable style={s.bentoPressable} onPress={() => openModal('vitals')}>
                                <LinearGradient colors={[bmiTheme.icon || '#6366F1', bmiTheme.text || '#4338CA']} style={s.bentoBoxGradient}>
                                    <View style={s.bentoIconGlass}><User size={16} color="#FFF" /></View>
                                    <Text style={s.bentoValWhite}>{bmi ? bmi : '—'}</Text>
                                    <Text style={s.bentoLblWhite}>{bmiTheme.label}</Text>
                                </LinearGradient>
                            </Pressable>
                            <Pressable style={s.bentoPressable} onPress={() => openModal('habits')}>
                                <LinearGradient colors={['#EC4899', '#BE185D']} style={s.bentoBoxGradient}>
                                    <View style={s.bentoIconGlass}><Flame size={16} color="#FFF" /></View>
                                    <Text style={s.bentoValWhite} numberOfLines={1}>{lifestyle.smoking_status === 'current' ? 'Smoker' : 'Clean'}</Text>
                                    <Text style={s.bentoLblWhite}>Habits</Text>
                                </LinearGradient>
                            </Pressable>
                            <Pressable style={s.bentoPressable} onPress={() => openModal('activity')}>
                                <LinearGradient colors={['#14B8A6', '#0D9488']} style={s.bentoBoxGradient}>
                                    <View style={s.bentoIconGlass}><Activity size={16} color="#FFF" /></View>
                                    <Text numberOfLines={1} style={[s.bentoValWhite, { textTransform: 'capitalize' }]}>{lifestyle.exercise_frequency || 'None'}</Text>
                                    <Text style={s.bentoLblWhite}>Mobility & Exs</Text>
                                </LinearGradient>
                            </Pressable>
                        </View>
                    </View>
                </Animated.View>

                {/* WEARABLE SYNC CARD */}
                {isHealthSupported() && (
                    <Animated.View style={{ opacity: staggerAnims[7], transform: [{ translateY: staggerAnims[7].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                        <View style={s.section}>
                            <View style={s.sectionHeaderRow}>
                                <Text style={s.sectionHeaderBase}>CONNECTED WEARABLES</Text>
                            </View>
                            <View style={s.card}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                        <View style={[s.iconBg, { backgroundColor: '#F3E8FF', marginRight: 16 }]}><Watch size={20} color="#9333EA" /></View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.rowTitle}>{Platform.OS === 'android' ? 'Health Connect' : 'Apple Health'}</Text>
                                            <Text style={s.rowSub}>Sync smartwatch vitals</Text>
                                        </View>
                                    </View>
                                    <Pressable 
                                        style={s.syncBtn} 
                                        onPress={handleWearableSync}
                                        disabled={isSyncing}
                                    >
                                        {isSyncing ? <ActivityIndicator size="small" color="#FFF" /> : <RefreshCw size={16} color="#FFF" />}
                                        {!isSyncing && <Text style={s.syncBtnTxt}>Sync Now</Text>}
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    </Animated.View>
                )}

                {/* 8. CARE TEAM & CONTACTS */}
                <Animated.View style={{ opacity: staggerAnims[8], transform: [{ translateY: staggerAnims[8].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        {renderHeader('CARE TEAM & CONTACTS', 'contact')}
                        <View style={s.cardStack}>
                            {profile?.trusted_contacts?.map((c, i) => (
                                <Pressable key={i} style={s.rowItemEnhanced} onPress={() => openModal('contact', c)}>
                                    <View style={[s.iconBg, { backgroundColor: c.is_emergency ? C.dangerBg : C.primarySoft }]}>
                                        {c.is_emergency ? <Siren size={20} color={C.danger} /> : <User size={20} color={C.primary} />}
                                    </View>
                                    <View style={s.rowInfo}>
                                        <Text style={s.rowTitle}>{c.name}</Text>
                                        <Text style={s.rowSub}>{c.relation} • {c.phone}</Text>
                                    </View>
                                    {c.is_emergency && <View style={[s.pill, { backgroundColor: C.dangerBg }]}><Text style={[s.pillTxt, { color: C.danger }]}>Emergency</Text></View>}
                                </Pressable>
                            ))}
                            {(!profile?.trusted_contacts || profile.trusted_contacts.length === 0) && <Text style={s.emptyRowTxt}>No care team members added.</Text>}
                        </View>
                    </View>
                </Animated.View>

                {/* 9. PRIMARY DOCTOR */}
                <Animated.View style={{ opacity: staggerAnims[9] || new Animated.Value(1), transform: [{ translateY: (staggerAnims[9] || new Animated.Value(1)).interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        <View style={s.sectionHeaderRow}>
                            <Text style={s.sectionHeaderBase}>PRIMARY DOCTOR</Text>
                            <Pressable style={({pressed}) => [s.addBtn, pressed && {opacity: 0.7}]} onPress={() => openModal('gp')}>
                                <Edit2 size={14} color="#FFF" strokeWidth={3} />
                            </Pressable>
                        </View>
                        <View style={s.cardStack}>
                            {gp.name ? (
                                <View style={s.gpCard}>
                                    <View style={s.gpProfileRow}>
                                        <View style={s.gpAvatar}><Text style={s.gpAvatarTxt}>{gp.name.charAt(0)}</Text></View>
                                        <View style={s.gpInfo}>
                                            <Text style={s.gpName}>{gp.name}</Text>
                                            {gp.email && <Text style={s.gpDetail}>{gp.email}</Text>}
                                            {gp.phone && <Text style={s.gpDetail}>{gp.phone}</Text>}
                                        </View>
                                    </View>
                                    <View style={s.gpActionRow}>
                                        <Pressable style={({ pressed }) => [s.btnCall, pressed && s.btnCallPressed, { borderRadius: 100 }]} onPress={() => gp.phone && Linking.openURL(`tel:${gp.phone}`)}>
                                            <Phone size={16} color="#FFF" strokeWidth={2.5} />
                                            <Text style={s.btnCallText}>Call Clinic</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            ) : <Text style={s.emptyRowTxt}>No Primary Doctor assigned.</Text>}
                        </View>
                    </View>
                </Animated.View>
            </ScrollView>

            {/* Dynamic Modal Form — Premium Full-Screen */}
            <PremiumFormModal
                visible={modalVisible}
                title={`${formState._id ? 'Edit' : 'Update'} ${['vitals', 'habits', 'activity'].includes(editingType) ? 'Lifestyle' : editingType}`}
                onClose={closeModal}
                onSave={handleSave}
                saveText="Save Profile Data"
                saving={isSaving}
                headerRight={
                    formState._id && ['condition', 'allergy', 'medication', 'vaccination', 'history', 'appointment'].includes(editingType) ? (
                        <Pressable onPress={() => handleDelete(getCollectionName(editingType), formState._id)} style={s.trashBtn}>
                            <Trash2 size={20} color={C.danger} />
                        </Pressable>
                    ) : null
                }
            >
                {/* Form Fields Matrix */}
                {editingType === 'condition' && (
                    <>
                        <View style={s.formGroup}><Text style={s.formLabel}>Condition Name *</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.name} onChangeText={(t) => setFormState({...formState, name: t})} placeholder="e.g. Type 2 Diabetes" /></View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Status</Text>
                            <ChipSelector options={statusOptions} selected={formState.status} onSelect={v => setFormState({...formState, status: v})} />
                        </View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Severity</Text>
                            <ChipSelector options={severityOptions} selected={formState.severity} onSelect={v => setFormState({...formState, severity: v})} />
                        </View>
                        <View style={s.formGroup}><Text style={s.formLabel}>Notes</Text><TextInput style={[s.input, s.inputMulti]} placeholderTextColor={C.muted} multiline value={formState.notes} onChangeText={(t) => setFormState({...formState, notes: t})} placeholder="Write any personal notes here..." /></View>
                    </>
                )}
                {editingType === 'allergy' && (
                    <>
                        <View style={s.formGroup}><Text style={s.formLabel}>Allergy Name *</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.name} onChangeText={(t) => setFormState({...formState, name: t})} placeholder="e.g. Peanuts, Penicillin" /></View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Severity</Text>
                            <ChipSelector options={severityOptions} selected={formState.severity} onSelect={v => setFormState({...formState, severity: v})} />
                        </View>
                        <View style={s.formGroup}><Text style={s.formLabel}>Reaction Details</Text><TextInput style={[s.input, s.inputMulti]} placeholderTextColor={C.muted} multiline value={formState.reaction} onChangeText={(t) => setFormState({...formState, reaction: t})} placeholder="Describe the physical reaction (e.g., Hives, Anaphylaxis)" /></View>
                    </>
                )}
                {editingType === 'vitals' && (
                    <>
                        <View style={s.formGroup}><Text style={s.formLabel}>Height (cm)</Text><TextInput style={s.input} placeholderTextColor={C.muted} keyboardType="numeric" maxLength={3} value={String(formState.height_cm||'')} onChangeText={(t) => { const v = t.replace(/[^0-9]/g, ''); setFormState({...formState, height_cm: v ? Number(v) : ''}); }} placeholder="e.g. 170" /></View>
                        <View style={s.formGroup}><Text style={s.formLabel}>Weight (kg)</Text><TextInput style={s.input} placeholderTextColor={C.muted} keyboardType="numeric" maxLength={3} value={String(formState.weight_kg||'')} onChangeText={(t) => { const v = t.replace(/[^0-9.]/g, ''); setFormState({...formState, weight_kg: v ? Number(v) : ''}); }} placeholder="e.g. 70" /></View>
                    </>
                )}
                {editingType === 'habits' && (
                    <>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Smoking Habits</Text>
                            <ChipSelector options={smokeOptions} selected={formState.smoking_status} onSelect={v => setFormState({...formState, smoking_status: v})} />
                        </View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Drinking Habits</Text>
                            <ChipSelector options={alcoholOptions} selected={formState.alcohol_use} onSelect={v => setFormState({...formState, alcohol_use: v})} />
                        </View>
                    </>
                )}
                {editingType === 'activity' && (
                    <>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Mobility Level</Text>
                            <ChipSelector options={mobilityOptions} selected={formState.mobility_level} onSelect={v => setFormState({...formState, mobility_level: v})} />
                        </View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Mobility Aids</Text>
                            <TextInput style={s.input} placeholderTextColor={C.muted} value={formState.mobility_aids} onChangeText={(t) => setFormState({...formState, mobility_aids: t})} placeholder="e.g. Cane, Walker (comma separated)" />
                        </View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Activity Intensity & Duration</Text>
                            <ChipSelector vertical options={exerciseOptions} selected={formState.exercise_frequency} onSelect={v => setFormState({...formState, exercise_frequency: v})} />
                        </View>
                    </>
                )}
                {editingType === 'identity' && (
                    <>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Blood Type</Text>
                            <TextInput style={s.input} placeholderTextColor={C.muted} value={formState.blood_type} onChangeText={(t) => setFormState({...formState, blood_type: t.toUpperCase()})} placeholder="e.g. A+, O-" />
                        </View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Dietary Restrictions</Text>
                            <TextInput style={[s.input, s.inputMulti]} placeholderTextColor={C.muted} multiline value={formState.dietary_restrictions} onChangeText={(t) => setFormState({...formState, dietary_restrictions: t})} placeholder="e.g. Low Sodium, Diabetic, Gluten-Free" />
                        </View>
                    </>
                )}
                {editingType === 'contact' && (
                    <>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Contact Name *</Text>
                            <TextInput style={s.input} placeholderTextColor={C.muted} value={formState.name} onChangeText={(t) => setFormState({...formState, name: t})} placeholder="e.g. Jane Doe" />
                        </View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Relationship</Text>
                            <TextInput style={s.input} placeholderTextColor={C.muted} value={formState.relation} onChangeText={(t) => setFormState({...formState, relation: t})} placeholder="e.g. Daughter, Spouse" />
                        </View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Phone Number *</Text>
                            <TextInput style={s.input} placeholderTextColor={C.muted} keyboardType="phone-pad" value={formState.phone} onChangeText={(t) => setFormState({...formState, phone: t})} placeholder="e.g. 9876543210" />
                        </View>
                        <View style={s.formGroup}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 16, ...FONT.bold, color: C.dark }}>Emergency Contact</Text>
                                    <Text style={{ fontSize: 13, color: C.muted }}>Primary person to call in case of emergency</Text>
                                </View>
                                <Switch
                                    value={formState.is_emergency}
                                    onValueChange={(v) => setFormState({ ...formState, is_emergency: v })}
                                    trackColor={{ false: '#CBD5E1', true: C.danger }}
                                    thumbColor={Platform.OS === 'ios' ? '#FFF' : (formState.is_emergency ? '#FFF' : '#F4F4F4')}
                                />
                            </View>
                        </View>
                    </>
                )}
                {editingType === 'gp' && (
                    <>
                        <View style={s.formGroup}><Text style={s.formLabel}>Doctor's Name</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.gp_name} onChangeText={(t) => setFormState({...formState, gp_name: t})} placeholder="Dr. John Doe" /></View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Contact Number</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Pressable
                                    style={{
                                        flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 14,
                                        backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', height: 48,
                                    }}
                                    onPress={() => setCountryCodeModal(true)}
                                >
                                    <Text style={{ fontSize: 16 }}>{COUNTRY_CODES.find(c => c.code === formState.gp_phoneCode)?.flag || '🇮🇳'}</Text>
                                    <Text style={{ fontSize: 15, color: '#334155', fontWeight: '500' }}>{formState.gp_phoneCode || '+91'}</Text>
                                    <ChevronDown size={14} color="#94A3B8" />
                                </Pressable>
                                <TextInput 
                                    style={[s.input, { flex: 1, marginTop: 0 }]} 
                                    placeholderTextColor={C.muted} 
                                    keyboardType="phone-pad" 
                                    value={formState.gp_phone} 
                                    onChangeText={(t) => setFormState({...formState, gp_phone: t.replace(/[^0-9]/g, '')})} 
                                    maxLength={COUNTRY_CODES.find(c => c.code === formState.gp_phoneCode)?.maxDigits || 12}
                                    placeholder="98765 43210" 
                                />
                            </View>
                        </View>
                        <View style={s.formGroup}><Text style={s.formLabel}>Email</Text><TextInput style={s.input} placeholderTextColor={C.muted} keyboardType="email-address" autoCapitalize="none" value={formState.gp_email} onChangeText={(t) => setFormState({...formState, gp_email: t})} placeholder="doctor@clinic.com" /></View>
                    </>
                )}
                {editingType === 'medication' && (
                    <>
                        <View style={s.formGroup}><Text style={s.formLabel}>Medication Name *</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.name} onChangeText={(t) => setFormState({...formState, name: t})} placeholder="e.g. Paracetamol" /></View>
                        <View style={s.formGroup}><Text style={s.formLabel}>Dosage</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.dosage} onChangeText={(t) => setFormState({...formState, dosage: t})} placeholder="e.g. 500mg" /></View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Frequency</Text>
                            <ChipSelector options={frequencyOptions} selected={formState.frequency} onSelect={v => setFormState({...formState, frequency: v})} />
                        </View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Times of Day (Select Multiple)</Text>
                            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
                                {timeOptions.map(opt => {
                                    const isSelected = (formState.times || []).includes(opt.value);
                                    return (
                                        <Pressable key={opt.value} onPress={() => toggleTime(opt.value)} style={[s.selectChip, isSelected && s.selectChipActive]}>
                                            <Text style={[s.selectChipTxt, isSelected && s.selectChipTxtActive]}>{opt.label}</Text>
                                        </Pressable>
                                    )
                                })}
                            </View>
                        </View>
                        <View style={s.formGroup}><Text style={s.formLabel}>Prescribed By</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.prescribed_by} onChangeText={(t) => setFormState({...formState, prescribed_by: t})} placeholder="Doctor's Name" /></View>
                        <View style={[s.formGroup, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }]}>
                            <Text style={s.formLabel}>Currently Active</Text>
                            <Switch
                                trackColor={{ false: '#E2E8F0', true: '#818CF8' }}
                                thumbColor={formState.is_active ? '#4338CA' : '#F8FAFC'}
                                onValueChange={(val) => setFormState({ ...formState, is_active: val })}
                                value={formState.is_active !== false}
                            />
                        </View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Prescription Details</Text>
                            <Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed' }} onPress={() => Alert.alert('Coming Soon', 'Upload functionality will be added in a future update.')}>
                                <Upload size={18} color={C.primary} />
                                <Text style={{ color: C.primary, fontSize: 15, fontWeight: '600' }}>Upload Prescription</Text>
                            </Pressable>
                        </View>
                    </>
                )}
                {editingType === 'history' && (
                    <>
                        <View style={s.formGroup}><Text style={s.formLabel}>Event / Surgery / Diagnosis *</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.event} onChangeText={(t) => setFormState({...formState, event: t})} placeholder="e.g. Knee Replacement" /></View>
                        <View style={s.formGroup}><Text style={s.formLabel}>Date *</Text><Pressable style={s.input} onPress={() => { setDatePickerField('date'); setShowDatePicker(true); }}><Text style={{ color: formState.date ? C.dark : C.muted, fontSize: 15 }}>{formState.date ? new Date(formState.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Select date'}</Text></Pressable></View>
                        <View style={s.formGroup}><Text style={s.formLabel}>Detailed Notes</Text><TextInput style={[s.input, s.inputMulti]} placeholderTextColor={C.muted} multiline value={formState.notes} onChangeText={(t) => setFormState({...formState, notes: t})} placeholder="How did the procedure go? Who was the doctor?" /></View>
                    </>
                )}
                {editingType === 'vaccination' && (
                    <>
                        <View style={s.formGroup}><Text style={s.formLabel}>Vaccine Name *</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.name} onChangeText={(t) => setFormState({...formState, name: t})} placeholder="e.g. Influenza, COVID-19" /></View>
                        <View style={s.formGroup}><Text style={s.formLabel}>Date Given *</Text><Pressable style={s.input} onPress={() => { setDatePickerField('date_given'); setShowDatePicker(true); }}><Text style={{ color: formState.date_given ? C.dark : C.muted, fontSize: 15 }}>{formState.date_given ? new Date(formState.date_given).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Select date'}</Text></Pressable></View>
                    </>
                )}
                {editingType === 'appointment' && (
                    <>
                        <View style={s.formGroup}><Text style={s.formLabel}>Reason / Title *</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.title} onChangeText={(t) => setFormState({...formState, title: t})} placeholder="General Checkup" /></View>
                        <View style={s.formGroup}><Text style={s.formLabel}>Doctor / Specialist Name *</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.doctor_name} onChangeText={(t) => setFormState({...formState, doctor_name: t})} placeholder="Dr. Smith" /></View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>Date & Time *</Text>
                            <View style={{flexDirection: 'row', gap: 10}}>
                                <Pressable style={[s.input, {flex: 1, justifyContent: 'center'}]} onPress={() => { setDatePickerField('date'); setShowDatePicker(true); }}>
                                    <Text style={{color: formState.date ? C.dark : C.muted}}>
                                        {formState.date ? new Date(formState.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Select Date'}
                                    </Text>
                                </Pressable>
                                <Pressable style={[s.input, {flex: 1, justifyContent: 'center'}]} onPress={() => { setDatePickerField('date'); setShowTimePicker(true); }}>
                                    <Text style={{color: formState.date ? C.dark : C.muted}}>
                                        {formState.date ? new Date(formState.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Select Time'}
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    </>
                )}
                {editingType === 'dob' && (
                    <View style={s.pickerContainer}>
                        <View style={s.pickerHeader}>
                            <Text style={s.pickerPreview}>
                                {new Date(formState.year, formState.month, formState.day).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}
                            </Text>
                        </View>
                        <Text style={s.pickerLabel}>Birth Year</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.yearScroll}>
                            {Array.from({length: 101}, (_, i) => new Date().getFullYear() - i).map(y => (
                                <Pressable key={y} onPress={() => {
                                    const maxDays = new Date(y, formState.month + 1, 0).getDate();
                                    setFormState({...formState, year: y, day: Math.min(formState.day || 1, maxDays)});
                                }} style={[s.yearChip, formState.year === y && s.yearChipActive]}>
                                    <Text style={[s.yearChipTxt, formState.year === y && s.yearChipTxtActive]}>{y}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                        <Text style={[s.pickerLabel, {marginTop: 20}]}>Month</Text>
                        <View style={s.monthGrid}>
                            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
                                <Pressable key={m} onPress={() => {
                                    const maxDays = new Date(formState.year, i + 1, 0).getDate();
                                    setFormState({...formState, month: i, day: Math.min(formState.day || 1, maxDays)});
                                }} style={[s.monthChip, formState.month === i && s.monthChipActive]}>
                                    <Text style={[s.monthChipTxt, formState.month === i && s.monthChipTxtActive]}>{m}</Text>
                                </Pressable>
                            ))}
                        </View>
                        <Text style={[s.pickerLabel, {marginTop: 20}]}>Day</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dayScroll}>
                            {Array.from({length: new Date(formState.year, formState.month + 1, 0).getDate()}, (_, i) => i + 1).map(d => (
                                <Pressable key={d} onPress={() => setFormState({...formState, day: d})} style={[s.dayChip, formState.day === d && s.dayChipActive]}>
                                    <Text style={[s.dayChipTxt, formState.day === d && s.dayChipTxtActive]}>{d}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                )}
            </PremiumFormModal>

            {/* Country Code Picker Modal */}
            <Modal visible={countryCodeModal} transparent animationType="slide">
                <View style={s.countryModalWrap}>
                    <View style={s.countryModalHeader}>
                        <Text style={s.countryModalTitle}>Select Country Code</Text>
                        <Pressable onPress={() => setCountryCodeModal(false)} style={s.closeIconBtn}>
                            <X size={20} color={C.mid} />
                        </Pressable>
                    </View>
                    <FlatList
                        data={COUNTRY_CODES}
                        keyExtractor={item => item.code}
                        contentContainerStyle={{ padding: 16 }}
                        renderItem={({ item }) => (
                            <Pressable 
                                style={s.countryOption} 
                                onPress={() => {
                                    setFormState({ ...formState, gp_phoneCode: item.code });
                                    setCountryCodeModal(false);
                                }}
                            >
                                <Text style={s.countryFlag}>{item.flag}</Text>
                                <Text style={s.countryName}>{item.name}</Text>
                                <Text style={s.countryCodeText}>{item.code}</Text>
                            </Pressable>
                        )}
                    />
                </View>
            </Modal>

            {/* Native Date Picker overlay */}
            {showDatePicker && (
                <View style={Platform.OS === 'ios' ? { position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10, zIndex: 9999, paddingBottom: 20 } : {}}>
                    {Platform.OS === 'ios' && (
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                            <Pressable onPress={() => setShowDatePicker(false)}>
                                <Text style={{ color: C.primary, fontWeight: 'bold', fontSize: 16 }}>Done</Text>
                            </Pressable>
                        </View>
                    )}
                    <DateTimePicker
                        value={formState[datePickerField] ? new Date(formState[datePickerField]) : new Date()}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        maximumDate={editingType === 'appointment' ? undefined : new Date()}
                        onChange={(event, selectedDate) => {
                            if (Platform.OS === 'android') setShowDatePicker(false);
                            if (event.type !== 'dismissed' && selectedDate) {
                                if (editingType === 'appointment') {
                                    // For appointments, keep the existing time intact if updating date
                                    const current = formState[datePickerField] ? new Date(formState[datePickerField]) : new Date();
                                    selectedDate.setHours(current.getHours(), current.getMinutes(), 0, 0);
                                }
                                setFormState(prev => ({ ...prev, [datePickerField]: selectedDate.toISOString() }));
                            }
                        }}
                    />
                </View>
            )}
            
            {/* Native Time Picker overlay */}
            {showTimePicker && (
                <View style={Platform.OS === 'ios' ? { position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10, zIndex: 9999, paddingBottom: 20 } : {}}>
                    {Platform.OS === 'ios' && (
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                            <Pressable onPress={() => setShowTimePicker(false)}>
                                <Text style={{ color: C.primary, fontWeight: 'bold', fontSize: 16 }}>Done</Text>
                            </Pressable>
                        </View>
                    )}
                    <DateTimePicker
                        value={formState[datePickerField] ? new Date(formState[datePickerField]) : new Date()}
                        mode="time"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(event, selectedDate) => {
                            if (Platform.OS === 'android') setShowTimePicker(false);
                            if (event.type !== 'dismissed' && selectedDate) {
                                const current = formState[datePickerField] ? new Date(formState[datePickerField]) : new Date();
                                current.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
                                setFormState(prev => ({ ...prev, [datePickerField]: current.toISOString() }));
                            }
                        }}
                    />
                </View>
            )}
        </LinearGradient>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    headerWrap: { zIndex: 10 },
    minimalHeader: { paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingHorizontal: 24, paddingBottom: 24, backgroundColor: 'transparent' },
    mainHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerLeft: { flex: 1 },
    headerLabel: { fontSize: 13, fontWeight: '800', color: C.primary, letterSpacing: 2, marginBottom: 6 },
    headerTitle: { fontSize: 36, fontWeight: '900', color: C.dark, letterSpacing: -1 },
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    ageBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primarySoft, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 24, borderWidth: 1, borderColor: '#E0E7FF' },
    editIconInBadge: { marginRight: 6, opacity: 0.8 },
    ageBadgeTxt: { color: C.primaryDark, ...FONT.bold, fontSize: 14 },
    body: { flex: 1 },
    bodyContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 160 },
    section: { marginBottom: 36, width: '100%' },
    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, paddingHorizontal: 8 },
    sectionHeaderBase: { fontSize: 13, ...FONT.bold, color: '#64748B', letterSpacing: 1.5, textTransform: 'uppercase' },
    addBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
    card: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 24, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3, borderWidth: 1, borderColor: '#F1F5F9' },
    cardStack: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 8, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3, borderWidth: 1, borderColor: '#F1F5F9' },
    rowItemEnhanced: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    iconBg: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    rowInfo: { flex: 1 },
    rowTitle: { fontSize: 17, ...FONT.bold, color: C.dark, marginBottom: 4 },
    rowSub: { fontSize: 14, ...FONT.medium, color: C.muted },
    pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    pillTxt: { fontSize: 12, ...FONT.bold },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    chipEnhanced: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, borderWidth: 1 },
    chipTxt: { fontSize: 14, ...FONT.bold },
    timelineContainer: { marginTop: 4 },
    timelineRow: { flexDirection: 'row', gap: 20 },
    timelineLeft: { alignItems: 'center', width: 20 },
    timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.primary, borderWidth: 3, borderColor: '#E0E7FF' },
    timelineLine: { width: 2, flex: 1, backgroundColor: '#E2E8F0', marginVertical: 4 },
    timelineContent: { flex: 1, paddingBottom: 32 },
    timelineDate: { fontSize: 12, ...FONT.bold, color: C.muted, marginBottom: 4 },
    timelineTitle: { fontSize: 17, ...FONT.bold, color: C.dark },
    timelineDesc: { fontSize: 15, color: C.muted, marginTop: 6, lineHeight: 22, ...FONT.medium },
    emptyRowTxt: { fontSize: 15, color: '#64748B', fontStyle: 'italic', padding: 24, textAlign: 'center' },
    bentoGrid: { flexDirection: 'row', gap: 12 },
    bentoPressable: { flex: 1 },
    bentoBoxGradient: { borderRadius: 20, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
    bentoIconGlass: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.2)' },
    bentoValWhite: { fontSize: 18, ...FONT.heavy, color: '#FFF', marginBottom: 4 },
    bentoLblWhite: { fontSize: 11, ...FONT.bold, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 0.5 },
    bentoBox: { flex: 1, borderRadius: 24, padding: 16, alignItems: 'center' },
    bentoIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    bentoVal: { fontSize: 18, ...FONT.heavy, color: C.dark, marginBottom: 4 },
    bentoLbl: { fontSize: 12, ...FONT.bold, color: C.muted },
    gpCard: { padding: 20, backgroundColor: '#FFF', borderRadius: 24, shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    gpProfileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    gpAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: 16, borderWidth: 2, borderColor: '#FFF' },
    gpAvatarTxt: { fontSize: 24, ...FONT.heavy, color: C.primaryDark },
    gpInfo: { flex: 1 },
    gpName: { fontSize: 19, ...FONT.bold, color: C.dark, marginBottom: 4 },
    gpDetail: { fontSize: 14, ...FONT.medium, color: C.muted, marginBottom: 2 },
    gpActionRow: { flexDirection: 'row', marginTop: 8 },
    btnCall: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 100, backgroundColor: C.primary },
    btnCallPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    btnCallText: { fontSize: 15, ...FONT.bold, color: '#FFF' },
    upgradeIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    upgradeTitle: { fontSize: 24, ...FONT.bold, color: C.dark, marginBottom: 12, letterSpacing: -0.5 },
    upgradeBody: { fontSize: 16, ...FONT.regular, color: C.muted, textAlign: 'center', lineHeight: 24 },
    
    // Modal Details
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.5)' },
    modalWrapper: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 36, borderTopRightRadius: 36, maxHeight: '92%', marginTop: 60, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 12 },
    modalHandleWrap: { alignItems: 'center', paddingVertical: 16 },
    modalHandle: { width: 48, height: 6, borderRadius: 3, backgroundColor: '#E2E8F0' },
    modalBody: { paddingHorizontal: 24, paddingBottom: 40 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    formGroup: { marginBottom: 20 },
    formLabel: { fontSize: 13, ...FONT.bold, color: C.muted, marginBottom: 10, letterSpacing: 0.5 },
    input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, paddingHorizontal: 16, height: 56, fontSize: 16, ...FONT.medium, color: C.dark },
    inputMulti: { height: 100, paddingTop: 16, textAlignVertical: 'top' },
    btnSaveLg: { height: 60, borderRadius: 100, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12, shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8 },
    btnSaveTextLg: { fontSize: 17, ...FONT.bold, color: '#FFF' },
    trashBtn: { padding: 4, backgroundColor: C.dangerBg, borderRadius: 8 },
    closeIconBtn: { padding: 4 },
    
    // Custom Selector Chips
    chipSelectorWrap: { flexDirection: 'row', gap: 10, paddingBottom: 4 },
    chipVerticalWrap: { flexDirection: 'column', paddingBottom: 4 },
    selectChip: { paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: C.borderMid, borderRadius: 12, backgroundColor: '#FFF' },
    selectChipActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
    selectChipTxt: { fontSize: 14, ...FONT.bold, color: C.muted },
    selectChipTxtActive: { color: C.primaryDark },

    // Picker Styles
    pickerContainer: { paddingBottom: 20 },
    pickerHeader: { backgroundColor: C.primarySoft, padding: 16, borderRadius: 20, marginBottom: 20, alignItems: 'center' },
    pickerPreview: { fontSize: 18, ...FONT.bold, color: C.primaryDark },
    pickerLabel: { fontSize: 13, ...FONT.bold, color: C.muted, marginBottom: 12, letterSpacing: 0.5 },
    yearScroll: { marginBottom: 10 },
    yearChip: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', marginRight: 10 },
    yearChipActive: { backgroundColor: C.primary, borderColor: C.primary },
    yearChipTxt: { fontSize: 16, ...FONT.bold, color: C.mid },
    yearChipTxtActive: { color: '#FFF' },
    monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    monthChip: { width: '31%', paddingVertical: 10, alignItems: 'center', borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
    monthChipActive: { backgroundColor: C.primary, borderColor: C.primary },
    monthChipTxt: { fontSize: 14, ...FONT.bold, color: C.mid },
    monthChipTxtActive: { color: '#FFF' },
    dayScroll: { marginTop: 10 },
    dayChip: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    dayChipActive: { backgroundColor: C.primary, borderColor: C.primary },
    dayChipTxt: { fontSize: 16, ...FONT.bold, color: C.mid },
    dayChipTxtActive: { color: '#FFF' },
    syncBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
    syncBtnTxt: { color: '#FFF', ...FONT.bold, fontSize: 14 },

    // Country Picker
    countryModalWrap: { backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '80%', marginTop: 'auto', shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 12 },
    countryModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    countryModalTitle: { fontSize: 18, ...FONT.bold, color: C.dark },
    countryOption: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
    countryFlag: { fontSize: 24, marginRight: 12 },
    countryName: { flex: 1, fontSize: 16, color: C.dark, ...FONT.medium },
    countryCodeText: { fontSize: 16, color: C.primary, ...FONT.bold }
});
