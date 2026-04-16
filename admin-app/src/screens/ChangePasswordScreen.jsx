import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, StatusBar, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Animated
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { Theme } from '../theme/theme';
import { Shadows } from '../theme/colors';

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
    
    // Smooth Entry Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true })
        ]).start();
    }, []);

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
        } catch (error) {
            const msg = error?.message || error?.error || 'Failed to change password';
            Alert.alert('Authentication Error', msg);
        } finally {
            setLoading(false);
        }
    };

    const renderInput = (label, value, setValue, errorKey, secureTextEntry, toggleSecure, nodeRef, onSubmit, placeholder) => (
        <View style={s.inputContainer}>
            <Text style={s.inputLabel}>{label}</Text>
            <View style={[s.inputBox, errors[errorKey] && s.inputBoxError]}>
                <View style={s.inputIcon}>
                    <Feather name="lock" size={18} color={errors[errorKey] ? "#EF4444" : "#94A3B8"} />
                </View>
                <TextInput
                    ref={nodeRef}
                    style={s.input}
                    secureTextEntry={secureTextEntry}
                    value={value}
                    onChangeText={(t) => { setValue(t); setErrors((e) => ({ ...e, [errorKey]: undefined })); }}
                    placeholder={placeholder}
                    placeholderTextColor="#CBD5E1"
                    returnKeyType={onSubmit ? "next" : "done"}
                    onSubmitEditing={onSubmit}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                <TouchableOpacity style={s.eyeBtn} onPress={toggleSecure} activeOpacity={0.7}>
                    <Feather name={secureTextEntry ? "eye-off" : "eye"} size={20} color="#94A3B8" />
                </TouchableOpacity>
            </View>
            {errors[errorKey] && <Text style={s.errorText}>{errors[errorKey]}</Text>}
        </View>
    );

    return (
        <View style={s.container}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

            <SafeAreaView edges={['top']} style={{ flex: 1 }}>
                
                {/* ── Premium Header ── */}
                <View style={s.headerRow}>
                    {!forced ? (
                        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} activeOpacity={0.7}>
                            <Feather name="arrow-left" size={20} color="#0F172A" />
                        </TouchableOpacity>
                    ) : <View style={s.headerSpacer} />}
                    <Text style={s.headerBrandTitle}>SECURITY CENTER</Text>
                    <View style={s.headerSpacer} />
                </View>

                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Animated.ScrollView 
                        style={s.body} 
                        contentContainerStyle={{ paddingBottom: 80, paddingHorizontal: 20 }} 
                        showsVerticalScrollIndicator={false} 
                        keyboardShouldPersistTaps="handled"
                        bounces={true}
                    >
                        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                            
                            {/* ── Centerpiece Hero Graphic ── */}
                            <View style={s.heroGraphic}>
                                <View style={s.heroIconRing}>
                                    <View style={s.heroIconCore}>
                                        <Feather name="shield" size={40} color="#4F46E5" />
                                    </View>
                                    <View style={s.heroCheckBadge}>
                                        <Feather name="check" size={12} color="#FFFFFF" />
                                    </View>
                                </View>
                                <Text style={s.heroTitle}>{forced ? 'Force Password Update' : 'Update Credentials'}</Text>
                                <Text style={s.heroSubtitle}>
                                    {forced 
                                        ? 'For security reasons, your temporary passcode must be changed immediately.'
                                        : 'Update your localized encryption strings to keep your CareConnect account fortified.'}
                                </Text>
                            </View>

                            {/* ── Polished Form Card ── */}
                            <View style={s.formCard}>
                                {renderInput('Current Passcode', currentPassword, setCurrentPassword, 'current', !showCurrent, () => setShowCurrent(!showCurrent), null, () => newRef.current?.focus(), 'Enter current password')}

                                <View style={s.formDivider} />

                                {renderInput('New Passcode', newPassword, setNewPassword, 'new', !showNew, () => setShowNew(!showNew), newRef, () => confirmRef.current?.focus(), 'Create new password')}

                                {/* Beautiful Rules Validation */}
                                <View style={s.rulesBox}>
                                    <Text style={s.rulesTitle}>Password must contain:</Text>
                                    {PASSWORD_RULES.map((rule) => {
                                        const pass = newPassword.length > 0 && rule.test(newPassword);
                                        return (
                                            <View key={rule.label} style={s.ruleRow}>
                                                {pass ? (
                                                    <View style={s.ruleCheckPass}>
                                                        <Feather name="check" size={10} color="#FFFFFF" />
                                                    </View>
                                                ) : (
                                                    <View style={s.ruleCheckWait}>
                                                        <View style={s.ruleCheckDot} />
                                                    </View>
                                                )}
                                                <Text style={[s.ruleLabel, pass && s.ruleLabelPass]}>{rule.label}</Text>
                                            </View>
                                        );
                                    })}
                                </View>

                                {renderInput('Confirm New Passcode', confirmPassword, setConfirmPassword, 'confirm', !showConfirm, () => setShowConfirm(!showConfirm), confirmRef, null, 'Re-enter new password')}
                            </View>

                            {/* ── Submit Action ── */}
                            <TouchableOpacity
                                onPress={handleSubmit}
                                disabled={loading}
                                activeOpacity={0.8}
                                style={s.submitBtnContainer}
                            >
                                <LinearGradient 
                                    colors={['#0F172A', '#1E293B']} 
                                    style={[s.submitBtn, loading && s.submitBtnDisabled]}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#FFFFFF" size="small" />
                                    ) : (
                                        <>
                                            <Feather name="lock" size={16} color="#FFFFFF" />
                                            <Text style={s.submitText}>Save & Verify</Text>
                                        </>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>

                            <Text style={s.hintText}>
                                A successful update will securely sever all active connection sockets, requiring you to authenticate again.
                            </Text>

                        </Animated.View>
                    </Animated.ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F7F9' },
    
    // Header
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
    backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.sm },
    headerSpacer: { width: 44 },
    headerBrandTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A', letterSpacing: 1, textTransform: 'uppercase' },

    body: { flex: 1 },

    // Hero Graphic
    heroGraphic: { alignItems: 'center', marginTop: 24, marginBottom: 32 },
    heroIconRing: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#E0E7FF' },
    heroIconCore: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', ...Shadows.md },
    heroCheckBadge: { position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
    heroTitle: { fontSize: 28, fontWeight: '900', color: '#0F172A', marginBottom: 12, textAlign: 'center', letterSpacing: -1 },
    heroSubtitle: { fontSize: 14, fontWeight: '500', color: '#64748B', textAlign: 'center', lineHeight: 22, paddingHorizontal: 30 },

    // Form Card
    formCard: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 24, borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.lg, shadowColor: '#64748B', shadowOpacity: 0.1 },
    formDivider: { height: 1, backgroundColor: '#F8FAFC', marginBottom: 20, marginTop: 4, marginHorizontal: -20 },

    inputContainer: { marginBottom: 20 },
    inputLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 4 },
    inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, height: 60 },
    inputBoxError: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
    inputIcon: { width: 50, justifyContent: 'center', alignItems: 'center' },
    input: { flex: 1, fontSize: 16, fontWeight: '700', color: '#0F172A', height: '100%' },
    eyeBtn: { paddingHorizontal: 16, height: '100%', justifyContent: 'center', alignItems: 'center' },
    errorText: { fontSize: 12, fontWeight: '700', color: '#EF4444', marginTop: 8, marginLeft: 4 },

    // Rules
    rulesBox: { flexDirection: 'column', gap: 10, marginBottom: 24, backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' },
    rulesTitle: { fontSize: 12, fontWeight: '800', color: '#64748B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    ruleCheckPass: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
    ruleCheckWait: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center' },
    ruleCheckDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
    ruleLabel: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
    ruleLabelPass: { color: '#0F172A', fontWeight: '800' },

    // Submit Action
    submitBtnContainer: { marginTop: 20, ...Shadows.lg, shadowColor: '#0F172A', shadowOpacity: 0.2 },
    submitBtn: { height: 64, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
    submitBtnDisabled: { opacity: 0.8 },
    submitText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 1 },

    hintText: { fontSize: 12, fontWeight: '600', color: '#94A3B8', textAlign: 'center', marginTop: 24, paddingHorizontal: 30, lineHeight: 20 },
});
