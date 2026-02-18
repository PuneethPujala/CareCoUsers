import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, StatusBar, Alert, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, Radius, Shadows } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';

const ROLE_LABELS = {
    super_admin: 'Super Admin', org_admin: 'Org Admin', care_manager: 'Care Manager',
    caller: 'Caller', mentor: 'Patient Mentor', patient: 'Patient',
};

const ROLE_CONNECTIONS = {
    caller: { org: 'City General Hospital', manager: 'Alice Manager', phone: '555-0101', orgId: 'o1', managerId: 'm1' },
    care_manager: { org: 'City General Hospital', phone: '555-0100', orgId: 'o1' },
    org_admin: { org: 'City General Hospital', phone: '555-0200', orgId: 'o1' },
    mentor: { org: 'City General Hospital', manager: 'Alice Manager', phone: '555-0301', orgId: 'o1', managerId: 'm1' },
    patient: { org: 'City General Hospital', caller: 'Sarah Johnson', phone: '555-0400', orgId: 'o1', callerId: 'c2' },
    super_admin: { phone: '555-0000' },
};

function ConnectionItem({ icon, label, value, onPress }) {
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={s.connItem}>
            <View style={s.connIcon}><Text style={{ fontSize: 16 }}>{icon}</Text></View>
            <View style={{ flex: 1 }}>
                <Text style={s.connLabel}>{label}</Text>
                <Text style={s.connValue}>{value}</Text>
            </View>
            <Text style={s.connArrow}>›</Text>
        </TouchableOpacity>
    );
}

function SettingsItem({ icon, label, value, onPress }) {
    return (
        <TouchableOpacity onPress={onPress} style={s.settItem} activeOpacity={0.7}>
            <Text style={s.settIcon}>{icon}</Text>
            <Text style={s.settLabel}>{label}</Text>
            <View style={{ flex: 1 }} />
            {value && <Text style={s.settValue}>{value}</Text>}
            <Text style={s.settArrow}>›</Text>
        </TouchableOpacity>
    );
}

export default function ProfileScreen({ navigation }) {
    const { user, selectedRole, logout } = useAuth();
    const initial = user?.name?.charAt(0)?.toUpperCase() || 'U';
    const roleColor = Colors.role[selectedRole] || Colors.primary;
    const conn = ROLE_CONNECTIONS[selectedRole] || {};
const handleLogout = () => {
        Alert.alert('Sign Out', 'Are you sure you want to sign out of CareConnect?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: logout },
        ]);
    };

    return (
        <View style={s.container}>
            <StatusBar barStyle="light-content" />

            {/* Gradient Header */}
            <LinearGradient colors={Colors.gradient} style={s.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <SafeAreaView edges={['top']}>
                    <View style={s.headerTop}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                            <Text style={s.backText}>←</Text>
                        </TouchableOpacity>
                        <Text style={s.headerTitle}>Profile</Text>
                        <TouchableOpacity style={s.editBtn}>
                            <Text style={s.editText}>Edit</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={s.profileArea}>
                        <View style={s.avatar}>
                            <Text style={s.avatarText}>{initial}</Text>
                        </View>
                        <Text style={s.profileName}>{user?.name || 'User'}</Text>
                        <Text style={s.profileEmail}>{user?.email || 'user@careconnect.com'}</Text>
                        <StatusBadge
                            label={ROLE_LABELS[selectedRole] || selectedRole}
                            variant="info"
                            style={{ backgroundColor: 'rgba(255,255,255,0.2)', marginTop: Spacing.sm }}
                        />
                    </View>
                </SafeAreaView>
            </LinearGradient>

            <ScrollView style={s.body} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                <View>
                    {/* Connections */}
                    <Text style={s.sectionTitle}>CONNECTIONS</Text>
                    <View style={s.sectionCard}>
                        {conn.org && (
                            <ConnectionItem icon="🏥" label="Organization" value={conn.org}
                                onPress={() => navigation.navigate('OrgDetail', { orgId: conn.orgId })} />
                        )}
                        {conn.manager && (
                            <>
                                <View style={s.divider} />
                                <ConnectionItem icon="📋" label="Care Manager" value={conn.manager}
                                    onPress={() => navigation.navigate('ManagerDetail', { managerId: conn.managerId })} />
                            </>
                        )}
                        {conn.caller && (
                            <>
                                <View style={s.divider} />
                                <ConnectionItem icon="📞" label="Assigned Caller" value={conn.caller}
                                    onPress={() => navigation.navigate('CallerDetail', { callerId: conn.callerId })} />
                            </>
                        )}
                    </View>

                    {/* Contact */}
                    <Text style={s.sectionTitle}>CONTACT INFO</Text>
                    <View style={s.sectionCard}>
                        <ConnectionItem icon="✉️" label="Email" value={user?.email || 'user@careconnect.com'}
                            onPress={() => Linking.openURL(`mailto:${user?.email}`)} />
                        <View style={s.divider} />
                        <ConnectionItem icon="📱" label="Phone" value={conn.phone || '555-0000'}
                            onPress={() => Linking.openURL(`tel:${conn.phone || '555-0000'}`)} />
                    </View>

                    {/* Settings */}
                    <Text style={s.sectionTitle}>SETTINGS</Text>
                    <View style={s.sectionCard}>
                        <SettingsItem icon="🔔" label="Notifications" value="On" />
                        <View style={s.divider} />
                        <SettingsItem icon="🔒" label="Privacy & Security" />
                        <View style={s.divider} />
                        <SettingsItem icon="🌐" label="Language" value="English" />
                    </View>

                    {/* Support */}
                    <Text style={s.sectionTitle}>SUPPORT</Text>
                    <View style={s.sectionCard}>
                        <SettingsItem icon="❓" label="Help Center" />
                        <View style={s.divider} />
                        <SettingsItem icon="📝" label="Terms of Service" />
                        <View style={s.divider} />
                        <SettingsItem icon="🛡️" label="Privacy Policy" />
                    </View>

                    {/* Logout */}
                    <TouchableOpacity onPress={handleLogout} style={s.logoutBtn} activeOpacity={0.8}>
                        <Text style={s.logoutText}>Sign Out</Text>
                    </TouchableOpacity>

                    <Text style={s.version}>CareConnect v1.0.0</Text>
                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    // Header
    header: { paddingBottom: Spacing.xl },
    headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
    backBtn: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    backText: { fontSize: 20, color: '#fff', fontWeight: '700' },
    headerTitle: { ...Typography.h3, color: '#fff' },
    editBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)' },
    editText: { ...Typography.caption, color: '#fff', fontWeight: '600' },
    profileArea: { alignItems: 'center', marginTop: Spacing.lg },
    avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
    avatarText: { fontSize: 32, fontWeight: '700', color: '#fff' },
    profileName: { ...Typography.h2, color: '#fff', marginTop: Spacing.md },
    profileEmail: { ...Typography.caption, color: 'rgba(255,255,255,0.7)', marginTop: Spacing.xs },
    // Body
    body: { flex: 1, paddingHorizontal: Spacing.md, marginTop: -Spacing.sm },
    sectionTitle: { ...Typography.tiny, color: Colors.textMuted, letterSpacing: 1.5, marginTop: Spacing.lg, marginBottom: Spacing.sm, paddingHorizontal: Spacing.xs },
    sectionCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, overflow: 'hidden', ...Shadows.card },
    divider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 56 },
    // Connection Items
    connItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 14, gap: Spacing.md },
    connIcon: { width: 36, height: 36, borderRadius: Radius.sm + 2, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    connLabel: { ...Typography.tiny, color: Colors.textMuted },
    connValue: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14, marginTop: 2 },
    connArrow: { fontSize: 22, color: Colors.textMuted },
    // Settings Items
    settItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 15, gap: Spacing.md },
    settIcon: { fontSize: 18 },
    settLabel: { ...Typography.bodyMedium, color: Colors.textPrimary, fontSize: 15 },
    settValue: { ...Typography.caption, color: Colors.textMuted },
    settArrow: { fontSize: 20, color: Colors.textMuted },
    // Logout
    logoutBtn: { marginTop: Spacing.xl, paddingVertical: Spacing.md, alignItems: 'center', borderRadius: Radius.lg, backgroundColor: Colors.errorLight, borderWidth: 1.5, borderColor: Colors.error + '25' },
    logoutText: { ...Typography.bodySemibold, color: Colors.error },
    version: { textAlign: 'center', marginTop: Spacing.md, ...Typography.tiny, color: Colors.textMuted },
});
