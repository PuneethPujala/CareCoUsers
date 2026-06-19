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
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { parseError } from '../../utils/parseError';
import analytics from '../../utils/analytics';
import { colors, radius, spacing, shadows } from '../../theme';

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
            {/* Ambient Background Decorations */}
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

            <View style={styles.scrollContent}>
                
                {/* Welcome/Security badge */}
                <View style={styles.welcomeBadge}>
                    <View style={styles.welcomeDot} />
                    <Text style={styles.welcomeBadgeText}>Security</Text>
                </View>

                {/* Title */}
                <Text style={styles.titleLine1}>Verify</Text>
                <Text style={styles.titleAppName}>Your Email</Text>
                <Text style={styles.subtitle}>We sent a verification link to your inbox</Text>

                <View style={styles.glassFormCard}>
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
                            <Pressable
                                style={({ pressed }) => [styles.resendBtn, pressed && styles.pressed]}
                                onPress={handleResend}
                                disabled={resending}
                            >
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
                    <Pressable
                        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                        onPress={handleGoBack}
                    >
                        <Text style={styles.secondaryBtnText}>Back to Login</Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: {
        flex: 1,
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
        backgroundColor: '#FFFFFF',
        borderRadius: 28,
        padding: 24,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        ...Platform.select({
            ios: shadows.md,
            android: {
                elevation: 0,
            },
        }),
        marginBottom: 24,
    },
    emailBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primarySoft, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 20, marginBottom: 24, borderWidth: 1.5, borderColor: 'rgba(99, 102, 241, 0.2)' },
    emailText: { fontSize: 14, fontWeight: '700', color: colors.primary },
    instructions: { fontSize: 15, color: colors.textSecondary, lineHeight: 24, marginBottom: 28, textAlign: 'center' },
    errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.dangerLight, borderRadius: 20, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#FCA5A5' },
    errorMsg: { color: '#991B1B', fontSize: 13, flex: 1, fontWeight: '600' },
    resendRow: { alignItems: 'center', marginBottom: 28 },
    timerText: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
    resendBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
    resendText: { fontSize: 15, fontWeight: '700', color: colors.primary },
    attemptsText: { fontSize: 12, color: colors.textMuted, marginTop: 8, fontWeight: '500' },
    secondaryBtn: { alignItems: 'center', paddingVertical: 16, borderWidth: 1.5, borderColor: colors.borderLight, borderRadius: 100 },
    secondaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
