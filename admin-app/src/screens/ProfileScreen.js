import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking, TextInput, StatusBar, Animated, Dimensions, Platform, ActivityIndicator } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../theme/theme';
import { Shadows } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../lib/api';
import GradientHeader from '../components/common/GradientHeader';
import { isValidName, isValidPhone } from '../utils/validators';

const ROLE_LABELS = {
    super_admin: 'Super Administrator',
    org_admin: 'Organization Admin',
    care_manager: 'Care Manager',
    caller: 'Healthcare Caller',
    mentor: 'Patient Mentor',
    patient: 'Member Patient',
};

const PHONE_REQUIRED_ROLES = ['org_admin', 'care_manager', 'caller'];

function InfoRow({ icon, label, value, onPress, action }) {
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.7 : 1} style={s.infoRow}>
            <View style={s.infoIconWrap}>
                <Feather name={icon} size={18} color="#4F46E5" />
            </View>
            <View style={s.infoTextCol}>
                <Text style={[s.infoLabel, Theme.typography.common]}>{label}</Text>
                <Text style={[s.infoValue, Theme.typography.common]}>{value}</Text>
            </View>
            {action || (onPress ? <View style={s.infoActionArrow}><Feather name="chevron-right" size={16} color="#94A3B8" /></View> : null)}
        </TouchableOpacity>
    );
}

function MenuItem({ icon, label, value, onPress, isDestructive }) {
    const mainColor = isDestructive ? '#EF4444' : '#0F172A';
    const bgIconColor = isDestructive ? '#FEF2F2' : '#F1F5F9';
    
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={s.menuItem}>
            <View style={[s.menuIconWrap, { backgroundColor: bgIconColor }]}>
                <Feather name={icon} size={18} color={mainColor} />
            </View>
            <Text style={[s.menuLabel, Theme.typography.common, isDestructive && { color: '#EF4444' }]}>{label}</Text>
            <View style={{ flex: 1 }} />
            {value && <Text style={[s.menuValue, Theme.typography.common]}>{value}</Text>}
            <View style={s.infoActionArrow}>
                <Feather name="chevron-right" size={16} color="#94A3B8" />
            </View>
        </TouchableOpacity>
    );
}

export default function ProfileScreen({ navigation }) {
    const { user, profile, signOut, refreshProfile } = useAuth();
    const displayName = profile?.fullName || user?.email?.split('@')[0] || 'Member';
    const initial = displayName.charAt(0).toUpperCase();
    const currentRole = profile?.role || 'patient';
    const realPhone = profile?.phone || user?.phone || 'Not provided';
    const isPhoneVerified = profile?.phoneVerified || false;
    const needsPhoneVerification = PHONE_REQUIRED_ROLES.includes(currentRole);

    const [editProfileVisible, setEditProfileVisible] = useState(false);
    const [editNameValue, setEditNameValue] = useState(profile?.fullName || '');
    const [editPhoneValue, setEditPhoneValue] = useState(realPhone === 'Not provided' ? '' : realPhone);
    const [saving, setSaving] = useState(false);
    const [editErrors, setEditErrors] = useState({});
    const [statusBanner, setStatusBanner] = useState(null);
    const [confirmLogout, setConfirmLogout] = useState(false);

    // Phone verification states
    const [verifyMode, setVerifyMode] = useState(false); // true when verifying phone
    const [otpValues, setOtpValues] = useState(['', '', '', '', '', '']);
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [verifyError, setVerifyError] = useState('');
    const [verifyCooldown, setVerifyCooldown] = useState(0);
    const otpInputRefs = useRef([]);

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true })
        ]).start();
    }, []);

    // Cooldown timer for resend
    useEffect(() => {
        if (verifyCooldown <= 0) return;
        const timer = setInterval(() => setVerifyCooldown(c => c - 1), 1000);
        return () => clearInterval(timer);
    }, [verifyCooldown]);

    const handleLogout = () => {
        setConfirmLogout(true);
    };

    const formatPhoneE164 = (phone) => {
        let cleaned = phone.replace(/[^0-9]/g, '');
        if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
        if (cleaned.length === 10) return `+91${cleaned}`;
        if (cleaned.startsWith('91') && cleaned.length === 12) return `+${cleaned}`;
        if (phone.startsWith('+')) return phone.replace(/[^+0-9]/g, '');
        return `+91${cleaned}`;
    };

    const handleSaveProfile = async () => {
        // Validate inputs
        const errs = {};
        if (!editNameValue.trim()) {
            errs.name = 'Name is required.';
        } else if (!isValidName(editNameValue.trim())) {
            errs.name = 'Name must contain only letters, spaces, or hyphens.';
        }
        if (editPhoneValue.trim() && !isValidPhone(editPhoneValue.trim())) {
            errs.phone = 'Enter a valid phone number (10-15 digits).';
        }
        setEditErrors(errs);
        if (Object.keys(errs).length > 0) return;

        try {
            setSaving(true);
            const response = await apiService.auth.updateProfile({ fullName: editNameValue.trim(), phone: editPhoneValue.trim() });
            
            const phoneChanged = response.data?.phoneChanged;
            if (phoneChanged && needsPhoneVerification) {
                setStatusBanner({ type: 'warning', message: 'Phone number changed. Please verify your new number.' });
            } else {
                setStatusBanner({ type: 'success', message: 'Profile details updated successfully.' });
            }
            setEditProfileVisible(false);
            setEditErrors({});
            if (refreshProfile) await refreshProfile();
        } catch (error) {
            setStatusBanner({ type: 'error', message: error?.response?.data?.error || 'Could not update profile.' });
        } finally { setSaving(false); }
    };

    // ── Phone Verification Flow ──
    const handleSendVerifyOtp = async () => {
        try {
            setVerifyLoading(true);
            setVerifyError('');
            const fullPhone = formatPhoneE164(realPhone);
            await apiService.auth.sendPhoneOtp({ phone: fullPhone });
            setVerifyMode(true);
            setVerifyCooldown(300);
        } catch (err) {
            setVerifyError(err.response?.data?.error || 'Failed to send OTP.');
        } finally {
            setVerifyLoading(false);
        }
    };

    const handleOtpChange = (text, index) => {
        // Handle paste of full OTP
        if (text.length > 1) {
            const digits = text.replace(/[^0-9]/g, '').slice(0, 6).split('');
            const newOtp = [...otpValues];
            digits.forEach((d, i) => { if (i < 6) newOtp[i] = d; });
            setOtpValues(newOtp);
            const nextIdx = Math.min(digits.length, 5);
            otpInputRefs.current[nextIdx]?.focus();
            return;
        }

        const newOtp = [...otpValues];
        newOtp[index] = text;
        setOtpValues(newOtp);

        if (text && index < 5) {
            otpInputRefs.current[index + 1]?.focus();
        }
    };

    const handleOtpKeyPress = (e, index) => {
        if (e.nativeEvent.key === 'Backspace' && !otpValues[index] && index > 0) {
            otpInputRefs.current[index - 1]?.focus();
        }
    };

    const handleVerifyOtp = async () => {
        const code = otpValues.join('');
        if (code.length !== 6) {
            setVerifyError('Please enter the complete 6-digit code.');
            return;
        }
        try {
            setVerifyLoading(true);
            setVerifyError('');
            const fullPhone = formatPhoneE164(realPhone);
            await apiService.auth.verifyPhoneOtp({ phone: fullPhone, code });
            setVerifyMode(false);
            setOtpValues(['', '', '', '', '', '']);
            setStatusBanner({ type: 'success', message: 'Phone number verified successfully! ✅' });
            if (refreshProfile) await refreshProfile();
        } catch (err) {
            setVerifyError(err.response?.data?.error || 'Verification failed.');
        } finally {
            setVerifyLoading(false);
        }
    };

    const handleResendOtp = async () => {
        if (verifyCooldown > 0) return;
        try {
            setVerifyLoading(true);
            setVerifyError('');
            setOtpValues(['', '', '', '', '', '']);
            const fullPhone = formatPhoneE164(realPhone);
            await apiService.auth.sendPhoneOtp({ phone: fullPhone });
            setVerifyCooldown(300);
        } catch (err) {
            setVerifyError(err.response?.data?.error || 'Failed to resend code.');
        } finally {
            setVerifyLoading(false);
        }
    };

    // Phone verification status badge
    const PhoneVerifyBadge = () => {
        if (!needsPhoneVerification) return null;
        if (isPhoneVerified) {
            return (
                <View style={s.verifiedBadge}>
                    <Feather name="check-circle" size={12} color="#10B981" />
                    <Text style={s.verifiedText}>Verified</Text>
                </View>
            );
        }
        return (
            <TouchableOpacity 
                style={s.unverifiedBadge} 
                onPress={handleSendVerifyOtp}
                disabled={verifyLoading}
                activeOpacity={0.7}
            >
                {verifyLoading ? (
                    <ActivityIndicator size="small" color="#F59E0B" />
                ) : (
                    <>
                        <Feather name="alert-circle" size={12} color="#F59E0B" />
                        <Text style={s.unverifiedText}>Verify Now</Text>
                    </>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={s.container}>
            <StatusBar barStyle="light-content" />
            <GradientHeader title="My Profile" subtitle="Account Settings" onBack={() => navigation.goBack()} />

            <Animated.ScrollView 
                style={s.body} 
                showsVerticalScrollIndicator={false} 
                contentContainerStyle={[s.scrollContent, { paddingBottom: 150 }]}
                bounces={true}
            >
                <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                    
                    {/* ── Profile Header Card ── */}
                    <View style={s.profileHeaderCard}>
                        {/* Background Deco */}
                        <Ionicons name="finger-print" size={160} color="#F8FAFC" style={s.headerBgDeco} />
                        
                        <View style={s.avatarContainer}>
                            <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={StyleSheet.absoluteFill} />
                            <Text style={s.avatarText}>{initial}</Text>
                        </View>
                        
                        <Text style={[s.profileName, Theme.typography.common]}>{displayName}</Text>
                        <Text style={[s.profileEmail, Theme.typography.common]}>{user?.email || 'admin@careconnect.ai'}</Text>
                        
                        <View style={s.roleBadge}>
                            <Feather name="shield" size={12} color="#4F46E5" />
                            <Text style={[s.roleText, Theme.typography.common]}>{ROLE_LABELS[currentRole] || currentRole}</Text>
                        </View>
                    </View>

                    {/* ── Personal Details ── */}
                    <View style={s.sectionHeader}>
                        <Text style={[s.sectionTitle, Theme.typography.common]}>Personal Details</Text>
                        <TouchableOpacity 
                            onPress={() => { setEditNameValue(profile?.fullName || ''); setEditPhoneValue(realPhone === 'Not provided' ? '' : realPhone); setEditProfileVisible(true); }} 
                            style={s.editBtn}
                        >
                            <Feather name="edit-2" size={12} color="#4F46E5" />
                            <Text style={[s.editBtnText, Theme.typography.common]}>Edit Profile</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={s.premiumCard}>
                        <InfoRow icon="user" label="Full Name" value={profile?.fullName || displayName} />
                        <View style={s.cardDivider} />
                        <InfoRow icon="mail" label="E-mail Address" value={user?.email || 'admin@careconnect.ai'} onPress={() => Linking.openURL(`mailto:${user?.email}`)} />
                        <View style={s.cardDivider} />
                        <InfoRow 
                            icon="phone" 
                            label="Contact Number" 
                            value={realPhone} 
                            onPress={() => { if (realPhone !== 'Not provided') Linking.openURL(`tel:${realPhone}`); }} 
                            action={<PhoneVerifyBadge />}
                        />
                        
                        {profile?.organizationId && (
                            <>
                                <View style={s.cardDivider} />
                                <InfoRow 
                                    icon="briefcase" 
                                    label="Associated Organization" 
                                    value={(() => {
                                        const orgName = profile.organizationId?.name || profile.organizationName;
                                        const orgCity = profile.organizationId?.address?.city || profile.address?.city;
                                        if (!orgName) return 'Health Center';
                                        return orgCity ? `${orgName} - ${orgCity}` : orgName;
                                    })()}
                                    onPress={() => navigation.navigate('OrgDetail', { orgId: profile.organizationId?._id || profile.organizationId })} 
                                />
                            </>
                        )}
                    </View>

                    {/* ── Inline Phone Verification OTP ── */}
                    {verifyMode && (
                        <View style={s.verifyCard}>
                            <View style={s.verifyHeader}>
                                <View style={s.verifyIconWrap}>
                                    <Feather name="smartphone" size={24} color="#4F46E5" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.verifyTitle}>Verify Phone Number</Text>
                                    <Text style={s.verifySubtitle}>Enter the 6-digit code sent to {realPhone}</Text>
                                </View>
                                <TouchableOpacity onPress={() => { setVerifyMode(false); setVerifyError(''); }} style={s.verifyCloseBtn}>
                                    <Feather name="x" size={18} color="#94A3B8" />
                                </TouchableOpacity>
                            </View>

                            <View style={s.otpRow}>
                                {otpValues.map((digit, idx) => (
                                    <TextInput
                                        key={idx}
                                        ref={(r) => (otpInputRefs.current[idx] = r)}
                                        style={[
                                            s.otpBox,
                                            digit && s.otpBoxFilled,
                                            verifyError && s.otpBoxError,
                                        ]}
                                        value={digit}
                                        onChangeText={(t) => handleOtpChange(t, idx)}
                                        onKeyPress={(e) => handleOtpKeyPress(e, idx)}
                                        keyboardType="number-pad"
                                        maxLength={idx === 0 ? 6 : 1}
                                        autoFocus={idx === 0}
                                        selectTextOnFocus
                                    />
                                ))}
                            </View>

                            {verifyError ? <Text style={s.verifyErrorText}>{verifyError}</Text> : null}

                            <View style={s.verifyActions}>
                                <View style={s.resendRow}>
                                    {verifyCooldown > 0 ? (
                                        <Text style={s.cooldownText}>
                                            Resend in <Text style={s.cooldownBold}>{Math.floor(verifyCooldown / 60)}:{String(verifyCooldown % 60).padStart(2, '0')}</Text>
                                        </Text>
                                    ) : (
                                        <TouchableOpacity onPress={handleResendOtp} disabled={verifyLoading}>
                                            <Text style={s.resendLink}>Resend Code</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <TouchableOpacity 
                                    onPress={handleVerifyOtp} 
                                    disabled={verifyLoading} 
                                    style={s.verifyBtn}
                                    activeOpacity={0.8}
                                >
                                    {verifyLoading ? (
                                        <ActivityIndicator size="small" color="#FFFFFF" />
                                    ) : (
                                        <Text style={s.verifyBtnText}>Verify</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/* ── Preferences ── */}
                    <Text style={[s.sectionTitle, Theme.typography.common, { marginTop: 32, marginBottom: 16 }]}>Security Settings</Text>
                    <View style={s.premiumCard}>
                        <MenuItem icon="bell" label="Push Notifications" value="Active" />
                        <View style={s.cardDividerMenu} />
                        <MenuItem icon="lock" label="Change Password" onPress={() => navigation.navigate('ChangePassword', { forced: false })} />
                        <View style={s.cardDividerMenu} />
                        <MenuItem icon="shield" label="Data Privacy Policy" />
                    </View>

                    {/* ── Session Control ── */}
                    {statusBanner && (
                        <View style={[s.sBanner, statusBanner.type === 'success' ? s.sBannerOk : statusBanner.type === 'warning' ? s.sBannerWarn : s.sBannerErr]}>
                            <View style={s.sBannerIconWrap}>
                                <Feather name={statusBanner.type === 'success' ? 'check' : statusBanner.type === 'warning' ? 'alert-triangle' : 'alert-circle'} size={14} color={statusBanner.type === 'success' ? '#10B981' : statusBanner.type === 'warning' ? '#F59E0B' : '#EF4444'} />
                            </View>
                            <Text style={s.sBannerText}>{statusBanner.message}</Text>
                            <TouchableOpacity onPress={() => setStatusBanner(null)} style={{ padding: 4 }}>
                                <Feather name="x" size={16} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>
                    )}

                    {confirmLogout ? (
                        <View style={s.logoutDangerCard}>
                            <View style={s.logoutHeader}>
                                <View style={s.logoutDangerIcon}>
                                    <Feather name="alert-triangle" size={24} color="#EF4444" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.logoutDangerTitle}>Sign out of CareConnect?</Text>
                                    <Text style={s.logoutDangerText}>You will be securely disconnected from this device.</Text>
                                </View>
                            </View>
                            <View style={s.logoutWarningActions}>
                                <TouchableOpacity onPress={() => setConfirmLogout(false)} style={s.logoutCancelBtn}>
                                    <Text style={s.logoutCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={signOut} style={s.logoutActionBtn}>
                                    <Text style={s.logoutActionText}>Confirm Sign Out</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <TouchableOpacity onPress={handleLogout} style={s.logoutStandardBtn} activeOpacity={0.8}>
                            <Feather name="power" size={18} color="#FFFFFF" />
                            <Text style={s.logoutStandardText}>Secure Sign Out</Text>
                        </TouchableOpacity>
                    )}

                    <Text style={s.versionTag}>CareConnect Enterprise OS • v2.4.0</Text>
                </Animated.View>
            </Animated.ScrollView>

            {/* ── Edit Profile Modal ── */}
            {editProfileVisible && (
                <View style={[StyleSheet.absoluteFill, s.modalOverlay]}>
                    <View style={s.modalCard}>
                        
                        <View style={s.modalHeaderBlock}>
                            <View style={s.modalAvatarRing}>
                                <Ionicons name="person" size={24} color="#4F46E5" />
                            </View>
                            <Text style={s.modalHeading}>Edit Personal Details</Text>
                            <Text style={s.modalSubheading}>Update your organizational identify</Text>
                        </View>

                        <Text style={s.inputLabel}>Professional Name</Text>
                        <View style={[s.inputFieldWrapper, editErrors.name && { borderColor: '#FECACA', backgroundColor: '#FFF5F5' }]}>
                            <Feather name="user" size={18} color={editErrors.name ? '#EF4444' : '#94A3B8'} />
                            <TextInput 
                                placeholder="E.g. Dr. Prakash" 
                                value={editNameValue}
                                onChangeText={t => { setEditNameValue(t); setEditErrors(e => ({ ...e, name: undefined })); }} 
                                style={s.inputField} 
                                placeholderTextColor="#CBD5E1" 
                                autoCapitalize="words"
                            />
                        </View>
                        {editErrors.name && <Text style={s.fieldError}>{editErrors.name}</Text>}
                        
                        <Text style={s.inputLabel}>Direct Phone Line</Text>
                        <View style={[s.inputFieldWrapper, editErrors.phone && { borderColor: '#FECACA', backgroundColor: '#FFF5F5' }]}>
                            <Feather name="phone-call" size={18} color={editErrors.phone ? '#EF4444' : '#94A3B8'} />
                            <TextInput 
                                placeholder="E.g. +91 98765 43210" 
                                value={editPhoneValue}
                                onChangeText={t => { setEditPhoneValue(t); setEditErrors(e => ({ ...e, phone: undefined })); }} 
                                keyboardType="phone-pad"
                                style={s.inputField} 
                                placeholderTextColor="#CBD5E1" 
                            />
                        </View>
                        {editErrors.phone && <Text style={s.fieldError}>{editErrors.phone}</Text>}

                        {/* Phone change warning */}
                        {editPhoneValue !== (realPhone === 'Not provided' ? '' : realPhone) && needsPhoneVerification && (
                            <View style={s.phoneChangeWarning}>
                                <Feather name="alert-triangle" size={14} color="#F59E0B" />
                                <Text style={s.phoneChangeWarningText}>
                                    Changing your phone number will require re-verification via OTP.
                                </Text>
                            </View>
                        )}
                        
                        <View style={s.modalActions}>
                            <TouchableOpacity onPress={() => setEditProfileVisible(false)} style={s.modalCancelBtn}>
                                <Text style={s.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSaveProfile} disabled={saving} style={s.modalSaveBtn}>
                                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={s.modalSaveText}>Save Changes</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F7F9' },
    body: { flex: 1 },
    scrollContent: { padding: 20 },

    // ── Profile Header Card ──
    profileHeaderCard: {
        backgroundColor: '#FFFFFF', borderRadius: 24, paddingVertical: 32, alignItems: 'center',
        borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.lg, shadowColor: '#64748B', shadowOpacity: 0.08,
        position: 'relative', overflow: 'hidden'
    },
    headerBgDeco: { position: 'absolute', top: -30, right: -40, opacity: 0.5, transform: [{rotate: '15deg'}] },
    avatarContainer: {
        width: 80, height: 80, borderRadius: 24, justifyContent: 'center', alignItems: 'center',
        marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9'
    },
    avatarText: { fontSize: 32, fontWeight: '800', color: '#4F46E5' },
    profileName: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
    profileEmail: { fontSize: 13, fontWeight: '600', color: '#64748B', marginTop: 4 },
    roleBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 10, marginTop: 16, borderWidth: 1, borderColor: '#E0E7FF'
    },
    roleText: { fontSize: 11, fontWeight: '800', color: '#4F46E5', textTransform: 'uppercase', letterSpacing: 0.5 },

    // ── Sections Headers ──
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 32, marginBottom: 16 },
    sectionTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A', textTransform: 'uppercase', letterSpacing: 1 },
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
    editBtnText: { fontSize: 11, fontWeight: '800', color: '#4F46E5', textTransform: 'uppercase' },

    // ── Premium Cards ──
    premiumCard: {
        backgroundColor: '#FFFFFF', borderRadius: 20,
        borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.md,
        overflow: 'hidden'
    },
    cardDivider: { height: 1, backgroundColor: '#F8FAFC', marginHorizontal: 20 },
    cardDividerMenu: { height: 1, backgroundColor: '#F8FAFC', marginLeft: 68, marginRight: 20 },

    infoRow: { flexDirection: 'row', alignItems: 'center', padding: 20 },
    infoIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    infoTextCol: { flex: 1 },
    infoLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    infoValue: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
    infoActionArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },

    menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20 },
    menuIconWrap: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    menuLabel: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
    menuValue: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginRight: 12 },

    // ── Phone Verification Badges ──
    verifiedBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#F0FDF4', paddingHorizontal: 10, paddingVertical: 6,
        borderRadius: 10, borderWidth: 1, borderColor: '#D1FAE5',
    },
    verifiedText: { fontSize: 11, fontWeight: '800', color: '#10B981', textTransform: 'uppercase', letterSpacing: 0.3 },
    unverifiedBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#FFFBEB', paddingHorizontal: 10, paddingVertical: 6,
        borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A',
    },
    unverifiedText: { fontSize: 11, fontWeight: '800', color: '#F59E0B', textTransform: 'uppercase', letterSpacing: 0.3 },

    // ── Inline Verify Card ──
    verifyCard: {
        backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, marginTop: 16,
        borderWidth: 1, borderColor: '#E0E7FF', ...Shadows.md, shadowColor: '#4F46E5', shadowOpacity: 0.08,
    },
    verifyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    verifyIconWrap: {
        width: 48, height: 48, borderRadius: 14, backgroundColor: '#EEF2FF',
        justifyContent: 'center', alignItems: 'center', marginRight: 14,
    },
    verifyTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
    verifySubtitle: { fontSize: 12, fontWeight: '500', color: '#64748B', marginTop: 2 },
    verifyCloseBtn: {
        width: 32, height: 32, borderRadius: 10, backgroundColor: '#F8FAFC',
        justifyContent: 'center', alignItems: 'center',
    },
    otpRow: {
        flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16,
    },
    otpBox: {
        width: 46, height: 54, borderRadius: 14, borderWidth: 2, borderColor: '#E2E8F0',
        backgroundColor: '#F8FAFC', textAlign: 'center', fontSize: 22, fontWeight: '800',
        color: '#0F172A',
    },
    otpBoxFilled: { borderColor: '#4F46E5', backgroundColor: '#EEF2FF' },
    otpBoxError: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
    verifyErrorText: { color: '#EF4444', fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
    verifyActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    resendRow: {},
    cooldownText: { fontSize: 13, fontWeight: '500', color: '#94A3B8' },
    cooldownBold: { fontWeight: '800', color: '#4F46E5' },
    resendLink: { fontSize: 13, fontWeight: '700', color: '#4F46E5' },
    verifyBtn: {
        backgroundColor: '#4F46E5', paddingHorizontal: 28, paddingVertical: 14,
        borderRadius: 14, ...Shadows.sm, shadowColor: '#4F46E5',
    },
    verifyBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },

    // ── Phone Change Warning ──
    phoneChangeWarning: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#FFFBEB', padding: 12, borderRadius: 12,
        borderWidth: 1, borderColor: '#FDE68A', marginBottom: 20,
    },
    phoneChangeWarningText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#92400E' },

    // ── System Status Banners ──
    sBanner: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, marginTop: 24, borderWidth: 1 },
    sBannerOk: { backgroundColor: '#F0FDF4', borderColor: '#D1FAE5' },
    sBannerErr: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
    sBannerWarn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
    sBannerIconWrap: { width: 24, height: 24, borderRadius: 8, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginRight: 12, ...Shadows.sm },
    sBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#0F172A' },

    // ── Logout UI ──
    logoutStandardBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        backgroundColor: '#EF4444', borderWidth: 0,
        paddingVertical: 18, borderRadius: 16, marginTop: 40, ...Shadows.md, shadowColor: '#EF4444', shadowOpacity: 0.3
    },
    logoutStandardText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.5 },

    logoutDangerCard: { 
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, 
        marginTop: 40, borderWidth: 1, borderColor: '#FEE2E2', 
        ...Shadows.lg, shadowColor: '#EF4444', shadowOpacity: 0.1 
    },
    logoutHeader: { flexDirection: 'column', alignItems: 'center', marginBottom: 24 },
    logoutDangerIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' },
    logoutDangerTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
    logoutDangerText: { fontSize: 14, fontWeight: '500', color: '#64748B', lineHeight: 20, textAlign: 'center' },
    
    logoutWarningActions: { flexDirection: 'row', gap: 12 },
    logoutCancelBtn: { flex: 1, backgroundColor: '#F8FAFC', paddingVertical: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
    logoutCancelText: { fontSize: 15, fontWeight: '700', color: '#64748B' },
    logoutActionBtn: { flex: 1, backgroundColor: '#EF4444', borderRadius: 16, justifyContent: 'center', alignItems: 'center', ...Shadows.md, shadowColor: '#EF4444' },
    logoutActionText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },

    versionTag: { textAlign: 'center', marginTop: 32, fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5 },

    // ── Modal Overrides ──
    modalOverlay: { backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
    modalCard: { width: '90%', backgroundColor: '#FFFFFF', borderRadius: 28, padding: 24, ...Shadows.xl },
    
    modalHeaderBlock: { alignItems: 'center', marginBottom: 28 },
    modalAvatarRing: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    modalHeading: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
    modalSubheading: { fontSize: 13, fontWeight: '500', color: '#64748B' },

    inputLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 },
    inputFieldWrapper: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9',
        borderRadius: 16, paddingHorizontal: 16, marginBottom: 20
    },
    inputField: { 
        flex: 1, fontSize: 16, fontWeight: '600', color: '#0F172A', paddingVertical: 18,
        ...Platform.select({ web: { outlineStyle: 'none' } })
    },

    modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
    modalCancelBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9' },
    modalCancelText: { fontSize: 15, fontWeight: '700', color: '#64748B' },
    modalSaveBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center', backgroundColor: '#4F46E5', ...Shadows.md, shadowColor: '#4F46E5' },
    modalSaveText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
    fieldError: { fontSize: 11, fontWeight: '700', color: '#EF4444', marginTop: -14, marginBottom: 16, marginLeft: 4 },
});
