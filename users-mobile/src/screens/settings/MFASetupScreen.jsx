/**
 * MFASetupScreen.jsx — TOTP Enrollment Screen
 *
 * Allows users to enable MFA by:
 * 1. Generating a TOTP secret (with QR code)
 * 2. Scanning the QR in their authenticator app
 * 3. Entering the first code to confirm setup
 *
 * Audit items: 2.1, 2.9
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, Image, TextInput, Pressable,
    ScrollView, ActivityIndicator, Platform, Animated, Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ShieldCheck, Copy, ArrowLeft, CheckCircle2, QrCode, Smartphone, KeyRound } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { apiService } from '../../lib/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OTPBoxes from '../../components/ui/OTPBoxes';

import AlertManager from '../../utils/AlertManager';

const FONT = {
    regular: { fontFamily: 'Inter_400Regular' },
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

// OTPBoxes is imported from '../../components/ui/OTPBoxes'

/* ─── Step Indicator ─── */
const StepIndicator = ({ currentStep }) => {
    const steps = [
        { label: 'Scan', icon: QrCode },
        { label: 'Verify', icon: Smartphone },
        { label: 'Done', icon: CheckCircle2 },
    ];
    const stepIdx = currentStep === 'loading' ? 0 : currentStep === 'qr' ? 0 : currentStep === 'verify' ? 1 : 2;

    return (
        <View style={stepSt.row}>
            {steps.map((s, i) => {
                const isActive = i === stepIdx;
                const isDone = i < stepIdx;
                const Icon = s.icon;
                return (
                    <React.Fragment key={i}>
                        {i > 0 && (
                            <View style={[stepSt.line, (isDone) && stepSt.lineDone]} />
                        )}
                        <View style={[stepSt.dot, isActive && stepSt.dotActive, isDone && stepSt.dotDone]}>
                            <Icon size={14} color={isDone ? '#FFFFFF' : isActive ? '#059669' : '#94A3B8'} strokeWidth={2.5} />
                        </View>
                    </React.Fragment>
                );
            })}
        </View>
    );
};

const stepSt = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    dot: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#F1F5F9', borderWidth: 2, borderColor: '#E2E8F0',
        alignItems: 'center', justifyContent: 'center',
    },
    dotActive: { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
    dotDone: { borderColor: '#059669', backgroundColor: '#059669' },
    line: { width: 40, height: 2, backgroundColor: '#E2E8F0', marginHorizontal: 4 },
    lineDone: { backgroundColor: '#059669' },
});

export default function MFASetupScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const [step, setStep] = useState('loading'); // loading | qr | verify | done
    const [qrCode, setQrCode] = useState(null);
    const [secretKey, setSecretKey] = useState('');
    const [recoveryCodes, setRecoveryCodes] = useState([]);
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    // Animations
    const heroAnim = useRef(new Animated.Value(-10)).current;
    const heroOpacity = useRef(new Animated.Value(0)).current;
    const cardAnim = useRef(new Animated.Value(30)).current;
    const cardOpacity = useRef(new Animated.Value(0)).current;
    const doneScale = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(heroAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
            Animated.timing(heroOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
            Animated.timing(cardAnim, { toValue: 0, duration: 400, delay: 120, useNativeDriver: true }),
            Animated.timing(cardOpacity, { toValue: 1, duration: 400, delay: 120, useNativeDriver: true }),
        ]).start();
    }, []);

    // Pulse animation for loading
    useEffect(() => {
        if (step === 'loading') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [step]);

    // Scale-in for done step
    useEffect(() => {
        if (step === 'done') {
            Animated.spring(doneScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
        } else {
            doneScale.setValue(0);
        }
    }, [step]);

    // Auto-start setup on mount
    useEffect(() => {
        startSetup();
    }, []);

    const startSetup = useCallback(async () => {
        setStep('loading');
        setError('');
        try {
            const res = await apiService.auth.mfaSetup();
            setQrCode(res.data.qrCode);
            setSecretKey(res.data.secret);
            setStep('qr');
        } catch (err) {
            const msg = err.response?.data?.error || 'Failed to start MFA setup';
            setError(msg);
            setStep('qr');
        }
    }, []);

    const copySecret = useCallback(async () => {
        try {
            await Clipboard.setStringAsync(secretKey);
            setCopied(true);
            AlertManager.alert('Copied', 'Secret key copied to clipboard');
            setTimeout(() => setCopied(false), 2500);
        } catch {}
    }, [secretKey]);

    const verifyCode = useCallback(async (autoCode) => {
        const finalCode = (autoCode || code).trim();
        if (finalCode.length !== 6) {
            setError('Enter a 6-digit code');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await apiService.auth.mfaVerifySetup(finalCode);
            setRecoveryCodes(res.data.recoveryCodes || []);
            setStep('done');
        } catch (err) {
            setError(err.response?.data?.error || 'Invalid code. Try again.');
            setCode('');
        } finally {
            setLoading(false);
        }
    }, [code]);

    const copyRecoveryCodes = useCallback(async () => {
        try {
            await Clipboard.setStringAsync(recoveryCodes.join('\n'));
            AlertManager.alert('Copied', 'Recovery codes copied to clipboard. Store them safely!');
        } catch {}
    }, [recoveryCodes]);

    const heroTitle = step === 'done' ? 'You\'re Protected!' : 'Enable Two-Factor';
    const heroSubtitle = step === 'done'
        ? 'MFA is now active on your account'
        : step === 'qr'
            ? 'Scan the QR code with your authenticator app'
            : 'Setting up your secure authenticator…';

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <ScrollView
                contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Hero Section */}
                <Animated.View style={{ transform: [{ translateY: heroAnim }], opacity: heroOpacity }}>
                    <LinearGradient
                        colors={step === 'done' ? ['#059669', '#10B981', '#34D399'] : ['#059669', '#10B981', '#6EE7B7']}
                        start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }}
                        style={styles.hero}
                    >
                        {/* Back button */}
                        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
                            <ArrowLeft size={20} color="rgba(255,255,255,0.9)" />
                        </Pressable>

                        {/* Orb decorations */}
                        <View style={styles.orb1} />
                        <View style={styles.orb2} />
                        <View style={styles.orb3} />

                        <Animated.View style={[styles.heroIconWrap, step === 'loading' && { transform: [{ scale: pulseAnim }] }]}>
                            {step === 'done' ? (
                                <Animated.View style={{ transform: [{ scale: doneScale }] }}>
                                    <CheckCircle2 size={42} color="#059669" strokeWidth={1.8} />
                                </Animated.View>
                            ) : (
                                <ShieldCheck size={42} color="#059669" strokeWidth={1.8} />
                            )}
                        </Animated.View>
                        <Text style={styles.heroLabel}>SECURITY</Text>
                        <Text style={styles.heroTitle}>{heroTitle}</Text>
                        <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>
                    </LinearGradient>
                </Animated.View>

                {/* Form Card */}
                <Animated.View style={[styles.formCard, { transform: [{ translateY: cardAnim }], opacity: cardOpacity }]}>

                    {step !== 'done' && <StepIndicator currentStep={step} />}

                    {error ? (
                        <View style={styles.errorBox}>
                            <View style={styles.errorDot} />
                            <Text style={styles.errorMsg}>{error}</Text>
                        </View>
                    ) : null}

                    {/* Loading */}
                    {step === 'loading' && (
                        <View style={styles.loadingWrap}>
                            <ActivityIndicator size="large" color="#10B981" />
                            <Text style={styles.loadingText}>Generating your secret key…</Text>
                        </View>
                    )}

                    {/* QR Code Step */}
                    {step === 'qr' && qrCode && (
                        <View>
                            {/* QR Image */}
                            <View style={styles.qrOuter}>
                                <LinearGradient
                                    colors={['#ECFDF5', '#D1FAE5']}
                                    style={styles.qrGradientBg}
                                >
                                    <View style={styles.qrWrapper}>
                                        <Image source={{ uri: qrCode }} style={styles.qrImage} />
                                    </View>
                                </LinearGradient>
                            </View>

                            <Text style={styles.scanHint}>
                                Open Google Authenticator, Authy, or any TOTP app and scan the QR code above.
                            </Text>

                            {/* Manual Key */}
                            <View style={styles.manualSection}>
                                <Text style={styles.sectionLabel}>Or enter this key manually:</Text>
                                <Pressable style={[styles.secretRow, copied && styles.secretRowCopied]} onPress={copySecret}>
                                    <KeyRound size={16} color={copied ? '#059669' : '#64748B'} />
                                    <Text style={[styles.secretText, copied && { color: '#059669' }]} numberOfLines={1}>{secretKey}</Text>
                                    <View style={[styles.copyChip, copied && styles.copyChipDone]}>
                                        {copied ? (
                                            <CheckCircle2 size={14} color="#FFFFFF" />
                                        ) : (
                                            <Copy size={14} color="#059669" />
                                        )}
                                        <Text style={[styles.copyChipText, copied && { color: '#FFFFFF' }]}>{copied ? 'Copied' : 'Copy'}</Text>
                                    </View>
                                </Pressable>
                            </View>

                            {/* Divider */}
                            <View style={styles.divider}>
                                <View style={styles.dividerLine} />
                                <Text style={styles.dividerText}>THEN</Text>
                                <View style={styles.dividerLine} />
                            </View>

                            {/* Enter Code */}
                            <Text style={styles.sectionLabel}>Enter the 6-digit code from your app:</Text>
                            <OTPBoxes
                                value={code}
                                onChange={(val) => { setCode(val); if (error) setError(''); }}
                                onComplete={(val) => verifyCode(val)}
                                length={6}
                                editable={!loading}
                                activeBorderColor="#10B981"
                                activeBgColor="#ECFDF5"
                                boxWidth={38}
                                boxHeight={50}
                                borderRadius={12}
                            />

                            <Pressable
                                style={[styles.primaryBtn, (loading || code.length !== 6) && { opacity: 0.6 }]}
                                onPress={() => verifyCode()}
                                disabled={loading || code.length !== 6}
                            >
                                <LinearGradient
                                    colors={['#10B981', '#059669']}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={styles.primaryBtnGradient}
                                >
                                    {loading ? (
                                        <View style={styles.loadingRow}>
                                            <ActivityIndicator size="small" color="#FFFFFF" />
                                            <Text style={styles.primaryBtnText}>  Verifying…</Text>
                                        </View>
                                    ) : (
                                        <Text style={styles.primaryBtnText}>Verify & Enable MFA</Text>
                                    )}
                                </LinearGradient>
                            </Pressable>
                        </View>
                    )}

                    {/* Done Step — Recovery Codes */}
                    {step === 'done' && (
                        <View>
                            <Animated.View style={[styles.doneIconWrap, { transform: [{ scale: doneScale }] }]}>
                                <LinearGradient colors={['#ECFDF5', '#D1FAE5']} style={styles.doneIconBg}>
                                    <CheckCircle2 color="#059669" size={44} />
                                </LinearGradient>
                            </Animated.View>

                            <Text style={styles.doneTitle}>Two-Factor Authentication is Active</Text>
                            <Text style={styles.doneSubtitle}>
                                Your account is now significantly more secure.
                            </Text>

                            {/* Recovery Codes Warning */}
                            <View style={styles.warningCard}>
                                <View style={styles.warningHeader}>
                                    <Text style={styles.warningEmoji}>⚠️</Text>
                                    <Text style={styles.warningTitle}>Save Your Recovery Codes</Text>
                                </View>
                                <Text style={styles.warningText}>
                                    These one-time backup codes let you access your account if you lose your phone. Store them somewhere safe — they won't be shown again.
                                </Text>
                            </View>

                            {/* Codes Grid */}
                            <View style={styles.codesGrid}>
                                {recoveryCodes.map((c, i) => (
                                    <View key={i} style={styles.codeChip}>
                                        <Text style={styles.codeNum}>{i + 1}</Text>
                                        <Text style={styles.codeText}>{c}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Copy All */}
                            <Pressable style={styles.copyAllBtn} onPress={copyRecoveryCodes}>
                                <Copy color="#059669" size={16} />
                                <Text style={styles.copyAllText}>Copy All Codes</Text>
                            </Pressable>

                            {/* Done Button */}
                            <Pressable style={styles.primaryBtn} onPress={() => navigation.goBack()}>
                                <LinearGradient
                                    colors={['#10B981', '#059669']}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={styles.primaryBtnGradient}
                                >
                                    <Text style={styles.primaryBtnText}>I've Saved My Codes — Done</Text>
                                </LinearGradient>
                            </Pressable>
                        </View>
                    )}
                </Animated.View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0FDF4' },

    /* ─── Hero ─── */
    hero: {
        minHeight: 200,
        borderBottomLeftRadius: 44,
        borderBottomRightRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 24,
        paddingBottom: 36,
        overflow: 'hidden',
    },
    backBtn: {
        position: 'absolute',
        top: 20,
        left: 20,
        zIndex: 10,
        width: 40, height: 40, borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    },
    orb1: { position: 'absolute', borderRadius: 999, width: 200, height: 200, top: -80, right: -60, backgroundColor: '#065F46', opacity: 0.25 },
    orb2: { position: 'absolute', borderRadius: 999, width: 140, height: 140, bottom: -40, left: -40, backgroundColor: '#047857', opacity: 0.3 },
    orb3: { position: 'absolute', borderRadius: 999, width: 80, height: 80, top: 60, left: -20, backgroundColor: '#34D399', opacity: 0.15 },
    heroIconWrap: {
        width: 72, height: 72, borderRadius: 24,
        backgroundColor: '#FFFFFF',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 14,
        shadowColor: '#059669', shadowOpacity: 0.25, shadowRadius: 16,
        shadowOffset: { width: 0, height: 4 }, elevation: 8,
    },
    heroLabel: { fontSize: 11, ...FONT.heavy, color: 'rgba(255,255,255,0.5)', letterSpacing: 5, marginBottom: 6 },
    heroTitle: { fontSize: 30, ...FONT.heavy, color: '#FFFFFF', letterSpacing: -0.5 },
    heroSubtitle: {
        fontSize: 14, ...FONT.medium, color: 'rgba(255,255,255,0.7)',
        marginTop: 6, textAlign: 'center', paddingHorizontal: 36, lineHeight: 20,
    },

    /* ─── Form Card ─── */
    formCard: {
        marginTop: -28, marginHorizontal: 16,
        backgroundColor: 'rgba(255,255,255,0.97)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)',
        borderRadius: 36,
        paddingHorizontal: 24, paddingTop: 28, paddingBottom: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.1, shadowRadius: 32, elevation: 12,
        zIndex: 5,
    },

    /* ─── Error ─── */
    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#FEF2F2', borderRadius: 16, padding: 14, marginBottom: 12,
        borderWidth: 1, borderColor: '#FECACA',
    },
    errorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
    errorMsg: { color: '#991B1B', fontSize: 13, ...FONT.semibold, flex: 1, lineHeight: 18 },

    /* ─── Loading ─── */
    loadingWrap: { alignItems: 'center', paddingVertical: 40 },
    loadingText: { color: '#64748B', fontSize: 14, ...FONT.medium, marginTop: 16 },

    /* ─── QR Section ─── */
    qrOuter: { alignSelf: 'center', marginBottom: 16 },
    qrGradientBg: { borderRadius: 24, padding: 4, alignItems: 'center', justifyContent: 'center' },
    qrWrapper: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20, padding: 16,
        shadowColor: '#059669', shadowOpacity: 0.1, shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    qrImage: { width: 200, height: 200, borderRadius: 8 },
    scanHint: { color: '#64748B', fontSize: 13, ...FONT.medium, textAlign: 'center', lineHeight: 19, marginBottom: 20, paddingHorizontal: 8 },

    /* ─── Manual Section ─── */
    manualSection: { marginBottom: 4 },
    sectionLabel: { color: '#475569', fontSize: 13, ...FONT.bold, marginBottom: 10, letterSpacing: 0.3 },
    secretRow: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#F8FAFC', borderRadius: 16, padding: 14, gap: 10,
        borderWidth: 1.5, borderColor: '#E2E8F0',
    },
    secretRowCopied: { borderColor: '#A7F3D0', backgroundColor: '#F0FDF4' },
    secretText: {
        color: '#334155', fontSize: 13,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        flex: 1,
    },
    copyChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
        borderWidth: 1, borderColor: '#A7F3D0',
    },
    copyChipDone: { backgroundColor: '#059669', borderColor: '#059669' },
    copyChipText: { fontSize: 11, ...FONT.bold, color: '#059669' },

    /* ─── Divider ─── */
    divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
    dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
    dividerText: { color: '#94A3B8', fontSize: 11, ...FONT.heavy, letterSpacing: 3, marginHorizontal: 12 },

    /* ─── Primary Button ─── */
    primaryBtn: {
        borderRadius: 20, height: 54,
        overflow: 'hidden',
        shadowColor: '#065F46', shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25, shadowRadius: 20, elevation: 10,
    },
    primaryBtnGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    primaryBtnText: { color: '#FFFFFF', fontSize: 16, ...FONT.bold },
    loadingRow: { flexDirection: 'row', alignItems: 'center' },

    /* ─── Done Section ─── */
    doneIconWrap: { alignItems: 'center', marginBottom: 16 },
    doneIconBg: {
        width: 80, height: 80, borderRadius: 40,
        alignItems: 'center', justifyContent: 'center',
    },
    doneTitle: { fontSize: 20, ...FONT.heavy, color: '#0F172A', textAlign: 'center', marginBottom: 6 },
    doneSubtitle: { fontSize: 14, ...FONT.medium, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 20 },

    /* ─── Warning Card ─── */
    warningCard: {
        backgroundColor: '#FFFBEB', borderRadius: 20, padding: 16,
        borderWidth: 1.5, borderColor: '#FDE68A', marginBottom: 16,
    },
    warningHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    warningEmoji: { fontSize: 18 },
    warningTitle: { fontSize: 15, ...FONT.bold, color: '#92400E' },
    warningText: { color: '#78350F', fontSize: 13, ...FONT.medium, lineHeight: 19 },

    /* ─── Codes Grid ─── */
    codesGrid: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 16,
    },
    codeChip: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 10,
        borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0',
    },
    codeNum: { fontSize: 10, ...FONT.heavy, color: '#94A3B8', width: 14, textAlign: 'center' },
    codeText: {
        fontSize: 14, ...FONT.bold, color: '#0F172A',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        letterSpacing: 1,
    },

    /* ─── Copy All ─── */
    copyAllBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginBottom: 20, padding: 12, borderRadius: 16,
        backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0',
    },
    copyAllText: { color: '#059669', fontSize: 14, ...FONT.bold },
});
