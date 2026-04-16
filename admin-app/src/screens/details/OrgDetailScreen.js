import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Alert, Modal, StatusBar, Dimensions } from 'react-native';

import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../../theme/theme';
import { Shadows } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import { apiService } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function OrgDetailScreen({ navigation, route }) {
    const orgId = route?.params?.orgId;
    const [org, setOrg] = useState(null);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [statusModalVisible, setStatusModalVisible] = useState(false);
    const [toggling, setToggling] = useState(false);
    
    const { profile } = useAuth();
    const isSuperAdmin = profile?.role === 'super_admin';

    const fetchOrg = useCallback(async () => {
        if (!orgId) return;
        try {
            const orgRes = await apiService.organizations.getById(orgId);
            setOrg(orgRes.data);
        } catch (error) {
            console.error('Failed to load organization', error);
        }
    }, [orgId]);

    const fetchStats = useCallback(async () => {
        if (!orgId) return;
        try {
            const statsRes = await apiService.organizations.getStats(orgId);
            setStats(statsRes.data);
        } catch (error) {
            console.error('Failed to load organization stats', error);
        }
    }, [orgId]);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchOrg(), fetchStats()]);
            setLoading(false);
        };
        if (orgId) loadData();
    }, [orgId, fetchOrg, fetchStats]);

    if (loading) {
        return (
            <View style={[s.container, s.center]}>
                <ActivityIndicator size="large" color="#4F46E5" />
            </View>
        );
    }

    if (!org) {
        return (
            <View style={[s.container, s.center]}>
                <Feather name="alert-circle" size={48} color="#94A3B8" />
                <Text style={s.errorText}>Organization not found.</Text>
            </View>
        );
    }

    const formatAddress = (addr) => {
        if (!addr) return 'Regional Hub, India';
        if (typeof addr === 'string') return addr.replace(/\b(US|USA)\b/g, 'India');
        const parts = [addr.street, addr.district || addr.city, addr.state, addr.country === 'US' || addr.country === 'USA' ? 'India' : addr.country].filter(Boolean);
        return parts.length > 0 ? parts.join(', ') : 'Regional Hub, India';
    };

    const displayStats = [
        { role: 'org_admin', label: 'ORG ADMINS', value: stats?.userStats?.['org_admin'] || '0', icon: 'shield' },
        { role: 'care_manager', label: 'MANAGERS', value: stats?.userStats?.['care_manager'] || '0', icon: 'clipboard' },
        { role: 'caller', label: 'CALLERS', value: stats?.userStats?.['caller'] || '0', icon: 'phone-call' },
        { type: 'patients', label: 'PATIENTS', value: stats?.organization?.currentPatientCount || org.currentPatientCount || '0', icon: 'users' },
    ];

    const isOrgActive = org?.isActive !== false;

    const handleToggleStatus = async () => {
        setToggling(true);
        try {
            const newStatus = !isOrgActive;
            await apiService.organizations.toggleStatus(orgId, newStatus);
            setOrg(prev => ({ ...prev, isActive: newStatus }));
            setStatusModalVisible(false);
            
            // Replaced traditional alerts with visually pleasing seamless updates if possible, 
            // but standard Alert is okay here as long as the UI feels HD
            Alert.alert('Status Updated', newStatus ? 'Organization has been reactivated successfully.' : 'Organization has been deactivated. All external access is now suspended.');
        } catch (error) {
            const msg = error.response?.data?.error || 'Failed to update organization status.';
            Alert.alert('System Error', msg);
        } finally {
            setToggling(false);
        }
    };

    return (
        <View style={s.container}>
            <StatusBar barStyle="dark-content" />
            <GradientHeader title="Facilities" subtitle="Organization database" onBack={() => navigation.goBack()} />

            <ScrollView style={s.body} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
                
                {/* ─── Massive HD Hero Card ─── */}
                <View style={s.heroWrapper}>
                    <View style={s.heroContent}>
                        <View style={s.heroHeaderRow}>
                            <View style={s.heroIconContainer}>
                                <Feather name="layers" size={28} color="#4F46E5" />
                            </View>
                            <View style={[s.statusPill, { backgroundColor: isOrgActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)' }]}>
                                <View style={[s.statusDot, { backgroundColor: isOrgActive ? '#34D399' : '#FCA5A5' }]} />
                                <Text style={[s.statusText, { color: isOrgActive ? '#34D399' : '#FCA5A5' }]}>
                                    {isOrgActive ? 'ACTIVE FACILITY' : 'SUSPENDED'}
                                </Text>
                            </View>
                        </View>
                        <Text style={s.heroTitle}>{org.name}</Text>
                        <Text style={s.heroSubtitle}>{org.type?.toUpperCase() || 'HEALTHCARE PROVIDER'}</Text>
                    </View>
                </View>

                {/* ─── Massive Stats Grid ─── */}
                <View style={s.statsGrid}>
                    {displayStats.map((item, i) => (
                        <TouchableOpacity 
                            key={i} 
                            activeOpacity={0.8}
                            onPress={() => {
                                if (item.type === 'patients') {
                                    navigation.navigate('PatientsList', { organizationId: orgId });
                                } else {
                                    navigation.navigate('TeamList', { role: item.role, organizationId: orgId });
                                }
                            }}
                            style={s.statCard}
                        >
                            <View style={s.statIconBox}>
                                <Feather name={item.icon} size={18} color="#4F46E5" />
                            </View>
                            <Text style={s.statValue}>{item.value}</Text>
                            <Text style={s.statLabel}>{item.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* ─── Monolithic Revenue Panel ─── */}
                <View style={s.revenueSplitBox}>
                    <View style={s.revenueSplitHalf}>
                        <View style={[s.infoIconBox, { width: 44, height: 44, backgroundColor: '#ECFDF5', borderColor: '#D1FAE5' }]}>
                            <Feather name="users" size={18} color="#10B981" />
                        </View>
                        <Text style={s.revenueLabel}>Patient Revenue</Text>
                        <Text style={[s.revenueValue, { color: '#10B981' }]}>
                            ₹ {(stats?.organization?.patientRevenue || 0).toLocaleString('en-IN')}
                        </Text>
                    </View>
                    <View style={s.revenueSplitDivider} />
                    <View style={s.revenueSplitHalf}>
                        <View style={[s.infoIconBox, { width: 44, height: 44, backgroundColor: '#EEF2FF', borderColor: '#E0E7FF' }]}>
                            <Feather name="briefcase" size={18} color="#4F46E5" />
                        </View>
                        <Text style={s.revenueLabel}>Tie-Up Revenue</Text>
                        <Text style={[s.revenueValue, { color: '#4F46E5' }]}>
                            ₹ {(stats?.organization?.tieupRevenue || org.totalRevenue || 0).toLocaleString('en-IN')}
                        </Text>
                    </View>
                </View>

                {/* ─── HD Data Readout ─── */}
                <Text style={s.sectionTitle}>Facility Information</Text>
                <View style={s.masterCard}>
                    <View style={s.infoRow}>
                        <View style={s.infoIconBox}><Feather name="map-pin" size={18} color="#0EA5E9" /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.infoLabel}>Primary Coordinates</Text>
                            <Text style={s.infoValue}>{formatAddress(org.address)}</Text>
                        </View>
                    </View>
                    <View style={s.infoDivider} />
                    <View style={s.infoRow}>
                        <View style={s.infoIconBox}><Feather name="phone" size={18} color="#10B981" /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.infoLabel}>Direct Line</Text>
                            <Text style={s.infoValue}>{org.phone || 'Not Configured'}</Text>
                        </View>
                    </View>
                    <View style={s.infoDivider} />
                    <View style={s.infoRow}>
                        <View style={s.infoIconBox}><Feather name="mail" size={18} color="#8B5CF6" /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.infoLabel}>System Email</Text>
                            <Text style={s.infoValue}>{org.email || 'Not Configured'}</Text>
                        </View>
                    </View>
                </View>

                {/* ─── Tie-Ups Cards ─── */}
                {org.collaborations && org.collaborations.length > 0 && (
                    <>
                        <Text style={s.sectionTitle}>Active Partnerships</Text>
                        <View style={s.collabList}>
                            {org.collaborations.map((collab, index) => (
                                <View key={index} style={s.collabCard}>
                                    <View style={s.collabHeader}>
                                        <View style={s.collabIconBox}>
                                            <Feather name="briefcase" size={18} color="#4F46E5" />
                                        </View>
                                        <View style={{ flex: 1, marginLeft: 16 }}>
                                            <Text style={s.collabPartner}>{collab.partnerName}</Text>
                                            <Text style={s.collabDate}>
                                                {new Date(collab.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                                            </Text>
                                        </View>
                                        <View style={s.collabAmountBox}>
                                            <Text style={s.collabAmount}>₹ {collab.dealAmount?.toLocaleString('en-IN')}</Text>
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </>
                )}

                {/* ─── Advanced Administration ─── */}
                {isSuperAdmin && (
                    <>
                        <Text style={[s.sectionTitle, { marginTop: 12 }]}>Administration Console</Text>
                        
                        <TouchableOpacity style={s.adminBtn} activeOpacity={0.8} onPress={() => navigation.navigate('CreateOrganization', { editMode: true, orgData: org })}>
                            <Feather name="edit-3" size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
                            <Text style={s.adminBtnText}>Modify Organization Structure</Text>
                        </TouchableOpacity>

                        <Text style={[s.dangerTitle, !isOrgActive && { color: '#10B98190' }]}>
                            {isOrgActive ? 'Operational Status' : 'Organization Suspended'}
                        </Text>
                        
                        <View style={[s.dangerCard, !isOrgActive && { borderColor: '#A7F3D0', shadowColor: '#10B981' }]}>
                            <View style={s.dangerHeader}>
                                <View style={[s.dangerIconWrap, !isOrgActive && { backgroundColor: '#ECFDF5' }]}>
                                    <Feather name={isOrgActive ? 'pause-circle' : 'play-circle'} size={24} color={isOrgActive ? '#F59E0B' : '#10B981'} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={[s.dangerActionTitle, { color: isOrgActive ? '#F59E0B' : '#10B981' }]}>
                                        {isOrgActive ? 'SUSPEND OPERATIONS' : 'REACTIVATE OPERATIONS'}
                                    </Text>
                                    <Text style={s.dangerActionDesc}>
                                        {isOrgActive
                                            ? 'Deactivating will instantly block all members from accessing the platform. Data will remain untouched.'
                                            : 'This organization is globally suspended. Reactivating will restore immediate access for all its members.'}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity 
                                style={[s.deleteBtn, !isOrgActive && { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', shadowColor: '#10B981' }]} 
                                activeOpacity={0.8}
                                onPress={() => setStatusModalVisible(true)}
                            >
                                <Feather name={isOrgActive ? 'power' : 'refresh-cw'} size={18} color={isOrgActive ? '#B45309' : '#059669'} style={{ marginRight: 10 }} />
                                <Text style={[s.deleteBtnText, { color: isOrgActive ? '#B45309' : '#059669' }]}>
                                    {isOrgActive ? 'Deactivate Now' : 'Reactivate Now'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </ScrollView>

            {/* Apple Style Bottom Sheet */}
            <Modal animationType="slide" transparent visible={statusModalVisible}>
                <View style={s.modalOverlay}>
                    <TouchableOpacity style={s.modalDismissLayer} activeOpacity={1} onPress={() => setStatusModalVisible(false)} />

                    <View style={s.modalSheet}>
                        <View style={s.modalHandle} />
                        
                        <View style={s.modalHeaderBlock}>
                            <View style={[s.modalIconWrapAlert, { backgroundColor: isOrgActive ? '#FEF3C7' : '#D1FAE5' }]}>
                                <Feather name={isOrgActive ? 'pause-circle' : 'play-circle'} size={32} color={isOrgActive ? '#D97706' : '#059669'} />
                            </View>
                            <Text style={s.modalTitleAlert}>
                                {isOrgActive ? 'Suspend Organization?' : 'Reactivate Organization?'}
                            </Text>
                            <Text style={s.modalDescAlert}>
                                {isOrgActive
                                    ? `All members of "${org.name}" will be locked out immediately. You can reverse this later.`
                                    : `All members of "${org.name}" will instantly regain system access.`}
                            </Text>
                        </View>
                        
                        <View style={s.modalActions}>
                            <TouchableOpacity style={s.modalCancelBtn} onPress={() => setStatusModalVisible(false)}>
                                <Text style={s.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[s.modalConfirmBtn, { backgroundColor: isOrgActive ? '#F59E0B' : '#10B981', shadowColor: isOrgActive ? '#F59E0B' : '#10B981' }]}
                                onPress={handleToggleStatus}
                                disabled={toggling}
                            >
                                <Text style={s.modalConfirmText}>
                                    {toggling ? 'Executing...' : (isOrgActive ? 'Deactivate' : 'Reactivate')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    center: { justifyContent: 'center', alignItems: 'center' },
    errorText: { color: '#64748B', marginTop: 16, fontSize: 16, fontWeight: '700' },
    
    body: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 60, paddingTop: 6 },
    
    // Massive Monolithic Hero Unit
    heroWrapper: { backgroundColor: '#FFFFFF', borderRadius: 32, padding: 32, paddingBottom: 28, overflow: 'hidden', marginTop: 12, marginBottom: 24, borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.lg, shadowColor: '#64748B', shadowOpacity: 0.08 },
    heroHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
    heroIconContainer: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E0E7FF' },
    heroTitle: { fontSize: 30, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5, marginBottom: 6 },
    heroSubtitle: { fontSize: 13, fontWeight: '800', color: '#64748B', letterSpacing: 1.5, textTransform: 'uppercase' },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.05)' },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

    // Huge Stats Grid
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 8 },
    statCard: { 
        width: '48%', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, marginBottom: 16, 
        ...Shadows.md, shadowColor: '#64748B', shadowOpacity: 0.06, borderWidth: 1, borderColor: '#F1F5F9' 
    },
    statIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    statValue: { fontSize: 28, fontWeight: '800', color: '#0F172A', marginBottom: 6 },
    statLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', letterSpacing: 0.5, textTransform: 'uppercase' },

    // Monolithic Revenue Box
    revenueSplitBox: { flexDirection: 'row', backgroundColor: '#FFFFFF', marginBottom: 32, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.lg, shadowColor: '#64748B', shadowOpacity: 0.08 },
    revenueSplitHalf: { flex: 1, alignItems: 'center' },
    revenueSplitDivider: { width: 1.5, backgroundColor: '#F1F5F9', alignSelf: 'stretch', marginHorizontal: 20 },
    revenueLabel: { fontSize: 12, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    revenueValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },

    // Standard Titles
    sectionTitle: { fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16, paddingLeft: 6 },
    
    // Master Block Info Card
    masterCard: { backgroundColor: '#FFFFFF', borderRadius: 32, padding: 24, paddingBottom: 16, marginBottom: 32, borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.md, shadowOpacity: 0.06 },
    infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 16 },
    infoIconBox: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    infoLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    infoValue: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
    infoDivider: { height: 1.5, backgroundColor: '#F1F5F9', marginVertical: 12 },

    // Apple Style Buttons
    adminBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A', borderRadius: 20, height: 72, ...Shadows.xl, shadowColor: '#0F172A', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 10 }, marginBottom: 40 },
    adminBtnText: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },

    // Collab Cards
    collabList: { gap: 16, marginBottom: 40 },
    collabCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, ...Shadows.md, shadowColor: '#64748B', shadowOpacity: 0.06, borderWidth: 1, borderColor: '#F1F5F9' },
    collabHeader: { flexDirection: 'row', alignItems: 'center' },
    collabIconBox: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
    collabPartner: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
    collabDate: { fontSize: 12, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5 },
    collabAmountBox: { backgroundColor: '#F0FDF4', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#DCFCE7' },
    collabAmount: { fontSize: 15, fontWeight: '800', color: '#16A34A' },

    // Danger Zone (Ultra Modern)
    dangerTitle: { fontSize: 12, fontWeight: '800', color: '#F59E0B', marginBottom: 12, paddingHorizontal: 6, textTransform: 'uppercase', letterSpacing: 1 },
    dangerCard: { backgroundColor: '#FFFFFF', borderColor: '#FEF3C7', borderWidth: 2, borderRadius: 32, padding: 28, ...Shadows.md, shadowColor: '#F59E0B', shadowOpacity: 0.1 },
    dangerHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 28 },
    dangerIconWrap: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#FFFBEB', justifyContent: 'center', alignItems: 'center' },
    dangerActionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6, letterSpacing: -0.3 },
    dangerActionDesc: { fontSize: 14, color: '#64748B', lineHeight: 22, fontWeight: '600' },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFBEB', borderRadius: 20, height: 64, borderWidth: 1, borderColor: '#FEF3C7', ...Shadows.md, shadowColor: '#F59E0B', shadowOpacity: 0.15 },
    deleteBtnText: { fontSize: 16, fontWeight: '800' },

    // Apple Bottom Sheet Style Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
    modalDismissLayer: { flex: 1 },
    modalSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 36, borderTopRightRadius: 36, paddingHorizontal: 28, paddingBottom: 40, ...Shadows['2xl'] },
    modalHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#E2E8F0', alignSelf: 'center', marginTop: 12, marginBottom: 24 },
    modalHeaderBlock: { alignItems: 'center', marginBottom: 32 },
    modalIconWrapAlert: { width: 72, height: 72, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    modalTitleAlert: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 8, textAlign: 'center', letterSpacing: -0.5 },
    modalDescAlert: { fontSize: 15, fontWeight: '600', color: '#64748B', textAlign: 'center', lineHeight: 22, paddingHorizontal: 10 },
    modalActions: { flexDirection: 'row', gap: 12, width: '100%' },
    modalCancelBtn: { flex: 1, paddingVertical: 18, borderRadius: 20, backgroundColor: '#F8FAFC', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
    modalCancelText: { fontSize: 16, fontWeight: '800', color: '#64748B' },
    modalConfirmBtn: { flex: 1, paddingVertical: 18, borderRadius: 20, alignItems: 'center', ...Shadows.md },
    modalConfirmText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
});
