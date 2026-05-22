import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { ChevronLeft, Key, User, Mail, Lock, ShieldCheck } from 'lucide-react-native';
import SmartInput from '../../components/ui/SmartInput';
import { apiService } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const C = {
    bg: '#F8FAFC',
    surface: '#FFFFFF',
    primary: '#0EA5E9',
    primaryDark: '#0369A1',
    primarySoft: '#E0F2FE',
    dark: '#0F172A',
    mid: '#475569',
    muted: '#94A3B8',
    danger: '#EF4444',
    border: '#E2E8F0',
};

const FONT = {
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export default function CompanionSignupScreen({ navigation }) {
    const { injectSession } = useAuth();
    
    const [step, setStep] = useState(1);
    
    // Step 1
    const [inviteCode, setInviteCode] = useState('');
    
    // Step 2
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleNext = () => {
        if (!inviteCode || inviteCode.length < 6) {
            setError('Please enter a valid 6-character invite code.');
            return;
        }
        setError('');
        setStep(2);
    };

    const handleJoin = async () => {
        if (!fullName || !email || !password) {
            setError('Please fill in all required fields.');
            return;
        }
        
        setLoading(true);
        setError('');

        try {
            // Note: We bypass the normal auth loop here because it's a specialized endpoint
            const res = await apiService.api.post('/companion/join', {
                invite_code: inviteCode,
                email,
                password,
                fullName,
                phone
            });
            
            if (res.data.session && res.data.profile) {
                await injectSession(res.data.session, res.data.profile);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to join as companion.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.header}>
                <Pressable onPress={() => { step === 2 ? setStep(1) : navigation.goBack() }} style={styles.backBtn} hitSlop={15}>
                    <ChevronLeft color={C.dark} size={24} />
                </Pressable>
                <View style={styles.progressContainer}>
                    <View style={[styles.progressDot, step >= 1 && styles.progressDotActive]} />
                    <View style={[styles.progressDot, step >= 2 && styles.progressDotActive]} />
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <View style={styles.iconWrapper}>
                    <ShieldCheck size={32} color={C.primary} />
                </View>
                
                <Text style={styles.title}>Supporting a Family Member</Text>
                
                {error ? (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : null}

                {step === 1 ? (
                    <View style={styles.stepContainer}>
                        <Text style={styles.subtitle}>Enter the 6-character invite code provided by your family member.</Text>
                        
                        <SmartInput
                            label="INVITE CODE"
                            placeholder="e.g. A1B2C3"
                            value={inviteCode}
                            onChangeText={(v) => setInviteCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                            autoCapitalize="characters"
                            leftAccessory={<Key size={18} color={C.muted} style={{ marginRight: 8 }} />}
                            style={{ marginBottom: 24 }}
                        />

                        <Pressable style={styles.btn} onPress={handleNext}>
                            <Text style={styles.btnText}>Continue</Text>
                        </Pressable>
                    </View>
                ) : (
                    <View style={styles.stepContainer}>
                        <Text style={styles.subtitle}>Create your secure companion account.</Text>

                        <SmartInput
                            label="FULL NAME"
                            placeholder="John Doe"
                            value={fullName}
                            onChangeText={setFullName}
                            leftAccessory={<User size={18} color={C.muted} style={{ marginRight: 8 }} />}
                            style={{ marginBottom: 16 }}
                        />
                        <SmartInput
                            label="EMAIL"
                            placeholder="john@example.com"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            leftAccessory={<Mail size={18} color={C.muted} style={{ marginRight: 8 }} />}
                            style={{ marginBottom: 16 }}
                        />
                        <SmartInput
                            label="PHONE (OPTIONAL)"
                            placeholder="Mobile number"
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                            style={{ marginBottom: 16 }}
                        />
                        <SmartInput
                            label="PASSWORD"
                            placeholder="Create a strong password"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            leftAccessory={<Lock size={18} color={C.muted} style={{ marginRight: 8 }} />}
                            style={{ marginBottom: 24 }}
                        />

                        <Pressable style={[styles.btn, loading && { opacity: 0.7 }]} onPress={handleJoin} disabled={loading}>
                            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Join Care Circle</Text>}
                        </Pressable>
                    </View>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 50 : 20,
        paddingHorizontal: 20,
        paddingBottom: 10,
    },
    backBtn: { width: 40, height: 40, justifyContent: 'center' },
    progressContainer: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6, paddingRight: 40 },
    progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
    progressDotActive: { backgroundColor: C.primary },
    scrollContent: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 40 },
    iconWrapper: {
        width: 64, height: 64, borderRadius: 20, backgroundColor: C.primarySoft,
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    },
    title: { fontSize: 26, ...FONT.heavy, color: C.dark, marginBottom: 8 },
    subtitle: { fontSize: 15, ...FONT.medium, color: C.mid, marginBottom: 32, lineHeight: 22 },
    stepContainer: { width: '100%' },
    btn: {
        height: 54, backgroundColor: C.primary, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: C.primaryDark, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    btnText: { color: '#FFF', fontSize: 16, ...FONT.bold },
    errorBox: { backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, marginBottom: 20 },
    errorText: { color: C.danger, fontSize: 14, ...FONT.medium },
});
