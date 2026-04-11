import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TextInput, Pressable, Platform,
    KeyboardAvoidingView, Animated, ActivityIndicator, Alert, Modal,
    BackHandler, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Mail, Lock, Eye, EyeOff, HeartPulse, AlertCircle, Smartphone, ChevronRight, X } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../lib/api';
import { parseError } from '../../utils/parseError';
import analytics from '../../utils/analytics';
import { colors } from '../../theme';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

const { height: SCREEN_H } = Dimensions.get('window');

const C = {
    pageBg:        '#EEF1FF',
    heroBgTop:     '#3B5BDB',
    heroBgBottom:  '#7B9CFF',
    orbDark:       '#1E3A8A',
    orbMid:        '#93C5FD',
    orbLight:      '#DBEAFE',
    cardBg:        'rgba(255,255,255,0.85)',
    cardBorder:    'rgba(255,255,255,0.6)',
    primary:       '#3B5BDB',
    primaryDark:   '#1E3A8A',
    primarySoft:   '#EFF3FF',
    dark:          '#0D1B4B',
    mid:           '#3D4F7C',
    muted:         '#8899BB',
    light:         '#CBD5E1',
    border:        '#E8EDFF',
    borderMid:     '#D0D9F5',
    danger:        '#F43F5E',
    dangerBg:      '#FFE4E6',
    success:       '#22C55E',
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
    const [step, setStep] = useState('request'); // 'request' | 'otp' | 'newpass'
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
        </Modal>
    );
};

const rs = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    sheet: { width: '100%', maxWidth: 420, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 32, padding: 28, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    title: { fontSize: 20, ...FONT.heavy, color: '#0D1B4B' },
    subtitle: { fontSize: 14, ...FONT.medium, color: C.muted, lineHeight: 22, marginBottom: 20 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1.5, borderColor: C.borderMid, borderRadius: 16, height: 56, paddingHorizontal: 16, marginBottom: 14, gap: 12 },
    input: { flex: 1, fontSize: 16, color: C.dark, ...FONT.semibold },
    btn: { backgroundColor: '#3B5BDB', borderRadius: 16, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
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
    const { signIn, signInWithGoogle, resetPassword } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorText, setErrorText] = useState('');
    const [emailFocused, setEmailFocused] = useState(false);
    const [passFocused, setPassFocused] = useState(false);
    const [resetModalVisible, setResetModalVisible] = useState(false);

    const isSubmittingRef = useRef(false);
    const abortRef = useRef(null);
    const emailRef = useRef(null);
    const passwordRef = useRef(null);

    // Animations
    const heroAnim = useRef(new Animated.Value(-10)).current;
    const heroOpacity = useRef(new Animated.Value(0)).current;
    const cardAnim = useRef(new Animated.Value(20)).current;
    const cardOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        GoogleSignin.configure({
            webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
            offlineAccess: false,
        });

        Animated.parallel([
            Animated.timing(heroAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
            Animated.timing(heroOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(cardAnim, { toValue: 0, duration: 350, delay: 100, useNativeDriver: true }),
            Animated.timing(cardOpacity, { toValue: 1, duration: 350, delay: 100, useNativeDriver: true }),
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

    const handleGooglePress = async () => {
        try {
            setLoading(true);
            setErrorText('');
            await GoogleSignin.hasPlayServices();
            const signInResult = await GoogleSignin.signIn();
            const idToken = signInResult?.data?.idToken;
            if (!idToken) {
                setErrorText('Failed to get Google ID token. Please try again.');
                return;
            }
            const result = await signInWithGoogle(idToken);
            if (result?.isNewUser) {
                setErrorText('No Samvaya account found for this Google account. Please sign up first.');
                analytics.loginFailure('google_no_account');
            } else {
                analytics.loginSuccess(result?.user?.id);
            }
        } catch (error) {
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
            setEmail('');
            setPassword('');
            analytics.loginSuccess(result?.session?.user?.id);
        } catch (error) {
            const { general } = parseError(error);
            setErrorText(general);
            setPassword('');
            analytics.loginFailure(error?.code || 'login_error');
        } finally {
            setLoading(false);
            isSubmittingRef.current = false;
        }
    };

    const handleEmailChange = (v) => { setEmail(v); if (errorText) setErrorText(''); };
    const handlePasswordChange = (v) => { setPassword(v); if (errorText) setErrorText(''); };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* Hero Section — compact, no scroll needed */}
            <Animated.View style={{ transform: [{ translateY: heroAnim }], opacity: heroOpacity }}>
                <LinearGradient
                    colors={['#1E3A8A', '#3B5BDB', '#60A5FA']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.hero}
                >
                    <View style={styles.orb1} />
                    <View style={styles.orb2} />
                    <View style={styles.orb3} />
                    <View style={styles.orb4} />

                    <View style={styles.heroIconWrap}>
                        <HeartPulse size={44} color="#FFFFFF" strokeWidth={1.5} />
                    </View>
                    <Text style={styles.heroLabel}>SAMVAYA</Text>
                    <Text style={styles.heroTitle}>Welcome Back</Text>
                    <Text style={styles.heroSubtitle}>Your health journey continues here</Text>
                </LinearGradient>
            </Animated.View>

            {/* Form Card — no ScrollView, fits on screen */}
            <Animated.View style={[styles.formCard, { transform: [{ translateY: cardAnim }], opacity: cardOpacity }]}>

                {/* Social Logins */}
                <View style={styles.socialRowPremium}>
                    <Pressable style={styles.socialBtnPremium} onPress={handleGooglePress} disabled={loading}>
                        <Text style={styles.googleG}>G</Text>
                        <Text style={styles.socialBtnTextPremium}>Google</Text>
                    </Pressable>
                    <Pressable style={styles.socialBtnPremium} onPress={() => { }} disabled={loading}>
                        <Smartphone size={20} color={C.mid} />
                        <Text style={styles.socialBtnTextPremium}>Mobile</Text>
                    </Pressable>
                </View>

                {/* Divider */}
                <View style={styles.dividerRowPremium}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>OR LOGIN WITH EMAIL</Text>
                    <View style={styles.dividerLine} />
                </View>

                {/* Error */}
                {errorText ? (
                    <View style={styles.errorBox}>
                        <AlertCircle size={16} color={C.danger} />
                        <Text style={styles.errorMsg}>{errorText}</Text>
                    </View>
                ) : null}

                {/* Email Field */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Email Address</Text>
                    <Pressable
                        style={[styles.inputWrap, emailFocused && styles.inputFocused]}
                        onPress={() => emailRef.current?.focus()}
                    >
                        <View style={[styles.inlineIconBox, emailFocused && { backgroundColor: C.primarySoft }]}>
                            <Mail size={18} color={emailFocused ? C.primary : C.muted} />
                        </View>
                        <TextInput
                            ref={emailRef}
                            style={styles.textInput}
                            placeholder="name@example.com"
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
                        />
                    </Pressable>
                </View>

                {/* Password Field */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Password</Text>
                    <Pressable
                        style={[styles.inputWrap, passFocused && styles.inputFocused]}
                        onPress={() => passwordRef.current?.focus()}
                    >
                        <View style={[styles.inlineIconBox, passFocused && { backgroundColor: C.primarySoft }]}>
                            <Lock size={18} color={passFocused ? C.primary : C.muted} />
                        </View>
                        <TextInput
                            ref={passwordRef}
                            style={styles.textInput}
                            placeholder="Enter password"
                            placeholderTextColor={C.muted}
                            value={password}
                            onChangeText={handlePasswordChange}
                            secureTextEntry={!showPassword}
                            textContentType="password"
                            onFocus={() => setPassFocused(true)}
                            onBlur={() => setPassFocused(false)}
                        />
                        <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={12}>
                            {showPassword ? <Eye size={18} color={C.primary} /> : <EyeOff size={18} color={C.muted} />}
                        </Pressable>
                    </Pressable>
                </View>

                {/* Forgot Password */}
                <Pressable style={styles.forgotRow} onPress={() => setResetModalVisible(true)}>
                    <Text style={styles.forgotText}>Forgot Password?</Text>
                </Pressable>

                {/* Login Button */}
                <Pressable style={[styles.primaryBtn, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading}>
                    <LinearGradient
                        colors={['#3B5BDB', '#1E3A8A']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={styles.primaryBtnGradient}
                    >
                        {loading ? (
                            <View style={styles.loadingRow}>
                                <ActivityIndicator size="small" color="#FFFFFF" />
                                <Text style={styles.primaryBtnText}>  Verifying...</Text>
                            </View>
                        ) : (
                            <>
                                <Text style={styles.primaryBtnText}>Sign In to Dashboard</Text>
                                <ChevronRight size={20} color="#FFFFFF" />
                            </>
                        )}
                    </LinearGradient>
                </Pressable>

                {/* Sign Up Link */}
                <View style={styles.bottomLink}>
                    <Text style={styles.bottomLinkText}>Don't have an account?  </Text>
                    <Pressable onPress={() => navigation.navigate('PatientSignup')}>
                        <Text style={styles.bottomLinkAction}>Sign Up</Text>
                    </Pressable>
                </View>

            </Animated.View>

            {/* Reset Password Modal */}
            <ResetPasswordModal
                visible={resetModalVisible}
                onClose={() => setResetModalVisible(false)}
                email={email}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.pageBg },

    // ─── Hero Section — Compact ────────────────
    hero: {
        minHeight: 220,
        borderBottomLeftRadius: 36,
        borderBottomRightRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: Platform.OS === 'ios' ? 50 : 30,
        paddingBottom: 24,
        overflow: 'hidden',
    },
    orb1: { position: 'absolute', borderRadius: 999, width: 140, height: 140, top: -40, right: -40, backgroundColor: '#1E3A8A', opacity: 0.75 },
    orb2: { position: 'absolute', borderRadius: 999, width: 80, height: 80, top: 10, right: 80, backgroundColor: '#BFDBFE', opacity: 0.55 },
    orb3: { position: 'absolute', borderRadius: 999, width: 90, height: 90, bottom: -10, left: -20, backgroundColor: '#1E40AF', opacity: 0.6 },
    orb4: { position: 'absolute', borderRadius: 999, width: 45, height: 45, bottom: 30, left: 60, backgroundColor: '#DBEAFE', opacity: 0.4 },
    heroIconWrap: {
        width: 60, height: 60, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 10,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    },
    heroLabel: { fontSize: 11, ...FONT.bold, color: 'rgba(255,255,255,0.6)', letterSpacing: 3.5, marginBottom: 2 },
    heroTitle: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1 },
    heroSubtitle: { fontSize: 13, ...FONT.medium, color: 'rgba(255,255,255,0.80)', marginTop: 4 },

    // ─── Form Card — No scrolling ───────────
    formCard: {
        marginTop: -24,
        marginHorizontal: 16,
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.7)',
        borderRadius: 32,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 16,
        shadowColor: '#1E3A8A',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.10,
        shadowRadius: 24,
        elevation: 8,
        zIndex: 5,
    },

    socialRowPremium: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    socialBtnPremium: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderWidth: 1.5, borderColor: '#D0D9F5',
        borderRadius: 16, height: 48, gap: 8,
        shadowColor: '#1E3A8A', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    },
    socialBtnTextPremium: { fontSize: 13, ...FONT.bold, color: C.dark },
    googleG: { fontSize: 16, ...FONT.heavy, color: '#4285F4' },

    dividerRowPremium: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingHorizontal: 10 },
    dividerLine: { flex: 1, height: 1, backgroundColor: '#D0D9F5' },
    dividerText: { marginHorizontal: 12, fontSize: 10, color: '#8899BB', ...FONT.heavy, letterSpacing: 1.5 },

    // ─── Fields ──────────────────────
    fieldGroup: { marginBottom: 12 },
    label: { fontSize: 12, ...FONT.bold, color: C.muted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.5 },
    inlineIconBox: {
        width: 28, height: 28, borderRadius: 10,
        backgroundColor: '#EFF3FF', alignItems: 'center', justifyContent: 'center', marginRight: 10,
    },
    inputWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderWidth: 1.5, borderColor: '#D0D9F5',
        borderRadius: 16, height: 48,
        paddingHorizontal: 12,
    },
    inputFocused: {
        borderColor: '#3B5BDB',
        shadowColor: '#3B5BDB', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    textInput: { flex: 1, fontSize: 14, color: C.dark, ...FONT.semibold },

    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: C.dangerBg, borderRadius: 16, padding: 12, marginBottom: 12,
        borderWidth: 1, borderColor: '#FCA5A5',
    },
    errorMsg: { color: '#991B1B', fontSize: 12, ...FONT.semibold, flex: 1 },

    forgotRow: { alignSelf: 'flex-end', marginTop: -4, marginBottom: 16 },
    forgotText: { fontSize: 12, ...FONT.bold, color: C.primary },

    primaryBtn: {
        borderRadius: 16, height: 50,
        overflow: 'hidden',
        shadowColor: '#3B5BDB', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8,
    },
    primaryBtnGradient: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 16, ...FONT.bold },
    loadingRow: { flexDirection: 'row', alignItems: 'center' },

    bottomLink: { flexDirection: 'row', justifyContent: 'center', marginTop: 24, paddingBottom: 10 },
    bottomLinkText: { fontSize: 14, color: C.muted, ...FONT.medium },
    bottomLinkAction: { fontSize: 14, ...FONT.heavy, color: '#3B5BDB' },
});
