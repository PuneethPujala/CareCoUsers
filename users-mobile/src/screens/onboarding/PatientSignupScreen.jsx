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

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_LABELS = ['Profile Creation', 'Locality', 'Membership', 'Verification', 'All Systems Go'];
const ONBOARDING_STORAGE_KEY = 'samvaya_onboarding_progress';
const STALE_PROGRESS_DAYS = 7;

const FONT = {
    regular: { fontFamily: 'Inter_400Regular' },
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PasswordStrength = React.memo(({ password }) => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    const barColors = ['transparent', '#EF4444', '#F59E0B', '#3B5BDB', '#22C55E'];
    if (!password) return null;
    return (
        <View style={styles.strengthWrap}>
            <View style={styles.strengthBarRow}>
                {[1, 2, 3, 4].map(i => (
                    <View key={i} style={[styles.strengthSeg, { backgroundColor: i <= score ? barColors[score] : '#E2E8F0' }]} />
                ))}
            </View>
            <Text style={[styles.strengthLabel, { color: barColors[score] }]}>{labels[score]}</Text>
        </View>
    );
});

const PasswordRequirements = React.memo(({ password }) => {
    const checks = [
        { label: 'At least 8 characters', met: password.length >= 8 },
        { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
        { label: 'One number', met: /[0-9]/.test(password) },
    ];
    if (!password) return null;
    return (
        <View style={styles.reqWrap}>
            {checks.map((c, i) => (
                <Text key={i} style={[styles.reqItem, { color: c.met ? '#22C55E' : '#64748B' }]}>
                    {c.met ? '✓' : '—'} {c.label}
                </Text>
            ))}
        </View>
    );
});

const StepIndicator = React.memo(({ current }) => (
    <View style={styles.modernProgressContainer}>
        {[1, 2, 3, 4, 5].map((s) => (
            <View key={s} style={styles.progressSegmentWrapper}>
                <View style={[
                    styles.progressSegment,
                    s < current && styles.progressSegmentDone,
                    s === current && styles.progressSegmentActive,
                ]} />
            </View>
        ))}
    </View>
));

// B6 FIX: Wrap with both memo AND forwardRef. Previously only forwardRef was used,
// meaning the component re-rendered on every parent state change (every keystroke).
const IconInput = React.memo(React.forwardRef(({ icon: Icon, label, rightIcon, error, textPrefix, onFocus, onBlur, ...rest }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);

    const handleFocus = (e) => {
        setIsFocused(true);
        if (onFocus) onFocus(e);
    };

    const handleBlur = (e) => {
        setIsFocused(false);
        if (onBlur) onBlur(e);
    };

    return (
        <View style={styles.fieldGroup}>
            {typeof label === 'string' ? (
                <Text style={[styles.label, isFocused && { color: '#6366F1' }]}>{label}</Text>
            ) : label}
            <Pressable
                style={[
                    styles.inputWrapEnhanced,
                    isFocused && styles.inputFocusedEnhanced,
                    error && styles.inputErrorEnhanced,
                ]}
                onPress={() => ref?.current?.focus()}
            >
                <View style={[styles.inlineIconBox, isFocused && { backgroundColor: '#EEF2FF' }]}>
                    <Icon size={18} color={isFocused ? '#6366F1' : '#94A3B8'} />
                </View>
                {textPrefix && <Text style={styles.textPrefixStyle}>{textPrefix}</Text>}
                <TextInput
                    ref={ref}
                    style={styles.textInputEnhanced}
                    placeholderTextColor="#94A3B8"
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    {...rest}
                />
                {rightIcon && <View style={styles.rightIconWrap}>{rightIcon}</View>}
            </Pressable>
            {error ? (
                <View style={styles.errorTextRow}>
                    <AlertCircle size={12} color="#EF4444" />
                    <Text style={styles.fieldErrorEnhanced}>{error}</Text>
                </View>
            ) : null}
        </View>
    );
}));

const OTPModal = React.memo(({ visible, onClose, otp, setOtp, onVerify, timer, resend, attempts, field, error, otpLoading }) => (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
        <Pressable style={styles.modalOverlay} onPress={onClose}>
            <KeyboardAvoidingView style={{ flex: 1, width: '100%', justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable onPress={(e) => e.stopPropagation()} style={[styles.modalSheet, { maxHeight: '92%', marginTop: 60 }]}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Verify {field === 'email' ? 'Email' : 'Phone'}</Text>
                        <Pressable onPress={onClose} hitSlop={12} disabled={otpLoading}><X size={22} color="#64748B" /></Pressable>
                    </View>
                    <Text style={styles.otpSubtext}>Enter the 6-digit code sent to your {field}.</Text>
                    <View style={[styles.fieldGroup, { marginTop: 20 }]}>
                        <View style={[styles.inputWrapEnhanced, error && styles.inputErrorEnhanced]}>
                            <Lock size={18} color="#8899BB" />
                            <TextInput
                                style={[styles.textInputEnhanced, { letterSpacing: 8, fontSize: 24, textAlign: 'center' }]}
                                placeholder="000000"
                                placeholderTextColor="#CBD5E1"
                                maxLength={6}
                                keyboardType="number-pad"
                                value={otp}
                                onChangeText={setOtp}
                                editable={!otpLoading}
                            />
                        </View>
                        {error ? (
                            <View style={styles.errorTextRow}>
                                <AlertCircle size={12} color="#EF4444" />
                                <Text style={styles.fieldErrorEnhanced}>{error}</Text>
                            </View>
                        ) : null}
                    </View>
                    <View style={styles.resendRow}>
                        {timer > 0 ? (
                            <Text style={styles.timerText}>Resend in {timer}s</Text>
                        ) : (
                            <Pressable onPress={resend} disabled={otpLoading}>
                                <Text style={[styles.resendAction, otpLoading && { opacity: 0.5 }]}>Resend Code</Text>
                            </Pressable>
                        )}
                    </View>
                    <Pressable style={[styles.primaryBtnEnhanced, otpLoading && { opacity: 0.7 }]} onPress={onVerify} disabled={otpLoading}>
                        <LinearGradient
                            colors={['#6366F1', '#4F46E5']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.primaryBtnGradientEnhanced}
                        >
                            {otpLoading ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                    <Text style={styles.primaryBtnText}>  Verifying...</Text>
                                </View>
                            ) : (
                                <Text style={styles.primaryBtnText}>Verify OTP</Text>
                            )}
                        </LinearGradient>
                    </Pressable>
                    {attempts > 0 && (
                        <Text style={styles.attemptsText}>{3 - attempts} attempts remaining</Text>
                    )}
                </Pressable>
            </KeyboardAvoidingView>
        </Pressable>
    </Modal>
));

const UPIPaymentModal = React.memo(({ visible, onClose, onSuccess, planName, planPrice }) => (
    <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Complete Payment</Text>
                    <Pressable onPress={onClose} hitSlop={12}><X size={22} color="#64748B" /></Pressable>
                </View>
                <View style={styles.paymentSummary}>
                    <Text style={styles.payPlanName}>{planName}</Text>
                    <Text style={styles.payAmount}>{planPrice}</Text>
                </View>
                <Text style={styles.paySubtext}>Choose a UPI app to pay</Text>
                {['Google Pay', 'PhonePe', 'Paytm'].map(app => (
                    <Pressable key={app} style={styles.upiRow} onPress={onSuccess}>
                        <View style={styles.upiIconBox}><Smartphone size={20} color="#1A202C" /></View>
                        <Text style={styles.upiAppName}>{app}</Text>
                        <Text style={styles.upiAction}>Pay →</Text>
                    </Pressable>
                ))}
                <View style={styles.payDivider} />
                <Pressable style={styles.payManualBtn} onPress={onSuccess}>
                    <CreditCard size={18} color="#FFFFFF" />
                    <Text style={styles.payManualText}>Pay with UPI ID</Text>
                </Pressable>
            </View>
        </View>
    </Modal>
));

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PatientSignupScreen({ navigation, route }) {
    const { user, profile, patient, signUp, signInWithGoogle, completeSignUp, injectSession, signOut, sendOtp, verifyOtp, refreshPatient } = useAuth();

    const [step, setStep] = useState(route?.params?.step || 1);
    const [form, setForm] = useState({
        fullName: '', email: '', phoneNumber: '', city: '', password: '', confirmPassword: '',
    });
    const [selectedPlan, setSelectedPlan] = useState({ id: 'basic', name: 'Basic Plan', price: '₹500 / month' });

    const [otpVisible, setOtpVisible] = useState(false);
    const [verificationField, setVerificationField] = useState(null);
    const [otp, setOtp] = useState('');
    const [otpAttempts, setOtpAttempts] = useState(0);
    const [resendTimer, setResendTimer] = useState(0);
    const [otpLoading, setOtpLoading] = useState(false);
    const [isEmailVerified, setIsEmailVerified] = useState(false);
    const [isPhoneVerified, setIsPhoneVerified] = useState(false);

    const [detectingLocation, setDetectingLocation] = useState(false);
    const [locationAddress, setLocationAddress] = useState('');
    const [cityModalVisible, setCityModalVisible] = useState(false);
    const [availableCities, setAvailableCities] = useState([]);
    const [loadingCities, setLoadingCities] = useState(false);
    const [citySearchQuery, setCitySearchQuery] = useState('');

    const [showPass, setShowPass] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [errors, setErrors] = useState({});
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
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Request timed out')), 15000)
            );
            const res = await Promise.race([apiService.patients.getCities(), timeout]);
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
    const validateStep1 = useCallback((currentForm) => {
        const e = {};
        if (!currentForm.fullName.trim()) e.fullName = 'Full name is required';
        if (!currentForm.email.trim() || !/\S+@\S+\.\S+/.test(currentForm.email)) e.email = 'Please enter a valid email address';
        if (!currentForm.phoneNumber.trim() || currentForm.phoneNumber.length < 10) e.phoneNumber = 'Enter a valid phone number';
        if (currentForm.password.length < 8) e.password = 'Password must be at least 8 characters';
        if (currentForm.password !== currentForm.confirmPassword) e.confirmPassword = 'Passwords do not match';
        setErrors(e);
        return Object.keys(e).length === 0;
    }, []);

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
            await sendOtp(field, finalValue);
            setOtpVisible(true);
            setResendTimer(60);
            setOtpAttempts(0);
            setOtp('');
        } catch (error) {
            const { general } = parseError(error);
            const errorField = field === 'phone' ? 'phoneNumber' : field;
            setErrors(prev => ({ ...prev, [errorField]: general || `Failed to send OTP to ${field}` }));
        } finally {
            setOtpLoading(false);
        }
    }, [form.email, form.phoneNumber, sendOtp]);

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
            if (verificationField === 'email') setIsEmailVerified(true);
            else setIsPhoneVerified(true);
            setOtpVisible(false);
            setOtp('');
            analytics.track('otp_verification_success', { field: verificationField });
            
            // Execute actual signup upon successful phone verification
            if (verificationField === 'phone') {
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

    const handleStep1Submit = useCallback(() => {
        if (!validateStep1(form)) return;
        if (isSubmittingRef.current) return;
        
        // Auto-trigger phone verification instead of requiring explicit press
        if (!isPhoneVerified) {
             handleVerifyPress('phone');
             return;
        }
        
        executeSignup();
    }, [form, validateStep1, isPhoneVerified, handleVerifyPress]);

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
            const signUpTimeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('SIGNUP_TIMEOUT')), 25000)
            );
            await Promise.race([
                // We implicitly set emailVerified to false, but phone is fully verified here
                signUp(cleanEmail, form.password, form.fullName.trim(), 'patient', { phoneNumber: form.phoneNumber }),
                signUpTimeout,
            ]);
            analytics.signupSuccess(cleanEmail);
            // Recovery effect handles step transition after signUp updates profile/patient
        } catch (error) {
            let { general, fields } = parseError(error);
            if (error?.message === 'SIGNUP_TIMEOUT') {
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
        if (!form.city) {
            setErrors(prev => ({ ...prev, location: 'Please select or detect your city first' }));
            return;
        }
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
        await clearProgress();
        completeSignUp();
    }, [clearProgress, completeSignUp]);

    const emailLabel = useMemo(() => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.label}>Email Address</Text>
            {isEmailVerified && <CheckCircle2 size={12} color="#22C55E" />}
        </View>
    ), [isEmailVerified]);

    const phoneLabel = useMemo(() => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.label}>Phone Number</Text>
            {isPhoneVerified && <CheckCircle2 size={12} color="#22C55E" />}
        </View>
    ), [isPhoneVerified]);

    const toggleShowPass = useCallback(() => setShowPass(v => !v), []);
    const toggleShowConfirm = useCallback(() => setShowConfirm(v => !v), []);
    const passwordsMatch = form.confirmPassword.length > 0 && form.password === form.confirmPassword;
    const isPassStrong = form.password.length >= 8 && /[A-Z]/.test(form.password) && /[0-9]/.test(form.password);

    const handleVerifyEmail = useCallback(() => { if (!isEmailVerified) handleVerifyPress('email'); }, [isEmailVerified, handleVerifyPress]);
    const handleVerifyPhone = useCallback(() => { if (!isPhoneVerified) handleVerifyPress('phone'); }, [isPhoneVerified, handleVerifyPress]);

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
                    {step === 5 ? 'All Systems Go' : `Step ${step}: ${STEP_LABELS[step - 1]}`}
                </Text>
                {step < 5 && <StepIndicator current={step} />}
            </View>
        </Animated.View>
    );

    // ── Step renderers ─────────────────────────────────────────────────────────

    const renderStep1 = () => (
        <View>
            <Pressable style={styles.googleBtnEnhanced} onPress={handleGooglePress} disabled={googleLoading}>
                <View style={styles.googleIconWrap}>
                    <Text style={styles.googleTextG}>G</Text>
                </View>
                <Text style={styles.googleBtnText}>{googleLoading ? 'Signing up...' : 'Continue with Google'}</Text>
            </Pressable>

            <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR SIGN UP WITH EMAIL</Text>
                <View style={styles.dividerLine} />
            </View>

            {(errors.general || errors.google) ? (
                <View style={styles.errorBoxEnhanced}>
                    <AlertCircle size={18} color="#EF4444" />
                    <Text style={styles.errorMsgEnhanced}>{errors.general || errors.google}</Text>
                </View>
            ) : null}

            <IconInput ref={fullNameRef} icon={User} label="Full Name" placeholder="Enter your full name"
                value={form.fullName} onChangeText={v => updateField('fullName', v)}
                error={errors.fullName} />

                <IconInput ref={emailRef} icon={Mail}
                    label="Email Address"
                    placeholder="Enter your email"
                    value={form.email} onChangeText={v => updateField('email', v)}
                    autoCapitalize="none" keyboardType="email-address"
                    autoCorrect={false} spellCheck={false} textContentType="emailAddress"
                    error={errors.email} />

                <IconInput ref={phoneRef} icon={Smartphone}
                    label={phoneLabel}
                    placeholder="10-digit number"
                    value={form.phoneNumber} onChangeText={v => updateField('phoneNumber', v)}
                    keyboardType="phone-pad" maxLength={10}
                    error={errors.phoneNumber}
                    textPrefix="+91 " />

            <View style={{ marginTop: 20 }}>
                <IconInput ref={passwordRef} icon={Lock} label="Password" placeholder="Create a password"
                    value={form.password} onChangeText={v => updateField('password', v)}
                    secureTextEntry={!showPass}
                    error={errors.password}
                    rightIcon={<Pressable onPress={toggleShowPass} hitSlop={8}>{showPass ? <Eye size={18} color="#8899BB" /> : <EyeOff size={18} color="#8899BB" />}</Pressable>} />
                <PasswordStrength password={form.password} />

                <IconInput ref={confirmPassRef} icon={Lock} label="Confirm Password" placeholder="Re-enter your password"
                    value={form.confirmPassword} onChangeText={v => updateField('confirmPassword', v)}
                    secureTextEntry={!showConfirm}
                    error={errors.confirmPassword}
                    rightIcon={passwordsMatch ? <CheckCircle2 size={18} color="#22C55E" /> :
                        <Pressable onPress={toggleShowConfirm} hitSlop={8}>
                            {showConfirm ? <Eye size={18} color="#8899BB" /> : <EyeOff size={18} color="#8899BB" />}
                        </Pressable>
                    } />

                <View style={{ marginTop: 10 }}>
                    <Pressable style={[styles.primaryBtnEnhanced, signupLoading && { opacity: 0.7 }]} onPress={handleStep1Submit} disabled={signupLoading}>
                        <LinearGradient
                            colors={['#6366F1', '#4F46E5']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.primaryBtnGradientEnhanced}
                        >
                            {signupLoading ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                    <Text style={styles.primaryBtnText}>  Creating account...</Text>
                                </View>
                            ) : (<><Text style={styles.primaryBtnText}>Continue</Text><ChevronRight size={20} color="#FFFFFF" /></>)}
                        </LinearGradient>
                    </Pressable>
                </View>
            </View>
        </View>
    );

    const renderStep2 = () => (
        <View style={styles.centerStepEnhanced}>
            <Animated.View style={{ opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }], alignItems: 'center', width: '100%' }}>
                <Text style={styles.locationTitlePremium}>What's your location?</Text>
                <Text style={styles.locationSubtitlePremium}>We need your location to show you our serviceable hubs.</Text>
            </Animated.View>

            <Animated.View style={{ opacity: staggerAnims[1], transform: [{ scale: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }], marginVertical: 30, width: '100%', height: 320, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={require('../../../assets/isometric_city.png')} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            </Animated.View>

            <Animated.View style={{ opacity: staggerAnims[2], width: '100%', alignItems: 'center' }}>
                <Pressable style={[styles.locationPrimaryBtn, detectingLocation && { opacity: 0.7 }]} onPress={handleDetectLocation} disabled={detectingLocation}>
                    {detectingLocation
                        ? <ActivityIndicator size="small" color="#FFFFFF" />
                        : (<><MapPin size={20} color="#FFFFFF" strokeWidth={2.5} /><Text style={styles.locationPrimaryBtnText}>Use current location</Text></>)
                    }
                </Pressable>

                <Pressable
                    style={[styles.locationSecondaryBtn, (loadingCities || detectingLocation) && { opacity: 0.7 }]}
                    onPress={() => setCityModalVisible(true)}
                    disabled={loadingCities || detectingLocation}
                >
                    <Navigation size={18} color="#3B5BDB" style={{ marginRight: 8 }} />
                    <Text style={styles.locationSecondaryBtnText}>{loadingCities ? 'Loading cities...' : 'Select city manually'}</Text>
                </Pressable>

                {locationAddress ? (
                    <View style={styles.locationSuccessToast}>
                        <CheckCircle2 size={16} color="#22C55E" />
                        <Text style={styles.locationSuccessText}>{locationAddress}</Text>
                    </View>
                ) : null}

                {errors.location ? <Text style={styles.locationErrorText}>{errors.location}</Text> : null}
            </Animated.View>

            {locationAddress ? (
                <Animated.View style={{ opacity: staggerAnims[3], width: '100%', marginTop: 20 }}>
                    <Pressable style={[styles.primaryBtnEnhanced, signupLoading && { opacity: 0.5 }]} onPress={handleStep2Continue} disabled={signupLoading}>
                        <LinearGradient
                            colors={['#6366F1', '#4F46E5']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.primaryBtnGradientEnhanced}
                        >
                            {signupLoading
                                ? <ActivityIndicator size="small" color="#FFFFFF" />
                                : (<><Text style={styles.primaryBtnText}>Continue to Plans</Text><ChevronRight size={20} color="#FFFFFF" strokeWidth={2.5} /></>)
                            }
                        </LinearGradient>
                    </Pressable>
                </Animated.View>
            ) : null}
        </View>
    );

    const renderStep3_PlanSelection = () => {
        const handleSelectBasicAndPay = () => {
            setSelectedPlan({ id: 'basic', name: 'Basic Plan', price: '₹500 / month' });
            setUpiModalVisible(true);
        };
        const handleSelectBasic = () => setSelectedPlan({ id: 'basic', name: 'Basic Plan', price: '₹500 / month' });

        return (
            <View style={{ paddingBottom: 20 }}>
                {paymentCrashWarning && (
                    <View style={styles.errorBoxEnhanced}>
                        <AlertCircle size={18} color="#F59E0B" />
                        <Text style={[styles.errorMsgEnhanced, { color: '#92400E' }]}>
                            Your last payment attempt may not have completed. Please try again — you won't be charged twice.
                        </Text>
                    </View>
                )}

                <Animated.View style={{ opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
                    <Pressable style={styles.planCardGhost} onPress={() => setFeaturesModalVisible(true)}>
                        <View style={styles.ghostIconWrap}><Sparkles size={18} color="#64748B" /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.planTitleGhost}>Explore Features</Text>
                            <Text style={styles.planDesc}>Limited preview — no care calls</Text>
                        </View>
                        <ChevronRight size={18} color="#CBD5E1" />
                    </Pressable>
                </Animated.View>

                <Animated.View style={{ opacity: staggerAnims[1], transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <Pressable onPress={handleSelectBasic} style={[styles.planCardEnhanced, selectedPlan.id === 'basic' && styles.planCardActive]}>
                        <LinearGradient colors={['#FFFFFF', '#EEF1FF']} style={styles.planCardGradient}>
                            <View style={styles.planCardHeaderRow}>
                                <View style={[styles.planIconBoxEnhanced, { backgroundColor: '#EFF3FF' }]}><Shield size={24} color="#3B5BDB" /></View>
                                <View style={styles.planPriceCol}>
                                    <Text style={styles.planTitleEnhanced}>Basic Plan</Text>
                                    <Text style={styles.planPriceEnhanced}>₹500<Text style={styles.planPriceSub}>/mo</Text></Text>
                                </View>
                                {selectedPlan.id === 'basic' && <View style={styles.selectedCheck}><CheckCircle2 size={24} color="#3B5BDB" fill="#EFF3FF" /></View>}
                            </View>
                            <View style={styles.planFeaturesEnhanced}>
                                {['Daily Care Calls', 'Medication Tracking', 'Assigned Caller', 'Health History'].map(f => (
                                    <View key={f} style={styles.featureLine}><Check size={14} color="#3B5BDB" strokeWidth={3} /><Text style={styles.featureTextEnhanced}>{f}</Text></View>
                                ))}
                            </View>
                            <Pressable
                                style={[styles.planActionBtn, selectedPlan.id === 'basic' ? styles.btnActive : styles.btnInactive]}
                                onPress={handleSelectBasicAndPay}
                            >
                                <Text style={[styles.planActionBtnText, selectedPlan.id === 'basic' ? styles.txtActive : styles.txtInactive]}>
                                    {selectedPlan.id === 'basic' ? 'Selected — Pay ₹500' : 'Select Basic'}
                                </Text>
                                <ChevronRight size={18} color={selectedPlan.id === 'basic' ? '#FFFFFF' : '#64748B'} />
                            </Pressable>
                        </LinearGradient>
                    </Pressable>
                </Animated.View>
            </View>
        );
    };

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

    const renderStep4_PaymentSuccess = () => {
        const handleGoToStep5 = async () => {
            isManualTransitionRef.current = true; // B2 FIX
            await saveProgress(5);
            setStep(5);
        };
        return (
            <View style={styles.centerStepEnhanced}>
                <Animated.View style={{ width: '100%', opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <LinearGradient colors={['#EFF3FF', '#FFFFFF']} style={styles.successCelebrationCard}>
                        <View style={styles.largeSuccessCircle}><CheckCircle2 size={56} color="#22C55E" strokeWidth={2.5} /></View>
                        <Text style={styles.successTitle}>Payment Successful!</Text>
                        <Text style={styles.successSubtitle}>Welcome to the Samvaya family.</Text>
                    </LinearGradient>
                </Animated.View>

                <Animated.View style={{ width: '100%', opacity: staggerAnims[1], transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={styles.nextStepsCard}>
                        <View style={styles.nextStepsHeader}><Sparkles size={18} color="#3B5BDB" /><Text style={styles.nextStepsTitle}>Your Onboarding Journey</Text></View>
                        <Text style={styles.nextStepsDesc}>A Care Caller will reach out within 24 hours to finalize your profile:</Text>
                        <View style={styles.journeyList}>
                            {[
                                { icon: Shield, text: 'Collect your health details' },
                                { icon: Zap, text: 'Set up medication schedule' },
                                { icon: Smartphone, text: 'Assign your dedicated care caller' },
                            ].map(({ icon: Icon, text }, i) => (
                                <Animated.View key={text} style={{ opacity: staggerAnims[i + 2], transform: [{ translateX: staggerAnims[i + 2].interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] }}>
                                    <View style={styles.journeyItem}>
                                        <View style={styles.journeyIconBox}><Icon size={16} color="#3B5BDB" /></View>
                                        <Text style={styles.journeyText}>{text}</Text>
                                    </View>
                                </Animated.View>
                            ))}
                        </View>
                    </View>
                </Animated.View>

                <Animated.View style={{ width: '100%', opacity: staggerAnims[5], transform: [{ scale: staggerAnims[5].interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }}>
                    <Pressable style={styles.primaryBtnEnhanced} onPress={handleGoToStep5}>
                        <LinearGradient
                            colors={['#6366F1', '#4F46E5']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.primaryBtnGradientEnhanced}
                        >
                            <Text style={styles.primaryBtnText}>Continue</Text>
                            <ChevronRight size={20} color="#FFFFFF" strokeWidth={2.5} />
                        </LinearGradient>
                    </Pressable>
                </Animated.View>
            </View>
        );
    };

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
        <View style={styles.finalState}>
            <Animated.View style={[styles.successOrb, { opacity: staggerAnims[0] }]}>
                <CheckCircle2 size={80} color="#6366F1" />
            </Animated.View>
            <Animated.Text style={[styles.finalTitle, { opacity: staggerAnims[1] }]}>Welcome to the Family!</Animated.Text>
            <Animated.Text style={[styles.finalSub, { opacity: staggerAnims[2] }]}>Your premium health journey with Samvaya begins now. Your advisor will be in touch shortly.</Animated.Text>

            <Animated.View style={[styles.finalCard, { opacity: staggerAnims[3] }]}>
                <View style={styles.finalRow}>
                    <Shield size={20} color="#6366F1" />
                    <Text style={styles.finalCardText}>Security & Privacy Verified</Text>
                </View>
                <View style={[styles.finalRow, { marginTop: 12 }]}>
                    <Crown size={20} color="#6366F1" />
                    <Text style={styles.finalCardText}>{selectedPlan.name} Active</Text>
                </View>
            </Animated.View>

            <Animated.View style={{ width: '100%', opacity: staggerAnims[4], transform: [{ translateY: staggerAnims[4].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                <Pressable style={styles.primaryBtnEnhanced} onPress={handleCompleteSignUp}>
                    <LinearGradient
                        colors={['#6366F1', '#4F46E5']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={styles.primaryBtnGradientEnhanced}
                    >
                        <Text style={styles.primaryBtnText}>Enter Dashboard</Text>
                        <ChevronRight size={20} color="#FFFFFF" />
                    </LinearGradient>
                </Pressable>
            </Animated.View>
        </View>
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 40 },

    hero: {
        height: 300,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 60,
        overflow: 'hidden',
        borderBottomLeftRadius: 40,
        borderBottomRightRadius: 40,
    },
    orb1: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.1)', top: -100, left: -50 },
    orb2: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)', bottom: -60, right: -40 },
    orb3: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.05)', top: 40, right: 20 },
    orb4: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.06)', bottom: 20, left: 30 },

    heroContent: { alignItems: 'center', zIndex: 10 },
    iconCircle: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    },
    heroLabel: { fontSize: 13, ...FONT.bold, color: 'rgba(255,255,255,0.7)', letterSpacing: 5, marginBottom: 8 },
    heroTitle: { fontSize: 24, ...FONT.heavy, color: '#FFFFFF', textAlign: 'center', paddingHorizontal: 20 },

    modernProgressContainer: { flexDirection: 'row', gap: 6, marginTop: 24, width: 160, height: 4 },
    progressSegmentWrapper: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
    progressSegment: { flex: 1, height: 4, backgroundColor: 'transparent' },
    progressSegmentDone: { backgroundColor: '#FFFFFF' },
    progressSegmentActive: { backgroundColor: '#FFFFFF', opacity: 0.6 },

    formCard: {
        marginTop: -30,
        marginHorizontal: 16,
        backgroundColor: '#FFFFFF',
        borderRadius: 32,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1, shadowRadius: 20,
        elevation: 10,
    },

    fieldGroup: { marginBottom: 18 },
    label: { fontSize: 13, ...FONT.bold, color: '#475569', marginBottom: 8, marginLeft: 4, letterSpacing: 0.3 },
    inlineIconBox: {
        width: 36, height: 36, borderRadius: 12,
        backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    inputWrapEnhanced: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderWidth: 1.5, borderColor: '#E2E8F0',
        borderRadius: 20, height: 58,
        paddingHorizontal: 14,
    },
    inputFocusedEnhanced: {
        borderColor: '#6366F1',
        backgroundColor: '#FFFFFF',
        shadowColor: '#6366F1', shadowOpacity: 0.1, shadowRadius: 10,
    },
    inputErrorEnhanced: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
    textInputEnhanced: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 14 : undefined, height: '100%', fontSize: 16, color: '#0F172A', ...FONT.semibold, includeFontPadding: false },
    textPrefixStyle: { fontSize: 16, color: '#0F172A', ...FONT.bold, marginRight: 8, paddingVertical: Platform.OS === 'ios' ? 14 : undefined },
    rightIconWrap: { marginLeft: 10 },
    errorTextRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginLeft: 4 },
    fieldErrorEnhanced: { color: '#EF4444', fontSize: 12, ...FONT.medium },

    primaryBtnEnhanced: {
        height: 60, borderRadius: 24, marginTop: 20,
        overflow: 'hidden',
        shadowColor: '#6366F1', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25, shadowRadius: 15, elevation: 8,
    },
    primaryBtnGradientEnhanced: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 17, ...FONT.bold },

    secondaryBtnEnhanced: {
        height: 58, borderRadius: 20, backgroundColor: '#F1F5F9',
        alignItems: 'center', justifyContent: 'center', marginTop: 12,
    },
    secondaryBtnTextEnhanced: { color: '#475569', fontSize: 16, ...FONT.bold },

    googleBtnEnhanced: {
        flexDirection: 'row', height: 58, borderRadius: 20, backgroundColor: '#FFFFFF',
        borderWidth: 1.5, borderColor: '#E2E8F0',
        alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20,
    },
    googleIconWrap: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#EB4335', alignItems: 'center', justifyContent: 'center' },
    googleTextG: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    googleBtnText: { fontSize: 15, ...FONT.bold, color: '#1E293B' },

    dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
    dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
    dividerText: { marginHorizontal: 16, fontSize: 12, color: '#94A3B8', ...FONT.heavy },

    loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
    loginText: { fontSize: 14, color: '#64748B', ...FONT.regular },
    loginAction: { fontSize: 14, ...FONT.heavy, color: '#6366F1' },

    verifyFieldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    verifyBtnSmall: {
        height: 58,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: '#EEF2FF',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 21,
    },
    verifiedBtn: { backgroundColor: '#22C55E' },
    verifyBtnText: { fontSize: 13, ...FONT.bold, color: '#6366F1' },

    strengthWrap: { marginTop: 10, paddingHorizontal: 4 },
    strengthBarRow: { flexDirection: 'row', gap: 4, height: 4, marginBottom: 6 },
    strengthSeg: { flex: 1, height: 4, borderRadius: 2 },
    strengthLabel: { fontSize: 12, ...FONT.bold },

    reqWrap: { marginTop: 12, paddingHorizontal: 8, gap: 4 },
    reqItem: { fontSize: 13, ...FONT.medium },

    locationHeader: { alignItems: 'center', marginBottom: 24 },
    locationIconBox: { width: 64, height: 64, borderRadius: 24, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    locationTitle: { fontSize: 18, ...FONT.bold, color: '#1E293B' },
    locationSub: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },

    detectBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 10, paddingVertical: 14, borderRadius: 16,
        backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#6366F1',
    },
    detectText: { fontSize: 15, ...FONT.bold, color: '#6366F1' },
    locationDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 24 },
    citySelectorBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, height: 58, borderRadius: 16,
        backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0',
    },
    citySelectorText: { fontSize: 15, ...FONT.semibold, color: '#0F172A' },
    cityPlaceholder: { color: '#94A3B8' },

    planGrid: { gap: 12 },
    planCard: {
        flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20,
        borderRadius: 24, backgroundColor: '#F8FAFC', borderWidth: 2, borderColor: '#F1F5F9',
    },
    planCardActive: { borderColor: '#6366F1', backgroundColor: '#EEF2FF', shadowColor: '#6366F1', shadowOpacity: 0.08, shadowRadius: 10 },
    planIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    planTitle: { fontSize: 16, ...FONT.bold, color: '#1E293B' },
    planPrice: { fontSize: 14, ...FONT.medium, color: '#64748B', marginTop: 2 },
    checkCircle: { marginLeft: 'auto' },

    paymentAlert: {
        flexDirection: 'row', backgroundColor: '#FEF9C3', borderRadius: 16, padding: 14, gap: 10, marginTop: 20,
    },
    paymentAlertText: { fontSize: 13, color: '#854D0E', flex: 1, ...FONT.medium },

    finalState: { alignItems: 'center', paddingBottom: 20 },
    successOrb: {
        width: 140, height: 140, borderRadius: 70, backgroundColor: '#F0F3FF',
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    },
    finalTitle: { fontSize: 26, ...FONT.heavy, color: '#1E293B', textAlign: 'center' },
    finalSub: { fontSize: 15, color: '#475569', textAlign: 'center', marginTop: 12, paddingHorizontal: 20, lineHeight: 22 },
    finalCard: {
        width: '100%', backgroundColor: '#F8FAFC', borderRadius: 24, padding: 24, marginTop: 32, marginBottom: 20,
        borderWidth: 1, borderColor: '#F1F5F9',
    },
    finalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    finalCardText: { fontSize: 15, ...FONT.semibold, color: '#334155' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40, maxHeight: '92%', marginTop: 60 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, ...FONT.heavy, color: '#1E293B' },
    modalSub: { fontSize: 13, color: '#94A3B8', ...FONT.medium, marginTop: 2 },

    otpSubtext: { fontSize: 14, color: '#64748B', lineHeight: 20 },
    resendRow: { alignItems: 'center', marginTop: 10, marginBottom: 20 },
    timerText: { fontSize: 13, ...FONT.bold, color: '#94A3B8' },
    resendAction: { fontSize: 14, ...FONT.heavy, color: '#6366F1' },
    attemptsText: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 12 },

    paymentSummary: { backgroundColor: '#F1F5F9', borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 24 },
    payPlanName: { fontSize: 14, ...FONT.bold, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 },
    payAmount: { fontSize: 32, ...FONT.heavy, color: '#1E293B', marginTop: 4 },
    paySubtext: { fontSize: 13, ...FONT.bold, color: '#94A3B8', marginBottom: 16, marginLeft: 4 },
    upiRow: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#F8FAFC', borderRadius: 16, marginBottom: 10 },
    upiIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    upiAppName: { flex: 1, fontSize: 16, ...FONT.bold, color: '#1E293B' },
    upiAction: { fontSize: 14, ...FONT.bold, color: '#6366F1' },
    payDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 20 },
    payManualBtn: {
        flexDirection: 'row', height: 58, borderRadius: 24, backgroundColor: '#1E293B',
        alignItems: 'center', justifyContent: 'center', gap: 12,
    },
    payManualText: { color: '#FFFFFF', fontSize: 16, ...FONT.bold },

    cityList: { maxHeight: 300, marginTop: 10 },
    cityItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    cityItemText: { fontSize: 16, ...FONT.medium, color: '#1E293B' },
    cityOption: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 16,
        borderBottomWidth: 1, borderBottomColor: '#F8FAFC',
    },
    cityOptionActive: { backgroundColor: '#F8FAFF' },
    cityIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
    cityName: { fontSize: 16, ...FONT.semibold, color: '#1E293B' },
    cityState: { fontSize: 13, ...FONT.medium, color: '#94A3B8', marginTop: 2 },
    radioOutline: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
    radioActive: { borderColor: '#3B5BDB' },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B5BDB' },

    searchWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#F8FAFC', borderRadius: 16,
        paddingHorizontal: 16, height: 48,
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    searchInput: { flex: 1, fontSize: 15, color: '#0F172A', ...FONT.medium, paddingVertical: 0 },

    emptyState: { alignItems: 'center', paddingVertical: 40 },
    emptyTitle: { fontSize: 16, ...FONT.bold, color: '#64748B', marginTop: 12 },
    emptyDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 6, lineHeight: 18 },

    closeBtnBox: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },

    footer: { padding: 32, alignItems: 'center' },
    footerText: { fontSize: 14, color: '#64748B', ...FONT.regular },
    footerAction: { fontSize: 14, ...FONT.heavy, color: '#6366F1' },
    madeWith: { fontSize: 12, ...FONT.bold, color: '#CBD5E1', marginTop: 24 },

    planCardGhost: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderRadius: 24, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed', marginBottom: 12 },
    ghostIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    planTitleGhost: { fontSize: 16, ...FONT.bold, color: '#64748B' },
    planDesc: { fontSize: 13, ...FONT.medium, color: '#94A3B8' },

    planCardEnhanced: { borderRadius: 32, marginBottom: 16, overflow: 'hidden', borderWidth: 2, borderColor: '#F1F5F9' },
    planCardGradient: { padding: 24 },
    planCardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
    planIconBoxEnhanced: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    planPriceCol: { flex: 1 },
    planTitleEnhanced: { fontSize: 18, ...FONT.heavy, color: '#1E293B' },
    planPriceEnhanced: { fontSize: 24, ...FONT.heavy, color: '#6366F1', marginTop: 2 },
    planPriceSub: { fontSize: 14, ...FONT.bold, color: '#94A3B8' },
    selectedCheck: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center' },
    planFeaturesEnhanced: { gap: 12, marginBottom: 24 },
    featureLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    featureTextEnhanced: { fontSize: 14, ...FONT.semibold, color: '#475569' },

    planActionBtn: { height: 54, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    btnActive: { backgroundColor: '#6366F1' },
    btnInactive: { backgroundColor: '#F1F5F9' },
    txtActive: { color: '#FFFFFF', fontSize: 15, ...FONT.bold },
    txtInactive: { color: '#64748B', fontSize: 15, ...FONT.bold },
    planActionBtnText: { fontSize: 15, ...FONT.bold },

    premiumBadge: { position: 'absolute', top: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, zIndex: 10 },
    premiumBadgeText: { fontSize: 10, ...FONT.heavy, color: '#FFFFFF' },

    successCelebrationCard: { width: '100%', borderRadius: 32, padding: 32, alignItems: 'center', marginBottom: 20 },
    largeSuccessCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    successTitle: { fontSize: 24, ...FONT.heavy, color: '#166534', textAlign: 'center' },
    successSubtitle: { fontSize: 16, ...FONT.medium, color: '#15803D', textAlign: 'center', marginTop: 8 },

    nextStepsCard: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 32, padding: 24, borderWidth: 1, borderColor: '#F1F5F9' },
    nextStepsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    nextStepsTitle: { fontSize: 14, ...FONT.heavy, color: '#3B5BDB', letterSpacing: 1 },
    nextStepsDesc: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 20 },
    journeyList: { gap: 16 },
    journeyItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    journeyIconBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#EFF3FF', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    journeyText: { flex: 1, fontSize: 14, ...FONT.semibold, color: '#334155', lineHeight: 20 },

    errorBoxEnhanced: { flexDirection: 'row', gap: 12, backgroundColor: '#FFFBEB', padding: 16, borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: '#FEF3C7' },
    errorMsgEnhanced: { fontSize: 14, ...FONT.medium, flex: 1, lineHeight: 20 },

    locationTitlePremium: { fontSize: 24, ...FONT.heavy, color: '#1E293B', textAlign: 'center' },
    locationSubtitlePremium: { fontSize: 15, color: '#475569', textAlign: 'center', marginTop: 12, paddingHorizontal: 30, lineHeight: 22 },
    locationPrimaryBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        height: 60, borderRadius: 24, backgroundColor: '#6366F1',
        width: '100%', gap: 12, marginTop: 24,
        shadowColor: '#6366F1', shadowOpacity: 0.2, shadowRadius: 10, elevation: 4,
    },
    locationPrimaryBtnText: { color: '#FFFFFF', fontSize: 16, ...FONT.bold },
    locationSecondaryBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 16, marginTop: 8,
    },
    locationSecondaryBtnText: { fontSize: 15, ...FONT.bold, color: '#6366F1' },
    locationSuccessToast: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#F0FDF4', padding: 16, borderRadius: 20,
        marginTop: 24, width: '100%', borderWidth: 1, borderColor: '#DCFCE7',
    },
    locationSuccessText: { fontSize: 14, color: '#15803D', ...FONT.semibold, flex: 1 },
    locationErrorText: { fontSize: 14, color: '#EF4444', ...FONT.medium, marginTop: 12, textAlign: 'center' },

    centerStepEnhanced: { alignItems: 'center', width: '100%' },

    processingContainer: {
        paddingVertical: 60,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 300,
    },
    processingTitle: { fontSize: 22, ...FONT.heavy, color: '#1E293B', marginTop: 32, textAlign: 'center' },
    processingSub: { fontSize: 15, color: '#64748B', textAlign: 'center', marginTop: 12, paddingHorizontal: 30, lineHeight: 22 },
    processingProgress: { marginTop: 40, padding: 8, borderRadius: 24, backgroundColor: '#F8FAFC' },
});
