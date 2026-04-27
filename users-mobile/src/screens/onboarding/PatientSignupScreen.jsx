/**
 * PatientSignupScreen.jsx
 *
 * Fixes applied in this revision on top of the restored version:
 *
 * C1. setErrors proxy called function-form callbacks with {} instead of current errors.
 *     All setErrors(prev => ({ ...prev, someField: '...' })) calls throughout the file
 *     appeared to merge errors but actually started from an empty object because the
 *     proxy called errs({}) unconditionally. Any existing field errors (e.g. an email
 *     error while a location error was being set) were silently dropped.
 *     FIX: The proxy now reads the current RHF error state and passes it as `prev`
 *     so the function-form callback receives the actual current errors map.
 *
 * C2. selectedPlan state and RHF selectedPlanId were not kept in sync.
 *     Step3Membership calls RHF setValue('selectedPlanId', 'basic') internally,
 *     but handlePaymentSuccess read from the separate selectedPlan state object
 *     which was never updated from Step3. This meant subscribe() always sent
 *     plan: 'basic' regardless of what the user actually selected.
 *     FIX: handlePaymentSuccess now reads form.selectedPlanId (from RHF via watch())
 *     as the authoritative plan value. The selectedPlan state is kept only for
 *     display purposes (name/price strings in the UPI modal).
 *
 * C3. handleCompleteSignUp called refreshPatient() then completeSignUp().
 *     Since completeSignUp() now internally calls fetchPatientData() (AuthContext A3 fix),
 *     this caused two sequential getMe() network calls. Simplified to just completeSignUp()
 *     which handles the refresh and onboarding resolution atomically.
 *
 * All prior fixes (B1–B7, FormProvider wrap, setForm function-form support) preserved.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, TextInput, Pressable, Platform,
    KeyboardAvoidingView, ScrollView, Animated, ActivityIndicator,
    Modal, Image, Alert, Easing,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import {
    User, Mail, MapPin, Lock, Eye, EyeOff, CheckCircle2, ArrowLeft, AlertCircle,
    Search, X, CreditCard, Smartphone, Check, ChevronLeft, Activity, CloudUpload,
    Shield, Crown, Sparkles, Star, Zap, ChevronRight, LogOut, Navigation,
    RotateCcw
} from 'lucide-react-native';
import { colors } from '../../theme';
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

import {
    StepIndicator, OTPModal, UPIPaymentModal, styles, FONT
} from './components';
import Step1Profile from './components/Step1Profile';
import Step2Locality from './components/Step2Locality';
import Step3Membership from './components/Step3Membership';
import Step4Verification from './components/Step4Verification';
import Step5FinalDetails from './components/Step5FinalDetails';

const STEP_LABELS = ['Profile Creation', 'Locality', 'Membership', 'Verification', 'All Systems Go'];
const ONBOARDING_STORAGE_KEY = 'samvaya_onboarding_progress';
const STALE_PROGRESS_DAYS = 7;

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

    // setForm: supports both object and function (prev => ...) patterns
    const setForm = (newVal) => {
        const valueToSet = typeof newVal === 'function' ? newVal(form) : newVal;
        Object.entries(valueToSet).forEach(([key, value]) => {
            methods.setValue(key, value);
        });
    };

    // C1 FIX: setErrors proxy previously called function-form callbacks with {}
    // as `prev`, silently discarding all existing field errors. Now derives the
    // current error map from RHF state so prev is accurate.
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

    // selectedPlan is kept only for display strings in the UPI modal (name, price).
    // The authoritative plan ID for API calls is form.selectedPlanId (RHF).
    const [selectedPlan, setSelectedPlan] = useState({ id: 'basic', name: 'Basic Plan', price: '₹500 / month' });

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
    const [cityModalVisible, setCityModalVisible] = useState(false);
    const [availableCities, setAvailableCities] = useState([]);
    const [loadingCities, setLoadingCities] = useState(false);
    const [citySearchQuery, setCitySearchQuery] = useState('');

    const [showPass, setShowPass] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [upiModalVisible, setUpiModalVisible] = useState(false);
    const [signupLoading, setSignupLoading] = useState(false);
    const [featuresModalVisible, setFeaturesModalVisible] = useState(false);
    const [paymentAttempted, setPaymentAttempted] = useState(false);
    const [paymentCrashWarning, setPaymentCrashWarning] = useState(false);

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

    // Snapshot ref so saveProgress doesn't need form state in its dep array
    const progressSnapshotRef = useRef({});
    useEffect(() => {
        progressSnapshotRef.current = { form, locationAddress, paymentAttempted, selectedPlan };
    });

    // B2 FIX: guard so recovery effect doesn't override manual step transitions
    const isManualTransitionRef = useRef(false);
    // B5 FIX: ref so clearProgress isn't a dep of the recovery effect
    const clearProgressRef = useRef(null);

    // ── AsyncStorage persistence ──────────────────────────────────────────────

    const saveProgress = useCallback(async (currentStep, extraData = {}) => {
        try {
            const { form: f, locationAddress: la, paymentAttempted: pa, selectedPlan: sp } = progressSnapshotRef.current;
            const progress = {
                step: currentStep,
                savedAt: Date.now(),
                email: f.email,
                fullName: f.fullName,
                city: f.city,
                locationAddress: la,
                paymentAttempted: extraData.paymentAttempted ?? pa,
                selectedPlan: sp,
                ...extraData,
            };
            await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(progress));
        } catch (err) {
            console.warn('[Onboarding] Failed to save progress:', err.message);
        }
    }, []);

    const clearProgress = useCallback(async () => {
        try {
            await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY);
        } catch { }
    }, []);

    useEffect(() => {
        clearProgressRef.current = clearProgress;
    }, [clearProgress]);

    // ── Recovery effect ───────────────────────────────────────────────────────

    useEffect(() => {
        if (!profile && !patient) return;

        const dbName = patient?.name || profile?.fullName;
        const dbEmail = patient?.email || profile?.email;
        const dbPhone = patient?.phone || profile?.phoneNumber;
        const dbCity = patient?.city || profile?.city;

        if (dbName && !form.fullName) {
            setForm(prev => ({
                ...prev,
                fullName: dbName,
                email: dbEmail || prev.email,
                phoneNumber: dbPhone || prev.phoneNumber,
                city: dbCity || prev.city,
            }));
            if (dbEmail) setIsEmailVerified(true);
            if (dbPhone) setIsPhoneVerified(true);
            if (dbCity) setLocationAddress(`${dbCity}`);
        }

        // B2 FIX: skip override if step was just set manually
        if (isManualTransitionRef.current) {
            isManualTransitionRef.current = false;
            return;
        }

        const isProcessing = signupLoading || googleLoading;
        const targetStep = resolveOnboardingStep(patient, profile);

        if (targetStep === null) {
            clearProgressRef.current?.();
        } else if (step !== targetStep && !isProcessing && !isSubmittingRef.current) {
            setStep(targetStep);
        }
    }, [profile, patient, signupLoading, googleLoading]);

    useEffect(() => {
        GoogleSignin.configure({
            webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
            offlineAccess: false,
        });

        // Cleanup pending API requests on unmount
        return () => {
            if (abortRef.current) {
                abortRef.current.abort();
            }
        };
    }, []);

    const heroAnim = useRef(new Animated.Value(-15)).current;
    const heroOpacity = useRef(new Animated.Value(0)).current;
    const cardAnim = useRef(new Animated.Value(30)).current;
    const cardOpacity = useRef(new Animated.Value(0)).current;
    const syncRotateAnim = useRef(new Animated.Value(0)).current;
    const staggerAnims = useRef([...Array(10)].map(() => new Animated.Value(0))).current;

    useEffect(() => {
        if (signupLoading) {
            const loop = Animated.loop(
                Animated.timing(syncRotateAnim, {
                    toValue: 1, duration: 1200,
                    easing: Easing.linear, useNativeDriver: true,
                })
            );
            const frameId = requestAnimationFrame(() => loop.start());
            return () => {
                cancelAnimationFrame(frameId);
                loop.stop();
                syncRotateAnim.setValue(0);
            };
        }
    }, [signupLoading, syncRotateAnim]);

    // Load saved progress on mount
    useEffect(() => {
        const applyProgress = (progress) => {
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
                setPaymentAttempted(true);
                setPaymentCrashWarning(true);
            }
        };

        const loadProgress = async () => {
            try {
                const raw = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
                if (!raw) return;
                const progress = JSON.parse(raw);
                const ageDays = (Date.now() - (progress.savedAt || 0)) / (1000 * 60 * 60 * 24);
                if (ageDays > STALE_PROGRESS_DAYS) {
                    Alert.alert(
                        'Incomplete Signup Found',
                        `You started signing up ${Math.floor(ageDays)} days ago. Continue or start fresh?`,
                        [
                            { text: 'Start Fresh', style: 'destructive', onPress: () => clearProgress() },
                            { text: 'Continue', onPress: () => applyProgress(progress) },
                        ]
                    );
                    return;
                }
                applyProgress(progress);
            } catch (err) {
                console.warn('[Onboarding] Failed to load progress:', err.message);
            }
        };

        loadProgress();
    }, [clearProgress]);

    // OTP countdown timer
    useEffect(() => {
        if (resendTimer <= 0) return;
        const interval = setInterval(() => setResendTimer(prev => prev - 1), 1000);
        return () => clearInterval(interval);
    }, [resendTimer]);

    // Step change animations
    useEffect(() => {
        staggerAnims.forEach(a => { a.stopAnimation(); a.setValue(0); });
        heroAnim.stopAnimation(); heroAnim.setValue(-20);
        heroOpacity.stopAnimation(); heroOpacity.setValue(0);
        cardAnim.stopAnimation(); cardAnim.setValue(20);
        cardOpacity.stopAnimation(); cardOpacity.setValue(0);

        Animated.parallel([
            Animated.timing(heroAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
            Animated.timing(heroOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(cardAnim, { toValue: 0, duration: 500, delay: 100, useNativeDriver: true }),
            Animated.timing(cardOpacity, { toValue: 1, duration: 500, delay: 100, useNativeDriver: true }),
        ]).start();

        Animated.stagger(100, staggerAnims.map(a =>
            Animated.timing(a, { toValue: 1, duration: 400, useNativeDriver: true })
        )).start();

        if (mainScrollRef.current) mainScrollRef.current.scrollTo({ y: 0, animated: true });
        if (step === 2) fetchCities();
    }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Fetchers ──────────────────────────────────────────────────────────────

    const fetchCities = useCallback(async () => {
        setLoadingCities(true);
        setErrors(prev => ({ ...prev, location: '' }));
        try {
            const res = await apiService.patients.getCities();
            setAvailableCities(res.data.cities || []);
        } catch (error) {
            console.warn('Failed to fetch cities:', error);
            setErrors(prev => ({ ...prev, location: 'Failed to load cities. Try detecting your location instead.' }));
        } finally {
            setLoadingCities(false);
        }
    }, [setErrors]);

    // ── Google Sign Up ────────────────────────────────────────────────────────

    const handleGooglePress = useCallback(async () => {
        try {
            setTimeout(() => setGoogleLoading(true), 0);
            setErrors({});
            await GoogleSignin.hasPlayServices();
            try { await GoogleSignin.signOut(); } catch { }
            const signInResult = await GoogleSignin.signIn();
            const idToken = signInResult?.data?.idToken;
            if (!idToken) {
                setErrors({ google: 'Failed to get Google ID token. Please try again.' });
                return;
            }
            await clearProgress();
            const result = await signInWithGoogle(idToken);
            if (result?.isNewUser) {
                const googleUser = result.user;
                const fullName = googleUser.user_metadata?.full_name
                    || googleUser.user_metadata?.name
                    || googleUser.email.split('@')[0];
                try {
                    const regRes = await apiService.auth.register({
                        email: googleUser.email, fullName, role: 'patient',
                        supabaseUid: googleUser.id,
                    });
                    const regProfile = regRes.data?.profile;
                    const regSession = regRes.data?.session;
                    if (regProfile && regSession) {
                        await injectSession(regSession, regProfile);
                    } else if (regProfile) {
                        await injectSession(result.session, regProfile);
                    } else {
                        setErrors({ google: 'Registration succeeded but no profile returned.' });
                        await signOut();
                    }
                } catch (regError) {
                    const code = regError?.response?.data?.code;
                    const regProfile = regError?.response?.data?.profile;
                    const regSession = regError?.response?.data?.session;
                    const msg = regError?.response?.data?.error || regError.message || 'Failed to create account';
                    if (code === 'EMAIL_ALREADY_EXISTS' && regProfile && regSession) {
                        await injectSession(regSession, regProfile);
                    } else if (code === 'EMAIL_ALREADY_EXISTS') {
                        setErrors({ google: 'An account with this email already exists. Please log in instead.' });
                        await signOut();
                    } else {
                        setErrors({ google: msg });
                        await signOut();
                    }
                }
            }
        } catch (error) {
            try { await GoogleSignin.signOut(); } catch { }
            if (error?.code === statusCodes.SIGN_IN_CANCELLED) {
                // user cancelled — do nothing
            } else if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                setErrors({ google: 'Google Play Services not available. Please update.' });
            } else {
                setErrors({ google: error?.message || 'Google sign-up failed' });
            }
        } finally {
            setGoogleLoading(false);
        }
    }, [signInWithGoogle, injectSession, clearProgress, setErrors]);

    // ── OTP ───────────────────────────────────────────────────────────────────

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
            if (error?.response?.data?.code === 'PHONE_LIMIT_REACHED') {
                general = error.response.data.error;
            } else if (error?.response?.data?.error) {
                general = error.response.data.error;
            }
            const errorField = field === 'phone' ? 'phoneNumber' : field;
            setErrors(prev => ({ ...prev, [errorField]: general || `Failed to send OTP to ${field}` }));
        } finally {
            setOtpLoading(false);
        }
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
            setErrors({
                general,
                ...(fields?.email ? { email: fields.email } : {}),
            });
            analytics.signupFailure(error?.response?.data?.code || error?.message || 'signup_error');
        } finally {
            setSignupLoading(false);
            isSubmittingRef.current = false;
        }
    }, [form, user, signUp, saveProgress, clearProgress, setErrors]);

    const handleVerifyOtp = useCallback(async () => {
        if (!otp || otp.length < 6) {
            setErrors(prev => ({ ...prev, otp: 'Please enter a 6-digit code' }));
            return;
        }
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
                if (!isPhoneVerified) {
                    setTimeout(() => handleVerifyPress('phone'), 500);
                } else {
                    executeSignup();
                }
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
        } finally {
            setOtpLoading(false);
        }
    }, [otp, verificationField, form.email, form.phoneNumber, verifyOtp, otpAttempts, executeSignup, handleVerifyPress, isPhoneVerified, setErrors]);

    const handleResendOtp = useCallback(async () => {
        if (resendTimer > 0) return;
        const value = verificationField === 'email'
            ? form.email.trim().toLowerCase()
            : `+91${form.phoneNumber.trim()}`;
        setOtpLoading(true);
        try {
            await sendOtp(verificationField, value);
            setResendTimer(60);
            setOtp('');
            setOtpAttempts(0);
            const errorField = verificationField === 'phone' ? 'phoneNumber' : verificationField;
            setErrors(prev => ({ ...prev, [errorField]: '', otp: '' }));
        } catch (error) {
            const { general } = parseError(error);
            setErrors(prev => ({ ...prev, otp: general || 'Failed to resend code' }));
        } finally {
            setOtpLoading(false);
        }
    }, [resendTimer, verificationField, form.email, form.phoneNumber, sendOtp, setErrors]);

    // ── Location ──────────────────────────────────────────────────────────────

    const handleDetectLocation = useCallback(async () => {
        setDetectingLocation(true);
        setErrors(prev => ({ ...prev, location: '' }));
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setErrors(prev => ({ ...prev, location: 'Permission to access location was denied' }));
                return;
            }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const { latitude, longitude } = loc.coords;
            const res = await apiService.patients.reverseGeocode(latitude, longitude);
            const data = res.data;
            if (data?.address) {
                const addr = data.address;
                const city = addr.city || addr.town || addr.village || addr.county || '';
                const state = addr.state || '';
                const post = addr.postcode || '';
                setLocationAddress([city, state, post].filter(Boolean).join(', '));
                setForm(prev => ({ ...prev, city }));
            } else {
                setErrors(prev => ({ ...prev, location: 'Could not determine your city. Please enter it manually.' }));
            }
        } catch {
            setErrors(prev => ({ ...prev, location: 'Failed to detect location. Please enter it manually.' }));
        } finally {
            setDetectingLocation(false);
        }
    }, [setErrors]);

    // ── Step handlers ─────────────────────────────────────────────────────────

    const handleStep1Submit = useCallback(async () => {
        const isValid = await methods.trigger(['fullName', 'email', 'phoneNumber', 'password', 'confirmPassword']);
        if (!isValid) return;
        if (isSubmittingRef.current) return;
        if (!isEmailVerified) { handleVerifyPress('email'); return; }
        if (!isPhoneVerified) { handleVerifyPress('phone'); return; }
        executeSignup();
    }, [methods, isEmailVerified, isPhoneVerified, handleVerifyPress, executeSignup]);

    // B1 + B3 FIX: city save → manual transition guard → background refresh
    const handleStep2Continue = useCallback(async () => {
        const isValid = await methods.trigger('city');
        if (!isValid) return;
        setSignupLoading(true);
        try {
            await apiService.auth.updatePatientCity({ city: form.city });
        } catch (error) {
            console.warn('Failed to save city:', error.message);
        } finally {
            setSignupLoading(false);
        }
        await saveProgress(3);
        isManualTransitionRef.current = true;
        setStep(3);
        refreshPatient().catch(err => console.warn('[Onboarding] Background patient refresh failed:', err.message));
    }, [form.city, saveProgress, refreshPatient, methods]);

    const handlePaymentSuccess = useCallback(async () => {
        if (isPayingRef.current) return;
        isPayingRef.current = true;

        setUpiModalVisible(false);
        setSignupLoading(true); // Show processing state

        // C2 FIX: Use form.selectedPlanId (RHF) as the authoritative plan value.
        const planId = form.selectedPlanId || 'basic';
        try {
            await apiService.patients.subscribe({ planId: planId, paid: 1, paymentId: 'mock_payment_123' });
            
            // Success: Proceed to Step 4
            await saveProgress(3, { paymentAttempted: false });
            setPaymentAttempted(true);
            setPaymentCrashWarning(false);
            isManualTransitionRef.current = true;
            setStep(4);
            
            // Refresh in background
            refreshPatient().catch(err => console.warn('[Onboarding] Background patient refresh failed:', err.message));
        } catch (err) {
            console.error('Backend payment save failed:', err.message);
            Alert.alert(
                "Subscription Error",
                "We couldn't record your payment on our server. Please try again or contact support if you were already charged.",
                [{ text: "OK" }]
            );
            // Stay on Step 3 so they can retry
        } finally {
            setSignupLoading(false);
            isPayingRef.current = false;
        }
    }, [saveProgress, form.selectedPlanId, refreshPatient]);

    const handleBack = useCallback(() => {
        if (step > 1) {
            isManualTransitionRef.current = true;
            setStep(prev => prev - 1);
        }
    }, [step]);

    const handleCompleteSignUp = useCallback(async (actualDob) => {
        const isValid = await methods.trigger(['age', 'gender']);
        if (!isValid) return;
        
        // Cancel any pending request
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();
        
        setSignupLoading(true);
        signupLoadingRef.current = true;
        
        const timeoutId = setTimeout(() => {
            if (signupLoadingRef.current) {
                setSignupLoading(false);
                signupLoadingRef.current = false;
                setErrors(prev => ({ ...prev, general: 'Saving is taking longer than expected. Your data is likely safe. Please check your dashboard.' }));
            }
        }, 15000);

        try {
            // Use the actual DOB if provided (from Step 5 picker), otherwise fallback to estimate
            const dobToSend = actualDob || new Date(new Date().getFullYear() - parseInt(form.age), 0, 1).toISOString();
            
            await apiService.patients.updateMe({ 
                date_of_birth: dobToSend, 
                gender: form.gender.toLowerCase(),
                profile_complete: true
            }, { signal: abortRef.current.signal });
            
            await clearProgress();
            await completeSignUp();
            signupLoadingRef.current = false;
            clearTimeout(timeoutId);
        } catch (error) {
            if (error.name === 'AbortError') return;
            clearTimeout(timeoutId);
            signupLoadingRef.current = false;
            setErrors(prev => ({ ...prev, general: 'Failed to save details. Please try again.' }));
            setSignupLoading(false);
        } finally {
            abortRef.current = null;
        }
    }, [form.age, form.gender, clearProgress, completeSignUp, setErrors, methods]);

    const toggleShowPass = useCallback(() => setShowPass(v => !v), []);
    const toggleShowConfirm = useCallback(() => setShowConfirm(v => !v), []);

    // ── Render helpers ────────────────────────────────────────────────────────

    const renderHeader = () => (
        <Animated.View style={[styles.hero, { transform: [{ translateY: heroAnim }], opacity: heroOpacity }]}>
            <LinearGradient
                colors={['#4F46E5', '#6366F1', '#818CF8']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <View style={styles.orb1} />
            <View style={styles.orb2} />
            <View style={styles.orb3} />
            <View style={styles.orb4} />
            <View style={styles.heroContent}>
                {(step === 2 || step === 3) && (
                    <Pressable
                        style={{ position: 'absolute', top: 0, left: 20, width: 44, height: 44, justifyContent: 'center' }}
                        onPress={handleBack}
                        hitSlop={12}
                    >
                        <ChevronLeft size={28} color="#FFFFFF" strokeWidth={2.5} />
                    </Pressable>
                )}
                <View style={[styles.iconCircle, { backgroundColor: '#FFFFFF' }]}>
                    <Image
                        source={require('../../../assets/logo.png')}
                        style={{ width: 44, height: 44 }}
                        resizeMode="contain"
                    />
                </View>
                <Text style={styles.heroLabel}>SAMVAYA</Text>
                <Text style={styles.heroTitle}>{`Step ${step}: ${STEP_LABELS[step - 1]}`}</Text>
                <StepIndicator current={step} />
            </View>
        </Animated.View>
    );

    const renderStep1 = () => (
        <Step1Profile
            googleLoading={googleLoading} handleGooglePress={handleGooglePress}
            signupLoading={signupLoading} handleStep1Submit={handleStep1Submit}
            isEmailVerified={isEmailVerified} isPhoneVerified={isPhoneVerified}
            showPass={showPass} toggleShowPass={toggleShowPass}
            showConfirm={showConfirm} toggleShowConfirm={toggleShowConfirm}
            fullNameRef={fullNameRef} emailRef={emailRef} phoneRef={phoneRef}
            passwordRef={passwordRef} confirmPassRef={confirmPassRef}
        />
    );

    const renderStep2 = () => (
        <Step2Locality
            staggerAnims={staggerAnims}
            detectingLocation={detectingLocation} handleDetectLocation={handleDetectLocation}
            loadingCities={loadingCities} setCityModalVisible={setCityModalVisible}
            locationAddress={locationAddress}
            signupLoading={signupLoading} handleStep2Continue={handleStep2Continue}
        />
    );

    const renderStep3_PlanSelection = () => (
        <Step3Membership
            paymentCrashWarning={paymentCrashWarning} staggerAnims={staggerAnims}
            setFeaturesModalVisible={setFeaturesModalVisible}
            selectedPlan={selectedPlan} setSelectedPlan={setSelectedPlan}
            setUpiModalVisible={setUpiModalVisible}
        />
    );

    const renderFeaturesModal = () => (
        <Modal visible={featuresModalVisible} animationType="fade" transparent>
            <View style={styles.modalOverlay}>
                <View style={[styles.modalSheet, { maxHeight: '80%' }]}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Explore Features</Text>
                        <Pressable onPress={() => setFeaturesModalVisible(false)} hitSlop={12}>
                            <X size={22} color="#64748B" />
                        </Pressable>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                        <Text style={styles.otpSubtext}>With a guest account, you can access core health tools for free:</Text>
                        <View style={{ marginTop: 24, gap: 20 }}>
                            {[
                                { title: 'Personal Health Log', desc: 'Track symptoms and vitals.', icon: Activity },
                                { title: 'Community Support', desc: 'Join health groups.', icon: User },
                                { title: 'Emergency SOS', desc: 'Quick emergency access.', icon: AlertCircle },
                            ].map(({ title, desc, icon: Icon }) => (
                                <View key={title} style={styles.journeyItem}>
                                    <View style={[styles.journeyIconBox, { marginTop: 0 }]}>
                                        <Icon size={18} color="#6366F1" />
                                    </View>
                                    <View style={{ flex: 1, paddingLeft: 4 }}>
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 4 }}>{title}</Text>
                                        <Text style={{ fontSize: 14, color: '#64748B', lineHeight: 20 }}>{desc}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                        <Pressable style={[styles.primaryBtnEnhanced, { marginTop: 32 }]} onPress={() => setFeaturesModalVisible(false)}>
                            <LinearGradient
                                colors={['#6366F1', '#4F46E5']}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                style={styles.primaryBtnGradientEnhanced}
                            >
                                <Text style={styles.primaryBtnText}>Got it</Text>
                            </LinearGradient>
                        </Pressable>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );

    const handleGoToStep5 = async () => {
        isManualTransitionRef.current = true;
        await saveProgress(5);
        setStep(5);
    };

    const renderStep4_PaymentSuccess = () => (
        <Step4Verification staggerAnims={staggerAnims} handleGoToStep5={handleGoToStep5} />
    );

    const renderProcessingState = () => {
        const spin = syncRotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
        return (
            <View style={styles.processingContainer}>
                <Animated.View style={{ transform: [{ rotate: spin }] }}>
                    <RotateCcw size={48} color="#6366F1" strokeWidth={1.5} />
                </Animated.View>
                <Text style={styles.processingTitle}>Configuring Your Profile</Text>
                <Text style={styles.processingSub}>Synchronizing your health data...</Text>
                <View style={styles.processingProgress}>
                    <ActivityIndicator size="small" color="#6366F1" />
                </View>
            </View>
        );
    };

    const renderStep5 = () => (
        <Step5FinalDetails
            staggerAnims={staggerAnims}
            handleCompleteSignUp={handleCompleteSignUp}
            signupLoading={signupLoading}
        />
    );

    const filteredCities = useMemo(
        () => availableCities.filter(c => c.name.toLowerCase().includes(citySearchQuery.toLowerCase())),
        [availableCities, citySearchQuery]
    );

    const renderCityModal = () => (
        <Modal visible={cityModalVisible} animationType="slide" transparent>
            <View style={{ flex: 1 }}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalSheet, { height: '80%', padding: 0 }]}>
                        <View style={[styles.modalHeader, { padding: 24, paddingBottom: 16 }]}>
                            <View>
                                <Text style={styles.modalTitle}>Select Your City</Text>
                                <Text style={styles.modalSub}>Choose where you need care</Text>
                            </View>
                            <Pressable onPress={() => setCityModalVisible(false)} hitSlop={12} style={styles.closeBtnBox}>
                                <X size={20} color="#64748B" />
                            </Pressable>
                        </View>
                        <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
                            <View style={styles.searchWrap}>
                                <Search size={18} color="#8899BB" />
                                <TextInput
                                    style={styles.searchInput}
                                    placeholder="Search cities..."
                                    placeholderTextColor="#8899BB"
                                    value={citySearchQuery}
                                    onChangeText={setCitySearchQuery}
                                />
                                {citySearchQuery.length > 0 && (
                                    <Pressable onPress={() => setCitySearchQuery('')}>
                                        <X size={16} color="#8899BB" />
                                    </Pressable>
                                )}
                            </View>
                        </View>
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
                        >
                            {loadingCities ? (
                                <ActivityIndicator size="large" color="#3B5BDB" style={{ marginTop: 40 }} />
                            ) : filteredCities.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <MapPin size={32} color="#CBD5E1" />
                                    <Text style={styles.emptyTitle}>No cities found</Text>
                                    <Text style={styles.emptyDesc}>No areas matching "{citySearchQuery}".</Text>
                                </View>
                            ) : filteredCities.map((city) => (
                                <Pressable
                                    key={city.id || city._id}
                                    style={[styles.cityOption, form.city === city.name && styles.cityOptionActive]}
                                    onPress={() => {
                                        setForm(prev => ({ ...prev, city: city.name }));
                                        setLocationAddress(`${city.name}, ${city.state}`);
                                        setCityModalVisible(false);
                                        setErrors(prev => ({ ...prev, location: '' }));
                                    }}
                                >
                                    <View style={[styles.cityIconBox, form.city === city.name && { backgroundColor: '#EFF3FF' }]}>
                                        <MapPin size={20} color={form.city === city.name ? '#3B5BDB' : '#64748B'} />
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 16 }}>
                                        <Text style={[styles.cityName, form.city === city.name && { color: '#3B5BDB', fontWeight: '700' }]}>
                                            {city.name}
                                        </Text>
                                        <Text style={styles.cityState}>{city.state}</Text>
                                    </View>
                                    <View style={[styles.radioOutline, form.city === city.name && styles.radioActive]}>
                                        {form.city === city.name && <View style={styles.radioDot} />}
                                    </View>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </View>
        </Modal>
    );

    // ── Root render ───────────────────────────────────────────────────────────

    return (
        <FormProvider {...methods}>
            <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <ScrollView
                    ref={mainScrollRef}
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {renderHeader()}

                    <Animated.View style={[styles.formCard, { transform: [{ translateY: cardAnim }], opacity: cardOpacity }]}>
                        {signupLoading ? renderProcessingState() : (
                            <>
                                {step === 1 && renderStep1()}
                                {step === 2 && renderStep2()}
                                {step === 3 && renderStep3_PlanSelection()}
                                {step === 4 && renderStep4_PaymentSuccess()}
                                {step === 5 && renderStep5()}
                            </>
                        )}
                    </Animated.View>

                    {step === 1 && (
                        <View style={styles.footer}>
                            <Text style={styles.footerText}>Already have an account? </Text>
                            <Pressable onPress={() => navigation.navigate('Login')}>
                                <Text style={styles.footerAction}>Sign In</Text>
                            </Pressable>
                            <View style={{ height: 40 }} />
                            <Text style={styles.madeWith}>Made with ♥ by Samvaya</Text>
                        </View>
                    )}
                </ScrollView>

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

                {renderCityModal()}
                {renderFeaturesModal()}

                <UPIPaymentModal
                    visible={upiModalVisible}
                    onClose={() => setUpiModalVisible(false)}
                    onSuccess={handlePaymentSuccess}
                    planName={selectedPlan.name}
                    planPrice={selectedPlan.price}
                />
            </KeyboardAvoidingView>
        </FormProvider>
    );
}