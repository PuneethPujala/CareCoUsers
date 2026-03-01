import React, { useState, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, StatusBar, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, Radius, Shadows } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

const PASSWORD_RULES = [
    { label: 'At least 8 characters', test: (p) => p.length >= 8 },
    { label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
    { label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
    { label: 'One number', test: (p) => /[0-9]/.test(p) },
];

export default function ChangePasswordScreen({ navigation, route }) {
    const forced = route?.params?.forced ?? false;
    const { changePassword } = useAuth();

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});

    const newRef = useRef(null);
    const confirmRef = useRef(null);

    const validate = () => {
        const errs = {};
        if (!currentPassword) errs.current = 'Current password is required';
        PASSWORD_RULES.forEach((rule) => {
            if (!rule.test(newPassword)) errs.new = errs.new || 'Password does not meet all requirements';
        });
        if (!newPassword) errs.new = 'New password is required';
        if (newPassword && currentPassword && newPassword === currentPassword) errs.new = 'Must be different from current password';
        if (!confirmPassword) errs.confirm = 'Please confirm your new password';
        else if (confirmPassword !== newPassword) errs.confirm = 'Passwords do not match';
        return errs;
    };

    const handleSubmit = async () => {
        const errs = validate();
        setErrors(errs);
        if (Object.keys(errs).length > 0) return;

        setLoading(true);
        try {
            await changePassword(currentPassword, newPassword);
            // changePassword calls signOut internally — user will be redirected to login
        } catch (error) {
            const msg = error?.message || error?.error || 'Failed to change password';
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
                        {!forced && (
                            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                                <Text style={s.backText}>←</Text>
                            </TouchableOpacity>
                        )}
                        <Text style={[s.headerTitle, forced && { flex: 1, textAlign: 'center' }]}>Change Password</Text>
                        {!forced && <View style={{ width: 40 }} />}
                    </View>
                </SafeAreaView>
            </LinearGradient>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">

                    {/* Forced warning */}
                    {forced && (
                        <View style={s.warningBanner}>
                            <Text style={s.warningIcon}>⚠️</Text>
                            <Text style={s.warningText}>
                                You must change your temporary password before you can access the app.
                            </Text>
                        </View>
                    )}

                    {/* Current Password */}
                    <Text style={s.label}>Current Password</Text>
                    <View style={s.inputRow}>
                        <TextInput
                            style={s.input}
                            secureTextEntry={!showCurrent}
                            value={currentPassword}
                            onChangeText={(t) => { setCurrentPassword(t); setErrors((e) => ({ ...e, current: undefined })); }}
                            placeholder="Enter current password"
                            placeholderTextColor={Colors.textMuted}
                            returnKeyType="next"
                            onSubmitEditing={() => newRef.current?.focus()}
                        />
                        <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} style={s.eyeBtn}>
                            <Text style={s.eyeIcon}>{showCurrent ? '🙈' : '👁️'}</Text>
                        </TouchableOpacity>
                    </View>
                    {errors.current && <Text style={s.errorText}>{errors.current}</Text>}

                    {/* New Password */}
                    <Text style={s.label}>New Password</Text>
                    <View style={s.inputRow}>
                        <TextInput
                            ref={newRef}
                            style={s.input}
                            secureTextEntry={!showNew}
                            value={newPassword}
                            onChangeText={(t) => { setNewPassword(t); setErrors((e) => ({ ...e, new: undefined })); }}
                            placeholder="Enter new password"
                            placeholderTextColor={Colors.textMuted}
                            returnKeyType="next"
                            onSubmitEditing={() => confirmRef.current?.focus()}
                        />
                        <TouchableOpacity onPress={() => setShowNew(!showNew)} style={s.eyeBtn}>
                            <Text style={s.eyeIcon}>{showNew ? '🙈' : '👁️'}</Text>
                        </TouchableOpacity>
                    </View>
                    {errors.new && <Text style={s.errorText}>{errors.new}</Text>}

                    {/* Password rules */}
                    <View style={s.rulesBox}>
                        {PASSWORD_RULES.map((rule) => {
                            const pass = newPassword.length > 0 && rule.test(newPassword);
                            return (
                                <View key={rule.label} style={s.ruleRow}>
                                    <Text style={[s.ruleIcon, pass && s.rulePass]}>{pass ? '✓' : '○'}</Text>
                                    <Text style={[s.ruleLabel, pass && s.ruleLabelPass]}>{rule.label}</Text>
                                </View>
                            );
                        })}
                    </View>

                    {/* Confirm Password */}
                    <Text style={s.label}>Confirm New Password</Text>
                    <View style={s.inputRow}>
                        <TextInput
                            ref={confirmRef}
                            style={s.input}
                            secureTextEntry={!showConfirm}
                            value={confirmPassword}
                            onChangeText={(t) => { setConfirmPassword(t); setErrors((e) => ({ ...e, confirm: undefined })); }}
                            placeholder="Re-enter new password"
                            placeholderTextColor={Colors.textMuted}
                            returnKeyType="done"
                        />
                        <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={s.eyeBtn}>
                            <Text style={s.eyeIcon}>{showConfirm ? '🙈' : '👁️'}</Text>
                        </TouchableOpacity>
                    </View>
                    {errors.confirm && <Text style={s.errorText}>{errors.confirm}</Text>}

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
                                <Text style={s.submitText}>Change Password</Text>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>

                    <Text style={s.hint}>You will be logged out after changing your password.</Text>
                </ScrollView>
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
    // Warning
    warningBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.warningLight, borderWidth: 1, borderColor: Colors.warning + '40', borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg, gap: Spacing.sm },
    warningIcon: { fontSize: 20 },
    warningText: { ...Typography.body, color: '#92400E', flex: 1 },
    // Form
    label: { ...Typography.label, color: Colors.textSecondary, marginTop: Spacing.lg, marginBottom: Spacing.xs, textTransform: 'uppercase' },
    inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, ...Shadows.sm },
    input: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: 14, ...Typography.body, color: Colors.textPrimary },
    eyeBtn: { paddingHorizontal: Spacing.md, paddingVertical: 14 },
    eyeIcon: { fontSize: 18 },
    errorText: { ...Typography.caption, color: Colors.error, marginTop: Spacing.xs },
    // Rules
    rulesBox: { backgroundColor: Colors.surfaceAlt, borderRadius: Radius.sm, padding: Spacing.md, marginTop: Spacing.sm, gap: 6 },
    ruleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    ruleIcon: { fontSize: 14, color: Colors.textMuted, width: 18, textAlign: 'center' },
    rulePass: { color: Colors.success },
    ruleLabel: { ...Typography.caption, color: Colors.textMuted },
    ruleLabelPass: { color: Colors.success },
    // Submit
    submitBtn: { marginTop: Spacing.xl, borderRadius: Radius.md, overflow: 'hidden', ...Shadows.md },
    submitBtnDisabled: { opacity: 0.7 },
    submitGradient: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
    submitText: { ...Typography.button, color: '#fff' },
    // Hint
    hint: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.md },
});
