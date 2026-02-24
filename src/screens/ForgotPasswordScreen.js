import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, ActivityIndicator, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, Radius, Shadows } from '../theme/colors';
import PremiumInput from '../components/common/PremiumInput';
import { Phone, Lock, Key, Shield, ArrowLeft } from 'lucide-react-native';

export default function ForgotPasswordScreen({ navigation }) {
    const [mobileNumber, setMobileNumber] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showOtpSection, setShowOtpSection] = useState(false);
    const [showPasswordSection, setShowPasswordSection] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const mockSendOtp = async () => {
        if (!mobileNumber) {
            Alert.alert('Error', 'Please enter your mobile number');
            return;
        }
        setLoading(true);
        // Mock API call delay
        setTimeout(() => {
            setLoading(false);
            setShowOtpSection(true);
            Alert.alert('Success', 'OTP sent to your registered mobile number');
        }, 1500);
    };

    const mockVerifyOtp = async () => {
        if (!otp) {
            Alert.alert('Error', 'Please enter OTP');
            return;
        }
        setLoading(true);
        // Mock OTP verification - accept any 6-digit code
        setTimeout(() => {
            setLoading(false);
            if (otp.length === 6) {
                setShowPasswordSection(true);
                Alert.alert('Success', 'OTP verified successfully');
            } else {
                Alert.alert('Error', 'Invalid OTP. Please enter 6-digit code');
            }
        }, 1000);
    };

    const mockResetPassword = async () => {
        if (!newPassword || !confirmPassword) {
            Alert.alert('Error', 'Please fill in all password fields');
            return;
        }
        if (newPassword !== confirmPassword) {
            Alert.alert('Error', 'Passwords do not match');
            return;
        }
        if (newPassword.length < 6) {
            Alert.alert('Error', 'Password must be at least 6 characters');
            return;
        }
        
        setLoading(true);
        setTimeout(() => {
            setLoading(false);
            Alert.alert('Success', 'Password reset successful', [
                { text: 'OK', onPress: () => navigation.navigate('Login') }
            ]);
        }, 1500);
    };

    return (
        <View style={s.container}>
            <StatusBar barStyle="dark-content" />
            <SafeAreaView style={s.safe}>
                <View>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                        <ArrowLeft size={20} color={Colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                <View style={s.content}>
                    <View style={s.headerSection}>
                        <View style={s.logoRow}>
                            <LinearGradient colors={Colors.gradient} style={s.logoMini}>
                                <Text style={{ fontSize: 14, color: '#fff' }}>♥</Text>
                            </LinearGradient>
                            <Text style={s.logoText}>CareConnect</Text>
                        </View>
                        <Text style={s.title}>Reset Password</Text>
                        <Text style={s.subtitle}>
                            {!showOtpSection && !showPasswordSection && 'Enter your mobile number to receive OTP'}
                            {showOtpSection && !showPasswordSection && 'Enter OTP sent to your mobile'}
                            {showPasswordSection && 'Create your new password'}
                        </Text>
                    </View>

                    <View style={s.illustrationSection}>
                        {!showOtpSection && !showPasswordSection && (
                            <View style={s.illustrationCard}>
                                <View style={s.illustrationBackground}>
                                    <Phone size={64} color={Colors.primary} strokeWidth={1.5} />
                                    <Text style={s.illustrationText}>Secure Verification</Text>
                                </View>
                            </View>
                        )}

                        {showOtpSection && !showPasswordSection && (
                            <View style={s.illustrationCard}>
                                <View style={s.illustrationBackground}>
                                    <Key size={64} color={Colors.primary} strokeWidth={1.5} />
                                    <Text style={s.illustrationText}>Enter OTP Code</Text>
                                </View>
                            </View>
                        )}

                        {showPasswordSection && (
                            <View style={s.illustrationCard}>
                                <View style={s.illustrationBackground}>
                                    <Shield size={64} color={Colors.primary} strokeWidth={1.5} />
                                    <Text style={s.illustrationText}>New Password</Text>
                                </View>
                            </View>
                        )}
                    </View>

                    <View style={s.formSection}>
                        {!showOtpSection && !showPasswordSection && (
                            <View style={s.formCard}>
                                <PremiumInput
                                    label="Mobile Number"
                                    icon={<Phone size={18} color={Colors.textSecondary} />}
                                    placeholder="+1234567890"
                                    value={mobileNumber}
                                    onChangeText={setMobileNumber}
                                    keyboardType="phone-pad"
                                    maxLength={15}
                                />
                                <TouchableOpacity onPress={mockSendOtp} disabled={loading} activeOpacity={0.9} style={s.submitWrap}>
                                    <LinearGradient colors={Colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.submitBtn}>
                                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Send OTP</Text>}
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        )}

                        {showOtpSection && !showPasswordSection && (
                            <View style={s.formCard}>
                                <PremiumInput
                                    label="Enter OTP"
                                    icon={<Key size={18} color={Colors.textSecondary} />}
                                    placeholder="123456"
                                    value={otp}
                                    onChangeText={setOtp}
                                    keyboardType="number-pad"
                                    maxLength={6}
                                />
                                <TouchableOpacity onPress={mockVerifyOtp} disabled={loading} activeOpacity={0.9} style={s.submitWrap}>
                                    <LinearGradient colors={Colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.submitBtn}>
                                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Verify OTP</Text>}
                                    </LinearGradient>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setShowOtpSection(false)} style={s.resendBtn}>
                                    <Text style={s.resendText}>Change Mobile Number</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {showPasswordSection && (
                            <View style={s.formCard}>
                                <PremiumInput
                                    label="New Password"
                                    icon={<Lock size={18} color={Colors.textSecondary} />}
                                    placeholder="••••••••"
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                    secureTextEntry={!showNewPassword}
                                    rightElement={
                                        <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)}>
                                            {showNewPassword ? <Lock size={16} color={Colors.textSecondary} /> : <Lock size={16} color={Colors.textSecondary} />}
                                        </TouchableOpacity>
                                    }
                                />
                                <PremiumInput
                                    label="Confirm Password"
                                    icon={<Lock size={18} color={Colors.textSecondary} />}
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    secureTextEntry={!showConfirmPassword}
                                    rightElement={
                                        <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                                            {showConfirmPassword ? <Lock size={16} color={Colors.textSecondary} /> : <Lock size={16} color={Colors.textSecondary} />}
                                        </TouchableOpacity>
                                    }
                                />
                                <TouchableOpacity onPress={mockResetPassword} disabled={loading} activeOpacity={0.9} style={s.submitWrap}>
                                    <LinearGradient colors={Colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.submitBtn}>
                                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Reset Password</Text>}
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    <View style={s.footerSection}>
                        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={s.switchRow}>
                            <Text style={s.switchText}>Remember your password? </Text>
                            <Text style={s.switchLink}>Sign In</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.white },
    safe: { flex: 1, paddingHorizontal: Spacing.md },
    backBtn: { paddingVertical: Spacing.xs },
    backText: { ...Typography.bodyMedium, color: Colors.textSecondary },
    content: { flex: 1, justifyContent: 'space-between', paddingVertical: Spacing.sm },
    headerSection: { alignItems: 'center', paddingTop: Spacing.sm },
    logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    logoMini: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
    logoText: { ...Typography.bodySemibold, fontSize: 16, color: Colors.primary },
    title: { ...Typography.h1, color: Colors.textPrimary, fontSize: 24, marginTop: Spacing.sm },
    subtitle: { ...Typography.body, color: Colors.textSecondary, marginTop: Spacing.xs, marginBottom: Spacing.md, fontSize: 14, lineHeight: 18, textAlign: 'center' },
    illustrationSection: { flex: 1, justifyContent: 'center', alignItems: 'center', marginVertical: Spacing.lg },
    illustrationCard: {
        width: 180,
        height: 180,
        borderRadius: Radius.xxl,
        overflow: 'hidden',
        ...Shadows.lg,
    },
    illustrationBackground: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: Spacing.md,
        paddingHorizontal: Spacing.md,
        backgroundColor: Colors.surfaceAlt,
    },
    illustrationText: { ...Typography.h3, color: Colors.primary, fontWeight: '700', textAlign: 'center' },
    formSection: { flex: 0.8, justifyContent: 'center' },
    formCard: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.lg, ...Shadows.card },
    submitWrap: { marginTop: Spacing.lg, borderRadius: Radius.lg, overflow: 'hidden', ...Shadows.lg },
    submitBtn: { paddingVertical: 14, alignItems: 'center' },
    submitText: { ...Typography.button, color: '#fff', fontSize: 15 },
    resendBtn: { marginTop: Spacing.md, alignItems: 'center' },
    resendText: { ...Typography.caption, color: Colors.primary, fontWeight: '600' },
    footerSection: { paddingBottom: Spacing.sm },
    switchRow: { flexDirection: 'row', justifyContent: 'center' },
    switchText: { ...Typography.body, color: Colors.textSecondary, fontSize: 14 },
    switchLink: { ...Typography.bodySemibold, color: Colors.primary, fontSize: 14 },
});
