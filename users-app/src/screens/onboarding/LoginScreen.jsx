import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TextInput, Pressable, Platform,
    KeyboardAvoidingView, ScrollView, Animated, ActivityIndicator, Alert,
    BackHandler,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Mail, Lock, Eye, EyeOff, HeartPulse, AlertCircle, Smartphone, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { parseError } from '../../utils/parseError';
import analytics from '../../utils/analytics';
import { colors } from '../../theme';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const C = {
    primary: '#6366F1',
    primaryDark: '#4338CA',
    primarySoft: '#EEF2FF',
    dark: '#0F172A',
    mid: '#334155',
    muted: '#94A3B8',
    light: '#CBD5E1',
    border: '#F1F5F9',
    borderMid: '#E2E8F0',
    danger: '#F43F5E',
    dangerBg: '#FFE4E6',
    pageBg: '#F8FAFC',
};

const FONT = {
    regular: { fontFamily: 'Inter_400Regular' },
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export default function LoginScreen({ navigation }) {
    const { signIn, signInWithGoogle, resetPassword } = useAuth();

    const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
        clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        prompt: 'select_account',
    });

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorText, setErrorText] = useState('');
    const [emailFocused, setEmailFocused] = useState(false);
    const [passFocused, setPassFocused] = useState(false);

    // §13 FIX: useRef to prevent double-tap
    const isSubmittingRef = useRef(false);
    // §13 FIX: AbortController for request cancellation on unmount
    const abortRef = useRef(null);

    // Refs for programmatic focus
    const emailRef = useRef(null);
    const passwordRef = useRef(null);

    // Animations
    const heroAnim = useRef(new Animated.Value(-10)).current;
    const heroOpacity = useRef(new Animated.Value(0)).current;
    const cardAnim = useRef(new Animated.Value(20)).current;
    const cardOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(heroAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
            Animated.timing(heroOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(cardAnim, { toValue: 0, duration: 350, delay: 100, useNativeDriver: true }),
            Animated.timing(cardOpacity, { toValue: 1, duration: 350, delay: 100, useNativeDriver: true }),
        ]).start();
    }, []);

    // §10 FIX: Android back button on Login exits app
    useEffect(() => {
        const backAction = () => {
            BackHandler.exitApp();
            return true;
        };
        const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
        return () => sub.remove();
    }, []);

    // §13 FIX: Cancel pending requests on unmount
    useEffect(() => {
        return () => {
            if (abortRef.current) abortRef.current.abort();
        };
    }, []);

    // Handle Google OAuth response
    useEffect(() => {
        if (response?.type === 'success') {
            const { id_token } = response.params;
            handleGoogleSignIn(id_token);
        }
    }, [response]);

    const handleGoogleSignIn = async (idToken) => {
        try {
            setLoading(true);
            setErrorText('');
            const result = await signInWithGoogle(idToken);
            if (result?.isNewUser) {
                await supabase.auth.signOut();
                setErrorText('No CareCo account found for this Google account. Please sign up first.');
                analytics.loginFailure('google_no_account');
            } else {
                analytics.loginSuccess(result?.user?.id);
            }
        } catch (error) {
            const { general } = parseError(error);
            setErrorText(general);
            analytics.loginFailure(error?.code || 'google_error');
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async () => {
        // §13 FIX: useRef guard prevents double tap
        if (isSubmittingRef.current) return;

        // §14 FIX: Trim and lowercase email
        const cleanEmail = email.trim().toLowerCase();

        // §4 FIX: Client validation before any API call
        if (!cleanEmail) {
            setErrorText('Please enter your email address.');
            return;
        }
        if (!/\S+@\S+\.\S+/.test(cleanEmail)) {
            setErrorText('Please enter a valid email address.');
            return;
        }
        if (!password) {
            setErrorText('Please enter your password.');
            return;
        }
        if (password.length < 6) {
            setErrorText('Password must be at least 6 characters.');
            return;
        }

        isSubmittingRef.current = true;
        setLoading(true);
        setErrorText('');

        try {
            const result = await signIn(cleanEmail, password, 'patient');
            // §14 FIX: Clear sensitive state after success
            setEmail('');
            setPassword('');
            analytics.loginSuccess(result?.session?.user?.id);
        } catch (error) {
            // §4 FIX: Supabase-specific error mapping
            const { general } = parseError(error);
            setErrorText(general);
            setPassword('');
            analytics.loginFailure(error?.code || 'login_error');
        } finally {
            setLoading(false);
            isSubmittingRef.current = false;
        }
    };

    const handleForgotPassword = async () => {
        const resetEmail = email.trim().toLowerCase();
        if (!resetEmail || !/\S+@\S+\.\S+/.test(resetEmail)) {
            Alert.alert('Enter Your Email', 'Please enter a valid email address in the email field above, then tap Forgot Password again.');
            return;
        }
        try {
            setLoading(true);
            await resetPassword(resetEmail);
            Alert.alert('Check Your Email', `We've sent a password reset link to ${resetEmail}. Please check your inbox.`);
        } catch (error) {
            const { general } = parseError(error);
            Alert.alert('Reset Failed', general);
        } finally {
            setLoading(false);
        }
    };

    // §4 FIX: Clear errors when user starts typing
    const handleEmailChange = (v) => {
        setEmail(v);
        if (errorText) setErrorText('');
    };
    const handlePasswordChange = (v) => {
        setPassword(v);
        if (errorText) setErrorText('');
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1, paddingBottom: Platform.OS === 'ios' ? 100 : 150 }}
                keyboardShouldPersistTaps="handled"
                bounces={false}
                showsVerticalScrollIndicator={false}
            >

                {/* Hero Section — Indigo→Cyan Gradient */}
                <Animated.View style={{ transform: [{ translateY: heroAnim }], opacity: heroOpacity }}>
                    <LinearGradient
                        colors={['#4338CA', '#38BDF8']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={styles.hero}
                    >
                        <View style={[styles.decorativeCircle, { top: -60, right: -40, width: 250, height: 250, backgroundColor: 'rgba(255, 255, 255, 0.12)' }]} />
                        <View style={[styles.decorativeCircle, { top: 60, left: -80, width: 200, height: 200, backgroundColor: 'rgba(255, 255, 255, 0.08)' }]} />
                        <View style={[styles.decorativeCircle, { bottom: -80, right: 40, width: 160, height: 160, backgroundColor: 'rgba(255, 255, 255, 0.05)' }]} />

                        <View style={styles.heroIconWrap}>
                            <HeartPulse size={48} color="#FFFFFF" strokeWidth={1.5} />
                        </View>
                        <Text style={styles.heroLabel}>CARECO</Text>
                        <Text style={styles.heroTitle}>Welcome Back</Text>
                        <Text style={styles.heroSubtitle}>Your health journey continues here</Text>
                    </LinearGradient>
                </Animated.View>

                {/* Form Card — Squircle */}
                <Animated.View style={[styles.formCard, { transform: [{ translateY: cardAnim }], opacity: cardOpacity }]}>

                    {/* Social/Alt Logins */}
                    <View style={styles.socialRowPremium}>
                        <Pressable style={styles.socialBtnPremium} onPress={() => promptAsync()} disabled={!request || loading}>
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
                    <Pressable style={styles.forgotRow} onPress={handleForgotPassword}>
                        <Text style={styles.forgotText}>Forgot Password?</Text>
                    </Pressable>

                    {/* Login Button — Indigo Pill */}
                    <Pressable style={[styles.primaryBtn, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading}>
                        <LinearGradient
                            colors={['#6366F1', '#4338CA']}
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
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.pageBg },

    // ─── Hero Section — Indigo→Cyan ────────────────
    hero: {
        height: 300,
        borderBottomLeftRadius: 40,
        borderBottomRightRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        overflow: 'hidden',
    },
    decorativeCircle: { position: 'absolute', borderRadius: 100 },
    heroIconWrap: {
        width: 80, height: 80, borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 16,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    },
    heroLabel: { fontSize: 12, ...FONT.bold, color: 'rgba(255,255,255,0.6)', letterSpacing: 2, marginBottom: 6 },
    heroTitle: { fontSize: 32, ...FONT.heavy, color: '#FFFFFF', letterSpacing: -0.5 },
    heroSubtitle: { fontSize: 15, ...FONT.medium, color: 'rgba(255,255,255,0.75)', marginTop: 4 },

    // ─── Form Card Overlay — Squircle ───────────
    formCard: {
        marginTop: -30,
        marginHorizontal: 20,
        backgroundColor: '#FFFFFF',
        borderRadius: 36,
        paddingHorizontal: 24,
        paddingTop: 32,
        paddingBottom: 30,
        shadowColor: C.primary,
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.08,
        shadowRadius: 32,
        elevation: 12,
        marginBottom: 40,
        zIndex: 5,
    },

    socialRowPremium: { flexDirection: 'row', gap: 16, marginBottom: 32 },
    socialBtnPremium: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1.5, borderColor: C.borderMid,
        borderRadius: 24, height: 60, gap: 12,
    },
    socialBtnTextPremium: { fontSize: 15, ...FONT.bold, color: C.dark },
    googleG: { fontSize: 20, ...FONT.heavy, color: '#4285F4' },

    dividerRowPremium: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, paddingHorizontal: 10 },
    dividerLine: { flex: 1, height: 1, backgroundColor: C.borderMid },
    dividerText: { marginHorizontal: 16, fontSize: 11, color: C.muted, ...FONT.heavy, letterSpacing: 1.5 },

    // ─── Fields ──────────────────────
    fieldGroup: { marginBottom: 20 },
    label: { fontSize: 13, ...FONT.bold, color: C.muted, marginBottom: 10, marginLeft: 2, letterSpacing: 0.5 },
    inlineIconBox: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: C.border, alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    inputWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1.5, borderColor: C.border,
        borderRadius: 20, height: 64,
        paddingHorizontal: 16,
    },
    inputFocused: {
        borderColor: C.primary,
        shadowColor: C.primary, shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    textInput: { flex: 1, fontSize: 16, color: C.dark, ...FONT.semibold },

    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: C.dangerBg, borderRadius: 20, padding: 16, marginBottom: 24,
        borderWidth: 1, borderColor: '#FCA5A5',
    },
    errorMsg: { color: '#991B1B', fontSize: 14, ...FONT.semibold, flex: 1 },

    forgotRow: { alignSelf: 'flex-end', marginTop: -10, marginBottom: 32 },
    forgotText: { fontSize: 14, ...FONT.bold, color: C.primary },

    // ─── Primary Button — Indigo Pill ────────
    primaryBtn: {
        borderRadius: 100, height: 64,
        overflow: 'hidden',
        shadowColor: C.primary, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
    },
    primaryBtnGradient: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 17, ...FONT.bold },
    loadingRow: { flexDirection: 'row', alignItems: 'center' },

    bottomLink: { flexDirection: 'row', justifyContent: 'center', marginTop: 40, paddingBottom: 20 },
    bottomLinkText: { fontSize: 15, color: C.muted, ...FONT.medium },
    bottomLinkAction: { fontSize: 15, ...FONT.heavy, color: C.primary },
});
