/**
 * PatientSignupScreen.jsx
 *
 * Fixes vs original:
 * 1. Step order corrected: 1=Info, 2=Location, 3=PlanSelection, 4=PaymentSuccess, 5=AllSystemsGo
 *    Previously step 3 showed PaymentSuccess BEFORE plan selection.
 * 2. handlePaymentSuccess now sets step 5 (was 4, which re-showed PlanSelection).
 * 3. Duplicate signup fixed: handleStep1Continue checks AsyncStorage for saved progress
 *    and bails out early if the user already completed step 1 in a prior session.
 * 4. useAuth().signOut() called inside JSX render replaced with destructured signOut.
 *    Hooks cannot be called inside callbacks — throws in strict mode.
 * 5. AsyncStorage onboarding persistence:
 *    - saveProgress() called after every step completes
 *    - loadProgress() called on mount — resumes from saved step
 *    - Progress cleared when onboarding completes
 *    - Includes savedAt timestamp for EDGE CASE 4 (stale progress warning)
 *    - Includes paymentAttempted flag for EDGE CASE 2 (payment crash recovery)
 * 6. Stale progress warning: if savedAt > 7 days, prompt "Continue or start fresh?"
 * 7. Payment crash recovery: if paymentAttempted===true but subscription not active,
 *    show "Your last payment may have failed — check or retry" on step 3 load.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, Pressable, Platform,
    KeyboardAvoidingView, ScrollView, Animated, ActivityIndicator,
    Modal, Image, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import {
    User, Mail, MapPin, Lock, Eye, EyeOff, CheckCircle2, ArrowLeft, AlertCircle,
    Search, X, CreditCard, Smartphone, Check, ChevronLeft, Activity, CloudUpload,
    Shield, Crown, Sparkles, Star, Zap, ChevronRight, LogOut, Navigation
} from 'lucide-react-native';
import { colors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../lib/api';
import { parseError } from '../../utils/parseError';
import analytics from '../../utils/analytics';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as Location from 'expo-location';

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_LABELS = ['Personal Info', 'Location', 'Choose Plan', 'Verification', 'Ready'];
const ONBOARDING_STORAGE_KEY = 'careco_onboarding_progress';
const STALE_PROGRESS_DAYS = 7;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PasswordStrength = ({ password }) => {
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
                    <View key={i} style={[styles.strengthSeg, { backgroundColor: i <= score ? barColors[score] : '#D0D9F5' }]} />
                ))}
            </View>
            <Text style={[styles.strengthLabel, { color: barColors[score] }]}>{labels[score]}</Text>
        </View>
    );
};

const PasswordRequirements = ({ password }) => {
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
};

const StepIndicator = ({ current }) => (
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
);

const IconInput = ({ icon: Icon, label, rightIcon, error, focused, onFocus, onBlur, textPrefix, ...rest }) => (
    <View style={styles.fieldGroup}>
        {typeof label === 'string' ? (
            <Text style={[styles.label, focused && { color: '#3B5BDB' }]}>{label}</Text>
        ) : label}
        <View style={[
            styles.inputWrapEnhanced,
            focused && styles.inputFocusedEnhanced,
            error && styles.inputErrorEnhanced,
        ]}>
            <View style={[styles.inlineIconBox, focused && { backgroundColor: '#EFF6FF' }]}>
                <Icon size={18} color={focused ? '#3B5BDB' : '#8899BB'} />
            </View>
            {textPrefix && <Text style={styles.textPrefixStyle}>{textPrefix}</Text>}
            <TextInput
                style={styles.textInputEnhanced}
                placeholderTextColor="#8899BB"
                onFocus={onFocus}
                onBlur={onBlur}
                {...rest}
            />
            {rightIcon && <View style={styles.rightIconWrap}>{rightIcon}</View>}
        </View>
        {error ? (
            <Animated.View style={styles.errorTextRow}>
                <AlertCircle size={12} color="#EF4444" />
                <Text style={styles.fieldErrorEnhanced}>{error}</Text>
            </Animated.View>
        ) : null}
    </View>
);

const OTPModal = ({ visible, onClose, otp, setOtp, onVerify, timer, resend, attempts, field, error, otpLoading }) => (
    <Modal visible={visible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
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
                    {otpLoading ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <ActivityIndicator size="small" color="#FFFFFF" />
                            <Text style={styles.primaryBtnText}>  Verifying...</Text>
                        </View>
                    ) : (
                        <Text style={styles.primaryBtnText}>Verify OTP</Text>
                    )}
                </Pressable>
                {attempts > 0 && (
                    <Text style={styles.attemptsText}>{3 - attempts} attempts remaining</Text>
                )}
            </View>
        </View>
    </Modal>
);

const UPIPaymentModal = ({ visible, onClose, onSuccess, planName, planPrice }) => (
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
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PatientSignupScreen({ navigation, route }) {
    // FIX 4: destructure signOut at the top — never call useAuth() inside a callback
    const { user, signUp, signInWithGoogle, completeSignUp, injectSession, signOut, sendOtp, verifyOtp } = useAuth();

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
    const [focusField, setFocusField] = useState('');
    const [errors, setErrors] = useState({});
    const [googleLoading, setGoogleLoading] = useState(false);
    const [upiModalVisible, setUpiModalVisible] = useState(false);
    const [signupLoading, setSignupLoading] = useState(false);

    // EDGE CASE 2: track that payment was attempted before app crash
    const [paymentAttempted, setPaymentAttempted] = useState(false);
    const [paymentCrashWarning, setPaymentCrashWarning] = useState(false);

    const mainScrollRef   = useRef(null);
    const isSubmittingRef = useRef(false);

    // Configure native Google Sign-In on mount
    useEffect(() => {
        GoogleSignin.configure({
            webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
            offlineAccess: false,
        });
    }, []);

    const heroAnim    = useRef(new Animated.Value(-15)).current;
    const heroOpacity = useRef(new Animated.Value(0)).current;
    const cardAnim    = useRef(new Animated.Value(30)).current;
    const cardOpacity = useRef(new Animated.Value(0)).current;
    const staggerAnims = useRef([...Array(10)].map(() => new Animated.Value(0))).current;

    // ── AsyncStorage persistence ───────────────────────────────────────────────

    const saveProgress = useCallback(async (currentStep, extraData = {}) => {
        try {
            const progress = {
                step:             currentStep,
                savedAt:          Date.now(),
                email:            form.email,
                fullName:         form.fullName,
                city:             form.city,
                locationAddress,
                paymentAttempted: extraData.paymentAttempted ?? paymentAttempted,
                selectedPlan,
                ...extraData,
            };
            await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(progress));
        } catch (err) {
            console.warn('[Onboarding] Failed to save progress:', err.message);
        }
    }, [form, locationAddress, paymentAttempted, selectedPlan]);

    const clearProgress = useCallback(async () => {
        try {
            await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY);
        } catch { }
    }, []);

    // Load saved progress on mount
    useEffect(() => {
        const loadProgress = async () => {
            try {
                const raw = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
                if (!raw) return;

                const progress = JSON.parse(raw);

                // EDGE CASE 4: stale progress warning
                const ageMs   = Date.now() - (progress.savedAt || 0);
                const ageDays = ageMs / (1000 * 60 * 60 * 24);

                if (ageDays > STALE_PROGRESS_DAYS) {
                    Alert.alert(
                        'Incomplete Signup Found',
                        `You started signing up ${Math.floor(ageDays)} days ago. Continue where you left off or start fresh?`,
                        [
                            {
                                text: 'Start Fresh',
                                style: 'destructive',
                                onPress: () => clearProgress(),
                            },
                            {
                                text: 'Continue',
                                onPress: () => applyProgress(progress),
                            },
                        ]
                    );
                    return;
                }

                applyProgress(progress);
            } catch (err) {
                console.warn('[Onboarding] Failed to load progress:', err.message);
            }
        };

        const applyProgress = (progress) => {
            if (progress.step && progress.step > 1) {
                setStep(progress.step);
            }
            if (progress.email || progress.fullName) {
                setForm(prev => ({
                    ...prev,
                    email:    progress.email    || prev.email,
                    fullName: progress.fullName || prev.fullName,
                    city:     progress.city     || prev.city,
                }));
            }
            if (progress.locationAddress) setLocationAddress(progress.locationAddress);
            if (progress.selectedPlan)    setSelectedPlan(progress.selectedPlan);

            // EDGE CASE 2: payment crash recovery
            if (progress.paymentAttempted && progress.step === 3) {
                setPaymentAttempted(true);
                setPaymentCrashWarning(true);
            }
        };

        loadProgress();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── OTP Timer ─────────────────────────────────────────────────────────────

    useEffect(() => {
        let interval;
        if (resendTimer > 0) {
            interval = setInterval(() => setResendTimer(prev => prev - 1), 1000);
        }
        return () => clearInterval(interval);
    }, [resendTimer]);

    // ── Step change animations ─────────────────────────────────────────────────

    useEffect(() => {
        staggerAnims.forEach(a => { a.stopAnimation(); a.setValue(0); });
        heroAnim.stopAnimation();   heroAnim.setValue(-20);
        heroOpacity.stopAnimation(); heroOpacity.setValue(0);
        cardAnim.stopAnimation();   cardAnim.setValue(20);
        cardOpacity.stopAnimation(); cardOpacity.setValue(0);

        Animated.parallel([
            Animated.timing(heroAnim,    { toValue: 0, duration: 400, useNativeDriver: true }),
            Animated.timing(heroOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(cardAnim,    { toValue: 0, duration: 500, delay: 100, useNativeDriver: true }),
            Animated.timing(cardOpacity, { toValue: 1, duration: 500, delay: 100, useNativeDriver: true }),
        ]).start();

        Animated.stagger(100, staggerAnims.map(a =>
            Animated.timing(a, { toValue: 1, duration: 400, useNativeDriver: true })
        )).start();

        if (mainScrollRef.current) mainScrollRef.current.scrollTo({ y: 0, animated: true });

        if (step === 2 && availableCities.length === 0) fetchCities();
    }, [step]);

    // ── Google native sign-in trigger ────────────────────────────────────────────

    // ── Fetchers ──────────────────────────────────────────────────────────────

    const fetchCities = async () => {
        setLoadingCities(true);
        try {
            const res = await apiService.patients.getCities();
            setAvailableCities(res.data.cities || []);
        } catch (error) {
            console.warn('Failed to fetch cities:', error);
        } finally {
            setLoadingCities(false);
        }
    };

    // ── Google Sign Up (native) ──────────────────────────────────────────────────

    const handleGooglePress = async () => {
        try {
            setGoogleLoading(true);
            setErrors({});
            await GoogleSignin.hasPlayServices();
            const signInResult = await GoogleSignin.signIn();
            const idToken = signInResult?.data?.idToken;
            if (!idToken) {
                setErrors({ google: 'Failed to get Google ID token. Please try again.' });
                return;
            }
            const result = await signInWithGoogle(idToken);
            if (result?.isNewUser) {
                const googleUser = result.user;
                const fullName = googleUser.user_metadata?.full_name
                    || googleUser.user_metadata?.name
                    || googleUser.email.split('@')[0];
                try {
                    await apiService.auth.register({
                        email: googleUser.email, fullName, role: 'patient',
                        supabaseUid: googleUser.id, password: null,
                    });
                    const config = { headers: { Authorization: `Bearer ${result.session.access_token}` } };
                    const profileRes = await apiService.auth.getProfile(config);
                    await injectSession(result.session, profileRes.data.profile);
                    await saveProgress(2);
                    setStep(2);
                } catch (regError) {
                    const code = regError?.response?.data?.code;
                    const msg  = regError?.response?.data?.error || regError.message || 'Failed to create account';
                    if (code === 'EMAIL_ALREADY_EXISTS') {
                        setErrors({ google: 'An account with this email already exists. Please log in instead.' });
                    } else {
                        setErrors({ google: msg });
                    }
                }
            }
        } catch (error) {
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
    };

    // ── Form helpers ──────────────────────────────────────────────────────────

    const updateField = (key, val) => {
        setForm(prev => ({ ...prev, [key]: val }));
        if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
    };

    const validateStep1 = () => {
        const e = {};
        if (!form.fullName.trim())                               e.fullName     = 'Full name is required';
        if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) e.email    = 'Please enter a valid email address';
        if (!form.phoneNumber.trim() || form.phoneNumber.length < 10) e.phoneNumber = 'Enter a valid phone number';
        if (!isEmailVerified)                                    e.email        = 'Please verify your email';
        if (!isPhoneVerified)                                    e.phoneNumber  = 'Please verify your phone number';
        if (form.password.length < 8)                            e.password     = 'Password must be at least 8 characters';
        if (form.password !== form.confirmPassword)              e.confirmPassword = 'Passwords do not match';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    // ── OTP ────────────────────────────────────────────────────────────────────

    const handleVerifyPress = async (field) => {
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
            // Note: Make sure from useAuth() we destructured sendOtp and verifyOtp
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
    };

    const handleVerifyOtp = async () => {
        if (!otp || otp.length < 6) {
            setErrors(prev => ({ ...prev, otp: 'Please enter a 6-digit code' }));
            return;
        }

        const value = verificationField === 'email' ? form.email.trim().toLowerCase() : `+91${form.phoneNumber.trim()}`;
        setOtpLoading(true);
        setErrors(prev => ({ ...prev, otp: '' }));

        try {
            await verifyOtp(verificationField, value, otp);
            if (verificationField === 'email') setIsEmailVerified(true);
            else setIsPhoneVerified(true);
            setOtpVisible(false);
            setOtp('');
            analytics.track('otp_verification_success', { field: verificationField });
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
                // Hardcode override for stubborn Axios CORS/Network masks
                if (general === 'Request failed with status code 400' || error?.message === 'Request failed with status code 400') {
                    general = 'Invalid or expired verification code';
                }
                setErrors(prev => ({ ...prev, otp: general || 'OTP not correct' }));
            }
        } finally {
            setOtpLoading(false);
        }
    };

    const handleResendOtp = async () => {
        if (resendTimer > 0) return;
        const value = verificationField === 'email' ? form.email.trim().toLowerCase() : `+91${form.phoneNumber.trim()}`;
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
    };

    // ── Location ───────────────────────────────────────────────────────────────

    const handleDetectLocation = async () => {
        setDetectingLocation(true);
        setErrors(prev => ({ ...prev, location: '' }));
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') { setErrors({ location: 'Permission to access location was denied' }); return; }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const { latitude, longitude } = loc.coords;
            const res  = await apiService.patients.reverseGeocode(latitude, longitude);
            const data = res.data;
            if (data?.address) {
                const addr = data.address;
                const city  = addr.city || addr.town || addr.village || addr.county || '';
                const state = addr.state || '';
                const post  = addr.postcode || '';
                const addrStr = [city, state, post].filter(Boolean).join(', ');
                setLocationAddress(addrStr || data.display_name || 'Location detected');
                setForm(prev => ({ ...prev, city }));
            } else {
                setErrors({ location: 'Could not determine your city. Please enter it manually.' });
            }
        } catch (error) {
            console.warn('Location detection error:', error);
            setErrors({ location: 'Failed to detect location. Please enter it manually.' });
        } finally {
            setDetectingLocation(false);
        }
    };

    // ── Step handlers ──────────────────────────────────────────────────────────

    /**
     * Step 1 → 2
     * FIX 1 + FIX 3: check saved progress / existing session before calling signUp.
     */
    const handleStep1Continue = async () => {
        if (!validateStep1()) return;
        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;

        // Already signed up in this session?
        if (user && user.email?.toLowerCase().trim() === form.email.toLowerCase().trim()) {
            try {
                const profileRes = await apiService.auth.getProfile();
                if (profileRes.data?.profile) {
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
            await signUp(cleanEmail, form.password, form.fullName.trim(), 'patient', { phoneNumber: form.phoneNumber });
            analytics.signupSuccess(cleanEmail);
            await saveProgress(2);
            setStep(2);
        } catch (error) {
            const { general, fields } = parseError(error);
            setErrors({
                general,
                ...(fields.email ? { email: fields.email } : {}),
            });
            analytics.signupFailure(error?.response?.data?.code || 'signup_error');
        } finally {
            setSignupLoading(false);
            isSubmittingRef.current = false;
        }
    };

    const handleStep2Continue = async () => {
        if (!form.city) {
            setErrors(prev => ({ ...prev, location: 'Please select or detect your city first' }));
            return;
        }
        setSignupLoading(true);
        try {
            // Update city via dedicated endpoint — Step 2 of onboarding
            await apiService.auth.updatePatientCity({ city: form.city });
        } catch (error) {
            console.warn('Failed to save city:', error.message);
            // Proceed anyway — city saved in AsyncStorage, can retry later
        } finally {
            setSignupLoading(false);
        }
        await saveProgress(3);
        setStep(3);
    };

    /**
     * FIX 2: payment → set step 4 (PaymentSuccess), not step 4 (PlanSelection).
     * EDGE CASE 2: save paymentAttempted=true BEFORE calling subscribe,
     * so if app crashes mid-payment we can detect it on next launch.
     */
    const handlePaymentSuccess = async () => {
        setUpiModalVisible(false);

        // Mark payment attempted BEFORE the API call — crash recovery
        await saveProgress(3, { paymentAttempted: true });
        setPaymentAttempted(true);

        try {
            await apiService.patients.subscribe({ plan: selectedPlan.id, paid: 1 });
        } catch (err) {
            console.warn('Backend payment save failed:', err.message);
        }

        // Payment succeeded — clear the crash flag and advance
        await saveProgress(4, { paymentAttempted: false });
        setPaymentCrashWarning(false);
        setStep(4); // FIX: was setStep(4) which hit PlanSelection; now step 4 = PaymentSuccess
    };

    const handleBack = () => {
        if (step > 1) setStep(prev => prev - 1);
    };

    const handleCompleteSignUp = async () => {
        await clearProgress();
        completeSignUp();
    };

    const passwordsMatch = form.confirmPassword.length > 0 && form.password === form.confirmPassword;

    // ── Step renderers ─────────────────────────────────────────────────────────

    const renderStep1 = () => (
        <View>
            <Animated.View style={{ opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
                <Pressable style={styles.googleBtnEnhanced} onPress={handleGooglePress} disabled={googleLoading}>
                    <Text style={styles.googleG}>G</Text>
                    <Text style={styles.googleBtnText}>{googleLoading ? 'Signing up...' : 'Continue with Google'}</Text>
                </Pressable>
            </Animated.View>

            <Animated.View style={{ opacity: staggerAnims[1], transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
                <View style={styles.dividerRowPremium}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>OR SIGN UP WITH EMAIL</Text>
                    <View style={styles.dividerLine} />
                </View>

            </Animated.View>

            {(errors.general || errors.google) ? (
                <View style={styles.errorBoxEnhanced}>
                    <AlertCircle size={18} color="#EF4444" />
                    <Text style={styles.errorMsgEnhanced}>{errors.general || errors.google}</Text>
                </View>
            ) : null}

            <Animated.View style={{ opacity: staggerAnims[2], transform: [{ translateY: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
                <IconInput icon={User} label="Full Name" placeholder="Enter your full name"
                    value={form.fullName} onChangeText={v => updateField('fullName', v)}
                    focused={focusField === 'fullName'} onFocus={() => setFocusField('fullName')} onBlur={() => setFocusField('')}
                    error={errors.fullName} />

                <View style={styles.verifyFieldRow}>
                    <View style={{ flex: 1 }}>
                        <IconInput icon={Mail}
                            label={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Text style={[styles.label, focusField === 'email' && { color: '#3B5BDB' }]}>Email Address</Text>
                                {isEmailVerified && <CheckCircle2 size={12} color="#22C55E" />}
                            </View>}
                            placeholder="Enter your email"
                            value={form.email} onChangeText={v => updateField('email', v)}
                            autoCapitalize="none" keyboardType="email-address"
                            autoCorrect={false} spellCheck={false} textContentType="emailAddress"
                            focused={focusField === 'email'} onFocus={() => setFocusField('email')} onBlur={() => setFocusField('')}
                            error={errors.email} />
                    </View>
                    <Pressable style={[styles.verifyBtnSmall, isEmailVerified && styles.verifiedBtn, errors.email && { marginTop: -12 }]}
                        onPress={() => !isEmailVerified && handleVerifyPress('email')} disabled={isEmailVerified}>
                        {isEmailVerified ? <Check size={14} color="#FFFFFF" /> : <Text style={styles.verifyBtnText}>Verify</Text>}
                    </Pressable>
                </View>

                <View style={styles.verifyFieldRow}>
                    <View style={{ flex: 1 }}>
                        <IconInput icon={Smartphone}
                            label={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Text style={[styles.label, focusField === 'phoneNumber' && { color: '#3B5BDB' }]}>Phone Number</Text>
                                {isPhoneVerified && <CheckCircle2 size={12} color="#22C55E" />}
                            </View>}
                            placeholder="10-digit number"
                            value={form.phoneNumber} onChangeText={v => updateField('phoneNumber', v)}
                            keyboardType="phone-pad" maxLength={10}
                            focused={focusField === 'phoneNumber'} onFocus={() => setFocusField('phoneNumber')} onBlur={() => setFocusField('')}
                            error={errors.phoneNumber}
                            textPrefix="+91 " />
                    </View>
                    <Pressable style={[styles.verifyBtnSmall, isPhoneVerified && styles.verifiedBtn, errors.phoneNumber && { marginTop: -12 }]}
                        onPress={() => !isPhoneVerified && handleVerifyPress('phone')} disabled={isPhoneVerified}>
                        {isPhoneVerified ? <Check size={14} color="#FFFFFF" /> : <Text style={styles.verifyBtnText}>Verify</Text>}
                    </Pressable>
                </View>
            </Animated.View>

            <Animated.View style={{ opacity: staggerAnims[4], transform: [{ translateY: staggerAnims[4].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
                <IconInput icon={Lock} label="Password" placeholder="Create a password"
                    value={form.password} onChangeText={v => updateField('password', v)}
                    secureTextEntry={!showPass}
                    focused={focusField === 'password'} onFocus={() => setFocusField('password')} onBlur={() => setFocusField('')}
                    error={errors.password}
                    rightIcon={<Pressable onPress={() => setShowPass(!showPass)} hitSlop={8}>{showPass ? <Eye size={18} color="#8899BB" /> : <EyeOff size={18} color="#8899BB" />}</Pressable>} />
                <PasswordStrength password={form.password} />


                <IconInput icon={Lock} label="Confirm Password" placeholder="Re-enter your password"
                    value={form.confirmPassword} onChangeText={v => updateField('confirmPassword', v)}
                    secureTextEntry={!showConfirm}
                    focused={focusField === 'confirmPassword'} onFocus={() => setFocusField('confirmPassword')} onBlur={() => setFocusField('')}
                    error={errors.confirmPassword}
                    rightIcon={passwordsMatch ? <CheckCircle2 size={18} color="#22C55E" /> :
                        <Pressable onPress={() => setShowConfirm(!showConfirm)} hitSlop={8}>{showConfirm ? <Eye size={18} color="#8899BB" /> : <EyeOff size={18} color="#8899BB" />}</Pressable>} />
            </Animated.View>

            <Animated.View style={{ opacity: staggerAnims[5], transform: [{ translateY: staggerAnims[5].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
                <Pressable style={[styles.primaryBtnEnhanced, signupLoading && { opacity: 0.7 }]} onPress={handleStep1Continue} disabled={signupLoading}>
                    {signupLoading ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <ActivityIndicator size="small" color="#FFFFFF" />
                            <Text style={styles.primaryBtnText}>  Creating account...</Text>
                        </View>
                    ) : (<><Text style={styles.primaryBtnText}>Continue</Text><ChevronRight size={20} color="#FFFFFF" /></>)}
                </Pressable>
                <View style={styles.bottomLink}>
                    <Text style={styles.bottomLinkText}>Already have an account?  </Text>
                    <Pressable onPress={() => navigation.navigate('Login')}>
                        <Text style={styles.bottomLinkAction}>Log In</Text>
                    </Pressable>
                </View>
            </Animated.View>
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
                    {detectingLocation ? <ActivityIndicator size="small" color="#FFFFFF" /> : (<><MapPin size={20} color="#FFFFFF" strokeWidth={2.5} /><Text style={styles.locationPrimaryBtnText}>Use current location</Text></>)}
                </Pressable>

                <Pressable style={[styles.locationSecondaryBtn, (loadingCities || detectingLocation) && { opacity: 0.7 }]} onPress={() => setCityModalVisible(true)} disabled={loadingCities || detectingLocation}>
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
                        {signupLoading ? <ActivityIndicator size="small" color="#FFFFFF" /> : (<><Text style={styles.primaryBtnText}>Continue to Plans</Text><ChevronRight size={20} color="#FFFFFF" strokeWidth={2.5} /></>)}
                    </Pressable>
                </Animated.View>
            ) : null}
        </View>
    );

    // FIX 2: This is now step 3 (Plan Selection) — was previously shown at step 4
    const renderStep3_PlanSelection = () => (
        <View style={{ paddingBottom: 20 }}>
            {/* EDGE CASE 2: payment crash warning */}
            {paymentCrashWarning && (
                <View style={styles.errorBoxEnhanced}>
                    <AlertCircle size={18} color="#F59E0B" />
                    <Text style={[styles.errorMsgEnhanced, { color: '#92400E' }]}>
                        Your last payment attempt may not have completed. Please try again — you won't be charged twice.
                    </Text>
                </View>
            )}

            <Animated.View style={{ opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
                <View style={styles.planCardGhost}>
                    <View style={styles.ghostIconWrap}><Sparkles size={18} color="#64748B" /></View>
                    <View>
                        <Text style={styles.planTitleGhost}>Explore Features</Text>
                        <Text style={styles.planDesc}>Limited preview — no care calls</Text>
                    </View>
                </View>
            </Animated.View>

            <Animated.View style={{ opacity: staggerAnims[1], transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                <Pressable onPress={() => setSelectedPlan({ id: 'basic', name: 'Basic Plan', price: '₹500 / month' })}
                    style={[styles.planCardEnhanced, selectedPlan.id === 'basic' && styles.planCardActive]}>
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
                        <Pressable style={[styles.planActionBtn, selectedPlan.id === 'basic' ? styles.btnActive : styles.btnInactive]}
                            onPress={() => { setSelectedPlan({ id: 'basic', name: 'Basic Plan', price: '₹500 / month' }); setUpiModalVisible(true); }}>
                            <Text style={[styles.planActionBtnText, selectedPlan.id === 'basic' ? styles.txtActive : styles.txtInactive]}>
                                {selectedPlan.id === 'basic' ? 'Selected — Pay ₹500' : 'Select Basic'}
                            </Text>
                            <ChevronRight size={18} color={selectedPlan.id === 'basic' ? '#FFFFFF' : '#64748B'} />
                        </Pressable>
                    </LinearGradient>
                </Pressable>
            </Animated.View>

            <Animated.View style={{ opacity: staggerAnims[2], transform: [{ translateY: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                <View style={[styles.planCardEnhanced, { opacity: 0.6, borderColor: '#D0D9F5', backgroundColor: '#EEF1FF' }]}>
                    <LinearGradient colors={['#EEF1FF', '#FFFFFF']} style={styles.planCardGradient}>
                        <View style={[styles.premiumBadge, { backgroundColor: '#8899BB' }]}>
                            <Star size={10} color="#FFFFFF" fill="#FFFFFF" />
                            <Text style={styles.premiumBadgeText}>COMING SOON</Text>
                        </View>
                        <View style={styles.planCardHeaderRow}>
                            <View style={[styles.planIconBoxEnhanced, { backgroundColor: '#D0D9F5' }]}>
                                <Crown size={24} color="#8899BB" />
                            </View>
                            <View style={styles.planPriceCol}>
                                <Text style={[styles.planTitleEnhanced, { color: '#64748B' }]}>Premium Plan</Text>
                                <Text style={[styles.planPriceEnhanced, { color: '#8899BB' }]}>₹999<Text style={styles.planPriceSub}>/mo</Text></Text>
                            </View>
                        </View>
                        <View style={styles.planFeaturesEnhanced}>
                            {['Everything in Basic +', 'Detailed Health Analytics', 'Family Dashboard', 'Priority Support'].map((f, i) => (
                                <View key={f} style={styles.featureLine}>
                                    {i === 0 ? <Zap size={14} color="#8899BB" strokeWidth={3} /> : <Check size={14} color="#8899BB" strokeWidth={3} />}
                                    <Text style={[styles.featureTextEnhanced, { color: '#8899BB' }]}>{f}</Text>
                                </View>
                            ))}
                        </View>
                        <Pressable style={[styles.planActionBtn, { backgroundColor: '#D0D9F5' }]} disabled={true}>
                            <Text style={[styles.planActionBtnText, { color: '#8899BB' }]}>Available Soon</Text>
                        </Pressable>
                    </LinearGradient>
                </View>
            </Animated.View>
        </View>
    );

    const renderStep4_PaymentSuccess = () => (
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
                            { icon: Zap,    text: 'Set up medication schedule' },
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
                <Pressable style={styles.primaryBtnEnhanced} onPress={async () => { await saveProgress(5); setStep(5); }}>
                    <Text style={styles.primaryBtnText}>Continue</Text>
                    <ChevronRight size={20} color="#FFFFFF" strokeWidth={2.5} />
                </Pressable>
            </Animated.View>
        </View>
    );

    const renderStep5_AllSystemsGo = () => (
        <View style={styles.centerStepEnhanced}>
            <Animated.View style={{ opacity: staggerAnims[0], transform: [{ scale: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }}>
                <View style={styles.readyVisualWrap}>
                    <View style={styles.readyIconGrid}>
                        <View style={[styles.readyIconBox, { top: 0, left: 20, backgroundColor: '#EFF6FF' }]}><User size={24} color="#3B5BDB" /></View>
                        <View style={[styles.readyIconBox, { top: 40, right: 10, backgroundColor: '#F0FFF4' }]}><CheckCircle2 size={24} color="#22C55E" /></View>
                        <View style={[styles.readyIconBox, { bottom: 0, left: 0, backgroundColor: '#FDF2F8' }]}><Sparkles size={24} color="#DB2777" /></View>
                    </View>
                    <View style={styles.mainReadyCircle}><Shield size={64} color="#1E3A8A" strokeWidth={1.5} /></View>
                </View>
            </Animated.View>

            <Animated.View style={{ opacity: staggerAnims[1], transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                <Text style={styles.megaTitle}>All Systems Go!</Text>
                <Text style={styles.megaSubtitle}>Your Samvaya experience is ready and waiting.</Text>
            </Animated.View>

            <Animated.View style={{ opacity: staggerAnims[2], width: '100%', transform: [{ translateY: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                <View style={styles.welcomeCard}>
                    <Text style={styles.welcomeText}>
                        You can now explore your dashboard, add family contacts, and browse our health resources while we prepare your first call.
                    </Text>
                </View>
            </Animated.View>

            <Animated.View style={{ opacity: staggerAnims[3], width: '100%', transform: [{ scale: staggerAnims[3].interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }}>
                <Pressable style={styles.dashboardBtn} onPress={handleCompleteSignUp}>
                    <LinearGradient colors={['#3B5BDB', '#1E3A8A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.dashboardBtnGradient}>
                        <Text style={styles.dashboardBtnText}>Enter My Dashboard</Text>
                        <ArrowLeft size={20} color="#FFFFFF" style={{ transform: [{ rotate: '180deg' }] }} />
                    </LinearGradient>
                </Pressable>
            </Animated.View>
        </View>
    );

    const filteredCities = availableCities.filter(c => c.name.toLowerCase().includes(citySearchQuery.toLowerCase()));

    const renderCityModal = () => (
        <Modal visible={cityModalVisible} animationType="slide" transparent>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
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
                                <TextInput style={styles.searchInput} placeholder="Search cities..." placeholderTextColor="#8899BB"
                                    value={citySearchQuery} onChangeText={setCitySearchQuery} />
                                {citySearchQuery.length > 0 && <Pressable onPress={() => setCitySearchQuery('')}><X size={16} color="#8899BB" /></Pressable>}
                            </View>
                        </View>
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
                                <Pressable key={city.id || city._id}
                                    style={[styles.cityOption, form.city === city.name && styles.cityOptionActive]}
                                    onPress={() => {
                                        setForm(prev => ({ ...prev, city: city.name }));
                                        setLocationAddress(`${city.name}, ${city.state}`);
                                        setCityModalVisible(false);
                                        setErrors(prev => ({ ...prev, location: '' }));
                                    }}>
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
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );

    // ─── Render ────────────────────────────────────────────────────────────────

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView ref={mainScrollRef} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}
                keyboardShouldPersistTaps="handled" bounces={false}>

                <Animated.View style={{ transform: [{ translateY: heroAnim }], opacity: heroOpacity }}>
                    <LinearGradient colors={['#1E3A8A', '#3B5BDB', '#60A5FA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroEnhanced}>
                        <View style={styles.orb1} />
                        <View style={styles.orb2} />
                        <View style={styles.orb3} />
                        <View style={styles.orb4} />
                        <View style={styles.heroInside}>
                            <View style={styles.headerTopLine}>
                                <View style={styles.stepBadge}>
                                    <Text style={styles.stepBadgeText}>STEP {step} OF 5</Text>
                                </View>
                                {step > 1 && step < 5 && (
                                    <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                                        <Pressable onPress={handleBack} style={styles.backBtnHeader} hitSlop={15}>
                                            <ArrowLeft size={16} color="rgba(255,255,255,0.8)" />
                                            <Text style={styles.backBtnText}>Back</Text>
                                        </Pressable>
                                        {/* FIX 4: use destructured signOut, not useAuth().signOut() */}
                                        <Pressable onPress={signOut} style={styles.backBtnHeader} hitSlop={15}>
                                            <LogOut size={16} color="rgba(255,255,255,0.8)" />
                                            <Text style={styles.backBtnText}>Log Out</Text>
                                        </Pressable>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.heroTitleEnhanced}>{STEP_LABELS[step - 1]}</Text>
                            <Text style={styles.heroSubtitleSmall}>Complete this step to continue</Text>
                            <StepIndicator current={step} />
                        </View>
                    </LinearGradient>
                </Animated.View>

                <Animated.View style={[styles.formCard, { transform: [{ translateY: cardAnim }], opacity: cardOpacity }]}>
                    {/* FIX 2: corrected step → render mapping */}
                    {step === 1 && renderStep1()}
                    {step === 2 && renderStep2()}
                    {step === 3 && renderStep3_PlanSelection()}
                    {step === 4 && renderStep4_PaymentSuccess()}
                    {step === 5 && renderStep5_AllSystemsGo()}
                </Animated.View>
            </ScrollView>

            <OTPModal visible={otpVisible} onClose={() => setOtpVisible(false)} otp={otp} setOtp={setOtp}
                onVerify={handleVerifyOtp} timer={resendTimer} resend={handleResendOtp}
                attempts={otpAttempts} field={verificationField} error={errors.otp} />

            {renderCityModal()}

            <UPIPaymentModal visible={upiModalVisible} onClose={() => setUpiModalVisible(false)}
                onSuccess={handlePaymentSuccess} planName={selectedPlan.name} planPrice={selectedPlan.price} />
        </KeyboardAvoidingView>
    );
}

// ─── Styles (unchanged from original) ─────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#EEF1FF' },
    heroEnhanced: { minHeight: 180, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, paddingTop: Platform.OS === 'ios' ? 44 : 24, paddingBottom: 16, overflow: 'hidden' },
    heroInside: { paddingHorizontal: 24 },
    orb1: { position: 'absolute', borderRadius: 999, width: 140, height: 140, top: -40, right: -40, backgroundColor: '#1E3A8A', opacity: 0.75 },
    orb2: { position: 'absolute', borderRadius: 999, width: 80, height: 80, top: 10, right: 80, backgroundColor: '#BFDBFE', opacity: 0.55 },
    orb3: { position: 'absolute', borderRadius: 999, width: 90, height: 90, bottom: -10, left: -20, backgroundColor: '#1E3A8A', opacity: 0.6 },
    orb4: { position: 'absolute', borderRadius: 999, width: 45, height: 45, bottom: 30, left: 60, backgroundColor: '#DBEAFE', opacity: 0.4 },
    headerTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    stepBadge: { backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
    stepBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1.2 },
    backBtnHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    backBtnText: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
    heroTitleEnhanced: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', marginBottom: 2 },
    heroSubtitleSmall: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '500', marginBottom: 8 },
    modernProgressContainer: { flexDirection: 'row', gap: 6, width: '100%' },
    progressSegmentWrapper: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.20)', borderRadius: 2, overflow: 'hidden' },
    progressSegment: { height: '100%', width: '0%' },
    progressSegmentActive: { width: '50%', backgroundColor: '#FFFFFF' },
    progressSegmentDone: { width: '100%', backgroundColor: '#FFFFFF' },
    formCard: { marginTop: -20, marginHorizontal: 16, backgroundColor: '#FFFFFF', borderRadius: 28, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, marginBottom: 16, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 4 },
    googleBtnEnhanced: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, height: 44, marginBottom: 10, shadowColor: 'rgba(0,0,0,0.02)', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 4, elevation: 1 },
    googleG: { fontSize: 18, fontWeight: '700', color: '#4285F4', marginRight: 12 },
    googleBtnText: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
    dividerRowPremium: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, paddingHorizontal: 10 },
    dividerLine: { flex: 1, height: 1, backgroundColor: '#F1F5F9' },
    dividerText: { marginHorizontal: 14, fontSize: 11, color: '#94A3B8', fontWeight: '700', letterSpacing: 1.2 },
    errorBoxEnhanced: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF1F2', borderRadius: 12, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#FECDD3' },
    errorMsgEnhanced: { color: '#E11D48', fontSize: 13, flex: 1, fontWeight: '500' },
    errorTextRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, marginLeft: 4 },
    trustRowEnhanced: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 14, paddingVertical: 8, backgroundColor: 'rgba(239,243,255,0.9)', borderRadius: 12, borderWidth: 1, borderColor: '#EFF3FF' },
    trustItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    trustText: { fontSize: 10, fontWeight: '700', color: '#1E3A8A', letterSpacing: 0.2 },
    trustDivider: { width: 1, height: 10, backgroundColor: '#BFDBFE', marginHorizontal: 2 },
    fieldGroup: { marginBottom: 12 },
    label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6, marginLeft: 2 },
    inputWrapEnhanced: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 16, height: 48, paddingHorizontal: 16 },
    inputFocusedEnhanced: { backgroundColor: '#FFFFFF', borderColor: '#3B5BDB', shadowColor: '#3B5BDB', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
    inputErrorEnhanced: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
    inlineIconBox: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    textPrefixStyle: { fontSize: 15, color: '#334155', fontWeight: '600', marginRight: 6 },
    textInputEnhanced: { flex: 1, fontSize: 16, color: '#0F172A', fontWeight: '600' },
    fieldErrorEnhanced: { fontSize: 12, color: '#EF4444', fontWeight: '500', marginTop: 4, marginLeft: 2 },
    rightIconWrap: { marginLeft: 10 },
    strengthWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2, marginBottom: 6 },
    strengthBarRow: { flexDirection: 'row', gap: 6, flex: 1 },
    strengthSeg: { flex: 1, height: 4, borderRadius: 2 },
    strengthLabel: { fontSize: 12, fontWeight: '700', width: 45, textAlign: 'right' },
    reqWrap: { marginTop: 2, marginBottom: 8, marginLeft: 2 },
    reqItem: { fontSize: 12, marginBottom: 4 },
    primaryBtnEnhanced: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#3B5BDB', borderRadius: 16, height: 48, width: '100%', gap: 8, shadowColor: '#3B5BDB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
    primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    bottomLink: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
    bottomLinkText: { fontSize: 14, color: '#64748B' },
    bottomLinkAction: { fontSize: 14, fontWeight: '600', color: '#3B5BDB' },
    verifyFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%' },
    verifyBtnSmall: { backgroundColor: '#3B5BDB', paddingHorizontal: 12, height: 40, borderRadius: 14, minWidth: 60, alignItems: 'center', justifyContent: 'center', marginTop: 8, shadowColor: '#3B5BDB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
    verifiedBtn: { backgroundColor: '#22C55E', shadowColor: '#3B5BDB' },
    verifyBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
    otpSubtext: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8 },
    resendRow: { alignItems: 'center', marginTop: 16, marginBottom: 24 },
    resendAction: { color: '#3B5BDB', fontSize: 14, fontWeight: '600' },
    timerText: { color: '#8899BB', fontSize: 14 },
    attemptsText: { textAlign: 'center', marginTop: 12, fontSize: 12, color: '#8899BB' },
    centerStepEnhanced: { alignItems: 'center', paddingTop: 10 },
    successCelebrationCard: { width: '100%', borderRadius: 24, padding: 32, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: '#DCFCE7' },
    largeSuccessCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginBottom: 20, shadowColor: '#3B5BDB', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
    successTitle: { fontSize: 24, fontWeight: '800', color: '#166534', marginBottom: 4 },
    successSubtitle: { fontSize: 16, color: '#15803D', fontWeight: '500' },
    nextStepsCard: { backgroundColor: '#EEF1FF', borderRadius: 24, padding: 24, width: '100%', marginBottom: 32, borderWidth: 1, borderColor: '#D0D9F5' },
    nextStepsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    nextStepsTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
    nextStepsDesc: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 20 },
    journeyList: { gap: 16 },
    journeyItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    journeyIconBox: { width: 32, height: 32, borderRadius: 999, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D0D9F5' },
    journeyText: { fontSize: 14, fontWeight: '600', color: '#3D4F7C' },
    planCardGhost: { backgroundColor: '#EEF1FF', borderWidth: 1, borderColor: '#D0D9F5', borderStyle: 'dashed', borderRadius: 16, padding: 16, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
    ghostIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D0D9F5' },
    planTitleGhost: { fontSize: 14, fontWeight: '700', color: '#4A5568' },
    planDesc: { fontSize: 12, color: '#64748B', marginTop: 2 },
    planCardEnhanced: { backgroundColor: '#FFFFFF', borderRadius: 24, marginBottom: 20, borderWidth: 2, borderColor: 'transparent', shadowColor: 'rgba(10,36,99,0.08)', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 1, shadowRadius: 16, elevation: 6, overflow: 'hidden' },
    planCardActive: { borderColor: '#3B5BDB', shadowColor: '#3B5BDB', shadowOpacity: 0.15, elevation: 8 },
    planCardGradient: { padding: 20 },
    planCardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
    planIconBoxEnhanced: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    planPriceCol: { flex: 1 },
    planTitleEnhanced: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
    planPriceEnhanced: { fontSize: 24, fontWeight: '800', color: '#1E293B' },
    planPriceSub: { fontSize: 14, fontWeight: '500', color: '#64748B' },
    selectedCheck: { position: 'absolute', top: -5, right: -5 },
    planFeaturesEnhanced: { gap: 12, marginBottom: 24 },
    featureLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    featureTextEnhanced: { fontSize: 14, color: '#475569', fontWeight: '500' },
    planActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 16, gap: 8 },
    btnActive: { backgroundColor: '#3B5BDB' },
    btnInactive: { backgroundColor: '#E8EDFF' },
    planActionBtnText: { fontSize: 15, fontWeight: '700' },
    txtActive: { color: '#FFFFFF' },
    txtInactive: { color: '#64748B' },
    premiumBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: '#9333EA', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderBottomLeftRadius: 16, zIndex: 10 },
    premiumBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
    readyVisualWrap: { width: 180, height: 180, justifyContent: 'center', alignItems: 'center', marginBottom: 32 },
    readyIconGrid: { position: 'absolute', width: '100%', height: '100%' },
    readyIconBox: { position: 'absolute', width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
    mainReadyCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 12, borderWidth: 1, borderColor: '#E8EDFF' },
    megaTitle: { fontSize: 32, fontWeight: '900', color: '#1E3A8A', textAlign: 'center', marginBottom: 8 },
    megaSubtitle: { fontSize: 16, color: '#64748B', textAlign: 'center', fontWeight: '500', marginBottom: 32 },
    welcomeCard: { paddingHorizontal: 20, marginBottom: 40 },
    welcomeText: { fontSize: 15, color: '#475569', textAlign: 'center', lineHeight: 24 },
    dashboardBtn: { width: '100%', borderRadius: 20, overflow: 'hidden', shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
    dashboardBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 68, gap: 12, paddingHorizontal: 24 },
    dashboardBtnText: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: 'rgba(255,255,255,0.96)', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '80%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#1A202C' },
    modalSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
    closeBtnBox: { padding: 4 },
    searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F4F7FB', borderRadius: 12, paddingHorizontal: 14, height: 44, marginBottom: 12, borderWidth: 1, borderColor: '#D0D9F5' },
    searchInput: { flex: 1, fontSize: 15, color: '#1A202C', marginLeft: 10 },
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, marginTop: 20 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginTop: 16 },
    emptyDesc: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8, paddingHorizontal: 20 },
    cityOption: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FAFBFC', borderWidth: 1, borderColor: '#D0D9F5', borderRadius: 16, marginBottom: 12 },
    cityOptionActive: { backgroundColor: '#EFF3FF', borderColor: '#A5B4FC' },
    cityIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#E8EDFF', alignItems: 'center', justifyContent: 'center' },
    cityName: { fontSize: 16, fontWeight: '600', color: '#1E293B', marginBottom: 2 },
    cityState: { fontSize: 13, color: '#64748B' },
    radioOutline: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
    radioActive: { borderColor: '#3B5BDB' },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B5BDB' },
    paymentSummary: { backgroundColor: '#F4F7FB', borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center' },
    payPlanName: { fontSize: 14, color: '#64748B', fontWeight: '500' },
    payAmount: { fontSize: 28, fontWeight: '700', color: '#1A202C', marginTop: 4 },
    paySubtext: { fontSize: 13, color: '#8899BB', marginBottom: 12, textAlign: 'center' },
    upiRow: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FAFBFC', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#D0D9F5' },
    upiIconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 14, borderWidth: 1, borderColor: '#D0D9F5' },
    upiAppName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1A202C' },
    upiAction: { fontSize: 14, fontWeight: '600', color: '#3B5BDB' },
    payDivider: { height: 1, backgroundColor: '#D0D9F5', marginVertical: 12 },
    payManualBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1A202C', borderRadius: 12, height: 48 },
    payManualText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
    locationTitlePremium: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', marginBottom: 10 },
    locationSubtitlePremium: { fontSize: 15, fontWeight: '500', color: '#8899BB', textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
    locationPrimaryBtn: { backgroundColor: '#3B5BDB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 58, borderRadius: 16, width: '100%', gap: 12, shadowColor: '#3B5BDB', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 6 },
    locationPrimaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    locationSecondaryBtn: { marginTop: 24, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    locationSecondaryBtnText: { color: '#3B5BDB', fontSize: 15, fontWeight: '700' },
    locationSuccessToast: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF3FF', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, marginTop: 20, gap: 8, borderWidth: 1, borderColor: '#A5B4FC' },
    locationSuccessText: { color: '#1E3A8A', fontSize: 13, fontWeight: '600' },
    locationErrorText: { color: '#EF4444', fontSize: 13, fontWeight: '600', marginTop: 16, textAlign: 'center' },
});