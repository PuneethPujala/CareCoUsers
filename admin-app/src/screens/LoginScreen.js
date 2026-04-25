import React, { useState } from 'react';
import { 
    View, Text, TouchableOpacity, StyleSheet, 
    ActivityIndicator, StatusBar, Platform 
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius, Shadows } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import PremiumInput from '../components/common/PremiumInput';
import useGoogleAuth from '../hooks/useGoogleAuth';
import { isValidEmail } from '../utils/validators';

export default function LoginScreen({ navigation }) {
    const { signIn, signInWithGoogle } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [showPw, setShowPw] = useState(false);
    const [loginError, setLoginError] = useState(null);

    // Google auth hook
    const { signInWithGoogle: promptGoogleSignIn } = useGoogleAuth();

    const isLoading = loading || googleLoading;

    const handleLogin = async () => {
        if (!email.trim()) { setLoginError('Email address is required.'); return; }
        if (!isValidEmail(email.trim())) { setLoginError('Please enter a valid email address.'); return; }
        if (!password) { setLoginError('Password is required.'); return; }
        if (password.length < 6) { setLoginError('Password must be at least 6 characters.'); return; }
        setLoginError(null);
        setLoading(true);
        try {
            await signIn(email.trim().toLowerCase(), password);
        } catch (err) {
            setLoginError(err?.message || 'Login failed. Invalid credentials.');
        } finally { 
            setLoading(false); 
        }
    };

    const handleGoogleLogin = async () => {
        setGoogleLoading(true);
        setLoginError(null);
        try {
            const data = await promptGoogleSignIn();
            if (!data) return; // User cancelled
            await signInWithGoogle(data);
        } catch (err) {
            setLoginError(err?.message || 'Failed to sign in with Google.');
        } finally {
            setGoogleLoading(false);
        }
    };

    return (
        <KeyboardAwareScrollView 
            style={s.container}
            contentContainerStyle={s.scrollContent}
            enableOnAndroid={true}
            extraScrollHeight={20}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
        >
            <StatusBar barStyle="dark-content" />
            <SafeAreaView style={s.safe}>
                
                {/* Back Button Overlay */}
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Feather name="x" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
                    <View style={s.card}>
                        
                        {/* Header Section */}
                        <View style={s.headerWrap}>
                            <View style={s.logoMini}>
                                <Ionicons name="shield-checkmark" size={32} color={Colors.primary} />
                            </View>
                            <Text style={s.title}>Admin Portal</Text>
                            <Text style={s.subtitle}>
                                Sign in to manage CareConnect
                            </Text>
                        </View>

                        {/* Error Banner */}
                        {loginError && (
                            <View style={s.errorBanner}>
                                <Feather name="alert-circle" size={18} color="#DC2626" />
                                <Text style={s.errorText}>{loginError}</Text>
                                <TouchableOpacity onPress={() => setLoginError(null)} hitSlop={{top:10,bottom:10,left:10,right:10}}>
                                    <Feather name="x" size={16} color="#DC2626" />
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Form Section */}
                        <View style={s.form}>
                            <PremiumInput
                                icon={<Feather name="mail" size={18} color={Colors.textMuted} />}
                                placeholder="Email address"
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                editable={!isLoading}
                                style={{ marginBottom: Spacing.sm }}
                            />
                            <PremiumInput
                                icon={<Feather name="lock" size={18} color={Colors.textMuted} />}
                                placeholder="Password"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPw}
                                editable={!isLoading}
                                style={{ marginBottom: 4 }}
                                rightElement={
                                    <TouchableOpacity onPress={() => setShowPw(!showPw)} style={{ padding: 4 }}>
                                        <Feather name={showPw ? "eye-off" : "eye"} size={18} color={Colors.textMuted} />
                                    </TouchableOpacity>
                                }
                            />
                            
                            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={s.forgotWrap}>
                                <Text style={s.forgotText}>Forgot Password?</Text>
                            </TouchableOpacity>

                            {/* Sign In Button */}
                            <TouchableOpacity onPress={handleLogin} disabled={isLoading} activeOpacity={0.8} style={s.submitWrap}>
                                <LinearGradient colors={['#6366F1', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.submitBtn}>
                                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Sign In</Text>}
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>

                        {/* Divider */}
                        <View style={s.dividerRow}>
                            <View style={s.dividerLine} />
                            <Text style={s.dividerText}>OR DO IT QUICKLY</Text>
                            <View style={s.dividerLine} />
                        </View>

                        {/* Google Sign-In Button */}
                        <TouchableOpacity
                            onPress={handleGoogleLogin}
                            disabled={isLoading}
                            activeOpacity={0.8}
                            style={[s.googleBtn, isLoading && s.googleBtnDisabled]}
                        >
                            {googleLoading ? (
                                <ActivityIndicator color="#4285F4" size="small" />
                            ) : (
                                <>
                                    <View style={s.googleIconWrap}>
                                        <Text style={s.googleIconText}>G</Text>
                                    </View>
                                    <Text style={s.googleBtnText}>Continue with Google</Text>
                                </>
                            )}
                        </TouchableOpacity>

                    </View>
                    
                    {/* Bottom Footer Text */}
                    <Text style={s.footerText}>
                        By signing in, you agree to our Terms of Service Policy
                    </Text>
            </SafeAreaView>
        </KeyboardAwareScrollView>
    );
}

const s = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: Colors.background 
    },
    safe: { 
        flex: 1 
    },
    backBtn: { 
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 40,
        left: 20,
        zIndex: 10,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Colors.white,
        justifyContent: 'center',
        alignItems: 'center',
        ...Shadows.sm
    },
    scrollContent: { 
        flexGrow: 1, 
        justifyContent: 'center', 
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.xxl
    },
    
    // Main White Card
    card: {
        backgroundColor: Colors.white,
        borderRadius: Radius.xxl,
        padding: Spacing.xl,
        ...Shadows.xl,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.8)'
    },

    // Header Structure
    headerWrap: {
        alignItems: 'center',
        marginBottom: Spacing.lg
    },
    logoMini: { 
        width: 64, 
        height: 64, 
        borderRadius: 20, 
        backgroundColor: '#EFF6FF',
        justifyContent: 'center', 
        alignItems: 'center',
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: '#DBEAFE'
    },
    title: { 
        ...Typography.h1, 
        color: Colors.textPrimary, 
        fontSize: 26,
        marginBottom: Spacing.xs
    },
    subtitle: { 
        ...Typography.body, 
        color: Colors.textSecondary, 
        fontSize: 15, 
        textAlign: 'center'
    },

    // Form
    form: {
        marginBottom: Spacing.md
    },
    forgotWrap: {
        alignSelf: 'flex-end',
        paddingVertical: Spacing.xs,
        marginBottom: Spacing.md
    },
    forgotText: { 
        ...Typography.caption, 
        color: Colors.primary, 
        fontWeight: '700' 
    },
    
    // Primary Button
    submitWrap: { 
        borderRadius: Radius.full, 
        overflow: 'hidden', 
        ...Shadows.md,
        marginTop: Spacing.sm
    },
    submitBtn: { 
        paddingVertical: 16, 
        alignItems: 'center' 
    },
    submitText: { 
        ...Typography.button, 
        color: '#fff', 
        fontSize: 16,
        letterSpacing: 0.5
    },

    // Divider
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: Spacing.lg,
        gap: Spacing.md,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: Colors.border,
    },
    dividerText: {
        ...Typography.tiny,
        color: Colors.textMuted,
        letterSpacing: 1.5,
    },

    // Google Button
    googleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        paddingVertical: 15,
        paddingHorizontal: 24,
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: Colors.border,
        gap: 12,
    },
    googleBtnDisabled: {
        opacity: 0.55,
    },
    googleIconWrap: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#4285F4',
        justifyContent: 'center',
        alignItems: 'center',
    },
    googleIconText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
    },
    googleBtnText: {
        ...Typography.bodySemibold,
        color: Colors.textPrimary,
        fontSize: 15,
    },

    // Footer
    footerText: {
        ...Typography.tiny,
        color: Colors.textMuted,
        textAlign: 'center',
        marginTop: Spacing.xl,
        paddingHorizontal: Spacing.xl
    },

    // Error Banner
    errorBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14,
        marginBottom: Spacing.md, borderWidth: 1.5, borderColor: '#FECACA',
    },
    errorText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#991B1B', lineHeight: 18 },
});
