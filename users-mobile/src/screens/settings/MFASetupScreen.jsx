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

import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, Image, TextInput, TouchableOpacity,
    ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck, Copy, ArrowLeft, CheckCircle2 } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard' ;
import { apiService } from '../../lib/api';

export default function MFASetupScreen({ navigation }) {
    const [step, setStep] = useState('loading'); // loading | qr | verify | done
    const [qrCode, setQrCode] = useState(null);
    const [secretKey, setSecretKey] = useState('');
    const [recoveryCodes, setRecoveryCodes] = useState([]);
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Auto-start setup on mount
    React.useEffect(() => {
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
            Alert.alert('Copied', 'Secret key copied to clipboard');
        } catch {}
    }, [secretKey]);

    const verifyCode = useCallback(async () => {
        if (code.length !== 6) {
            setError('Enter a 6-digit code');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await apiService.auth.mfaVerifySetup(code);
            setRecoveryCodes(res.data.recoveryCodes || []);
            setStep('done');
        } catch (err) {
            setError(err.response?.data?.error || 'Invalid code. Try again.');
        } finally {
            setLoading(false);
        }
    }, [code]);

    const copyRecoveryCodes = useCallback(async () => {
        try {
            await Clipboard.setStringAsync(recoveryCodes.join('\n'));
            Alert.alert('Copied', 'Recovery codes copied to clipboard. Store them safely!');
        } catch {}
    }, [recoveryCodes]);

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                {/* Header */}
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <ArrowLeft color="#94A3B8" size={24} />
                </TouchableOpacity>

                <View style={styles.iconWrap}>
                    <ShieldCheck color="#3B82F6" size={48} />
                </View>
                <Text style={styles.title}>
                    {step === 'done' ? 'MFA Enabled!' : 'Set Up Two-Factor Authentication'}
                </Text>
                <Text style={styles.subtitle}>
                    {step === 'done'
                        ? 'Your account is now protected with TOTP.'
                        : 'Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)'}
                </Text>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                {/* Loading */}
                {step === 'loading' && (
                    <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 40 }} />
                )}

                {/* QR Code Step */}
                {step === 'qr' && qrCode && (
                    <View style={styles.qrSection}>
                        <View style={styles.qrWrapper}>
                            <Image source={{ uri: qrCode }} style={styles.qrImage} />
                        </View>

                        <Text style={styles.label}>Or enter this key manually:</Text>
                        <TouchableOpacity style={styles.secretRow} onPress={copySecret}>
                            <Text style={styles.secretText} numberOfLines={1}>{secretKey}</Text>
                            <Copy color="#3B82F6" size={18} />
                        </TouchableOpacity>

                        <Text style={styles.label}>Enter the 6-digit code from your app:</Text>
                        <TextInput
                            style={styles.input}
                            value={code}
                            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ''))}
                            placeholder="000000"
                            placeholderTextColor="#475569"
                            keyboardType="number-pad"
                            maxLength={6}
                            textAlign="center"
                        />

                        <TouchableOpacity
                            style={[styles.btn, code.length !== 6 && styles.btnDisabled]}
                            onPress={verifyCode}
                            disabled={loading || code.length !== 6}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.btnText}>Verify & Enable</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                )}

                {/* Done Step — Show Recovery Codes */}
                {step === 'done' && (
                    <View style={styles.doneSection}>
                        <CheckCircle2 color="#22C55E" size={48} style={{ alignSelf: 'center', marginBottom: 16 }} />

                        <Text style={styles.warningTitle}>⚠️ Save Your Recovery Codes</Text>
                        <Text style={styles.warningText}>
                            These codes can be used to access your account if you lose your authenticator.
                            Each code can only be used once. Store them in a safe place.
                        </Text>

                        <View style={styles.codesBox}>
                            {recoveryCodes.map((c, i) => (
                                <Text key={i} style={styles.codeItem}>{c}</Text>
                            ))}
                        </View>

                        <TouchableOpacity style={styles.copyBtn} onPress={copyRecoveryCodes}>
                            <Copy color="#3B82F6" size={18} />
                            <Text style={styles.copyBtnText}>Copy All Codes</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.btn}
                            onPress={() => navigation.goBack()}
                        >
                            <Text style={styles.btnText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    scroll: { padding: 24, paddingBottom: 60 },
    backBtn: { marginBottom: 16 },
    iconWrap: { alignItems: 'center', marginBottom: 12 },
    title: { color: '#F8FAFC', fontSize: 22, fontWeight: '700', textAlign: 'center' },
    subtitle: { color: '#94A3B8', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
    error: { color: '#EF4444', fontSize: 14, textAlign: 'center', marginTop: 12, backgroundColor: 'rgba(239,68,68,0.1)', padding: 10, borderRadius: 8 },
    qrSection: { marginTop: 24 },
    qrWrapper: { alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 20 },
    qrImage: { width: 200, height: 200 },
    label: { color: '#CBD5E1', fontSize: 14, marginTop: 16, marginBottom: 8 },
    secretRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderRadius: 10, padding: 14, gap: 10 },
    secretText: { color: '#F1F5F9', fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', flex: 1 },
    input: { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, fontSize: 28, color: '#F8FAFC', fontWeight: '700', letterSpacing: 8, marginTop: 8, borderWidth: 1, borderColor: '#334155' },
    btn: { backgroundColor: '#3B82F6', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20 },
    btnDisabled: { opacity: 0.5 },
    btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    doneSection: { marginTop: 24 },
    warningTitle: { color: '#F59E0B', fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
    warningText: { color: '#94A3B8', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
    codesBox: { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
    codeItem: { color: '#F1F5F9', fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', backgroundColor: '#334155', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
    copyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, padding: 10 },
    copyBtnText: { color: '#3B82F6', fontSize: 14, fontWeight: '600' },
});
