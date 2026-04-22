/**
 * VerifyEmailScreen.jsx — §6 FIX
 *
 * Shows "Check your email" after signup if email confirmation is enabled.
 * Includes resend functionality, timer, and deep-link handling.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Pressable, Platform, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Mail, RefreshCw, CheckCircle2, ChevronRight, AlertCircle } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { parseError } from '../../utils/parseError';
import analytics from '../../utils/analytics';

const RESEND_COOLDOWN = 60; // seconds

export default function VerifyEmailScreen({ navigation, route }) {
    const { user, signOut } = useAuth();
    const email = route?.params?.email || user?.email || '';

    const [resendTimer, setResendTimer] = useState(RESEND_COOLDOWN);
    const [resending, setResending] = useState(false);
    const [error, setError] = useState('');
    const [resendCount, setResendCount] = useState(0);
    const timerRef = useRef(null);

    // Start countdown timer
    useEffect(() => {
        timerRef.current = setInterval(() => {
            setResendTimer((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [resendCount]);

    // AppNavigator handles the stack switch automatically when the user confirms their email 
    // and the AuthContext sets the global 'user' state. Manual navigation here causes collisions.

    const handleResend = async () => {
        if (resendTimer > 0 || resending) return;
        if (resendCount >= 3) {
            setError('Maximum resend attempts reached. Please contact support.');
            return;
        }

        setResending(true);
        setError('');
        try {
            const { error: resendError } = await supabase.auth.resend({
                type: 'signup',
                email: email,
            });
            if (resendError) throw resendError;
            setResendCount((prev) => prev + 1);
            setResendTimer(RESEND_COOLDOWN);
            analytics.track('email_resend', { attempt: resendCount + 1 });
        } catch (err) {
            const { general } = parseError(err);
            setError(general);
        } finally {
            setResending(false);
        }
    };

    const handleGoBack = async () => {
        await signOut();
    };

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#4338CA', '#38BDF8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
                <View style={styles.iconCircle}>
                    <Mail size={48} color="#FFFFFF" strokeWidth={1.5} />
                </View>
                <Text style={styles.heroTitle}>Check Your Email</Text>
                <Text style={styles.heroSubtitle}>We sent a verification link</Text>
            </LinearGradient>

            <View style={styles.formCard}>
                <View style={styles.emailBadge}>
                    <Mail size={16} color="#6366F1" />
                    <Text style={styles.emailText}>{email}</Text>
                </View>

                <Text style={styles.instructions}>
                    We've sent a verification link to your email. Please click it to confirm your account. If you don't see it, check your spam folder.
                </Text>

                {error ? (
                    <View style={styles.errorBox}>
                        <AlertCircle size={16} color="#DC2626" />
                        <Text style={styles.errorMsg}>{error}</Text>
                    </View>
                ) : null}

                {/* Resend */}
                <View style={styles.resendRow}>
                    {resendTimer > 0 ? (
                        <Text style={styles.timerText}>
                            Resend available in {resendTimer}s
                        </Text>
                    ) : (
                        <Pressable style={styles.resendBtn} onPress={handleResend} disabled={resending}>
                            {resending ? (
                                <ActivityIndicator size="small" color="#6366F1" />
                            ) : (
                                <>
                                    <RefreshCw size={16} color="#6366F1" />
                                    <Text style={styles.resendText}>Resend Verification Email</Text>
                                </>
                            )}
                        </Pressable>
                    )}
                    {resendCount > 0 && (
                        <Text style={styles.attemptsText}>{3 - resendCount} resend(s) remaining</Text>
                    )}
                </View>

                {/* Back to Login */}
                <Pressable style={styles.secondaryBtn} onPress={handleGoBack}>
                    <Text style={styles.secondaryBtnText}>Back to Login</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    hero: { height: 280, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, alignItems: 'center', justifyContent: 'center', paddingTop: Platform.OS === 'ios' ? 60 : 40, overflow: 'hidden' },
    iconCircle: { width: 80, height: 80, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
    heroTitle: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
    heroSubtitle: { fontSize: 15, color: 'rgba(255,255,255,0.75)', marginTop: 4, fontWeight: '500' },
    formCard: { marginTop: -30, marginHorizontal: 20, backgroundColor: '#FFFFFF', borderRadius: 36, padding: 28, shadowColor: '#6366F1', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.08, shadowRadius: 32, elevation: 12 },
    emailBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EEF2FF', paddingVertical: 14, paddingHorizontal: 18, borderRadius: 20, marginBottom: 24, borderWidth: 1, borderColor: '#C7D2FE' },
    emailText: { fontSize: 14, fontWeight: '700', color: '#4338CA' },
    instructions: { fontSize: 15, color: '#475569', lineHeight: 24, marginBottom: 28, textAlign: 'center' },
    errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFE4E6', borderRadius: 20, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#FCA5A5' },
    errorMsg: { color: '#991B1B', fontSize: 13, flex: 1, fontWeight: '600' },
    resendRow: { alignItems: 'center', marginBottom: 28 },
    timerText: { fontSize: 14, color: '#94A3B8', fontWeight: '600' },
    resendBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
    resendText: { fontSize: 15, fontWeight: '700', color: '#6366F1' },
    attemptsText: { fontSize: 12, color: '#94A3B8', marginTop: 8, fontWeight: '500' },
    secondaryBtn: { alignItems: 'center', paddingVertical: 16, borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 100 },
    secondaryBtnText: { fontSize: 15, fontWeight: '700', color: '#64748B' },
});
