import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, StyleSheet, ActivityIndicator, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, Radius, Shadows } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import PremiumInput from '../components/common/PremiumInput';

const ROLES = [
    { id: 'super_admin', label: 'Super Admin', icon: '🛡️' },
    { id: 'org_admin', label: 'Org Admin', icon: '🏥' },
    { id: 'care_manager', label: 'Care Manager', icon: '📋' },
    { id: 'caller', label: 'Caller', icon: '📞' },
    { id: 'mentor', label: 'Patient Mentor', icon: '👥' },
    { id: 'patient', label: 'Patient', icon: '❤️' },
];

function RoleChip({ item, selected, onPress }) {
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}
            style={[s.roleChip, selected && s.roleChipActive]}>
            <Text style={s.roleIcon}>{item.icon}</Text>
            <Text style={[s.roleLabel, selected && s.roleLabelActive]}>{item.label}</Text>
        </TouchableOpacity>
    );
}

export default function SignupScreen({ navigation }) {
    const { signup } = useAuth();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('caller');
    const [loading, setLoading] = useState(false);
    const [showPw, setShowPw] = useState(false);



const handleSignup = async () => {
        if (!name || !email || !password) { Alert.alert('Missing Fields', 'Please fill in all fields.'); return; }
        setLoading(true);
        try { await signup(role, { name, email, password }); }
        catch { Alert.alert('Error', 'Signup failed. Please try again.'); }
        finally { setLoading(false); }
    };

    return (
        <View style={s.container}>
            <StatusBar barStyle="dark-content" />
            <SafeAreaView style={s.safe}>
                <View>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                        <Text style={s.backText}>← Back</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                    <View>
                        <View style={s.logoRow}>
                            <LinearGradient colors={Colors.gradient} style={s.logoMini}>
                                <Text style={{ fontSize: 14, color: '#fff' }}>♥</Text>
                            </LinearGradient>
                            <Text style={s.logoText}>CareConnect</Text>
                        </View>
                        <Text style={s.title}>Create Account</Text>
                        <Text style={s.subtitle}>Join the care community</Text>
                    </View>

                    <View>
                        <Text style={s.sectionLabel}>SELECT YOUR ROLE</Text>
                        <View style={s.roleGrid}>
                            {ROLES.map((r) => (
                                <RoleChip key={r.id} item={r} selected={role === r.id} onPress={() => setRole(r.id)} />
                            ))}
                        </View>
                    </View>

                    <View>
                        <View style={s.formCard}>
                            <PremiumInput label="Full Name" icon="👤" placeholder="John Doe" value={name} onChangeText={setName} />
                            <PremiumInput label="Email Address" icon="✉️" placeholder="name@example.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
                            <PremiumInput label="Password" icon="🔒" placeholder="••••••••" value={password} onChangeText={setPassword} secureTextEntry={!showPw}
                                rightElement={<TouchableOpacity onPress={() => setShowPw(!showPw)}><Text style={{ fontSize: 14 }}>{showPw ? '🙈' : '👁️'}</Text></TouchableOpacity>}
                            />
                            <TouchableOpacity onPress={handleSignup} disabled={loading} activeOpacity={0.9} style={s.submitWrap}>
                                <LinearGradient colors={Colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.submitBtn}>
                                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Create Account</Text>}
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View>
                        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={s.switchRow}>
                            <Text style={s.switchText}>Already have an account? </Text>
                            <Text style={s.switchLink}>Sign In</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.white },
    safe: { flex: 1, paddingHorizontal: Spacing.lg },
    backBtn: { paddingVertical: Spacing.sm },
    backText: { ...Typography.bodyMedium, color: Colors.textSecondary },
    logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    logoMini: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
    logoText: { ...Typography.bodySemibold, fontSize: 16, color: Colors.primary },
    title: { ...Typography.h1, color: Colors.textPrimary, marginTop: Spacing.sm },
    subtitle: { ...Typography.body, color: Colors.textSecondary, marginTop: Spacing.xs, marginBottom: Spacing.lg },
    sectionLabel: { ...Typography.tiny, color: Colors.textMuted, letterSpacing: 1.5, marginBottom: Spacing.sm },
    roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
    roleChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white },
    roleChipActive: { borderColor: Colors.primary, backgroundColor: Colors.surfaceAlt },
    roleIcon: { fontSize: 16 },
    roleLabel: { ...Typography.label, color: Colors.textSecondary },
    roleLabelActive: { color: Colors.primary },
    formCard: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.lg, ...Shadows.card },
    submitWrap: { marginTop: Spacing.md, borderRadius: Radius.lg, overflow: 'hidden', ...Shadows.lg },
    submitBtn: { paddingVertical: 17, alignItems: 'center' },
    submitText: { ...Typography.button, color: '#fff' },
    switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.lg },
    switchText: { ...Typography.body, color: Colors.textSecondary },
    switchLink: { ...Typography.bodySemibold, color: Colors.primary },
});
