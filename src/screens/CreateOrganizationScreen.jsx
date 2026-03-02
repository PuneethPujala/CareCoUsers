import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    StatusBar, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
    ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, Radius, Shadows } from '../theme/colors';
import { apiService } from '../lib/api';

const ORG_TYPES = [
    { value: 'clinic', label: 'Clinic', icon: '🏥' },
    { value: 'hospital', label: 'Hospital', icon: '🏨' },
    { value: 'home_health', label: 'Home Health', icon: '🏠' },
    { value: 'telehealth', label: 'Telehealth', icon: '💻' },
];

const PLANS = [
    { value: 'starter', label: 'Starter', desc: 'Up to 100 patients', icon: '🌱' },
    { value: 'professional', label: 'Professional', desc: 'Up to 500 patients', icon: '🚀' },
    { value: 'enterprise', label: 'Enterprise', desc: 'Unlimited patients', icon: '🏢' },
];

export default function CreateOrganizationScreen({ navigation }) {
    const [name, setName] = useState('');
    const [type, setType] = useState('');
    const [plan, setPlan] = useState('starter');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});

    const validate = () => {
        const errs = {};
        if (!name.trim()) errs.name = 'Organization name is required';
        if (!type) errs.type = 'Please select a type';
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email';
        return errs;
    };

    const handleSubmit = async () => {
        const errs = validate();
        setErrors(errs);
        if (Object.keys(errs).length > 0) return;

        setLoading(true);
        try {
            const payload = {
                name: name.trim(),
                type,
                subscriptionPlan: plan,
            };
            if (email.trim()) payload.email = email.trim().toLowerCase();
            if (phone.trim()) payload.phone = phone.trim();

            const result = await apiService.organizations.create(payload);
            Alert.alert(
                'Organization Created',
                result.data?.message || `"${name}" has been created successfully.`,
                [{ text: 'OK', onPress: () => navigation.goBack() }]
            );
        } catch (error) {
            const msg = error?.response?.data?.error || error?.message || 'Failed to create organization';
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
                        <Text style={s.headerTitle}>Create Organization</Text>
                        <View style={{ width: 40 }} />
                    </View>
                </SafeAreaView>
            </LinearGradient>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

                    {/* Organization Name */}
                    <Text style={s.label}>Organization Name</Text>
                    <View style={s.inputRow}>
                        <TextInput
                            style={s.input}
                            value={name}
                            onChangeText={(t) => { setName(t); setErrors(e => ({ ...e, name: undefined })); }}
                            placeholder="e.g. City General Hospital"
                            placeholderTextColor={Colors.textMuted}
                            autoCapitalize="words"
                        />
                    </View>
                    {errors.name && <Text style={s.errorText}>{errors.name}</Text>}

                    {/* Organization Type */}
                    <Text style={s.label}>Type</Text>
                    <View style={s.chipGrid}>
                        {ORG_TYPES.map((t) => {
                            const isSelected = type === t.value;
                            return (
                                <TouchableOpacity
                                    key={t.value}
                                    style={[s.chip, isSelected && s.chipActive]}
                                    onPress={() => { setType(t.value); setErrors(e => ({ ...e, type: undefined })); }}
                                    activeOpacity={0.7}
                                >
                                    <Text style={s.chipIcon}>{t.icon}</Text>
                                    <Text style={[s.chipLabel, isSelected && s.chipLabelActive]}>{t.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    {errors.type && <Text style={s.errorText}>{errors.type}</Text>}

                    {/* Subscription Plan */}
                    <Text style={s.label}>Subscription Plan</Text>
                    <View style={s.planList}>
                        {PLANS.map((p) => {
                            const isSelected = plan === p.value;
                            return (
                                <TouchableOpacity
                                    key={p.value}
                                    style={[s.planCard, isSelected && s.planCardActive]}
                                    onPress={() => setPlan(p.value)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={s.planIcon}>{p.icon}</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[s.planName, isSelected && s.planNameActive]}>{p.label}</Text>
                                        <Text style={s.planDesc}>{p.desc}</Text>
                                    </View>
                                    {isSelected && <Text style={{ fontSize: 16, color: Colors.primary }}>✓</Text>}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Contact Email (optional) */}
                    <Text style={s.label}>Contact Email (optional)</Text>
                    <View style={s.inputRow}>
                        <TextInput
                            style={s.input}
                            value={email}
                            onChangeText={(t) => { setEmail(t); setErrors(e => ({ ...e, email: undefined })); }}
                            placeholder="e.g. admin@hospital.com"
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                    </View>
                    {errors.email && <Text style={s.errorText}>{errors.email}</Text>}

                    {/* Phone (optional) */}
                    <Text style={s.label}>Phone (optional)</Text>
                    <View style={s.inputRow}>
                        <TextInput
                            style={s.input}
                            value={phone}
                            onChangeText={setPhone}
                            placeholder="e.g. +1234567890"
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="phone-pad"
                        />
                    </View>

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
                                <Text style={s.submitText}>Create Organization</Text>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: { paddingBottom: Spacing.lg },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
    backBtn: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    backText: { fontSize: 20, color: '#fff', fontWeight: '700' },
    headerTitle: { ...Typography.h3, color: '#fff' },
    body: { flex: 1, paddingHorizontal: Spacing.lg, marginTop: Spacing.md },
    // Form
    label: { ...Typography.label, color: Colors.textSecondary, marginTop: Spacing.lg, marginBottom: Spacing.xs, textTransform: 'uppercase' },
    inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, ...Shadows.sm },
    input: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: 14, ...Typography.body, color: Colors.textPrimary },
    errorText: { ...Typography.caption, color: Colors.error, marginTop: Spacing.xs },
    // Type chips
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
        backgroundColor: Colors.white, borderRadius: Radius.md,
        borderWidth: 1.5, borderColor: Colors.border,
        paddingHorizontal: Spacing.md, paddingVertical: 10,
        ...Shadows.sm,
    },
    chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '08' },
    chipIcon: { fontSize: 18 },
    chipLabel: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 13 },
    chipLabelActive: { color: Colors.primary },
    // Plan cards
    planList: { gap: Spacing.sm },
    planCard: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        backgroundColor: Colors.white, borderRadius: Radius.md,
        borderWidth: 1.5, borderColor: Colors.border,
        paddingHorizontal: Spacing.md, paddingVertical: 12,
        ...Shadows.sm,
    },
    planCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '08' },
    planIcon: { fontSize: 22 },
    planName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    planNameActive: { color: Colors.primary },
    planDesc: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
    // Submit
    submitBtn: { marginTop: Spacing.xl, borderRadius: Radius.md, overflow: 'hidden', ...Shadows.md },
    submitBtnDisabled: { opacity: 0.7 },
    submitGradient: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
    submitText: { ...Typography.button, color: '#fff' },
});
