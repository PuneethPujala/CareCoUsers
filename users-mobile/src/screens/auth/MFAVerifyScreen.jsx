/**
 * MFAVerifyScreen.jsx — Login MFA Challenge Screen
 *
 * Shown when login returns `requireMfa: true`.
 * User enters the 6-digit TOTP code or a recovery code
 * to complete authentication.
 *
 * Audit items: 2.1-2.4, 2.8
 */

import React, { useState, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck, ArrowLeft } from 'lucide-react-native';
import { apiService } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function MFAVerifyScreen({ route, navigation }) {
    const { mfaToken, profile: loginProfile } = route.params || {};
    const { completeMfaLogin } = useAuth();

    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [useRecovery, setUseRecovery] = useState(false);
    const inputRef = useRef(null);

    const handleVerify = useCallback(async () => {
        const trimmed = code.trim();
        if (!useRecovery && trimmed.length !== 6) {
            setError('Enter a 6-digit code');
            return;
        }
        if (useRecovery && trimmed.length !== 8) {
            setError('Enter an 8-character recovery code');
            return;
        }

        setLoading(true);
        setError('');
        try {
            const res = await apiService.auth.mfaVerify(mfaToken, trimmed);
            const { session, profile } = res.data;

            // Complete the auth flow
            await completeMfaLogin(session, profile || loginProfile);
        } catch (err) {
            const msg = err.response?.data?.error || 'Verification failed';
            const errCode = err.response?.data?.code;
            if (errCode === 'MFA_TOKEN_EXPIRED') {
                setError('Session expired. Please log in again.');
                // Navigate back to login after a short delay
                setTimeout(() => navigation.replace('Login'), 2000);
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    }, [code, mfaToken, useRecovery, completeMfaLogin, loginProfile, navigation]);

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
            >
                <View style={styles.content}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                        <ArrowLeft color="#94A3B8" size={24} />
                    </TouchableOpacity>

                    <View style={styles.iconWrap}>
                        <View style={styles.iconBg}>
                            <ShieldCheck color="#3B82F6" size={40} />
                        </View>
                    </View>

                    <Text style={styles.title}>Two-Factor Authentication</Text>
                    <Text style={styles.subtitle}>
                        {useRecovery
                            ? 'Enter one of your recovery codes'
                            : 'Enter the 6-digit code from your authenticator app'}
                    </Text>

                    {error ? <Text style={styles.error}>{error}</Text> : null}

                    <TextInput
                        ref={inputRef}
                        style={styles.input}
                        value={code}
                        onChangeText={(t) => {
                            if (useRecovery) {
                                setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                            } else {
                                setCode(t.replace(/[^0-9]/g, ''));
                            }
                            setError('');
                        }}
                        placeholder={useRecovery ? 'ABCD1234' : '000000'}
                        placeholderTextColor="#475569"
                        keyboardType={useRecovery ? 'default' : 'number-pad'}
                        maxLength={useRecovery ? 8 : 6}
                        textAlign="center"
                        autoFocus
                        autoComplete="one-time-code"
                    />

                    <TouchableOpacity
                        style={[styles.btn, loading && styles.btnDisabled]}
                        onPress={handleVerify}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.btnText}>Verify</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.switchBtn}
                        onPress={() => {
                            setUseRecovery(!useRecovery);
                            setCode('');
                            setError('');
                        }}
                    >
                        <Text style={styles.switchText}>
                            {useRecovery
                                ? 'Use authenticator code instead'
                                : 'Use a recovery code'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    flex: { flex: 1 },
    content: { flex: 1, padding: 24, justifyContent: 'center' },
    backBtn: { position: 'absolute', top: 24, left: 24, zIndex: 10 },
    iconWrap: { alignItems: 'center', marginBottom: 20 },
    iconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(59,130,246,0.15)', alignItems: 'center', justifyContent: 'center' },
    title: { color: '#F8FAFC', fontSize: 24, fontWeight: '700', textAlign: 'center' },
    subtitle: { color: '#94A3B8', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20, marginBottom: 24 },
    error: { color: '#EF4444', fontSize: 14, textAlign: 'center', marginBottom: 12, backgroundColor: 'rgba(239,68,68,0.1)', padding: 10, borderRadius: 8 },
    input: { backgroundColor: '#1E293B', borderRadius: 14, padding: 18, fontSize: 28, color: '#F8FAFC', fontWeight: '700', letterSpacing: 8, borderWidth: 1, borderColor: '#334155' },
    btn: { backgroundColor: '#3B82F6', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 20 },
    btnDisabled: { opacity: 0.6 },
    btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    switchBtn: { alignItems: 'center', marginTop: 16, padding: 8 },
    switchText: { color: '#3B82F6', fontSize: 14, fontWeight: '500' },
});
