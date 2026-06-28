import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { ChevronLeft, Key, User, Mail, Lock, ShieldCheck, CheckCircle2 } from 'lucide-react-native';
import SmartInput from '../../components/ui/SmartInput';
import { apiService } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import LegalModal from '../../components/ui/LegalModal';
import { TERMS_VERSION, PRIVACY_VERSION } from '../../constants/legalContent';

import { OTPBoxes } from './components';
import { parseError } from '../../utils/parseError';
import { colors, radius, spacing, shadows } from '../../theme';
import { HapticPatterns } from '../../utils/haptics';

const C = {
    bg: colors.background,
    surface: colors.surface,
    primary: colors.primary,
    primaryDark: colors.primaryMid,
    primarySoft: colors.primarySoft,
    dark: colors.textPrimary,
    mid: colors.textSecondary,
    muted: colors.textMuted,
    danger: colors.danger,
    border: colors.borderLight,
    success: colors.success,
    successSoft: colors.successLight,
};

const FONT = {
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export default function CompanionSignupScreen({ navigation }) {
    const { injectSession } = useAuth();
    
    const [step, setStep] = useState(1);
    
    // Step 1 State
    const [email, setEmail] = useState('');
    const [isExisting, setIsExisting] = useState(false);
    
    // Step 2A (New User)
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [termsAccepted, setTermsAccepted] = useState(false);

    // Step 2B (Existing User)
    const [otp, setOtp] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [legalVisible, setLegalVisible] = useState(false);
    const [legalType, setLegalType] = useState('terms');

    const handleNextStep1 = async () => {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !/\S+@\S+\.\S+/.test(cleanEmail)) {
            setError('Please enter a valid email address.');
            return;
        }
        
        setLoading(true);
        setError('');

        try {
            const res = await apiService.companion.checkEmail({ email: cleanEmail });
            if (res.data.exists) {
                // User exists, backend checkEmail endpoint has already sent the OTP.
                setIsExisting(true);
            } else {
                setIsExisting(false);
            }
            setStep(2);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to verify email.');
        } finally {
            setLoading(false);
        }
    };

    const handleJoinNew = async () => {
        if (!fullName || !password) {
            setError('Please provide your name and a strong password.');
            return;
        }
        if (!termsAccepted) {
            setError('You must accept the Terms & Conditions and Privacy Policy.');
            return;
        }
        
        setLoading(true);
        setError('');

        try {
            const res = await apiService.companion.join({
                email: email.trim().toLowerCase(),
                password,
                fullName,
                phone,
                acceptedTermsVersion: TERMS_VERSION,
                acceptedTermsAt: new Date().toISOString(),
                acceptedPrivacyVersion: PRIVACY_VERSION,
                acceptedPrivacyAt: new Date().toISOString(),
                acceptedAt: new Date().toISOString()
            });
            
            if (res.data.session && res.data.profile) {
                await HapticPatterns.caregiverConnected().catch(() => {});
                await injectSession(res.data.session, res.data.profile);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create companion account.');
        } finally {
            setLoading(false);
        }
    };

    const handleJoinExisting = async () => {
        if (!otp || otp.length < 6) {
            setError('Please enter the 6-digit verification code.');
            return;
        }
        
        setLoading(true);
        setError('');

        try {
            const res = await apiService.companion.joinOtp({
                email: email.trim().toLowerCase(),
                otp
            });
            
            if (res.data.session && res.data.profile) {
                await HapticPatterns.caregiverConnected().catch(() => {});
                await injectSession(res.data.session, res.data.profile);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to verify code and link account.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.header}>
                <Pressable
                    onPress={() => { step > 1 ? setStep(step - 1) : navigation.goBack() }}
                    style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
                    hitSlop={15}
                >
                    <ChevronLeft color={C.dark} size={24} />
                </Pressable>
                <View style={styles.progressContainer}>
                    <View style={[styles.progressDot, step >= 1 && styles.progressDotActive]} />
                    <View style={[styles.progressDot, step >= 2 && styles.progressDotActive]} />
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <View style={styles.iconWrapper}>
                    <ShieldCheck size={32} color={C.primary} />
                </View>
                
                <Text style={styles.title}>Supporting a Family Member</Text>
                
                {error ? (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : null}

                {step === 1 && (
                    <View style={styles.stepContainer}>
                        <Text style={styles.subtitle}>Enter your email address to log in or create an account.</Text>

                        <SmartInput
                            label="EMAIL ADDRESS"
                            placeholder="name@example.com"
                            value={email}
                            onChangeText={(v) => { setEmail(v); setError(''); }}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            leftAccessory={<Mail size={18} color={C.muted} style={{ marginRight: 8 }} />}
                            style={{ marginBottom: 24 }}
                        />

                        <Pressable
                            style={({ pressed }) => [styles.btn, loading && { opacity: 0.7 }, pressed && styles.pressed]}
                            onPress={handleNextStep1}
                            disabled={loading}
                        >
                            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Continue</Text>}
                        </Pressable>
                    </View>
                )}

                {step === 2 && !isExisting && (
                    <View style={styles.stepContainer}>
                        <View style={styles.badgeBox}>
                            <Text style={styles.badgeText}>New CareMyMed Account</Text>
                        </View>
                        <Text style={styles.subtitle}>Let's create your companion profile to securely monitor their care.</Text>

                        <SmartInput
                            label="FULL NAME"
                            placeholder="John Doe"
                            value={fullName}
                            onChangeText={setFullName}
                            leftAccessory={<User size={18} color={C.muted} style={{ marginRight: 8 }} />}
                            style={{ marginBottom: 16 }}
                        />
                        <SmartInput
                            label="PHONE (OPTIONAL)"
                            placeholder="Mobile number"
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                            style={{ marginBottom: 16 }}
                        />
                        <SmartInput
                            label="CREATE PASSWORD"
                            placeholder="Choose a password"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            leftAccessory={<Lock size={18} color={C.muted} style={{ marginRight: 8 }} />}
                            style={{ marginBottom: 20 }}
                        />

                        {/* Terms & Conditions Checkbox */}
                        <Pressable
                            style={({ pressed }) => [
                                {
                                    flexDirection: 'row',
                                    alignItems: 'flex-start',
                                    gap: 10,
                                    paddingVertical: 8,
                                    marginBottom: 16,
                                },
                                pressed && styles.pressed
                            ]}
                            onPress={() => {
                                setTermsAccepted(!termsAccepted);
                                setError('');
                            }}
                        >
                            <View style={{ marginTop: 2 }}>
                                {termsAccepted ? (
                                    <View style={{
                                        width: 18,
                                        height: 18,
                                        borderRadius: 5,
                                        backgroundColor: C.primary,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                        <CheckCircle2 size={13} color="#FFF" />
                                    </View>
                                ) : (
                                    <View style={{
                                        width: 18,
                                        height: 18,
                                        borderRadius: 5,
                                        borderWidth: 1.5,
                                        borderColor: error && !termsAccepted ? C.danger : C.muted,
                                        backgroundColor: '#FFFFFF',
                                    }} />
                                )}
                            </View>
                            <Text style={{
                                fontSize: 13,
                                ...FONT.medium,
                                color: C.mid,
                                flex: 1,
                                lineHeight: 18,
                            }}>
                                I have read and agree to the{' '}
                                <Text
                                    style={{
                                        color: C.primary,
                                        ...FONT.bold,
                                        textDecorationLine: 'underline',
                                    }}
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        setLegalType('terms');
                                        setLegalVisible(true);
                                    }}
                                >
                                    Terms & Conditions
                                </Text>
                                {' '}and{' '}
                                <Text
                                    style={{
                                        color: C.primary,
                                        ...FONT.bold,
                                        textDecorationLine: 'underline',
                                    }}
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        setLegalType('privacy');
                                        setLegalVisible(true);
                                    }}
                                >
                                    Privacy Policy
                                </Text>
                                .
                            </Text>
                        </Pressable>

                        <Pressable
                            style={({ pressed }) => [styles.btn, loading && { opacity: 0.7 }, pressed && styles.pressed]}
                            onPress={handleJoinNew}
                            disabled={loading}
                        >
                            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Create Account</Text>}
                        </Pressable>
                    </View>
                )}

                {step === 2 && isExisting && (
                    <View style={styles.stepContainer}>
                        <View style={styles.successBadgeBox}>
                            <Text style={styles.successBadgeText}>Account Recognized</Text>
                        </View>
                        <Text style={styles.subtitle}>
                            Welcome back! We sent a 6-digit verification code to <Text style={{ ...FONT.bold, color: C.dark }}>{email}</Text>. Enter it below to log in.
                        </Text>

                        <OTPBoxes
                            value={otp}
                            onChange={(v) => { setOtp(v); setError(''); }}
                            length={6}
                            editable={!loading}
                        />

                        <Pressable
                            style={({ pressed }) => [styles.btn, { marginTop: 20 }, loading && { opacity: 0.7 }, pressed && styles.pressed]}
                            onPress={handleJoinExisting}
                            disabled={loading}
                        >
                            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Log In</Text>}
                        </Pressable>
                    </View>
                )}
            </ScrollView>

            <LegalModal
                visible={legalVisible}
                type={legalType}
                onClose={() => setLegalVisible(false)}
                onAccept={() => {
                    setTermsAccepted(true);
                    setError('');
                }}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 50 : 20,
        paddingHorizontal: 20,
        paddingBottom: 10,
    },
    backBtn: { width: 40, height: 40, justifyContent: 'center' },
    progressContainer: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6, paddingRight: 40 },
    progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
    progressDotActive: { backgroundColor: C.primary },
    scrollContent: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 40 },
    iconWrapper: {
        width: 64, height: 64, borderRadius: 20, backgroundColor: C.primarySoft,
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    },
    title: { fontSize: 26, ...FONT.heavy, color: C.dark, marginBottom: 8 },
    subtitle: { fontSize: 15, ...FONT.medium, color: C.mid, marginBottom: 32, lineHeight: 22 },
    stepContainer: { width: '100%' },
    btn: {
        height: 54, backgroundColor: C.primary, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: C.primaryDark, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    btnText: { color: '#FFF', fontSize: 16, ...FONT.bold },
    errorBox: { backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, marginBottom: 20 },
    errorText: { color: C.danger, fontSize: 14, ...FONT.medium },
    badgeBox: { backgroundColor: C.primarySoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 12 },
    badgeText: { color: C.primaryDark, fontSize: 12, ...FONT.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
    successBadgeBox: { backgroundColor: C.successSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 12 },
    successBadgeText: { color: '#065F46', fontSize: 12, ...FONT.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
