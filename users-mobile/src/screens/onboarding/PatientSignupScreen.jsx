import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, TextInput, Pressable, Platform,
    KeyboardAvoidingView, ScrollView, Animated, ActivityIndicator,
    Modal, Alert, Easing,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    ChevronLeft, X, Search, MapPin, Activity, User, AlertCircle,
    Sparkles, RotateCcw, Heart, ShieldCheck, Check,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { resolveOnboardingStep } from '../../utils/authUtils';
import { apiService } from '../../lib/api';
import { parseError } from '../../utils/parseError';
import analytics from '../../utils/analytics';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as Location from 'expo-location';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { step1Schema, step2Schema, step3Schema, step5Schema } from './signupSchema';

import { OTPModal, UPIPaymentModal } from './components';
import { styles, FONT, C } from './components/SignupStyles';
import Step1Profile from './components/Step1Profile';
import Step2Locality from './components/Step2Locality';
import Step3Membership from './components/Step3Membership';
import Step4Verification from './components/Step4Verification';
import Step5FinalDetails from './components/Step5FinalDetails';

const ONBOARDING_STORAGE_KEY = 'samvaya_onboarding_progress';
const STALE_PROGRESS_DAYS = 7;

const STEP_COUNTS = 5;

export default function PatientSignupScreen({ navigation, route }) {
    const {
        user, profile, patient,
        signUp, signInWithGoogle, completeSignUp, injectSession, signOut,
        sendOtp, verifyOtp, refreshPatient,
    } = useAuth();

    const [step, setStep] = useState(route?.params?.step || 1);

    const methods = useForm({
        resolver: zodResolver(
            step === 1 ? step1Schema :
                step === 2 ? step2Schema :
                    step === 3 ? step3Schema :
                        step5Schema
        ),
        defaultValues: {
            fullName: '', email: '', phoneNumber: '', city: '',
            password: '', confirmPassword: '', age: '', gender: '',
            selectedPlanId: 'basic',
        },
        mode: 'onChange',
    });

    const form = methods.watch();

    const setForm = (newVal) => {
        const valueToSet = typeof newVal === 'function' ? newVal(form) : newVal;
        Object.entries(valueToSet).forEach(([key, value]) => methods.setValue(key, value));
    };

    const setErrors = useCallback((errs) => {
        const currentErrors = {};
        Object.keys(methods.formState.errors).forEach(key => {
            currentErrors[key] = methods.formState.errors[key]?.message || methods.formState.errors[key];
        });
        const e = typeof errs === 'function' ? errs(currentErrors) : errs;
        Object.entries(e).forEach(([key, val]) => {
            if (val) methods.setError(key, { message: val });
            else methods.clearErrors(key);
        });
    }, [methods]);

    const errors = useMemo(() => {
        const e = {};
        Object.keys(methods.formState.errors).forEach(key => {
            e[key] = methods.formState.errors[key]?.message || methods.formState.errors[key];
        });
        return e;
    }, [methods.formState.errors]);

    const [selectedPlan, setSelectedPlan] = useState({ id: 'basic', name: 'Basic Plan', price: '₹500/mo' });

    const [otpVisible, setOtpVisible] = useState(false);
    const [verificationField, setVerificationField] = useState(null);
    const [otp, setOtp] = useState('');
    const [otpAttempts, setOtpAttempts] = useState(0);
    const [resendTimer, setResendTimer] = useState(0);
    const [otpLoading, setOtpLoading] = useState(false);
    const [isEmailVerified, setIsEmailVerified] = useState(false);
    const [isPhoneVerified, setIsPhoneVerified] = useState(false);
    const [remainingSlots, setRemainingSlots] = useState(null);

    const [detectingLocation, setDetectingLocation] = useState(false);
    const [locationAddress, setLocationAddress] = useState('');
    const [availableCities, setAvailableCities] = useState([]);
    const [loadingCities, setLoadingCities] = useState(false);

    const [showPass, setShowPass] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [upiModalVisible, setUpiModalVisible] = useState(false);
    const [signupLoading, setSignupLoading] = useState(false);
    const [featuresModalVisible, setFeaturesModalVisible] = useState(false);
    const [paymentAttempted, setPaymentAttempted] = useState(false);
    const [paymentCrashWarning, setPaymentCrashWarning] = useState(false);
    const [showCelebration, setShowCelebration] = useState(false);

    const mainScrollRef = useRef(null);
    const isSubmittingRef = useRef(false);
    const signupLoadingRef = useRef(false);
    const isPayingRef = useRef(false);
    const abortRef = useRef(null);
    const fullNameRef = useRef(null);
    const emailRef = useRef(null);
    const phoneRef = useRef(null);
    const passwordRef = useRef(null);
    const confirmPassRef = useRef(null);

    const progressSnapshotRef = useRef({});
    useEffect(() => {
        progressSnapshotRef.current = { form, locationAddress, paymentAttempted, selectedPlan };
    });

    const isManualTransitionRef = useRef(false);
    const clearProgressRef = useRef(null);

    // ── Step transition animations ─────────────────────────────────────────────
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const slideAnim = useRef(new Animated.Value(0)).current;
    const syncRotateAnim = useRef(new Animated.Value(0)).current;
    const staggerAnims = useRef([...Array(10)].map(() => new Animated.Value(0))).current;

    const animateIn = useCallback(() => {
        staggerAnims.forEach(a => { a.stopAnimation(); a.setValue(0); });
        fadeAnim.stopAnimation(); fadeAnim.setValue(0);
        slideAnim.stopAnimation(); slideAnim.setValue(18);

        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
            Animated.stagger(60, staggerAnims.map(a =>
                Animated.timing(a, { toValue: 1, duration: 360, useNativeDriver: true })
            )),
        ]).start();
    }, [fadeAnim, slideAnim, staggerAnims]);

    useEffect(() => {
        animateIn();
        if (mainScrollRef.current) mainScrollRef.current.scrollTo({ y: 0, animated: false });
        if (step === 2) fetchCities();
    }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

    // Processing spinner
    useEffect(() => {
        if (signupLoading) {
            const loop = Animated.loop(
                Animated.timing(syncRotateAnim, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })
            );
            loop.start();
            return () => { loop.stop(); syncRotateAnim.setValue(0); };
        }
    }, [signupLoading, syncRotateAnim]);

    // ── AsyncStorage persistence ───────────────────────────────────────────────

    const saveProgress = useCallback(async (currentStep, extraData = {}) => {
        try {
            const { form: f, locationAddress: la, paymentAttempted: pa, selectedPlan: sp } = progressSnapshotRef.current;
            await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({
                step: currentStep, savedAt: Date.now(),
                email: f.email, fullName: f.fullName, city: f.city,
                locationAddress: la,
                paymentAttempted: extraData.paymentAttempted ?? pa,
                selectedPlan: sp, ...extraData,
            }));
        } catch (err) { console.warn('[Onboarding] Failed to save progress:', err.message); }
    }, []);

    const clearProgress = useCallback(async () => {
        try { await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY); } catch { }
    }, []);

    useEffect(() => { clearProgressRef.current = clearProgress; }, [clearProgress]);

    // ── Recovery ───────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!profile && !patient) return;
        const dbName = patient?.name || profile?.fullName;
        const dbEmail = patient?.email || profile?.email;
        const dbPhone = patient?.phone || profile?.phoneNumber;
        const dbCity = patient?.city || profile?.city;
        if (dbName && !form.fullName) {
            setForm(prev => ({
                ...prev, fullName: dbName,
                email: dbEmail || prev.email,
                phoneNumber: dbPhone || prev.phoneNumber,
                city: dbCity || prev.city,
            }));
            if (dbEmail) setIsEmailVerified(true);
            if (dbPhone) setIsPhoneVerified(true);
            if (dbCity) setLocationAddress(dbCity);
        }
        if (isManualTransitionRef.current) { isManualTransitionRef.current = false; return; }
        const isProcessing = signupLoading || googleLoading;
        const targetStep = resolveOnboardingStep(patient, profile);
        if (targetStep === null) { clearProgressRef.current?.(); }
        else if (step !== targetStep && !isProcessing && !isSubmittingRef.current) { setStep(targetStep); }
    }, [profile, patient, signupLoading, googleLoading]);

    useEffect(() => {
        GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, offlineAccess: false });
        return () => { if (abortRef.current) abortRef.current.abort(); };
    }, []);

    // Restore saved progress
    useEffect(() => {
        const loadProgress = async () => {
            try {
                const raw = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
                if (!raw) return;
                const progress = JSON.parse(raw);
                const ageDays = (Date.now() - (progress.savedAt || 0)) / (1000 * 60 * 60 * 24);
                const apply = () => {
                    if (progress.step && progress.step > 1) setStep(progress.step);
                    if (progress.email || progress.fullName) {
                        setForm(prev => ({
                            ...prev,
                            email: progress.email || prev.email,
                            fullName: progress.fullName || prev.fullName,
                            city: progress.city || prev.city,
                        }));
                    }
                    if (progress.locationAddress) setLocationAddress(progress.locationAddress);
                    if (progress.selectedPlan) setSelectedPlan(progress.selectedPlan);
                    if (progress.paymentAttempted && progress.step === 3) {
                        setPaymentAttempted(true); setPaymentCrashWarning(true);
                    }
                };
                if (ageDays > STALE_PROGRESS_DAYS) {
                    Alert.alert(
                        'Resume signup?',
                        `You started signing up ${Math.floor(ageDays)} days ago.`,
                        [
                            { text: 'Start fresh', style: 'destructive', onPress: clearProgress },
                            { text: 'Continue', onPress: apply },
                        ]
                    );
                    return;
                }
                apply();
            } catch (err) { console.warn('[Onboarding] Failed to load progress:', err.message); }
        };
        loadProgress();
    }, [clearProgress]);

    // OTP countdown
    useEffect(() => {
        if (resendTimer <= 0) return;
        const interval = setInterval(() => setResendTimer(prev => prev - 1), 1000);
        return () => clearInterval(interval);
    }, [resendTimer]);

    // ── Fetchers ───────────────────────────────────────────────────────────────

    const fetchCities = useCallback(async () => {
        setLoadingCities(true);
        setErrors(prev => ({ ...prev, location: '' }));
        try {
            const res = await apiService.patients.getCities();
            setAvailableCities(res.data.cities || []);
        } catch (error) {
            console.warn('Failed to fetch cities:', error);
            setErrors(prev => ({ ...prev, location: 'Failed to load cities. Try detecting your location instead.' }));
        } finally { setLoadingCities(false); }
    }, [setErrors]);

    // ── Google Sign Up ─────────────────────────────────────────────────────────

    const handleGooglePress = useCallback(async () => {
        try {
            setTimeout(() => setGoogleLoading(true), 0);
            setErrors({});
            await GoogleSignin.hasPlayServices();
            try { await GoogleSignin.signOut(); } catch { }
            const signInResult = await GoogleSignin.signIn();
            const idToken = signInResult?.data?.idToken;
            if (!idToken) { setErrors({ google: 'Failed to get Google ID token. Please try again.' }); return; }
            await clearProgress();
            const result = await signInWithGoogle(idToken);
            if (result?.isNewUser) {
                const googleUser = result.user;
                const fullName = googleUser.user_metadata?.full_name || googleUser.user_metadata?.name || googleUser.email.split('@')[0];
                try {
                    const regRes = await apiService.auth.register({ email: googleUser.email, fullName, role: 'patient', supabaseUid: googleUser.id });
                    const regProfile = regRes.data?.profile;
                    const regSession = regRes.data?.session;
                    if (regProfile && regSession) await injectSession(regSession, regProfile);
                    else if (regProfile) await injectSession(result.session, regProfile);
                    else { setErrors({ google: 'Registration succeeded but no profile returned.' }); await signOut(); }
                } catch (regError) {
                    const code = regError?.response?.data?.code;
                    const regProfile = regError?.response?.data?.profile;
                    const regSession = regError?.response?.data?.session;
                    if (code === 'EMAIL_ALREADY_EXISTS' && regProfile && regSession) await injectSession(regSession, regProfile);
                    else if (code === 'EMAIL_ALREADY_EXISTS') { setErrors({ google: 'An account with this email already exists. Please log in instead.' }); await signOut(); }
                    else { setErrors({ google: regError?.response?.data?.error || 'Failed to create account' }); await signOut(); }
                }
            }
        } catch (error) {
            try { await GoogleSignin.signOut(); } catch { }
            if (error?.code === statusCodes.SIGN_IN_CANCELLED) { /* user cancelled */ }
            else if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) setErrors({ google: 'Google Play Services not available. Please update.' });
            else setErrors({ google: error?.message || 'Google sign-up failed' });
        } finally { setGoogleLoading(false); }
    }, [signInWithGoogle, injectSession, clearProgress, setErrors]);

    // ── OTP ────────────────────────────────────────────────────────────────────

    const handleVerifyPress = useCallback(async (field) => {
        const e = {};
        const value = field === 'email' ? form.email.trim().toLowerCase() : form.phoneNumber.trim();
        if (field === 'email') {
            if (!value) e.email = 'Email not entered';
            else if (!/\S+@\S+\.\S+/.test(value)) e.email = 'Enter a valid email address';
        } else {
            if (!value) e.phoneNumber = 'Phone number not entered';
            else if (!/^\d{10}$/.test(value)) e.phoneNumber = 'Enter a valid 10-digit number';
        }
        if (Object.keys(e).length > 0) { setErrors(prev => ({ ...prev, ...e })); return; }

        setVerificationField(field);
        setOtpLoading(true);
        try {
            const finalValue = field === 'phone' ? `+91${value}` : value;
            const data = await sendOtp(field, finalValue);
            if (data?.remainingSlots !== undefined) setRemainingSlots(data.remainingSlots);
            else setRemainingSlots(null);
            setOtpVisible(true);
            setResendTimer(60);
            setOtpAttempts(0);
            setOtp('');
        } catch (error) {
            let { general } = parseError(error);
            if (error?.response?.data?.code === 'PHONE_LIMIT_REACHED') general = error.response.data.error;
            else if (error?.response?.data?.error) general = error.response.data.error;
            const errorField = field === 'phone' ? 'phoneNumber' : field;
            setErrors(prev => ({ ...prev, [errorField]: general || `Failed to send OTP to ${field}` }));
        } finally { setOtpLoading(false); }
    }, [form.email, form.phoneNumber, sendOtp, setErrors]);

    const executeSignup = useCallback(async () => {
        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;
        if (user && user.email?.toLowerCase().trim() === form.email.toLowerCase().trim()) {
            try {
                const profileRes = await apiService.auth.getProfile();
                if (profileRes.data?.profile) {
                    isManualTransitionRef.current = true;
                    await saveProgress(2);
                    setStep(2);
                    isSubmittingRef.current = false;
                    return;
                }
            } catch { }
        }
        setSignupLoading(true);
        try {
            const cleanEmail = form.email.trim().toLowerCase();
            await clearProgress();
            await signUp(cleanEmail, form.password, form.fullName.trim(), 'patient', { phoneNumber: form.phoneNumber });
            analytics.signupSuccess(cleanEmail);
        } catch (error) {
            const { general, fields } = parseError(error);
            setErrors({ general, ...(fields?.email ? { email: fields.email } : {}) });
            analytics.signupFailure(error?.response?.data?.code || error?.message || 'signup_error');
        } finally { setSignupLoading(false); isSubmittingRef.current = false; }
    }, [form, user, signUp, saveProgress, clearProgress, setErrors]);

    const handleVerifyOtp = useCallback(async () => {
        if (!otp || otp.length < 6) { setErrors(prev => ({ ...prev, otp: 'Please enter the 6-digit code' })); return; }
        const value = verificationField === 'email'
            ? form.email.trim().toLowerCase()
            : `+91${form.phoneNumber.trim()}`;
        setOtpLoading(true);
        setErrors(prev => ({ ...prev, otp: '' }));
        try {
            await verifyOtp(verificationField, value, otp);
            setOtpVisible(false);
            setOtp('');
            analytics.track('otp_verification_success', { field: verificationField });
            if (verificationField === 'email') {
                setIsEmailVerified(true);
                if (!isPhoneVerified) setTimeout(() => handleVerifyPress('phone'), 500);
                else executeSignup();
            } else {
                setIsPhoneVerified(true);
                executeSignup();
            }
        } catch (error) {
            const newAttempts = otpAttempts + 1;
            setOtpAttempts(newAttempts);
            analytics.track('otp_verification_failure', { field: verificationField, attempt: newAttempts });
            if (newAttempts >= 3) {
                setOtpVisible(false);
                const errorField = verificationField === 'phone' ? 'phoneNumber' : verificationField;
                setErrors(prev => ({ ...prev, [errorField]: 'Too many attempts. Please try again later.' }));
            } else {
                let { general } = parseError(error);
                setErrors(prev => ({ ...prev, otp: general || 'OTP not correct' }));
            }
        } finally { setOtpLoading(false); }
    }, [otp, verificationField, form.email, form.phoneNumber, verifyOtp, otpAttempts, executeSignup, handleVerifyPress, isPhoneVerified, setErrors]);

    const handleResendOtp = useCallback(async () => {
        if (resendTimer > 0) return;
        const value = verificationField === 'email' ? form.email.trim().toLowerCase() : `+91${form.phoneNumber.trim()}`;
        setOtpLoading(true);
        try {
            await sendOtp(verificationField, value);
            setResendTimer(60); setOtp(''); setOtpAttempts(0);
            const errorField = verificationField === 'phone' ? 'phoneNumber' : verificationField;
            setErrors(prev => ({ ...prev, [errorField]: '', otp: '' }));
        } catch (error) {
            const { general } = parseError(error);
            setErrors(prev => ({ ...prev, otp: general || 'Failed to resend code' }));
        } finally { setOtpLoading(false); }
    }, [resendTimer, verificationField, form.email, form.phoneNumber, sendOtp, setErrors]);

    // ── Location ───────────────────────────────────────────────────────────────

    const handleDetectLocation = useCallback(async () => {
        setDetectingLocation(true);
        setErrors(prev => ({ ...prev, location: '' }));
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') { setErrors(prev => ({ ...prev, location: 'Location permission denied' })); return; }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const { latitude, longitude } = loc.coords;
            const res = await apiService.patients.reverseGeocode(latitude, longitude);
            const addr = res.data?.address;
            if (addr) {
                const city = addr.city || addr.town || addr.village || addr.county || '';
                const state = addr.state || '';
                const post = addr.postcode || '';
                setLocationAddress([city, state, post].filter(Boolean).join(', '));
                setForm(prev => ({ ...prev, city }));
            } else {
                setErrors(prev => ({ ...prev, location: 'Could not determine your city. Please select manually.' }));
            }
        } catch {
            setErrors(prev => ({ ...prev, location: 'Failed to detect location. Please select manually.' }));
        } finally { setDetectingLocation(false); }
    }, [setErrors]);

    const handleCitySelect = useCallback((city) => {
        if (!city.name) {
            // Clear selection
            setForm(prev => ({ ...prev, city: '' }));
            setLocationAddress('');
            return;
        }
        setForm(prev => ({ ...prev, city: city.name }));
        setLocationAddress(`${city.name}${city.state ? `, ${city.state}` : ''}`);
        setErrors(prev => ({ ...prev, location: '' }));
    }, [setErrors]);

    // ── Step handlers ──────────────────────────────────────────────────────────

    const handleStep1Submit = useCallback(async () => {
        const isValid = await methods.trigger(['fullName', 'email', 'phoneNumber', 'password', 'confirmPassword']);
        if (!isValid) return;
        if (isSubmittingRef.current) return;
        if (!isEmailVerified) { handleVerifyPress('email'); return; }
        if (!isPhoneVerified) { handleVerifyPress('phone'); return; }
        executeSignup();
    }, [methods, isEmailVerified, isPhoneVerified, handleVerifyPress, executeSignup]);

    const handleStep2Continue = useCallback(async () => {
        const isValid = await methods.trigger('city');
        if (!isValid) return;
        setSignupLoading(true);
        try { await apiService.auth.updatePatientCity({ city: form.city }); }
        catch (error) { console.warn('Failed to save city:', error.message); }
        finally { setSignupLoading(false); }
        await saveProgress(3);
        isManualTransitionRef.current = true;
        setStep(3);
        refreshPatient().catch(err => console.warn('[Onboarding] Background patient refresh failed:', err.message));
    }, [form.city, saveProgress, refreshPatient, methods]);

    const handlePaymentSuccess = useCallback(async () => {
        if (isPayingRef.current) return;
        isPayingRef.current = true;
        setUpiModalVisible(false);
        setSignupLoading(true);
        const planId = form.selectedPlanId || 'basic';
        try {
            await apiService.patients.subscribe({ planId, paid: 1, paymentId: 'mock_payment_123' });
            await saveProgress(3, { paymentAttempted: false });
            setPaymentAttempted(true); setPaymentCrashWarning(false);
            isManualTransitionRef.current = true;
            setStep(4);
            refreshPatient().catch(err => console.warn('[Onboarding] Background refresh failed:', err.message));
        } catch (err) {
            console.error('Backend payment save failed:', err.message);
            Alert.alert('Subscription Error', "We couldn't record your payment. Please try again.", [{ text: 'OK' }]);
        } finally { setSignupLoading(false); isPayingRef.current = false; }
    }, [saveProgress, form.selectedPlanId, refreshPatient]);

    const handleBack = useCallback(() => {
        if (step > 1) { isManualTransitionRef.current = true; setStep(prev => prev - 1); }
    }, [step]);

    const handleCompleteSignUp = useCallback(async (actualDob) => {
        const isValid = await methods.trigger(['age', 'gender']);
        if (!isValid) return;
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();
        setSignupLoading(true);
        signupLoadingRef.current = true;
        const timeoutId = setTimeout(() => {
            if (signupLoadingRef.current) {
                setSignupLoading(false); signupLoadingRef.current = false;
                setErrors(prev => ({ ...prev, general: 'Saving is taking longer than expected. Your data is likely safe. Please check your dashboard.' }));
            }
        }, 15000);
        try {
            const dobToSend = actualDob || new Date(new Date().getFullYear() - parseInt(form.age), 0, 1).toISOString();
            await apiService.patients.updateMe({ date_of_birth: dobToSend, gender: form.gender.toLowerCase(), profile_complete: true }, { signal: abortRef.current.signal });
            await clearProgress();
            setShowCelebration(true);
            setSignupLoading(false);
        } catch (error) {
            if (error.name === 'AbortError') return;
            clearTimeout(timeoutId);
            signupLoadingRef.current = false;
            setErrors(prev => ({ ...prev, general: 'Failed to save details. Please try again.' }));
            setSignupLoading(false);
        } finally { abortRef.current = null; }
    }, [form.age, form.gender, clearProgress, setErrors, methods]);

    const proceedToDashboard = useCallback(async () => { await completeSignUp(); }, [completeSignUp]);

    const handleGoToStep5 = async () => {
        isManualTransitionRef.current = true;
        await saveProgress(5);
        setStep(5);
    };

    const toggleShowPass = useCallback(() => setShowPass(v => !v), []);
    const toggleShowConfirm = useCallback(() => setShowConfirm(v => !v), []);

    // ── Processing state ───────────────────────────────────────────────────────

    const renderProcessingState = () => {
        const spin = syncRotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
        return (
            <View style={styles.processingContainer}>
                <Animated.View style={{ transform: [{ rotate: spin }] }}>
                    <RotateCcw size={44} color={C.primary} strokeWidth={1.5} />
                </Animated.View>
                <Text style={styles.processingTitle}>Configuring your profile</Text>
                <Text style={styles.processingSub}>Synchronising your health data...</Text>
                <View style={styles.processingProgress}>
                    <ActivityIndicator size="small" color={C.primary} />
                </View>
            </View>
        );
    };

    // ── Features modal ─────────────────────────────────────────────────────────

    const renderFeaturesModal = () => (
        <Modal visible={featuresModalVisible} animationType="fade" transparent>
            <View style={styles.modalOverlay}>
                <View style={[styles.modalSheet, { maxHeight: '80%' }]}>
                    <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 20 }} />
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Free features</Text>
                        <Pressable onPress={() => setFeaturesModalVisible(false)} hitSlop={12} style={styles.closeBtnBox}>
                            <X size={18} color={C.mid} />
                        </Pressable>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={{ fontSize: 14, ...FONT.medium, color: C.mid, lineHeight: 22, marginBottom: 20 }}>
                            With a guest account, you can access these core health tools for free:
                        </Text>
                        {[
                            { icon: Activity, title: 'Personal Health Log', desc: 'Track symptoms and vitals' },
                            { icon: User, title: 'Community Support', desc: 'Join health groups' },
                            { icon: AlertCircle, title: 'Emergency SOS', desc: 'Quick emergency access' },
                        ].map(({ icon: Icon, title, desc }) => (
                            <View key={title} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16, padding: 14, backgroundColor: C.bg, borderRadius: 14 }}>
                                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                                    <Icon size={18} color={C.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 15, ...FONT.semibold, color: C.dark }}>{title}</Text>
                                    <Text style={{ fontSize: 13, ...FONT.medium, color: C.muted, marginTop: 2 }}>{desc}</Text>
                                </View>
                            </View>
                        ))}
                        <Pressable
                            style={[styles.primaryBtnEnhanced, { marginTop: 8 }]}
                            onPress={() => setFeaturesModalVisible(false)}
                        >
                            <View style={styles.primaryBtnGradientEnhanced}>
                                <Text style={[styles.primaryBtnText, { flex: 1, textAlign: 'center' }]}>Got it</Text>
                            </View>
                        </Pressable>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <FormProvider {...methods}>
            <KeyboardAvoidingView
                style={sc.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    ref={mainScrollRef}
                    style={sc.scroll}
                    contentContainerStyle={sc.content}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* ── Flat header ── */}
                    <View style={sc.headerRow}>
                        {step > 1 ? (
                            <Pressable style={sc.backBtn} onPress={handleBack} hitSlop={10}>
                                <ChevronLeft size={22} color={C.dark} strokeWidth={2.5} />
                            </Pressable>
                        ) : (
                            <View style={sc.backBtnPlaceholder} />
                        )}
                        <Text style={sc.stepCounter}>Step {step} of {STEP_COUNTS}</Text>
                        {/* Dots */}
                        <View style={sc.dotsRow}>
                            {Array.from({ length: STEP_COUNTS }).map((_, i) => (
                                <View
                                    key={i}
                                    style={[sc.dot, i + 1 <= step && sc.dotFilled, i + 1 === step && sc.dotActive]}
                                />
                            ))}
                        </View>
                    </View>

                    {/* Progress bar */}
                    <View style={sc.progressTrack}>
                        <Animated.View style={[sc.progressFill, { width: `${(step / STEP_COUNTS) * 100}%` }]} />
                    </View>

                    {/* ── Step content ── */}
                    <Animated.View style={[sc.stepWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                        {signupLoading ? renderProcessingState() : (
                            <>
                                {step === 1 && (
                                    <Step1Profile
                                        googleLoading={googleLoading} handleGooglePress={handleGooglePress}
                                        signupLoading={signupLoading} handleStep1Submit={handleStep1Submit}
                                        isEmailVerified={isEmailVerified} isPhoneVerified={isPhoneVerified}
                                        showPass={showPass} toggleShowPass={toggleShowPass}
                                        showConfirm={showConfirm} toggleShowConfirm={toggleShowConfirm}
                                        fullNameRef={fullNameRef} emailRef={emailRef} phoneRef={phoneRef}
                                        passwordRef={passwordRef} confirmPassRef={confirmPassRef}
                                    />
                                )}
                                {step === 2 && (
                                    <Step2Locality
                                        staggerAnims={staggerAnims}
                                        detectingLocation={detectingLocation}
                                        handleDetectLocation={handleDetectLocation}
                                        loadingCities={loadingCities}
                                        availableCities={availableCities}
                                        locationAddress={locationAddress}
                                        onCitySelect={handleCitySelect}
                                        signupLoading={signupLoading}
                                        handleStep2Continue={handleStep2Continue}
                                    />
                                )}
                                {step === 3 && (
                                    <Step3Membership
                                        paymentCrashWarning={paymentCrashWarning}
                                        staggerAnims={staggerAnims}
                                        setFeaturesModalVisible={setFeaturesModalVisible}
                                        selectedPlan={selectedPlan}
                                        setSelectedPlan={setSelectedPlan}
                                        setUpiModalVisible={setUpiModalVisible}
                                    />
                                )}
                                {step === 4 && (
                                    <Step4Verification
                                        staggerAnims={staggerAnims}
                                        handleGoToStep5={handleGoToStep5}
                                    />
                                )}
                                {step === 5 && (
                                    <Step5FinalDetails
                                        staggerAnims={staggerAnims}
                                        handleCompleteSignUp={handleCompleteSignUp}
                                        signupLoading={signupLoading}
                                        showCelebration={showCelebration}
                                        proceedToDashboard={proceedToDashboard}
                                        userName={form.fullName.split(' ')[0]}
                                    />
                                )}
                            </>
                        )}
                    </Animated.View>

                    {/* Sign-in link — step 1 only */}
                    {step === 1 && !signupLoading && (
                        <View style={sc.footer}>
                            <Text style={sc.footerText}>Already have an account? </Text>
                            <Pressable onPress={() => navigation.navigate('Login')}>
                                <Text style={sc.footerLink}>Sign In</Text>
                            </Pressable>
                        </View>
                    )}
                </ScrollView>

                {/* OTP Modal */}
                <OTPModal
                    visible={otpVisible}
                    onClose={() => setOtpVisible(false)}
                    otp={otp}
                    setOtp={setOtp}
                    onVerify={handleVerifyOtp}
                    timer={resendTimer}
                    resend={handleResendOtp}
                    attempts={otpAttempts}
                    field={verificationField}
                    error={errors.otp}
                    otpLoading={otpLoading}
                    remainingSlots={remainingSlots}
                />

                {/* UPI Payment Modal */}
                <UPIPaymentModal
                    visible={upiModalVisible}
                    onClose={() => setUpiModalVisible(false)}
                    onSuccess={handlePaymentSuccess}
                    planName={selectedPlan.name}
                    planPrice={selectedPlan.price}
                />

                {renderFeaturesModal()}
            </KeyboardAvoidingView>
        </FormProvider>
    );
}

// ── Screen-level styles (not shared) ──────────────────────────────────────────
const sc = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    scroll: { flex: 1 },
    content: { paddingBottom: 48 },
    stepWrap: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 16 },

    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 60 : 48,
        paddingBottom: 14,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border,
        alignItems: 'center', justifyContent: 'center',
    },
    backBtnPlaceholder: { width: 40, height: 40 },
    stepCounter: {
        fontSize: 13, ...FONT.semibold, color: C.mid,
    },
    dotsRow: { flexDirection: 'row', gap: 5, alignItems: 'center' },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
    dotFilled: { backgroundColor: C.primary, opacity: 0.4 },
    dotActive: { backgroundColor: C.primary, opacity: 1, width: 18, borderRadius: 3 },

    progressTrack: {
        height: 3, backgroundColor: C.border,
        marginHorizontal: 20, borderRadius: 2, marginBottom: 8,
    },
    progressFill: {
        height: 3, backgroundColor: C.primary, borderRadius: 2,
    },

    footer: {
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
        paddingHorizontal: 24, paddingBottom: 24, paddingTop: 4,
    },
    footerText: { fontSize: 14, ...FONT.medium, color: C.mid },
    footerLink: { fontSize: 14, ...FONT.heavy, color: C.primary },
});
