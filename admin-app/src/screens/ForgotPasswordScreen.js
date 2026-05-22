import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, StyleSheet,
    ActivityIndicator, StatusBar, Dimensions, Animated, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme/theme';
import { Colors, Spacing, Typography, Radius, Shadows } from '../theme/colors';
import PremiumInput from '../components/common/PremiumInput';
import { apiService } from '../lib/api';
import { isValidEmail } from '../utils/validators';

const { width: SW, height: SH } = Dimensions.get('window');

const STEPS = [
    { key: 'email', icon: 'mail', label: 'Email' },
    { key: 'otp', icon: 'shield', label: 'Verify' },
    { key: 'password', icon: 'lock', label: 'Password' },
];

export default function ForgotPasswordScreen({ navigation }) {
    const [step, setStep] = useState('email');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showNewPw, setShowNewPw] = useState(false);
    const [showConfirmPw, setShowConfirmPw] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [fieldError, setFieldError] = useState('');
    const cooldownRef = useRef(null);

    // ─── Animations ───
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;
    const iconScaleAnim = useRef(new Animated.Value(0.8)).current;

    useEffect(() => {
        // Initial Mount Animation
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
            Animated.timing(iconScaleAnim, { toValue: 1, duration: 600, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
        ]).start();
    }, []);

    // Step Transition Animation
    useEffect(() => {
        fadeAnim.setValue(0);
        slideAnim.setValue(20);
        iconScaleAnim.setValue(0.9);
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(iconScaleAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
        ]).start();
    }, [step]);

    // Cooldown timer
    useEffect(() => {
        if (cooldown > 0) cooldownRef.current = setTimeout(() => setCooldown(c => c - 1), 1000);
        return () => clearTimeout(cooldownRef.current);
    }, [cooldown]);

    const currentStepIndex = STEPS.findIndex(s => s.key === step);

    // ─── Handlers ───
    const handleSendOtp = async () => {
        if (!email.trim()) { setFieldError('Email address is required.'); return; }
        if (!isValidEmail(email.trim())) { setFieldError('Please enter a valid email (e.g. name@domain.com).'); return; }
        setFieldError('');
        setLoading(true);
        try {
            const res = await apiService.auth.sendResetOtp({ email: email.trim().toLowerCase() });
            setStep('otp');
            setCooldown(60);
        } catch (err) {
            // If an OTP was already sent recently (429), move to OTP step anyway
            if (err?.response?.status === 429) {
                setStep('otp');
                setCooldown(30);
                setFieldError('An OTP was already sent recently. Please enter it below or wait to resend.');
                return;
            }
            const serverMsg = err?.response?.data?.error;
            if (serverMsg) {
                setFieldError(serverMsg);
            } else if (err?.message?.includes('Network') || err?.message?.includes('timeout')) {
                setFieldError('Network error. Please check your connection and try again.');
            } else {
                setFieldError(err?.message || 'Failed to send OTP. Try again.');
            }
        } finally { setLoading(false); }
    };

    const handleResendOtp = async () => {
        if (cooldown > 0) return;
        setFieldError('');
        setLoading(true);
        try {
            await apiService.auth.sendResetOtp({ email: email.trim().toLowerCase() });
            setCooldown(60);
            setFieldError('');
        } catch (err) {
            if (err?.response?.status === 429) {
                setCooldown(30);
                setFieldError('OTP was sent recently. Please wait before requesting a new one.');
            } else {
                setFieldError(err?.response?.data?.error || 'Failed to resend OTP.');
            }
        } finally { setLoading(false); }
    };

    const handleVerifyOtp = async () => {
        if (!otp || otp.length !== 6) { setFieldError('Please enter the complete 6-digit code.'); return; }
        if (!/^\d{6}$/.test(otp)) { setFieldError('OTP must contain only numbers.'); return; }
        setFieldError('');
        setLoading(true);
        try {
            await apiService.auth.verifyResetOtp({ email: email.trim().toLowerCase(), otp });
            setStep('password');
        } catch (err) {
            const code = err?.response?.data?.code;
            if (code === 'OTP_EXPIRED' || code === 'OTP_MAX_ATTEMPTS') {
                setFieldError(err?.response?.data?.error || 'OTP expired. Please request a new one.');
                setTimeout(() => { setOtp(''); setStep('email'); }, 2000);
            } else {
                setFieldError(err?.response?.data?.error || 'Invalid OTP. Please try again.');
            }
        } finally { setLoading(false); }
    };

    const handleResetPassword = async () => {
        if (!newPassword) { setFieldError('New password is required.'); return; }
        if (newPassword.length < 8) { setFieldError('Password must be at least 8 characters.'); return; }
        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) { setFieldError('Must include uppercase, lowercase, and a number.'); return; }
        if (!confirmPassword) { setFieldError('Please confirm your password.'); return; }
        if (newPassword !== confirmPassword) { setFieldError('Passwords do not match.'); return; }
        setFieldError('');
        setLoading(true);
        try {
            const res = await apiService.auth.resetPasswordWithOtp({ email: email.trim().toLowerCase(), otp, newPassword });
            setStep('success');
        } catch (err) {
            setFieldError(err?.response?.data?.error || 'Failed to reset password.');
        } finally { setLoading(false); }
    };

    const subtitles = {
        email: 'Enter the email address associated with your account to receive a secure reset link.',
        otp: `We've sent a secure 6-digit confirmation code to ${email}`,
        password: 'Create a strong, secure new password for your CareConnect account.',
        success: 'Your password has been updated successfully.',
    };

    // ─── Success Screen ───
    if (step === 'success') {
        return (
            <View style={s.container}>
                <StatusBar barStyle="dark-content" />
                <View style={s.ambientBgWrapper} />
                <SafeAreaView style={s.safe}>
                    <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={[s.scrollContent, { justifyContent: 'center', alignItems: 'center' }]}>
                        <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: iconScaleAnim }], alignItems: 'center' }}>
                            {/* Success Icon */}
                            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginBottom: 32, borderWidth: 2, borderColor: '#D1FAE5' }}>
                                <Feather name="check-circle" size={48} color="#059669" />
                            </View>

                            <Text style={[s.heroTitle, { textAlign: 'center', fontSize: 28 }]}>Password Reset{"\n"}Successful!</Text>
                            <Text style={[s.heroSubtitle, { textAlign: 'center', paddingRight: 0, marginBottom: 12 }]}>Your password has been securely updated.{"\n"}You can now sign in with your new credentials.</Text>

                            {/* Email reminder */}
                            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8, marginBottom: 32, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center' }}>
                                <Feather name="mail" size={16} color="#64748B" style={{ marginRight: 10 }} />
                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#334155' }}>{email}</Text>
                            </View>

                            {/* Sign In Button */}
                            <TouchableOpacity
                                onPress={() => navigation.navigate('Login')}
                                activeOpacity={0.8}
                                style={[s.btnShadow, { width: '100%' }]}
                            >
                                <View style={[s.btnPrimary, { flexDirection: 'row', gap: 10 }]}>
                                    <Feather name="log-in" size={20} color="#FFF" />
                                    <Text style={s.btnPrimaryText}>Sign In Now</Text>
                                </View>
                            </TouchableOpacity>

                            {/* Footer hint */}
                            <Text style={{ fontSize: 13, fontWeight: '500', color: '#94A3B8', textAlign: 'center', marginTop: 24, lineHeight: 20 }}>
                                Use your new password to log in.{"\n"}If you face any issues, contact support.
                            </Text>
                        </Animated.View>
                    </KeyboardAwareScrollView>
                </SafeAreaView>
            </View>
        );
    }

    return (
        <View style={s.container}>
            <StatusBar barStyle="dark-content" />
            
            {/* Solid Bright Ambient Top overlay */}
            <View style={s.ambientBgWrapper} />

            <SafeAreaView style={s.safe}>
                
                {/* ─── Top Nav ─── */}
                <View style={s.navHeader}>
                    <TouchableOpacity
                        onPress={() => {
                            if (step === 'otp') { setStep('email'); setOtp(''); }
                            else if (step === 'password') { setStep('otp'); }
                            else navigation.goBack();
                        }}
                        style={s.backBtn}
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    >
                        <Feather name="arrow-left" size={24} color="#0F172A" />
                    </TouchableOpacity>
                </View>

                {/* ─── Main Content ─── */}
                <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} enableOnAndroid={true} extraScrollHeight={20} keyboardShouldPersistTaps="handled">
                    <View style={{flex: 1}}>
                        
                        {/* Header Titles */}
                        <View style={s.heroSection}>
                            <Animated.View style={[s.heroIconWrap, { opacity: fadeAnim, transform: [{ scale: iconScaleAnim }] }]}>
                                <Feather name={STEPS[currentStepIndex].icon} size={32} color="#0F172A" />
                            </Animated.View>
                            
                            <Text style={[s.heroTitle, Theme.typography.common]}>Reset Password</Text>
                            <Text style={[s.heroSubtitle, Theme.typography.common]}>{subtitles[step]}</Text>
                        </View>

                        {/* Step Line Indicators */}
                        <View style={s.progressContainer}>
                            <View style={s.progressRow}>
                                {STEPS.map((s2, i) => {
                                    const isActive = i === currentStepIndex;
                                    const isDone = i < currentStepIndex;
                                    return (
                                        <View key={s2.key} style={s.progressSegmentWrapper}>
                                            <View style={[s.progressSegment, isActive && s.progressActive, isDone && s.progressDone]} />
                                        </View>
                                    );
                                })}
                            </View>
                            <Text style={s.progressText}>
                                STEP {currentStepIndex + 1} OF 3
                            </Text>
                        </View>

                        {/* White Form Card */}
                        <Animated.View style={[s.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                            
                            {/* Error Message Display */}
                            {fieldError ? (
                                <View style={{ backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start' }}>
                                    <Feather name="alert-circle" size={16} color="#DC2626" style={{ marginRight: 8, marginTop: 2 }} />
                                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#DC2626', lineHeight: 18 }}>{fieldError}</Text>
                                </View>
                            ) : null}


                            {step === 'email' && (
                                <>
                                    <View style={s.inputWrapper}>
                                        <Text style={s.label}>Email Address</Text>
                                        <PremiumInput
                                            icon={<Feather name="mail" size={18} color="#94A3B8" />}
                                            placeholder="director@careconnect.io"
                                            value={email}
                                            onChangeText={setEmail}
                                            autoCapitalize="none"
                                            keyboardType="email-address"
                                            editable={!loading}
                                        />
                                    </View>
                                    
                                    <TouchableOpacity onPress={handleSendOtp} disabled={loading} activeOpacity={0.8} style={s.btnShadow}>
                                        <View style={s.btnPrimary}>
                                            {loading ? <ActivityIndicator color="#fff" /> : (
                                                <Text style={s.btnPrimaryText}>Send Reset Link</Text>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                </>
                            )}

                            {/* Step 2: OTP */}
                            {step === 'otp' && (
                                <>
                                    <View style={s.inputWrapper}>
                                        <Text style={s.label}>6-Digit Security Code</Text>
                                        <PremiumInput
                                            icon={<Feather name="shield" size={18} color="#94A3B8" />}
                                            placeholder="Enter verification code"
                                            value={otp}
                                            onChangeText={setOtp}
                                            keyboardType="number-pad"
                                            maxLength={6}
                                            editable={!loading}
                                        />
                                    </View>
                                    
                                    <TouchableOpacity onPress={handleVerifyOtp} disabled={loading} activeOpacity={0.8} style={s.btnShadow}>
                                        <View style={s.btnPrimary}>
                                            {loading ? <ActivityIndicator color="#fff" /> : (
                                                <Text style={s.btnPrimaryText}>Verify Code</Text>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                    
                                    <View style={s.otpExtraRow}>
                                        <TouchableOpacity onPress={handleResendOtp} disabled={cooldown > 0} style={s.resendWrap}>
                                            <Feather name="refresh-cw" size={14} color={cooldown > 0 ? '#94A3B8' : '#6366F1'} />
                                            <Text style={[s.resendText, cooldown > 0 && { color: '#94A3B8' }]}>
                                                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            )}

                            {/* Step 3: Password */}
                            {step === 'password' && (
                                <>
                                    <View style={s.inputWrapper}>
                                        <Text style={s.label}>New Password</Text>
                                        <PremiumInput
                                            icon={<Feather name="lock" size={18} color="#94A3B8" />}
                                            placeholder="Create new password"
                                            value={newPassword}
                                            onChangeText={setNewPassword}
                                            secureTextEntry={!showNewPw}
                                            editable={!loading}
                                            rightElement={
                                                <TouchableOpacity onPress={() => setShowNewPw(!showNewPw)} style={{ padding: 4 }}>
                                                    <Feather name={showNewPw ? "eye-off" : "eye"} size={18} color="#94A3B8" />
                                                </TouchableOpacity>
                                            }
                                        />
                                    </View>

                                    <View style={s.inputWrapper}>
                                        <Text style={s.label}>Confirm Password</Text>
                                        <PremiumInput
                                            icon={<Feather name="check-circle" size={18} color="#94A3B8" />}
                                            placeholder="Confirm new password"
                                            value={confirmPassword}
                                            onChangeText={setConfirmPassword}
                                            secureTextEntry={!showConfirmPw}
                                            editable={!loading}
                                            rightElement={
                                                <TouchableOpacity onPress={() => setShowConfirmPw(!showConfirmPw)} style={{ padding: 4 }}>
                                                    <Feather name={showConfirmPw ? "eye-off" : "eye"} size={18} color="#94A3B8" />
                                                </TouchableOpacity>
                                            }
                                        />
                                    </View>

                                    <TouchableOpacity onPress={handleResetPassword} disabled={loading} activeOpacity={0.8} style={[s.btnShadow, { marginTop: 8 }]}>
                                        <View style={[s.btnPrimary, { backgroundColor: '#0F172A' }]}>
                                            {loading ? <ActivityIndicator color="#fff" /> : (
                                                <View style={s.btnInnerRow}>
                                                    <Feather name="check" size={20} color="#FFF" />
                                                    <Text style={s.btnPrimaryText}>Update Password</Text>
                                                </View>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                </>
                            )}
                        </Animated.View>
                        
                        <View style={s.footerContainer}>
                            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={s.loginLink}>
                                <Text style={s.loginLinkDesc}>Remembered your password? </Text>
                                <Text style={s.loginLinkBold}>Log In</Text>
                            </TouchableOpacity>
                            <Text style={s.securityFooter}>
                                <Feather name="shield" size={12} color="#94A3B8" /> 
                                {' '}Secured by CareConnect Enterprise SSL
                            </Text>
                        </View>

                    </View>
                </KeyboardAwareScrollView>
            </SafeAreaView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    
    ambientBgWrapper: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: SH * 0.45,
        backgroundColor: '#F8FAFC'
    },

    safe: { flex: 1 },
    navHeader: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 10 },
    backBtn: { alignSelf: 'flex-start', width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', ...Shadows.sm },

    scrollContent: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 60, flexGrow: 1 },
    
    // Hero Text
    heroSection: { marginBottom: 32 },
    heroIconWrap: { 
        width: 72, height: 72, borderRadius: 24, 
        justifyContent: 'center', alignItems: 'center',
        marginBottom: 24,
        backgroundColor: '#F1F5F9',
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    heroTitle: { fontSize: 32, fontWeight: '800', color: '#0F172A', letterSpacing: -1, marginBottom: 12 },
    heroSubtitle: { fontSize: 16, fontWeight: '500', color: '#64748B', lineHeight: 24, paddingRight: 20 },

    // Line Progress
    progressContainer: { marginBottom: 40 },
    progressRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    progressSegmentWrapper: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#F1F5F9', overflow: 'hidden' },
    progressSegment: { flex: 1, borderRadius: 3, backgroundColor: 'transparent' },
    progressActive: { backgroundColor: '#0F172A' },
    progressDone: { backgroundColor: '#94A3B8' },
    progressText: { fontSize: 12, fontWeight: '800', color: '#0F172A', letterSpacing: 1.5, textTransform: 'uppercase' },

    // Floating Form Card
    card: { 
        backgroundColor: '#FFFFFF', 
        borderRadius: 32, 
        padding: 24, 
        borderWidth: 1,
        borderColor: '#F1F5F9',
        ...Shadows.xl,
        shadowColor: '#1E293B',
        shadowOpacity: 0.1,
    },

    inputWrapper: { marginBottom: 20 },
    label: { fontSize: 12, fontWeight: '800', color: '#64748B', marginBottom: 10, alignSelf: 'flex-start', textTransform: 'uppercase', letterSpacing: 1, marginLeft: 4 },
    inputContainer: { 
        flexDirection: 'row', alignItems: 'center', 
        backgroundColor: '#F8FAFC',
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: '#F1F5F9',
        paddingHorizontal: 16,
        height: 64,
    },
    inputIconLeft: { marginRight: 12 },
    inputBoxCustom: { flex: 1, fontSize: 16, fontWeight: '700', color: '#0F172A', backgroundColor: 'transparent', paddingVertical: 18 },
    eyeBtn: { padding: 10, marginRight: -10 },

    btnShadow: { 
        marginTop: 16, 
        ...Shadows.xl, shadowColor: '#0F172A', shadowOpacity: 0.25, shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 }
    },
    btnPrimary: { height: 64, backgroundColor: '#0F172A', borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    btnInnerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    btnPrimaryText: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },

    otpExtraRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
    resendWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#F1F5F9' },
    resendText: { fontSize: 14, fontWeight: '700', color: '#6366F1' },

    footerContainer: { marginTop: 40, alignItems: 'center' },
    loginLink: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
    loginLinkDesc: { fontSize: 15, fontWeight: '500', color: '#64748B' },
    loginLinkBold: { fontSize: 15, fontWeight: '800', color: '#6366F1' },
    
    securityFooter: { flexDirection: 'row', alignItems: 'center', fontSize: 12, fontWeight: '600', color: '#94A3B8', letterSpacing: 0.5 }
});
