/**
 * ResetPasswordScreen.jsx — §7 FIX
 *
 * Handles the PASSWORD_RECOVERY deep link from Supabase.
 * User enters new password → calls auth.updatePassword() → navigates to Login.
 */

import React, { useState, useRef } from 'react';
import {
    View, Text, StyleSheet, TextInput, Pressable, Platform,
    KeyboardAvoidingView, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock, Eye, EyeOff, ShieldCheck, CheckCircle2, ChevronRight, AlertCircle } from 'lucide-react-native';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { auth } from '../../lib/supabase';
import { parseError } from '../../utils/parseError';
import analytics from '../../utils/analytics';
import { useAuth } from '../../context/AuthContext';
import { isRecoveryExpired } from '../../utils/authUtils';
import SmartInput from '../../components/ui/SmartInput';
import { colors, radius, spacing, shadows } from '../../theme';

export default function ResetPasswordScreen({ navigation }) {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const isSubmittingRef = useRef(false);

    const { signOut, recoverySessionAt } = useAuth();

    // Check if recovery link is expired (10 minutes)
    const isExpired = isRecoveryExpired(recoverySessionAt);

    const handleResetPassword = async () => {
        if (isSubmittingRef.current) return;

        // Validate
        if (!newPassword) {
            setError('Please enter a new password.');
            return;
        }
        if (newPassword.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (!/[A-Z]/.test(newPassword)) {
            setError('Password must contain at least one uppercase letter.');
            return;
        }
        if (!/[0-9]/.test(newPassword)) {
            setError('Password must contain at least one number.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        isSubmittingRef.current = true;
        setLoading(true);
        setError('');

        try {
            await auth.updatePassword(newPassword);
            setSuccess(true);
            analytics.track('password_reset_success');
            // Clear sensitive state
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            const { general } = parseError(err);
            setError(general);
            analytics.track('password_reset_failure', { errorCode: err?.code });
        } finally {
            setLoading(false);
            isSubmittingRef.current = false;
        }
    };

    const handleGoToLogin = async () => {
        // Just sign out — this clears the recovery session and resets the global 'user' state
        // causing AppNavigator to naturally show the Login screen.
        await signOut();
    };

    const renderSvgBackground = () => (
        <View style={StyleSheet.absoluteFill}>
            <Svg height="100%" width="100%" viewBox="0 0 400 850" preserveAspectRatio="none">
                <Defs>
                    <SvgGradient id="topBg" x1="0%" y1="0%" x2="100%" y2="100%">
                        <Stop offset="0%" stopColor="#E0F2FE" stopOpacity="0.75" />
                        <Stop offset="100%" stopColor="#F8FAFC" stopOpacity="0" />
                    </SvgGradient>
                    <SvgGradient id="bottomBg" x1="0%" y1="0%" x2="100%" y2="100%">
                        <Stop offset="0%" stopColor="#FFF1F2" stopOpacity="0.75" />
                        <Stop offset="100%" stopColor="#F8FAFC" stopOpacity="0" />
                    </SvgGradient>
                </Defs>
                
                <Path d="M180 0 C260 120, 320 150, 400 120 L400 0 Z" fill="url(#topBg)" />
                <Path d="M0 620 C60 700, 140 720, 220 850 L0 850 Z" fill="url(#bottomBg)" />
                <Path d="M-20 180 C80 230, 180 150, 280 230 C340 280, 380 250, 420 310" stroke="#E2E8F0" strokeWidth="1.5" fill="none" opacity="0.6" />
                <Path d="M-40 210 C60 260, 160 180, 260 260 C320 310, 360 280, 400 340" stroke="#E2E8F0" strokeWidth="1" fill="none" opacity="0.35" />
                <Circle cx="320" cy="480" r="130" stroke="#E2E8F0" strokeWidth="1" fill="none" opacity="0.28" />
                <Circle cx="320" cy="480" r="90" stroke="#E2E8F0" strokeWidth="1.2" fill="none" opacity="0.18" />
            </Svg>
        </View>
    );

    if (isExpired) {
        return (
            <View style={styles.container}>
                {renderSvgBackground()}
                <View style={styles.successCenter}>
                    <View style={[styles.successCircle, { backgroundColor: '#FEF2F2', borderColor: '#FEE2E2', borderWidth: 1.5 }]}>
                        <AlertCircle size={64} color="#DC2626" strokeWidth={1.5} />
                    </View>
                    <Text style={[styles.successTitle, { color: '#991B1B' }]}>Link Expired</Text>
                    <Text style={styles.successSub}>This password reset link has expired. Please request a new one.</Text>
                    <Pressable style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]} onPress={handleGoToLogin}>
                        <LinearGradient colors={['#6366F1', '#4338CA']} style={styles.primaryBtnGradient}>
                            <Text style={styles.primaryBtnText}>Return to Login</Text>
                            <ChevronRight size={20} color="#FFFFFF" />
                        </LinearGradient>
                    </Pressable>
                </View>
            </View>
        );
    }

    if (success) {
        return (
            <View style={styles.container}>
                {renderSvgBackground()}
                <View style={styles.successCenter}>
                    <View style={[styles.successCircle, { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7', borderWidth: 1.5 }]}>
                        <CheckCircle2 size={64} color="#22C55E" strokeWidth={1.5} />
                    </View>
                    <Text style={styles.successTitle}>Password Updated!</Text>
                    <Text style={styles.successSub}>Your password has been changed. You can now log in with your new password.</Text>
                    <Pressable style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]} onPress={handleGoToLogin}>
                        <LinearGradient colors={['#6366F1', '#4338CA']} style={styles.primaryBtnGradient}>
                            <Text style={styles.primaryBtnText}>Continue to Login</Text>
                            <ChevronRight size={20} color="#FFFFFF" />
                        </LinearGradient>
                    </Pressable>
                </View>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            {renderSvgBackground()}
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={false}>
                
                {/* Welcome/Security badge */}
                <View style={styles.welcomeBadge}>
                    <View style={styles.welcomeDot} />
                    <Text style={styles.welcomeBadgeText}>Security</Text>
                </View>

                {/* Title */}
                <Text style={styles.titleLine1}>Set New</Text>
                <Text style={styles.titleAppName}>Password</Text>
                <Text style={styles.subtitle}>Create a strong, secure password for your account</Text>

                {/* Form */}
                <View style={styles.glassFormCard}>
                    {error ? (
                        <View style={styles.errorBox}>
                            <AlertCircle size={16} color="#DC2626" />
                            <Text style={styles.errorMsg}>{error}</Text>
                        </View>
                    ) : null}

                    <View style={styles.fieldGroup}>
                        <SmartInput
                            label="New Password"
                            placeholder="Enter new password"
                            value={newPassword}
                            onChangeText={(v) => { setNewPassword(v); if (error) setError(''); }}
                            secureTextEntry={!showPassword}
                            textContentType="newPassword"
                            leftAccessory={<Lock size={18} color="#94A3B8" style={{ marginRight: 10 }} />}
                            rightAccessory={
                                <Pressable style={({ pressed }) => [{ paddingLeft: 8 }, pressed && { opacity: 0.7 }]} onPress={() => setShowPassword(!showPassword)} hitSlop={12}>
                                    {showPassword ? <Eye size={18} color="#6366F1" /> : <EyeOff size={18} color="#94A3B8" />}
                                </Pressable>
                            }
                        />
                    </View>

                    {/* Requirements */}
                    <View style={styles.reqWrap}>
                        <Text style={[styles.reqItem, newPassword.length >= 8 && styles.reqMet]}>
                            {newPassword.length >= 8 ? '✓' : '○'} At least 8 characters
                        </Text>
                        <Text style={[styles.reqItem, /[A-Z]/.test(newPassword) && styles.reqMet]}>
                            {/[A-Z]/.test(newPassword) ? '✓' : '○'} One uppercase letter
                        </Text>
                        <Text style={[styles.reqItem, /[0-9]/.test(newPassword) && styles.reqMet]}>
                            {/[0-9]/.test(newPassword) ? '✓' : '○'} One number
                        </Text>
                    </View>

                    <View style={styles.fieldGroup}>
                        <SmartInput
                            label="Confirm Password"
                            placeholder="Confirm new password"
                            value={confirmPassword}
                            onChangeText={(v) => { setConfirmPassword(v); if (error) setError(''); }}
                            secureTextEntry={!showConfirm}
                            textContentType="newPassword"
                            leftAccessory={<Lock size={18} color="#94A3B8" style={{ marginRight: 10 }} />}
                            rightAccessory={
                                <Pressable style={({ pressed }) => [{ paddingLeft: 8 }, pressed && { opacity: 0.7 }]} onPress={() => setShowConfirm(!showConfirm)} hitSlop={12}>
                                    {showConfirm ? <Eye size={18} color="#6366F1" /> : <EyeOff size={18} color="#94A3B8" />}
                                </Pressable>
                            }
                        />
                    </View>

                    <Pressable
                        style={({ pressed }) => [styles.primaryBtn, loading && { opacity: 0.7 }, pressed && styles.pressed]}
                        onPress={handleResetPassword}
                        disabled={loading}
                    >
                        <LinearGradient colors={['#6366F1', '#4338CA']} style={styles.primaryBtnGradient}>
                            {loading ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <>
                                    <Text style={styles.primaryBtnText}>Update Password</Text>
                                    <ChevronRight size={20} color="#FFFFFF" />
                                </>
                            )}
                        </LinearGradient>
                    </Pressable>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 28,
        paddingTop: Platform.OS === 'ios' ? 72 : 52,
        paddingBottom: 48,
    },
    welcomeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: colors.primarySoft,
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
        backgroundColor: colors.primary,
    },
    welcomeBadgeText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.primary,
    },
    titleLine1: {
        fontSize: 30,
        fontWeight: '800',
        color: colors.textPrimary,
        lineHeight: 36,
    },
    titleAppName: {
        fontSize: 34,
        fontWeight: '800',
        color: colors.primary,
        lineHeight: 42,
        marginBottom: 8,
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textSecondary,
        marginBottom: 30,
        lineHeight: 20,
    },
    glassFormCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.82)',
        borderRadius: 28,
        padding: 20,
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.65)',
        ...shadows.md,
        marginBottom: 24,
    },
    errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.dangerLight, borderRadius: 20, padding: 16, marginBottom: 20 },
    errorMsg: { color: '#991B1B', fontSize: 13, flex: 1, fontWeight: '600' },
    fieldGroup: { marginBottom: 20 },
    reqWrap: { marginTop: -8, marginBottom: 20, marginLeft: 4, gap: 6 },
    reqItem: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
    reqMet: { color: colors.success, fontWeight: '700' },
    primaryBtn: { borderRadius: 100, height: 64, overflow: 'hidden', ...shadows.hero, marginTop: 12 },
    primaryBtnGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    primaryBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
    successCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    successCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.successLight, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    successTitle: { fontSize: 28, fontWeight: '800', color: '#166534', marginBottom: 12, letterSpacing: -0.5 },
    successSub: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: 40 },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
