import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, ActivityIndicator, Animated, Pressable, Linking, Modal, TextInput, FlatList, Switch, LayoutAnimation, UIManager, Image, RefreshControl } from 'react-native';

const medsMealIllus = require('../../../assets/meds_meal_illus.jpg');
const eatEarlyIllus = require('../../../assets/eat_early_illus.jpg');
const ricePortionIllus = require('../../../assets/rice_portion_illus.jpg');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}
import SmartInput from '../../components/ui/SmartInput';
import PremiumFormModal from '../../components/ui/PremiumFormModal';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertTriangle, ShieldCheck, HeartPulse, Activity, Droplet, Phone, Plus, Pencil, X, Trash2, CheckCircle2, RefreshCw, ChevronDown, Upload, Siren, ChevronRight, TrendingUp, TrendingDown, Sparkles, Bell, FileText, Pill, Syringe, Link2, Users, Calendar, Info, Clock, MapPin } from 'lucide-react-native';
import { StatusBar } from 'react-native';
import Svg, { Circle as SvgCircle, Path, Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { apiService } from '../../lib/api';
import { initializeHealthPlatform, requestHealthPermissions, fetchDailyVitalsSummary, isHealthSupported } from '../../lib/healthIntegration';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COUNTRY_CODES, parsePhoneWithCode, validatePhone } from '../../utils/phoneUtils';
import { colors, layout, spacing, radius, shadows } from '../../theme';
import AlertManager from '../../utils/AlertManager';
import {
    HealthCoachCard,
    HealthDrivers,
    MomentumCard,
    AchievementSection,
    ScoreHeroCard
} from '../../components/health';


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

// Local constant C deprecated in favor of theme colors

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
    const [visibleHistoryCount, setVisibleHistoryCount] = useState(3);
    const [completenessExpanded, setCompletenessExpanded] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

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

    const staggerAnims = useRef([...Array(15)].map(() => new Animated.Value(0))).current;

    const [modalVisible, setModalVisible] = useState(false);
    const [editingType, setEditingType] = useState(null);
    const [formState, setFormState] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [datePickerField, setDatePickerField] = useState(null);
    const [countryCodeModal, setCountryCodeModal] = useState(false);
    const [tipsModalVisible, setTipsModalVisible] = useState(false);
    const [showScoreInfo, setShowScoreInfo] = useState(false);

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
            const [profileRes, unreadRes] = await Promise.all([
                apiService.patients.getProfile(),
                apiService.patients.getNotificationsUnreadCount().catch(() => ({ data: { count: 0 } }))
            ]);
            setProfile(profileRes.data);
            setUnreadCount(unreadRes.data?.count || 0);
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

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadProfile();
        setRefreshing(false);
    }, []);

    const hasAnimated = useRef(false);

    useFocusEffect(
        useCallback(() => {
            loadProfile().then(() => {
                if (!hasAnimated.current) {
                    hasAnimated.current = true;
                    runAnimations();
                }
            });
            apiService.patients.getNotificationsUnreadCount()
                .then(res => setUnreadCount(res.data?.count || 0))
                .catch(() => {});
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
        <View style={[s.container, { justifyContent: 'center', padding: 24 }]}>
            <LinearGradient
                colors={['#FFF5F5', '#FFF0F2', '#FEE2E6']}
                style={s.premiumBannerCard}
            >
                <View style={s.premiumBadgeWrap}>
                    <ShieldCheck size={28} color="#F43F5E" />
                </View>
                <Text style={s.premiumBannerTitle}>
                    {t('health_profile.free_title', { defaultValue: 'Your health story starts here ❤️' })}
                </Text>
                <Text style={s.premiumBannerBody}>
                    {t('health_profile.free_body', { defaultValue: 'Keep your medical history, care contacts, medications, and important records organized in one secure place.' })}
                </Text>
                
                <View style={s.premiumDivider} />

                <Text style={s.premiumBannerPitch}>
                    {t('health_profile.free_pitch', { defaultValue: 'Upgrade anytime to unlock advanced health insights, AI trend analysis, and personalized forecasting.' })}
                </Text>

                <Pressable 
                    style={({ pressed }) => [s.premiumCtaBtn, pressed && { opacity: 0.9 }]}
                    onPress={() => navigation.navigate('PremiumShowcase')}
                >
                    <Sparkles size={16} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={s.premiumCtaBtnTxt}>
                        {t('health_profile.unlock_premium', { defaultValue: 'Unlock Premium Insights' })}
                    </Text>
                </Pressable>
            </LinearGradient>
        </View>
    );

    const rawConditions = profile?.conditions;
    const rawAllergies = profile?.allergies;
    const rawMedicalHistory = profile?.medical_history;
    const rawMedications = profile?.medications;
    const rawVaccinations = profile?.vaccinations;
    const rawAppointments = profile?.appointments;
    const rawLifestyle = profile?.lifestyle;
    const rawGp = profile?.gp;
    const age = profile?.age;

    const conditions = Array.isArray(rawConditions) ? rawConditions : [];
    const allergies = Array.isArray(rawAllergies) ? rawAllergies : [];
    const medical_history = Array.isArray(rawMedicalHistory) ? rawMedicalHistory : [];
    const medications = Array.isArray(rawMedications) ? rawMedications : [];
    const vaccinations = Array.isArray(rawVaccinations) ? rawVaccinations : [];
    const appointments = Array.isArray(rawAppointments) ? rawAppointments : [];
    const lifestyle = rawLifestyle || {};
    const gp = rawGp || {};

    const calculateBMI = (h, w) => {
        const height = parseFloat(h);
        const weight = parseFloat(w);
        if (isNaN(height) || isNaN(weight) || height <= 0 || weight <= 0) return null;
        const hm = height / 100;
        return (weight / (hm * hm)).toFixed(1);
    };
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

    // ── Intelligent Health Score (from backend) ───────────────────────────────
    const hs = profile?.health_score || null;
    const _rawScore = hs?.score;
    const hsScore    = (_rawScore !== undefined && _rawScore !== null && !isNaN(Number(_rawScore))) ? Number(_rawScore) : null;
    const hsLabel    = hs?.label ?? t('health_profile.status_stable', { defaultValue: 'Stable' });
    const hsColor    = hs?.color ?? '#0EA5E9';
    const hsGrade    = hs?.grade ?? '—';
    const hsBracket  = hs?.bracket ?? null;
    const hsBreakdown = hs?.breakdown ?? null;

    const bracketLabel = {
        young_adult: t('health_profile.bracket_young', { defaultValue: 'Young Adult' }),
        middle_aged: t('health_profile.bracket_middle', { defaultValue: 'Middle Aged' }),
        senior:      t('health_profile.bracket_senior', { defaultValue: 'Senior' }),
        elderly:     t('health_profile.bracket_elderly', { defaultValue: 'Elderly' }),
    }[hsBracket] || '';

    const formatLastComputed = (iso) => {
        if (!iso) return t('health_profile.last_sync_unknown', { defaultValue: 'Not yet computed' });
        const d = new Date(iso);
        const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
        if (diffMin < 1) return t('health_profile.just_now', { defaultValue: 'Updated just now' });
        if (diffMin < 60) return t('health_profile.mins_ago', { defaultValue: '{{n}}m ago', n: diffMin }).replace('{{n}}', diffMin);
        const diffH = Math.floor(diffMin / 60);
        if (diffH < 24) return t('health_profile.hours_ago', { defaultValue: '{{n}}h ago', n: diffH }).replace('{{n}}', diffH);
        return d.toLocaleDateString();
    };
    const lastSyncText = formatLastComputed(hs?.last_computed);
    // ──────────────────────────────────────────────────────────────────

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

    const anim = (i) => {
        const a = staggerAnims[Math.floor(i)] || staggerAnims[0];
        return {
            opacity: a,
            transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        };
    };

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
                        <Bell size={20} color="#475569" strokeWidth={2.5} />
                        {unreadCount > 0 && <View style={s.bellDot} />}
                    </Pressable>
                </View>
            </View>

            <ScrollView 
                contentContainerStyle={s.scrollContent} 
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl 
                        refreshing={refreshing} 
                        onRefresh={onRefresh} 
                        tintColor="#6366F1" 
                        colors={["#6366F1"]} 
                    />
                }
            >

                {/* ── PROFILE COMPLETENESS BANNER (above health score) ── */}
                <Animated.View style={anim(0)}>
                    <View style={s.completeBanner}>
                        <Pressable 
                            onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                setCompletenessExpanded(!completenessExpanded);
                            }}
                            style={{ flex: 1 }}
                        >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                                <Text style={s.completeBannerTitle}>{t('health_profile.profile_completeness', { defaultValue: 'Profile Completeness' })}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={[s.completeBannerPct, { color: completionPct === 100 ? '#10B981' : '#0EA5E9' }]}>{completionPct}%</Text>
                                    <ChevronDown size={14} color={completionPct === 100 ? '#10B981' : '#0EA5E9'} style={{ transform: [{ rotate: completenessExpanded ? '180deg' : '0deg' }] }} />
                                </View>
                            </View>
                            <View style={s.completeBarOuter}>
                                <View style={[s.completeBarInner, { width: `${completionPct}%`, backgroundColor: completionPct === 100 ? '#10B981' : '#0EA5E9' }]} />
                            </View>
                            {!completenessExpanded && completionPct < 100 && (
                                <Text style={s.completeBannerSub}>{t('health_profile.tap_to_complete', { defaultValue: 'Tap to see what’s missing →' })}</Text>
                            )}
                        </Pressable>
                        {completenessExpanded && (
                            <View style={[s.checklistContainer, { marginTop: 12 }]}>
                                {[
                                    { key: 'blood_type', label: t('health_profile.blood_type', { defaultValue: 'Blood Type' }), completed: profile?.blood_type && profile.blood_type !== 'unknown' },
                                    { key: 'conditions', label: t('health_profile.current_conditions', { defaultValue: 'Current Conditions' }), completed: conditions.length > 0 },
                                    { key: 'allergies', label: t('health_profile.allergies', { defaultValue: 'Allergies' }), completed: allergies.length > 0 },
                                    { key: 'medical_history', label: t('health_profile.medical_history', { defaultValue: 'Medical History' }), completed: medical_history.length > 0 },
                                    { key: 'medications', label: t('health_profile.medications', { defaultValue: 'Medications' }), completed: medications.length > 0 },
                                    { key: 'vaccinations', label: t('health_profile.vaccinations', { defaultValue: 'Vaccinations' }), completed: vaccinations.length > 0 },
                                    { key: 'lifestyle', label: t('health_profile.height_weight', { defaultValue: 'Height & Weight' }), completed: !!(lifestyle.height_cm && lifestyle.weight_kg) },
                                    { key: 'trusted_contacts', label: t('caller.emergency_contact', { defaultValue: 'Emergency Contact' }), completed: !!(profile?.trusted_contacts?.length > 0) },
                                    { key: 'gp', label: t('health_profile.primary_gp', { defaultValue: 'Primary GP' }), completed: !!gp.name },
                                    { key: 'smoking', label: t('health_profile.smoking_status', { defaultValue: 'Smoking Status' }), completed: !!(lifestyle.smoking_status && lifestyle.smoking_status !== 'unknown') }
                                ].map(item => {
                                    const handleChecklistPress = () => {
                                        if (item.key === 'blood_type') openModal('identity');
                                        else if (item.key === 'conditions') openModal('condition');
                                        else if (item.key === 'allergies') openModal('allergy');
                                        else if (item.key === 'medical_history') openModal('history');
                                        else if (item.key === 'medications') openModal('medication');
                                        else if (item.key === 'vaccinations') openModal('vaccination');
                                        else if (item.key === 'lifestyle') openModal('vitals');
                                        else if (item.key === 'trusted_contacts') openModal('contact');
                                        else if (item.key === 'gp') openModal('gp');
                                        else if (item.key === 'smoking') openModal('habits');
                                    };
                                    return (
                                        <Pressable key={item.key} style={s.checklistItem} onPress={handleChecklistPress}>
                                            {item.completed ? (
                                                <CheckCircle2 size={14} color="#10B981" />
                                            ) : (
                                                <View style={s.checklistEmptyCircle} />
                                            )}
                                            <Text style={[s.checklistText, item.completed && s.checklistTextCompleted]} numberOfLines={1}>
                                                {item.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        )}
                    </View>
                </Animated.View>

                {/* ── COMPACT HEALTH SCORE CARD (tappable) ── */}
                <Animated.View style={[anim(0), { marginTop: 0 }]}>
                    <Pressable style={({ pressed }) => [{ opacity: pressed ? 0.96 : 1 }]} onPress={() => setShowScoreInfo(true)}>
                        <View style={s.dashboardCard}>
                            <View style={s.dashTopRow}>
                                <View style={s.dashLeft}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                        <Text style={s.dashEyebrow}>{t('health_profile.health_score', { defaultValue: 'HEALTH SCORE' })}</Text>
                                        <Pressable onPress={(e) => { e.stopPropagation(); setShowScoreInfo(true); }} hitSlop={10} style={{ padding: 4, backgroundColor: '#F1F5F9', borderRadius: radius.md, marginLeft: 4 }}>
                                            <Info size={12} color="#64748B" />
                                        </Pressable>
                                    </View>
                                    <View style={s.dashScoreRow}>
                                        <Text style={[s.dashScoreMain, { color: hsScore !== null ? hsColor : colors.textMuted }]}>
                                            {hsScore !== null ? hsScore : '—'}
                                        </Text>
                                        <Text style={s.dashScoreSub}>/ 100</Text>
                                        {hsGrade !== '—' && (
                                            <View style={[s.gradeChip, { backgroundColor: hsColor + '20', borderColor: hsColor }]}>
                                                <Text style={[s.gradeChipTxt, { color: hsColor }]}>{hsGrade}</Text>
                                            </View>
                                        )}
                                    </View>
                                    <View style={s.dashStatusRow}>
                                        <ShieldCheck size={14} color={hsColor} />
                                        <Text style={[s.dashStatusTxt, { color: hsColor }]}>{hsLabel}</Text>
                                    </View>
                                    {hsBracket && (
                                        <View style={s.bracketTag}>
                                            <Text style={s.bracketTagTxt}>{t('health_profile.adjusted_for', { defaultValue: 'Adjusted for age • {{bracket}}', bracket: bracketLabel }).replace('{{bracket}}', bracketLabel)}</Text>
                                        </View>
                                    )}
                                    <Pressable 
                                        style={({ pressed }) => [s.dashSyncRow, pressed && { opacity: 0.7 }]} 
                                        onPress={(e) => {
                                            e.stopPropagation();
                                            handleWearableSync();
                                        }}
                                    >
                                        <RefreshCw size={10} color={isSyncing ? colors.primary : "#94A3B8"} style={isSyncing ? { transform: [{ rotate: '45deg' }] } : {}} />
                                        <Text style={[s.dashSyncTxt, isSyncing && { color: colors.primary }]}>
                                            {isSyncing ? t('health_profile.syncing', { defaultValue: 'Syncing...' }) : lastSyncText}
                                        </Text>
                                    </Pressable>
                                </View>
                                <View style={s.dashCenter}>
                                    <View style={s.ringWrap}>
                                        <Svg width={88} height={88} viewBox="0 0 88 88">
                                            <SvgCircle cx="44" cy="44" r="38" stroke="#EEF2FF" strokeWidth="8" fill="transparent" />
                                            <SvgCircle
                                                cx="44" cy="44" r="38"
                                                stroke={hsScore !== null ? hsColor : '#CBD5E1'}
                                                strokeWidth="8"
                                                fill="transparent"
                                                strokeDasharray={`${2 * Math.PI * 38}`}
                                                strokeDashoffset={`${2 * Math.PI * 38 * (1 - (hsScore ?? 0) / 100)}`}
                                                strokeLinecap="round"
                                                transform="rotate(-90 44 44)"
                                            />
                                        </Svg>
                                        <HeartPulse size={24} color={hsScore !== null ? hsColor : '#94A3B8'} style={{ position: 'absolute' }} />
                                    </View>
                                </View>
                            </View>
                            {/* Tap hint */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                                <Text style={{ fontSize: 12, color: '#94A3B8', ...FONT.bold }}>Tap for full breakdown &amp; insights</Text>
                                <ChevronRight size={14} color="#94A3B8" style={{ marginLeft: 4 }} />
                            </View>
                        </View>
                    </Pressable>
                </Animated.View>

                {/* ── ALERTS CARD ── */}
                <Animated.View style={anim(1)}>
                    <View style={s.alertsCard}>
                        <Pressable 
                            style={({ pressed }) => [s.alertHeader, pressed && { opacity: 0.7 }]}
                            onPress={() => {
                                AlertManager.alert(
                                    t('health_profile.manage_alerts', { defaultValue: 'Manage Health Alerts' }),
                                    t('health_profile.manage_alerts_desc', { defaultValue: 'Manage active conditions and severe allergies' }),
                                    [
                                        { text: t('health_profile.add_condition', { defaultValue: 'Add Condition' }), onPress: () => openModal('condition') },
                                        { text: t('health_profile.add_allergy', { defaultValue: 'Add Allergy' }), onPress: () => openModal('allergy') },
                                        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' }
                                    ]
                                );
                            }}
                        >
                            <View style={s.alertIconBox}><AlertTriangle size={18} color="#EF4444" /></View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.alertTitle}>{t('health_profile.health_alerts', { defaultValue: 'Health Alerts' })}</Text>
                                <Text style={s.alertSub}>
                                    {conditions.filter(c => c.status === 'active').length + allergies.filter(a => a.severity === 'severe').length} {t('health_profile.active_alerts_sub', { defaultValue: 'active alerts need your attention' })}
                                </Text>
                            </View>
                            <ChevronRight size={16} color="#94A3B8" />
                        </Pressable>
                        <View style={s.alertChips}>
                            {conditions.filter(c => c.status === 'active').map((c, i) => (
                                <Pressable 
                                    key={'c'+i} 
                                    style={({ pressed }) => [s.alertChip, pressed && { opacity: 0.7 }]}
                                    onPress={() => openModal('condition', c)}
                                >
                                    <View style={s.alertDot} />
                                    <Text style={s.alertChipTxt}>{c.name}</Text>
                                </Pressable>
                            ))}
                            {allergies.filter(a => a.severity === 'severe').map((a, i) => (
                                <Pressable 
                                    key={'a'+i} 
                                    style={({ pressed }) => [s.alertChip, pressed && { opacity: 0.7 }]}
                                    onPress={() => openModal('allergy', a)}
                                >
                                    <View style={s.alertDot} />
                                    <Text style={s.alertChipTxt}>{a.name} {t('health_profile.allergy', { defaultValue: 'Allergy' })}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                </Animated.View>

                {/* ── IDENTITY BENTO ── */}
                <Animated.View style={anim(1.5)}>
                    <View style={s.bentoGrid}>
                        <Pressable style={s.bentoCard} onPress={() => openModal('identity')}>
                            <View style={[s.bentoCircle, { backgroundColor: '#FEE2E2' }]}><Droplet size={18} color="#EF4444" /></View>
                            <Text style={s.bentoVal}>{profile?.blood_type && profile.blood_type !== 'unknown' ? profile.blood_type : '—'}</Text>
                            <Text style={s.bentoLbl}>{t('health_profile.blood_type', { defaultValue: 'Blood Type' }).toUpperCase()}</Text>
                        </Pressable>
                        <Pressable style={s.bentoCard} onPress={() => openModal('vitals')}>
                            <View style={[s.bentoCircle, { backgroundColor: '#E0F2FE' }]}><Activity size={18} color="#0EA5E9" /></View>
                            <Text style={s.bentoVal}>{lifestyle.height_cm ? `${lifestyle.height_cm} cm` : '—'}</Text>
                            <Text style={s.bentoLbl}>{t('health_profile.height', { defaultValue: 'Height' }).toUpperCase()}</Text>
                        </Pressable>
                        <Pressable style={s.bentoCard} onPress={() => openModal('vitals')}>
                            <View style={[s.bentoCircle, { backgroundColor: '#D1FAE5' }]}><Activity size={18} color="#10B981" /></View>
                            <Text style={s.bentoVal}>{lifestyle.weight_kg ? `${lifestyle.weight_kg} kg` : '—'}</Text>
                            <Text style={s.bentoLbl}>{t('health_profile.weight', { defaultValue: 'Weight' }).toUpperCase()}</Text>
                        </Pressable>
                    </View>
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
                                <View style={[s.gridIconWrap, { backgroundColor: '#FEF3C7' }]}><AlertTriangle size={16} color="#F59E0B" /></View>
                                <Text style={s.gridTitle}>{t('health_profile.allergies', { defaultValue: 'Allergies' })}</Text>
                                <Pressable style={s.gridAddBtn} onPress={() => openModal('allergy')} hitSlop={10}>
                                    <Plus size={16} color="#F59E0B" />
                                </Pressable>
                            </View>
                            <View style={[s.gridBody, { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }]}>
                                {allergies.map((a, i) => (
                                    <Pressable key={i} style={s.gridChip} onPress={() => openModal('allergy', a)}>
                                        <AlertTriangle size={10} color="#F59E0B" style={{marginRight: 4}} />
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
                                    <Text style={[s.wellVal, { color: '#10B981' }]} numberOfLines={1} adjustsFontSizeToFit>{lifestyle.mobility_level ? (lifestyle.mobility_level.charAt(0).toUpperCase() + lifestyle.mobility_level.slice(1)) : '—'}</Text>
                                    <Text style={s.wellLbl} numberOfLines={1} adjustsFontSizeToFit>{t('health_profile.mobility', { defaultValue: 'Mobility' })}</Text>
                                    <Text style={[s.wellSub, { color: '#10B981' }]} numberOfLines={1} adjustsFontSizeToFit>{lifestyle.exercise_frequency ? t(`health_profile.intensity_${lifestyle.exercise_frequency}`, { defaultValue: lifestyle.exercise_frequency.charAt(0).toUpperCase() + lifestyle.exercise_frequency.slice(1) }) : '—'}</Text>
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

                    {/* Vaccinations */}
                    <Animated.View style={anim(6)}>
                        <View style={s.gridCard}>
                            <View style={s.gridHeader}>
                                <View style={[s.gridIconWrap, { backgroundColor: '#FCE7F3' }]}><Syringe size={16} color="#EC4899" /></View>
                                <Text style={s.gridTitle}>{t('health_profile.vaccinations', { defaultValue: 'Vaccinations' })}</Text>
                                <Pressable style={s.gridAddBtn} onPress={() => openModal('vaccination')} hitSlop={10}>
                                    <Plus size={16} color="#EC4899" />
                                </Pressable>
                            </View>
                            <View style={s.gridBody}>
                                {vaccinations.map((v, i) => (
                                    <Pressable key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }} onPress={() => openModal('vaccination', v)}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.gridHistoryTxt}>{v.name}</Text>
                                            <Text style={s.gridHistorySub}>
                                                {v.date_given ? new Date(v.date_given).toLocaleDateString(t('common.locale_date', { defaultValue: 'en-US' }), { year: 'numeric', month: 'short', day: 'numeric' }) : t('health_profile.unknown_date', { defaultValue: 'Unknown Date' })}
                                                {v.administered_by ? ` • ${v.administered_by}` : ''}
                                            </Text>
                                        </View>
                                        <ChevronRight size={14} color="#CBD5E1" />
                                    </Pressable>
                                ))}
                                {vaccinations.length === 0 && <Text style={s.emptyGridTxt}>{t('health_profile.no_vaccinations', { defaultValue: 'No vaccinations logged' })}</Text>}
                            </View>
                        </View>
                    </Animated.View>

                    {/* Medical History */}
                    <Animated.View style={anim(7)}>
                        <View style={s.gridCard}>
                            <View style={s.gridHeader}>
                                <View style={[s.gridIconWrap, { backgroundColor: '#F3E8FF' }]}><FileText size={16} color="#A855F7" /></View>
                                <Text style={s.gridTitle}>
                                    {t('health_profile.medical_history_count', { defaultValue: 'Medical History ({{count}} records)', count: medical_history.length }).replace('{{count}}', String(medical_history.length))}
                                </Text>
                                <Pressable style={s.gridAddBtn} onPress={() => openModal('history')} hitSlop={10}>
                                    <Plus size={16} color="#A855F7" />
                                </Pressable>
                            </View>
                            <View style={s.gridBody}>
                                {medical_history.slice(0, visibleHistoryCount).map((h, i) => (
                                    <Pressable key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }} onPress={() => openModal('history', h)}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.gridHistoryTxt}>{h.event}</Text>
                                            <Text style={s.gridHistorySub}>{h.date ? new Date(h.date).toLocaleDateString() : t('health_profile.unknown_date', { defaultValue: 'Unknown' })}</Text>
                                        </View>
                                        <ChevronRight size={14} color="#CBD5E1" />
                                    </Pressable>
                                ))}
                                {medical_history.length === 0 && <Text style={s.emptyGridTxt}>{t('health_profile.no_history', { defaultValue: 'No records' })}</Text>}
                                {medical_history.length > 3 && (
                                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                                        {visibleHistoryCount > 3 && (
                                            <Pressable onPress={() => {
                                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                setVisibleHistoryCount(3);
                                            }} style={s.historyLinkBtn}>
                                                <Text style={s.historyLinkBtnTxt}>{t('health_profile.show_less', { defaultValue: 'Show Less' })}</Text>
                                            </Pressable>
                                        )}
                                        {visibleHistoryCount < medical_history.length && (
                                            <Pressable onPress={() => {
                                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                setVisibleHistoryCount(prev => prev + 4);
                                            }} style={s.historyLinkBtn}>
                                                <Text style={s.historyLinkBtnTxt}>
                                                    {t('health_profile.show_more_count', { defaultValue: 'Show {{count}} More', count: Math.min(4, medical_history.length - visibleHistoryCount) }).replace('{{count}}', String(Math.min(4, medical_history.length - visibleHistoryCount)))}
                                                </Text>
                                            </Pressable>
                                        )}
                                    </View>
                                )}
                            </View>
                        </View>
                    </Animated.View>

                    {/* Care Network */}
                    <Animated.View style={anim(8)}>
                        <View style={s.gridCard}>
                            <View style={s.gridHeader}>
                                <View style={[s.gridIconWrap, { backgroundColor: '#E0F2FE' }]}><Users size={16} color="#3B82F6" /></View>
                                <Text style={s.gridTitle}>{t('health_profile.care_network', { defaultValue: 'Care Network' })}</Text>
                                <Pressable 
                                    style={s.gridAddBtn} 
                                    onPress={() => {
                                        AlertManager.alert(
                                            t('health_profile.add_to_network', { defaultValue: 'Add to Care Network' }),
                                            t('health_profile.add_network_desc', { defaultValue: 'Choose who you would like to add' }),
                                            [
                                                { text: t('health_profile.primary_doctor', { defaultValue: 'Primary Doctor' }), onPress: () => openModal('gp') },
                                                { text: t('caller.emergency_contact', { defaultValue: 'Emergency Contact' }), onPress: () => openModal('contact') },
                                                { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' }
                                            ]
                                        );
                                    }} 
                                    hitSlop={10}
                                >
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
                                        <Pressable style={{ flex: 1, paddingRight: 6 }} onPress={() => openModal('contact', c)}>
                                            <Text style={s.netName} numberOfLines={1}>{c.name}</Text>
                                            <Text style={s.netRole}>{t('health_profile.emergency_contact', { defaultValue: 'Emergency Contact' })}</Text>
                                        </Pressable>
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

                    {/* Upcoming Appointments */}
                    <Animated.View style={anim(9)}>
                        <View style={s.gridCard}>
                            <View style={s.gridHeader}>
                                <View style={[s.gridIconWrap, { backgroundColor: '#EEF2FF' }]}><Calendar size={16} color="#6366F1" /></View>
                                <Text style={s.gridTitle}>{t('health_profile.upcoming_appointments', { defaultValue: 'Upcoming Appointments' })}</Text>
                                <Pressable style={s.gridAddBtn} onPress={() => openModal('appointment')} hitSlop={10}>
                                    <Plus size={16} color="#6366F1" />
                                </Pressable>
                            </View>
                            <View style={s.gridBody}>
                                {appointments && appointments.length > 0 ? (
                                    appointments
                                        .filter(appt => appt.status !== 'cancelled')
                                        .sort((a, b) => new Date(a.date) - new Date(b.date))
                                        .map((appt, i) => {
                                            const apptDate = new Date(appt.date);
                                            const isTodayObj = new Date();
                                            const isTomorrowObj = new Date();
                                            isTomorrowObj.setDate(isTomorrowObj.getDate() + 1);
                                            let dateLabel = apptDate.toLocaleDateString();
                                            if (apptDate.toDateString() === isTodayObj.toDateString()) {
                                                dateLabel = t('common.today', { defaultValue: 'Today' });
                                            } else if (apptDate.toDateString() === isTomorrowObj.toDateString()) {
                                                dateLabel = t('common.tomorrow', { defaultValue: 'Tomorrow' });
                                            }
                                            
                                            const timeLabel = apptDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                                            return (
                                                <Pressable key={i} style={s.apptRow} onPress={() => openModal('appointment', appt)}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={s.apptDoctor} numberOfLines={1}>{appt.doctor_name}</Text>
                                                        <Text style={s.apptTitle} numberOfLines={1}>{appt.title}</Text>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 12 }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                                <Clock size={10} color="#6366F1" />
                                                                <Text style={s.apptDateText}>{dateLabel} • {timeLabel}</Text>
                                                            </View>
                                                            {appt.location ? (
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                                    <MapPin size={10} color="#94A3B8" />
                                                                    <Text style={s.apptLocText} numberOfLines={1}>{appt.location}</Text>
                                                                </View>
                                                            ) : null}
                                                        </View>
                                                    </View>
                                                    <ChevronRight size={14} color="#CBD5E1" />
                                                </Pressable>
                                            );
                                        })
                                ) : (
                                    <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                                        <Text style={s.emptyGridTxt}>{t('health_profile.no_appointments', { defaultValue: 'No appointments scheduled yet.' })}</Text>
                                        <Pressable style={s.schedBtn} onPress={() => openModal('appointment')}>
                                            <Text style={s.schedBtnTxt}>{t('health_profile.schedule_appointment', { defaultValue: 'Schedule Appointment' })}</Text>
                                        </Pressable>
                                    </View>
                                )}
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
                            <Trash2 size={20} color={colors.danger} />
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
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: '#E2E8F0' }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 16, ...FONT.bold, color: colors.textPrimary }}>{t('caller.emergency_contact', { defaultValue: 'Emergency Contact' })}</Text>
                                    <Text style={{ fontSize: 13, color: colors.textMuted }}>{t('caller.emergency_desc', { defaultValue: 'Primary person to call in case of emergency' })}</Text>
                                </View>
                                <Switch
                                    value={formState.is_emergency}
                                    onValueChange={(v) => setFormState({ ...formState, is_emergency: v })}
                                    trackColor={{ false: '#CBD5E1', true: colors.danger }}
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
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 14, backgroundColor: '#F8FAFC', borderRadius: radius.md, borderWidth: 1, borderColor: '#E2E8F0', height: 48 }}
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
                            <Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F8FAFC', padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed' }} onPress={() => AlertManager.alert(t('common.coming_soon', { defaultValue: 'Coming Soon' }), t('health_profile.upload_coming_soon', { defaultValue: 'Upload functionality will be added in a future update.' }))}>
                                <Upload size={18} color={colors.primary} />
                                <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>{t('health_profile.upload_prescription', { defaultValue: 'Upload Prescription' })}</Text>
                            </Pressable>
                        </View>
                    </>
                )}
                {editingType === 'history' && (
                    <>
                        <View style={s.formGroup}><SmartInput label={t('health_profile.event_surgery_lbl', { defaultValue: 'Event / Surgery / Diagnosis *' })} value={formState.event} onChangeText={(t) => setFormState({ ...formState, event: t })} placeholder={t('health_profile.event_placeholder', { defaultValue: 'e.g. Knee Replacement' })} /></View>
                        <View style={s.formGroup}><Text style={s.formLabel}>{t('common.date', { defaultValue: 'Date *' })}</Text><Pressable style={[s.input, { justifyContent: 'center' }]} onPress={() => { setDatePickerField('date'); setShowDatePicker(true); }}><Text style={{ color: formState.date ? colors.textPrimary : colors.textMuted, fontSize: 15 }}>{formState.date ? new Date(formState.date).toLocaleDateString(t('common.locale_date', { defaultValue: 'en-US' }), { year: 'numeric', month: 'short', day: 'numeric' }) : t('common.select_date', { defaultValue: 'Select date' })}</Text></Pressable></View>
                        <View style={s.formGroup}><SmartInput label={t('health_profile.detailed_notes', { defaultValue: 'Detailed Notes' })} variant="multiline" multiline value={formState.notes} onChangeText={(t) => setFormState({ ...formState, notes: t })} placeholder={t('health_profile.surgery_notes_placeholder', { defaultValue: 'How did the procedure go? Who was the doctor?' })} /></View>
                    </>
                )}
                {editingType === 'vaccination' && (
                    <>
                        <View style={s.formGroup}><SmartInput label={t('health_profile.vaccine_name', { defaultValue: 'Vaccine Name *' })} value={formState.name} onChangeText={(t) => setFormState({ ...formState, name: t })} placeholder={t('health_profile.vaccine_placeholder', { defaultValue: 'e.g. Influenza, COVID-19' })} /></View>
                        <View style={s.formGroup}><Text style={s.formLabel}>{t('health_profile.date_given', { defaultValue: 'Date Given *' })}</Text><Pressable style={[s.input, { justifyContent: 'center' }]} onPress={() => { setDatePickerField('date_given'); setShowDatePicker(true); }}><Text style={{ color: formState.date_given ? colors.textPrimary : colors.textMuted, fontSize: 15 }}>{formState.date_given ? new Date(formState.date_given).toLocaleDateString(t('common.locale_date', { defaultValue: 'en-US' }), { year: 'numeric', month: 'short', day: 'numeric' }) : t('common.select_date', { defaultValue: 'Select date' })}</Text></Pressable></View>
                    </>
                )}
                {editingType === 'appointment' && (
                    <>
                        <View style={s.formGroup}><Text style={s.formLabel}>{t('health_profile.reason_title', { defaultValue: 'Reason / Title *' })}</Text><TextInput style={s.input} placeholderTextColor={colors.textMuted} value={formState.title} onChangeText={(t) => setFormState({ ...formState, title: t })} placeholder={t('health_profile.appt_placeholder', { defaultValue: 'General Checkup' })} /></View>
                        <View style={s.formGroup}><Text style={s.formLabel}>{t('health_profile.doctor_specialist', { defaultValue: 'Doctor / Specialist Name *' })}</Text><TextInput style={s.input} placeholderTextColor={colors.textMuted} value={formState.doctor_name} onChangeText={(t) => setFormState({ ...formState, doctor_name: t })} placeholder="Dr. Smith" /></View>
                        <View style={s.formGroup}>
                            <Text style={s.formLabel}>{t('health_profile.date_time', { defaultValue: 'Date & Time *' })}</Text>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <Pressable style={[s.input, { flex: 1, justifyContent: 'center' }]} onPress={() => { setDatePickerField('date'); setShowDatePicker(true); }}>
                                    <Text style={{ color: formState.date ? colors.textPrimary : colors.textMuted }}>{formState.date ? new Date(formState.date).toLocaleDateString(t('common.locale_date', { defaultValue: 'en-US' }), { year: 'numeric', month: 'short', day: 'numeric' }) : t('common.select_date', { defaultValue: 'Select Date' })}</Text>
                                </Pressable>
                                <Pressable style={[s.input, { flex: 1, justifyContent: 'center' }]} onPress={() => { setDatePickerField('date'); setShowTimePicker(true); }}>
                                    <Text style={{ color: formState.date ? colors.textPrimary : colors.textMuted }}>{formState.date ? new Date(formState.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t('common.select_time', { defaultValue: 'Select Time' })}</Text>
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
                            <X size={20} color={colors.textSecondary} />
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
                                <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 16 }}>Done</Text>
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
                                <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 16 }}>Done</Text>
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
            {/* ── HEALTH TIPS MODAL ── */}
            <Modal
                visible={tipsModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setTipsModalVisible(false)}
            >
                <View style={s.tipsBackdrop}>
                    <View style={s.tipsSheet}>
                        {/* Handle */}
                        <View style={s.tipsHandle} />

                        {/* Header */}
                        <View style={s.tipsHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.tipsHeaderEyebrow}>PERSONALISED FOR YOU</Text>
                                <Text style={s.tipsHeaderTitle}>Ways to Improve</Text>
                                <Text style={s.tipsHeaderSub}>
                                    {hsScore !== null
                                        ? `Your current score is ${hsScore}/100 • ${hsLabel}`
                                        : 'Based on your health profile'}
                                </Text>
                            </View>
                            {/* Mini score ring */}
                            <View style={s.tipsMiniRingWrap}>
                                <Svg width={60} height={60} viewBox="0 0 60 60">
                                    <SvgCircle cx="30" cy="30" r="25" stroke="#F1F5F9" strokeWidth="6" fill="transparent" />
                                    <SvgCircle
                                        cx="30" cy="30" r="25"
                                        stroke={hsScore !== null ? hsColor : '#CBD5E1'}
                                        strokeWidth="6"
                                        fill="transparent"
                                        strokeDasharray={`${2 * Math.PI * 25}`}
                                        strokeDashoffset={`${2 * Math.PI * 25 * (1 - (hsScore ?? 0) / 100)}`}
                                        strokeLinecap="round"
                                        transform="rotate(-90 30 30)"
                                    />
                                </Svg>
                                <Text style={[s.tipsMiniScore, { color: hsScore !== null ? hsColor : '#94A3B8' }]}>
                                    {hsScore ?? '—'}
                                </Text>
                            </View>
                        </View>

                        {/* Tips list */}
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={s.tipsScrollContent}
                        >
                            {(hs?.tips || []).length === 0 ? (
                                <View style={s.tipsEmptyState}>
                                    <Text style={{ fontSize: 32, marginBottom: 12 }}>⭐</Text>
                                    <Text style={s.tipsEmptyTitle}>You're in great shape!</Text>
                                    <Text style={s.tipsEmptySub}>No specific improvements needed right now. Keep up your current habits.</Text>
                                </View>
                            ) : (
                                (hs?.tips || []).map((tip, idx) => {
                                    const impactConfig = {
                                        high:   { bg: '#FEF2F2', border: '#FCA5A5', text: '#DC2626', badge: '#FEF2F2', badgeText: '#DC2626', label: 'High Impact' },
                                        medium: { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706', badge: '#FFFBEB', badgeText: '#D97706', label: 'Medium Impact' },
                                        low:    { bg: '#F0FDF4', border: '#BBF7D0', text: '#16A34A', badge: '#F0FDF4', badgeText: '#16A34A', label: 'Good to have' },
                                    }[tip.impact] || { bg: '#F8FAFC', border: '#E2E8F0', text: '#0EA5E9', badge: '#F0F9FF', badgeText: '#0369A1', label: 'Tip' };

                                    return (
                                        <View key={idx} style={[s.tipCard, { borderLeftColor: impactConfig.text, backgroundColor: impactConfig.bg, borderColor: impactConfig.border }]}>
                                            <View style={s.tipCardTop}>
                                                <Text style={s.tipIcon}>{tip.icon}</Text>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[s.tipTitle, { color: '#0F172A' }]}>{tip.title}</Text>
                                                </View>
                                                <View style={[s.tipImpactBadge, { backgroundColor: impactConfig.badge, borderColor: impactConfig.border }]}>
                                                    <Text style={[s.tipImpactTxt, { color: impactConfig.badgeText }]}>{impactConfig.label}</Text>
                                                </View>
                                            </View>
                                            <Text style={s.tipBody}>{tip.body}</Text>
                                        </View>
                                    );
                                })
                            )}

                            {/* Footer note */}
                            <View style={s.tipsFooter}>
                                <ShieldCheck size={14} color="#94A3B8" />
                                <Text style={s.tipsFooterTxt}>Tips are personalised based on your age group, lifestyle, and health data.</Text>
                            </View>
                        </ScrollView>

                        {/* Close button */}
                        <Pressable style={s.tipsCloseBtn} onPress={() => setTipsModalVisible(false)}>
                            <Text style={s.tipsCloseTxt}>Got it, thanks!</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* ── SCORE INFO MODAL ── */}
            <Modal visible={showScoreInfo} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowScoreInfo(false)}>
                {(() => {
                    const hasScore = hsScore !== null && hsScore > 0;
                    const activeScoreVal = hasScore ? hsScore : 0;
                    
                    const scoreColor = activeScoreVal >= 80 ? '#10B981' : activeScoreVal >= 60 ? '#F59E0B' : activeScoreVal >= 40 ? '#F97316' : '#F43F5E';
                    const scoreStatus = hasScore ? (hsLabel || 'Stable') : 'Learning Patterns';
                    
                    // Health Age: derive from actual age and score, not fabricated
                    const actualAge = age || null;
                    const healthAgeDiff = hasScore ? (activeScoreVal >= 80 ? -2 : activeScoreVal >= 60 ? 0 : activeScoreVal >= 40 ? 1 : 3) : null;
                    const getDriverPct = (driverKey) => {
                        const driver = hsBreakdown?.[driverKey];
                        if (!driver || typeof driver.pts !== 'number' || typeof driver.max !== 'number' || driver.max === 0) {
                            return 0;
                        }
                        return Math.round((driver.pts / driver.max) * 100);
                    };
                    const adherencePct = hsBreakdown ? getDriverPct('adherence') : null;
                    const healthAgeVal = actualAge && healthAgeDiff !== null ? Math.max(18, actualAge + healthAgeDiff) : null;

                    // Streak: use real gamification data from backend when available
                    const gamif = profile?.gamification;
                    const realStreak = gamif?.current_streak ?? 0;
                    const historyDates = gamif?.history_dates || []; // YYYY-MM-DD strings
                    const hasRealStreakData = realStreak > 0 || historyDates.length > 0;

                    // Build weekly view from real history_dates
                    const daysOfWeek = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
                    const todayIdx = (new Date().getDay() + 6) % 7;
                    const today = new Date();
                    const completedDays = daysOfWeek.map((_, idx) => {
                        if (historyDates.length > 0) {
                            // Check if this day of the current week has a log entry
                            const dayDate = new Date(today);
                            dayDate.setDate(today.getDate() - (todayIdx - idx));
                            const dateStr = dayDate.toISOString().slice(0, 10);
                            return historyDates.includes(dateStr);
                        }
                        // Fallback: no history data, show nothing
                        return false;
                    });
                    const streakDays = hasRealStreakData ? realStreak : 0;
                    const streakLabel = hasRealStreakData ? 'Streak' : 'Consistency';

                    // First medication for coach card
                    const firstMed = activeMeds && activeMeds.length > 0 ? activeMeds[0].name : null;
                    const topTip = (hs?.tips || []).find(t => t.impact === 'high') || (hs?.tips || [])[0] || null;
                    const coachAction = topTip ? topTip.title : (firstMed ? `Take ${firstMed} with your next meal` : 'Complete your health profile to unlock personalized coaching');
                    const coachImpact = topTip?.impact === 'high' ? '+5' : topTip?.impact === 'medium' ? '+3' : '+2';

                    // Health drivers from real breakdown
                    const driverData = hsBreakdown ? [
                        { label: 'Medication', pct: getDriverPct('adherence'), icon: '💊' },
                        { label: 'Lifestyle', pct: getDriverPct('lifestyle'), icon: '🏃' },
                        { label: 'Vitals', pct: getDriverPct('vitals'), icon: '🩺' },
                        { label: 'Conditions', pct: getDriverPct('conditions'), icon: '❤️' },
                        { label: 'Preventive Care', pct: getDriverPct('preventive'), icon: '🛡️' },
                        { label: 'Mobility', pct: getDriverPct('mobility'), icon: '🚶' },
                    ] : null;
                    const driverColor = (pct) => pct >= 75 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#F43F5E';

                    // Weakest driver for prediction
                    const weakest = driverData ? [...driverData].sort((a, b) => a.pct - b.pct)[0] : null;
                    const projectedBoost = weakest ? Math.min(8, Math.round((100 - weakest.pct) * 0.15)) : 5;
                    const projectedScore = hasScore ? Math.min(100, activeScoreVal + projectedBoost) : null;

                    // Achievements: use real persistent badges from backend + profile-derived ones
                    const backendBadges = profile?.unlockedAchievements || [];
                    const badgeLabels = {
                        first_perfect_day: '🌟 First Perfect Day',
                        weekly_90: '📅 Weekly 90% Adherence',
                        streak_7: '🔥 7-Day Streak',
                        streak_30: '🔥 30-Day Streak',
                        first_vital: '🩺 First Vital Logged',
                        profile_complete: '✅ Profile Complete',
                    };
                    const unlockedAchievements = [
                        ...backendBadges.map(key => badgeLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())),
                    ];
                    // Supplement with profile-derived badges (only if not already covered by backend)
                    if (backendBadges.length === 0) {
                        if (activeMeds.length > 0) unlockedAchievements.push('Active Medication Tracker');
                        if (conditions.length > 0 && managedCount >= conditions.length * 0.5) unlockedAchievements.push('Condition Management');
                        if (completionPct >= 80) unlockedAchievements.push('Profile Champion');
                        if (gp.name) unlockedAchievements.push('Care Network Active');
                        if (vaccinations.length >= 2) unlockedAchievements.push('Vaccination Record');
                    }

                    // Next milestone
                    let nextMilestone = 'Keep up the great work — all milestones achieved!';
                    let milestoneProgress = 100;
                    let milestoneTarget = 100;

                    if (completionPct < 100) {
                        nextMilestone = `Complete ${100 - completionPct}% more of your profile to unlock 🏆 Health Profile Master`;
                        milestoneProgress = completionPct;
                        milestoneTarget = 100;
                    } else if (streakDays < 7) {
                        nextMilestone = `Log vitals/meds for ${7 - streakDays} more days to unlock 🏆 7-Day Streak (${streakDays}/7)`;
                        milestoneProgress = streakDays;
                        milestoneTarget = 7;
                    } else if (streakDays < 30) {
                        nextMilestone = `Log vitals/meds for ${30 - streakDays} more days to unlock 🏆 30-Day Streak (${streakDays}/30)`;
                        milestoneProgress = streakDays;
                        milestoneTarget = 30;
                    } else if (adherencePct !== null && adherencePct < 95) {
                        nextMilestone = `Improve medication adherence to 95% to unlock 🏆 Medication Champion (${adherencePct}/95%)`;
                        milestoneProgress = adherencePct;
                        milestoneTarget = 95;
                    }

                    // Dynamic Coach CTA question & text based on weakest driver
                    let coachQuestion = 'How can I improve my health score?';
                    let coachCtaText = 'Ask AI Coach';

                    if (weakest) {
                        const qMap = {
                            'Medication': 'How can I stick to my medication schedule?',
                            'Lifestyle': 'What active habits can help improve my lifestyle score?',
                            'Vitals': 'How do I keep my vitals stable and healthy?',
                            'Conditions': 'What are the best ways to manage my health conditions?',
                            'Preventive Care': 'What preventive checks should I get done?',
                            'Mobility': 'How can I safely improve my mobility score?',
                        };
                        coachQuestion = qMap[weakest.label] || 'How can I improve my health score?';

                        const ctaMap = {
                            'Medication': 'Ask how to stick to meds',
                            'Lifestyle': 'Ask how to improve habits',
                            'Vitals': 'Ask how to stabilize vitals',
                            'Conditions': 'Ask how to manage conditions',
                            'Preventive Care': 'Ask about preventive care',
                            'Mobility': 'Ask how to improve mobility',
                        };
                        coachCtaText = ctaMap[weakest.label] || 'Ask AI Coach';
                    }

                    return (
                        <View style={s.tipsBackdrop}>
                            <View style={[s.tipsSheet, { maxHeight: '95%' }]}>
                                {/* Drag Handle */}
                                <View style={s.tipsHandle} />

                                {/* Modal Header */}
                                <View style={{ paddingHorizontal: spacing.screen, paddingTop: 16, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 24, ...FONT.heavy, color: '#0F172A', letterSpacing: -0.5, marginBottom: 2 }}>AI Health Score Coach</Text>
                                        <Text style={{ fontSize: 13, ...FONT.medium, color: '#64748B' }}>Your personalized health insights</Text>
                                    </View>
                                    <Pressable onPress={() => setShowScoreInfo(false)} hitSlop={12} style={{ backgroundColor: '#F1F5F9', padding: 6, borderRadius: radius.lg, borderWidth: 1, borderColor: '#E2E8F0' }}>
                                        <X size={18} color="#64748B" />
                                    </Pressable>
                                </View>

                                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: spacing.screen }}>
                                    
                                    {/* ── SECTION 1: HERO CARD ── */}
                                    <ScoreHeroCard
                                        scoreData={{
                                            hasScore,
                                            activeScoreVal,
                                            scoreColor,
                                            scoreStatus,
                                            hsGrade,
                                            hsBracket,
                                            bracketLabel,
                                            lastSyncText
                                        }}
                                    />

                                    {/* ── SECTION 2: HEALTH AGE WIDGET ── */}
                                    {actualAge && healthAgeVal !== null && (
                                        <View style={{
                                            backgroundColor: '#FAFBFF',
                                            borderRadius: radius.lg,
                                            padding: 16,
                                            borderWidth: 1,
                                            borderColor: '#E0E7FF',
                                            marginBottom: 20,
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}>
                                            <View style={{ gap: 2 }}>
                                                <Text style={{ fontSize: 12, ...FONT.heavy, color: '#6366F1', letterSpacing: 0.8, textTransform: 'uppercase' }}>HEALTH AGE</Text>
                                                <Text style={{ fontSize: 20, ...FONT.heavy, color: '#0F172A' }}>{healthAgeVal} Years</Text>
                                            </View>
                                            <View style={{
                                                backgroundColor: healthAgeDiff === 0 ? '#F1F5F9' : (healthAgeDiff < 0 ? '#ECFDF5' : '#FEF2F2'),
                                                paddingHorizontal: 10,
                                                paddingVertical: 6,
                                                borderRadius: radius.md,
                                            }}>
                                                <Text style={{ fontSize: 12, ...FONT.bold, color: healthAgeDiff === 0 ? '#475569' : (healthAgeDiff < 0 ? '#10B981' : '#EF4444') }}>
                                                    {healthAgeDiff === 0 ? 'Same as actual age' : (healthAgeDiff < 0 ? `${Math.abs(healthAgeDiff)} years younger` : `${healthAgeDiff} years older`)}
                                                </Text>
                                            </View>
                                        </View>
                                    )}

                                    {/* ── SECTION 3: AI HEALTH COACH CARD ── */}
                                    <HealthCoachCard
                                        coachData={{
                                            insight: {
                                                action: coachAction,
                                                topTip: topTip,
                                                question: coachQuestion,
                                                ctaText: coachCtaText,
                                            },
                                            score: {
                                                value: activeScoreVal,
                                                grade: hsGrade,
                                                status: scoreStatus,
                                                hasScore: hasScore,
                                            },
                                            projection: {
                                                weakest: weakest,
                                                boost: projectedBoost,
                                                projectedScore: projectedScore,
                                            }
                                        }}
                                        onPressCoach={() => {
                                            setShowScoreInfo(false);
                                            navigation.navigate('Chatbot', {
                                                initialMessage: coachQuestion,
                                                healthContext: {
                                                    score: activeScoreVal,
                                                    grade: hsGrade,
                                                    label: scoreStatus,
                                                    weakestDriver: weakest?.label || 'General',
                                                    weakestScore: weakest?.pct ?? 0,
                                                    projectedBoost,
                                                    projectedScore,
                                                    suggestedAction: coachAction
                                                }
                                            });
                                        }}
                                    />

                                    {/* ── SECTION 4: OPPORTUNITY CARDS ── */}
                                    <View style={{ marginBottom: 20 }}>
                                        <Text style={{ fontSize: 12, ...FONT.heavy, color: '#64748B', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 }}>OPPORTUNITIES</Text>
                                        
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 24 }}>
                                            {activeMeds.length > 0 && (
                                                <Pressable 
                                                    onPress={() => { setShowScoreInfo(false); navigation.navigate('Medications'); }}
                                                    style={{
                                                        width: 150,
                                                        backgroundColor: '#FFFFFF',
                                                        borderRadius: radius.lg,
                                                        padding: 16,
                                                        borderWidth: 1,
                                                        borderColor: '#E2E8F0',
                                                        justifyContent: 'space-between',
                                                        minHeight: 120,
                                                        ...shadows.card,
                                                    }}
                                                >
                                                    <View style={{ backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, alignSelf: 'flex-start' }}>
                                                        <Text style={{ fontSize: 10, ...FONT.heavy, color: '#10B981' }}>+5 Score</Text>
                                                    </View>
                                                    <Text style={{ fontSize: 13, ...FONT.bold, color: '#0F172A', marginTop: 8 }} numberOfLines={2}>Take morning meds</Text>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 }}>
                                                        <ChevronRight size={14} color="#6366F1" />
                                                    </View>
                                                </Pressable>
                                            )}

                                            <Pressable 
                                                onPress={() => { setShowScoreInfo(false); navigation.navigate('VitalsHistory'); }}
                                                style={{
                                                    width: 150,
                                                    backgroundColor: '#FFFFFF',
                                                    borderRadius: radius.lg,
                                                    padding: 16,
                                                    borderWidth: 1,
                                                    borderColor: '#E2E8F0',
                                                    justifyContent: 'space-between',
                                                    minHeight: 120,
                                                    ...shadows.card,
                                                }}
                                            >
                                                <View style={{ backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, alignSelf: 'flex-start' }}>
                                                    <Text style={{ fontSize: 10, ...FONT.heavy, color: '#10B981' }}>+4 Score</Text>
                                                </View>
                                                <Text style={{ fontSize: 13, ...FONT.bold, color: '#0F172A', marginTop: 8 }} numberOfLines={2}>Log BP Reading</Text>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 }}>
                                                    <ChevronRight size={14} color="#6366F1" />
                                                </View>
                                            </Pressable>

                                            {healthSdkReady && (
                                                <Pressable 
                                                    onPress={() => { setShowScoreInfo(false); handleWearableSync(); }}
                                                    style={{
                                                        width: 150,
                                                        backgroundColor: '#FFFFFF',
                                                        borderRadius: radius.lg,
                                                        padding: 16,
                                                        borderWidth: 1,
                                                        borderColor: '#E2E8F0',
                                                        justifyContent: 'space-between',
                                                        minHeight: 120,
                                                        ...shadows.card,
                                                    }}
                                                >
                                                    <View style={{ backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, alignSelf: 'flex-start' }}>
                                                        <Text style={{ fontSize: 10, ...FONT.heavy, color: '#10B981' }}>+3 Score</Text>
                                                    </View>
                                                    <Text style={{ fontSize: 13, ...FONT.bold, color: '#0F172A', marginTop: 8 }} numberOfLines={2}>Sync Wearable</Text>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 }}>
                                                        <ChevronRight size={14} color="#6366F1" />
                                                    </View>
                                                </Pressable>
                                            )}

                                            {completionPct < 100 && (
                                                <Pressable 
                                                    onPress={() => { setShowScoreInfo(false); handleCompletionClick(); }}
                                                    style={{
                                                        width: 150,
                                                        backgroundColor: '#FFFFFF',
                                                        borderRadius: radius.lg,
                                                        padding: 16,
                                                        borderWidth: 1,
                                                        borderColor: '#E2E8F0',
                                                        justifyContent: 'space-between',
                                                        minHeight: 120,
                                                        ...shadows.card,
                                                    }}
                                                >
                                                    <View style={{ backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, alignSelf: 'flex-start' }}>
                                                        <Text style={{ fontSize: 10, ...FONT.heavy, color: '#10B981' }}>+2 Score</Text>
                                                    </View>
                                                    <Text style={{ fontSize: 13, ...FONT.bold, color: '#0F172A', marginTop: 8 }} numberOfLines={2}>Complete Profile</Text>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 }}>
                                                        <ChevronRight size={14} color="#6366F1" />
                                                    </View>
                                                </Pressable>
                                            )}
                                        </ScrollView>
                                    </View>

                                    {/* ── SECTION 5: HEALTH DRIVERS ── */}
                                    <HealthDrivers driverData={driverData} />

                                    {/* ── SECTION 6: WEEKLY MOMENTUM & STREAK RINGS ── */}
                                    <MomentumCard
                                        streakDays={streakDays}
                                        streakLabel={streakLabel}
                                        daysOfWeek={daysOfWeek}
                                        completedDays={completedDays}
                                        todayIdx={todayIdx}
                                    />

                                    {/* ── SECTION 7: AI INSIGHT & PREDICTION CARD ── */}
                                    {hasScore && (
                                        <View style={{
                                            backgroundColor: '#FAFBFF',
                                            borderRadius: radius.lg,
                                            padding: 20,
                                            borderWidth: 1,
                                            borderColor: '#E0E7FF',
                                            marginBottom: 20,
                                            gap: 12,
                                        }}>
                                            {(hs?.tips || []).length > 0 && (
                                                <View style={{ gap: 4 }}>
                                                    <Text style={{ fontSize: 12, ...FONT.heavy, color: '#6366F1', letterSpacing: 0.8, textTransform: 'uppercase' }}>AI INSIGHT</Text>
                                                    <Text style={{ fontSize: 14, ...FONT.medium, color: '#334155', lineHeight: 20 }}>
                                                        {hs.tips[0].body}
                                                    </Text>
                                                </View>
                                            )}
                                            
                                            {weakest && projectedScore && (
                                                <>
                                                    <View style={{ height: 1, backgroundColor: '#E0E7FF' }} />
                                                    <View style={{ gap: 4 }}>
                                                        <Text style={{ fontSize: 12, ...FONT.heavy, color: '#6366F1', letterSpacing: 0.8, textTransform: 'uppercase' }}>PREDICTION</Text>
                                                        <Text style={{ fontSize: 14, ...FONT.medium, color: '#334155', lineHeight: 20 }}>
                                                            Improving your {weakest.label.toLowerCase()} score could boost your overall health score.
                                                        </Text>
                                                        <View style={{
                                                            backgroundColor: '#EEF2FF',
                                                            paddingHorizontal: 10,
                                                            paddingVertical: 6,
                                                            borderRadius: radius.md,
                                                            alignSelf: 'flex-start',
                                                            marginTop: 4,
                                                        }}>
                                                            <Text style={{ fontSize: 12, ...FONT.bold, color: '#4F46E5' }}>Projected Score: {projectedScore}</Text>
                                                        </View>
                                                    </View>
                                                </>
                                            )}
                                        </View>
                                    )}

                                    {/* ── SECTION 8: ACHIEVEMENTS & NEXT MILESTONE ── */}
                                    <AchievementSection
                                        nextMilestone={nextMilestone}
                                        milestoneProgress={milestoneProgress}
                                        milestoneTarget={milestoneTarget}
                                        unlockedAchievements={unlockedAchievements}
                                    />

                                </ScrollView>
                            </View>
                        </View>
                    );
                })()}
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    // Base
    container: { flex: 1, backgroundColor: colors.background },
    root: { flex: 1, backgroundColor: colors.background },

    // ── Simple Header (like care team / medications) ──
    header: {
        paddingTop: Platform.OS === 'ios' ? 60 : 48,
        paddingHorizontal: spacing.screen,
        paddingBottom: 14,
        backgroundColor: colors.background,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerEyebrow: {
        fontSize: 13, fontWeight: '800', color: '#6366F1',
        letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4,
    },
    headerTitle: { fontSize: 32, fontWeight: '800', color: '#0F172A', letterSpacing: -1 },
    headerBtn: {
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
        alignItems: 'center', justifyContent: 'center',
    },
    bellDot: { position: 'absolute', top: 10, right: 10, width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: '#FFFFFF' },

    scrollContent: {
        paddingHorizontal: spacing.screen,
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
    completionPctTxt: { fontSize: 14, ...FONT.heavy, color: colors.primary },
    progressBarBg: { height: 5, borderRadius: 3, backgroundColor: '#BAE6FD', marginBottom: 6, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
    completionSub: { fontSize: 11, ...FONT.medium, color: '#94A3B8' },

    // ── Section Group Headers ──
    groupHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        marginTop: 4,
    },
    groupIconWrap: {
        width: 26, height: 26, borderRadius: radius.sm,
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
        flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14,
        alignItems: 'center',
        ...shadows.card,
    },
    bentoCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    bentoVal: { fontSize: 16, ...FONT.heavy, color: '#0F172A', marginBottom: 3 },
    bentoLbl: { fontSize: 9, ...FONT.bold, color: '#94A3B8', letterSpacing: 0.8, textAlign: 'center' },

    // ── Document Cards ──
    docCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        overflow: 'hidden',
        ...shadows.card,
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
        backgroundColor: colors.primary,
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
    iconBg: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    rowInfo: { flex: 1 },
    rowTitle: { fontSize: 15, ...FONT.bold, color: '#0F172A', marginBottom: 2 },
    rowSub: { fontSize: 12, ...FONT.medium, color: '#94A3B8' },
    pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm },
    pillTxt: { fontSize: 11, ...FONT.bold },

    // ── Allergy Chips ──
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingBottom: 14, paddingTop: 0 },
    allergyChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, backgroundColor: '#F1F5F9' },
    allergyChipTxt: { fontSize: 13, ...FONT.semibold },

    // ── Wellness Metrics ──
    monitoringRow: { flexDirection: 'row', gap: 10 },
    metricCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, alignItems: 'center', ...shadows.card },
    metricVal: { fontSize: 20, ...FONT.heavy, marginTop: 8, marginBottom: 2 },
    metricLbl: { fontSize: 9, ...FONT.bold, color: '#94A3B8', letterSpacing: 0.8, marginBottom: 2 },
    metricSub: { fontSize: 11, ...FONT.bold },

    // Empty state
    emptyRowTxt: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', padding: 16, paddingTop: 4, textAlign: 'center' },

    // ── Sync Button ──
    syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.lg },
    syncBtnTxt: { color: '#FFF', ...FONT.bold, fontSize: 12 },

    // ── Primary Doctor ──
    gpRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
    gpAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    gpAvatarTxt: { fontSize: 20, ...FONT.heavy, color: colors.primary },
    gpInfo: { flex: 1 },
    gpName: { fontSize: 17, ...FONT.bold, color: '#0F172A', marginBottom: 3 },
    gpDetail: { fontSize: 13, ...FONT.medium, color: '#94A3B8' },
    callBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginBottom: 14, height: 44, borderRadius: 22, backgroundColor: colors.primary },
    callBtnTxt: { fontSize: 14, ...FONT.bold, color: '#FFF' },

    // ── Freemium Upgrade ──
    upgradeIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    upgradeTitle: { fontSize: 24, ...FONT.bold, color: '#0F172A', marginBottom: 12, letterSpacing: -0.5 },
    upgradeBody: { fontSize: 16, ...FONT.regular, color: '#94A3B8', textAlign: 'center', lineHeight: 24 },

    // ── Form Styles (preserved) ──
    formGroup: { marginBottom: 20 },
    formLabel: { fontSize: 13, ...FONT.bold, color: colors.textMuted, marginBottom: 10, letterSpacing: 0.5 },
    input: { backgroundColor: '#FAFBFF', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: radius.md, paddingHorizontal: 16, height: 48, fontSize: 15, ...FONT.medium, color: colors.textPrimary },
    trashBtn: { padding: 4, backgroundColor: '#FFE4E6', borderRadius: radius.sm },
    closeIconBtn: { padding: 4 },

    // ChipSelector
    chipSelectorWrap: { flexDirection: 'row', gap: 10, paddingBottom: 4 },
    chipVerticalWrap: { flexDirection: 'column', paddingBottom: 4 },
    selectChip: { paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: radius.md, backgroundColor: '#FFF' },
    selectChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    selectChipTxt: { fontSize: 14, ...FONT.bold, color: colors.textMuted },
    selectChipTxtActive: { color: colors.primaryDark },

    // DOB Picker
    pickerContainer: { paddingBottom: 20 },
    pickerHeader: { backgroundColor: '#E0F2FE', padding: 16, borderRadius: radius.md, marginBottom: 20, alignItems: 'center' },
    pickerPreview: { fontSize: 18, ...FONT.bold, color: colors.primaryDark },
    pickerLabel: { fontSize: 13, ...FONT.bold, color: colors.textMuted, marginBottom: 12, letterSpacing: 0.5 },
    yearScroll: { marginBottom: 10 },
    yearChip: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.md, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', marginRight: 10 },
    yearChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    yearChipTxt: { fontSize: 16, ...FONT.bold, color: '#334155' },
    yearChipTxtActive: { color: '#FFF' },
    monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    monthChip: { width: '31%', paddingVertical: 10, alignItems: 'center', borderRadius: radius.md, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
    monthChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    monthChipTxt: { fontSize: 14, ...FONT.bold, color: '#334155' },
    monthChipTxtActive: { color: '#FFF' },
    dayScroll: { marginTop: 10 },
    dayChip: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    dayChipTxt: { fontSize: 16, ...FONT.bold, color: '#334155' },
    dayChipTxtActive: { color: '#FFF' },

    // Country Code Modal
    countryModalWrap: { backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '80%', marginTop: 'auto', shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 12 },
    countryModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    countryModalTitle: { fontSize: 18, ...FONT.bold, color: '#0F172A' },
    countryOption: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
    countryFlag: { fontSize: 24, marginRight: 12 },
    countryName: { flex: 1, fontSize: 16, color: '#0F172A', ...FONT.medium },
    countryCodeText: { fontSize: 16, color: colors.primary, ...FONT.bold },

    // ── NEW LAYOUT STYLES ──
    dashboardCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 20, ...shadows.card, marginBottom: 20 },
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
    dashMiniIcon: { width: 28, height: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
    dashMiniLbl: { fontSize: 10, ...FONT.bold, color: '#64748B' },
    dashMiniVal: { fontSize: 14, ...FONT.heavy },

    // Profile completeness banner
    completeBanner: { backgroundColor: '#F0F9FF', borderRadius: radius.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#BAE6FD' },
    completeBannerTitle: { fontSize: 13, ...FONT.bold, color: '#0369A1' },
    completeBannerPct: { fontSize: 13, ...FONT.heavy },
    completeBannerSub: { fontSize: 11, ...FONT.medium, color: '#0EA5E9', marginTop: 6 },
    completeBarOuter: { height: 5, backgroundColor: '#E0F2FE', borderRadius: radius.sm, overflow: 'hidden' },
    completeBarInner: { height: 5, borderRadius: radius.sm },

    // Health score card — grade chip + bracket tag
    gradeChip: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm, borderWidth: 1.5 },
    gradeChipTxt: { fontSize: 13, ...FONT.heavy },
    bracketTag: { backgroundColor: '#F8FAFC', borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8, alignSelf: 'flex-start' },
    bracketTagTxt: { fontSize: 10, ...FONT.bold, color: '#64748B', letterSpacing: 0.3 },

    // Score Breakdown Explainer
    breakdownSection: { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 16 },
    breakdownTitle: { fontSize: 10, ...FONT.heavy, color: '#94A3B8', letterSpacing: 1, marginBottom: 12 },
    breakdownItem: { marginBottom: 12 },
    breakdownItemTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    breakdownItemIcon: { fontSize: 13, marginRight: 6 },
    breakdownItemLabel: { flex: 1, fontSize: 13, ...FONT.bold, color: '#334155' },
    breakdownPtsChip: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, flexShrink: 0 },
    breakdownPtsTxt: { fontSize: 11, ...FONT.heavy },
    breakdownBarBg: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
    breakdownBarFill: { height: '100%', borderRadius: 3 },

    // Today's Focus (Inline Insights)
    focusSection: { marginBottom: 20 },
    focusHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, paddingHorizontal: 4 },
    focusHeaderTitle: { fontSize: 11, ...FONT.heavy, color: '#6366F1', letterSpacing: 1 },
    insightCard: { borderRadius: radius.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderLeftWidth: 4, shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
    insightTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
    insightIcon: { fontSize: 18, lineHeight: 22 },
    insightTitle: { fontSize: 14, ...FONT.bold, color: '#0F172A', lineHeight: 20 },
    insightBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, borderWidth: 1, marginTop: 2 },
    insightBadgeText: { fontSize: 9, ...FONT.heavy, textTransform: 'uppercase', letterSpacing: 0.3 },
    insightBody: { fontSize: 13, ...FONT.medium, color: '#475569', lineHeight: 18, marginLeft: 26 },
    seeAllInsightsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, marginTop: 4 },
    seeAllInsightsTxt: { fontSize: 13, ...FONT.bold, color: '#6366F1' },
    emptyFocusState: { backgroundColor: '#FFF', borderRadius: radius.lg, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    emptyFocusIcon: { fontSize: 24, marginBottom: 8 },
    emptyFocusTxt: { fontSize: 13, ...FONT.medium, color: '#64748B', textAlign: 'center' },

    alertsCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, marginBottom: 20, shadowColor: colors.danger, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
    alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    alertIconBox: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
    alertTitle: { fontSize: 15, ...FONT.bold, color: '#0F172A', marginBottom: 2 },
    alertSub: { fontSize: 12, ...FONT.medium, color: '#64748B' },
    alertChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    alertChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md },
    alertDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
    alertChipTxt: { fontSize: 12, ...FONT.bold, color: '#EF4444' },

    masonryGrid: { flexDirection: 'column', gap: 16 }, // Kept name to avoid breaking external refs, but it's now stacked
    masonryCol: { flex: 1, gap: 16 },
    gridCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, ...shadows.card },
    gridHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    gridIconWrap: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    gridTitle: { flex: 1, fontSize: 15, ...FONT.bold, color: '#0F172A' },
    gridAddBtn: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    gridBody: { paddingBottom: 4 },
    emptyGridTxt: { fontSize: 13, ...FONT.medium, color: '#94A3B8', fontStyle: 'italic', marginBottom: 10 },

    gridRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    gridDot: { width: 6, height: 6, borderRadius: 3 },
    gridRowTxt: { flex: 1, fontSize: 13, ...FONT.bold, color: '#334155' },
    miniPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    miniPillTxt: { fontSize: 9, ...FONT.heavy, textTransform: 'uppercase' },

    gridChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FEF3C7', flexDirection: 'row', alignItems: 'center' },
    gridChipTxt: { fontSize: 11, ...FONT.bold, color: '#D97706' },

    wellBox: { flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', minWidth: 0 },
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
    netBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1 },
    netBtnTxt: { fontSize: 11, ...FONT.bold },

    // ── Health Tips Modal ────────────────────────────────────────────────────
    tipsBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.55)',
        justifyContent: 'flex-end',
    },
    tipsSheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        maxHeight: '90%',
        paddingBottom: Platform.OS === 'ios' ? 36 : 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -12 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
        elevation: 20,
    },
    tipsHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#E2E8F0',
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 4,
    },
    tipsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.screen,
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
        gap: 16,
    },
    tipsHeaderEyebrow: {
        fontSize: 10,
        ...FONT.heavy,
        color: '#94A3B8',
        letterSpacing: 1.2,
        marginBottom: 4,
    },
    tipsHeaderTitle: {
        fontSize: 22,
        ...FONT.heavy,
        color: '#0F172A',
        letterSpacing: -0.5,
        marginBottom: 4,
    },
    tipsHeaderSub: {
        fontSize: 13,
        ...FONT.medium,
        color: '#64748B',
    },
    tipsMiniRingWrap: {
        width: 60,
        height: 60,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tipsMiniScore: {
        position: 'absolute',
        fontSize: 15,
        ...FONT.heavy,
    },
    tipsScrollContent: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
        gap: 12,
    },
    tipCard: {
        borderRadius: radius.lg,
        borderWidth: 1,
        borderLeftWidth: 4,
        padding: 14,
        marginBottom: 4,
    },
    tipCardTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 8,
    },
    tipIcon: {
        fontSize: 22,
        lineHeight: 26,
    },
    tipTitle: {
        fontSize: 15,
        ...FONT.bold,
        color: '#0F172A',
        flexShrink: 1,
        lineHeight: 21,
    },
    tipImpactBadge: {
        borderWidth: 1,
        borderRadius: radius.md,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: 'flex-start',
        marginTop: 2,
    },
    tipImpactTxt: {
        fontSize: 10,
        ...FONT.heavy,
        letterSpacing: 0.2,
    },
    tipBody: {
        fontSize: 13,
        ...FONT.regular,
        color: '#475569',
        lineHeight: 20,
    },
    tipsEmptyState: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    tipsEmptyTitle: {
        fontSize: 18,
        ...FONT.bold,
        color: '#0F172A',
        marginBottom: 8,
    },
    tipsEmptySub: {
        fontSize: 13,
        ...FONT.medium,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 20,
    },
    tipsFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 8,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
    },
    tipsFooterTxt: {
        fontSize: 11,
        ...FONT.medium,
        color: '#94A3B8',
        flex: 1,
        lineHeight: 16,
    },
    tipsCloseBtn: {
        marginHorizontal: 20,
        marginTop: 12,
        backgroundColor: '#0F172A',
        borderRadius: radius.lg,
        paddingVertical: 16,
        alignItems: 'center',
    },
    tipsCloseTxt: {
        fontSize: 16,
        ...FONT.bold,
        color: '#FFFFFF',
        letterSpacing: 0.2,
    },
    historyLinkBtn: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: radius.sm,
        backgroundColor: '#F3E8FF',
    },
    historyLinkBtnTxt: {
        fontSize: 12,
        ...FONT.bold,
        color: '#A855F7',
    },
    apptRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    apptDoctor: {
        fontSize: 14,
        ...FONT.bold,
        color: '#0F172A',
    },
    apptTitle: {
        fontSize: 13,
        ...FONT.medium,
        color: '#64748B',
        marginTop: 2,
    },
    apptDateText: {
        fontSize: 11,
        ...FONT.semibold,
        color: '#4F46E5',
    },
    apptLocText: {
        fontSize: 11,
        ...FONT.medium,
        color: '#64748B',
    },
    schedBtn: {
        marginTop: 8,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: radius.md,
        backgroundColor: '#EEF2FF',
    },
    schedBtnTxt: {
        fontSize: 13,
        ...FONT.bold,
        color: '#6366F1',
    },
    checklistContainer: {
        marginTop: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#BAE6FD',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    checklistItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        width: '47%',
        marginBottom: 4,
    },
    checklistEmptyCircle: {
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 1.5,
        borderColor: '#94A3B8',
    },
    checklistText: {
        fontSize: 11,
        ...FONT.medium,
        color: '#64748B',
    },
    checklistTextCompleted: {
        color: '#0F172A',
        ...FONT.semibold,
    },
    premiumBannerCard: {
        borderRadius: radius.lg,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: '#FECDD3',
        ...shadows.lg,
    },
    premiumBadgeWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#FFE4E6',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    premiumBannerTitle: {
        fontSize: 20,
        ...FONT.bold,
        color: '#9F1239',
        textAlign: 'center',
        marginBottom: 12,
    },
    premiumBannerBody: {
        fontSize: 14,
        ...FONT.medium,
        color: '#E11D48',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 16,
    },
    premiumDivider: {
        height: 1,
        width: '100%',
        backgroundColor: '#FDA4AF',
        marginVertical: 12,
    },
    premiumBannerPitch: {
        fontSize: 13,
        ...FONT.semibold,
        color: '#BE123C',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
    },
    premiumCtaBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#E11D48',
        borderRadius: radius.lg,
        paddingVertical: 14,
        paddingHorizontal: 28,
        width: '100%',
        ...shadows.md,
    },
    premiumCtaBtnTxt: {
        color: '#FFFFFF',
        fontSize: 15,
        ...FONT.bold,
    },
});
