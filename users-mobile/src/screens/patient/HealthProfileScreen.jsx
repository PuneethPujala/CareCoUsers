import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, ActivityIndicator, Animated, Pressable, Linking, Modal, TextInput, FlatList, Switch } from 'react-native';
import SmartInput from '../../components/ui/SmartInput';
import PremiumFormModal from '../../components/ui/PremiumFormModal';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { TriangleAlert, ShieldCheck, HeartPulse, Activity, Droplet, Phone, Plus, Edit2, X, Trash2, CheckCircle2, RefreshCw, ChevronDown, Upload, Siren, ChevronRight, TrendingUp, BellRing, FileText, Pill, Syringe, Link2, Users, Calendar, Info } from 'lucide-react-native';
import { StatusBar } from 'react-native';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { apiService } from '../../lib/api';
import { initializeHealthPlatform, requestHealthPermissions, fetchDailyVitalsSummary, isHealthSupported } from '../../lib/healthIntegration';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COUNTRY_CODES, parsePhoneWithCode, validatePhone } from '../../utils/phoneUtils';
import { layout } from '../../theme';
import AlertManager from '../../utils/AlertManager';


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
    primary: '#0EA5E9', primaryDark: '#0284C7', primarySoft: '#E0F2FE',
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
    const { t } = useTranslation();
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
            AlertManager.alert(t('common.unsupported', { defaultValue: 'Unsupported' }), t('health.integration_unavailable', { defaultValue: 'Health integration is not available on this device.' }));
            return;
        }
        setIsSyncing(true);
        try {
            const hasPermissions = await requestHealthPermissions();
            if (!hasPermissions) {
                AlertManager.alert(t('common.permission_denied', { defaultValue: 'Permission Denied' }), t('health.enable_permissions', { defaultValue: 'Please enable health permissions in your system settings to seamlessly sync vitals.' }));
                setIsSyncing(false);
                return;
            }
            const vitals = await fetchDailyVitalsSummary();
            if (vitals.heart_rate || vitals.oxygen_saturation || vitals.systolic) {
                await apiService.patients.logVitals({
                    heart_rate: vitals.heart_rate || 70,
                    blood_pressure: { systolic: vitals.systolic || 120, diastolic: vitals.diastolic || 80 },
                    oxygen_saturation: vitals.oxygen_saturation || 98,
                    hydration: 50,
                    source: Platform.OS === 'android' ? 'health_connect' : 'healthkit'
                });
                AlertManager.alert(t('common.sync_complete', { defaultValue: 'Sync Complete' }), t('health.sync_success_desc', { defaultValue: 'Successfully securely pulled your latest smartwatch data into CareMyMed.' }));
            } else {
                AlertManager.alert(t('common.no_data_found', { defaultValue: 'No Data Found' }), t('health.no_recent_vitals', { defaultValue: "We couldn't find any recent vitals recorded by your watch today." }));
            }
        } catch (e) {
            console.error(e);
            AlertManager.alert(t('common.sync_error', { defaultValue: 'Sync Error' }), t('health.sync_error_desc', { defaultValue: 'An error occurred while connecting to your health data.' }));
        } finally {
            setIsSyncing(false);
        }
    };

    const staggerAnims = useRef([...Array(10)].map(() => new Animated.Value(0))).current;

    const [modalVisible, setModalVisible] = useState(false);
    const [editingType, setEditingType] = useState(null);
    const [formState, setFormState] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [datePickerField, setDatePickerField] = useState(null);
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
            if (type === 'condition') setFormState({ name: '', status: 'managed', severity: 'moderate', notes: '' });
            else if (type === 'allergy') setFormState({ name: '', severity: 'moderate', reaction: '' });
            else if (type === 'vitals') setFormState({ height_cm: profile?.lifestyle?.height_cm || '', weight_kg: profile?.lifestyle?.weight_kg || '' });
            else if (type === 'habits') setFormState({ smoking_status: profile?.lifestyle?.smoking_status || '', alcohol_use: profile?.lifestyle?.alcohol_use || '' });
            else if (type === 'activity') setFormState({ exercise_frequency: profile?.lifestyle?.exercise_frequency || '', mobility_level: profile?.lifestyle?.mobility_level || 'full', mobility_aids: profile?.lifestyle?.mobility_aids?.join(', ') || '' });
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
            if (Platform.OS === 'web') window.alert(t('health.could_not_delete', { defaultValue: "Could not delete item" }));
            else AlertManager.alert(t('common.error', { defaultValue: "Error" }), t('health.could_not_delete', { defaultValue: "Could not delete item" }));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = (collection, id) => {
        if (Platform.OS === 'web') {
            if (window.confirm(t('health.confirm_delete_msg', { defaultValue: "Are you sure you want to permanently delete this item?" }))) {
                executeDelete(collection, id);
            }
        } else {
            AlertManager.alert(t('common.confirm_delete', { defaultValue: "Confirm Delete" }), t('health.confirm_delete_msg', { defaultValue: "Are you sure you want to permanently delete this item?" }), [
                { text: t('common.cancel', { defaultValue: "Cancel" }), style: "cancel" },
                { text: t('common.delete', { defaultValue: "Delete" }), style: "destructive", onPress: () => executeDelete(collection, id) }
            ]);
        }
    };

    const handleSave = async () => {
        const nameRegex = /^[a-zA-Z\s'-]+$/;

        if (editingType === 'contact' && formState.name && !nameRegex.test(formState.name)) {
            return AlertManager.alert(t('common.invalid_name', { defaultValue: 'Invalid Name' }), t('health.invalid_contact_name', { defaultValue: 'Contact names can only contain letters, spaces, hyphens, and apostrophes.' }));
        }
        if (editingType === 'gp' && formState.gp_name && !nameRegex.test(formState.gp_name)) {
            return AlertManager.alert(t('common.invalid_name', { defaultValue: 'Invalid Name' }), t('health.invalid_doc_name', { defaultValue: 'Doctor names can only contain letters, spaces, hyphens, and apostrophes.' }));
        }
        if (editingType === 'appointment' && formState.doctor_name && !nameRegex.test(formState.doctor_name)) {
            return AlertManager.alert(t('common.invalid_name', { defaultValue: 'Invalid Name' }), t('health.invalid_doc_name', { defaultValue: 'Doctor names can only contain letters, spaces, hyphens, and apostrophes.' }));
        }

        if (['condition', 'allergy', 'medication', 'vaccination', 'contact'].includes(editingType) && !formState.name?.trim()) {
            return Platform.OS === 'web' ? window.alert(t('health.missing_name', { defaultValue: 'Please provide a valid name.' })) : AlertManager.alert(t('common.missing_field', { defaultValue: 'Missing Field' }), t('health.missing_name', { defaultValue: 'Please provide a valid name.' }));
        }
        if (editingType === 'identity' && formState.blood_type) {
            const validTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'];
            if (!validTypes.includes(formState.blood_type)) {
                return AlertManager.alert(t('health.invalid_blood_type', { defaultValue: 'Invalid Blood Type' }), t('health.select_valid_blood', { defaultValue: 'Please select a valid blood type.' }));
            }
        }
        if (['contact'].includes(editingType) && !formState.phone?.trim()) {
            return Platform.OS === 'web' ? window.alert(t('health.missing_phone', { defaultValue: 'Please provide a phone number.' })) : AlertManager.alert(t('common.missing_field', { defaultValue: 'Missing Field' }), t('health.missing_phone', { defaultValue: 'Please provide a phone number.' }));
        }
        if (editingType === 'history' && !formState.event?.trim()) {
            return Platform.OS === 'web' ? window.alert(t('health.missing_event', { defaultValue: 'Please provide an event name.' })) : AlertManager.alert(t('common.missing_field', { defaultValue: 'Missing Field' }), t('health.missing_event', { defaultValue: 'Please provide an event name.' }));
        }
        if (editingType === 'appointment' && (!formState.title?.trim() || !formState.doctor_name?.trim())) {
            return Platform.OS === 'web' ? window.alert(t('health.missing_appt_details', { defaultValue: 'Please provide appointment details.' })) : AlertManager.alert(t('common.missing_field', { defaultValue: 'Missing Field' }), t('health.missing_appt_details', { defaultValue: 'Please provide appointment details.' }));
        }

        if (['condition', 'allergy', 'medication', 'history'].includes(editingType)) {
            const val = formState.name || formState.event;
            if (val && val.trim().length < 2) {
                return AlertManager.alert(t('common.too_short', { defaultValue: 'Too Short' }), t('health.name_too_short', { defaultValue: 'Please enter a more descriptive name (at least 2 characters).' }));
            }
        }

        if (['history', 'condition', 'allergy'].includes(editingType) && formState.date) {
            if (new Date(formState.date) > new Date()) {
                return AlertManager.alert(t('common.invalid_date', { defaultValue: 'Invalid Date' }), t('health.date_future_error', { defaultValue: 'Date cannot be in the future.' }));
            }
        }
        if (editingType === 'vaccination' && formState.date_given) {
            if (new Date(formState.date_given) > new Date()) {
                return AlertManager.alert(t('common.invalid_date', { defaultValue: 'Invalid Date' }), t('health.vaccine_future_error', { defaultValue: 'Vaccination date cannot be in the future.' }));
            }
        }
        if (editingType === 'appointment' && formState.date) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (new Date(formState.date) < today && formState.status === 'upcoming') {
                return AlertManager.alert(t('common.invalid_date', { defaultValue: 'Invalid Date' }), t('health.appt_past_error', { defaultValue: 'Upcoming appointment date cannot be in the past.' }));
            }
        }

        if (editingType === 'gp' && formState.gp_phone) {
            const phoneErr = validatePhone(formState.gp_phone, formState.gp_phoneCode);
            if (phoneErr) return AlertManager.alert(t('common.invalid_phone', { defaultValue: 'Invalid Phone' }), phoneErr);
        }
        if (editingType === 'contact' && formState.phone) {
            if (formState.phone.replace(/[^0-9]/g, '').length < 10) {
                return AlertManager.alert(t('common.invalid_phone', { defaultValue: 'Invalid Phone' }), t('health.enter_10_digits', { defaultValue: 'Please enter a valid 10-digit phone number.' }));
            }
        }

        if (editingType === 'vitals') {
            const h = Number(formState.height_cm);
            const w = Number(formState.weight_kg);
            if (formState.height_cm && (h < 50 || h > 300)) {
                return Platform.OS === 'web' ? window.alert(t('health.height_range', { defaultValue: 'Height must be between 50–300 cm.' })) : AlertManager.alert(t('common.invalid_height', { defaultValue: 'Invalid Height' }), t('health.height_range', { defaultValue: 'Height must be between 50 and 300 cm.' }));
            }
            if (formState.weight_kg && (w < 10 || w > 500)) {
                return Platform.OS === 'web' ? window.alert(t('health.weight_range', { defaultValue: 'Weight must be between 10–500 kg.' })) : AlertManager.alert(t('common.invalid_weight', { defaultValue: 'Invalid Weight' }), t('health.weight_range', { defaultValue: 'Weight must be between 10 and 500 kg.' }));
            }
            if (h && w) {
                const bmi = w / Math.pow(h / 100, 2);
                if (bmi < 10 || bmi > 60) {
                    return AlertManager.alert(t('health.invalid_vitals', { defaultValue: 'Invalid Vitals' }), t('health.invalid_bmi_desc', { defaultValue: `The calculated BMI of ${bmi.toFixed(1)} seems highly unlikely. Please verify your height and weight inputs.`, bmi: bmi.toFixed(1) }));
                }
            }
        }

        if (!formState._id) {
            const checkDuplicate = (list, key) => list.some(item => item[key]?.toLowerCase().trim() === formState[key]?.toLowerCase().trim());
            if (editingType === 'condition' && checkDuplicate(conditions, 'name')) {
                return Platform.OS === 'web' ? window.alert(t('health.condition_exists', { defaultValue: 'This condition already exists.' })) : AlertManager.alert(t('common.duplicate', { defaultValue: 'Duplicate' }), t('health.condition_exists_desc', { defaultValue: 'This condition already exists in your health profile.' }));
            }
            if (editingType === 'allergy' && checkDuplicate(allergies, 'name')) {
                return Platform.OS === 'web' ? window.alert(t('health.allergy_exists', { defaultValue: 'This allergy already exists.' })) : AlertManager.alert(t('common.duplicate', { defaultValue: 'Duplicate' }), t('health.allergy_exists_desc', { defaultValue: 'This allergy already exists in your health profile.' }));
            }
            if (editingType === 'medication' && checkDuplicate(medications, 'name')) {
                return Platform.OS === 'web' ? window.alert(t('health.med_exists', { defaultValue: 'This medication already exists.' })) : AlertManager.alert(t('common.duplicate', { defaultValue: 'Duplicate' }), t('health.med_exists_desc', { defaultValue: 'This medication already exists in your health profile.' }));
            }
            if (editingType === 'vaccination' && checkDuplicate(vaccinations, 'name')) {
                return Platform.OS === 'web' ? window.alert(t('health.vax_exists', { defaultValue: 'This vaccination already exists.' })) : AlertManager.alert(t('common.duplicate', { defaultValue: 'Duplicate' }), t('health.vax_exists_desc', { defaultValue: 'This vaccination already exists in your health profile.' }));
            }
            if (editingType === 'history' && medical_history.some(item => item.event?.toLowerCase().trim() === formState.event?.toLowerCase().trim())) {
                return Platform.OS === 'web' ? window.alert(t('health.history_exists', { defaultValue: 'This medical history entry already exists.' })) : AlertManager.alert(t('common.duplicate', { defaultValue: 'Duplicate' }), t('health.history_exists_desc', { defaultValue: 'This entry already exists in your medical history.' }));
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
                if (formState.mobility_aids) aids = formState.mobility_aids.split(',').map(s => s.trim()).filter(s => s);
                if (formState.dietary_restrictions) diets = formState.dietary_restrictions.split(',').map(s => s.trim()).filter(s => s);
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
            else AlertManager.alert('Error', 'Failed to save data. Please check your inputs.');
            console.warn(error);
        } finally {
            setIsSaving(false);
        }
    };

    // ── Loading skeleton ──────────────────────────────────────
    if (loading) {
        return (
            <View style={[s.container, { padding: 20, paddingTop: Platform.OS === 'android' ? 60 : 40 }]}>
                <SkeletonItem width={160} height={28} borderRadius={12} style={{ marginBottom: 24 }} />
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                    <SkeletonItem width="48%" height={100} borderRadius={20} />
                    <SkeletonItem width="48%" height={100} borderRadius={20} />
                </View>
                <SkeletonItem width="100%" height={160} borderRadius={24} style={{ marginBottom: 24 }} />
                <SkeletonItem width={180} height={20} borderRadius={10} style={{ marginBottom: 16 }} />
                <SkeletonItem width="100%" height={80} borderRadius={20} style={{ marginBottom: 12 }} />
                <SkeletonItem width="100%" height={80} borderRadius={20} style={{ marginBottom: 12 }} />
            </View>
        );
    }

    if (profile?.freePlan) return (
        <View style={[s.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
            <View style={s.upgradeIconWrap}><ShieldCheck size={32} color={C.primary} /></View>
            <Text style={s.upgradeTitle}>{t('common.premium_feature', { defaultValue: 'Premium Feature' })}</Text>
            <Text style={s.upgradeBody}>{t('health_profile.premium_desc', { defaultValue: 'Your centralized health profile is included in the Basic Plan. Upgrade on the Home screen to build your health profile.' })}</Text>
        </View>
    );

    const { conditions = [], allergies = [], medical_history = [], medications = [], vaccinations = [], appointments = [], lifestyle = {}, gp = {}, age } = profile || {};

    const calculateBMI = (h, w) => { if (!h || !w) return null; const hm = h / 100; return (w / (hm * hm)).toFixed(1); };
    const bmi = calculateBMI(lifestyle.height_cm, lifestyle.weight_kg);
    const getBmiStyle = (val) => {
        if (!val) return { label: 'BMI' };
        const v = parseFloat(val);
        if (v < 18.5) return { label: t('health.underweight', { defaultValue: 'Underweight' }) };
        if (v < 25) return { label: t('common.normal', { defaultValue: 'Normal' }) };
        if (v < 30) return { label: t('health.overweight', { defaultValue: 'Overweight' }) };
        return { label: t('health.obese', { defaultValue: 'Obese' }) };
    };
    const bmiTheme = getBmiStyle(bmi);

    const calcCompletion = () => {
        let score = 0, total = 10;
        if (profile?.blood_type && profile.blood_type !== 'unknown') score++;
        if (conditions.length > 0) score++;
        if (allergies.length > 0) score++;
        if (medical_history.length > 0) score++;
        if (medications.length > 0) score++;
        if (vaccinations.length > 0) score++;
        if (lifestyle.height_cm && lifestyle.weight_kg) score++;
        if (profile?.trusted_contacts?.length > 0) score++;
        if (gp.name) score++;
        if (lifestyle.smoking_status && lifestyle.smoking_status !== 'never') score++; else if (lifestyle.smoking_status === 'never') score++;
        return Math.round((score / total) * 100);
    };
    const completionPct = calcCompletion();

    const handleCompletionClick = () => {
        const missing = [];
        if (!profile?.blood_type || profile.blood_type === 'unknown') missing.push(t('health_profile.blood_type', { defaultValue: 'Blood Type' }));
        if (conditions.length === 0) missing.push(t('health_profile.current_conditions', { defaultValue: 'Current Conditions' }));
        if (allergies.length === 0) missing.push(t('health_profile.allergies', { defaultValue: 'Allergies' }));
        if (medical_history.length === 0) missing.push(t('health_profile.medical_history', { defaultValue: 'Medical History' }));
        if (medications.length === 0) missing.push(t('health_profile.medications', { defaultValue: 'Medications' }));
        if (vaccinations.length === 0) missing.push(t('health_profile.vaccinations', { defaultValue: 'Vaccinations' }));
        if (!lifestyle.height_cm || !lifestyle.weight_kg) missing.push(t('health_profile.height_weight', { defaultValue: 'Height & Weight' }));
        if (!profile?.trusted_contacts?.length) missing.push(t('caller.emergency_contact', { defaultValue: 'Emergency Contact' }));
        if (!gp.name) missing.push(t('health_profile.primary_gp', { defaultValue: 'Primary GP' }));
        if (!lifestyle.smoking_status || lifestyle.smoking_status === 'unknown') missing.push(t('health_profile.smoking_status', { defaultValue: 'Smoking Status' }));
        if (missing.length === 0) {
            AlertManager.alert(t('health_profile.profile_complete', { defaultValue: 'Profile Complete' }), t('health_profile.profile_complete_desc', { defaultValue: 'You have completed 100% of your health profile. Great job!' }));
        } else {
            AlertManager.alert(t('health_profile.incomplete_profile', { defaultValue: 'Incomplete Profile' }), t('health_profile.incomplete_profile_desc', { defaultValue: 'Please add the following information to complete your profile:\n\n• ' }) + missing.join('\n• '));
        }
    };

    const calcHabitScore = () => {
        let score = 50;
        if (lifestyle.smoking_status === 'never') score += 20; else if (lifestyle.smoking_status === 'former') score += 10; else if (lifestyle.smoking_status === 'current') score -= 10;
        if (lifestyle.alcohol_use === 'none') score += 15; else if (lifestyle.alcohol_use === 'occasional') score += 5; else score -= 10;
        if (lifestyle.exercise_frequency === 'active') score += 15; else if (lifestyle.exercise_frequency === 'moderate') score += 10; else if (lifestyle.exercise_frequency === 'light') score += 5;
        return Math.max(0, Math.min(100, score));
    };
    const habitScore = calcHabitScore();
    const habitLabel = habitScore >= 70 ? t('common.good', { defaultValue: 'Good' }) : habitScore >= 40 ? t('common.fair', { defaultValue: 'Fair' }) : t('health.needs_work', { defaultValue: 'Needs Work' });
    const habitColor = habitScore >= 70 ? '#10B981' : habitScore >= 40 ? '#F59E0B' : '#EF4444';

    const managedCount = conditions.filter(c => c.status === 'managed' || c.status === 'resolved').length;
    const trendLabel = conditions.length === 0 ? t('common.good', { defaultValue: 'Good' }) : managedCount >= conditions.length * 0.5 ? t('common.good', { defaultValue: 'Good' }) : t('health.monitor', { defaultValue: 'Monitor' });
    const trendSub = conditions.length === 0 ? t('health.no_issues', { defaultValue: 'No issues' }) : managedCount >= conditions.length * 0.5 ? t('health.stable', { defaultValue: 'Stable' }) : t('health.attention', { defaultValue: 'Attention' });
    const trendColor = trendLabel === t('common.good', { defaultValue: 'Good' }) ? '#10B981' : '#F59E0B';

    const renderHeader = (title, typeToAdd, hideAdd = false) => (
        <View style={s.sectionHeaderRow}>
            <Text style={s.sectionHeaderBase}>{title}</Text>
            {!hideAdd && (
                <Pressable style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.7 }]} onPress={() => openModal(typeToAdd)}>
                    <Plus size={16} color="#FFF" strokeWidth={3} />
                </Pressable>
            )}
        </View>
    );

    const severityOptions = [{ label: t('health.mild', { defaultValue: 'Mild' }), value: 'mild' }, { label: t('health.moderate', { defaultValue: 'Moderate' }), value: 'moderate' }, { label: t('health.severe', { defaultValue: 'Severe' }), value: 'severe' }];
    const statusOptions = [{ label: t('health.active', { defaultValue: 'Active' }), value: 'active' }, { label: t('health.managed', { defaultValue: 'Managed' }), value: 'managed' }, { label: t('health.resolved_cured', { defaultValue: 'Resolved/Cured' }), value: 'resolved' }];
    const smokeOptions = [{ label: t('health.non_smoker', { defaultValue: 'Non-Smoker' }), value: 'never' }, { label: t('health.smoker', { defaultValue: 'Smoker' }), value: 'current' }, { label: t('health.former', { defaultValue: 'Former' }), value: 'former' }];
    const alcoholOptions = [{ label: t('health.non_drinker', { defaultValue: 'Non-Drinker' }), value: 'none' }, { label: t('health.occasional', { defaultValue: 'Occasional' }), value: 'occasional' }, { label: t('health.frequent', { defaultValue: 'Frequent' }), value: 'heavy' }];
    const exerciseOptions = [{ label: t('health.no_activity', { defaultValue: 'No Activity' }), value: 'none' }, { label: t('health.light_activity', { defaultValue: 'Light (Walks, Stretching)' }), value: 'light' }, { label: t('health.moderate_activity', { defaultValue: 'Moderate (Gym, Jogging)' }), value: 'moderate' }, { label: t('health.highly_active', { defaultValue: 'Highly Active (Heavy Cardio)' }), value: 'active' }];
    const mobilityOptions = [{ label: t('health.full', { defaultValue: 'Full' }), value: 'full' }, { label: t('health.limited', { defaultValue: 'Limited' }), value: 'limited' }, { label: t('health.wheelchair', { defaultValue: 'Wheelchair' }), value: 'wheelchair' }, { label: t('health.bedridden', { defaultValue: 'Bedridden' }), value: 'bedridden' }];
    const frequencyOptions = [{ label: t('health.daily', { defaultValue: 'Daily' }), value: 'daily' }, { label: t('health.weekly', { defaultValue: 'Weekly' }), value: 'weekly' }, { label: t('health.as_needed', { defaultValue: 'As Needed' }), value: 'as_needed' }];
    const timeOptions = [{ label: t('time_slots.morning', { defaultValue: 'Morning' }), value: 'morning' }, { label: t('time_slots.afternoon', { defaultValue: 'Afternoon' }), value: 'afternoon' }, { label: t('time_slots.evening', { defaultValue: 'Evening' }), value: 'evening' }, { label: t('time_slots.night', { defaultValue: 'Night' }), value: 'night' }];

    const toggleTime = (t) => {
        let times = formState.times || [];
        if (times.includes(t)) times = times.filter(x => x !== t);
        else times = [...times, t];
        setFormState({ ...formState, times });
    };

    const anim = (i) => ({
        opacity: staggerAnims[i],
        transform: [{ translateY: staggerAnims[i].interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
    });

    const activeMeds = medications.filter(m => m.is_active !== false);
    const inactiveMeds = medications.filter(m => m.is_active === false);

    return (
        <View style={s.root}>
            <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

            {/* ── Simple Header (like care team) ── */}
            <View style={s.header}>
                <View style={s.headerRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.headerEyebrow}>{t('health_profile.health_vault', { defaultValue: 'HEALTH VAULT' })}</Text>
                        <Text style={s.headerTitle}>{t('health_profile.my_records', { defaultValue: 'My Records' })}</Text>
                        <Text style={{ fontSize: 13, color: '#64748B', marginTop: 4, ...FONT.medium }}>{t('health_profile.overview_sub', { defaultValue: 'Overview of your health and medical information' })}</Text>
                    </View>
                    <Pressable style={s.headerBtn} onPress={() => navigation.navigate('Notifications')}>
                        <BellRing size={20} color="#0F172A" strokeWidth={2.5} />
                    </Pressable>
                </View>
            </View>

            <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

                {/* ── TOP DASHBOARD / HEALTH SCORE ── */}
                <Animated.View style={anim(0)}>
                    <View style={s.dashboardCard}>
                        {/* Top row: Score + Ring */}
                        <View style={s.dashTopRow}>
                            <View style={s.dashLeft}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                    <Text style={s.dashEyebrow}>{t('health_profile.health_score', { defaultValue: 'HEALTH SCORE' })}</Text>
                                    <Info size={12} color="#94A3B8" />
                                </View>
                                <View style={s.dashScoreRow}>
                                    <Text style={s.dashScoreMain}>{completionPct}</Text>
                                    <Text style={s.dashScoreSub}>/ 100</Text>
                                </View>
                                <View style={s.dashStatusRow}>
                                    <ShieldCheck size={14} color="#10B981" />
                                    <Text style={s.dashStatusTxt}>{t('health_profile.status_stable', { defaultValue: 'Stable' })}</Text>
                                </View>
                                <View style={s.dashSyncRow}>
                                    <RefreshCw size={10} color="#94A3B8" />
                                    <Text style={s.dashSyncTxt}>{t('health_profile.last_sync', { defaultValue: 'Last sync: 2h ago' })}</Text>
                                </View>
                            </View>
                            <View style={s.dashCenter}>
                                <View style={s.ringWrap}>
                                    <Svg width={88} height={88} viewBox="0 0 88 88">
                                        <SvgCircle cx="44" cy="44" r="38" stroke="#EEF2FF" strokeWidth="8" fill="transparent" />
                                        <SvgCircle cx="44" cy="44" r="38" stroke="#4F46E5" strokeWidth="8" fill="transparent" strokeDasharray={`${2 * Math.PI * 38}`} strokeDashoffset={`${2 * Math.PI * 38 * (1 - completionPct / 100)}`} strokeLinecap="round" transform="rotate(-90 44 44)" />
                                    </Svg>
                                    <HeartPulse size={24} color="#94A3B8" style={{ position: 'absolute' }} />
                                </View>
                            </View>
                        </View>
                        {/* Bottom row: Mini metrics */}
                        <View style={s.dashMetricsRow}>
                            <View style={s.dashMiniMetric}>
                                <View style={[s.dashMiniIcon, { backgroundColor: '#EEF2FF' }]}><TrendingUp size={12} color="#4F46E5" /></View>
                                <View>
                                    <Text style={s.dashMiniLbl}>{t('health_profile.good_habits', { defaultValue: 'Good Habits' })}</Text>
                                    <Text style={[s.dashMiniVal, { color: '#10B981' }]}>{habitScore}%</Text>
                                </View>
                            </View>
                            <View style={s.dashMiniMetric}>
                                <View style={[s.dashMiniIcon, { backgroundColor: '#FFF7ED' }]}><Users size={12} color="#F97316" /></View>
                                <View>
                                    <Text style={s.dashMiniLbl}>{t('health_profile.bmi', { defaultValue: 'BMI' })}</Text>
                                    <Text style={[s.dashMiniVal, { color: '#F97316' }]}>{bmi || '—'}</Text>
                                </View>
                            </View>
                            <View style={s.dashMiniMetric}>
                                <View style={[s.dashMiniIcon, { backgroundColor: '#ECFDF5' }]}><ShieldCheck size={12} color="#10B981" /></View>
                                <View>
                                    <Text style={s.dashMiniLbl}>{t('health_profile.conditions', { defaultValue: 'Conditions' })}</Text>
                                    <Text style={[s.dashMiniVal, { color: '#10B981' }]}>{trendLabel}</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {/* ── ALERTS CARD ── */}
                <Animated.View style={anim(1)}>
                    <Pressable style={s.alertsCard}>
                        <View style={s.alertHeader}>
                            <View style={s.alertIconBox}><TriangleAlert size={18} color="#EF4444" /></View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.alertTitle}>{t('health_profile.health_alerts', { defaultValue: 'Health Alerts' })}</Text>
                                <Text style={s.alertSub}>
                                    {conditions.filter(c => c.status === 'active').length + allergies.filter(a => a.severity === 'severe').length} {t('health_profile.active_alerts_sub', { defaultValue: 'active alerts need your attention' })}
                                </Text>
                            </View>
                            <ChevronRight size={16} color="#94A3B8" />
                        </View>
                        <View style={s.alertChips}>
                            {conditions.filter(c => c.status === 'active').map((c, i) => (
                                <View key={'c'+i} style={s.alertChip}><View style={s.alertDot} /><Text style={s.alertChipTxt}>{c.name}</Text></View>
                            ))}
                            {allergies.filter(a => a.severity === 'severe').map((a, i) => (
                                <View key={'a'+i} style={s.alertChip}><View style={s.alertDot} /><Text style={s.alertChipTxt}>{a.name} {t('health_profile.allergy', { defaultValue: 'Allergy' })}</Text></View>
                            ))}
                        </View>
                    </Pressable>
                </Animated.View>

                {/* ── STACKED CARDS ── */}
                <View style={{ gap: 16 }}>
                    
                    {/* Current Conditions */}
                    <Animated.View style={anim(2)}>
                        <View style={s.gridCard}>
                            <View style={s.gridHeader}>
                                <View style={[s.gridIconWrap, { backgroundColor: '#FEE2E2' }]}><HeartPulse size={16} color="#EF4444" /></View>
                                <Text style={s.gridTitle}>{t('health_profile.current_conditions', { defaultValue: 'Current Conditions' })}</Text>
                                <Pressable style={s.gridAddBtn} onPress={() => openModal('condition')} hitSlop={10}>
                                    <Plus size={16} color="#EF4444" />
                                </Pressable>
                            </View>
                            <View style={s.gridBody}>
                                {conditions.map((c, i) => {
                                    const statStyle = CONDITION_STATUS[c.status] || CONDITION_STATUS.active;
                                    return (
                                        <Pressable key={i} style={s.gridRow} onPress={() => openModal('condition', c)}>
                                            <View style={[s.gridDot, { backgroundColor: statStyle.text }]} />
                                            <Text style={s.gridRowTxt} numberOfLines={1}>{c.name}</Text>
                                            <View style={[s.miniPill, { backgroundColor: statStyle.bg }]}><Text style={[s.miniPillTxt, { color: statStyle.text }]}>{t(`health_profile.status_${c.status}`, { defaultValue: c.status })}</Text></View>
                                            <ChevronRight size={14} color="#CBD5E1" style={{ marginLeft: 8 }} />
                                        </Pressable>
                                    );
                                })}
                                {conditions.length === 0 && <Text style={s.emptyGridTxt}>{t('health_profile.no_conditions', { defaultValue: 'No conditions' })}</Text>}
                            </View>
                        </View>
                    </Animated.View>

                    {/* Allergies */}
                    <Animated.View style={anim(3)}>
                        <View style={s.gridCard}>
                            <View style={s.gridHeader}>
                                <View style={[s.gridIconWrap, { backgroundColor: '#FEF3C7' }]}><TriangleAlert size={16} color="#F59E0B" /></View>
                                <Text style={s.gridTitle}>{t('health_profile.allergies', { defaultValue: 'Allergies' })}</Text>
                                <Pressable style={s.gridAddBtn} onPress={() => openModal('allergy')} hitSlop={10}>
                                    <Plus size={16} color="#F59E0B" />
                                </Pressable>
                            </View>
                            <View style={[s.gridBody, { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }]}>
                                {allergies.map((a, i) => (
                                    <Pressable key={i} style={s.gridChip} onPress={() => openModal('allergy', a)}>
                                        <TriangleAlert size={10} color="#F59E0B" style={{marginRight: 4}} />
                                        <Text style={s.gridChipTxt}>{a.name}</Text>
                                    </Pressable>
                                ))}
                                {allergies.length === 0 && <Text style={s.emptyGridTxt}>{t('health_profile.no_allergies', { defaultValue: 'No allergies' })}</Text>}
                            </View>
                        </View>
                    </Animated.View>

                    {/* Wellness */}
                    <Animated.View style={anim(4)}>
                        <View style={s.gridCard}>
                            <View style={s.gridHeader}>
                                <View style={[s.gridIconWrap, { backgroundColor: '#D1FAE5' }]}><Activity size={16} color="#10B981" /></View>
                                <Text style={s.gridTitle}>{t('health_profile.wellness', { defaultValue: 'Wellness' })}</Text>
                                <Pressable style={s.gridAddBtn} onPress={() => openModal('vitals')} hitSlop={10}>
                                    <Plus size={16} color="#10B981" />
                                </Pressable>
                            </View>
                            <View style={[s.gridBody, { flexDirection: 'row', gap: 10, paddingBottom: 6 }]}>
                                <Pressable style={[s.wellBox, { borderColor: '#FEF3C7' }]} onPress={() => openModal('vitals')}>
                                    <Text style={[s.wellVal, { color: '#F59E0B' }]} adjustsFontSizeToFit numberOfLines={1}>{bmi || '—'}</Text>
                                    <Text style={s.wellLbl}>{t('health_profile.bmi', { defaultValue: 'BMI' })}</Text>
                                    <Text style={[s.wellSub, { color: '#F59E0B' }]}>{bmiTheme.label}</Text>
                                </Pressable>
                                <Pressable style={[s.wellBox, { borderColor: '#D1FAE5' }]} onPress={() => openModal('habits')}>
                                    <Text style={[s.wellVal, { color: '#10B981' }]} adjustsFontSizeToFit numberOfLines={1}>{habitScore}%</Text>
                                    <Text style={s.wellLbl}>{t('health_profile.habits', { defaultValue: 'Habits' })}</Text>
                                    <Text style={[s.wellSub, { color: '#10B981' }]}>{habitLabel}</Text>
                                </Pressable>
                                <Pressable style={[s.wellBox, { borderColor: '#D1FAE5' }]} onPress={() => openModal('activity')}>
                                    <Text style={[s.wellVal, { color: '#10B981' }]} numberOfLines={1} adjustsFontSizeToFit>{trendLabel}</Text>
                                    <Text style={s.wellLbl} numberOfLines={1} adjustsFontSizeToFit>{t('health_profile.conditions', { defaultValue: 'Conditions' })}</Text>
                                    <Text style={[s.wellSub, { color: '#10B981' }]} numberOfLines={1} adjustsFontSizeToFit>{trendSub}</Text>
                                </Pressable>
                            </View>
                        </View>
                    </Animated.View>

                    {/* Medications */}
                    <Animated.View style={anim(5)}>
                        <View style={s.gridCard}>
                            <View style={s.gridHeader}>
                                <View style={[s.gridIconWrap, { backgroundColor: '#E0F2FE' }]}><Pill size={16} color="#3B82F6" /></View>
                                <Text style={s.gridTitle}>{t('health_profile.medications', { defaultValue: 'Medications' })}</Text>
                                <Pressable style={s.gridAddBtn} onPress={() => openModal('medication')} hitSlop={10}>
                                    <Plus size={16} color="#3B82F6" />
                                </Pressable>
                            </View>
                            <View style={s.gridBody}>
                                {['morning', 'afternoon', 'evening', 'night'].map(time => {
                                    const meds = activeMeds.filter(m => m.times?.includes(time));
                                    if (meds.length === 0) return null;
                                    return (
                                        <View key={time} style={{ marginBottom: 12 }}>
                                            <Text style={s.gridTimeLbl}>{t(`health_profile.time_${time}`, { defaultValue: time.charAt(0).toUpperCase() + time.slice(1) })}</Text>
                                            {meds.map((m, idx) => (
                                                <Pressable key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }} onPress={() => openModal('medication', m)}>
                                                    <View style={s.tinyDot} />
                                                    <Text style={s.gridMedTxt} numberOfLines={1}>{m.name} <Text style={{ color: '#94A3B8', fontWeight: '500' }}>{m.dosage}</Text></Text>
                                                    <ChevronRight size={14} color="#CBD5E1" />
                                                </Pressable>
                                            ))}
                                        </View>
                                    );
                                })}
                                {activeMeds.length === 0 && <Text style={s.emptyGridTxt}>{t('health_profile.no_meds', { defaultValue: 'No active meds' })}</Text>}
                            </View>
                        </View>
                    </Animated.View>

                    {/* Medical History */}
                    <Animated.View style={anim(6)}>
                        <View style={s.gridCard}>
                            <View style={s.gridHeader}>
                                <View style={[s.gridIconWrap, { backgroundColor: '#F3E8FF' }]}><FileText size={16} color="#A855F7" /></View>
                                <Text style={s.gridTitle}>{t('health_profile.medical_history', { defaultValue: 'Medical History' })}</Text>
                                <Pressable style={s.gridAddBtn} onPress={() => openModal('history')} hitSlop={10}>
                                    <Plus size={16} color="#A855F7" />
                                </Pressable>
                            </View>
                            <View style={s.gridBody}>
                                {medical_history.slice(0, 3).map((h, i) => (
                                    <Pressable key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }} onPress={() => openModal('history', h)}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.gridHistoryTxt}>{h.event}</Text>
                                            <Text style={s.gridHistorySub}>{h.date ? new Date(h.date).toLocaleDateString() : t('health_profile.unknown_date', { defaultValue: 'Unknown' })}</Text>
                                        </View>
                                        <ChevronRight size={14} color="#CBD5E1" />
                                    </Pressable>
                                ))}
                                {medical_history.length === 0 && <Text style={s.emptyGridTxt}>{t('health_profile.no_history', { defaultValue: 'No records' })}</Text>}
                            </View>
                        </View>
                    </Animated.View>

                    {/* Care Network */}
                    <Animated.View style={anim(7)}>
                        <View style={s.gridCard}>
                            <View style={s.gridHeader}>
                                <View style={[s.gridIconWrap, { backgroundColor: '#E0F2FE' }]}><Users size={16} color="#3B82F6" /></View>
                                <Text style={s.gridTitle}>{t('health_profile.care_network', { defaultValue: 'Care Network' })}</Text>
                                <Pressable style={s.gridAddBtn} onPress={() => openModal('gp')} hitSlop={10}>
                                    <Plus size={16} color="#3B82F6" />
                                </Pressable>
                            </View>
                            <View style={s.gridBody}>
                                {gp.name && (
                                    <View style={s.netRow}>
                                        <Pressable style={{ flex: 1, paddingRight: 6 }} onPress={() => openModal('gp')}>
                                            <Text style={s.netName} numberOfLines={1}>{gp.name}</Text>
                                            <Text style={s.netRole}>{t('health_profile.primary_doctor', { defaultValue: 'Primary Doctor' })}</Text>
                                        </Pressable>
                                        <Pressable style={[s.netBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]} onPress={() => gp.phone && Linking.openURL(`tel:${gp.phone}`)}>
                                            <Phone size={12} color="#3B82F6" style={{ marginRight: 4 }} />
                                            <Text style={[s.netBtnTxt, { color: '#3B82F6' }]}>{t('health_profile.call', { defaultValue: 'Call' })}</Text>
                                        </Pressable>
                                    </View>
                                )}
                                {profile?.trusted_contacts?.filter(c => c.is_emergency).map((c, i) => (
                                    <View key={'c'+i} style={[s.netRow, { marginTop: 10 }]}>
                                        <View style={{ flex: 1, paddingRight: 6 }}>
                                            <Text style={s.netName} numberOfLines={1}>{c.name}</Text>
                                            <Text style={s.netRole}>{t('health_profile.emergency_contact', { defaultValue: 'Emergency Contact' })}</Text>
                                        </View>
                                        <Pressable style={[s.netBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]} onPress={() => Linking.openURL(`tel:${c.phone}`)}>
                                            <Siren size={12} color="#EF4444" style={{ marginRight: 4 }} />
                                            <Text style={[s.netBtnTxt, { color: '#EF4444' }]}>{t('health_profile.sos', { defaultValue: 'SOS' })}</Text>
                                        </Pressable>
                                    </View>
                                ))}
                                {(!gp.name && !profile?.trusted_contacts?.length) && <Text style={s.emptyGridTxt}>{t('health_profile.no_contacts', { defaultValue: 'No contacts' })}</Text>}
                            </View>
                        </View>
                    </Animated.View>

                </View>

            </ScrollView>

            {/* ── Dynamic Form Modal ── */}
            <PremiumFormModal
                visible={modalVisible}
                title={`${formState._id ? t('common.edit', { defaultValue: 'Edit' }) : t('common.update', { defaultValue: 'Update' })} ${['vitals', 'habits', 'activity'].includes(editingType) ? t('health_profile.lifestyle', { defaultValue: 'Lifestyle' }) : t(`health_profile.${editingType}`, { defaultValue: editingType })}`}
                onClose={closeModal}
                onSave={handleSave}
                saveText={t('health_profile.save_profile_data', { defaultValue: 'Save Profile Data' })}
                saving={isSaving}
                headerRight={
                    formState._id && ['condition', 'allergy', 'medication', 'vaccination', 'history', 'appointment'].includes(editingType) ? (
                        <Pressable onPress={() => handleDelete(getCollectionName(editingType), formState._id)} style={s.trashBtn}>
                            <Trash2 size={20} color={C.danger} />
                        </Pressable>
                    ) : null
                }
            >
                {editingType === 'condition' && (
                    <>
                        <View style={s.formGroup}><SmartInput label={t('health_profile.condition_name', { defaultValue: 'Condition Name *' })} value={formState.name} onChangeText={(t) => setFormState({ ...formState, name: t })} placeholder={t('health_profile.condition_placeholder', { defaultValue: 'e.g. Type 2 Diabetes' })} /></View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>{t('common.status', { defaultValue: 'Status' })}</Text>
                            <ChipSelector options={statusOptions} selected={formState.status} onSelect={v => setFormState({ ...formState, status: v })} />
                        </View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>{t('health_profile.severity', { defaultValue: 'Severity' })}</Text>
                            <ChipSelector options={severityOptions} selected={formState.severity} onSelect={v => setFormState({ ...formState, severity: v })} />
                        </View>
                        <View style={s.formGroup}><SmartInput label={t('health_profile.notes', { defaultValue: 'Notes' })} variant="multiline" multiline value={formState.notes} onChangeText={(t) => setFormState({ ...formState, notes: t })} placeholder={t('health_profile.notes_placeholder', { defaultValue: 'Write any personal notes here...' })} /></View>
                    </>
                )}
                {editingType === 'allergy' && (
                    <>
                        <View style={s.formGroup}><SmartInput label={t('health_profile.allergy_name', { defaultValue: 'Allergy Name *' })} value={formState.name} onChangeText={(t) => setFormState({ ...formState, name: t })} placeholder={t('health_profile.allergy_placeholder', { defaultValue: 'e.g. Peanuts, Penicillin' })} /></View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>{t('health_profile.severity', { defaultValue: 'Severity' })}</Text>
                            <ChipSelector options={severityOptions} selected={formState.severity} onSelect={v => setFormState({ ...formState, severity: v })} />
                        </View>
                        <View style={s.formGroup}><SmartInput label={t('health_profile.reaction_details', { defaultValue: 'Reaction Details' })} variant="multiline" multiline value={formState.reaction} onChangeText={(t) => setFormState({ ...formState, reaction: t })} placeholder={t('health_profile.reaction_placeholder', { defaultValue: 'Describe the physical reaction (e.g., Hives, Anaphylaxis)' })} /></View>
                    </>
                )}
                {editingType === 'vitals' && (
                    <>
                        <View style={s.formGroup}><SmartInput label={t('health_profile.height_cm', { defaultValue: 'Height (cm)' })} keyboardType="numeric" maxLength={3} value={String(formState.height_cm || '')} onChangeText={(t) => { const v = t.replace(/[^0-9]/g, ''); setFormState({ ...formState, height_cm: v ? Number(v) : '' }); }} placeholder="e.g. 170" /></View>
                        <View style={s.formGroup}><SmartInput label={t('health_profile.weight_kg', { defaultValue: 'Weight (kg)' })} keyboardType="numeric" maxLength={3} value={String(formState.weight_kg || '')} onChangeText={(t) => { const v = t.replace(/[^0-9.]/g, ''); setFormState({ ...formState, weight_kg: v ? Number(v) : '' }); }} placeholder="e.g. 70" /></View>
                    </>
                )}
                {editingType === 'habits' && (
                    <>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>{t('health_profile.smoking_habits', { defaultValue: 'Smoking Habits' })}</Text>
                            <ChipSelector options={smokeOptions} selected={formState.smoking_status} onSelect={v => setFormState({ ...formState, smoking_status: v })} />
                        </View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>{t('health_profile.drinking_habits', { defaultValue: 'Drinking Habits' })}</Text>
                            <ChipSelector options={alcoholOptions} selected={formState.alcohol_use} onSelect={v => setFormState({ ...formState, alcohol_use: v })} />
                        </View>
                    </>
                )}
                {editingType === 'activity' && (
                    <>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>{t('health_profile.mobility_level', { defaultValue: 'Mobility Level' })}</Text>
                            <ChipSelector options={mobilityOptions} selected={formState.mobility_level} onSelect={v => setFormState({ ...formState, mobility_level: v })} />
                        </View>
                        <View style={s.formGroup}>
                            <SmartInput label={t('health_profile.mobility_aids', { defaultValue: 'Mobility Aids' })} value={formState.mobility_aids} onChangeText={(t) => setFormState({ ...formState, mobility_aids: t })} placeholder={t('health_profile.mobility_aids_placeholder', { defaultValue: 'e.g. Cane, Walker (comma separated)' })} />
                        </View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>{t('health_profile.activity_intensity', { defaultValue: 'Activity Intensity & Duration' })}</Text>
                            <ChipSelector vertical options={exerciseOptions} selected={formState.exercise_frequency} onSelect={v => setFormState({ ...formState, exercise_frequency: v })} />
                        </View>
                    </>
                )}
                {editingType === 'identity' && (
                    <>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>{t('health_profile.blood_type', { defaultValue: 'Blood Type' })}</Text>
                            <SmartInput label={t('health_profile.blood_type', { defaultValue: 'Blood Type' })} value={formState.blood_type} onChangeText={(t) => setFormState({ ...formState, blood_type: t.toUpperCase() })} placeholder="e.g. A+, O-" />
                        </View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>{t('health_profile.dietary_restrictions', { defaultValue: 'Dietary Restrictions' })}</Text>
                            <SmartInput label={t('health_profile.dietary_restrictions', { defaultValue: 'Dietary Restrictions' })} variant="multiline" multiline value={formState.dietary_restrictions} onChangeText={(t) => setFormState({ ...formState, dietary_restrictions: t })} placeholder={t('health_profile.dietary_placeholder', { defaultValue: 'e.g. Low Sodium, Diabetic, Gluten-Free' })} />
                        </View>
                    </>
                )}
                {editingType === 'contact' && (
                    <>
                        <View style={s.formGroup}>
                            <SmartInput label={t('health_profile.contact_name', { defaultValue: 'Contact Name *' })} value={formState.name} onChangeText={(t) => setFormState({ ...formState, name: t })} placeholder={t('caller.name_placeholder', { defaultValue: 'e.g. Jane Doe' })} />
                        </View>
                        <View style={s.formGroup}>
                            <SmartInput label={t('caller.relationship', { defaultValue: 'Relationship' })} value={formState.relation} onChangeText={(t) => setFormState({ ...formState, relation: t })} placeholder={t('health_profile.relationship_placeholder', { defaultValue: 'e.g. Daughter, Spouse' })} />
                        </View>
                        <View style={s.formGroup}>
                            <SmartInput label={t('caller.phone_number', { defaultValue: 'Phone Number *' })} keyboardType="phone-pad" value={formState.phone} onChangeText={(t) => setFormState({ ...formState, phone: t })} placeholder="e.g. 9876543210" />
                        </View>
                        <View style={s.formGroup}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 16, ...FONT.bold, color: C.dark }}>{t('caller.emergency_contact', { defaultValue: 'Emergency Contact' })}</Text>
                                    <Text style={{ fontSize: 13, color: C.muted }}>{t('caller.emergency_desc', { defaultValue: 'Primary person to call in case of emergency' })}</Text>
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
                        <View style={s.formGroup}><SmartInput label={t('health_profile.doctor_name_lbl', { defaultValue: "Doctor's Name" })} value={formState.gp_name} onChangeText={(t) => setFormState({ ...formState, gp_name: t })} placeholder={t('health_profile.doctor_placeholder', { defaultValue: 'Dr. John Doe' })} /></View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>{t('health_profile.contact_number', { defaultValue: 'Contact Number' })}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Pressable
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 14, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', height: 48 }}
                                    onPress={() => setCountryCodeModal(true)}
                                >
                                    <Text style={{ fontSize: 16 }}>{COUNTRY_CODES.find(c => c.code === formState.gp_phoneCode)?.flag || '🇮🇳'}</Text>
                                    <Text style={{ fontSize: 15, color: '#334155', fontWeight: '500' }}>{formState.gp_phoneCode || '+91'}</Text>
                                    <ChevronDown size={14} color="#94A3B8" />
                                </Pressable>
                                <SmartInput
                                    keyboardType="phone-pad"
                                    value={formState.gp_phone}
                                    onChangeText={(t) => setFormState({ ...formState, gp_phone: t.replace(/[^0-9]/g, '') })}
                                    maxLength={COUNTRY_CODES.find(c => c.code === formState.gp_phoneCode)?.maxDigits || 12}
                                    placeholder="98765 43210"
                                    style={{ flex: 1 }}
                                />
                            </View>
                        </View>
                        <View style={s.formGroup}><SmartInput label={t('common.email', { defaultValue: 'Email' })} keyboardType="email-address" autoCapitalize="none" value={formState.gp_email} onChangeText={(t) => setFormState({ ...formState, gp_email: t })} placeholder="doctor@clinic.com" /></View>
                    </>
                )}
                {editingType === 'medication' && (
                    <>
                        <View style={s.formGroup}><SmartInput label={t('health_profile.medication_name', { defaultValue: 'Medication Name *' })} value={formState.name} onChangeText={(t) => setFormState({ ...formState, name: t })} placeholder={t('health_profile.med_placeholder', { defaultValue: 'e.g. Paracetamol' })} /></View>
                        <View style={s.formGroup}><SmartInput label={t('health_profile.dosage', { defaultValue: 'Dosage' })} value={formState.dosage} onChangeText={(t) => setFormState({ ...formState, dosage: t })} placeholder="e.g. 500mg" /></View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>{t('health_profile.frequency', { defaultValue: 'Frequency' })}</Text>
                            <ChipSelector options={frequencyOptions} selected={formState.frequency} onSelect={v => setFormState({ ...formState, frequency: v })} />
                        </View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>{t('health_profile.times_of_day', { defaultValue: 'Times of Day (Select Multiple)' })}</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                                {timeOptions.map(opt => {
                                    const isSelected = (formState.times || []).includes(opt.value);
                                    return (
                                        <Pressable key={opt.value} onPress={() => toggleTime(opt.value)} style={[s.selectChip, isSelected && s.selectChipActive]}>
                                            <Text style={[s.selectChipTxt, isSelected && s.selectChipTxtActive]}>{opt.label}</Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </View>
                        <View style={s.formGroup}><SmartInput label={t('health_profile.prescribed_by', { defaultValue: 'Prescribed By' })} value={formState.prescribed_by} onChangeText={(t) => setFormState({ ...formState, prescribed_by: t })} placeholder={t('health_profile.doctor_placeholder', { defaultValue: "Doctor's Name" })} /></View>
                        <View style={[s.formGroup, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }]}>
                            <Text style={s.formLabel}>{t('health_profile.currently_active', { defaultValue: 'Currently Active' })}</Text>
                            <Switch
                                trackColor={{ false: '#E2E8F0', true: '#38BDF8' }}
                                thumbColor={formState.is_active ? '#0284C7' : '#F8FAFC'}
                                onValueChange={(val) => setFormState({ ...formState, is_active: val })}
                                value={formState.is_active !== false}
                            />
                        </View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>{t('health_profile.prescription_details', { defaultValue: 'Prescription Details' })}</Text>
                            <Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed' }} onPress={() => AlertManager.alert(t('common.coming_soon', { defaultValue: 'Coming Soon' }), t('health_profile.upload_coming_soon', { defaultValue: 'Upload functionality will be added in a future update.' }))}>
                                <Upload size={18} color={C.primary} />
                                <Text style={{ color: C.primary, fontSize: 15, fontWeight: '600' }}>{t('health_profile.upload_prescription', { defaultValue: 'Upload Prescription' })}</Text>
                            </Pressable>
                        </View>
                    </>
                )}
                {editingType === 'history' && (
                    <>
                        <View style={s.formGroup}><SmartInput label={t('health_profile.event_surgery_lbl', { defaultValue: 'Event / Surgery / Diagnosis *' })} value={formState.event} onChangeText={(t) => setFormState({ ...formState, event: t })} placeholder={t('health_profile.event_placeholder', { defaultValue: 'e.g. Knee Replacement' })} /></View>
                        <View style={s.formGroup}><Text style={s.formLabel}>{t('common.date', { defaultValue: 'Date *' })}</Text><Pressable style={s.input} onPress={() => { setDatePickerField('date'); setShowDatePicker(true); }}><Text style={{ color: formState.date ? C.dark : C.muted, fontSize: 15 }}>{formState.date ? new Date(formState.date).toLocaleDateString(t('common.locale_date', { defaultValue: 'en-US' }), { year: 'numeric', month: 'short', day: 'numeric' }) : t('common.select_date', { defaultValue: 'Select date' })}</Text></Pressable></View>
                        <View style={s.formGroup}><SmartInput label={t('health_profile.detailed_notes', { defaultValue: 'Detailed Notes' })} variant="multiline" multiline value={formState.notes} onChangeText={(t) => setFormState({ ...formState, notes: t })} placeholder={t('health_profile.surgery_notes_placeholder', { defaultValue: 'How did the procedure go? Who was the doctor?' })} /></View>
                    </>
                )}
                {editingType === 'vaccination' && (
                    <>
                        <View style={s.formGroup}><SmartInput label={t('health_profile.vaccine_name', { defaultValue: 'Vaccine Name *' })} value={formState.name} onChangeText={(t) => setFormState({ ...formState, name: t })} placeholder={t('health_profile.vaccine_placeholder', { defaultValue: 'e.g. Influenza, COVID-19' })} /></View>
                        <View style={s.formGroup}><Text style={s.formLabel}>{t('health_profile.date_given', { defaultValue: 'Date Given *' })}</Text><Pressable style={s.input} onPress={() => { setDatePickerField('date_given'); setShowDatePicker(true); }}><Text style={{ color: formState.date_given ? C.dark : C.muted, fontSize: 15 }}>{formState.date_given ? new Date(formState.date_given).toLocaleDateString(t('common.locale_date', { defaultValue: 'en-US' }), { year: 'numeric', month: 'short', day: 'numeric' }) : t('common.select_date', { defaultValue: 'Select date' })}</Text></Pressable></View>
                    </>
                )}
                {editingType === 'appointment' && (
                    <>
                        <View style={s.formGroup}><Text style={s.formLabel}>{t('health_profile.reason_title', { defaultValue: 'Reason / Title *' })}</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.title} onChangeText={(t) => setFormState({ ...formState, title: t })} placeholder={t('health_profile.appt_placeholder', { defaultValue: 'General Checkup' })} /></View>
                        <View style={s.formGroup}><Text style={s.formLabel}>{t('health_profile.doctor_specialist', { defaultValue: 'Doctor / Specialist Name *' })}</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.doctor_name} onChangeText={(t) => setFormState({ ...formState, doctor_name: t })} placeholder="Dr. Smith" /></View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>{t('health_profile.date_time', { defaultValue: 'Date & Time *' })}</Text>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <Pressable style={[s.input, { flex: 1, justifyContent: 'center' }]} onPress={() => { setDatePickerField('date'); setShowDatePicker(true); }}>
                                    <Text style={{ color: formState.date ? C.dark : C.muted }}>{formState.date ? new Date(formState.date).toLocaleDateString(t('common.locale_date', { defaultValue: 'en-US' }), { year: 'numeric', month: 'short', day: 'numeric' }) : t('common.select_date', { defaultValue: 'Select Date' })}</Text>
                                </Pressable>
                                <Pressable style={[s.input, { flex: 1, justifyContent: 'center' }]} onPress={() => { setDatePickerField('date'); setShowTimePicker(true); }}>
                                    <Text style={{ color: formState.date ? C.dark : C.muted }}>{formState.date ? new Date(formState.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t('common.select_time', { defaultValue: 'Select Time' })}</Text>
                                </Pressable>
                            </View>
                        </View>
                    </>
                )}
                {editingType === 'dob' && (
                    <View style={s.pickerContainer}>
                        <View style={s.pickerHeader}>
                            <Text style={s.pickerPreview}>
                                {new Date(formState.year, formState.month, formState.day).toLocaleDateString(t('common.locale_date', { defaultValue: 'en-US' }), { day: 'numeric', month: 'long', year: 'numeric' })}
                            </Text>
                        </View>
                        <Text style={s.pickerLabel}>{t('common.birth_year', { defaultValue: 'Birth Year' })}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.yearScroll}>
                            {Array.from({ length: 101 }, (_, i) => new Date().getFullYear() - i).map(y => (
                                <Pressable key={y} onPress={() => {
                                    const maxDays = new Date(y, formState.month + 1, 0).getDate();
                                    setFormState({ ...formState, year: y, day: Math.min(formState.day || 1, maxDays) });
                                }} style={[s.yearChip, formState.year === y && s.yearChipActive]}>
                                    <Text style={[s.yearChipTxt, formState.year === y && s.yearChipTxtActive]}>{y}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                        <Text style={[s.pickerLabel, { marginTop: 20 }]}>{t('common.month', { defaultValue: 'Month' })}</Text>
                        <View style={s.monthGrid}>
                            {[t('months.jan', { defaultValue: 'Jan' }), t('months.feb', { defaultValue: 'Feb' }), t('months.mar', { defaultValue: 'Mar' }), t('months.apr', { defaultValue: 'Apr' }), t('months.may', { defaultValue: 'May' }), t('months.jun', { defaultValue: 'Jun' }), t('months.jul', { defaultValue: 'Jul' }), t('months.aug', { defaultValue: 'Aug' }), t('months.sep', { defaultValue: 'Sep' }), t('months.oct', { defaultValue: 'Oct' }), t('months.nov', { defaultValue: 'Nov' }), t('months.dec', { defaultValue: 'Dec' })].map((m, i) => (
                                <Pressable key={m} onPress={() => {
                                    const maxDays = new Date(formState.year, i + 1, 0).getDate();
                                    setFormState({ ...formState, month: i, day: Math.min(formState.day || 1, maxDays) });
                                }} style={[s.monthChip, formState.month === i && s.monthChipActive]}>
                                    <Text style={[s.monthChipTxt, formState.month === i && s.monthChipTxtActive]}>{m}</Text>
                                </Pressable>
                            ))}
                        </View>
                        <Text style={[s.pickerLabel, { marginTop: 20 }]}>{t('common.day', { defaultValue: 'Day' })}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dayScroll}>
                            {Array.from({ length: new Date(formState.year, formState.month + 1, 0).getDate() }, (_, i) => i + 1).map(d => (
                                <Pressable key={d} onPress={() => setFormState({ ...formState, day: d })} style={[s.dayChip, formState.day === d && s.dayChipActive]}>
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
                        <Text style={s.countryModalTitle}>{t('caller.select_country_code', { defaultValue: 'Select Country Code' })}</Text>
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

            {/* Native Date Picker */}
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
                                    const current = formState[datePickerField] ? new Date(formState[datePickerField]) : new Date();
                                    selectedDate.setHours(current.getHours(), current.getMinutes(), 0, 0);
                                }
                                setFormState(prev => ({ ...prev, [datePickerField]: selectedDate.toISOString() }));
                            }
                        }}
                    />
                </View>
            )}

            {/* Native Time Picker */}
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
        </View>
    );
}

const s = StyleSheet.create({
    // Base
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    root: { flex: 1, backgroundColor: '#F8FAFC' },

    // ── Simple Header (like care team / medications) ──
    header: {
        paddingTop: Platform.OS === 'ios' ? 60 : 48,
        paddingHorizontal: 24,
        paddingBottom: 14,
        backgroundColor: '#F8FAFC',
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerEyebrow: {
        fontSize: 13, fontWeight: '800', color: '#6366F1',
        letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4,
    },
    headerTitle: { fontSize: 32, fontWeight: '800', color: '#0F172A', letterSpacing: -1 },
    headerBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#E2E8F0',
    },

    scrollContent: {
        paddingHorizontal: 18,
        paddingTop: 8,
        paddingBottom: layout.TAB_BAR_CLEARANCE,
    },

    // ── Completion Banner ──
    completionBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderRadius: 18,
        marginBottom: 20,
        overflow: 'hidden',
        shadowColor: '#4361EE', shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06, shadowRadius: 16, elevation: 4,
    },
    completionAccent: { width: 5, alignSelf: 'stretch' },
    completionInner: { flex: 1, paddingVertical: 14, paddingHorizontal: 12 },
    completionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    completionTitle: { fontSize: 14, ...FONT.bold, color: '#1E293B' },
    completionPctTxt: { fontSize: 14, ...FONT.heavy, color: C.primary },
    progressBarBg: { height: 5, borderRadius: 3, backgroundColor: '#BAE6FD', marginBottom: 6, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 3, backgroundColor: C.primary },
    completionSub: { fontSize: 11, ...FONT.medium, color: '#94A3B8' },

    // ── Section Group Headers ──
    groupHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        marginTop: 4,
    },
    groupIconWrap: {
        width: 26, height: 26, borderRadius: 8,
        alignItems: 'center', justifyContent: 'center',
        marginRight: 8,
    },
    groupLabelTxt: {
        fontSize: 11,
        ...FONT.heavy,
        color: '#64748B',
        letterSpacing: 1.5,
        marginBottom: 12,
    },

    // ── Identity Bento ──
    bentoGrid: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    bentoCard: {
        flex: 1, backgroundColor: '#FFF', borderRadius: 18, padding: 14,
        alignItems: 'center',
        shadowColor: '#4361EE', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 4,
    },
    bentoCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    bentoVal: { fontSize: 16, ...FONT.heavy, color: '#0F172A', marginBottom: 3 },
    bentoLbl: { fontSize: 9, ...FONT.bold, color: '#94A3B8', letterSpacing: 0.8, textAlign: 'center' },

    // ── Document Cards ──
    docCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#4361EE',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
        elevation: 4,
        marginBottom: 16,
    },
    docAccentBar: { height: 3, width: '100%' },

    // Section header inside cards
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 12,
    },
    sectionHeaderBase: { fontSize: 15, ...FONT.bold, color: '#1E293B' },
    addBtn: {
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: C.primary,
        alignItems: 'center', justifyContent: 'center',
    },

    // ── Row Items ──
    rowItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    iconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    rowInfo: { flex: 1 },
    rowTitle: { fontSize: 15, ...FONT.bold, color: '#0F172A', marginBottom: 2 },
    rowSub: { fontSize: 12, ...FONT.medium, color: '#94A3B8' },
    pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    pillTxt: { fontSize: 11, ...FONT.bold },

    // ── Allergy Chips ──
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingBottom: 14, paddingTop: 0 },
    allergyChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9' },
    allergyChipTxt: { fontSize: 13, ...FONT.semibold },

    // ── Wellness Metrics ──
    monitoringRow: { flexDirection: 'row', gap: 10 },
    metricCard: { flex: 1, borderRadius: 18, padding: 14, alignItems: 'center', shadowColor: '#4361EE', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
    metricVal: { fontSize: 20, ...FONT.heavy, marginTop: 8, marginBottom: 2 },
    metricLbl: { fontSize: 9, ...FONT.bold, color: '#94A3B8', letterSpacing: 0.8, marginBottom: 2 },
    metricSub: { fontSize: 11, ...FONT.bold },

    // Empty state
    emptyRowTxt: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', padding: 16, paddingTop: 4, textAlign: 'center' },

    // ── Sync Button ──
    syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
    syncBtnTxt: { color: '#FFF', ...FONT.bold, fontSize: 12 },

    // ── Primary Doctor ──
    gpRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
    gpAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    gpAvatarTxt: { fontSize: 20, ...FONT.heavy, color: C.primary },
    gpInfo: { flex: 1 },
    gpName: { fontSize: 17, ...FONT.bold, color: '#0F172A', marginBottom: 3 },
    gpDetail: { fontSize: 13, ...FONT.medium, color: '#94A3B8' },
    callBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginBottom: 14, height: 44, borderRadius: 22, backgroundColor: C.primary },
    callBtnTxt: { fontSize: 14, ...FONT.bold, color: '#FFF' },

    // ── Freemium Upgrade ──
    upgradeIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    upgradeTitle: { fontSize: 24, ...FONT.bold, color: '#0F172A', marginBottom: 12, letterSpacing: -0.5 },
    upgradeBody: { fontSize: 16, ...FONT.regular, color: '#94A3B8', textAlign: 'center', lineHeight: 24 },

    // ── Form Styles (preserved) ──
    formGroup: { marginBottom: 20 },
    formLabel: { fontSize: 13, ...FONT.bold, color: C.muted, marginBottom: 10, letterSpacing: 0.5 },
    input: { backgroundColor: '#FAFBFF', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 16, height: 48, fontSize: 15, ...FONT.medium, color: C.dark },
    trashBtn: { padding: 4, backgroundColor: '#FFE4E6', borderRadius: 8 },
    closeIconBtn: { padding: 4 },

    // ChipSelector
    chipSelectorWrap: { flexDirection: 'row', gap: 10, paddingBottom: 4 },
    chipVerticalWrap: { flexDirection: 'column', paddingBottom: 4 },
    selectChip: { paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: '#FFF' },
    selectChipActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
    selectChipTxt: { fontSize: 14, ...FONT.bold, color: C.muted },
    selectChipTxtActive: { color: C.primaryDark },

    // DOB Picker
    pickerContainer: { paddingBottom: 20 },
    pickerHeader: { backgroundColor: '#E0F2FE', padding: 16, borderRadius: 20, marginBottom: 20, alignItems: 'center' },
    pickerPreview: { fontSize: 18, ...FONT.bold, color: C.primaryDark },
    pickerLabel: { fontSize: 13, ...FONT.bold, color: C.muted, marginBottom: 12, letterSpacing: 0.5 },
    yearScroll: { marginBottom: 10 },
    yearChip: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', marginRight: 10 },
    yearChipActive: { backgroundColor: C.primary, borderColor: C.primary },
    yearChipTxt: { fontSize: 16, ...FONT.bold, color: '#334155' },
    yearChipTxtActive: { color: '#FFF' },
    monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    monthChip: { width: '31%', paddingVertical: 10, alignItems: 'center', borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
    monthChipActive: { backgroundColor: C.primary, borderColor: C.primary },
    monthChipTxt: { fontSize: 14, ...FONT.bold, color: '#334155' },
    monthChipTxtActive: { color: '#FFF' },
    dayScroll: { marginTop: 10 },
    dayChip: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    dayChipActive: { backgroundColor: C.primary, borderColor: C.primary },
    dayChipTxt: { fontSize: 16, ...FONT.bold, color: '#334155' },
    dayChipTxtActive: { color: '#FFF' },

    // Country Code Modal
    countryModalWrap: { backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '80%', marginTop: 'auto', shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 12 },
    countryModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    countryModalTitle: { fontSize: 18, ...FONT.bold, color: '#0F172A' },
    countryOption: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
    countryFlag: { fontSize: 24, marginRight: 12 },
    countryName: { flex: 1, fontSize: 16, color: '#0F172A', ...FONT.medium },
    countryCodeText: { fontSize: 16, color: C.primary, ...FONT.bold },

    // ── NEW LAYOUT STYLES ──
    dashboardCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 6, marginBottom: 20 },
    dashTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    dashLeft: { flex: 1, paddingRight: 16 },
    dashEyebrow: { fontSize: 11, ...FONT.heavy, color: '#94A3B8', letterSpacing: 1 },
    dashScoreRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 },
    dashScoreMain: { fontSize: 48, ...FONT.heavy, color: '#3B82F6', letterSpacing: -2 },
    dashScoreSub: { fontSize: 16, ...FONT.bold, color: '#94A3B8', marginLeft: 4 },
    dashStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    dashStatusTxt: { fontSize: 13, ...FONT.bold, color: '#10B981' },
    dashSyncRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    dashSyncTxt: { fontSize: 11, ...FONT.medium, color: '#94A3B8' },
    dashCenter: { alignItems: 'center', justifyContent: 'center' },
    ringWrap: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
    dashMetricsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
    dashMiniMetric: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dashMiniIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    dashMiniLbl: { fontSize: 10, ...FONT.bold, color: '#64748B' },
    dashMiniVal: { fontSize: 14, ...FONT.heavy },

    alertsCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, marginBottom: 20, shadowColor: '#EF4444', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 4 },
    alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    alertIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
    alertTitle: { fontSize: 15, ...FONT.bold, color: '#0F172A', marginBottom: 2 },
    alertSub: { fontSize: 12, ...FONT.medium, color: '#64748B' },
    alertChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    alertChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
    alertDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
    alertChipTxt: { fontSize: 12, ...FONT.bold, color: '#EF4444' },

    masonryGrid: { flexDirection: 'column', gap: 16 }, // Kept name to avoid breaking external refs, but it's now stacked
    masonryCol: { flex: 1, gap: 16 },
    gridCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 3 },
    gridHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    gridIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    gridTitle: { flex: 1, fontSize: 15, ...FONT.bold, color: '#0F172A' },
    gridAddBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    gridBody: { paddingBottom: 4 },
    emptyGridTxt: { fontSize: 13, ...FONT.medium, color: '#94A3B8', fontStyle: 'italic', marginBottom: 10 },

    gridRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    gridDot: { width: 6, height: 6, borderRadius: 3 },
    gridRowTxt: { flex: 1, fontSize: 13, ...FONT.bold, color: '#334155' },
    miniPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    miniPillTxt: { fontSize: 9, ...FONT.heavy, textTransform: 'uppercase' },

    gridChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FEF3C7', flexDirection: 'row', alignItems: 'center' },
    gridChipTxt: { fontSize: 11, ...FONT.bold, color: '#D97706' },

    wellBox: { flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', minWidth: 0 },
    wellVal: { fontSize: 14, ...FONT.heavy, marginBottom: 2 },
    wellLbl: { fontSize: 9, ...FONT.bold, color: '#64748B', marginBottom: 2, textAlign: 'center' },
    wellSub: { fontSize: 8, ...FONT.heavy, textAlign: 'center' },

    gridTimeLbl: { fontSize: 12, ...FONT.bold, color: '#3B82F6', marginBottom: 6 },
    tinyDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#0F172A', marginRight: 8 },
    gridMedTxt: { fontSize: 12, ...FONT.bold, color: '#0F172A', flex: 1 },

    gridHistoryTxt: { fontSize: 13, ...FONT.bold, color: '#0F172A', marginBottom: 2 },
    gridHistorySub: { fontSize: 11, ...FONT.medium, color: '#94A3B8' },

    netRow: { flexDirection: 'row', alignItems: 'center' },
    netName: { fontSize: 13, ...FONT.bold, color: '#0F172A', marginBottom: 2 },
    netRole: { fontSize: 11, ...FONT.medium, color: '#94A3B8' },
    netBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
    netBtnTxt: { fontSize: 11, ...FONT.bold },
});
