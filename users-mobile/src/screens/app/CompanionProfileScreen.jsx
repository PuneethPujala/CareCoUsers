import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Switch, Share } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../lib/api';
import { LogOut, ShieldCheck, Heart, User, Settings, ArrowRight, UserCheck, Share2, Phone } from 'lucide-react-native';
import AlertManager from '../../utils/AlertManager';

const C = {
    bg: '#F8FAFC',
    surface: '#FFFFFF',
    primary: '#0EA5E9',
    primaryLight: '#E0F2FE',
    dark: '#0F172A',
    mid: '#475569',
    light: '#94A3B8',
    danger: '#EF4444',
    dangerLight: '#FEE2E2',
    success: '#10B981',
    successLight: '#D1FAE5',
    border: '#F1F5F9',
};

const FONT = {
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export default function CompanionProfileScreen() {
    const { signOut, user, profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [linkedPatients, setLinkedPatients] = useState([]);
    const [pushEnabled, setPushEnabled] = useState(true);

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

    const handleShareInviteCode = async () => {
        try {
            await Share.share({
                message: `Hey! I'm set up as a Care Companion on CareMyMed. You can link your account with me by inviting me to your Care Circle.`,
            });
        } catch (err) {
            console.warn('Share failed', err);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={C.primary} />
            </View>
        );
    }

    const companionName = profile?.fullName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Caregiver';
    const initials = companionName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerSub}>Account Setting</Text>
                    <Text style={styles.title}>Companion Profile</Text>
                </View>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                {/* 1. Profile Identity Card */}
                <View style={styles.profileCard}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials}</Text>
                        <View style={styles.badgeIcon}>
                            <UserCheck size={12} color="#FFF" strokeWidth={2.5} />
                        </View>
                    </View>
                    <View style={styles.profileDetails}>
                        <Text style={styles.companionName}>{companionName}</Text>
                        <Text style={styles.companionEmail}>{user?.email}</Text>
                        <View style={styles.roleBadge}>
                            <ShieldCheck size={12} color={C.primary} />
                            <Text style={styles.roleText}>Family Care Companion</Text>
                        </View>
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
                                        <Text style={styles.patientAvatarText}>{pInitials}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.patientName}>{p.name}</Text>
                                        <Text style={styles.patientRelation}>Monitored Member</Text>
                                    </View>
                                    {p.health_score !== undefined && (
                                        <View style={[
                                            styles.scoreChip,
                                            { backgroundColor: p.health_score > 70 ? C.successLight : '#FEF3C7' }
                                        ]}>
                                            <Text style={[
                                                styles.scoreChipText,
                                                { color: p.health_score > 70 ? C.success : '#D97706' }
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
                            <Heart color={C.light} size={28} />
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
                            trackColor={{ false: '#E2E8F0', true: C.primaryLight }}
                            thumbColor={pushEnabled ? C.primary : '#94A3B8'}
                        />
                    </View>

                    <Pressable style={styles.actionRow} onPress={handleShareInviteCode}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.actionLabel}>Share Companion Link</Text>
                            <Text style={styles.actionDesc}>Invite another family member to join</Text>
                        </View>
                        <Share2 size={18} color={C.light} />
                    </Pressable>

                    <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
                        <View style={styles.settingTextCol}>
                            <Text style={styles.settingLabel}>Real-time Dashboard Sync</Text>
                            <Text style={styles.settingDesc}>Updates metrics every 30 seconds</Text>
                        </View>
                        <View style={styles.statusPill}>
                            <Text style={styles.statusPillText}>Operational</Text>
                        </View>
                    </View>
                </View>

                {/* 4. Logout Button */}
                <Pressable style={styles.logoutBtn} onPress={handleLogout}>
                    <LogOut size={18} color={C.danger} />
                    <Text style={styles.logoutText}>Sign Out from Companion Account</Text>
                </Pressable>

                <Text style={styles.versionText}>CareMyMed Companion App • Version 1.0.0 (Prod)</Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    loadingContainer: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
    header: { 
        paddingTop: 60, 
        paddingHorizontal: 24, 
        paddingBottom: 20, 
        backgroundColor: C.surface,
        borderBottomWidth: 1,
        borderBottomColor: '#F8FAFC',
    },
    headerSub: {
        fontSize: 12,
        ...FONT.semibold,
        color: C.primary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    title: { fontSize: 24, ...FONT.heavy, color: C.dark },
    
    scroll: { flex: 1 },
    content: { padding: 20, gap: 20, paddingBottom: 40 },

    // Identity Card
    profileCard: {
        backgroundColor: C.surface,
        borderRadius: 28,
        padding: 24,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        borderWidth: 1,
        borderColor: C.border,
    },
    avatar: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: C.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    avatarText: {
        fontSize: 22,
        ...FONT.bold,
        color: C.primary,
    },
    badgeIcon: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: C.primary,
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: C.surface,
    },
    profileDetails: {
        flex: 1,
        gap: 4,
    },
    companionName: {
        fontSize: 18,
        ...FONT.bold,
        color: C.dark,
    },
    companionEmail: {
        fontSize: 13,
        ...FONT.medium,
        color: C.light,
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
        color: C.primary,
    },

    // Care Circle
    sectionTitle: {
        fontSize: 15,
        ...FONT.bold,
        color: C.dark,
        marginBottom: 2,
        paddingLeft: 4,
    },
    card: {
        backgroundColor: C.surface,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: C.border,
        paddingHorizontal: 20,
    },
    patientItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
    },
    patientAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: C.border,
    },
    patientAvatarText: {
        fontSize: 14,
        ...FONT.bold,
        color: C.mid,
    },
    patientName: {
        fontSize: 14,
        ...FONT.bold,
        color: C.dark,
    },
    patientRelation: {
        fontSize: 11,
        ...FONT.semibold,
        color: C.light,
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
        color: C.light,
    },

    // Preferences & Settings
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
    },
    settingTextCol: {
        flex: 1,
        gap: 3,
    },
    settingLabel: {
        fontSize: 14,
        ...FONT.bold,
        color: C.dark,
    },
    settingDesc: {
        fontSize: 12,
        ...FONT.medium,
        color: C.light,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
    },
    actionLabel: {
        fontSize: 14,
        ...FONT.bold,
        color: C.dark,
        marginBottom: 3,
    },
    actionDesc: {
        fontSize: 12,
        ...FONT.medium,
        color: C.light,
    },
    statusPill: {
        backgroundColor: C.successLight,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    statusPillText: {
        fontSize: 11,
        ...FONT.bold,
        color: C.success,
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
        borderWidth: 1,
        borderColor: '#FEE2E2',
        marginTop: 10,
    },
    logoutText: {
        color: C.danger,
        fontSize: 14,
        ...FONT.bold,
    },
    versionText: {
        fontSize: 11,
        ...FONT.bold,
        color: C.light,
        textAlign: 'center',
        marginTop: 10,
    },
});
