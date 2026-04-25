import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, StatusBar, Alert, ActivityIndicator, Platform, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../lib/api';
import { Shadows } from '../theme/colors';

export default function PhoneVerificationScreen() {
    const { markPhoneVerified, signOut } = useAuth();

    const [step, setStep] = useState(1); // 1=enter phone, 2=enter OTP
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [cooldown, setCooldown] = useState(0);

    const otpRefs = useRef([]);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true })
        ]).start();
    }, []);

    // Cooldown timer for resend
    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setInterval(() => setCooldown(c => c - 1), 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    const formatPhone = () => {
        let cleaned = phone.replace(/[^0-9]/g, '');
        if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
        if (cleaned.length === 10) return `+91${cleaned}`;
        if (cleaned.startsWith('91') && cleaned.length === 12) return `+${cleaned}`;
        if (phone.startsWith('+')) return phone.replace(/[^+0-9]/g, '');
        return `+91${cleaned}`;
    };

    const handleSendOtp = async () => {
        if (!phone || phone.replace(/[^0-9]/g, '').length < 10) {
            setError('Please enter a valid 10-digit mobile number.');
            return;
        }
        setError('');
        setLoading(true);

        try {
            const fullPhone = formatPhone();
            await apiService.auth.sendPhoneOtp({ phone: fullPhone });
            setStep(2);
            setCooldown(300);
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Failed to send OTP.');
        } finally {
            setLoading(false);
        }
    };

    const handleOtpChange = (text, index) => {
        if (text.length > 1) {
            // Pasted OTP — fill all boxes
            const digits = text.replace(/[^0-9]/g, '').slice(0, 6).split('');
            const newOtp = [...otp];
            digits.forEach((d, i) => { if (i < 6) newOtp[i] = d; });
            setOtp(newOtp);
            if (digits.length >= 6) otpRefs.current[5]?.focus();
            return;
        }

        const newOtp = [...otp];
        newOtp[index] = text;
        setOtp(newOtp);

        // Auto-advance
        if (text && index < 5) {
            otpRefs.current[index + 1]?.focus();
        }
    };

    const handleOtpKeyPress = (e, index) => {
        if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }
    };

    const handleVerify = async () => {
        const code = otp.join('');
        if (code.length !== 6) {
            setError('Please enter the complete 6-digit code.');
            return;
        }
        setError('');
        setLoading(true);

        try {
            const fullPhone = formatPhone();
            await apiService.auth.verifyPhoneOtp({ phone: fullPhone, code });
            // Directly update state — no server call needed, instant navigation
            markPhoneVerified();
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Verification failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (cooldown > 0) return;
        setOtp(['', '', '', '', '', '']);
        setError('');
        setLoading(true);

        try {
            const fullPhone = formatPhone();
            await apiService.auth.sendPhoneOtp({ phone: fullPhone });
            setCooldown(300);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to resend code.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={s.container}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            <SafeAreaView edges={['top']} style={{ flex: 1 }}>

                {/* Header */}
                <View style={s.headerRow}>
                    <View style={s.headerSpacer} />
                    <Text style={s.headerBrandTitle}>PHONE VERIFICATION</Text>
                    <TouchableOpacity onPress={signOut} style={s.logoutBtn} activeOpacity={0.7}>
                        <Feather name="log-out" size={18} color="#EF4444" />
                    </TouchableOpacity>
                </View>

                <KeyboardAwareScrollView style={{ flex: 1 }} enableOnAndroid={true} extraScrollHeight={20} keyboardShouldPersistTaps="handled">
                    <Animated.ScrollView 
                        style={s.body} 
                        contentContainerStyle={{ paddingBottom: 80, paddingHorizontal: 20 }} 
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

                            {/* Hero */}
                            <View style={s.heroGraphic}>
                                <View style={s.heroIconRing}>
                                    <View style={s.heroIconCore}>
                                        <Feather name="smartphone" size={40} color="#4F46E5" />
                                    </View>
                                    <View style={s.heroStepBadge}>
                                        <Text style={s.heroStepText}>{step}</Text>
                                    </View>
                                </View>
                                <Text style={s.heroTitle}>
                                    {step === 1 ? 'Verify Your Number' : 'Enter OTP'}
                                </Text>
                                <Text style={s.heroSubtitle}>
                                    {step === 1
                                        ? 'A verification code will be sent to your mobile number via SMS.'
                                        : `We've sent a 6-digit code to ${formatPhone()}`}
                                </Text>
                            </View>

                            {/* Step indicator */}
                            <View style={s.stepBar}>
                                <View style={[s.stepDot, s.stepDotActive]} />
                                <View style={[s.stepLine, step >= 2 && s.stepLineActive]} />
                                <View style={[s.stepDot, step >= 2 && s.stepDotActive]} />
                            </View>

                            {/* Form */}
                            <View style={s.formCard}>
                                {step === 1 ? (
                                    <>
                                        <Text style={s.inputLabel}>MOBILE NUMBER</Text>
                                        <View style={[s.phoneInputBox, error && s.inputBoxError]}>
                                            <View style={s.countryCode}>
                                                <Text style={s.countryFlag}>🇮🇳</Text>
                                                <Text style={s.countryText}>+91</Text>
                                            </View>
                                            <View style={s.divider} />
                                            <TextInput
                                                style={s.phoneInput}
                                                value={phone}
                                                onChangeText={(t) => { setPhone(t); setError(''); }}
                                                placeholder="98765 43210"
                                                placeholderTextColor="#CBD5E1"
                                                keyboardType="phone-pad"
                                                maxLength={12}
                                                autoFocus
                                            />
                                        </View>
                                    </>
                                ) : (
                                    <>
                                        <Text style={s.inputLabel}>VERIFICATION CODE</Text>
                                        <View style={s.otpRow}>
                                            {otp.map((digit, idx) => (
                                                <TextInput
                                                    key={idx}
                                                    ref={(r) => (otpRefs.current[idx] = r)}
                                                    style={[
                                                        s.otpBox,
                                                        digit && s.otpBoxFilled,
                                                        error && s.otpBoxError,
                                                    ]}
                                                    value={digit}
                                                    onChangeText={(t) => handleOtpChange(t, idx)}
                                                    onKeyPress={(e) => handleOtpKeyPress(e, idx)}
                                                    keyboardType="number-pad"
                                                    maxLength={idx === 0 ? 6 : 1}
                                                    textContentType="oneTimeCode"
                                                    autoFocus={idx === 0}
                                                    selectTextOnFocus
                                                />
                                            ))}
                                        </View>

                                        {/* Resend */}
                                        <View style={s.resendRow}>
                                            {cooldown > 0 ? (
                                                <Text style={s.cooldownText}>
                                                    Resend in <Text style={s.cooldownBold}>{Math.floor(cooldown / 60)}:{String(cooldown % 60).padStart(2, '0')}</Text>
                                                </Text>
                                            ) : (
                                                <TouchableOpacity onPress={handleResend} disabled={loading}>
                                                    <Text style={s.resendLink}>Resend Code</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </>
                                )}

                                {error ? <Text style={s.errorText}>{error}</Text> : null}
                            </View>

                            {/* Action Button */}
                            <TouchableOpacity
                                onPress={step === 1 ? handleSendOtp : handleVerify}
                                disabled={loading}
                                activeOpacity={0.8}
                                style={s.submitBtnContainer}
                            >
                                <LinearGradient
                                    colors={['#0F172A', '#1E293B']}
                                    style={[s.submitBtn, loading && s.submitBtnDisabled]}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#FFFFFF" size="small" />
                                    ) : (
                                        <>
                                            <Feather name={step === 1 ? 'send' : 'check-circle'} size={16} color="#FFFFFF" />
                                            <Text style={s.submitText}>
                                                {step === 1 ? 'Send Verification Code' : 'Verify & Continue'}
                                            </Text>
                                        </>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>

                            {step === 2 && (
                                <TouchableOpacity onPress={() => { setStep(1); setOtp(['','','','','','']); setError(''); }} style={s.changeNumBtn}>
                                    <Feather name="edit-2" size={14} color="#4F46E5" />
                                    <Text style={s.changeNumText}>Change Phone Number</Text>
                                </TouchableOpacity>
                            )}

                            <Text style={s.hintText}>
                                Phone verification is mandatory for your role. This ensures secure communication within the CareConnect platform.
                            </Text>

                        </Animated.View>
                    </Animated.ScrollView>
                </KeyboardAwareScrollView>
            </SafeAreaView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F7F9' },

    // Header
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
    headerSpacer: { width: 44 },
    headerBrandTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A', letterSpacing: 1, textTransform: 'uppercase' },
    logoutBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },

    body: { flex: 1 },

    // Hero
    heroGraphic: { alignItems: 'center', marginTop: 24, marginBottom: 28 },
    heroIconRing: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#E0E7FF' },
    heroIconCore: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', ...Shadows.md },
    heroStepBadge: { position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
    heroStepText: { fontSize: 12, fontWeight: '900', color: '#FFFFFF' },
    heroTitle: { fontSize: 28, fontWeight: '900', color: '#0F172A', marginBottom: 12, textAlign: 'center', letterSpacing: -1 },
    heroSubtitle: { fontSize: 14, fontWeight: '500', color: '#64748B', textAlign: 'center', lineHeight: 22, paddingHorizontal: 30 },

    // Step bar
    stepBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 28, gap: 0 },
    stepDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#CBD5E1', borderWidth: 2, borderColor: '#E2E8F0' },
    stepDotActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
    stepLine: { width: 60, height: 3, backgroundColor: '#E2E8F0', borderRadius: 2 },
    stepLineActive: { backgroundColor: '#4F46E5' },

    // Form
    formCard: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 24, borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.lg, shadowColor: '#64748B', shadowOpacity: 0.1 },
    inputLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', marginBottom: 12, letterSpacing: 0.5 },

    // Phone input
    phoneInputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 16, height: 64, overflow: 'hidden' },
    inputBoxError: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
    countryCode: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 6, height: '100%', backgroundColor: '#F1F5F9' },
    countryFlag: { fontSize: 20 },
    countryText: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
    divider: { width: 1.5, height: 30, backgroundColor: '#E2E8F0' },
    phoneInput: { flex: 1, paddingHorizontal: 16, fontSize: 18, fontWeight: '700', color: '#0F172A', letterSpacing: 1.5 },

    // OTP
    otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingHorizontal: 4 },
    otpBox: { width: 46, height: 54, backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14, textAlign: 'center', fontSize: 22, fontWeight: '800', color: '#0F172A', padding: 0 },
    otpBoxFilled: { borderColor: '#4F46E5', backgroundColor: '#EEF2FF' },
    otpBoxError: { borderColor: '#FECACA' },

    // Resend
    resendRow: { alignItems: 'center', marginTop: 20 },
    cooldownText: { fontSize: 14, fontWeight: '600', color: '#94A3B8' },
    cooldownBold: { fontWeight: '800', color: '#4F46E5' },
    resendLink: { fontSize: 14, fontWeight: '800', color: '#4F46E5', textDecorationLine: 'underline' },

    errorText: { fontSize: 13, fontWeight: '700', color: '#EF4444', marginTop: 16, textAlign: 'center' },

    // Submit
    submitBtnContainer: { marginTop: 24, ...Shadows.lg, shadowColor: '#0F172A', shadowOpacity: 0.2 },
    submitBtn: { height: 64, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
    submitBtnDisabled: { opacity: 0.8 },
    submitText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.8 },

    // Change number
    changeNumBtn: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 20, paddingVertical: 12 },
    changeNumText: { fontSize: 14, fontWeight: '700', color: '#4F46E5' },

    hintText: { fontSize: 12, fontWeight: '600', color: '#94A3B8', textAlign: 'center', marginTop: 24, paddingHorizontal: 30, lineHeight: 20 },
});
