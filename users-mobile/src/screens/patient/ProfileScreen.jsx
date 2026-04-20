import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View, Text, StyleSheet, ScrollView, Platform, Pressable, Modal,
    TextInput, Alert, Switch, Animated, StatusBar, FlatList, KeyboardAvoidingView,
} from 'react-native';
import {
    Bell, Settings, LogOut, ChevronRight, ChevronDown, UserRound, Phone, X, Save,
    ShieldCheck, Star, MapPin, ClipboardList, FileText, FlaskConical,
    Wallet, CreditCard, Receipt, Heart, Users, BellRing, Clock, Globe,
    Shield, Droplets, Calendar, User2, Trash2, ShieldCheck as ShieldCheckIcon, Smartphone,
    Mail
} from 'lucide-react-native';
import { colors } from '../../theme';
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

export default function PatientProfileScreen({ navigation }) {
    const { signOut, displayName, userEmail } = useAuth();
    const [patient, setPatient] = useState(null);
    const [loading, setLoading] = useState(true);
    const [mfaEnabled, setMfaEnabled] = useState(false);

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
            Alert.alert('Success', 'Emergency contact removed.');
        } catch { Alert.alert('Error', 'Failed to remove emergency contact.'); }
        finally { setSaving(false); }
    };

    const handleSaveEC = async () => {
        if (ecPhone) {
            const phoneErr = validatePhone(ecPhone, ecPhoneCode);
            if (phoneErr) { Alert.alert('Invalid Phone', phoneErr); return; }
        }
        setSaving(true);
        const fullEcPhone = ecPhone ? `${ecPhoneCode}${ecPhone.replace(/[^0-9]/g, '')}` : '';
        try {
            await apiService.patients.updateEmergencyContact({ name: ecName, phone: fullEcPhone, relation: ecRelation });
            setPatient(prev => ({ ...prev, emergency_contact: { name: ecName, phone: fullEcPhone, relation: ecRelation } }));
            setEcModalVisible(false);
            Alert.alert('Success', 'Emergency contact updated.');
        } catch { Alert.alert('Error', 'Failed to update emergency contact.'); }
        finally { setSaving(false); }
    };

    const handleSaveAccount = async () => {
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
                Alert.alert('Slow Connection', 'The server is waking up. Your changes were saved locally — please try again in a few seconds.');
            } else {
                Alert.alert('Error', 'Failed to update profile.');
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
                        Alert.alert(
                            'Notifications Blocked',
                            'You previously denied notification permissions. Please enable them in your device Settings to receive health reminders.',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Open Settings', onPress: () => Linking.openSettings() },
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
        if (phoneErr) { Alert.alert('Invalid Phone', phoneErr); return; }
        const fullPhone = `${editPhoneCode}${editPhone.replace(/[^0-9]/g, '')}`;
        setSaving(true);
        try {
            await apiService.patients.updateMe({ phone: fullPhone });
            setPatient(prev => ({ ...prev, phone: fullPhone }));
            setPhoneModalVisible(false);
            Alert.alert('Success', 'Phone number updated.');
        } catch { Alert.alert('Error', 'Failed to update phone number.'); }
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
        } catch { Alert.alert('Error', 'Failed to update gender.'); }
    };

    const handleSelectBlood = async (b) => {
        try {
            await apiService.patients.updateMe({ blood_type: b });
            setPatient(prev => ({ ...prev, blood_type: b }));
            setBloodModalVisible(false);
        } catch { Alert.alert('Error', 'Failed to update blood group.'); }
    };

    const handleSaveDob = async () => {
        setSaving(true);
        try {
            const dateStr = `${dobYear}-${String(dobMonth).padStart(2, '0')}-${String(dobDay).padStart(2, '0')}`;
            await apiService.patients.updateMe({ date_of_birth: dateStr });
            setPatient(prev => ({ ...prev, date_of_birth: dateStr }));
            setDobModalVisible(false);
            Alert.alert('Success', 'Date of birth updated.');
        } catch { Alert.alert('Error', 'Failed to update date of birth.'); }
        finally { setSaving(false); }
    };

    const handleSelectLanguage = async (langCode) => {
        setSelectedLang(langCode);
        setLanguageModalVisible(false);
        try {
            await apiService.patients.updateMe({ language: langCode });
            const langName = LANGUAGES.find(l => l.code === langCode)?.label || langCode;
            Alert.alert('Language Updated', `App language set to ${langName}.`);
        } catch { Alert.alert('Error', 'Failed to save language preference.'); }
    };

    const handleAddAddress = async () => {
        if (!addrLine.trim()) { Alert.alert('Error', 'Please enter an address.'); return; }
        setSaving(true);
        try {
            const { data } = await apiService.patients.addSavedAddress({
                label: addrLabel, address_line: addrLine, city: addrCity, state: addrState, postcode: addrPostcode,
            });
            setSavedAddresses(data.saved_addresses || []);
            setAddAddressModalVisible(false);
            setAddrLine(''); setAddrCity(''); setAddrState(''); setAddrPostcode('');
            Alert.alert('Success', 'Address saved.');
        } catch { Alert.alert('Error', 'Failed to save address.'); }
        finally { setSaving(false); }
    };

    const handleDeleteAddress = async (id) => {
        try {
            const { data } = await apiService.patients.deleteSavedAddress(id);
            setSavedAddresses(data.saved_addresses || []);
        } catch { Alert.alert('Error', 'Failed to delete address.'); }
    };

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) { Alert.alert('Error', 'Please fill all fields.'); return; }
        if (newPassword !== confirmPassword) { Alert.alert('Error', 'Passwords do not match.'); return; }
        setSavingCp(true);
        try {
            await apiService.auth.changePassword({ currentPassword, newPassword });
            setCpModalVisible(false);
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
            Alert.alert('Success', 'Password changed. Please log back in.');
            signOut();
        } catch (err) { Alert.alert('Error', err?.message || 'Failed to change password.'); }
        finally { setSavingCp(false); }
    };

    const handleSetPassword = async () => {
        if (!setPassNew || !setPassConfirm) { Alert.alert('Error', 'Please fill all fields.'); return; }
        if (setPassNew.length < 8) { Alert.alert('Error', 'Password must be at least 8 characters.'); return; }
        if (!/[A-Z]/.test(setPassNew)) { Alert.alert('Error', 'Password must contain an uppercase letter.'); return; }
        if (!/[0-9]/.test(setPassNew)) { Alert.alert('Error', 'Password must contain a number.'); return; }
        if (setPassNew !== setPassConfirm) { Alert.alert('Error', 'Passwords do not match.'); return; }
        setSavingSetPass(true);
        try {
            await apiService.auth.setPassword(setPassNew);
            setSetPassModalVisible(false);
            setSetPassNew(''); setSetPassConfirm('');
            Alert.alert('Success', 'Password set! Please log in again with your new password.', [
                { text: 'OK', onPress: () => signOut() }
            ]);
        } catch (err) {
            const msg = err?.response?.data?.error || err?.message || 'Failed to set password.';
            Alert.alert('Error', msg);
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
            Alert.alert('Error', err.response?.data?.error || 'Failed to request OTP. Please try again later.');
        }
    };

    const handleVerifyScreenshotOTP = async () => {
        if (!screenshotOTP || screenshotOTP.length !== 6) {
            Alert.alert('Invalid', 'Please enter a valid 6-digit OTP.');
            return;
        }
        setVerifyingScreenshotOTP(true);
        try {
            const res = await apiService.patients.verifyScreenshotOTP({ otp: screenshotOTP, allow: pendingScreenshotSetting });
            usePatientStore.getState().setPatient(res.data.patient);
            setPatient(res.data.patient);
            setScreenshotOTPModalVisible(false);
            Alert.alert('Security Updated', res.data.message);
        } catch (err) {
            Alert.alert('Verification Failed', err.response?.data?.error || 'Invalid or expired OTP.');
        } finally {
            setVerifyingScreenshotOTP(false);
        }
    };

    const anim = (i) => ({
        opacity: staggerAnims[i],
        transform: [{ translateY: staggerAnims[i].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
    });

    /* ── RENDER ───────────────────────────────── */
    return (
        <View style={s.container}>
            <StatusBar barStyle="dark-content" />

            {/* ── Header ── */}
            <View style={{ zIndex: 10, elevation: 10 }}>
                <Animated.View style={[s.header, { opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
                    <View style={s.headerRow}>
                        <View style={s.headerLeft}>
                            <Text style={s.heroLabel}>CARE RECORD</Text>
                            <Text style={s.headerTitle}>My Profile</Text>
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
                                <Text style={s.profileEmail}>{userEmail || 'patient@samvaya.com'}</Text>
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {/* ── Samvaya Plan Banner (Upgrade hidden) ── */}
                <Animated.View style={anim(2)}>
                    <Text style={s.sectionTitle}>SAMVAYA PLAN</Text>
                    <Pressable style={s.premiumCard} onPress={() => navigation.navigate('SubscribePlans')}>
                        <View style={s.premiumLeft}>
                            <View style={s.starBadge}><Star size={18} color="#FFF" fill="#FFF" /></View>
                            <View style={{ flexShrink: 1 }}>
                                <Text style={s.premiumPlan}>{planLabel}</Text>
                                <Text style={s.premiumSub}>Your active care plan</Text>
                            </View>
                        </View>
                        <View style={[s.premiumBtn, { backgroundColor: planBg }]}>
                            <Text style={[s.premiumBtnTxt, { color: planColor }]}>Active</Text>
                        </View>
                    </Pressable>
                </Animated.View>

                {/* ── Personal Information ── */}
                <Animated.View style={anim(3)}>
                    <Text style={s.sectionTitle}>PERSONAL INFORMATION</Text>
                    <View style={s.card}>
                        <InfoRow icon={User2} iconBg="#EFF6FF" iconColor="#3B82F6" label="Full Name" value={patient?.name || displayName} placeholder="Add Name" onPress={() => { setEditName(patient?.name || ''); setEditAccountModalVisible(true); }} />
                        <InfoRow icon={Phone} iconBg="#F0FDF4" iconColor="#22C55E" label="Phone Number" value={patient?.phone} placeholder="Add Phone" onPress={() => { const p = parsePhoneWithCode(patient?.phone || ''); setEditPhoneCode(p.code); setEditPhone(p.number); setPhoneModalVisible(true); }}
                            rightElement={patient?.phone ? <View style={s.verifiedBadge}><ShieldCheck size={16} color={C.success} /></View> : <ChevronRight size={18} color={C.light} />}
                        />
                        <InfoRow icon={Mail} iconBg="#EFF6FF" iconColor="#6366F1" label="Email Address" value={userEmail} placeholder="Add Email" onPress={() => Alert.alert('Email Locked', 'Your email is linked to your login credentials and cannot be changed. Contact support if you need assistance.')} rightElement={<View style={s.verifiedBadge}><LockIcon size={14} color={C.muted} /></View>} />
                        <InfoRow icon={Calendar} iconBg="#EFF6FF" iconColor="#3B82F6" label="Date of Birth" value={dobStr} placeholder="Add DOB" onPress={() => setDobModalVisible(true)} />
                        <InfoRow icon={Users} iconBg="#EEF2FF" iconColor="#6366F1" label="Gender" value={genderStr} placeholder="Not specified" onPress={() => setGenderModalVisible(true)} />
                        <InfoRow icon={Droplets} iconBg="#FFF1F2" iconColor="#EF4444" label="Blood Group" value={bloodStr} placeholder="Add Blood Group" onPress={() => setBloodModalVisible(true)} />
                        <InfoRow icon={Heart} iconBg="#F5F3FF" iconColor="#8B5CF6" label="Emergency Contact" value={ecStr} placeholder="Add Emergency Contact" onPress={() => setEcModalVisible(true)} isLast />
                    </View>
                </Animated.View>

                {/* ── Saved Addresses ── */}
                <Animated.View style={anim(4)}>
                    <Text style={s.sectionTitle}>SAVED ADDRESSES</Text>
                    <View style={s.card}>
                        <InfoRow icon={MapPin} iconBg="#EFF6FF" iconColor="#3B82F6" label="Manage Addresses" value={savedAddresses.length ? `${savedAddresses.length} saved` : null} placeholder="Add your addresses" onPress={() => setAddressModalVisible(true)} isLast />
                    </View>
                </Animated.View>

                {/* ── Care & Records ── */}
                <Animated.View style={anim(5)}>
                    <Text style={s.sectionTitle}>CARE & RECORDS</Text>
                    <View style={s.card}>
                        <InfoRow icon={ClipboardList} iconBg="#EFF6FF" iconColor="#3B82F6" label="Care Logs" value="Track your care interactions" placeholder="" onPress={() => navigation.navigate('MyCaller')} />
                        <InfoRow icon={FileText} iconBg="#F0FDF4" iconColor="#22C55E" label="My Medications" value="View active prescriptions" placeholder="" onPress={() => navigation.navigate('Medications')} />
                        <InfoRow icon={FlaskConical} iconBg="#FFF7ED" iconColor="#F97316" label="Vitals & Lab Reports" value="Digital storage for test results" placeholder="" onPress={() => navigation.navigate('HealthProfile')} isLast />
                    </View>
                </Animated.View>

                {/* ── Health Information ── */}
                <Animated.View style={anim(6)}>
                    <Text style={s.sectionTitle}>HEALTH INFORMATION</Text>
                    <View style={s.card}>
                        <InfoRow icon={Heart} iconBg="#FFF1F2" iconColor="#EF4444" label="My Medical Records" value="Allergies, chronic diseases, etc." placeholder="" onPress={() => navigation.navigate('HealthProfile')} />
                        <InfoRow icon={Users} iconBg="#EEF2FF" iconColor="#6366F1" label="Family Profiles" value="Manage health records of your family" placeholder="" onPress={() => setFamilyModalVisible(true)} isLast />
                    </View>
                </Animated.View>

                {/* ── Notifications & Preferences ── */}
                <Animated.View style={anim(7)}>
                    <Text style={s.sectionTitle}>NOTIFICATIONS & PREFERENCES</Text>
                    <View style={s.card}>
                        <View style={[s.infoRow]}>
                            <View style={[s.iconBox, { backgroundColor: '#F5F3FF' }]}>
                                <BellRing size={20} color="#8B5CF6" strokeWidth={2} />
                            </View>
                            <View style={s.infoTextCol}>
                                <Text style={s.infoLabel}>Push Notifications</Text>
                                <Text style={[s.infoValue, { color: C.muted }]}>{pushEnabled ? 'Enabled' : 'Disabled'}</Text>
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
                                <Text style={s.infoLabel}>Medicine Reminders</Text>
                                <Text style={[s.infoValue, { color: C.muted }]}>{medReminders ? 'On' : 'Off'}</Text>
                            </View>
                            <Switch
                                trackColor={{ false: '#E2E8F0', true: '#818CF8' }}
                                thumbColor={medReminders ? '#4338CA' : '#F8FAFC'}
                                onValueChange={handleToggleMedReminders}
                                value={medReminders}
                            />
                        </View>
                        <InfoRow icon={Globe} iconBg="#EFF6FF" iconColor="#3B82F6" label="Language" value={LANGUAGES.find(l => l.code === selectedLang)?.label || 'English (India)'} placeholder="" onPress={() => setLanguageModalVisible(true)} />
                        <InfoRow icon={Shield} iconBg="#F0FDF4" iconColor="#16A34A" label="Privacy Policy" value={null} placeholder="Read our policy" onPress={() => WebBrowser.openBrowserAsync('https://samvaya.com/privacy-policy')} isLast />
                    </View>
                </Animated.View>

                {/* ── Account & Security ── */}
                <Animated.View style={anim(8)}>
                    <Text style={s.sectionTitle}>ACCOUNT & SECURITY</Text>
                    <View style={s.card}>
                        <InfoRow icon={UserRound} iconBg="#EFF6FF" iconColor="#3B82F6" label="Account Details" value={null} placeholder="View details" onPress={() => setAccountModalVisible(true)} />
                        {patient?.hasPassword ? (
                            <InfoRow icon={Shield} iconBg="#F5F3FF" iconColor="#8B5CF6" label="Change Password" value={null} placeholder="Update credentials" onPress={() => setCpModalVisible(true)} />
                        ) : (
                            <InfoRow icon={LockIcon} iconBg="#FEF3C7" iconColor="#F59E0B" label="Set Password" value={null} placeholder="For multi-device login" onPress={() => setSetPassModalVisible(true)} />
                        )}

                        {/* §SEC: Allow Screenshots Setting */}
                        <View style={[s.infoRow]}>
                            <View style={[s.iconBox, { backgroundColor: '#F1F5F9' }]}>
                                <Smartphone size={20} color="#475569" strokeWidth={2} />
                            </View>
                            <View style={s.infoTextCol}>
                                <Text style={s.infoLabel}>Allow Screenshots</Text>
                                <Text style={[s.infoValue, { color: C.muted }]}>{patient?.allow_screenshots ? 'Allowed' : 'Blocked (Secure)'}</Text>
                            </View>
                            <Switch
                                trackColor={{ false: '#E2E8F0', true: '#818CF8' }}
                                thumbColor={patient?.allow_screenshots ? '#4338CA' : '#F8FAFC'}
                                onValueChange={handleToggleScreenshots}
                                value={patient?.allow_screenshots || false}
                            />
                        </View>

                        {/* §SEC: Two-Factor Authentication (Audit 2.1-2.4) */}
                        <InfoRow
                            icon={Smartphone}
                            iconBg="#EEF2FF"
                            iconColor="#6366F1"
                            label="Two-Factor Authentication"
                            value={mfaEnabled ? 'Enabled' : 'Disabled'}
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
                                                        if (!pwd) return Alert.alert('Error', 'Password is required.');
                                                        try {
                                                            await apiService.auth.mfaDisable(pwd);
                                                            setMfaEnabled(false);
                                                            Alert.alert('Success', 'MFA has been disabled.');
                                                        } catch (err) {
                                                            Alert.alert('Error', err.response?.data?.error || 'Failed to disable MFA.');
                                                        }
                                                    }
                                                }
                                            ],
                                            'secure-text'
                                        )
                                        : Alert.alert(
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

                        <InfoRow icon={FileText} iconBg="#F0FDF4" iconColor="#16A34A" label="Download My Data" value={null} placeholder="Export your records" onPress={async () => {
                            try {
                                const { data } = await apiService.auth.exportMyData();
                                Alert.alert('Data Export', 'Your data export has been prepared. In production, this will download as a file.');
                            } catch (e) {
                                Alert.alert('Error', 'Failed to export data.');
                            }
                        }} isLast />
                    </View>
                </Animated.View>

                {/* ── Sign Out, Deactivate & Delete ── */}
                <Animated.View style={anim(9)}>
                    <View style={{ marginBottom: 24, paddingHorizontal: 24, gap: 12 }}>
                        <Pressable style={s.logoutBtn} onPress={() => signOut()}>
                            <LogOut size={20} color="#E11D48" strokeWidth={2.5} />
                            <Text style={s.logoutTxt}>Sign Out Account</Text>
                        </Pressable>
                        <Pressable
                            style={[s.logoutBtn, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}
                            onPress={() => Alert.alert(
                                'Deactivate Account',
                                'Your account will be paused and you will be signed out.\n\n• All your health data will be safely preserved\n• You can reactivate anytime by logging in again\n• Your callers and care team won\'t be able to reach you',
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                        text: 'Deactivate', style: 'default', onPress: async () => {
                                            try {
                                                await apiService.auth.deactivateAccount();
                                                Alert.alert('Account Deactivated', 'Your account has been paused. Log in anytime to reactivate.');
                                                signOut();
                                            } catch (e) {
                                                Alert.alert('Error', 'Failed to deactivate account. Please try again.');
                                            }
                                        }
                                    }
                                ]
                            )}
                        >
                            <Shield size={20} color="#D97706" strokeWidth={2.5} />
                            <Text style={[s.logoutTxt, { color: '#D97706' }]}>Deactivate Account</Text>
                        </Pressable>
                        <Pressable
                            style={[s.logoutBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
                            onPress={() => Alert.alert(
                                'Delete Account Permanently',
                                '⚠️ This action CANNOT be undone.\n\nAll your data will be permanently deleted:\n• Health records & vitals\n• Medications & prescriptions\n• Call history & appointments\n• Profile information\n\nYou can create a new account with the same email later, but as a fresh start.',
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                        text: 'Delete Forever', style: 'destructive', onPress: () => {
                                            // Double confirmation for permanent deletion
                                            Alert.alert('Are you absolutely sure?', 'Type DELETE in your mind and confirm. This is irreversible.', [
                                                { text: 'Go Back', style: 'cancel' },
                                                {
                                                    text: 'Yes, Delete Everything', style: 'destructive', onPress: async () => {
                                                        try {
                                                            await apiService.auth.deleteAccount();
                                                            Alert.alert('Account Deleted', 'Your account and all data have been permanently removed.');
                                                            signOut();
                                                        } catch (e) {
                                                            Alert.alert('Error', 'Failed to delete account. Please try again.');
                                                        }
                                                    }
                                                }
                                            ]);
                                        }
                                    }
                                ]
                            )}
                        >
                            <Trash2 size={20} color="#DC2626" strokeWidth={2.5} />
                            <Text style={[s.logoutTxt, { color: '#DC2626' }]}>Delete Account Permanently</Text>
                        </Pressable>
                    </View>
                    <Text style={s.versionTxt}>v1.0.4 • Made with ♥ by Samvaya</Text>
                </Animated.View>
            </ScrollView>

            {/* ════════════════════  MODALS  ════════════════════ */}

            {/* ── Gender Picker ── */}
            <Modal visible={genderModalVisible} animationType="slide" transparent onRequestClose={() => setGenderModalVisible(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Select Gender</Text>
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
                            <Text style={s.modalTitle}>Select Blood Group</Text>
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
            <Modal visible={phoneModalVisible} animationType="slide" transparent onRequestClose={() => setPhoneModalVisible(false)}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={s.modalOverlay}>
                        <View style={[s.modalContent, { padding: 0 }]}>
                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 }}>
                                <View style={s.modalHeader}>
                                    <Text style={s.modalTitle}>Phone Number</Text>
                                    <Pressable onPress={() => setPhoneModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                                </View>
                                <Text style={s.inputLabel}>Phone</Text>
                                <View style={s.phoneInputRow}>
                                    <Pressable style={s.countryCodeBtn} onPress={() => openCountryCodePicker('personal')}>
                                        <Text style={s.countryCodeFlag}>{COUNTRY_CODES.find(c => c.code === editPhoneCode)?.flag || '🌍'}</Text>
                                        <Text style={s.countryCodeTxt}>{editPhoneCode}</Text>
                                        <ChevronDown size={14} color={C.muted} />
                                    </Pressable>
                                    <TextInput style={[s.input, { flex: 1 }]} value={editPhone} onChangeText={(t) => setEditPhone(t.replace(/[^0-9]/g, ''))} placeholder="Phone number" placeholderTextColor="#94A3B8" keyboardType="phone-pad" maxLength={COUNTRY_CODES.find(c => c.code === editPhoneCode)?.maxDigits || 12} />
                                </View>
                                <Pressable style={s.saveBtn} onPress={handleSavePhone} disabled={saving}>
                                    <Save size={18} color="#FFFFFF" />
                                    <Text style={s.saveBtnTxt}>{saving ? 'Saving...' : 'Save Phone'}</Text>
                                </Pressable>
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Emergency Contact ── */}
            <Modal visible={ecModalVisible} animationType="slide" transparent onRequestClose={() => setEcModalVisible(false)}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={s.modalOverlay}>
                        <View style={[s.modalContent, { padding: 0 }]}>
                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 }}>
                                <View style={s.modalHeader}>
                                    <Text style={s.modalTitle}>Emergency Contact</Text>
                                    <Pressable onPress={() => setEcModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                                </View>
                                <Text style={s.inputLabel}>Name</Text>
                                <TextInput style={s.input} value={ecName} onChangeText={setEcName} placeholder="Contact name" placeholderTextColor="#94A3B8" />
                                <Text style={s.inputLabel}>Phone</Text>
                                <View style={s.phoneInputRow}>
                                    <Pressable style={s.countryCodeBtn} onPress={() => openCountryCodePicker('ec')}>
                                        <Text style={s.countryCodeFlag}>{COUNTRY_CODES.find(c => c.code === ecPhoneCode)?.flag || '🌍'}</Text>
                                        <Text style={s.countryCodeTxt}>{ecPhoneCode}</Text>
                                        <ChevronDown size={14} color={C.muted} />
                                    </Pressable>
                                    <TextInput style={[s.input, { flex: 1 }]} value={ecPhone} onChangeText={(t) => setEcPhone(t.replace(/[^0-9]/g, ''))} placeholder="Phone number" placeholderTextColor="#94A3B8" keyboardType="phone-pad" maxLength={COUNTRY_CODES.find(c => c.code === ecPhoneCode)?.maxDigits || 12} />
                                </View>
                                <Text style={s.inputLabel}>Relation</Text>
                                <TextInput style={s.input} value={ecRelation} onChangeText={setEcRelation} placeholder="e.g. Son, Daughter, Spouse" placeholderTextColor="#94A3B8" />
                                <Pressable style={s.saveBtn} onPress={handleSaveEC} disabled={saving}>
                                    <Save size={18} color="#FFFFFF" />
                                    <Text style={s.saveBtnTxt}>{saving ? 'Saving...' : 'Save Contact'}</Text>
                                </Pressable>
                                {patient?.emergency_contact?.name && (
                                    <Pressable style={[s.saveBtn, { backgroundColor: '#FEE2E2', marginTop: 12 }]} onPress={handleRemoveEC} disabled={saving}>
                                        <Trash2 size={18} color="#EF4444" />
                                        <Text style={[s.saveBtnTxt, { color: '#B91C1C' }]}>{saving ? 'Removing...' : 'Remove Contact'}</Text>
                                    </Pressable>
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Account Details ── */}
            <Modal visible={accountModalVisible} animationType="slide" transparent onRequestClose={() => setAccountModalVisible(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Account Details</Text>
                            <Pressable onPress={() => setAccountModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                        </View>
                        <View style={s.detailRow}><Text style={s.detailLabel}>Full Name</Text><Text style={s.detailValue}>{patient?.name || displayName}</Text></View>
                        <View style={s.line} />
                        <View style={s.detailRow}><Text style={s.detailLabel}>Email</Text><Text style={s.detailValue}>{userEmail}</Text></View>
                        <View style={s.line} />
                        <View style={s.detailRow}><Text style={s.detailLabel}>City</Text><Text style={s.detailValue}>{patient?.city || 'Not Provided'}</Text></View>
                        <View style={s.line} />
                        <View style={s.detailRow}><Text style={s.detailLabel}>Plan</Text><Text style={[s.detailValue, { color: planColor }]}>{planLabel}</Text></View>
                        <View style={s.line} />
                        <View style={s.detailRow}><Text style={s.detailLabel}>Member Since</Text><Text style={s.detailValue}>{patient?.created_at ? new Date(patient.created_at).toLocaleDateString() : 'N/A'}</Text></View>
                        <Pressable style={[s.saveBtn, { backgroundColor: '#F1F5F9', marginTop: 24 }]} onPress={() => { setAccountModalVisible(false); setEditAccountModalVisible(true); }}>
                            <Text style={[s.saveBtnTxt, { color: '#475569' }]}>Edit Information</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* ── Edit Account ── */}
            <Modal visible={editAccountModalVisible} animationType="slide" transparent onRequestClose={() => setEditAccountModalVisible(false)}>
                <View style={s.modalOverlay}>
                    <View style={[s.modalContent, { padding: 0 }]}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 }}>
                                <View style={s.modalHeader}>
                                    <Text style={s.modalTitle}>Edit Profile</Text>
                                    <Pressable onPress={() => setEditAccountModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                                </View>
                                <Text style={s.inputLabel}>Full Name</Text>
                                <TextInput style={s.input} value={editName} onChangeText={setEditName} placeholder="Your name" placeholderTextColor="#94A3B8" />
                                <Text style={s.inputLabel}>City</Text>
                                <TextInput style={s.input} value={editCity} onChangeText={setEditCity} placeholder="e.g. Hyderabad" placeholderTextColor="#94A3B8" />
                                <Pressable style={s.saveBtn} onPress={handleSaveAccount} disabled={savingAccount}>
                                    <Save size={18} color="#FFFFFF" />
                                    <Text style={s.saveBtnTxt}>{savingAccount ? 'Saving...' : 'Save Profile'}</Text>
                                </Pressable>
                            </ScrollView>
                        </KeyboardAvoidingView>
                    </View>
                </View>
            </Modal>

            {/* ── Change Password ── */}
            <Modal visible={cpModalVisible} animationType="slide" transparent onRequestClose={() => setCpModalVisible(false)}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={s.modalOverlay}>
                        <View style={[s.modalContent, { padding: 0 }]}>
                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 }}>
                                <View style={s.modalHeader}>
                                    <Text style={s.modalTitle}>Change Password</Text>
                                    <Pressable onPress={() => setCpModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                                </View>
                                <Text style={s.inputLabel}>Current Password</Text>
                                <TextInput style={s.input} value={currentPassword} onChangeText={setCurrentPassword} placeholder="Enter current password" placeholderTextColor="#94A3B8" secureTextEntry />
                                <Text style={s.inputLabel}>New Password</Text>
                                <TextInput style={s.input} value={newPassword} onChangeText={setNewPassword} placeholder="Enter new password" placeholderTextColor="#94A3B8" secureTextEntry />
                                <Text style={s.inputLabel}>Confirm Password</Text>
                                <TextInput style={s.input} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm new password" placeholderTextColor="#94A3B8" secureTextEntry />
                                <Pressable style={s.saveBtn} onPress={handleChangePassword} disabled={savingCp}>
                                    <Save size={18} color="#FFFFFF" />
                                    <Text style={s.saveBtnTxt}>{savingCp ? 'Changing...' : 'Change Password'}</Text>
                                </Pressable>
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Set Password (Google Users) ── */}
            <Modal visible={setPassModalVisible} animationType="slide" transparent onRequestClose={() => setSetPassModalVisible(false)}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={s.modalOverlay}>
                        <View style={[s.modalContent, { padding: 0 }]}>
                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 }}>
                                <View style={s.modalHeader}>
                                    <Text style={s.modalTitle}>Set Password</Text>
                                    <Pressable onPress={() => setSetPassModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                                </View>
                                <Text style={s.inputLabel}>New Password</Text>
                                <TextInput style={s.input} value={setPassNew} onChangeText={setSetPassNew} placeholder="Enter password (min 6 chars)" placeholderTextColor="#94A3B8" secureTextEntry />
                                <Text style={s.inputLabel}>Confirm Password</Text>
                                <TextInput style={s.input} value={setPassConfirm} onChangeText={setSetPassConfirm} placeholder="Confirm new password" placeholderTextColor="#94A3B8" secureTextEntry />
                                <Pressable style={s.saveBtn} onPress={handleSetPassword} disabled={savingSetPass}>
                                    <Save size={18} color="#FFFFFF" />
                                    <Text style={s.saveBtnTxt}>{savingSetPass ? 'Saving...' : 'Set Password'}</Text>
                                </Pressable>
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Screenshots OTP Modal ── */}
            <Modal visible={screenshotOTPModalVisible} animationType="slide" transparent>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={s.modalOverlay}>
                        <View style={[s.modalContent, { padding: 0 }]}>
                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 }}>
                                <View style={s.modalHeader}>
                                    <View>
                                        <Text style={s.modalTitle}>Security Verification</Text>
                                        <Text style={[s.inputLabel, { marginTop: 4, textTransform: 'none' }]}>
                                            Enter the 6-digit code sent to your email to {pendingScreenshotSetting ? 'allow' : 'block'} screenshots.
                                        </Text>
                                    </View>
                                    <Pressable onPress={() => setScreenshotOTPModalVisible(false)} hitSlop={10}>
                                        <X size={24} color="#64748B" />
                                    </Pressable>
                                </View>

                                <TextInput
                                    style={[s.input, { fontSize: 24, letterSpacing: 8, textAlign: 'center', fontWeight: '800' }]}
                                    value={screenshotOTP}
                                    onChangeText={(t) => setScreenshotOTP(t.replace(/[^0-9]/g, ''))}
                                    placeholder="••••••"
                                    placeholderTextColor="#CBD5E1"
                                    keyboardType="number-pad"
                                    maxLength={6}
                                />

                                <Pressable style={[s.saveBtn, { marginTop: 16 }]} onPress={handleVerifyScreenshotOTP} disabled={verifyingScreenshotOTP}>
                                    <ShieldCheck size={18} color="#FFFFFF" />
                                    <Text style={s.saveBtnTxt}>{verifyingScreenshotOTP ? 'Verifying...' : 'Verify & Setup'}</Text>
                                </Pressable>
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>



            {/* ── DOB Picker (Scroll Wheels) ── */}
            <Modal visible={dobModalVisible} animationType="slide" transparent onRequestClose={() => setDobModalVisible(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Date of Birth</Text>
                            <Pressable onPress={() => setDobModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                        </View>
                        <Text style={s.modalSubTxt}>Scroll to select your date of birth.</Text>
                        <View style={s.pickerRow}>
                            {/* Day */}
                            <View style={s.pickerCol}>
                                <Text style={s.pickerLabel}>Day</Text>
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
                                <Text style={s.pickerLabel}>Month</Text>
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
                                <Text style={s.pickerLabel}>Year</Text>
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
                        <Pressable style={s.saveBtn} onPress={handleSaveDob} disabled={saving}>
                            <Save size={18} color="#FFFFFF" />
                            <Text style={s.saveBtnTxt}>{saving ? 'Saving...' : 'Save Date of Birth'}</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* ── Language Selector ── */}
            <Modal visible={languageModalVisible} animationType="slide" transparent onRequestClose={() => setLanguageModalVisible(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Select Language</Text>
                            <Pressable onPress={() => setLanguageModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                        </View>
                        <Text style={s.modalSubTxt}>Choose your preferred language. This will be saved to your profile.</Text>
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
                            <Text style={s.modalTitle}>Saved Addresses</Text>
                            <Pressable onPress={() => setAddressModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                        </View>
                        {savedAddresses.length === 0 ? (
                            <View style={s.emptyState}>
                                <MapPin size={40} color={C.light} />
                                <Text style={s.emptyTitle}>No addresses saved</Text>
                                <Text style={s.emptyDesc}>Add your home, office, or family addresses for quick access.</Text>
                            </View>
                        ) : (
                            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                                {savedAddresses.map((addr, i) => (
                                    <View key={addr._id || i} style={s.addrCard}>
                                        <View style={s.addrCardLeft}>
                                            <View style={[s.iconBox, { backgroundColor: '#EFF6FF' }]}><MapPin size={18} color="#3B82F6" /></View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.addrLabel}>{addr.label || 'Address'}</Text>
                                                <Text style={s.addrLine} numberOfLines={2}>{addr.address_line || [addr.street, addr.city, addr.state].filter(Boolean).join(', ') || 'No details'}</Text>
                                            </View>
                                        </View>
                                        <Pressable onPress={() => Alert.alert('Delete Address?', 'This cannot be undone.', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => handleDeleteAddress(addr._id) }])} hitSlop={8}>
                                            <X size={18} color={C.danger} />
                                        </Pressable>
                                    </View>
                                ))}
                            </ScrollView>
                        )}
                        <Pressable style={s.saveBtn} onPress={() => { setAddressModalVisible(false); setAddAddressModalVisible(true); }}>
                            <MapPin size={18} color="#FFFFFF" />
                            <Text style={s.saveBtnTxt}>Add New Address</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* ── Add Address ── */}
            <Modal visible={addAddressModalVisible} animationType="slide" transparent onRequestClose={() => setAddAddressModalVisible(false)}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={s.modalOverlay}>
                        <View style={[s.modalContent, { padding: 0 }]}>
                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 }}>
                                <View style={s.modalHeader}>
                                    <Text style={s.modalTitle}>Add Address</Text>
                                    <Pressable onPress={() => setAddAddressModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                                </View>
                                <Text style={s.inputLabel}>Label</Text>
                                <View style={s.labelRow}>
                                    {['Home', 'Office', 'Family', 'Other'].map(l => (
                                        <Pressable key={l} style={[s.labelChip, addrLabel === l && s.labelChipActive]} onPress={() => setAddrLabel(l)}>
                                            <Text style={[s.labelChipTxt, addrLabel === l && s.labelChipTxtActive]}>{l}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                                <Text style={s.inputLabel}>Full Address</Text>
                                <TextInput style={s.input} value={addrLine} onChangeText={setAddrLine} placeholder="e.g. 12-4-82, Flat 301, Banjara Hills" placeholderTextColor="#94A3B8" />
                                <View style={s.dobRow}>
                                    <View style={s.dobCol}>
                                        <Text style={s.inputLabel}>City</Text>
                                        <TextInput style={s.input} value={addrCity} onChangeText={setAddrCity} placeholder="City" placeholderTextColor="#94A3B8" />
                                    </View>
                                    <View style={s.dobCol}>
                                        <Text style={s.inputLabel}>State</Text>
                                        <TextInput style={s.input} value={addrState} onChangeText={setAddrState} placeholder="State" placeholderTextColor="#94A3B8" />
                                    </View>
                                </View>
                                <Text style={s.inputLabel}>Postcode</Text>
                                <TextInput style={s.input} value={addrPostcode} onChangeText={setAddrPostcode} placeholder="500034" placeholderTextColor="#94A3B8" keyboardType="number-pad" />
                                <Pressable style={s.saveBtn} onPress={handleAddAddress} disabled={saving}>
                                    <Save size={18} color="#FFFFFF" />
                                    <Text style={s.saveBtnTxt}>{saving ? 'Saving...' : 'Save Address'}</Text>
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
                            <Text style={s.modalTitle}>Family Profiles</Text>
                            <Pressable onPress={() => setFamilyModalVisible(false)} hitSlop={10}><X size={24} color="#64748B" /></Pressable>
                        </View>
                        <View style={s.emptyState}>
                            <Users size={40} color={C.light} />
                            <Text style={s.emptyTitle}>No family profiles yet</Text>
                            <Text style={s.emptyDesc}>Add your family members to share health records and manage their care from one place.</Text>
                        </View>
                        <View style={s.familyFeatures}>
                            <View style={s.featureRow}><ShieldCheck size={16} color={C.success} /><Text style={s.featureTxt}>Share health records with trusted contacts</Text></View>
                            <View style={s.featureRow}><ShieldCheck size={16} color={C.success} /><Text style={s.featureTxt}>Track medications for family members</Text></View>
                            <View style={s.featureRow}><ShieldCheck size={16} color={C.success} /><Text style={s.featureTxt}>Manage appointments in one dashboard</Text></View>
                        </View>
                        <Pressable style={[s.saveBtn, { backgroundColor: C.primarySoft }]} onPress={() => { Alert.alert('Coming Soon', 'This feature will be available in a future update!'); setFamilyModalVisible(false); }}>
                            <Users size={18} color={C.primary} />
                            <Text style={[s.saveBtnTxt, { color: C.primary }]}>Add Family Member</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* ── Country Code Picker ── */}
            <Modal visible={countryCodeModalVisible} animationType="slide" transparent onRequestClose={() => setCountryCodeModalVisible(false)}>
                <Pressable style={s.modalOverlay} onPress={() => setCountryCodeModalVisible(false)}>
                    <Pressable style={[s.modalContent, { maxHeight: '70%', paddingBottom: 0 }]} onPress={(e) => e.stopPropagation()}>
                        <View style={[s.modalHeader, { paddingBottom: 12, marginBottom: 0 }]}>
                            <Text style={s.modalTitle}>Select Country</Text>
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
        </View>
    );
}

/* ════════════════════  STYLES  ════════════════════ */
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.pageBg },

    /* Header */
    header: { paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingHorizontal: 24, paddingBottom: 16, backgroundColor: C.pageBg },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerLeft: { flex: 1 },
    heroLabel: { fontSize: 13, fontWeight: '800', color: C.primary, letterSpacing: 1.5, marginBottom: 4 },
    headerTitle: { fontSize: 32, fontWeight: '800', color: C.dark, letterSpacing: -1 },
    headerBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },

    /* Scroll */
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 110, paddingTop: 8 },

    /* Profile Card */
    profileCard: { backgroundColor: C.white, borderRadius: 24, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: C.border, shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 4 },
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
    premiumCard: { backgroundColor: C.white, borderRadius: 20, padding: 16, marginBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: C.border },
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
    card: { backgroundColor: C.white, borderRadius: 20, marginBottom: 24, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },

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
    input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#0F172A', fontWeight: '600' },
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
