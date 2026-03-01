import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    StatusBar, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, Radius, Shadows } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

const ROLE_LABELS = {
    org_admin: 'Org Admin',
    care_manager: 'Care Manager',
    caretaker: 'Caretaker',
};

export default function CreateUserScreen({ navigation, route }) {
    const allowedRole = route?.params?.allowedRole || 'org_admin';
    const roleLabel = ROLE_LABELS[allowedRole] || allowedRole;
    const { createUser } = useAuth();

    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});

    const validate = () => {
        const errs = {};
        if (!fullName.trim()) errs.fullName = 'Full name is required';
        if (!email.trim()) errs.email = 'Email is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email address';
        return errs;
    };

    const handleSubmit = async () => {
        const errs = validate();
        setErrors(errs);
        if (Object.keys(errs).length > 0) return;

        setLoading(true);
        try {
            const result = await createUser(email.trim().toLowerCase(), fullName.trim(), allowedRole);
            Alert.alert(
                'Account Created',
                result?.message || `${roleLabel} account created. A temporary password has been emailed to ${email}.`,
                [{ text: 'OK', onPress: () => navigation.goBack() }]
            );
        } catch (error) {
            const msg = error?.message || error?.error || 'Failed to create user';
            Alert.alert('Error', msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={s.container}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <LinearGradient colors={Colors.gradient} style={s.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <SafeAreaView edges={['top']}>
                    <View style={s.headerRow}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                            <Text style={s.backText}>←</Text>
                        </TouchableOpacity>
                        <Text style={s.headerTitle}>Create {roleLabel}</Text>
                        <View style={{ width: 40 }} />
                    </View>
                </SafeAreaView>
            </LinearGradient>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={s.body}>
                    {/* Info banner */}
                    <View style={s.infoBanner}>
                        <Text style={s.infoIcon}>📧</Text>
                        <Text style={s.infoText}>A temporary password will be emailed to the new user. They must change it on first login.</Text>
                    </View>

                    {/* Full Name */}
                    <Text style={s.label}>Full Name</Text>
                    <View style={s.inputRow}>
                        <TextInput
                            style={s.input}
                            value={fullName}
                            onChangeText={(t) => { setFullName(t); setErrors((e) => ({ ...e, fullName: undefined })); }}
                            placeholder="e.g. Dr. Jane Smith"
                            placeholderTextColor={Colors.textMuted}
                            autoCapitalize="words"
                            returnKeyType="next"
                        />
                    </View>
                    {errors.fullName && <Text style={s.errorText}>{errors.fullName}</Text>}

                    {/* Email */}
                    <Text style={s.label}>Email Address</Text>
                    <View style={s.inputRow}>
                        <TextInput
                            style={s.input}
                            value={email}
                            onChangeText={(t) => { setEmail(t); setErrors((e) => ({ ...e, email: undefined })); }}
                            placeholder="e.g. jane@example.com"
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="done"
                        />
                    </View>
                    {errors.email && <Text style={s.errorText}>{errors.email}</Text>}

                    {/* Submit */}
                    <TouchableOpacity
                        style={[s.submitBtn, loading && s.submitBtnDisabled]}
                        onPress={handleSubmit}
                        disabled={loading}
                        activeOpacity={0.85}
                    >
                        <LinearGradient colors={Colors.gradient} style={s.submitGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={s.submitText}>Create {roleLabel}</Text>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    // Header
    header: { paddingBottom: Spacing.lg },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
    backBtn: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    backText: { fontSize: 20, color: '#fff', fontWeight: '700' },
    headerTitle: { ...Typography.h3, color: '#fff' },
    // Body
    body: { flex: 1, paddingHorizontal: Spacing.lg, marginTop: Spacing.md },
    // Info
    infoBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.infoLight, borderWidth: 1, borderColor: Colors.info + '30', borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg, gap: Spacing.sm },
    infoIcon: { fontSize: 20 },
    infoText: { ...Typography.body, color: '#1E40AF', flex: 1 },
    // Form
    label: { ...Typography.label, color: Colors.textSecondary, marginTop: Spacing.lg, marginBottom: Spacing.xs, textTransform: 'uppercase' },
    inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, ...Shadows.sm },
    input: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: 14, ...Typography.body, color: Colors.textPrimary },
    errorText: { ...Typography.caption, color: Colors.error, marginTop: Spacing.xs },
    // Submit
    submitBtn: { marginTop: Spacing.xl, borderRadius: Radius.md, overflow: 'hidden', ...Shadows.md },
    submitBtnDisabled: { opacity: 0.7 },
    submitGradient: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
    submitText: { ...Typography.button, color: '#fff' },
});
