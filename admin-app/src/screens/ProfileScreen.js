import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking, TextInput, StatusBar, Animated, Dimensions, Platform, ActivityIndicator } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../theme/theme';
import { Shadows } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import GradientHeader from '../components/common/GradientHeader';

const ROLE_LABELS = {
    super_admin: 'Super Administrator',
    org_admin: 'Organization Admin',
    care_manager: 'Care Manager',
    caller: 'Healthcare Caller',
    mentor: 'Patient Mentor',
    patient: 'Member Patient',
};

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

    const [editProfileVisible, setEditProfileVisible] = useState(false);
    const [editNameValue, setEditNameValue] = useState(profile?.fullName || '');
    const [editPhoneValue, setEditPhoneValue] = useState(realPhone === 'Not provided' ? '' : realPhone);
    const [saving, setSaving] = useState(false);
    const [statusBanner, setStatusBanner] = useState(null);
    const [confirmLogout, setConfirmLogout] = useState(false);

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true })
        ]).start();
    }, []);

    const handleLogout = () => {
        setConfirmLogout(true);
    };

    const handleSaveProfile = async () => {
        try {
            setSaving(true);
            const { apiService } = require('../lib/api');
            const targetId = profile?._id || profile?.id;
            await apiService.profiles.update(targetId, { fullName: editNameValue, phone: editPhoneValue });
            setStatusBanner({ type: 'success', message: 'Profile details updated successfully.' });
            setEditProfileVisible(false);
            if (refreshProfile) await refreshProfile();
        } catch (error) {
            setStatusBanner({ type: 'error', message: error?.response?.data?.error || 'Could not update profile.' });
        } finally { setSaving(false); }
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
                        <InfoRow icon="phone" label="Contact Number" value={realPhone} onPress={() => { if (realPhone !== 'Not provided') Linking.openURL(`tel:${realPhone}`); }} />
                        
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
                        <View style={[s.sBanner, statusBanner.type === 'success' ? s.sBannerOk : s.sBannerErr]}>
                            <View style={s.sBannerIconWrap}>
                                <Feather name={statusBanner.type === 'success' ? 'check' : 'alert-circle'} size={14} color={statusBanner.type === 'success' ? '#10B981' : '#EF4444'} />
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
                        <View style={s.inputFieldWrapper}>
                            <Feather name="user" size={18} color="#94A3B8" />
                            <TextInput 
                                placeholder="E.g. Dr. Prakash" 
                                value={editNameValue}
                                onChangeText={setEditNameValue} 
                                style={s.inputField} 
                                placeholderTextColor="#CBD5E1" 
                            />
                        </View>
                        
                        <Text style={s.inputLabel}>Direct Phone Line</Text>
                        <View style={s.inputFieldWrapper}>
                            <Feather name="phone-call" size={18} color="#94A3B8" />
                            <TextInput 
                                placeholder="E.g. +91 98765 43210" 
                                value={editPhoneValue}
                                onChangeText={setEditPhoneValue} 
                                keyboardType="phone-pad"
                                style={s.inputField} 
                                placeholderTextColor="#CBD5E1" 
                            />
                        </View>
                        
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
    cardDividerMenu: { height: 1, backgroundColor: '#F8FAFC', marginLeft: 68, marginRight: 20 }, // specialized for menu list

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

    // ── System Status Banners ──
    sBanner: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, marginTop: 24, borderWidth: 1 },
    sBannerOk: { backgroundColor: '#F0FDF4', borderColor: '#D1FAE5' },
    sBannerErr: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
    sBannerIconWrap: { width: 24, height: 24, borderRadius: 8, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginRight: 12, ...Shadows.sm },
    sBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#0F172A' },

    // ── Logout UI (Sleek Redesigned) ──
    logoutStandardBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        backgroundColor: '#EF4444', borderWidth: 0,
        paddingVertical: 18, borderRadius: 16, marginTop: 40, ...Shadows.md, shadowColor: '#EF4444', shadowOpacity: 0.3
    },
    logoutStandardText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.5 },

    // Beautiful New Danger Card
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
});
