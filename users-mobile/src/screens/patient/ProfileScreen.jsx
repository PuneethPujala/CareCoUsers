import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View, Text, StyleSheet, ScrollView, Platform, Pressable, Modal,
    TextInput, Switch, Animated, StatusBar, FlatList, KeyboardAvoidingView,
} from 'react-native';
import SmartInput from '../../components/ui/SmartInput';
import PremiumFormModal from '../../components/ui/PremiumFormModal';
import {
    Bell, Settings, LogOut, ChevronRight, ChevronDown, UserRound, Phone, X, Save,
    ShieldCheck, Star, MapPin, ClipboardList, FileText, FlaskConical,
    Wallet, CreditCard, Receipt, Heart, Users, BellRing, Clock, Globe,
    Shield, Droplets, Calendar, User2, Trash2, ShieldCheck as ShieldCheckIcon, Smartphone,
    Mail, TrendingUp
} from 'lucide-react-native';
import { colors, layout } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../lib/api';
import { registerForPushNotificationsAsync } from '../../utils/notifications';
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';
import { Lock as LockIcon } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import usePatientStore from '../../store/usePatientStore';

const C = {
    primary: '#6366F1', primarySoft: '#EEF2FF', dark: '#0F172A', mid: '#334155',
    muted: '#94A3B8', light: '#CBD5E1', border: '#F1F5F9', pageBg: '#F8FAFC',
    white: '#FFFFFF', success: '#22C55E', successBg: '#F0FDF4', warning: '#F59E0B',
    warningBg: '#FFFBEB', danger: '#EF4444', dangerBg: '#FFF1F2',
};

const GENDER_OPTIONS = ['male', 'female', 'other', 'prefer_not_to_say'];
const GENDER_LABELS = { male: 'Male', female: 'Female', other: 'Other', prefer_not_to_say: 'Prefer not to say' };
const BLOOD_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'];

import { COUNTRY_CODES, parsePhoneWithCode, validatePhone } from '../../utils/phoneUtils';

import AlertManager from '../../utils/AlertManager';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

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

export default function PatientProfileScreen({ navigation }) {
    const { t } = useTranslation();
    const { signOut, displayName, userEmail } = useAuth();
    const [patient, setPatient] = useState(null);
    const [loading, setLoading] = useState(true);
    const [mfaEnabled, setMfaEnabled] = useState(false);
    const [accountActionLoading, setAccountActionLoading] = useState(false);

    // Modals
    const [ecModalVisible, setEcModalVisible] = useState(false);
    const [accountModalVisible, setAccountModalVisible] = useState(false);
    const [editAccountModalVisible, setEditAccountModalVisible] = useState(false);
    const [cpModalVisible, setCpModalVisible] = useState(false);
    const [notifModalVisible, setNotifModalVisible] = useState(false);
    const [genderModalVisible, setGenderModalVisible] = useState(false);
    const [bloodModalVisible, setBloodModalVisible] = useState(false);
    const [phoneModalVisible, setPhoneModalVisible] = useState(false);
    const [countryCodeModalVisible, setCountryCodeModalVisible] = useState(false);
    const [activePhoneField, setActivePhoneField] = useState('personal'); // 'personal' | 'ec'
    const [dobModalVisible, setDobModalVisible] = useState(false);
    const [languageModalVisible, setLanguageModalVisible] = useState(false);
    const [addressModalVisible, setAddressModalVisible] = useState(false);
    const [familyModalVisible, setFamilyModalVisible] = useState(false);
    const [addAddressModalVisible, setAddAddressModalVisible] = useState(false);
    const [setPassModalVisible, setSetPassModalVisible] = useState(false);

    // Notification Prefs
    const [pushEnabled, setPushEnabled] = useState(true);
    const [medReminders, setMedReminders] = useState(true);

    // EC Form
    const [ecName, setEcName] = useState('');
    const [ecPhone, setEcPhone] = useState('');
    const [ecRelation, setEcRelation] = useState('');
    const [saving, setSaving] = useState(false);

    // Edit Profile Form
    const [editName, setEditName] = useState('');
    const [editCity, setEditCity] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editPhoneCode, setEditPhoneCode] = useState('+91');
    const [ecPhoneCode, setEcPhoneCode] = useState('+91');
    const [savingAccount, setSavingAccount] = useState(false);

    // DOB Form
    const [dobDay, setDobDay] = useState(1);
    const [dobMonth, setDobMonth] = useState(1);
    const [dobYear, setDobYear] = useState(2000);
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
    const YEARS = Array.from({ length: new Date().getFullYear() - 1919 }, (_, i) => new Date().getFullYear() - i);

    // Address Form
    const [addrLabel, setAddrLabel] = useState('Home');
    const [addrLine, setAddrLine] = useState('');
    const [addrCity, setAddrCity] = useState('');
    const [addrState, setAddrState] = useState('');
    const [addrPostcode, setAddrPostcode] = useState('');
    const [savedAddresses, setSavedAddresses] = useState([]);

    // Language
    const [selectedLang, setSelectedLang] = useState('en_IN');
    const [basicPlanModalVisible, setBasicPlanModalVisible] = useState(false);
    const LANGUAGES = [
        { code: 'en_IN', label: 'English (India)' },
        { code: 'hi_IN', label: 'हिन्दी (Hindi)' },
        { code: 'te_IN', label: 'తెలుగు (Telugu)' },
        { code: 'ta_IN', label: 'தமிழ் (Tamil)' },
        { code: 'kn_IN', label: 'ಕನ್ನಡ (Kannada)' },
        { code: 'mr_IN', label: 'मराठी (Marathi)' },
    ];

    // Change Password
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [savingCp, setSavingCp] = useState(false);

    // Set Password (for Google users)
    const [setPassNew, setSetPassNew] = useState('');
    const [setPassConfirm, setSetPassConfirm] = useState('');
    const [savingSetPass, setSavingSetPass] = useState(false);

    // Screenshots OTP
    const [screenshotOTPModalVisible, setScreenshotOTPModalVisible] = useState(false);
    const [screenshotOTP, setScreenshotOTP] = useState('');
    const [verifyingScreenshotOTP, setVerifyingScreenshotOTP] = useState(false);
    const [pendingScreenshotSetting, setPendingScreenshotSetting] = useState(false);

    const staggerAnims = React.useRef([...Array(12)].map(() => new Animated.Value(0))).current;

    const runAnimations = useCallback(() => {
        staggerAnims.forEach(a => a.setValue(0));
        Animated.stagger(60,
            staggerAnims.map(a => Animated.spring(a, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }))
        ).start();
    }, [staggerAnims]);

    const hasAnimated = useRef(false);

    useFocusEffect(
        useCallback(() => {
            (async () => {
                if (!hasAnimated.current) setLoading(true);
                try {
                    const { data } = await apiService.patients.getMe();
                    setPatient(data.patient);
                    if (data.patient?.emergency_contact) {
                        setEcName(data.patient.emergency_contact.name || '');
                        setEcPhone(data.patient.emergency_contact.phone || '');
                        setEcRelation(data.patient.emergency_contact.relation || '');
                    }
                    setEditName(data.patient?.name || displayName || '');
                    setEditCity(data.patient?.city || '');
                    const parsed = parsePhoneWithCode(data.patient?.phone || '');
                    setEditPhoneCode(parsed.code);
                    setEditPhone(parsed.number);
                    if (data.patient?.emergency_contact?.phone) {
                        const ecParsed = parsePhoneWithCode(data.patient.emergency_contact.phone);
                        setEcPhoneCode(ecParsed.code);
                    }
                    setSavedAddresses(data.patient?.saved_addresses || []);
                    if (data.patient?.language) setSelectedLang(data.patient.language);
                    if (data.patient?.date_of_birth) {
                        const d = new Date(data.patient.date_of_birth);
                        setDobDay(String(d.getDate()));
                        setDobMonth(d.getMonth() + 1);
                        setDobYear(d.getFullYear());
                    }
                    if (data.patient?.push_notifications_enabled !== undefined) setPushEnabled(data.patient.push_notifications_enabled);
                    if (data.patient?.medication_reminders_enabled !== undefined) setMedReminders(data.patient.medication_reminders_enabled);

                    // Fetch MFA status
                    try {
                        const mfaRes = await apiService.auth.mfaStatus();
                        setMfaEnabled(mfaRes.data.enabled);
                    } catch (mfaErr) {
                        console.warn('[Profile] Failed to fetch MFA status:', mfaErr.message);
                    }

                    if (!hasAnimated.current) {
                        hasAnimated.current = true;
                        runAnimations();
                    }
                } catch (err) {
                    console.warn('Failed to load profile:', err.message);
                } finally {
                    setLoading(false);
                }
            })();
        }, [runAnimations])
    );

    /* ── Handlers ─────────────────────────────── */
    const handleRemoveEC = async () => {
        setSaving(true);
        try {
            await apiService.patients.updateEmergencyContact({ name: '', phone: '', relation: '' });
            setPatient(prev => ({ ...prev, emergency_contact: {} }));
            setEcName(''); setEcPhone(''); setEcPhoneCode('+91'); setEcRelation('');
            setEcModalVisible(false);
            AlertManager.alert(t('common.success', { defaultValue: 'Success' }), t('profile.ec_removed', { defaultValue: 'Emergency contact removed.' }));
        } catch { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.ec_remove_error', { defaultValue: 'Failed to remove emergency contact.' })); }
        finally { setSaving(false); }
    };

    const handleSaveEC = async () => {
        const nameRegex = /^[a-zA-Z\s'-]+$/;
        if (ecName && !nameRegex.test(ecName)) {
            AlertManager.alert(t('profile.invalid_name', { defaultValue: 'Invalid Name' }), t('profile.name_regex_error', { defaultValue: 'Contact names can only contain letters, spaces, hyphens, and apostrophes.' }));
            return;
        }
        if (ecPhone) {
            const phoneErr = validatePhone(ecPhone, ecPhoneCode);
            if (phoneErr) { AlertManager.alert(t('profile.invalid_phone', { defaultValue: 'Invalid Phone' }), phoneErr); return; }
        }
        setSaving(true);
        const fullEcPhone = ecPhone ? `${ecPhoneCode}${ecPhone.replace(/[^0-9]/g, '')}` : '';
        try {
            await apiService.patients.updateEmergencyContact({ name: ecName, phone: fullEcPhone, relation: ecRelation });
            setPatient(prev => ({ ...prev, emergency_contact: { name: ecName, phone: fullEcPhone, relation: ecRelation } }));
            setEcModalVisible(false);
            AlertManager.alert(t('common.success', { defaultValue: 'Success' }), t('profile.ec_updated', { defaultValue: 'Emergency contact updated.' }));
        } catch { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.ec_update_error', { defaultValue: 'Failed to update emergency contact.' })); }
        finally { setSaving(false); }
    };

    const handleSaveAccount = async () => {
        const nameRegex = /^[a-zA-Z\s'-]+$/;
        if (editName && !nameRegex.test(editName)) {
            AlertManager.alert(t('profile.invalid_name', { defaultValue: 'Invalid Name' }), t('profile.name_regex_error_account', { defaultValue: 'Names can only contain letters, spaces, hyphens, and apostrophes.' }));
            return;
        }
        if (editName && editName.trim().length < 2) {
            AlertManager.alert(t('profile.too_short', { defaultValue: 'Too Short' }), t('profile.name_too_short', { defaultValue: 'Name must be at least 2 characters.' }));
            return;
        }
        setSavingAccount(true);
        // Optimistic update
        setPatient(prev => ({ ...prev, name: editName, city: editCity }));
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 12000);
            const { data } = await apiService.patients.updateMe({ name: editName, city: editCity }, { signal: controller.signal });
            clearTimeout(timeout);
            setPatient(data.patient);
            setEditAccountModalVisible(false);
        } catch (err) {
            if (err?.name === 'AbortError' || err?.code === 'ECONNABORTED') {
                AlertManager.alert(t('profile.slow_connection', { defaultValue: 'Slow Connection' }), t('profile.slow_connection_desc', { defaultValue: 'The server is waking up. Your changes were saved locally — please try again in a few seconds.' }));
            } else {
                AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.profile_update_error', { defaultValue: 'Failed to update profile.' }));
            }
        } finally {
            setSavingAccount(false);
        }
    };

    const handleTogglePush = async (val) => {
        setPushEnabled(val);
        try {
            // Always save the preference first
            await apiService.patients.updateMe({ push_notifications_enabled: val });

            if (val) {
                // Check current permission status
                const { status: existingStatus } = await Notifications.getPermissionsAsync();

                if (existingStatus === 'granted') {
                    // Already granted — just get the token
                    const { token } = await registerForPushNotificationsAsync();
                    if (token) {
                        await apiService.patients.updateMe({ expo_push_token: token });
                    }
                } else {
                    // Try to request permission
                    const { status, canAskAgain } = await Notifications.requestPermissionsAsync();

                    if (status === 'granted') {
                        const { token } = await registerForPushNotificationsAsync();
                        if (token) {
                            await apiService.patients.updateMe({ expo_push_token: token });
                        }
                    } else if (!canAskAgain) {
                        // Permission permanently denied — prompt user to open Settings
                        setPushEnabled(false);
                        await apiService.patients.updateMe({ push_notifications_enabled: false });
                        AlertManager.alert(
                            t('profile.notifications_blocked', { defaultValue: 'Notifications Blocked' }),
                            t('profile.notifications_blocked_desc', { defaultValue: 'You previously denied notification permissions. Please enable them in your device Settings to receive health reminders.' }),
                            [
                                { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
                                { text: t('profile.open_settings', { defaultValue: 'Open Settings' }), onPress: () => Linking.openSettings() },
                            ]
                        );
                    } else {
                        // User dismissed the prompt — revert the toggle
                        setPushEnabled(false);
                        await apiService.patients.updateMe({ push_notifications_enabled: false });
                    }
                }
            } else {
                // Clear the token on the backend when disabling
                await apiService.patients.updateMe({ expo_push_token: '' });
            }
        } catch (err) {
            console.warn('Failed to save push pref:', err.message);
        }
    };

    const handleToggleMedReminders = async (val) => {
        setMedReminders(val);
        try {
            await apiService.patients.updateMe({ medication_reminders_enabled: val });
        } catch (err) {
            console.warn('Failed to save med rem pref:', err.message);
        }
    };

    const handleSavePhone = async () => {
        const phoneErr = validatePhone(editPhone, editPhoneCode);
        if (phoneErr) { AlertManager.alert(t('profile.invalid_phone', { defaultValue: 'Invalid Phone' }), phoneErr); return; }
        const fullPhone = `${editPhoneCode}${editPhone.replace(/[^0-9]/g, '')}`;
        setSaving(true);
        try {
            await apiService.patients.updateMe({ phone: fullPhone });
            setPatient(prev => ({ ...prev, phone: fullPhone }));
            setPhoneModalVisible(false);
            AlertManager.alert(t('common.success', { defaultValue: 'Success' }), t('profile.phone_updated', { defaultValue: 'Phone number updated.' }));
        } catch { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.phone_update_error', { defaultValue: 'Failed to update phone number.' })); }
        finally { setSaving(false); }
    };

    const openCountryCodePicker = (field) => {
        setActivePhoneField(field);
        setCountryCodeModalVisible(true);
    };

    const handleSelectCountryCode = (code) => {
        if (activePhoneField === 'personal') setEditPhoneCode(code);
        else if (activePhoneField === 'ec') setEcPhoneCode(code);
        setCountryCodeModalVisible(false);
    };

    const handleSelectGender = async (g) => {
        try {
            await apiService.patients.updateMe({ gender: g });
            setPatient(prev => ({ ...prev, gender: g }));
            setGenderModalVisible(false);
        } catch { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.gender_update_error', { defaultValue: 'Failed to update gender.' })); }
    };

    const handleSelectBlood = async (b) => {
        try {
            await apiService.patients.updateMe({ blood_type: b });
            setPatient(prev => ({ ...prev, blood_type: b }));
            setBloodModalVisible(false);
        } catch { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.blood_update_error', { defaultValue: 'Failed to update blood group.' })); }
    };

    const handleSaveDob = async () => {
        setSaving(true);
        try {
            const dateStr = `${dobYear}-${String(dobMonth).padStart(2, '0')}-${String(dobDay).padStart(2, '0')}`;
            await apiService.patients.updateMe({ date_of_birth: dateStr });
            setPatient(prev => ({ ...prev, date_of_birth: dateStr }));
            setDobModalVisible(false);
            AlertManager.alert(t('common.success', { defaultValue: 'Success' }), t('profile.dob_updated', { defaultValue: 'Date of birth updated.' }));
        } catch { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.dob_update_error', { defaultValue: 'Failed to update date of birth.' })); }
        finally { setSaving(false); }
    };

    const handleSelectLanguage = async (langCode) => {
        setSelectedLang(langCode);
        setLanguageModalVisible(false);
        i18n.changeLanguage(langCode);
        try {
            await apiService.patients.updateMe({ language: langCode });
            const langName = LANGUAGES.find(l => l.code === langCode)?.label || langCode;
            AlertManager.alert(t('profile.language_updated', { defaultValue: 'Language Updated' }), t('profile.language_set_to', { defaultValue: 'App language set to {{langName}}.', langName }));
        } catch { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.language_update_error', { defaultValue: 'Failed to save language preference.' })); }
    };

    const handleAddAddress = async () => {
        if (!addrLine.trim()) { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.enter_address_error', { defaultValue: 'Please enter an address.' })); return; }
        setSaving(true);
        try {
            const { data } = await apiService.patients.addSavedAddress({
                label: addrLabel, address_line: addrLine, city: addrCity, state: addrState, postcode: addrPostcode,
            });
            setSavedAddresses(data.saved_addresses || []);
            setAddAddressModalVisible(false);
            setAddrLine(''); setAddrCity(''); setAddrState(''); setAddrPostcode('');
            AlertManager.alert(t('common.success', { defaultValue: 'Success' }), t('profile.address_saved', { defaultValue: 'Address saved.' }));
        } catch { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.address_save_error', { defaultValue: 'Failed to save address.' })); }
        finally { setSaving(false); }
    };

    const handleDeleteAddress = async (id) => {
        try {
            const { data } = await apiService.patients.deleteSavedAddress(id);
            setSavedAddresses(data.saved_addresses || []);
        } catch { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.address_delete_error', { defaultValue: 'Failed to delete address.' })); }
    };

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.fill_all_fields', { defaultValue: 'Please fill all fields.' })); return; }
        if (newPassword !== confirmPassword) { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.passwords_do_not_match', { defaultValue: 'Passwords do not match.' })); return; }
        setSavingCp(true);
        try {
            await apiService.auth.changePassword({ currentPassword, newPassword });
            setCpModalVisible(false);
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
            AlertManager.alert(t('common.success', { defaultValue: 'Success' }), t('profile.password_changed', { defaultValue: 'Password changed. Please log back in.' }));
            signOut();
        } catch (err) { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), err?.message || t('profile.password_change_error', { defaultValue: 'Failed to change password.' })); }
        finally { setSavingCp(false); }
    };

    const handleSetPassword = async () => {
        if (!setPassNew || !setPassConfirm) { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.fill_all_fields', { defaultValue: 'Please fill all fields.' })); return; }
        if (setPassNew.length < 8) { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.password_min_length', { defaultValue: 'Password must be at least 8 characters.' })); return; }
        if (!/[A-Z]/.test(setPassNew)) { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.password_uppercase', { defaultValue: 'Password must contain an uppercase letter.' })); return; }
        if (!/[0-9]/.test(setPassNew)) { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.password_number', { defaultValue: 'Password must contain a number.' })); return; }
        if (setPassNew !== setPassConfirm) { AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.passwords_do_not_match', { defaultValue: 'Passwords do not match.' })); return; }
        setSavingSetPass(true);
        try {
            await apiService.auth.setPassword(setPassNew);
            setSetPassModalVisible(false);
            setSetPassNew(''); setSetPassConfirm('');
            AlertManager.alert(t('common.success', { defaultValue: 'Success' }), t('profile.password_set_success', { defaultValue: 'Password set! Please log in again with your new password.' }), [
                { text: t('common.ok', { defaultValue: 'OK' }), onPress: () => signOut() }
            ]);
        } catch (err) {
            const msg = err?.response?.data?.error || err?.message || t('profile.password_set_error', { defaultValue: 'Failed to set password.' });
            AlertManager.alert(t('common.error', { defaultValue: 'Error' }), msg);
        } finally {
            setSavingSetPass(false);
        }
    };

    /* ── Derived ──────────────────────────────── */
    const planLabel = patient?.subscription?.plan === 'explore' ? 'Explore Plan' : patient?.subscription?.plan === 'basic' ? 'Basic Plan' : 'Free Plan';
    const planColor = patient?.subscription?.plan === 'explore' ? '#9333EA' : '#16A34A';
    const planBg = patient?.subscription?.plan === 'explore' ? '#F3E8FF' : '#DCFCE7';
    const dobStr = patient?.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
    const genderStr = patient?.gender ? GENDER_LABELS[patient.gender] || patient.gender : null;
    const bloodStr = patient?.blood_type && patient.blood_type !== 'unknown' ? patient.blood_type : null;
    const ecStr = patient?.emergency_contact?.name ? `${patient.emergency_contact.name} (${patient.emergency_contact.relation})` : null;

    /* ── Reusable Row ─────────────────────────── */
    const InfoRow = ({ icon: Icon, iconBg, iconColor, label, value, placeholder, onPress, rightElement, isLast }) => (
        <Pressable style={[s.infoRow, isLast && { borderBottomWidth: 0 }]} onPress={onPress}>
            <View style={[s.iconBox, { backgroundColor: iconBg }]}>
                <Icon size={20} color={iconColor} strokeWidth={2} />
            </View>
            <View style={s.infoTextCol}>
                <Text style={s.infoLabel}>{label}</Text>
                <Text style={[s.infoValue, !value && { color: C.muted }]} numberOfLines={1}>{value || placeholder}</Text>
            </View>
            {rightElement || <ChevronRight size={18} color={C.light} />}
        </Pressable>
    );

    // Screenshot Handlers
    const handleToggleScreenshots = async (newValue) => {
        try {
            await apiService.patients.requestScreenshotOTP();
            setPendingScreenshotSetting(newValue);
            setScreenshotOTP('');
            setScreenshotOTPModalVisible(true);
        } catch (err) {
            AlertManager.alert(t('common.error', { defaultValue: 'Error' }), err.response?.data?.error || t('profile.request_otp_error', { defaultValue: 'Failed to request OTP. Please try again later.' }));
        }
    };

    const handleVerifyScreenshotOTP = async () => {
        if (!screenshotOTP || screenshotOTP.length !== 6) {
            AlertManager.alert(t('common.invalid', { defaultValue: 'Invalid' }), t('profile.invalid_otp', { defaultValue: 'Please enter a valid 6-digit OTP.' }));
            return;
        }
        setVerifyingScreenshotOTP(true);
        try {
            const res = await apiService.patients.verifyScreenshotOTP({ otp: screenshotOTP, allow: pendingScreenshotSetting });
            usePatientStore.getState().setPatient(res.data.patient);
            setPatient(res.data.patient);
            setScreenshotOTPModalVisible(false);
            AlertManager.alert(t('profile.security_updated', { defaultValue: 'Security Updated' }), res.data.message);
        } catch (err) {
            AlertManager.alert(t('profile.verification_failed', { defaultValue: 'Verification Failed' }), err.response?.data?.error || t('profile.invalid_expired_otp', { defaultValue: 'Invalid or expired OTP.' }));
        } finally {
            setVerifyingScreenshotOTP(false);
        }
    };

    const anim = (i) => ({
        opacity: staggerAnims[i],
        transform: [{ translateY: staggerAnims[i].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
    });

    /* ── RENDER ───────────────────────────────── */
    if (loading) {
        return (
            <View style={[s.container, { padding: 20, paddingTop: Platform.OS === 'android' ? 60 : 40 }]}>
                {/* Header Skeleton */}
                <SkeletonItem width={150} height={28} borderRadius={12} style={{ marginBottom: 24 }} />
                
                {/* Profile Card Skeleton */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24, padding: 16, backgroundColor: '#FFFFFF', borderRadius: 24 }}>
                    <SkeletonItem width={60} height={60} borderRadius={30} style={{ marginRight: 16 }} />
                    <View>
                        <SkeletonItem width={140} height={20} borderRadius={10} style={{ marginBottom: 8 }} />
                        <SkeletonItem width={180} height={16} borderRadius={8} />
                    </View>
                </View>

                {/* Plan Banner Skeleton */}
                <SkeletonItem width="100%" height={80} borderRadius={20} style={{ marginBottom: 24 }} />

                {/* Sections Skeleton */}
                <SkeletonItem width={160} height={16} borderRadius={8} style={{ marginBottom: 12, marginLeft: 8 }} />
                <SkeletonItem width="100%" height={200} borderRadius={24} style={{ marginBottom: 24 }} />
                
                <SkeletonItem width={160} height={16} borderRadius={8} style={{ marginBottom: 12, marginLeft: 8 }} />
                <SkeletonItem width="100%" height={120} borderRadius={24} />
            </View>
        );
    }

    return (
        <View style={s.container}>
            <StatusBar barStyle="dark-content" />

            {/* ── Header ── */}
            <View>
                <Animated.View style={[s.header, { opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
                    <View style={s.headerRow}>
                        <View style={s.headerLeft}>
                            <Text style={s.heroLabel}>{t('profile.care_record_label', { defaultValue: 'CARE RECORD' })}</Text>
                            <Text style={s.headerTitle}>{t('profile.my_profile', { defaultValue: 'My Profile' })}</Text>
                        </View>
                        <Pressable style={s.headerBtn} onPress={() => navigation.navigate('Notifications')}>
                            <Bell size={20} color={C.primary} strokeWidth={2.5} />
                        </Pressable>
                    </View>
                </Animated.View>
            </View>

            <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
                {/* ── Profile Card ── */}
                <Animated.View style={anim(1)}>
                    <View style={s.profileCard}>
                        <View style={s.profileMain}>
                            <View style={s.avatar}>
                                <Text style={s.avatarTxt}>{patient?.name?.charAt(0) || displayName?.charAt(0) || 'U'}</Text>
                                <View style={s.editBadge}><Settings size={12} color="#FFF" /></View>
                            </View>
                            <View style={s.profileInfo}>
                                <Text style={s.profileName}>{patient?.name || displayName || 'User'}</Text>
                                <Text style={s.profileEmail}>{userEmail || 'patient@CareMyMed.com'}</Text>
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {/* ── CareMyMed Plan Banner (Upgrade hidden) ── */}
                <Animated.View style={anim(2)}>
                    <Text style={s.sectionTitle}>{t('profile.caremymed_plan', { defaultValue: 'CareMyMed PLAN' })}</Text>
                    <Pressable style={s.premiumCard} onPress={() => setBasicPlanModalVisible(true)}>
                        <View style={s.premiumLeft}>
                            <View style={s.starBadge}><Star size={18} color="#FFF" fill="#FFF" /></View>
                            <View style={{ flexShrink: 1 }}>
                                <Text style={s.premiumPlan}>{planLabel}</Text>
                                <Text style={s.premiumSub}>{t('profile.active_care_plan', { defaultValue: 'Your active care plan' })}</Text>
                            </View>
                        </View>
                        <View style={[s.premiumBtn, { backgroundColor: planBg }]}>
                            <Text style={[s.premiumBtnTxt, { color: planColor }]}>{t('profile.active', { defaultValue: 'Active' })}</Text>
                        </View>
                    </Pressable>
                </Animated.View>

                {/* ── Personal Information ── */}
                <Animated.View style={anim(3)}>
                    <Text style={s.sectionTitle}>{t('profile.personal_info', { defaultValue: 'PERSONAL INFORMATION' })}</Text>
                    <View style={s.card}>
                        <InfoRow icon={User2} iconBg="#EFF6FF" iconColor="#3B82F6" label={t('profile.full_name', { defaultValue: 'Full Name' })} value={patient?.name || displayName} placeholder={t('profile.add_name', { defaultValue: 'Add Name' })} onPress={() => { setEditName(patient?.name || ''); setEditAccountModalVisible(true); }} />
                        <InfoRow icon={Phone} iconBg="#F0FDF4" iconColor="#22C55E" label={t('profile.phone_number', { defaultValue: 'Phone Number' })} value={patient?.phone} placeholder={t('profile.add_phone', { defaultValue: 'Add Phone' })} onPress={() => { const p = parsePhoneWithCode(patient?.phone || ''); setEditPhoneCode(p.code); setEditPhone(p.number); setPhoneModalVisible(true); }}
                            rightElement={patient?.phone ? <View style={s.verifiedBadge}><ShieldCheck size={16} color={C.success} /></View> : <ChevronRight size={18} color={C.light} />}
                        />
                        <InfoRow icon={Mail} iconBg="#EFF6FF" iconColor="#6366F1" label={t('profile.email_address', { defaultValue: 'Email Address' })} value={userEmail} placeholder={t('profile.add_email', { defaultValue: 'Add Email' })} onPress={() => AlertManager.alert(t('profile.email_locked_title', { defaultValue: 'Email Locked' }), t('profile.email_locked_desc', { defaultValue: 'Your email is linked to your login credentials and cannot be changed. Contact support if you need assistance.' }))} rightElement={<View style={s.verifiedBadge}><LockIcon size={14} color={C.muted} /></View>} />
                        <InfoRow icon={Calendar} iconBg="#EFF6FF" iconColor="#3B82F6" label={t('profile.dob', { defaultValue: 'Date of Birth' })} value={dobStr} placeholder={t('profile.add_dob', { defaultValue: 'Add DOB' })} onPress={() => setDobModalVisible(true)} />
                        <InfoRow icon={Users} iconBg="#EEF2FF" iconColor="#6366F1" label={t('profile.gender', { defaultValue: 'Gender' })} value={genderStr} placeholder={t('profile.not_specified', { defaultValue: 'Not specified' })} onPress={() => setGenderModalVisible(true)} />
                        <InfoRow icon={Droplets} iconBg="#FFF1F2" iconColor="#EF4444" label={t('profile.blood_group', { defaultValue: 'Blood Group' })} value={bloodStr} placeholder={t('profile.add_blood_group', { defaultValue: 'Add Blood Group' })} onPress={() => setBloodModalVisible(true)} />
                        <InfoRow icon={Heart} iconBg="#F5F3FF" iconColor="#8B5CF6" label={t('profile.emergency_contact', { defaultValue: 'Emergency Contact' })} value={ecStr} placeholder={t('profile.add_emergency_contact', { defaultValue: 'Add Emergency Contact' })} onPress={() => setEcModalVisible(true)} isLast />
                    </View>
                </Animated.View>

                {/* ── Saved Addresses ── */}
                <Animated.View style={anim(4)}>
                    <Text style={s.sectionTitle}>{t('profile.saved_addresses', { defaultValue: 'SAVED ADDRESSES' })}</Text>
                    <View style={s.card}>
                        <InfoRow icon={MapPin} iconBg="#EFF6FF" iconColor="#3B82F6" label={t('profile.manage_addresses', { defaultValue: 'Manage Addresses' })} value={savedAddresses.length ? `${savedAddresses.length} ${t('profile.saved', { defaultValue: 'saved' })}` : null} placeholder={t('profile.add_addresses', { defaultValue: 'Add your addresses' })} onPress={() => setAddressModalVisible(true)} isLast />
                    </View>
                </Animated.View>

                {/* ── Care & Records ── */}
                <Animated.View style={anim(5)}>
                    <Text style={s.sectionTitle}>{t('profile.care_records', { defaultValue: 'CARE & RECORDS' })}</Text>
                    <View style={s.card}>
                        <InfoRow icon={ClipboardList} iconBg="#EFF6FF" iconColor="#3B82F6" label={t('profile.care_logs', { defaultValue: 'Care Logs' })} value={t('profile.track_care', { defaultValue: 'Track your care interactions' })} placeholder="" onPress={() => navigation.navigate('MyCaller')} />
                        <InfoRow icon={TrendingUp} iconBg="#F0FDF4" iconColor="#16A34A" label={t('profile.medication_adherence', { defaultValue: 'Medication Adherence' })} value={t('profile.view_consistency', { defaultValue: 'View consistency' })} placeholder="" onPress={() => navigation.navigate('AdherenceDetails')} />
                        <InfoRow icon={FileText} iconBg="#F0FDF4" iconColor="#22C55E" label={t('profile.my_medications', { defaultValue: 'My Medications' })} value={t('profile.view_active_prescriptions', { defaultValue: 'View active prescriptions' })} placeholder="" onPress={() => navigation.navigate('Medications')} />
                        <InfoRow icon={FlaskConical} iconBg="#FFF7ED" iconColor="#F97316" label={t('profile.vitals_lab_reports', { defaultValue: 'Vitals & Lab Reports' })} value={t('profile.digital_storage', { defaultValue: 'Digital storage for test results' })} placeholder="" onPress={() => navigation.navigate('HealthProfile')} isLast />
                    </View>
                </Animated.View>

                {/* ── Health Information ── */}
                <Animated.View style={anim(6)}>
                    <Text style={s.sectionTitle}>{t('profile.health_info', { defaultValue: 'HEALTH INFORMATION' })}</Text>
                    <View style={s.card}>
                        <InfoRow icon={Heart} iconBg="#FFF1F2" iconColor="#EF4444" label={t('profile.my_medical_records', { defaultValue: 'My Medical Records' })} value={t('profile.allergies_chronic', { defaultValue: 'Allergies, chronic diseases, etc.' })} placeholder="" onPress={() => navigation.navigate('HealthProfile')} />
                        <InfoRow icon={Users} iconBg="#EEF2FF" iconColor="#6366F1" label={t('profile.family_profiles', { defaultValue: 'Family Profiles' })} value={t('profile.manage_health_records', { defaultValue: 'Manage health records of your family' })} placeholder="" onPress={() => setFamilyModalVisible(true)} isLast />
                    </View>
                </Animated.View>

                {/* ── Notifications & Preferences ── */}
                <Animated.View style={anim(7)}>
                    <Text style={s.sectionTitle}>{t('profile.notifications', { defaultValue: 'NOTIFICATIONS & PREFERENCES' })}</Text>
                    <View style={s.card}>
                        <View style={[s.infoRow]}>
                            <View style={[s.iconBox, { backgroundColor: '#F5F3FF' }]}>
                                <BellRing size={20} color="#8B5CF6" strokeWidth={2} />
                            </View>
                            <View style={s.infoTextCol}>
                                <Text style={s.infoLabel}>{t('profile.push_notifications', { defaultValue: 'Push Notifications' })}</Text>
                                <Text style={[s.infoValue, { color: C.muted }]}>{pushEnabled ? t('profile.enabled', { defaultValue: 'Enabled' }) : t('profile.disabled', { defaultValue: 'Disabled' })}</Text>
                            </View>
                            <Switch
                                trackColor={{ false: '#E2E8F0', true: '#818CF8' }}
                                thumbColor={pushEnabled ? '#4338CA' : '#F8FAFC'}
                                onValueChange={handleTogglePush}
                                value={pushEnabled}
                            />
                        </View>
                        <View style={[s.infoRow]}>
                            <View style={[s.iconBox, { backgroundColor: '#FFF7ED' }]}>
                                <Clock size={20} color="#F97316" strokeWidth={2} />
                            </View>
                            <View style={s.infoTextCol}>
                                <Text style={s.infoLabel}>{t('profile.medicine_reminders', { defaultValue: 'Medicine Reminders' })}</Text>
                                <Text style={[s.infoValue, { color: C.muted }]}>{medReminders ? t('common.on', { defaultValue: 'On' }) : t('common.off', { defaultValue: 'Off' })}</Text>
                            </View>
                            <Switch
                                trackColor={{ false: '#E2E8F0', true: '#818CF8' }}
                                thumbColor={medReminders ? '#4338CA' : '#F8FAFC'}
                                onValueChange={handleToggleMedReminders}
                                value={medReminders}
                            />
                        </View>
                        <InfoRow icon={Globe} iconBg="#EFF6FF" iconColor="#3B82F6" label={t('profile.language', { defaultValue: 'Language' })} value={LANGUAGES.find(l => l.code === selectedLang)?.label || 'English (India)'} placeholder="" onPress={() => setLanguageModalVisible(true)} />
                        <InfoRow icon={Shield} iconBg="#F0FDF4" iconColor="#16A34A" label={t('profile.privacy_policy', { defaultValue: 'Privacy Policy' })} value={null} placeholder={t('profile.read_policy', { defaultValue: 'Read our policy' })} onPress={() => WebBrowser.openBrowserAsync('https://CareMyMed.com/privacy-policy')} isLast />
                    </View>
                </Animated.View>

                {/* ── Account & Security ── */}
                <Animated.View style={anim(8)}>
                    <Text style={s.sectionTitle}>{t('profile.account_security', { defaultValue: 'ACCOUNT & SECURITY' })}</Text>
                    <View style={s.card}>
                        <InfoRow icon={UserRound} iconBg="#EFF6FF" iconColor="#3B82F6" label={t('profile.account_details', { defaultValue: 'Account Details' })} value={null} placeholder={t('profile.view_details', { defaultValue: 'View details' })} onPress={() => setAccountModalVisible(true)} />
                        {patient?.hasPassword ? (
                            <InfoRow icon={Shield} iconBg="#F5F3FF" iconColor="#8B5CF6" label={t('profile.change_password', { defaultValue: 'Change Password' })} value={null} placeholder={t('profile.update_credentials', { defaultValue: 'Update credentials' })} onPress={() => setCpModalVisible(true)} />
                        ) : (
                            <InfoRow icon={LockIcon} iconBg="#FEF3C7" iconColor="#F59E0B" label={t('profile.set_password', { defaultValue: 'Set Password' })} value={null} placeholder={t('profile.multi_device_login', { defaultValue: 'For multi-device login' })} onPress={() => setSetPassModalVisible(true)} />
                        )}

                        {/* §SEC: Allow Screenshots Setting */}
                        <View style={[s.infoRow]}>
                            <View style={[s.iconBox, { backgroundColor: '#F1F5F9' }]}>
                                <Smartphone size={20} color="#475569" strokeWidth={2} />
                            </View>
                            <View style={s.infoTextCol}>
                                <Text style={s.infoLabel}>{t('profile.allow_screenshots', { defaultValue: 'Allow Screenshots' })}</Text>
                                <Text style={[s.infoValue, { color: C.muted }]}>{patient?.allow_screenshots !== false ? t('profile.allowed', { defaultValue: 'Allowed' }) : t('profile.blocked_secure', { defaultValue: 'Blocked (Secure)' })}</Text>
                            </View>
                            <Switch
                                trackColor={{ false: '#E2E8F0', true: '#818CF8' }}
                                thumbColor={patient?.allow_screenshots !== false ? '#4338CA' : '#F8FAFC'}
                                onValueChange={handleToggleScreenshots}
                                value={patient?.allow_screenshots !== false}
                            />
                        </View>

                        {/* §SEC: Two-Factor Authentication (Audit 2.1-2.4) */}
                        <InfoRow
                            icon={Smartphone}
                            iconBg="#EEF2FF"
                            iconColor="#6366F1"
                            label={t('profile.mfa', { defaultValue: 'Two-Factor Authentication' })}
                            value={mfaEnabled ? t('profile.enabled', { defaultValue: 'Enabled' }) : t('profile.disabled', { defaultValue: 'Disabled' })}
                            placeholder=""
                            onPress={() => {
                                if (mfaEnabled) {
                                    Alert.prompt
                                        ? Alert.prompt(
                                            'Disable MFA',
                                            'Enter your password to confirm disabling Two-Factor Authentication.',
                                            [
                                                { text: 'Cancel', style: 'cancel' },
                                                {
                                                    text: 'Disable',
                                                    style: 'destructive',
                                                    onPress: async (pwd) => {
                                                        if (!pwd) return AlertManager.alert('Error', 'Password is required.');
                                                        try {
                                                            await apiService.auth.mfaDisable(pwd);
                                                            setMfaEnabled(false);
                                                            AlertManager.alert('Success', 'MFA has been disabled.');
                                                        } catch (err) {
                                                            AlertManager.alert('Error', err.response?.data?.error || 'Failed to disable MFA.');
                                                        }
                                                    }
                                                }
                                            ],
                                            'secure-text'
                                        )
                                        : AlertManager.alert(
                                            'Disable MFA',
                                            'To disable Two-Factor Authentication, please go to Change Password first to verify your identity, then return here.',
                                            [{ text: 'OK' }]
                                        );
                                } else {
                                    navigation.navigate('MFASetup');
                                }
                            }}
                            rightElement={
                                mfaEnabled ?
                                    <View style={s.verifiedBadge}><ShieldCheckIcon size={16} color={C.success} /></View> :
                                    <ChevronRight size={18} color={C.light} />
                            }
                        />

                        <InfoRow icon={FileText} iconBg="#F0FDF4" iconColor="#16A34A" label={t('profile.download_my_data', { defaultValue: 'Download My Data' })} value={null} placeholder={t('profile.export_records', { defaultValue: 'Export your records' })} onPress={async () => {
                            try {
                                const { data } = await apiService.auth.exportMyData();
                                AlertManager.alert(t('profile.data_export_title', { defaultValue: 'Data Export' }), t('profile.data_export_desc', { defaultValue: 'Your data export has been prepared. In production, this will download as a file.' }));
                            } catch (e) {
                                AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('profile.data_export_error', { defaultValue: 'Failed to export data.' }));
                            }
                        }} isLast />
                    </View>
                </Animated.View>

                {/* ── Account Actions ── */}
                <Animated.View style={anim(9)}>
                    <Text style={s.sectionTitle}>{t('profile.account_actions', { defaultValue: 'ACCOUNT ACTIONS' })}</Text>
                    <View style={s.card}>
                        <Pressable style={[s.infoRow]} onPress={() => AlertManager.alert(
                            t('profile.sign_out', { defaultValue: 'Sign Out' }),
                            t('profile.sign_out_confirm', { defaultValue: 'Are you sure you want to sign out of your account?' }),
                            [
                                { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
                                { text: t('profile.sign_out', { defaultValue: 'Sign Out' }), style: 'destructive', onPress: () => signOut() }
                            ]
                        )}>
                            <View style={[s.iconBox, { backgroundColor: '#FFF1F2' }]}>
                                <LogOut size={20} color="#E11D48" strokeWidth={2} />
                            </View>
                            <View style={s.infoTextCol}>
                                <Text style={s.infoLabel}>{t('profile.sign_out', { defaultValue: 'Sign Out' })}</Text>
                                <Text style={[s.infoValue, { color: C.muted }]}>{t('profile.sign_out_desc', { defaultValue: 'Log out of your account' })}</Text>
                            </View>
                            <ChevronRight size={18} color={C.light} />
                        </Pressable>
                        <Pressable
                            style={[s.infoRow, accountActionLoading && { opacity: 0.6 }]}
                            disabled={accountActionLoading}
                            onPress={() => AlertManager.alert(
                                t('profile.deactivate', { defaultValue: 'Deactivate Account' }),
                                t('profile.deactivate_desc', { defaultValue: 'Your account will be paused and you will be signed out.\n\n• All your health data will be safely preserved\n• You can reactivate anytime by logging in again\n• Your callers and care team won\'t be able to reach you' }),
                                [
                                    { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
                                    {
                                        text: t('profile.deactivate_btn', { defaultValue: 'Deactivate' }), style: 'default', onPress: async () => {
                                            setAccountActionLoading(true);
                                            try {
                                                await apiService.auth.deactivateAccount();
                                                AlertManager.alert(
                                                    t('profile.deactivated_title', { defaultValue: 'Account Deactivated' }),
                                                    t('profile.deactivated_desc', { defaultValue: 'Your account has been paused. Log in anytime with your credentials to reactivate.' }),
                                                    [{ text: t('common.ok', { defaultValue: 'OK' }), onPress: () => signOut() }],
                                                    { type: 'success' }
                                                );
                                            } catch (e) {
                                                AlertManager.alert(t('common.error', { defaultValue: 'Error' }), e?.response?.data?.error || t('profile.deactivate_error', { defaultValue: 'Failed to deactivate account. Please try again.' }), undefined, { type: 'error' });
                                            } finally {
                                                setAccountActionLoading(false);
                                            }
                                        }
                                    }
                                ]
                            )}
                        >
                            <View style={[s.iconBox, { backgroundColor: '#FFFBEB' }]}>
                                <Shield size={20} color="#D97706" strokeWidth={2} />
                            </View>
                            <View style={s.infoTextCol}>
                                <Text style={s.infoLabel}>{t('profile.deactivate', { defaultValue: 'Deactivate Account' })}</Text>
                                <Text style={[s.infoValue, { color: C.muted }]}>{t('profile.deactivate_sub', { defaultValue: 'Pause your account temporarily' })}</Text>
                            </View>
                            <ChevronRight size={18} color={C.light} />
                        </Pressable>
                        <Pressable
                            style={[s.infoRow, { borderBottomWidth: 0 }, accountActionLoading && { opacity: 0.6 }]}
                            disabled={accountActionLoading}
                            onPress={() => AlertManager.alert(
                                t('profile.delete_account_confirm_title', { defaultValue: 'Permanently Delete Account?' }),
                                t('profile.delete_account_confirm_desc', { defaultValue: '⚠️ IRREVERSIBLE ACTION\n\nAll health records, medications, and profile data will be permanently erased. You will be signed out immediately.\n\nAre you absolutely sure you want to proceed?' }),
                                [
                                    { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
                                    {
                                        text: t('profile.delete_permanently', { defaultValue: 'Yes, Delete Permanently' }), style: 'destructive', onPress: async () => {
                                            setAccountActionLoading(true);
                                            try {
                                                await apiService.auth.deleteAccount();
                                                await signOut();
                                            } catch (e) {
                                                const status = e?.response?.status;
                                                if (status === 401 || status === 403 || status === 404) {
                                                    await signOut();
                                                } else {
                                                    AlertManager.alert(t('common.error', { defaultValue: 'Error' }), e?.response?.data?.error || t('profile.delete_error', { defaultValue: 'Failed to delete account.' }), undefined, { type: 'error' });
                                                    setAccountActionLoading(false);
                                                }
                                            }
                                        }
                                    }
                                ]
                            )}
                        >
                            <View style={[s.iconBox, { backgroundColor: '#FEF2F2' }]}>
                                <Trash2 size={20} color="#DC2626" strokeWidth={2} />
                            </View>
                            <View style={s.infoTextCol}>
                                <Text style={[s.infoLabel, { color: '#DC2626' }]}>{t('profile.delete_account', { defaultValue: 'Delete Account Permanently' })}</Text>
                                <Text style={[s.infoValue, { color: C.muted }]}>{t('profile.delete_account_desc', { defaultValue: 'Erase all data forever' })}</Text>
                            </View>
                            <ChevronRight size={18} color={C.light} />
                        </Pressable>
                    </View>
                    <Text style={s.versionTxt}>v1.0.4 • Made with ♥ by CareMyMed</Text>
                </Animated.View>
            </ScrollView>

            {/* ════════════════════  MODALS  ════════════════════ */}

            {/* ── Gender Picker ── */}
            <Modal visible={genderModalVisible} animationType="slide" transparent onRequestClose={() => setGenderModalVisible(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>{t('profile.select_gender', { defaultValue: 'Select Gender' })}</Text>
                            <Pressable onPress={() => setGenderModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                        </View>
                        {GENDER_OPTIONS.map(g => (
                            <Pressable key={g} style={[s.optionRow, patient?.gender === g && s.optionRowActive]} onPress={() => handleSelectGender(g)}>
                                <Text style={[s.optionTxt, patient?.gender === g && s.optionTxtActive]}>{GENDER_LABELS[g]}</Text>
                                {patient?.gender === g && <ShieldCheck size={18} color={C.primary} />}
                            </Pressable>
                        ))}
                    </View>
                </View>
            </Modal>

            {/* ── Blood Group Picker ── */}
            <Modal visible={bloodModalVisible} animationType="slide" transparent onRequestClose={() => setBloodModalVisible(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>{t('profile.select_blood_group', { defaultValue: 'Select Blood Group' })}</Text>
                            <Pressable onPress={() => setBloodModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                        </View>
                        <View style={s.bloodGrid}>
                            {BLOOD_OPTIONS.filter(b => b !== 'unknown').map(b => (
                                <Pressable key={b} style={[s.bloodChip, patient?.blood_type === b && s.bloodChipActive]} onPress={() => handleSelectBlood(b)}>
                                    <Text style={[s.bloodChipTxt, patient?.blood_type === b && s.bloodChipTxtActive]}>{b}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ── Phone Edit ── */}
            <PremiumFormModal
                visible={phoneModalVisible}
                title={t('profile.phone_number', { defaultValue: 'Phone Number' })}
                onClose={() => setPhoneModalVisible(false)}
                onSave={handleSavePhone}
                saveText={saving ? t('common.saving', { defaultValue: 'Saving...' }) : t('profile.save_phone', { defaultValue: 'Save Phone' })}
                saving={saving}
            >
                <Text style={s.inputLabel}>{t('common.phone', { defaultValue: 'Phone' })}</Text>
                <View style={s.phoneInputRow}>
                    <Pressable style={s.countryCodeBtn} onPress={() => openCountryCodePicker('personal')}>
                        <Text style={s.countryCodeFlag}>{COUNTRY_CODES.find(c => c.code === editPhoneCode)?.flag || '🌍'}</Text>
                        <Text style={s.countryCodeTxt}>{editPhoneCode}</Text>
                        <ChevronDown size={14} color={C.muted} />
                    </Pressable>
                    <SmartInput value={editPhone} onChangeText={(t) => setEditPhone(t.replace(/[^0-9]/g, ''))} placeholder="Phone number" keyboardType="phone-pad" maxLength={COUNTRY_CODES.find(c => c.code === editPhoneCode)?.maxDigits || 12} style={{ flex: 1 }} />
                </View>
            </PremiumFormModal>

            {/* ── Emergency Contact ── */}
            <PremiumFormModal
                visible={ecModalVisible}
                title={t('profile.emergency_contact', { defaultValue: 'Emergency Contact' })}
                onClose={() => setEcModalVisible(false)}
                onSave={handleSaveEC}
                saveText={saving ? t('common.saving', { defaultValue: 'Saving...' }) : t('caller.save_contact', { defaultValue: 'Save Contact' })}
                saving={saving}
            >
                <SmartInput label={t('common.name', { defaultValue: 'Name' })} value={ecName} onChangeText={setEcName} placeholder={t('caller.name_placeholder', { defaultValue: 'Contact name' })} />
                <Text style={s.inputLabel}>{t('common.phone', { defaultValue: 'Phone' })}</Text>
                <View style={s.phoneInputRow}>
                    <Pressable style={s.countryCodeBtn} onPress={() => openCountryCodePicker('ec')}>
                        <Text style={s.countryCodeFlag}>{COUNTRY_CODES.find(c => c.code === ecPhoneCode)?.flag || '🌍'}</Text>
                        <Text style={s.countryCodeTxt}>{ecPhoneCode}</Text>
                        <ChevronDown size={14} color={C.muted} />
                    </Pressable>
                    <SmartInput value={ecPhone} onChangeText={(t) => setEcPhone(t.replace(/[^0-9]/g, ''))} placeholder={t('caller.phone_placeholder', { defaultValue: 'Phone number' })} keyboardType="phone-pad" maxLength={COUNTRY_CODES.find(c => c.code === ecPhoneCode)?.maxDigits || 12} style={{ flex: 1 }} />
                </View>
                <SmartInput label={t('caller.relation', { defaultValue: 'Relation' })} value={ecRelation} onChangeText={setEcRelation} placeholder={t('health_profile.relationship_placeholder', { defaultValue: 'e.g. Son, Daughter, Spouse' })} />
                {patient?.emergency_contact?.name && (
                    <Pressable style={[s.saveBtn, { backgroundColor: '#FEE2E2', marginTop: 12 }]} onPress={handleRemoveEC} disabled={saving}>
                        <Trash2 size={18} color="#EF4444" />
                        <Text style={[s.saveBtnTxt, { color: '#B91C1C' }]}>{saving ? t('profile.removing', { defaultValue: 'Removing...' }) : t('profile.remove_contact', { defaultValue: 'Remove Contact' })}</Text>
                    </Pressable>
                )}
            </PremiumFormModal>

            {/* ── Account Details ── */}
            <Modal visible={accountModalVisible} animationType="slide" transparent onRequestClose={() => setAccountModalVisible(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>{t('profile.account_details', { defaultValue: 'Account Details' })}</Text>
                            <Pressable onPress={() => setAccountModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                        </View>
                        <View style={s.detailRow}><Text style={s.detailLabel}>{t('profile.full_name', { defaultValue: 'Full Name' })}</Text><Text style={s.detailValue}>{patient?.name || displayName}</Text></View>
                        <View style={s.line} />
                        <View style={s.detailRow}><Text style={s.detailLabel}>{t('common.email', { defaultValue: 'Email' })}</Text><Text style={s.detailValue}>{userEmail}</Text></View>
                        <View style={s.line} />
                        <View style={s.detailRow}><Text style={s.detailLabel}>{t('common.city', { defaultValue: 'City' })}</Text><Text style={s.detailValue}>{patient?.city || t('common.not_provided', { defaultValue: 'Not Provided' })}</Text></View>
                        <View style={s.line} />
                        <View style={s.detailRow}><Text style={s.detailLabel}>{t('profile.plan', { defaultValue: 'Plan' })}</Text><Text style={[s.detailValue, { color: planColor }]}>{planLabel}</Text></View>
                        <View style={s.line} />
                        <View style={s.detailRow}><Text style={s.detailLabel}>{t('profile.member_since', { defaultValue: 'Member Since' })}</Text><Text style={s.detailValue}>{patient?.created_at ? new Date(patient.created_at).toLocaleDateString(t('common.locale_date', { defaultValue: 'en-US' })) : 'N/A'}</Text></View>
                        <Pressable style={[s.saveBtn, { backgroundColor: '#F1F5F9', marginTop: 24 }]} onPress={() => { setAccountModalVisible(false); setEditAccountModalVisible(true); }}>
                            <Text style={[s.saveBtnTxt, { color: '#475569' }]}>{t('profile.edit_information', { defaultValue: 'Edit Information' })}</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* ── Edit Account ── */}
            <PremiumFormModal
                visible={editAccountModalVisible}
                title={t('profile.edit_profile', { defaultValue: 'Edit Profile' })}
                onClose={() => setEditAccountModalVisible(false)}
                onSave={handleSaveAccount}
                saveText={savingAccount ? t('common.saving', { defaultValue: 'Saving...' }) : t('profile.save_profile', { defaultValue: 'Save Profile' })}
                saving={savingAccount}
            >
                <SmartInput label={t('profile.full_name', { defaultValue: 'Full Name' })} value={editName} onChangeText={setEditName} placeholder={t('profile.your_name_placeholder', { defaultValue: 'Your name' })} />
                <SmartInput label={t('common.city', { defaultValue: 'City' })} value={editCity} onChangeText={setEditCity} placeholder={t('profile.city_placeholder', { defaultValue: 'e.g. Hyderabad' })} />
            </PremiumFormModal>

            {/* ── Change Password ── */}
            <PremiumFormModal
                visible={cpModalVisible}
                title="Change Password"
                onClose={() => setCpModalVisible(false)}
                onSave={handleChangePassword}
                saveText={savingCp ? t('common.changing', { defaultValue: 'Changing...' }) : t('profile.change_password', { defaultValue: 'Change Password' })}
                saving={savingCp}
            >
                <SmartInput label={t('profile.current_password', { defaultValue: 'Current Password' })} value={currentPassword} onChangeText={setCurrentPassword} placeholder={t('profile.enter_current_password', { defaultValue: 'Enter current password' })} secureTextEntry />
                <SmartInput label={t('profile.new_password', { defaultValue: 'New Password' })} value={newPassword} onChangeText={setNewPassword} placeholder={t('profile.enter_new_password', { defaultValue: 'Enter new password' })} secureTextEntry />
                <SmartInput label={t('profile.confirm_password', { defaultValue: 'Confirm Password' })} value={confirmPassword} onChangeText={setConfirmPassword} placeholder={t('profile.confirm_new_password', { defaultValue: 'Confirm new password' })} secureTextEntry />
            </PremiumFormModal>

            {/* ── Set Password (Google Users) ── */}
            <PremiumFormModal
                visible={setPassModalVisible}
                title={t('profile.set_password', { defaultValue: 'Set Password' })}
                onClose={() => setSetPassModalVisible(false)}
                onSave={handleSetPassword}
                saveText={savingSetPass ? t('common.saving', { defaultValue: 'Saving...' }) : t('profile.set_password', { defaultValue: 'Set Password' })}
                saving={savingSetPass}
            >
                <SmartInput label={t('profile.new_password', { defaultValue: 'New Password' })} value={setPassNew} onChangeText={setSetPassNew} placeholder={t('profile.enter_password_min_6', { defaultValue: 'Enter password (min 6 chars)' })} secureTextEntry />
                <SmartInput label={t('profile.confirm_password', { defaultValue: 'Confirm Password' })} value={setPassConfirm} onChangeText={setSetPassConfirm} placeholder={t('profile.confirm_new_password', { defaultValue: 'Confirm new password' })} secureTextEntry />
            </PremiumFormModal>

            {/* ── Screenshots OTP Modal ── */}
            <PremiumFormModal
                visible={screenshotOTPModalVisible}
                title={t('profile.security_verification', { defaultValue: 'Security Verification' })}
                onClose={() => setScreenshotOTPModalVisible(false)}
                onSave={handleVerifyScreenshotOTP}
                saveText={verifyingScreenshotOTP ? t('common.verifying', { defaultValue: 'Verifying...' }) : t('profile.verify_setup', { defaultValue: 'Verify & Setup' })}
                saving={verifyingScreenshotOTP}
            >
                <Text style={[s.inputLabel, { marginTop: 4, textTransform: 'none' }]}>
                    {pendingScreenshotSetting ? t('profile.screenshot_otp_allow', { defaultValue: 'Enter the 6-digit code sent to your email to allow screenshots.' }) : t('profile.screenshot_otp_block', { defaultValue: 'Enter the 6-digit code sent to your email to block screenshots.' })}
                </Text>

                <SmartInput
                    value={screenshotOTP}
                    onChangeText={(t) => setScreenshotOTP(t.replace(/[^0-9]/g, ''))}
                    placeholder="••••••"
                    keyboardType="number-pad"
                    maxLength={6}
                />
            </PremiumFormModal>



            {/* ── DOB Picker (Scroll Wheels) ── */}
            <PremiumFormModal
                visible={dobModalVisible}
                title={t('profile.dob', { defaultValue: 'Date of Birth' })}
                onClose={() => setDobModalVisible(false)}
                onSave={handleSaveDob}
                saveText={saving ? t('common.saving', { defaultValue: 'Saving...' }) : t('profile.save_dob', { defaultValue: 'Save Date of Birth' })}
                saving={saving}
            >
                <Text style={s.modalSubTxt}>{t('profile.scroll_dob', { defaultValue: 'Scroll to select your date of birth.' })}</Text>
                <View style={s.pickerRow}>
                    {/* Day */}
                    <View style={s.pickerCol}>
                        <Text style={s.pickerLabel}>{t('profile.day', { defaultValue: 'Day' })}</Text>
                        <ScrollView style={s.pickerScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                            {DAYS.map(d => (
                                <Pressable key={d} style={[s.pickerItem, dobDay === d && s.pickerItemActive]} onPress={() => setDobDay(d)}>
                                    <Text style={[s.pickerItemTxt, dobDay === d && s.pickerItemTxtActive]}>{String(d).padStart(2, '0')}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                    {/* Month */}
                    <View style={[s.pickerCol, { flex: 1.2 }]}>
                        <Text style={s.pickerLabel}>{t('profile.month', { defaultValue: 'Month' })}</Text>
                        <ScrollView style={s.pickerScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                            {MONTHS.map((m, i) => (
                                <Pressable key={m} style={[s.pickerItem, dobMonth === i + 1 && s.pickerItemActive]} onPress={() => setDobMonth(i + 1)}>
                                    <Text style={[s.pickerItemTxt, dobMonth === i + 1 && s.pickerItemTxtActive]}>{m}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                    {/* Year */}
                    <View style={s.pickerCol}>
                        <Text style={s.pickerLabel}>{t('profile.year', { defaultValue: 'Year' })}</Text>
                        <ScrollView style={s.pickerScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                            {YEARS.map(y => (
                                <Pressable key={y} style={[s.pickerItem, dobYear === y && s.pickerItemActive]} onPress={() => setDobYear(y)}>
                                    <Text style={[s.pickerItemTxt, dobYear === y && s.pickerItemTxtActive]}>{y}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                </View>
                <View style={s.pickerPreview}>
                    <Text style={s.pickerPreviewTxt}>{String(dobDay).padStart(2, '0')} {MONTHS[dobMonth - 1]} {dobYear}</Text>
                </View>
            </PremiumFormModal>

            {/* ── Language Selector ── */}
            <Modal visible={languageModalVisible} animationType="slide" transparent onRequestClose={() => setLanguageModalVisible(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>{t('profile.select_language', { defaultValue: 'Select Language' })}</Text>
                            <Pressable onPress={() => setLanguageModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                        </View>
                        <Text style={s.modalSubTxt}>{t('profile.language_sub', { defaultValue: 'Choose your preferred language. This will be saved to your profile.' })}</Text>
                        {LANGUAGES.map(lang => (
                            <Pressable key={lang.code} style={[s.optionRow, selectedLang === lang.code && s.optionRowActive]} onPress={() => handleSelectLanguage(lang.code)}>
                                <Text style={[s.optionTxt, selectedLang === lang.code && s.optionTxtActive]}>{lang.label}</Text>
                                {selectedLang === lang.code && <ShieldCheck size={18} color={C.primary} />}
                            </Pressable>
                        ))}
                    </View>
                </View>
            </Modal>

            {/* ── Address Manager ── */}
            <Modal visible={addressModalVisible} animationType="slide" transparent onRequestClose={() => setAddressModalVisible(false)}>
                <View style={s.modalOverlay}>
                    <View style={[s.modalContent, { maxHeight: '90%' }]}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>{t('profile.saved_addresses', { defaultValue: 'Saved Addresses' })}</Text>
                            <Pressable onPress={() => setAddressModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                        </View>
                        {savedAddresses.length === 0 ? (
                            <View style={s.emptyState}>
                                <MapPin size={40} color={C.light} />
                                <Text style={s.emptyTitle}>{t('common.no_addresses_saved', { defaultValue: 'No addresses saved' })}</Text>
                                <Text style={s.emptyDesc}>{t('profile.no_addresses_desc', { defaultValue: 'Add your home, office, or family addresses for quick access.' })}</Text>
                            </View>
                        ) : (
                            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                                {savedAddresses.map((addr, i) => (
                                    <View key={addr._id || i} style={s.addrCard}>
                                        <View style={s.addrCardLeft}>
                                            <View style={[s.iconBox, { backgroundColor: '#EFF6FF' }]}><MapPin size={18} color="#3B82F6" /></View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.addrLabel}>{addr.label || t('profile.address', { defaultValue: 'Address' })}</Text>
                                                <Text style={s.addrLine} numberOfLines={2}>{addr.address_line || [addr.street, addr.city, addr.state].filter(Boolean).join(', ') || t('profile.no_details', { defaultValue: 'No details' })}</Text>
                                            </View>
                                        </View>
                                        <Pressable onPress={() => AlertManager.alert(t('profile.delete_address_title', { defaultValue: 'Delete Address?' }), t('common.cannot_be_undone', { defaultValue: 'This cannot be undone.' }), [{ text: t('common.cancel', { defaultValue: 'Cancel' }) }, { text: t('common.delete', { defaultValue: 'Delete' }), style: 'destructive', onPress: () => handleDeleteAddress(addr._id) }])} hitSlop={8}>
                                            <X size={18} color={C.danger} />
                                        </Pressable>
                                    </View>
                                ))}
                            </ScrollView>
                        )}
                        <Pressable style={s.saveBtn} onPress={() => { setAddressModalVisible(false); setAddAddressModalVisible(true); }}>
                            <MapPin size={18} color="#FFFFFF" />
                            <Text style={s.saveBtnTxt}>{t('profile.add_new_address', { defaultValue: 'Add New Address' })}</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* ── Add Address ── */}
            <Modal visible={addAddressModalVisible} animationType="slide" transparent onRequestClose={() => setAddAddressModalVisible(false)}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <View style={s.modalOverlay}>
                        <View style={[s.modalContent, { padding: 0 }]}>
                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
                                <View style={s.modalHeader}>
                                    <Text style={s.modalTitle}>{t('profile.add_address', { defaultValue: 'Add Address' })}</Text>
                                    <Pressable onPress={() => setAddAddressModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                                </View>
                                <Text style={s.inputLabel}>{t('profile.label', { defaultValue: 'Label' })}</Text>
                                <View style={s.labelRow}>
                                    {[t('profile.home', { defaultValue: 'Home' }), t('profile.office', { defaultValue: 'Office' }), t('profile.family', { defaultValue: 'Family' }), t('profile.other', { defaultValue: 'Other' })].map((l, i) => {
                                        const actualLabels = ['Home', 'Office', 'Family', 'Other'];
                                        const key = actualLabels[i];
                                        return (
                                        <Pressable key={key} style={[s.labelChip, addrLabel === key && s.labelChipActive]} onPress={() => setAddrLabel(key)}>
                                            <Text style={[s.labelChipTxt, addrLabel === key && s.labelChipTxtActive]}>{l}</Text>
                                        </Pressable>
                                    )})}
                                </View>
                                <SmartInput label={t('profile.full_address', { defaultValue: 'Full Address' })} value={addrLine} onChangeText={setAddrLine} placeholder={t('profile.full_address_placeholder', { defaultValue: 'e.g. 12-4-82, Flat 301, Banjara Hills' })} />
                                <View style={s.dobRow}>
                                    <View style={s.dobCol}>
                                        <SmartInput label={t('common.city', { defaultValue: 'City' })} value={addrCity} onChangeText={setAddrCity} placeholder={t('common.city', { defaultValue: 'City' })} />
                                    </View>
                                    <View style={s.dobCol}>
                                        <SmartInput label={t('common.state', { defaultValue: 'State' })} value={addrState} onChangeText={setAddrState} placeholder={t('common.state', { defaultValue: 'State' })} />
                                    </View>
                                </View>
                                <SmartInput label={t('common.postcode', { defaultValue: 'Postcode' })} value={addrPostcode} onChangeText={setAddrPostcode} placeholder="500034" keyboardType="number-pad" />
                                <Pressable style={s.saveBtn} onPress={handleAddAddress} disabled={saving}>
                                    <Save size={18} color="#FFFFFF" />
                                    <Text style={s.saveBtnTxt}>{saving ? t('common.saving', { defaultValue: 'Saving...' }) : t('profile.save_address', { defaultValue: 'Save Address' })}</Text>
                                </Pressable>
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Family Profiles ── */}
            <Modal visible={familyModalVisible} animationType="slide" transparent onRequestClose={() => setFamilyModalVisible(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>{t('profile.family_profiles', { defaultValue: 'Family Profiles' })}</Text>
                            <Pressable onPress={() => setFamilyModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                        </View>
                        <View style={s.emptyState}>
                            <Users size={40} color={C.light} />
                            <Text style={s.emptyTitle}>{t('common.no_family_profiles_yet', { defaultValue: 'No family profiles yet' })}</Text>
                            <Text style={s.emptyDesc}>{t('profile.family_empty_desc', { defaultValue: 'Add your family members to share health records and manage their care from one place.' })}</Text>
                        </View>
                        <View style={s.familyFeatures}>
                            <View style={s.featureRow}><ShieldCheck size={16} color={C.success} /><Text style={s.featureTxt}>{t('profile.family_feature_1', { defaultValue: 'Share health records with trusted contacts' })}</Text></View>
                            <View style={s.featureRow}><ShieldCheck size={16} color={C.success} /><Text style={s.featureTxt}>{t('profile.family_feature_2', { defaultValue: 'Track medications for family members' })}</Text></View>
                            <View style={s.featureRow}><ShieldCheck size={16} color={C.success} /><Text style={s.featureTxt}>{t('profile.family_feature_3', { defaultValue: 'Manage appointments in one dashboard' })}</Text></View>
                        </View>
                        <Pressable style={[s.saveBtn, { backgroundColor: C.primarySoft }]} onPress={() => { AlertManager.alert(t('common.coming_soon', { defaultValue: 'Coming Soon' }), t('profile.feature_future_update', { defaultValue: 'This feature will be available in a future update!' })); setFamilyModalVisible(false); }}>
                            <Users size={18} color={C.primary} />
                            <Text style={[s.saveBtnTxt, { color: C.primary }]}>{t('profile.add_family_member', { defaultValue: 'Add Family Member' })}</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* ── Country Code Picker ── */}
            <Modal visible={countryCodeModalVisible} animationType="slide" transparent onRequestClose={() => setCountryCodeModalVisible(false)}>
                <Pressable style={s.modalOverlay} onPress={() => setCountryCodeModalVisible(false)}>
                    <Pressable style={[s.modalContent, { maxHeight: '70%', paddingBottom: 0 }]} onPress={(e) => e.stopPropagation()}>
                        <View style={[s.modalHeader, { paddingBottom: 12, marginBottom: 0 }]}>
                            <Text style={s.modalTitle}>{t('profile.select_country', { defaultValue: 'Select Country' })}</Text>
                            <Pressable onPress={() => setCountryCodeModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, paddingTop: 12 }}>
                            {COUNTRY_CODES.map(cc => {
                                const isSelected = (activePhoneField === 'personal' ? editPhoneCode : ecPhoneCode) === cc.code;
                                return (
                                    <Pressable key={cc.code} style={[s.optionRow, isSelected && s.optionRowActive]} onPress={() => handleSelectCountryCode(cc.code)}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                            <Text style={{ fontSize: 22 }}>{cc.flag}</Text>
                                            <View>
                                                <Text style={[s.optionTxt, isSelected && s.optionTxtActive]}>{cc.name}</Text>
                                                <Text style={{ fontSize: 13, color: C.muted, fontWeight: '600', marginTop: 2 }}>{cc.code}</Text>
                                            </View>
                                        </View>
                                        {isSelected && <ShieldCheck size={18} color={C.primary} />}
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>
        {/* ── Basic Plan Features Modal ── */}
        <Modal visible={basicPlanModalVisible} animationType="slide" transparent={true}>
            <View style={s.modalOverlay}>
                <View style={s.modalContent}>
                    <View style={s.modalHeader}>
                        <Text style={s.modalTitle}>{t('profile.basic_plan_features', { defaultValue: 'Basic Plan Features' })}</Text>
                        <Pressable onPress={() => setBasicPlanModalVisible(false)} style={s.closeBtn}>
                            <X size={20} color={C.mid} />
                        </Pressable>
                    </View>
                    <Text style={{ fontSize: 16, color: C.mid, marginBottom: 16 }}>{t('profile.basic_plan_desc', { defaultValue: 'Your Basic Plan provides essential care tracking, including:' })}</Text>
                    <View style={{ gap: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <ShieldCheck size={20} color={C.success} />
                            <Text style={{ fontSize: 15, color: C.dark, fontWeight: '500' }}>{t('profile.plan_feature_1', { defaultValue: 'Medication & Vitals Logging' })}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <ShieldCheck size={20} color={C.success} />
                            <Text style={{ fontSize: 15, color: C.dark, fontWeight: '500' }}>{t('profile.plan_feature_2', { defaultValue: 'Care Team Alerts & Notifications' })}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <ShieldCheck size={20} color={C.success} />
                            <Text style={{ fontSize: 15, color: C.dark, fontWeight: '500' }}>{t('profile.plan_feature_3', { defaultValue: 'Basic Health Profile Sharing' })}</Text>
                        </View>
                    </View>
                    <Pressable style={[s.saveBtn, { marginTop: 24 }]} onPress={() => setBasicPlanModalVisible(false)}>
                        <Text style={s.saveBtnTxt}>{t('common.got_it', { defaultValue: 'Got it' })}</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>

        </View>
    );
}

/* ════════════════════  STYLES  ════════════════════ */
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.pageBg },

    /* Header */
    header: { paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingHorizontal: 24, paddingBottom: 16, backgroundColor: C.pageBg, elevation: 0, shadowOpacity: 0 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerLeft: { flex: 1 },
    heroLabel: { fontSize: 13, fontWeight: '800', color: C.primary, letterSpacing: 1.5, marginBottom: 4 },
    headerTitle: { fontSize: 32, fontWeight: '800', color: C.dark, letterSpacing: -1 },
    headerBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#4361EE', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },

    /* Scroll */
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: layout.TAB_BAR_CLEARANCE, paddingTop: 8 },

    /* Profile Card */
    profileCard: { backgroundColor: C.white, borderRadius: 24, padding: 20, marginBottom: 24, shadowColor: '#4361EE', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 4 },
    profileMain: { flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'rgba(99,102,241,0.1)' },
    avatarTxt: { fontSize: 26, fontWeight: '800', color: C.primary },
    editBadge: { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#FFF' },
    profileInfo: { flex: 1, marginLeft: 16 },
    profileName: { fontSize: 20, fontWeight: '800', color: C.dark },
    profileEmail: { fontSize: 13, color: C.muted, marginTop: 3, fontWeight: '500' },

    /* Section Title */
    sectionTitle: { fontSize: 12, fontWeight: '800', color: C.muted, letterSpacing: 1.5, marginBottom: 12, marginLeft: 4, marginTop: 8 },

    /* Premium Card */
    premiumCard: { backgroundColor: C.white, borderRadius: 20, padding: 16, marginBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#4361EE', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
    premiumLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, flexShrink: 1 },
    starBadge: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    premiumPlan: { fontSize: 15, fontWeight: '700', color: C.dark },
    premiumSub: { fontSize: 12, color: C.muted, fontWeight: '500', marginTop: 2 },
    premiumBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, flexShrink: 0, marginLeft: 8 },
    premiumBtnTxt: { fontSize: 13, fontWeight: '800' },

    /* Phone Input with Country Code */
    phoneInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    countryCodeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, minWidth: 100 },
    countryCodeFlag: { fontSize: 20 },
    countryCodeTxt: { fontSize: 15, fontWeight: '700', color: C.dark },

    /* Card Group */
    card: { backgroundColor: C.white, borderRadius: 20, marginBottom: 24, shadowColor: '#4361EE', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3, overflow: 'hidden' },

    /* Info Row */
    infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.border },
    iconBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    infoTextCol: { flex: 1 },
    infoLabel: { fontSize: 15, fontWeight: '700', color: C.dark },
    infoValue: { fontSize: 13, color: C.muted, marginTop: 2, fontWeight: '500' },
    verifiedBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.successBg, alignItems: 'center', justifyContent: 'center' },

    /* Logout */
    logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#FFF1F2', paddingVertical: 18, borderRadius: 100, marginTop: 16, borderWidth: 1.5, borderColor: '#FFE4E6' },
    logoutTxt: { fontSize: 16, fontWeight: '800', color: '#E11D48' },
    versionTxt: { textAlign: 'center', color: C.muted, fontSize: 12, marginTop: 20, fontWeight: '600' },

    /* Modals */
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: C.white, borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 24, paddingBottom: 40, maxHeight: '85%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    modalTitle: { fontSize: 22, fontWeight: '800', color: C.dark },
    modalSubTxt: { fontSize: 14, color: C.muted, marginBottom: 20 },
    inputLabel: { fontSize: 13, fontWeight: '700', color: C.mid, marginBottom: 8, marginTop: 16, marginLeft: 2 },
    input: { backgroundColor: '#FAFBFF', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: '#0F172A', fontWeight: '600', height: 48 },
    saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.primary, borderRadius: 100, paddingVertical: 16, marginTop: 32, shadowColor: C.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
    saveBtnTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

    /* Detail Row */
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 },
    detailLabel: { fontSize: 15, color: C.muted, fontWeight: '500' },
    detailValue: { fontSize: 15, fontWeight: '700', color: C.dark },
    line: { height: 1.5, backgroundColor: C.border, marginVertical: 4 },

    /* Switch Rows */
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
    switchTxtCol: { flex: 1, paddingRight: 16 },
    switchTitle: { fontSize: 16, fontWeight: '700', color: C.dark, marginBottom: 4 },
    switchDesc: { fontSize: 13, color: C.muted, fontWeight: '500', lineHeight: 18 },

    /* Option Rows (Gender) */
    optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 16, borderRadius: 16, marginBottom: 8, backgroundColor: C.pageBg },
    optionRowActive: { backgroundColor: C.primarySoft, borderWidth: 1.5, borderColor: C.primary },
    optionTxt: { fontSize: 16, fontWeight: '600', color: C.mid },
    optionTxtActive: { color: C.primary, fontWeight: '700' },

    /* Blood Grid */
    bloodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
    bloodChip: { width: 72, height: 48, borderRadius: 16, backgroundColor: C.pageBg, alignItems: 'center', justifyContent: 'center' },
    bloodChipActive: { backgroundColor: C.primarySoft, borderWidth: 1.5, borderColor: C.primary },
    bloodChipTxt: { fontSize: 18, fontWeight: '700', color: C.mid },
    bloodChipTxtActive: { color: C.primary },

    /* DOB Scroll Picker */
    pickerRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    pickerCol: { flex: 1 },
    pickerLabel: { fontSize: 13, fontWeight: '700', color: C.muted, letterSpacing: 0.5, marginBottom: 8, textAlign: 'center' },
    pickerScroll: { height: 200, backgroundColor: C.pageBg, borderRadius: 16, borderWidth: 1, borderColor: C.border },
    pickerItem: { paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', borderRadius: 10, marginHorizontal: 4, marginVertical: 2 },
    pickerItemActive: { backgroundColor: C.primary },
    pickerItemTxt: { fontSize: 16, fontWeight: '600', color: C.mid },
    pickerItemTxtActive: { color: '#FFF', fontWeight: '800' },
    pickerPreview: { backgroundColor: C.primarySoft, borderRadius: 16, padding: 14, marginTop: 16, alignItems: 'center' },
    pickerPreviewTxt: { fontSize: 18, fontWeight: '800', color: C.primary, letterSpacing: 0.5 },

    /* Address */
    addrCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: C.pageBg, borderRadius: 16, marginBottom: 10 },
    addrCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
    addrLabel: { fontSize: 14, fontWeight: '700', color: C.dark },
    addrLine: { fontSize: 12, color: C.muted, marginTop: 2, fontWeight: '500' },
    labelRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    labelChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: C.pageBg },
    labelChipActive: { backgroundColor: C.primarySoft, borderWidth: 1.5, borderColor: C.primary },
    labelChipTxt: { fontSize: 14, fontWeight: '600', color: C.mid },
    labelChipTxtActive: { color: C.primary, fontWeight: '700' },

    /* Empty State */
    emptyState: { alignItems: 'center', paddingVertical: 32 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: C.dark, marginTop: 16 },
    emptyDesc: { fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 8, lineHeight: 20, paddingHorizontal: 16 },

    /* Family Features */
    familyFeatures: { marginTop: 8, gap: 12 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    featureTxt: { fontSize: 14, color: C.mid, fontWeight: '500' },
});
