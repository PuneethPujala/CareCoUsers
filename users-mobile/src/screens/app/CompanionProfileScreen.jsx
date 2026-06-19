import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Switch, Share, Image, Modal } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../lib/api';
import { LogOut, ShieldCheck, Heart, User, Settings, ArrowRight, UserCheck, Share2, Phone, ChevronDown, X } from 'lucide-react-native';
import { handleAvatarPicker, deleteOldAvatar, pickRawImage, uploadCroppedAvatar } from '../../utils/avatarHelper';
import AvatarSelectModal from '../../components/ui/AvatarSelectModal';
import AvatarCropModal from '../../components/ui/AvatarCropModal';
import { colors, radius, spacing, shadows, layout } from '../../theme';
import AlertManager from '../../utils/AlertManager';
import { useNavigation } from '@react-navigation/native';
import LegalModal from '../../components/ui/LegalModal';
import CompanionHeader from '../../components/ui/CompanionHeader';



const C = {
    bg: colors.background,
    surface: colors.surface,
    primary: colors.primary,
    primaryDark: colors.primaryMid,
    primarySoft: colors.primarySoft,
    dark: colors.textPrimary,
    mid: colors.textSecondary,
    muted: colors.textMuted,
    danger: colors.danger,
    border: colors.borderLight,
    success: colors.success,
    successSoft: colors.successLight,
    light: colors.textMuted,
};

const FONT = {
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export default function CompanionProfileScreen() {
    const { signOut, user, profile, refreshProfile, switchRole } = useAuth();
    const [loading, setLoading] = useState(true);
    const [workspaceModalVisible, setWorkspaceModalVisible] = useState(false);
    const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
    const [avatarModalVisible, setAvatarModalVisible] = useState(false);
    const [cropImageUri, setCropImageUri] = useState(null);
    const [cropModalVisible, setCropModalVisible] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    const handleWorkspaceSwitch = async (targetRole) => {
        if (targetRole === 'companion') {
            setWorkspaceModalVisible(false);
            return;
        }
        setWorkspaceModalVisible(false);
        setSwitchingWorkspace(true);
        try {
            await switchRole(targetRole);
        } catch (err) {
            AlertManager.alert('Error', 'Failed to switch workspace.');
        } finally {
            setSwitchingWorkspace(false);
        }
    };

    const handleRemoveAvatar = async () => {
        try {
            if (profile?.avatarUrl) {
                await deleteOldAvatar(profile.avatarUrl, 'avatars');
                await apiService.auth.updateProfile({ avatarUrl: '' });
                await refreshProfile();
                AlertManager.alert('Success', 'Profile picture removed.');
            }
        } catch (err) {
            AlertManager.alert('Error', 'Failed to remove profile picture.');
        }
    };

    const handleAvatarPress = () => {
        setAvatarModalVisible(true);
    };
    const [generatingCode, setGeneratingCode] = useState(false);
    const [linkedPatients, setLinkedPatients] = useState([]);
    const [pushEnabled, setPushEnabled] = useState(true);
    const [legalVisible, setLegalVisible] = useState(false);
    const [legalType, setLegalType] = useState('terms');
    const navigation = useNavigation();

    const loadProfileData = async () => {
        try {
            const res = await apiService.companion.getPatientStatus();
            setLinkedPatients(res.data.linked_patients || []);
        } catch (err) {
            console.warn('Failed to load profile data', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProfileData();
    }, []);

    const handleLogout = async () => {
        try {
            const res = await signOut();
            if (res?.error) {
                AlertManager.alert('Logout Failed', res.error);
            }
        } catch (err) {
            AlertManager.alert('Logout Failed', err.message);
        }
    };

    const generateAndShareCode = async (patient) => {
        if (generatingCode) return;
        setGeneratingCode(true);
        try {
            const res = await apiService.companion.generateInviteCode(patient.id);
            const inviteCode = res.data.invite_code;
            
            await Share.share({
                message: `Hey! I'm sharing a secure invitation to monitor ${patient.name}'s care circle on CareMyMed.\n\nUse this 6-character Invite Code to join as a companion:\n🔑 Invite Code: ${inviteCode}\n\nDownload the CareMyMed app, tap 'Join as Companion' on the login screen, and enter this code. (Expires in 24 hours)`,
            });
        } catch (err) {
            console.warn('Share failed', err);
            AlertManager.alert('Unable to Generate Code', 'Failed to generate invite code. Please try again.');
        } finally {
            setGeneratingCode(false);
        }
    };

    const handleShareInviteCode = async () => {
        if (linkedPatients.length === 0) {
            AlertManager.alert('No Linked Members', 'You do not have any family members linked to invite companions to.');
            return;
        }

        if (linkedPatients.length === 1) {
            await generateAndShareCode(linkedPatients[0]);
        } else {
            const options = linkedPatients.map(p => ({
                text: p.name,
                onPress: () => generateAndShareCode(p)
            }));
            options.push({ text: 'Cancel', style: 'cancel' });
            AlertManager.alert(
                'Invite Family Caregiver',
                'Which family member\'s care circle would you like to invite them to?',
                options
            );
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    const companionName = profile?.fullName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Caregiver';
    const initials = companionName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

    return (
        <View style={styles.container}>
            <CompanionHeader
                subtitle="Account Setting"
                title="Companion Profile"
                onBack={() => navigation.goBack()}
            />

            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                {/* 1. Profile Identity Card */}
                <View style={styles.profileCard}>
                    <Pressable style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.85 }]} onPress={handleAvatarPress}>
                        {profile?.avatarUrl ? (
                            <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImg} />
                        ) : (
                            <Text style={styles.avatarText}>{initials}</Text>
                        )}
                        <View style={styles.badgeIcon}>
                            <UserCheck size={12} color="#FFF" strokeWidth={2.5} />
                        </View>
                    </Pressable>
                    <View style={styles.profileDetails}>
                        <Text style={styles.companionName}>{companionName}</Text>
                        <Text style={styles.companionEmail}>{user?.email}</Text>
                        {profile?.workspaces?.length > 1 ? (
                            <Pressable style={styles.workspacePill} onPress={() => setWorkspaceModalVisible(true)}>
                                <Text style={styles.workspacePillTxt}>❤️ Family Caregiver</Text>
                                <ChevronDown size={12} color={colors.danger} strokeWidth={2.5} style={{ marginLeft: 4 }} />
                            </Pressable>
                        ) : (
                            <View style={styles.roleBadge}>
                                <ShieldCheck size={12} color={C.primary} />
                                <Text style={styles.roleText}>Family Care Companion</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* 2. Care Circle Section */}
                <Text style={styles.sectionTitle}>Your Active Care Circle ({linkedPatients.length})</Text>
                <View style={styles.card}>
                    {linkedPatients.length > 0 ? (
                        linkedPatients.map((p, idx) => {
                            const pInitials = p.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                            return (
                                <View key={p.id} style={[styles.patientItem, idx === linkedPatients.length - 1 && { borderBottomWidth: 0 }]}>
                                    <View style={styles.patientAvatar}>
                                        {p.avatar_url ? (
                                            <Image source={{ uri: p.avatar_url }} style={styles.patientAvatarImg} />
                                        ) : (
                                            <Text style={styles.patientAvatarText}>{pInitials}</Text>
                                        )}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.patientName}>{p.name}</Text>
                                        <Text style={styles.patientRelation}>Monitored Member</Text>
                                    </View>
                                    {p.health_score !== undefined && (
                                        <View style={[
                                            styles.scoreChip,
                                            { backgroundColor: p.health_score > 70 ? colors.successLight : '#FEF3C7' }
                                        ]}>
                                            <Text style={[
                                                styles.scoreChipText,
                                                { color: p.health_score > 70 ? colors.success : '#D97706' }
                                            ]}>
                                                Score: {p.health_score}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            );
                        })
                    ) : (
                        <View style={styles.emptyCircle}>
                            <Heart color={colors.textMuted} size={28} />
                            <Text style={styles.emptyCircleText}>No family members linked yet.</Text>
                        </View>
                    )}
                </View>

                {/* 3. Companion Settings */}
                <Text style={styles.sectionTitle}>Preferences & Guard</Text>
                <View style={styles.card}>
                    <View style={styles.settingRow}>
                        <View style={styles.settingTextCol}>
                            <Text style={styles.settingLabel}>Urgent Alert Notifications</Text>
                            <Text style={styles.settingDesc}>SMS / Push alerts for missed doses</Text>
                        </View>
                        <Switch
                            value={pushEnabled}
                            onValueChange={setPushEnabled}
                            trackColor={{ false: '#E2E8F0', true: colors.primarySoft }}
                            thumbColor={pushEnabled ? colors.primary : '#94A3B8'}
                        />
                    </View>

                    <Pressable style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.7 }]} onPress={handleShareInviteCode}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.actionLabel}>Share Companion Link</Text>
                            <Text style={styles.actionDesc}>Invite another family member to join</Text>
                        </View>
                        <Share2 size={18} color={C.light} />
                    </Pressable>

                    <View style={styles.settingRow}>
                        <View style={styles.settingTextCol}>
                            <Text style={styles.settingLabel}>Real-time Dashboard Sync</Text>
                            <Text style={styles.settingDesc}>Updates metrics every 30 seconds</Text>
                        </View>
                        <View style={styles.statusPill}>
                            <Text style={styles.statusPillText}>Operational</Text>
                        </View>
                    </View>

                    <Pressable style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.7 }]} onPress={() => { setLegalType('privacy'); setLegalVisible(true); }}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.actionLabel}>Privacy Policy</Text>
                            <Text style={styles.actionDesc}>Read our privacy policy</Text>
                        </View>
                        <ArrowRight size={18} color={C.light} />
                    </Pressable>

                    <Pressable style={({ pressed }) => [styles.actionRow, { borderBottomWidth: 0 }, pressed && { opacity: 0.7 }]} onPress={() => { setLegalType('terms'); setLegalVisible(true); }}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.actionLabel}>Terms & Conditions</Text>
                            <Text style={styles.actionDesc}>Read our terms and conditions</Text>
                        </View>
                        <ArrowRight size={18} color={C.light} />
                    </Pressable>
                </View>

                {/* 4. Logout Button */}
                <Pressable style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.8 }]} onPress={handleLogout}>
                    <LogOut size={18} color={colors.danger} />
                    <Text style={styles.logoutText}>Sign Out from Companion Account</Text>
                </Pressable>

                <Text style={styles.versionText}>CareMyMed Companion App • Version 1.0.0 (Prod)</Text>
            </ScrollView>

            <LegalModal
                visible={legalVisible}
                type={legalType}
                onClose={() => setLegalVisible(false)}
            />

            <AvatarSelectModal
                visible={avatarModalVisible}
                onClose={() => setAvatarModalVisible(false)}
                onSelectSource={async (sourceType) => {
                    const rawUri = await pickRawImage(sourceType);
                    if (rawUri) {
                        setCropImageUri(rawUri);
                        setCropModalVisible(true);
                    }
                }}
                onRemove={handleRemoveAvatar}
                currentAvatarUrl={profile?.avatarUrl}
            />

            <AvatarCropModal
                visible={cropModalVisible}
                imageUri={cropImageUri}
                onClose={() => setCropModalVisible(false)}
                onConfirm={async (cropRes) => {
                    setCropModalVisible(false);
                    setActionLoading(true);
                    try {
                        const publicUrl = await uploadCroppedAvatar(cropRes.base64, false);
                        if (publicUrl) {
                            await apiService.auth.updateProfile({ avatarUrl: publicUrl });
                            await refreshProfile();
                            AlertManager.alert('Success', 'Profile picture updated successfully.');
                        }
                    } catch (err) {
                        AlertManager.alert('Error', 'Failed to save profile picture.');
                    } finally {
                        setActionLoading(false);
                    }
                }}
            />

            {/* ── Workspace Chooser Bottom Sheet ── */}
            <Modal visible={workspaceModalVisible} animationType="slide" transparent onRequestClose={() => setWorkspaceModalVisible(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setWorkspaceModalVisible(false)}>
                    <View style={styles.bottomSheetContent}>
                        <View style={styles.bottomSheetIndicator} />
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Switch Workspace</Text>
                            <Pressable onPress={() => setWorkspaceModalVisible(false)} hitSlop={10}>
                                <X size={24} color="#64748B" />
                            </Pressable>
                        </View>
                        <Text style={styles.bottomSheetSubtitle}>
                            Select context to view and manage health records.
                        </Text>
                        
                        {profile?.workspaces?.map((ws) => {
                            const isCurrent = ws.id === 'companion';
                            return (
                                <Pressable 
                                    key={ws.id} 
                                    style={[styles.workspaceOption, isCurrent && styles.workspaceOptionActive]} 
                                    onPress={() => handleWorkspaceSwitch(ws.id)}
                                >
                                    <View style={styles.workspaceOptionLeft}>
                                        <Text style={styles.workspaceOptionIcon}>{ws.id === 'patient' ? '🩺' : '❤️'}</Text>
                                        <View style={styles.workspaceOptionInfo}>
                                            <Text style={[styles.workspaceOptionLabel, isCurrent && styles.workspaceOptionLabelActive]}>
                                                {ws.label} {isCurrent && '(Current)'}
                                            </Text>
                                            <Text style={styles.workspaceOptionDesc}>{ws.description}</Text>
                                        </View>
                                    </View>
                                    {isCurrent && <ShieldCheck size={20} color={colors.primary} strokeWidth={2.5} />}
                                </Pressable>
                            );
                        })}
                    </View>
                </Pressable>
            </Modal>

            {/* ── Switching Workspace Loading Overlay ── */}
            {switchingWorkspace && (
                <View style={styles.overlayContainer}>
                    <View style={styles.overlayContent}>
                        <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
                        <Text style={styles.overlayText}>Switching workspace...</Text>
                    </View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingContainer: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
    scroll: { flex: 1 },
    content: { padding: 20, gap: 20, paddingBottom: layout.TAB_BAR_CLEARANCE + 72 },

    // Identity Card
    profileCard: {
        backgroundColor: colors.surface,
        borderRadius: 28,
        padding: 24,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        ...shadows.card,
    },
    avatar: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    avatarImg: {
        width: 72,
        height: 72,
        borderRadius: 36,
    },
    patientAvatarImg: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    avatarText: {
        fontSize: 22,
        ...FONT.bold,
        color: colors.primary,
    },
    badgeIcon: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: colors.primary,
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.surface,
    },
    profileDetails: {
        flex: 1,
        gap: 4,
    },
    companionName: {
        fontSize: 18,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    companionEmail: {
        fontSize: 13,
        ...FONT.medium,
        color: colors.textMuted,
    },
    roleBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
    },
    roleText: {
        fontSize: 12,
        ...FONT.bold,
        color: colors.primary,
    },

    // Care Circle
    sectionTitle: {
        fontSize: 15,
        ...FONT.bold,
        color: colors.textPrimary,
        marginBottom: 2,
        paddingLeft: 4,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        paddingHorizontal: 20,
        ...shadows.card,
    },
    patientItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
    },
    patientAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
    },
    patientAvatarText: {
        fontSize: 14,
        ...FONT.bold,
        color: colors.textSecondary,
    },
    patientName: {
        fontSize: 14,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    patientRelation: {
        fontSize: 11,
        ...FONT.semibold,
        color: colors.textMuted,
        marginTop: 2,
    },
    scoreChip: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
    },
    scoreChipText: {
        fontSize: 11,
        ...FONT.bold,
    },
    emptyCircle: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 30,
        gap: 10,
    },
    emptyCircleText: {
        fontSize: 13,
        ...FONT.medium,
        color: colors.textMuted,
    },

    // Preferences & Settings
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
    },
    settingTextCol: {
        flex: 1,
        gap: 3,
    },
    settingLabel: {
        fontSize: 14,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    settingDesc: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textMuted,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
    },
    actionLabel: {
        fontSize: 14,
        ...FONT.bold,
        color: colors.textPrimary,
        marginBottom: 3,
    },
    actionDesc: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textMuted,
    },
    statusPill: {
        backgroundColor: colors.successLight,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    statusPillText: {
        fontSize: 11,
        ...FONT.bold,
        color: colors.success,
    },

    // Logout
    logoutBtn: {
        flexDirection: 'row',
        backgroundColor: '#FFF5F5',
        borderRadius: 18,
        height: 54,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginTop: 10,
    },
    logoutText: {
        color: colors.danger,
        fontSize: 14,
        ...FONT.bold,
    },
    versionText: {
        fontSize: 11,
        ...FONT.bold,
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: 10,
    },
    workspacePill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.md,
        marginTop: 8,
    },
    workspacePillTxt: {
        fontSize: 12,
        ...FONT.bold,
        color: colors.danger,
    },
    bottomSheetContent: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 36,
        borderTopRightRadius: 36,
        padding: 24,
        paddingBottom: 40,
        width: '100%',
    },
    bottomSheetIndicator: {
        width: 40,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: colors.borderLight,
        alignSelf: 'center',
        marginBottom: 16,
    },
    bottomSheetSubtitle: {
        fontSize: 14,
        ...FONT.medium,
        color: colors.textMuted,
        marginBottom: 24,
    },
    workspaceOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: radius.lg,
        backgroundColor: colors.background,
        marginBottom: 12,
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    workspaceOptionActive: {
        backgroundColor: colors.primarySoft,
        borderColor: colors.primary,
    },
    workspaceOptionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    workspaceOptionIcon: {
        fontSize: 24,
        marginRight: 16,
    },
    workspaceOptionInfo: {
        flex: 1,
    },
    workspaceOptionLabel: {
        fontSize: 16,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    workspaceOptionLabelActive: {
        color: colors.primary,
    },
    workspaceOptionDesc: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textMuted,
        marginTop: 2,
    },
    overlayContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
    },
    overlayContent: {
        alignItems: 'center',
        padding: 24,
    },
    overlayText: {
        fontSize: 16,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.6)',
        justifyContent: 'flex-end',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 22,
        ...FONT.heavy,
        color: colors.textPrimary,
    },
});
