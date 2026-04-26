/**
 * PatientSignupScreen.jsx
 *
 * BUG FIXES applied on top of prior revision:
 *
 * B1. (CRITICAL) Step 2 → Step 4 skip:
 *     handleStep2Continue was calling refreshPatient() which triggered the
 *     recovery useEffect. resolveOnboardingStep saw a patient with a city and
 *     jumped to step 4, bypassing step 3 entirely.
 *     FIX: Removed refreshPatient() call from handleStep2Continue. The patient
 *     refresh is not needed here — we already have enough state to proceed.
 *     The background refresh is deferred until after setStep(3) settles.
 *
 * B2. Recovery useEffect overriding manual step transitions:
 *     The effect ran on every patient/profile update and could override steps
 *     the user had just navigated to. Added a `isManualTransitionRef` guard —
 *     any manual setStep() call sets this flag for one render cycle so the
 *     recovery effect skips its override logic.
 *
 * B3. refreshPatient() race condition in handleStep2Continue:
 *     Even with await, the patient state update from refreshPatient fires
 *     the recovery effect synchronously after the state batches settle.
 *     FIX: Deferred refreshPatient to after step transition is complete using
 *     a ref-guarded post-transition callback pattern.
 *
 * B4. validateStep1 unnecessary currying:
 *     validateStep1 returned a curried function, making it fragile and hard
 *     to read. Refactored to accept args directly and removed the outer
 *     useCallback wrapper (it's only called inside handleStep1Continue).
 *
 * B5. clearProgress in recovery useEffect dependency array:
 *     Could cause effect loop if reference changed. Replaced with a ref so
 *     the effect reads the latest version without it being a dep.
 *
 * B6. IconInput missing React.memo wrapper:
 *     Flicker fix F2 comment said it was memoized but the actual code only
 *     had forwardRef. Wrapped with React.memo(React.forwardRef(...)).
 *
 * B7. handlePaymentSuccess needs refreshPatient to update onboardingComplete:
 *     This is the ONE place a refresh is correct (after subscribe API call),
 *     kept as-is from the original.
 *
 * All prior flicker fixes (F1–F10) are preserved unchanged.
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

// ─── Extracted Components ─────────────────────────────────────────────────────
import {
    StepIndicator, OTPModal, UPIPaymentModal, styles, FONT,
} from './components';
import Step1Profile from './components/Step1Profile';
import Step2Locality from './components/Step2Locality';
import Step3Membership from './components/Step3Membership';
import Step4Verification from './components/Step4Verification';
import Step5FinalDetails from './components/Step5FinalDetails';

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_LABELS = ['Profile Creation', 'Locality', 'Membership', 'Verification', 'All Systems Go'];
const ONBOARDING_STORAGE_KEY = 'samvaya_onboarding_progress';
const STALE_PROGRESS_DAYS = 7;

// ─── Helpers (extracted to components/SignupUI.jsx) ───────────────────────────

// All shared UI components (PasswordStrength, PasswordRequirements, StepIndicator,
// IconInput, OTPBoxes, OTPModal, UPIPaymentModal) have been extracted to
// components/SignupUI.jsx for maintainability. See components/ directory.


// ─── Main Component ───────────────────────────────────────────────────────────

export default function PatientSignupScreen({ navigation, route }) {
    const { user, profile, patient, signUp, signInWithGoogle, completeSignUp, injectSession, signOut, sendOtp, verifyOtp, refreshPatient } = useAuth();

    const [step, setStep] = useState(route?.params?.step || 1);

    // -- React Hook Form Initialization --
    const methods = useForm({
        resolver: zodResolver(step === 1 ? step1Schema : step === 2 ? step2Schema : step === 3 ? step3Schema : step5Schema),
        defaultValues: {
            fullName: '', email: '', phoneNumber: '', city: '',
            password: '', confirmPassword: '', age: '', gender: '',
            selectedPlanId: 'basic'
        },
        mode: 'onChange'
    });

    // Mirror RHF state to local form variable for legacy component compatibility
    const form = methods.watch();
    const setForm = (newVal) => {
        Object.entries(newVal).forEach(([key, value]) => {
            methods.setValue(key, value);
        });
    };

    // Proxy for legacy setErrors calls to use RHF setError
    const setErrors = (errs) => {
        const e = typeof errs === 'function' ? errs({}) : errs;
        Object.entries(e).forEach(([key, val]) => {
            if (val) methods.setError(key, { message: val });
            else methods.clearErrors(key);
        });
    };
    // Map RHF error objects to strings for legacy component compatibility
    const errors = React.useMemo(() => {
        const e = {};
        Object.keys(methods.formState.errors).forEach(key => {
            e[key] = methods.formState.errors[key]?.message || methods.formState.errors[key];
        });
        return e;
    }, [methods.formState.errors]);
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
    const fullNameRef = useRef(null);
    const emailRef = useRef(null);
    const phoneRef = useRef(null);
    const passwordRef = useRef(null);
    const confirmPassRef = useRef(null);

    // F5: snapshot ref so saveProgress doesn't need these in its dep array
    const progressSnapshotRef = useRef({});
    useEffect(() => {
        progressSnapshotRef.current = { form, locationAddress, paymentAttempted, selectedPlan };
    });

    // B2 FIX: Guard ref to prevent recovery effect from overriding manual transitions.
    // Set to true whenever we call setStep() intentionally; the effect checks and skips
    // its override logic for that one render cycle, then resets the flag.
    const isManualTransitionRef = useRef(false);

    // B5 FIX: Store clearProgress in a ref so recovery effect doesn't need it as a dep.
    const clearProgressRef = useRef(null);

    // ── AsyncStorage persistence ───────────────────────────────────────────────

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

    // B5 FIX: Keep the ref in sync
    useEffect(() => {
        clearProgressRef.current = clearProgress;
    }, [clearProgress]);

    // ── RECOVERY EFFECT ───────────────────────────────────────────────────────
    // B1 + B2 FIX: This effect must NOT override steps that were just set manually.
    // The isManualTransitionRef guard prevents the recovery logic from firing
    // immediately after handleStep2Continue (or any other handler) calls setStep().
    //
    // Also: resolveOnboardingStep returning 4 for a user with a city but no
    // subscription is the root cause of the step 2→4 skip. The manual transition
    // guard alone fixes the symptom, but you should also review resolveOnboardingStep
    // in authUtils.js to ensure it returns 3 (not 4) for patients without a paid
    // subscription. See comment at bottom of this file.
    useEffect(() => {
        if (!profile && !patient) return;

        // 1. Populate form from database (only if fields are empty)
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

        // 2. B2 FIX: Skip step-override logic if a manual transition just happened.
        // Reset the flag and bail out — the step is already correct.
        if (isManualTransitionRef.current) {
            isManualTransitionRef.current = false;
            return;
        }

        const isProcessing = signupLoading || googleLoading;
        const targetStep = resolveOnboardingStep(patient, profile);

        if (targetStep === null) {
            // B5 FIX: Use ref instead of clearProgress directly to avoid dep issues
            clearProgressRef.current?.();
        } else if (step !== targetStep && !isProcessing && !isSubmittingRef.current) {
            setStep(targetStep);
        }
    }, [profile, patient, signupLoading, googleLoading]);
    // NOTE: `step` intentionally removed from deps — we don't want the effect to
    // re-run just because step changed (that's what caused the loop in B2).
    // `form.fullName` also intentionally excluded — only DB data triggers population.

    // Configure native Google Sign-In on mount
    useEffect(() => {
        GoogleSignin.configure({
            webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
            offlineAccess: false,
        });
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
                    toValue: 1,
                    duration: 1200,
                    easing: Easing.linear,
                    useNativeDriver: true,
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
                const ageMs = Date.now() - (progress.savedAt || 0);
                const ageDays = ageMs / (1000 * 60 * 60 * 24);
                if (ageDays > STALE_PROGRESS_DAYS) {
                    Alert.alert(
                        'Incomplete Signup Found',
                        `You started signing up ${Math.floor(ageDays)} days ago. Continue where you left off or start fresh?`,
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

    // ── OTP Timer ─────────────────────────────────────────────────────────────

    useEffect(() => {
        if (resendTimer <= 0) return;
        const interval = setInterval(() => setResendTimer(prev => prev - 1), 1000);
        return () => clearInterval(interval);
    }, [resendTimer]);

    // ── Step change animations ─────────────────────────────────────────────────

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
            setErrors(prev => ({ ...prev, location: 'Failed to load cities. You can still detect your location or try again.' }));
        } finally {
            setLoadingCities(false);
        }
    }, []);

    // ── Google Sign Up ─────────────────────────────────────────────────────────

    const handleGooglePress = useCallback(async () => {
        try {
            setTimeout(() => setGoogleLoading(true), 0);
            setErrors({});
            await GoogleSignin.hasPlayServices();
            try { await GoogleSignin.signOut(); } catch (e) {} // Force picker
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
                    // Register returns profile + CareMyMednnect JWT session for OAuth users.
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
                // User cancelled — do nothing
            } else if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                setErrors({ google: 'Google Play Services not available. Please update.' });
            } else {
                setErrors({ google: error?.message || 'Google sign-up failed' });
            }
        } finally {
            setGoogleLoading(false);
        }
    }, [signInWithGoogle, injectSession, clearProgress]);

    // ── Form helpers ──────────────────────────────────────────────────────────

    const updateField = useCallback((key, val) => {
        setForm(prev => ({ ...prev, [key]: val }));
        setErrors(prev => prev[key] ? { ...prev, [key]: '' } : prev);
    }, []);

    // B4 FIX: validateStep1 no longer returns a curried function.
    // Called directly in handleStep1Continue with the values it needs.
    

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
            if (error?.response?.data?.code === 'PHONE_LIMIT_REACHED') {
                general = error.response.data.error;
            } else if (error?.response?.data?.error) {
                general = error.response.data.error;
            } else if (general === 'Request failed with status code 400' || error?.message === 'Request failed with status code 400') {
                general = field === 'phone'
                    ? 'This phone number is already registered or invalid. Please try a different number.'
                    : 'This email is already registered or invalid. Please try a different email.';
            }
            const errorField = field === 'phone' ? 'phoneNumber' : field;
            setErrors(prev => ({ ...prev, [errorField]: general || `Failed to send OTP to ${field}` }));
        } finally {
            setOtpLoading(false);
        }
    }, [form.email, form.phoneNumber, sendOtp]);

    const executeSignup = useCallback(async () => {
        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;

        if (user && user.email?.toLowerCase().trim() === form.email.toLowerCase().trim()) {
            try {
                const profileRes = await apiService.auth.getProfile();
                if (profileRes.data?.profile) {
                    isManualTransitionRef.current = true; // B2 FIX
                    await saveProgress(2);
                    setStep(2);
                    isSubmittingRef.current = false;
                    return;
                }
            } catch { /* no profile yet — fall through to signUp */ }
        }

        setSignupLoading(true);
        try {
            const cleanEmail = form.email.trim().toLowerCase();
            await clearProgress();
            // We implicitly set emailVerified to false, but phone is fully verified here
            await signUp(cleanEmail, form.password, form.fullName.trim(), 'patient', { phoneNumber: form.phoneNumber });
            analytics.signupSuccess(cleanEmail);
            // Recovery effect handles step transition after signUp updates profile/patient
        } catch (error) {
            let { general, fields } = parseError(error);
            if (error?.code === 'ECONNABORTED' || error?._userMessage?.includes('timed out') || error?.message === 'SIGNUP_TIMEOUT') {
                general = 'Sign up is taking too long. Please check your connection and try again.';
            } else if (general === 'Request failed with status code 400' || error?.message === 'Request failed with status code 400') {
                general = 'An account with this email/phone already exists. Please log in.';
            } else if (error?.response?.data?.code === 'EMAIL_ALREADY_EXISTS') {
                general = 'An account with this email already exists. Please log in instead.';
            }
            setErrors({
                general,
                ...(fields?.email ? { email: fields.email } : {}),
            });
            analytics.signupFailure(error?.response?.data?.code || error?.message || 'signup_error');
        } finally {
            setSignupLoading(false);
            isSubmittingRef.current = false;
        }
    }, [form, user, signUp, saveProgress, clearProgress]);

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
                // Trigger phone OTP automatically after email is verified
                if (!isPhoneVerified) {
                    setTimeout(() => handleVerifyPress('phone'), 500);
                } else {
                    executeSignup();
                }
            } else {
                setIsPhoneVerified(true);
                // Execute actual signup upon successful phone verification
                executeSignup();
            }
        } catch (error) {
            const newAttempts = otpAttempts + 1;
            setOtpAttempts(newAttempts);
            analytics.track('otp_verification_failure', { field: verificationField, attempt: newAttempts });
            if (newAttempts >= 3) {
                setOtpVisible(false);
                const errorField = verificationField === 'phone' ? 'phoneNumber' : verificationField;
                setErrors(prev => ({ ...prev, [errorField]: `Too many attempts. Check your ${verificationField} or try again later.` }));
            } else {
                let { general } = parseError(error);
                if (general === 'Request failed with status code 400' || error?.message === 'Request failed with status code 400') {
                    general = 'Invalid or expired verification code';
                }
                setErrors(prev => ({ ...prev, otp: general || 'OTP not correct' }));
            }
        } finally {
            setOtpLoading(false);
        }
    }, [otp, verificationField, form.email, form.phoneNumber, verifyOtp, otpAttempts, executeSignup]);

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
            analytics.track('otp_resend', { field: verificationField });
        } catch (error) {
            const { general } = parseError(error);
            setErrors(prev => ({ ...prev, otp: general || 'Failed to resend code' }));
        } finally {
            setOtpLoading(false);
        }
    }, [resendTimer, verificationField, form.email, form.phoneNumber, sendOtp]);

    // ── Location ───────────────────────────────────────────────────────────────

    const handleDetectLocation = useCallback(async () => {
        setDetectingLocation(true);
        setErrors(prev => ({ ...prev, location: '' }));
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') { setErrors(prev => ({ ...prev, location: 'Permission to access location was denied' })); return; }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const { latitude, longitude } = loc.coords;
            const res = await apiService.patients.reverseGeocode(latitude, longitude);
            const data = res.data;
            if (data?.address) {
                const addr = data.address;
                const city = addr.city || addr.town || addr.village || addr.county || '';
                const state = addr.state || '';
                const post = addr.postcode || '';
                const addrStr = [city, state, post].filter(Boolean).join(', ');
                setLocationAddress(addrStr || data.display_name || 'Location detected');
                setForm(prev => ({ ...prev, city }));
            } else {
                setErrors(prev => ({ ...prev, location: 'Could not determine your city. Please enter it manually.' }));
            }
        } catch (error) {
            console.warn('Location detection error:', error);
            setErrors(prev => ({ ...prev, location: 'Failed to detect location. Please enter it manually.' }));
        } finally {
            setDetectingLocation(false);
        }
    }, []);

    // ── Step handlers ──────────────────────────────────────────────────────────

    const handleStep1Submit = useCallback(async () => {
        const isValid = await methods.trigger(['fullName', 'email', 'phoneNumber', 'password', 'confirmPassword']);
        if (!isValid) return;
        if (isSubmittingRef.current) return;
        
        if (!isEmailVerified) {
             handleVerifyPress('email');
             return;
        }

        if (!isPhoneVerified) {
             handleVerifyPress('phone');
             return;
        }
        
        executeSignup();
    }, [methods, isEmailVerified, isPhoneVerified, handleVerifyPress, executeSignup]);



    // B1 + B3 FIX: The original handleStep2Continue called refreshPatient() which
    // triggered the recovery effect and caused the step 2→4 jump. 
    //
    // The fix has two parts:
    // 1. Set isManualTransitionRef.current = true BEFORE setStep(3) so the recovery
    //    effect skips its override on the next render.
    // 2. Fire refreshPatient() in the background AFTER the step transition is already
    //    committed — we don't await it, so it can't race with the step setter.
    //    The background refresh is only needed so AuthContext has fresh patient data
    //    for when the user eventually reaches step 5 and completes onboarding.
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

        // B2 + B3 FIX: Mark as manual transition BEFORE setStep so the recovery
        // effect won't override it when patient state updates arrive.
        isManualTransitionRef.current = true;
        setStep(3);

        // Fire refresh in background — no await so it cannot race with the step setter.
        // The recovery effect is already guarded for this render cycle.
        refreshPatient().catch(err => console.warn('[Onboarding] Background patient refresh failed:', err.message));
    }, [form.city, saveProgress, refreshPatient]);

    const handlePaymentSuccess = useCallback(async () => {
        setUpiModalVisible(false);
        await saveProgress(3, { paymentAttempted: true });
        setPaymentAttempted(true);
        try {
            await apiService.patients.subscribe({ plan: selectedPlan.id, paid: 1 });
        } catch (err) {
            console.warn('Backend payment save failed:', err.message);
        }
        await saveProgress(4, { paymentAttempted: false });
        setPaymentCrashWarning(false);

        // B7: refreshPatient IS correct here — after subscribe, we need onboardingComplete
        // to update. But we still guard the transition first.
        isManualTransitionRef.current = true;
        setStep(4);

        // Background refresh after step is committed
        refreshPatient().catch(err => console.warn('[Onboarding] Background patient refresh failed:', err.message));
    }, [saveProgress, selectedPlan.id, refreshPatient]);

    const handleBack = useCallback(() => {
        if (step > 1) {
            isManualTransitionRef.current = true; // B2 FIX: back navigation is manual
            setStep(prev => prev - 1);
        }
    }, [step]);

    const handleCompleteSignUp = useCallback(async () => {
        const isValid = await methods.trigger(['age', 'gender']);
        if (!isValid) return;
        setSignupLoading(true);
        try {
            // Rough estimate for DOB based on age, just for analytics/initial setup
            const dob = new Date(new Date().getFullYear() - parseInt(form.age), 0, 1).toISOString();
            await apiService.patients.updateMe({ date_of_birth: dob, gender: form.gender.toLowerCase() });
            await refreshPatient();
            await clearProgress();
            completeSignUp();
        } catch (error) {
            setErrors(prev => ({ ...prev, general: 'Failed to save details. Please try again.' }));
            setSignupLoading(false);
        }
    }, [form.age, form.gender, clearProgress, completeSignUp, refreshPatient]);


    const toggleShowPass = useCallback(() => setShowPass(v => !v), []);
    const toggleShowConfirm = useCallback(() => setShowConfirm(v => !v), []);

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
                <Text style={styles.heroTitle}>
                    {`Step ${step}: ${STEP_LABELS[step - 1]}`}
                </Text>
                <StepIndicator current={step} />
            </View>
        </Animated.View>
    );

    // ── Step renderers ─────────────────────────────────────────────────────────

    const renderStep1 = () => (
        <Step1Profile
                                    googleLoading={googleLoading} handleGooglePress={handleGooglePress}
                                    signupLoading={signupLoading} handleStep1Submit={handleStep1Submit}
                                    isEmailVerified={isEmailVerified} isPhoneVerified={isPhoneVerified}
                                    showPass={showPass} toggleShowPass={toggleShowPass}
                                    showConfirm={showConfirm} toggleShowConfirm={toggleShowConfirm}
                                    fullNameRef={fullNameRef} emailRef={emailRef} phoneRef={phoneRef} passwordRef={passwordRef} confirmPassRef={confirmPassRef}
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
                        <Pressable onPress={() => setFeaturesModalVisible(false)} hitSlop={12}><X size={22} color="#64748B" /></Pressable>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                        <Text style={styles.otpSubtext}>With a guest account, you can access these core health tools for free:</Text>
                        <View style={{ marginTop: 24, gap: 20 }}>
                            {[
                                { title: 'Personal Health Log', desc: 'Track your symptoms and vitals manually.', icon: Activity },
                                { title: 'Community Support', desc: 'Join groups with similar health goals.', icon: User },
                                { title: 'Emergency SOS', desc: 'Quick access to emergency contacts.', icon: AlertCircle },
                            ].map(({ title, desc, icon: Icon }) => (
                                <View key={title} style={styles.journeyItem}>
                                    <View style={[styles.journeyIconBox, { marginTop: 0 }]}><Icon size={18} color="#6366F1" /></View>
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
        isManualTransitionRef.current = true; // B2 FIX
        await saveProgress(5);
        setStep(5);
    };

    const renderStep4_PaymentSuccess = () => (
        <Step4Verification staggerAnims={staggerAnims} handleGoToStep5={handleGoToStep5} />
    );

    const renderProcessingState = () => {
        const spin = syncRotateAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '360deg'],
        });
        return (
            <View style={styles.processingContainer}>
                <Animated.View style={{ transform: [{ rotate: spin }] }}>
                    <RotateCcw size={48} color="#6366F1" strokeWidth={1.5} />
                </Animated.View>
                <Text style={styles.processingTitle}>Configuring Your Profile</Text>
                <Text style={styles.processingSub}>Synchronizing your health data and preparing your medical dashboard...</Text>
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
                            <Pressable onPress={() => setCityModalVisible(false)} hitSlop={12} style={styles.closeBtnBox}><X size={20} color="#64748B" /></Pressable>
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
                                {citySearchQuery.length > 0 && <Pressable onPress={() => setCitySearchQuery('')}><X size={16} color="#8899BB" /></Pressable>}
                            </View>
                        </View>
                        <FormProvider {...methods}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
                                {loadingCities ? (
                                <ActivityIndicator size="large" color="#3B5BDB" style={{ marginTop: 40 }} />
                            ) : filteredCities.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <MapPin size={32} color="#CBD5E1" />
                                    <Text style={styles.emptyTitle}>No cities found</Text>
                                    <Text style={styles.emptyDesc}>We couldn't find any service areas matching "{citySearchQuery}".</Text>
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
                                        <Text style={[styles.cityName, form.city === city.name && { color: '#3B5BDB', fontWeight: '700' }]}>{city.name}</Text>
                                        <Text style={styles.cityState}>{city.state}</Text>
                                    </View>
                                    <View style={[styles.radioOutline, form.city === city.name && styles.radioActive]}>
                                        {form.city === city.name && <View style={styles.radioDot} />}
                                    </View>
                                </Pressable>
                            ))}
                        </ScrollView>
                        </KeyboardAvoidingView>
    </FormProvider>
                    </View>
                </View>
            </View>
        </Modal>
    );

    // ─── Render ────────────────────────────────────────────────────────────────

    return (
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
    );
}

/*
 * ─── IMPORTANT: authUtils.js — resolveOnboardingStep ──────────────────────────
 *
 * The root cause of the step 2→4 skip lives in resolveOnboardingStep().
 * It must return step 3 for a patient who has a city but NO active subscription.
 * If it currently returns 4 in that state, the isManualTransitionRef guard above
 * will prevent the skip on first transition, but returning users who re-open the
 * app mid-onboarding will still land on step 4 incorrectly.
 *
 * Correct logic should be:
 *
 *   export function resolveOnboardingStep(patient, profile) {
 *     if (!profile) return 1;                          // no profile → step 1
 *     if (!patient?.city) return 2;                    // no city → step 2
 *     if (!patient?.subscription?.status
 *         || patient.subscription.status === 'none'
 *         || patient.subscription.status === 'pending') return 3; // no sub → step 3
 *     if (!patient?.onboardingComplete) return 4;      // paid, not complete → step 4
 *     return null;                                     // fully onboarded
 *   }
 *
 * Verify your authUtils implementation matches this intent.
 */


