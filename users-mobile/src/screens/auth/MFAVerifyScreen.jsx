/**
 * MFAVerifyScreen.jsx — Login MFA Challenge Screen
 *
 * Shown when login returns `requireMfa: true`.
 * User enters the 6-digit TOTP code or a recovery code
 * to complete authentication.
 *
 * Audit items: 2.1-2.4, 2.8
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, TextInput, Pressable, Platform,
    ActivityIndicator, KeyboardAvoidingView, ScrollView, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ShieldCheck, ArrowLeft, AlertCircle, KeyRound } from 'lucide-react-native';
import { apiService } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const FONT = {
    regular: { fontFamily: 'Inter_400Regular' },
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

// Individual OTP boxes — auto-advance on input, backspace to go back
const OTPBoxes = ({ value = '', onChange, onComplete, length = 6, editable = true }) => {
    const refs = useRef([...Array(length)].map(() => React.createRef()));

    const handleChange = (text, idx) => {
        const digit = text.replace(/\D/g, '').slice(-1);
        const newVal = (value.slice(0, idx) + digit + value.slice(idx + 1)).slice(0, length);
        onChange(newVal);
        if (digit) {
            if (idx < length - 1) refs.current[idx + 1]?.current?.focus();
            if (newVal.length === length) onComplete?.(newVal);
        }
    };

    const handleKeyPress = ({ nativeEvent }, idx) => {
        if (nativeEvent.key === 'Backspace' && !value[idx] && idx > 0) {
            refs.current[idx - 1]?.current?.focus();
        }
    };

    return (
        <View style={otpSt.row}>
            {Array.from({ length }).map((_, i) => (
                <TextInput
                    key={i}
                    ref={refs.current[i]}
                    style={[otpSt.box, !!value[i] && otpSt.boxFilled]}
                    value={value[i] || ''}
                    onChangeText={(t) => handleChange(t, i)}
                    onKeyPress={(e) => handleKeyPress(e, i)}
                    keyboardType="number-pad"
                    maxLength={1}
                    textAlign="center"
                    editable={editable}
                    autoFocus={i === 0}
                    selectTextOnFocus
                />
            ))}
        </View>
    );
};

const otpSt = StyleSheet.create({
    row: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginVertical: 20 },
    box: {
        width: 48, height: 60,
        borderRadius: 16,
        backgroundColor: '#F8FAFC',
        borderWidth: 2, borderColor: '#E2E8F0',
        fontSize: 26, ...FONT.heavy,
        color: '#0F172A',
    },
    boxFilled: {
        borderColor: '#6366F1',
        backgroundColor: '#EEF2FF',
        shadowColor: '#6366F1',
        shadowOpacity: 0.15, shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
    },
});

export default function MFAVerifyScreen({ route, navigation }) {
    const { mfaToken, profile: loginProfile } = route.params || {};
    const { completeMfaLogin } = useAuth();

    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [useRecovery, setUseRecovery] = useState(false);
    const recoveryRef = useRef(null);

    const heroAnim = useRef(new Animated.Value(-10)).current;
    const heroOpacity = useRef(new Animated.Value(0)).current;
    const cardAnim = useRef(new Animated.Value(20)).current;
    const cardOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(heroAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
            Animated.timing(heroOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(cardAnim, { toValue: 0, duration: 350, delay: 120, useNativeDriver: true }),
            Animated.timing(cardOpacity, { toValue: 1, duration: 350, delay: 120, useNativeDriver: true }),
        ]).start();
    }, []);

    const handleVerify = useCallback(async (autoCode) => {
        const finalCode = (autoCode || code).trim();
        if (!useRecovery && finalCode.length !== 6) {
            setError('Please enter all 6 digits.');
            return;
        }
        if (useRecovery && finalCode.length !== 8) {
            setError('Recovery codes are 8 characters long.');
            return;
        }

        setLoading(true);
        setError('');
        try {
            const res = await apiService.auth.mfaVerify(mfaToken, finalCode);
            const { session, profile } = res.data;
            await completeMfaLogin(session, profile || loginProfile);
        } catch (err) {
            const msg = err.response?.data?.error || 'Verification failed. Please try again.';
            const errCode = err.response?.data?.code;
            if (errCode === 'MFA_TOKEN_EXPIRED') {
                setError('Session expired. Redirecting to login…');
                setTimeout(() => navigation.replace('Login'), 2000);
            } else {
                setError(msg);
                setCode('');
            }
        } finally {
            setLoading(false);
        }
    }, [code, mfaToken, useRecovery, completeMfaLogin, loginProfile, navigation]);

    const handleCodeChange = (val) => {
        setCode(val);
        if (error) setError('');
    };

    const handleRecoveryChange = (t) => {
        setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''));
        if (error) setError('');
    };

    const switchMode = () => {
        setUseRecovery(prev => !prev);
        setCode('');
        setError('');
        // Focus recovery input after mode switch
        if (!useRecovery) {
            setTimeout(() => recoveryRef.current?.focus(), 200);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Hero Section */}
                <Animated.View style={{ transform: [{ translateY: heroAnim }], opacity: heroOpacity }}>
                    <LinearGradient
                        colors={['#4F46E5', '#6366F1', '#818CF8']}
                        start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }}
                        style={styles.hero}
                    >
                        {/* Back button */}
                        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
                            <ArrowLeft size={20} color="rgba(255,255,255,0.9)" />
                        </Pressable>

                        <View style={styles.orb1} />
                        <View style={styles.orb2} />
                        <View style={styles.orb3} />

                        <View style={styles.heroIconWrap}>
                            <ShieldCheck size={42} color="#6366F1" strokeWidth={1.8} />
                        </View>
                        <Text style={styles.heroLabel}>SECURITY</Text>
                        <Text style={styles.heroTitle}>Two-Factor Auth</Text>
                        <Text style={styles.heroSubtitle}>
                            {useRecovery
                                ? 'Enter one of your backup recovery codes'
                                : 'Enter the code from your authenticator app'}
                        </Text>
                    </LinearGradient>
                </Animated.View>

                {/* Form Card */}
                <Animated.View style={[styles.formCard, { transform: [{ translateY: cardAnim }], opacity: cardOpacity }]}>

                    {error ? (
                        <View style={styles.errorBox}>
                            <AlertCircle size={15} color="#EF4444" />
                            <Text style={styles.errorMsg}>{error}</Text>
                        </View>
                    ) : null}

                    {!useRecovery ? (
                        <>
                            <Text style={styles.inputLabel}>Authenticator Code</Text>
                            <OTPBoxes
                                value={code}
                                onChange={handleCodeChange}
                                onComplete={(val) => handleVerify(val)}
                                length={6}
                                editable={!loading}
                            />
                        </>
                    ) : (
                        <View style={styles.fieldGroup}>
                            <Text style={styles.inputLabel}>Recovery Code</Text>
                            <View style={[styles.inputWrap, { marginTop: 8 }]}>
                                <KeyRound size={18} color="#94A3B8" />
                                <TextInput
                                    ref={recoveryRef}
                                    style={[styles.textInput, { letterSpacing: 4, fontSize: 18, textAlign: 'center' }]}
                                    placeholder="ABCD1234"
                                    placeholderTextColor="#CBD5E1"
                                    value={code}
                                    onChangeText={handleRecoveryChange}
                                    keyboardType="default"
                                    maxLength={8}
                                    autoCapitalize="characters"
                                    autoCorrect={false}
                                    editable={!loading}
                                />
                            </View>
                        </View>
                    )}

                    <Pressable
                        style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
                        onPress={() => handleVerify()}
                        disabled={loading}
                    >
                        <LinearGradient
                            colors={['#6366F1', '#4F46E5']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.primaryBtnGradient}
                        >
                            {loading ? (
                                <View style={styles.loadingRow}>
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                    <Text style={styles.primaryBtnText}>  Verifying…</Text>
                                </View>
                            ) : (
                                <Text style={styles.primaryBtnText}>Verify & Continue</Text>
                            )}
                        </LinearGradient>
                    </Pressable>

                    <Pressable style={styles.toggleBtn} onPress={switchMode}>
                        <Text style={styles.toggleText}>
                            {useRecovery ? 'Use authenticator code instead' : 'Lost your phone? Use a recovery code'}
                        </Text>
                    </Pressable>
                </Animated.View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0F4FF' },

    hero: {
        minHeight: 260,
        borderBottomLeftRadius: 44,
        borderBottomRightRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: Platform.OS === 'ios' ? 60 : 44,
        paddingBottom: 36,
        overflow: 'hidden',
    },
    backBtn: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 56 : 36,
        left: 20,
        zIndex: 10,
        width: 40, height: 40, borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    },
    orb1: { position: 'absolute', borderRadius: 999, width: 200, height: 200, top: -80, right: -60, backgroundColor: '#2563EB', opacity: 0.35 },
    orb2: { position: 'absolute', borderRadius: 999, width: 140, height: 140, bottom: -40, left: -40, backgroundColor: '#1D4ED8', opacity: 0.4 },
    orb3: { position: 'absolute', borderRadius: 999, width: 80, height: 80, top: 60, left: -20, backgroundColor: '#3B82F6', opacity: 0.15 },
    heroIconWrap: {
        width: 72, height: 72, borderRadius: 24,
        backgroundColor: '#FFFFFF',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 14,
        shadowColor: '#4F46E5', shadowOpacity: 0.2, shadowRadius: 16,
        shadowOffset: { width: 0, height: 4 }, elevation: 8,
    },
    heroLabel: { fontSize: 11, ...FONT.heavy, color: 'rgba(255,255,255,0.5)', letterSpacing: 5, marginBottom: 6 },
    heroTitle: { fontSize: 30, ...FONT.heavy, color: '#FFFFFF', letterSpacing: -0.5 },
    heroSubtitle: {
        fontSize: 14, ...FONT.medium, color: 'rgba(255,255,255,0.65)',
        marginTop: 6, textAlign: 'center', paddingHorizontal: 36, lineHeight: 20,
    },

    formCard: {
        marginTop: -28, marginHorizontal: 16,
        backgroundColor: 'rgba(255,255,255,0.97)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)',
        borderRadius: 36,
        paddingHorizontal: 24, paddingTop: 28, paddingBottom: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.12, shadowRadius: 32, elevation: 12,
        zIndex: 5,
    },

    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#FEF2F2', borderRadius: 16, padding: 12, marginBottom: 8,
        borderWidth: 1, borderColor: '#FCA5A5',
    },
    errorMsg: { color: '#991B1B', fontSize: 13, ...FONT.semibold, flex: 1 },

    inputLabel: { fontSize: 13, ...FONT.bold, color: '#64748B', textAlign: 'center', letterSpacing: 0.4 },

    fieldGroup: { marginBottom: 4 },
    inputWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FAFBFF',
        borderWidth: 1.5, borderColor: '#E2E8F0',
        borderRadius: 20, height: 60,
        paddingHorizontal: 20, gap: 12,
    },
    textInput: { flex: 1, fontSize: 15, color: '#0F172A', ...FONT.semibold, paddingVertical: 0 },

    primaryBtn: {
        borderRadius: 20, height: 54,
        overflow: 'hidden',
        shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
    },
    primaryBtnGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    primaryBtnText: { color: '#FFFFFF', fontSize: 16, ...FONT.bold },
    loadingRow: { flexDirection: 'row', alignItems: 'center' },

    toggleBtn: { alignItems: 'center', marginTop: 20, paddingVertical: 8 },
    toggleText: { fontSize: 13, ...FONT.semibold, color: '#6366F1', textAlign: 'center' },
});
