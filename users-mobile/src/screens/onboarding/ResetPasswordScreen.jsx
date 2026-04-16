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
import { auth } from '../../lib/supabase';
import { parseError } from '../../utils/parseError';
import analytics from '../../utils/analytics';
import { useAuth } from '../../context/AuthContext';
import { isRecoveryExpired } from '../../utils/authUtils';

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

    if (isExpired) {
        return (
            <View style={styles.container}>
                <View style={styles.successCenter}>
                    <View style={[styles.successCircle, { backgroundColor: '#FEF2F2', borderColor: '#FEE2E2' }]}>
                        <AlertCircle size={64} color="#DC2626" strokeWidth={1.5} />
                    </View>
                    <Text style={[styles.successTitle, { color: '#991B1B' }]}>Link Expired</Text>
                    <Text style={styles.successSub}>This password reset link has expired. Please request a new one.</Text>
                    <Pressable style={styles.primaryBtn} onPress={handleGoToLogin}>
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
                <View style={styles.successCenter}>
                    <View style={styles.successCircle}>
                        <CheckCircle2 size={64} color="#22C55E" strokeWidth={1.5} />
                    </View>
                    <Text style={styles.successTitle}>Password Updated!</Text>
                    <Text style={styles.successSub}>Your password has been changed. You can now log in with your new password.</Text>
                    <Pressable style={styles.primaryBtn} onPress={handleGoToLogin}>
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
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
                {/* Hero */}
                <LinearGradient colors={['#4338CA', '#38BDF8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
                    <View style={styles.heroIconWrap}>
                        <ShieldCheck size={48} color="#FFFFFF" strokeWidth={1.5} />
                    </View>
                    <Text style={styles.heroTitle}>Set New Password</Text>
                    <Text style={styles.heroSubtitle}>Create a strong, secure password</Text>
                </LinearGradient>

                {/* Form */}
                <View style={styles.formCard}>
                    {error ? (
                        <View style={styles.errorBox}>
                            <AlertCircle size={16} color="#DC2626" />
                            <Text style={styles.errorMsg}>{error}</Text>
                        </View>
                    ) : null}

                    <View style={styles.fieldGroup}>
                        <Text style={styles.label}>New Password</Text>
                        <View style={styles.inputWrap}>
                            <Lock size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                            <TextInput
                                style={styles.textInput}
                                placeholder="Enter new password"
                                placeholderTextColor="#94A3B8"
                                value={newPassword}
                                onChangeText={(v) => { setNewPassword(v); if (error) setError(''); }}
                                secureTextEntry={!showPassword}
                                textContentType="newPassword"
                            />
                            <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={12}>
                                {showPassword ? <Eye size={18} color="#6366F1" /> : <EyeOff size={18} color="#94A3B8" />}
                            </Pressable>
                        </View>
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
                        <Text style={styles.label}>Confirm Password</Text>
                        <View style={styles.inputWrap}>
                            <Lock size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                            <TextInput
                                style={styles.textInput}
                                placeholder="Confirm new password"
                                placeholderTextColor="#94A3B8"
                                value={confirmPassword}
                                onChangeText={(v) => { setConfirmPassword(v); if (error) setError(''); }}
                                secureTextEntry={!showConfirm}
                                textContentType="newPassword"
                            />
                            <Pressable onPress={() => setShowConfirm(!showConfirm)} hitSlop={12}>
                                {showConfirm ? <Eye size={18} color="#6366F1" /> : <EyeOff size={18} color="#94A3B8" />}
                            </Pressable>
                        </View>
                    </View>

                    <Pressable style={[styles.primaryBtn, loading && { opacity: 0.7 }]} onPress={handleResetPassword} disabled={loading}>
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
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    hero: { height: 280, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, alignItems: 'center', justifyContent: 'center', paddingTop: Platform.OS === 'ios' ? 60 : 40, overflow: 'hidden' },
    heroIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
    heroTitle: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
    heroSubtitle: { fontSize: 15, color: 'rgba(255,255,255,0.75)', marginTop: 4, fontWeight: '500' },
    formCard: { marginTop: -30, marginHorizontal: 20, backgroundColor: '#FFFFFF', borderRadius: 36, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 30, shadowColor: '#6366F1', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.08, shadowRadius: 32, elevation: 12 },
    errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFE4E6', borderRadius: 20, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#FCA5A5' },
    errorMsg: { color: '#991B1B', fontSize: 13, flex: 1, fontWeight: '600' },
    fieldGroup: { marginBottom: 20 },
    label: { fontSize: 13, fontWeight: '700', color: '#94A3B8', marginBottom: 10, marginLeft: 2, letterSpacing: 0.5 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#F1F5F9', borderRadius: 20, height: 64, paddingHorizontal: 16 },
    textInput: { flex: 1, fontSize: 16, color: '#0F172A', fontWeight: '600' },
    reqWrap: { marginTop: -8, marginBottom: 20, marginLeft: 4, gap: 6 },
    reqItem: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
    reqMet: { color: '#22C55E', fontWeight: '700' },
    primaryBtn: { borderRadius: 100, height: 64, overflow: 'hidden', shadowColor: '#6366F1', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10, marginTop: 12 },
    primaryBtnGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    primaryBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
    successCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    successCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center', marginBottom: 24, borderWidth: 1, borderColor: '#DCFCE7' },
    successTitle: { fontSize: 28, fontWeight: '800', color: '#166534', marginBottom: 12, letterSpacing: -0.5 },
    successSub: { fontSize: 16, color: '#475569', textAlign: 'center', lineHeight: 24, marginBottom: 40 },
});
