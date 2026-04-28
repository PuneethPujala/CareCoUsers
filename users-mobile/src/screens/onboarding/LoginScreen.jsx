import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TextInput, Pressable, Platform,
    KeyboardAvoidingView, Animated, ActivityIndicator, Alert, Modal,
    BackHandler, Dimensions, Image, ScrollView
} from 'react-native';
import { Eye, EyeOff, AlertCircle, X, Lock, Mail } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../lib/api';
import { parseError } from '../../utils/parseError';
import analytics from '../../utils/analytics';
import { colors } from '../../theme';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

const C = {
    bg: '#F4F7FB',
    surface: '#FFFFFF',
    primary: '#6366F1',
    primaryDark: '#4F46E5',
    primarySoft: '#EEF2FF',
    dark: '#1A202C',
    mid: '#4A5568',
    muted: '#94A3B8',
    border: '#E2E8F0',
    inputBg: '#FAFBFF',
    danger: '#EF4444',
    dangerBg: '#FEF2F2',
    tabTrack: '#E8EDF5',
};

const FONT = {
    regular: { fontFamily: 'Inter_400Regular' },
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

// ─── Reset Password OTP Modal ───────────────────────────────────────────────
const ResetPasswordModal = ({ visible, onClose, email }) => {
    const [step, setStep] = useState('request');
    const [resetEmail, setResetEmail] = useState(email || '');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [resendTimer, setResendTimer] = useState(0);

    useEffect(() => {
        let interval;
        if (resendTimer > 0) {
            interval = setInterval(() => setResendTimer(prev => prev - 1), 1000);
        }
        return () => clearInterval(interval);
    }, [resendTimer]);

    useEffect(() => {
        if (visible) {
            setStep('request');
            setResetEmail(email || '');
            setOtp('');
            setNewPassword('');
            setConfirmPassword('');
            setError('');
            setSuccess('');
        }
    }, [visible, email]);

    const handleSendCode = async () => {
        const cleanEmail = resetEmail.trim().toLowerCase();
        if (!cleanEmail || !/\S+@\S+\.\S+/.test(cleanEmail)) {
            setError('Please enter a valid email address.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await apiService.auth.resetPassword(cleanEmail);
            setStep('otp');
            setResendTimer(60);
        } catch (err) {
            setError('Failed to send reset code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (resendTimer > 0) return;
        setLoading(true);
        setError('');
        try {
            await apiService.auth.resetPassword(resetEmail.trim().toLowerCase());
            setResendTimer(60);
            setOtp('');
        } catch (err) {
            setError('Failed to resend code.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyAndReset = async () => {
        if (otp.length < 6) { setError('Please enter the 6-digit code.'); return; }
        if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
        if (!/[A-Z]/.test(newPassword)) { setError('Password must contain an uppercase letter.'); return; }
        if (!/[0-9]/.test(newPassword)) { setError('Password must contain a number.'); return; }
        if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }

        setLoading(true);
        setError('');
        try {
            await apiService.auth.resetPasswordVerify({
                email: resetEmail.trim().toLowerCase(),
                otp,
                newPassword,
            });
            setSuccess('Password reset successfully! You can now log in.');
            setTimeout(() => onClose(), 2000);
        } catch (err) {
            const msg = err?.response?.data?.error || 'Failed to reset password.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} animationType="fade" transparent>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={rs.overlay}>
                    <View style={rs.sheet}>
                        <View style={rs.header}>
                            <Text style={rs.title}>
                                {step === 'request' ? 'Reset Password' : step === 'otp' ? 'Enter Code & New Password' : 'Success'}
                            </Text>
                            <Pressable onPress={onClose} hitSlop={12}><X size={22} color="#64748B" /></Pressable>
                        </View>

                        {success ? (
                            <View style={rs.successBox}>
                                <Text style={rs.successText}>✅ {success}</Text>
                            </View>
                        ) : null}

                        {error ? (
                            <View style={rs.errorBox}>
                                <AlertCircle size={16} color={C.danger} />
                                <Text style={rs.errorText}>{error}</Text>
                            </View>
                        ) : null}

                        {step === 'request' && (
                            <>
                                <Text style={rs.subtitle}>Enter your email and we'll send a 6-digit code to reset your password.</Text>
                                <View style={rs.inputWrap}>
                                    <Mail size={18} color={C.muted} />
                                    <TextInput
                                        style={rs.input}
                                        placeholder="name@example.com"
                                        placeholderTextColor={C.muted}
                                        value={resetEmail}
                                        onChangeText={(v) => { setResetEmail(v); setError(''); }}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                    />
                                </View>
                                <Pressable style={[rs.btn, loading && { opacity: 0.7 }]} onPress={handleSendCode} disabled={loading}>
                                    {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={rs.btnText}>Send Reset Code</Text>}
                                </Pressable>
                            </>
                        )}

                        {step === 'otp' && (
                            <>
                                <Text style={rs.subtitle}>Enter the code sent to <Text style={{ ...FONT.bold }}>{resetEmail}</Text> and set your new password.</Text>
                                <View style={rs.inputWrap}>
                                    <Lock size={18} color={C.muted} />
                                    <TextInput
                                        style={[rs.input, { letterSpacing: 6, fontSize: 22, textAlign: 'center' }]}
                                        placeholder="000000"
                                        placeholderTextColor="#CBD5E1"
                                        maxLength={6}
                                        keyboardType="number-pad"
                                        value={otp}
                                        onChangeText={(v) => { setOtp(v); setError(''); }}
                                    />
                                </View>
                                <View style={rs.resendRow}>
                                    {resendTimer > 0 ? (
                                        <Text style={rs.timerText}>Resend in {resendTimer}s</Text>
                                    ) : (
                                        <Pressable onPress={handleResend} disabled={loading}>
                                            <Text style={rs.resendAction}>Resend Code</Text>
                                        </Pressable>
                                    )}
                                </View>
                                <View style={rs.inputWrap}>
                                    <Lock size={18} color={C.muted} />
                                    <TextInput
                                        style={rs.input}
                                        placeholder="New password"
                                        placeholderTextColor={C.muted}
                                        value={newPassword}
                                        onChangeText={(v) => { setNewPassword(v); setError(''); }}
                                        secureTextEntry={!showPass}
                                    />
                                    <Pressable onPress={() => setShowPass(!showPass)} hitSlop={12}>
                                        {showPass ? <Eye size={18} color={C.primary} /> : <EyeOff size={18} color={C.muted} />}
                                    </Pressable>
                                </View>
                                <View style={rs.inputWrap}>
                                    <Lock size={18} color={C.muted} />
                                    <TextInput
                                        style={rs.input}
                                        placeholder="Confirm new password"
                                        placeholderTextColor={C.muted}
                                        value={confirmPassword}
                                        onChangeText={(v) => { setConfirmPassword(v); setError(''); }}
                                        secureTextEntry={!showPass}
                                    />
                                </View>
                                <Pressable style={[rs.btn, loading && { opacity: 0.7 }]} onPress={handleVerifyAndReset} disabled={loading}>
                                    {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={rs.btnText}>Reset Password</Text>}
                                </Pressable>
                            </>
                        )}
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const rs = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    sheet: { width: '100%', maxWidth: 420, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    title: { fontSize: 20, ...FONT.heavy, color: C.dark },
    subtitle: { fontSize: 14, ...FONT.medium, color: C.muted, lineHeight: 22, marginBottom: 20 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.border, borderRadius: 14, height: 56, paddingHorizontal: 16, marginBottom: 14, gap: 12 },
    input: { flex: 1, fontSize: 16, color: C.dark, ...FONT.semibold, paddingVertical: 0 },
    btn: { backgroundColor: C.primary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    btnText: { color: '#FFF', fontSize: 16, ...FONT.bold },
    errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.dangerBg, borderRadius: 12, padding: 14, marginBottom: 14 },
    errorText: { color: '#991B1B', fontSize: 13, ...FONT.semibold, flex: 1 },
    successBox: { backgroundColor: '#DCFCE7', borderRadius: 12, padding: 14, marginBottom: 14 },
    successText: { color: '#166534', fontSize: 14, ...FONT.bold },
    resendRow: { alignItems: 'center', marginBottom: 16, marginTop: -4 },
    timerText: { fontSize: 13, ...FONT.bold, color: C.muted },
    resendAction: { fontSize: 14, ...FONT.heavy, color: C.primary },
});

// ─── Main LoginScreen ─────────────────────────────────────────────────────
export default function LoginScreen({ navigation }) {
    const { signIn, signInWithGoogle, injectSession, signOut, sendOtp, verifyOtp } = useAuth();

    // ── Email tab state ──────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState('email');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorText, setErrorText] = useState('');
    const [emailFocused, setEmailFocused] = useState(false);
    const [passFocused, setPassFocused] = useState(false);
    const [resetModalVisible, setResetModalVisible] = useState(false);

    // ── Phone tab state ──────────────────────────────────────────────────────
    const [phone, setPhone] = useState('');
    const [phoneFocused, setPhoneFocused] = useState(false);
    const [phoneError, setPhoneError] = useState('');
    const [phoneOtpLoading, setPhoneOtpLoading] = useState(false);
    const [phoneOtpVisible, setPhoneOtpVisible] = useState(false);
    const [phoneOtpCode, setPhoneOtpCode] = useState('');
    const [phoneOtpTimer, setPhoneOtpTimer] = useState(0);
    const [phoneOtpAttempts, setPhoneOtpAttempts] = useState(0);
    const [phoneOtpSent, setPhoneOtpSent] = useState(false);

    const isSubmittingRef = useRef(false);
    const abortRef = useRef(null);
    const emailRef = useRef(null);
    const passwordRef = useRef(null);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(16)).current;

    useEffect(() => {
        GoogleSignin.configure({
            webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
            offlineAccess: false,
        });

        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
        ]).start();
    }, []);

    useEffect(() => {
        const backAction = () => {
            BackHandler.exitApp();
            return true;
        };
        const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
        return () => sub.remove();
    }, []);

    useEffect(() => {
        return () => {
            if (abortRef.current) abortRef.current.abort();
        };
    }, []);

    // Phone OTP countdown
    useEffect(() => {
        if (phoneOtpTimer <= 0) return;
        const interval = setInterval(() => setPhoneOtpTimer(prev => prev - 1), 1000);
        return () => clearInterval(interval);
    }, [phoneOtpTimer]);

    const handleGooglePress = async () => {
        try {
            setTimeout(() => setLoading(true), 0);
            setErrorText('');
            await GoogleSignin.hasPlayServices();
            try { await GoogleSignin.signOut(); } catch (e) {}
            const signInResult = await GoogleSignin.signIn();
            const idToken = signInResult?.data?.idToken;
            if (!idToken) {
                setErrorText('Failed to get Google ID token. Please try again.');
                return;
            }
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
                        setErrorText('Registration succeeded but no profile returned. Please try again.');
                        await signOut();
                    }
                } catch (regError) {
                    const code = regError?.response?.data?.code;
                    const regProfile = regError?.response?.data?.profile;
                    const regSession = regError?.response?.data?.session;
                    if (code === 'EMAIL_ALREADY_EXISTS' && regProfile && regSession) {
                        await injectSession(regSession, regProfile);
                    } else if (code === 'EMAIL_ALREADY_EXISTS') {
                        setErrorText('An account with this email already exists. Please try logging in with your password.');
                        await signOut();
                    } else {
                        setErrorText(regError?.response?.data?.error || 'Failed to create account. Please try again.');
                        await signOut();
                    }
                }
            } else {
                analytics.loginSuccess(result?.user?.id);
            }
        } catch (error) {
            try { await GoogleSignin.signOut(); } catch { }
            if (error?.code === statusCodes.SIGN_IN_CANCELLED) {
                // User cancelled
            } else if (error?.code === statusCodes.IN_PROGRESS) {
                setErrorText('Sign-in already in progress.');
            } else if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                setErrorText('Google Play Services not available. Please update.');
            } else {
                const { general } = parseError(error);
                setErrorText(general || error?.message || 'Google sign-in failed');
                analytics.loginFailure(error?.code || 'google_error');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async () => {
        if (isSubmittingRef.current) return;
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail) { setErrorText('Please enter your email address.'); return; }
        if (!/\S+@\S+\.\S+/.test(cleanEmail)) { setErrorText('Please enter a valid email address.'); return; }
        if (!password) { setErrorText('Please enter your password.'); return; }
        if (password.length < 6) { setErrorText('Password must be at least 6 characters.'); return; }

        isSubmittingRef.current = true;
        setLoading(true);
        setErrorText('');

        try {
            const result = await signIn(cleanEmail, password, 'patient');

            if (result?.requireMfa && result?.mfa_token) {
                setLoading(false);
                isSubmittingRef.current = false;
                navigation.navigate('MFAVerify', {
                    mfaToken: result.mfa_token,
                    profile: result.profile,
                });
                return;
            }

            setEmail('');
            setPassword('');
            analytics.loginSuccess(result?.session?.user?.id);
        } catch (error) {
            const code = error?.response?.data?.code;
            if (code === 'NO_PASSWORD_SET') {
                setErrorText('This account uses Google Sign-In. Please log in with Google, then set a password in Settings.');
            } else {
                const msg = error?.response?.data?.error || 'Invalid email or password. Please try again.';
                setErrorText(msg);
            }
            setPassword('');
            analytics.loginFailure(error?.code || 'login_error');
        } finally {
            setLoading(false);
            isSubmittingRef.current = false;
        }
    };

    const handleSendPhoneOtp = async () => {
        const cleaned = phone.replace(/\D/g, '');
        if (!cleaned || cleaned.length !== 10) {
            setPhoneError('Please enter a valid 10-digit mobile number.');
            return;
        }
        setPhoneOtpLoading(true);
        setPhoneError('');
        try {
            await sendOtp('phone', `+91${cleaned}`);
            setPhoneOtpSent(true);
            setPhoneOtpTimer(60);
            setPhoneOtpAttempts(0);
            setPhoneOtpCode('');
            setPhoneOtpVisible(true);
        } catch (error) {
            const msg = error?.response?.data?.error || 'Failed to send OTP. Please try again.';
            setPhoneError(msg);
        } finally { setPhoneOtpLoading(false); }
    };

    const handleResendPhoneOtp = async () => {
        if (phoneOtpTimer > 0) return;
        setPhoneOtpLoading(true);
        setPhoneError('');
        try {
            await sendOtp('phone', `+91${phone.replace(/\D/g, '')}`);
            setPhoneOtpTimer(60);
            setPhoneOtpCode('');
            setPhoneOtpAttempts(0);
        } catch (error) {
            setPhoneError(error?.response?.data?.error || 'Failed to resend OTP.');
        } finally { setPhoneOtpLoading(false); }
    };

    const handleVerifyPhoneOtp = async () => {
        if (phoneOtpCode.length < 6) { setPhoneError('Please enter the 6-digit code.'); return; }
        setPhoneOtpLoading(true);
        setPhoneError('');
        try {
            const result = await verifyOtp('phone', `+91${phone.replace(/\D/g, '')}`, phoneOtpCode);
            if (result?.session && result?.profile) {
                await injectSession(result.session, result.profile);
            } else if (result?.session) {
                await injectSession(result.session, null);
            } else {
                setPhoneError('This phone number is not registered. Please sign up first.');
            }
        } catch (error) {
            const newAttempts = phoneOtpAttempts + 1;
            setPhoneOtpAttempts(newAttempts);
            if (newAttempts >= 3) {
                setPhoneOtpVisible(false);
                setPhoneError('Too many failed attempts. Please request a new code.');
            } else {
                setPhoneError(error?.response?.data?.error || 'Incorrect code. Please try again.');
            }
        } finally { setPhoneOtpLoading(false); }
    };

    const handleEmailChange = (v) => { setEmail(v); if (errorText) setErrorText(''); };
    const handlePasswordChange = (v) => { setPassword(v); if (errorText) setErrorText(''); };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

                    {/* Welcome badge */}
                    <View style={styles.welcomeBadge}>
                        <View style={styles.welcomeDot} />
                        <Text style={styles.welcomeBadgeText}>Welcome back</Text>
                    </View>

                    {/* Title */}
                    <Text style={styles.titleLine1}>Sign in to</Text>
                    <Text style={styles.titleAppName}>CareMyMed</Text>

                    {/* Tab switcher */}
                    <View style={styles.tabTrack}>
                        <Pressable
                            style={activeTab === 'email' ? styles.tabActive : styles.tabInactive}
                            onPress={() => { setActiveTab('email'); setErrorText(''); setPhoneError(''); }}
                        >
                            <Text style={activeTab === 'email' ? styles.tabActiveText : styles.tabInactiveText}>Email</Text>
                        </Pressable>
                        <Pressable
                            style={activeTab === 'phone' ? styles.tabActive : styles.tabInactive}
                            onPress={() => { setActiveTab('phone'); setErrorText(''); setPhoneError(''); }}
                        >
                            <Text style={activeTab === 'phone' ? styles.tabActiveText : styles.tabInactiveText}>Phone</Text>
                        </Pressable>
                    </View>

                    {/* ── Email login form ── */}
                    {activeTab === 'email' && (
                        <>
                            {errorText ? (
                                <View style={styles.errorBox}>
                                    <AlertCircle size={15} color={C.danger} />
                                    <Text style={styles.errorMsg}>{errorText}</Text>
                                </View>
                            ) : null}

                            <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
                            <TextInput
                                ref={emailRef}
                                style={[styles.input, emailFocused && styles.inputFocused]}
                                placeholder="you@example.com"
                                placeholderTextColor={C.muted}
                                value={email}
                                onChangeText={handleEmailChange}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                autoCorrect={false}
                                spellCheck={false}
                                textContentType="emailAddress"
                                onFocus={() => setEmailFocused(true)}
                                onBlur={() => setEmailFocused(false)}
                                blurOnSubmit={false}
                                autoFocus
                                returnKeyType="next"
                                onSubmitEditing={() => passwordRef.current?.focus()}
                            />

                            <View style={styles.passwordLabelRow}>
                                <Text style={styles.fieldLabel}>PASSWORD</Text>
                                <Pressable onPress={() => setResetModalVisible(true)} hitSlop={10}>
                                    <Text style={styles.forgotLink}>Forgot?</Text>
                                </Pressable>
                            </View>
                            <View style={[styles.passwordWrap, passFocused && styles.inputFocused]}>
                                <TextInput
                                    ref={passwordRef}
                                    style={styles.passwordInput}
                                    placeholder="Enter your password"
                                    placeholderTextColor={C.muted}
                                    value={password}
                                    onChangeText={handlePasswordChange}
                                    secureTextEntry={!showPassword}
                                    textContentType="password"
                                    onFocus={() => setPassFocused(true)}
                                    onBlur={() => setPassFocused(false)}
                                    returnKeyType="done"
                                    onSubmitEditing={handleLogin}
                                />
                                <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={12}>
                                    {showPassword
                                        ? <Eye size={18} color={C.primary} />
                                        : <EyeOff size={18} color={C.muted} />
                                    }
                                </Pressable>
                            </View>

                            <Pressable
                                style={[styles.signInBtn, loading && { opacity: 0.7 }]}
                                onPress={handleLogin}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.signInBtnText}>Sign In</Text>
                                )}
                            </Pressable>
                        </>
                    )}

                    {/* ── Phone login form ── */}
                    {activeTab === 'phone' && (
                        <>
                            {phoneError ? (
                                <View style={styles.errorBox}>
                                    <AlertCircle size={15} color={C.danger} />
                                    <Text style={styles.errorMsg}>{phoneError}</Text>
                                </View>
                            ) : null}

                            <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
                            <View style={[styles.passwordWrap, phoneFocused && styles.inputFocused, { marginBottom: 26 }]}>
                                <Text style={{ fontSize: 15, ...FONT.medium, color: C.mid, marginRight: 4 }}>+91</Text>
                                <TextInput
                                    style={styles.passwordInput}
                                    placeholder="10-digit mobile number"
                                    placeholderTextColor={C.muted}
                                    value={phone}
                                    onChangeText={(v) => { setPhone(v.replace(/\D/g, '').slice(0, 10)); setPhoneError(''); }}
                                    keyboardType="phone-pad"
                                    maxLength={10}
                                    onFocus={() => setPhoneFocused(true)}
                                    onBlur={() => setPhoneFocused(false)}
                                    returnKeyType="done"
                                    onSubmitEditing={handleSendPhoneOtp}
                                />
                            </View>

                            <Pressable
                                style={[styles.signInBtn, phoneOtpLoading && { opacity: 0.7 }]}
                                onPress={handleSendPhoneOtp}
                                disabled={phoneOtpLoading}
                            >
                                {phoneOtpLoading ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.signInBtnText}>
                                        {phoneOtpSent ? 'Resend OTP' : 'Send OTP'}
                                    </Text>
                                )}
                            </Pressable>
                        </>
                    )}

                    {/* Divider */}
                    <View style={styles.dividerRow}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>or continue with</Text>
                        <View style={styles.dividerLine} />
                    </View>

                    {/* Google */}
                    <Pressable style={styles.socialBtn} onPress={handleGooglePress} disabled={loading}>
                        <View style={styles.googleIconBox}>
                            <Text style={styles.googleIconText}>G</Text>
                        </View>
                        <Text style={styles.socialBtnText}>Continue with Google</Text>
                    </Pressable>

                    {/* Apple — coming soon */}
                    <Pressable style={[styles.socialBtn, styles.socialBtnDisabled]} disabled>
                        <View style={styles.appleIconBox}>
                            <Text style={styles.appleIconText}>a</Text>
                        </View>
                        <Text style={[styles.socialBtnText, { color: C.muted }]}>Continue with Apple</Text>
                    </Pressable>

                    {/* Sign up row */}
                    <View style={styles.signupRow}>
                        <Text style={styles.signupText}>Don't have an account? </Text>
                        <Pressable onPress={() => navigation.navigate('PatientSignup')}>
                            <Text style={styles.signupLink}>Sign up</Text>
                        </Pressable>
                    </View>

                </Animated.View>
            </ScrollView>

            <ResetPasswordModal
                visible={resetModalVisible}
                onClose={() => setResetModalVisible(false)}
                email={email}
            />

            {/* Phone OTP Modal */}
            <Modal
                visible={phoneOtpVisible}
                animationType="fade"
                transparent
                onRequestClose={() => !phoneOtpLoading && setPhoneOtpVisible(false)}
            >
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Pressable style={phoneOtpSt.overlay} onPress={() => { if (!phoneOtpLoading) setPhoneOtpVisible(false); }}>
                        <Pressable onPress={(e) => e.stopPropagation()} style={phoneOtpSt.card}>
                            <View style={phoneOtpSt.header}>
                                <View style={{ flex: 1 }}>
                                    <Text style={phoneOtpSt.title}>Verify Phone</Text>
                                    <Text style={phoneOtpSt.sub}>Code sent to +91 {phone}</Text>
                                </View>
                                <Pressable
                                    onPress={() => setPhoneOtpVisible(false)}
                                    hitSlop={12}
                                    disabled={phoneOtpLoading}
                                    style={phoneOtpSt.closeBtn}
                                >
                                    <X size={18} color={C.mid} />
                                </Pressable>
                            </View>

                            {phoneError ? (
                                <View style={phoneOtpSt.errorBox}>
                                    <AlertCircle size={14} color={C.danger} />
                                    <Text style={phoneOtpSt.errorText}>{phoneError}</Text>
                                </View>
                            ) : null}

                            <TextInput
                                style={phoneOtpSt.otpInput}
                                value={phoneOtpCode}
                                onChangeText={(v) => { setPhoneOtpCode(v.replace(/\D/g, '').slice(0, 6)); setPhoneError(''); }}
                                keyboardType="number-pad"
                                maxLength={6}
                                textAlign="center"
                                autoFocus
                                placeholder="• • • • • •"
                                placeholderTextColor={C.muted}
                            />

                            <View style={phoneOtpSt.resendRow}>
                                {phoneOtpTimer > 0 ? (
                                    <Text style={phoneOtpSt.timerText}>Resend in {phoneOtpTimer}s</Text>
                                ) : (
                                    <Pressable onPress={handleResendPhoneOtp} disabled={phoneOtpLoading}>
                                        <Text style={[phoneOtpSt.resendLink, phoneOtpLoading && { opacity: 0.5 }]}>Resend Code</Text>
                                    </Pressable>
                                )}
                            </View>

                            <Pressable
                                style={[phoneOtpSt.btn, phoneOtpLoading && { opacity: 0.7 }]}
                                onPress={handleVerifyPhoneOtp}
                                disabled={phoneOtpLoading}
                            >
                                {phoneOtpLoading ? (
                                    <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                    <Text style={phoneOtpSt.btnText}>Sign In</Text>
                                )}
                            </Pressable>
                        </Pressable>
                    </Pressable>
                </KeyboardAvoidingView>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const phoneOtpSt = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    card: { backgroundColor: C.surface, borderRadius: 24, padding: 24, width: '100%', maxWidth: 420, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 20, ...FONT.heavy, color: C.dark },
    sub: { fontSize: 13, ...FONT.medium, color: C.muted, marginTop: 2 },
    closeBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
    errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.dangerBg, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#FCA5A5' },
    errorText: { color: '#991B1B', fontSize: 13, ...FONT.semibold, flex: 1 },
    otpInput: { backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.border, borderRadius: 14, height: 64, fontSize: 28, ...FONT.bold, color: C.dark, letterSpacing: 12, marginBottom: 16 },
    resendRow: { alignItems: 'center', marginBottom: 20 },
    timerText: { fontSize: 13, ...FONT.bold, color: C.muted },
    resendLink: { fontSize: 14, ...FONT.heavy, color: C.primary },
    btn: { backgroundColor: C.primary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
    btnText: { color: '#FFF', fontSize: 16, ...FONT.bold },
});

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: C.bg,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 28,
        paddingTop: Platform.OS === 'ios' ? 72 : 52,
        paddingBottom: 48,
    },

    // ─── Welcome badge ────────────────────────────
    welcomeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: C.primarySoft,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 7,
        marginBottom: 22,
        gap: 7,
    },
    welcomeDot: {
        width: 7,
        height: 7,
        borderRadius: 999,
        backgroundColor: C.primary,
    },
    welcomeBadgeText: {
        fontSize: 13,
        ...FONT.semibold,
        color: C.primary,
    },

    // ─── Title ────────────────────────────────────
    titleLine1: {
        fontSize: 30,
        ...FONT.heavy,
        color: C.dark,
        lineHeight: 36,
    },
    titleAppName: {
        fontSize: 34,
        ...FONT.heavy,
        color: C.primary,
        lineHeight: 42,
        marginBottom: 30,
        letterSpacing: -0.5,
    },

    // ─── Tab switcher ─────────────────────────────
    tabTrack: {
        flexDirection: 'row',
        backgroundColor: C.tabTrack,
        borderRadius: 12,
        padding: 4,
        marginBottom: 28,
    },
    tabActive: {
        flex: 1,
        backgroundColor: C.surface,
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    tabActiveText: {
        fontSize: 14,
        ...FONT.semibold,
        color: C.dark,
    },
    tabInactive: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
    },
    tabInactiveText: {
        fontSize: 14,
        ...FONT.medium,
        color: C.muted,
    },

    // ─── Error ────────────────────────────────────
    errorBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: C.dangerBg,
        borderRadius: 12,
        padding: 12,
        marginBottom: 18,
        borderWidth: 1,
        borderColor: '#FCA5A5',
    },
    errorMsg: {
        color: '#991B1B',
        fontSize: 13,
        ...FONT.semibold,
        flex: 1,
    },

    // ─── Fields ───────────────────────────────────
    fieldLabel: {
        fontSize: 11,
        ...FONT.bold,
        color: C.mid,
        letterSpacing: 1.2,
        marginBottom: 8,
    },
    input: {
        backgroundColor: C.surface,
        borderWidth: 1.5,
        borderColor: C.border,
        borderRadius: 14,
        height: 52,
        paddingHorizontal: 16,
        fontSize: 15,
        ...FONT.medium,
        color: C.dark,
        marginBottom: 20,
    },
    inputFocused: {
        borderColor: C.primary,
        shadowColor: C.primary,
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
    },
    passwordLabelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    forgotLink: {
        fontSize: 13,
        ...FONT.bold,
        color: C.primary,
    },
    passwordWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: C.surface,
        borderWidth: 1.5,
        borderColor: C.border,
        borderRadius: 14,
        height: 52,
        paddingHorizontal: 16,
        marginBottom: 26,
    },
    passwordInput: {
        flex: 1,
        fontSize: 15,
        ...FONT.medium,
        color: C.dark,
        paddingVertical: 0,
    },

    // ─── Sign In button ───────────────────────────
    signInBtn: {
        backgroundColor: C.primary,
        borderRadius: 14,
        height: 54,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: C.primaryDark,
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
        marginBottom: 28,
    },
    signInBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        ...FONT.bold,
    },

    // ─── Divider ──────────────────────────────────
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: C.border,
    },
    dividerText: {
        marginHorizontal: 14,
        fontSize: 13,
        ...FONT.medium,
        color: C.muted,
    },

    // ─── Social buttons ───────────────────────────
    socialBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: C.surface,
        borderWidth: 1.5,
        borderColor: C.border,
        borderRadius: 14,
        height: 54,
        paddingHorizontal: 20,
        gap: 14,
        marginBottom: 12,
    },
    socialBtnDisabled: {
        opacity: 0.5,
    },
    socialBtnText: {
        fontSize: 15,
        ...FONT.semibold,
        color: C.dark,
    },
    googleIconBox: {
        width: 26,
        height: 26,
        borderRadius: 7,
        backgroundColor: '#4285F4',
        alignItems: 'center',
        justifyContent: 'center',
    },
    googleIconText: {
        fontSize: 14,
        ...FONT.heavy,
        color: '#FFFFFF',
    },
    appleIconBox: {
        width: 26,
        height: 26,
        borderRadius: 7,
        backgroundColor: '#1A202C',
        alignItems: 'center',
        justifyContent: 'center',
    },
    appleIconText: {
        fontSize: 14,
        ...FONT.heavy,
        color: '#FFFFFF',
        lineHeight: 20,
    },

    // ─── Sign up row ──────────────────────────────
    signupRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 24,
    },
    signupText: {
        fontSize: 14,
        ...FONT.medium,
        color: C.mid,
    },
    signupLink: {
        fontSize: 14,
        ...FONT.heavy,
        color: C.primary,
    },
});
