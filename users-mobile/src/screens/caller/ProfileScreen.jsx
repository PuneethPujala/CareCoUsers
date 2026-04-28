import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Pressable } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme';
import { LogOut, Star, TrendingUp, AlertTriangle, ShieldCheck } from 'lucide-react-native';

import AlertManager from '../../utils/AlertManager';
export default function CallerProfileScreen() {
    const { displayName, signOut } = useAuth();

    const handleLogout = async () => {
        const res = await signOut();
        if (res.error) AlertManager.alert('Error', res.error);
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Profile</Text>
            </View>

            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>

                {/* Caller Avatar Card */}
                <View style={styles.profileCard}>
                    <View style={styles.avatarRow}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{displayName?.charAt(0)}</Text>
                        </View>
                        <View style={styles.profileDetails}>
                            <Text style={styles.callerName}>{displayName}</Text>
                            <Text style={styles.callerId}>ID: CC-8924</Text>
                            <View style={styles.roleChip}>
                                <Text style={styles.roleChipTxt}>Care Caller</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Performance Stats */}
                <Text style={styles.sectionTitle}>Performance (This Week)</Text>
                <View style={styles.statsGrid}>
                    <View style={styles.statBox}>
                        <Star size={20} color={colors.accent} style={{ marginBottom: 8 }} />
                        <Text style={styles.statVal}>184</Text>
                        <Text style={styles.statLabel}>Calls Dialed</Text>
                    </View>
                    <View style={styles.statBox}>
                        <TrendingUp size={20} color={colors.success} style={{ marginBottom: 8 }} />
                        <Text style={styles.statVal}>94%</Text>
                        <Text style={styles.statLabel}>Adherence</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                        <AlertTriangle size={20} color={colors.danger} style={{ marginBottom: 8 }} />
                        <Text style={[styles.statVal, { color: colors.danger }]}>2</Text>
                        <Text style={styles.statLabel}>Escalations</Text>
                    </View>
                </View>

                {/* Manager Info */}
                <View style={styles.card}>
                    <View style={styles.rowTitle}>
                        <ShieldCheck size={18} color="#64748B" />
                        <Text style={styles.cardTitle}>Assigned Manager</Text>
                    </View>
                    <Text style={styles.managerName}>Dr. Vikram Singh</Text>
                    <Text style={styles.managerCity}>Mumbai Central Hub</Text>

                    <View style={styles.notesBox}>
                        <Text style={styles.notesTxt}>"Great job on follow-ups this week. Please keep an eye on Meena Devi's schedule."</Text>
                    </View>
                </View>

                {/* Logout */}
                <Pressable style={styles.logoutBtn} onPress={handleLogout}>
                    <LogOut size={18} color="#4A5568" />
                    <Text style={styles.logoutBtnText}>Log Out</Text>
                </Pressable>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F7FB' },
    header: {
        backgroundColor: colors.primary, // #0A2463
        paddingTop: Platform.OS === 'ios' ? 56 : 40,
        paddingBottom: 16, paddingHorizontal: 20,
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4,
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },

    body: { flex: 1 },
    bodyContent: { padding: 16, paddingBottom: 40 },

    profileCard: {
        backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20, marginBottom: 24,
        borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1,
    },
    avatarRow: { flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    avatarText: { fontSize: 28, fontWeight: '700', color: colors.accent },
    profileDetails: { flex: 1, alignItems: 'flex-start' },
    callerName: { fontSize: 18, fontWeight: '700', color: '#1A202C' },
    callerId: { fontSize: 13, color: '#64748B', marginTop: 4, marginBottom: 6 },
    roleChip: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    roleChipTxt: { fontSize: 11, fontWeight: '700', color: '#4A5568', textTransform: 'uppercase' },

    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1A202C', marginBottom: 12, marginLeft: 4 },

    statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    statBox: {
        flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, alignItems: 'center',
        borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1,
    },
    statVal: { fontSize: 20, fontWeight: '700', color: '#1A202C' },
    statLabel: { fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: '600', textAlign: 'center' },

    card: {
        backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20, marginBottom: 24,
        borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1,
    },
    rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: '#1A202C' },
    managerName: { fontSize: 16, fontWeight: '600', color: '#1A202C' },
    managerCity: { fontSize: 13, color: '#64748B', marginTop: 4 },

    notesBox: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 8, marginTop: 16, borderWidth: 1, borderColor: '#E2E8F0' },
    notesTxt: { fontSize: 13, color: '#4A5568', fontStyle: 'italic', lineHeight: 20 },

    logoutBtn: {
        flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 8, height: 50, borderWidth: 1, borderColor: '#CBD5E1',
        alignItems: 'center', justifyContent: 'center', gap: 10,
    },
    logoutBtnText: { color: '#4A5568', fontSize: 16, fontWeight: '600' },
});
