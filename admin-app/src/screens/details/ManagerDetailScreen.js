import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Theme } from '../../theme/theme';
import GradientHeader from '../../components/common/GradientHeader';
import { apiService } from '../../lib/api';

export default function ManagerDetailScreen({ navigation, route }) {
    const managerId = route?.params?.managerId;
    const [profile, setProfile] = useState(null);
    const [callers, setCallers] = useState([]);
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async (isSilent = false) => {
        try {
            if (!isSilent) setLoading(true);

            const profileRes = await apiService.profiles.getById(managerId);
            const prof = profileRes.data;
            setProfile(prof);

            // Once we have the profile, fetch callers + patients for their org
            const orgId = prof?.organizationId?._id || prof?.organizationId;
            if (orgId) {
                const [callersRes, patientsRes] = await Promise.all([
                    apiService.profiles.getAll({ role: 'caller', organizationId: orgId, limit: 100 }).catch(() => ({ data: [] })),
                    apiService.patients.getAll({ organizationId: orgId, limit: 100 }).catch(() => ({ data: [] })),
                ]);

                const cList = callersRes.data?.profiles || callersRes.data || [];
                setCallers(Array.isArray(cList) ? cList : []);

                const pList = patientsRes.data?.patients || patientsRes.data?.data || patientsRes.data || [];
                setPatients(Array.isArray(pList) ? pList : []);
            }
        } catch (err) {
            console.error('[ManagerDetail] Failed to fetch:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [managerId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData(true);
    }, [fetchData]);

    if (loading) {
        return (
            <View style={s.container}>
                <StatusBar barStyle="dark-content" />
                <GradientHeader title="Loading..." onBack={() => navigation.goBack()} />
                <View style={s.loadingBox}><ActivityIndicator size="large" color="#3B82F6" /></View>
            </View>
        );
    }

    const name = profile?.fullName || 'Unknown';
    const email = profile?.email || '—';
    const phone = profile?.phone || 'No phone';
    const isActive = profile?.isActive !== false;
    const org = profile?.organizationId?.name || '—';
    const joinDate = profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const patientsCount = profile?.metadata?.patientsCount ?? patients.length;
    const callersCount = profile?.metadata?.callersCount ?? callers.length;

    return (
        <View style={s.container}>
            <StatusBar barStyle="dark-content" />
            <GradientHeader title={name} subtitle="CARE MANAGER" onBack={() => navigation.goBack()}>
                <View style={s.headerStats}>
                    <View style={s.hStat}>
                        <Text style={[s.hStatVal, Theme.typography.common]}>{callersCount}</Text>
                        <Text style={[s.hStatLbl, Theme.typography.common]}>CALLERS</Text>
                    </View>
                    <View style={s.hStatDivider} />
                    <View style={s.hStat}>
                        <Text style={[s.hStatVal, Theme.typography.common]}>{patientsCount}</Text>
                        <Text style={[s.hStatLbl, Theme.typography.common]}>PATIENTS</Text>
                    </View>
                    <View style={s.hStatDivider} />
                    <View style={s.hStat}>
                        <Text style={[s.hStatVal, Theme.typography.common]}>{isActive ? 'Active' : 'Inactive'}</Text>
                        <Text style={[s.hStatLbl, Theme.typography.common]}>STATUS</Text>
                    </View>
                </View>
            </GradientHeader>

            <ScrollView 
                style={s.body} 
                contentContainerStyle={s.scrollContent} 
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
            >
                {/* Profile Info */}
                <Text style={[s.sectionTitle, Theme.typography.common]}>Contact Information</Text>
                <View style={s.sectionCard}>
                    <View style={s.infoRow}>
                        <Feather name="mail" size={16} color="#3B82F6" />
                        <View style={s.infoContent}>
                            <Text style={[s.infoLabel, Theme.typography.common]}>EMAIL</Text>
                            <Text style={[s.infoValue, Theme.typography.common]}>{email}</Text>
                        </View>
                    </View>
                    <View style={s.cardDivider} />
                    <View style={s.infoRow}>
                        <Feather name="phone" size={16} color="#10B981" />
                        <View style={s.infoContent}>
                            <Text style={[s.infoLabel, Theme.typography.common]}>PHONE</Text>
                            <Text style={[s.infoValue, Theme.typography.common]}>{phone}</Text>
                        </View>
                    </View>
                    <View style={s.cardDivider} />
                    <View style={s.infoRow}>
                        <Feather name="briefcase" size={16} color="#8B5CF6" />
                        <View style={s.infoContent}>
                            <Text style={[s.infoLabel, Theme.typography.common]}>ORGANIZATION</Text>
                            <Text style={[s.infoValue, Theme.typography.common]}>{org}</Text>
                        </View>
                    </View>
                    <View style={s.cardDivider} />
                    <View style={s.infoRow}>
                        <Feather name="calendar" size={16} color="#F59E0B" />
                        <View style={s.infoContent}>
                            <Text style={[s.infoLabel, Theme.typography.common]}>JOINED</Text>
                            <Text style={[s.infoValue, Theme.typography.common]}>{joinDate}</Text>
                        </View>
                    </View>
                </View>

                {/* Direct Reports — Callers */}
                <Text style={[s.sectionTitle, Theme.typography.common]}>Direct Reports — Callers ({callers.length})</Text>
                <View style={s.sectionCard}>
                    {callers.length === 0 ? (
                        <View style={s.emptyBox}>
                            <Feather name="headphones" size={28} color="#CBD5E1" style={{ marginBottom: 12 }} />
                            <Text style={[s.emptyText, Theme.typography.common]}>No callers assigned</Text>
                        </View>
                    ) : (
                        callers.map((c, i) => {
                            const cName = c.fullName || 'Unknown';
                            const cId = c._id || c.id;
                            const cActive = c.isActive !== false;
                            return (
                                <View key={cId || i}>
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        onPress={() => navigation.navigate('CallerDetail', { callerId: cId })}
                                        style={s.itemRow}
                                    >
                                        <View style={s.avatarBox}>
                                            <Text style={s.avatarText}>{cName.charAt(0)}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[s.itemName, Theme.typography.common]}>{cName}</Text>
                                            <Text style={[s.itemSub, Theme.typography.common]}>{c.email}</Text>
                                        </View>
                                        <View style={[s.statusPill, { backgroundColor: cActive ? '#10B98115' : '#64748B15' }]}>
                                            <Text style={[s.statusText, Theme.typography.common, { color: cActive ? '#10B981' : '#64748B' }]}>
                                                {cActive ? 'ACTIVE' : 'OFFLINE'}
                                            </Text>
                                        </View>
                                        <Feather name="chevron-right" size={18} color="#475569" style={{ marginLeft: 12 }} />
                                    </TouchableOpacity>
                                    {i < callers.length - 1 && <View style={s.cardDivider} />}
                                </View>
                            );
                        })
                    )}
                </View>

                {/* Patient Roster */}
                <Text style={[s.sectionTitle, Theme.typography.common]}>Patient Roster ({patients.length})</Text>
                <View style={s.sectionCard}>
                    {patients.length === 0 ? (
                        <View style={s.emptyBox}>
                            <Feather name="users" size={28} color="#CBD5E1" style={{ marginBottom: 12 }} />
                            <Text style={[s.emptyText, Theme.typography.common]}>No patients in this organization</Text>
                        </View>
                    ) : (
                        patients.map((p, i) => {
                            const pName = p.name || p.fullName || 'Unknown';
                            const pId = p._id || p.id;
                            return (
                                <View key={pId || i}>
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        onPress={() => navigation.navigate('PatientDetail', { patientId: pId })}
                                        style={s.itemRow}
                                    >
                                        <View style={[s.avatarBox, { backgroundColor: '#1E293B10' }]}>
                                            <Text style={[s.avatarText, { color: '#3B82F6' }]}>{pName.charAt(0)}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[s.itemName, Theme.typography.common]}>{pName}</Text>
                                            <Text style={[s.itemSub, Theme.typography.common]}>{p.email || 'View patient profile'}</Text>
                                        </View>
                                        <Feather name="chevron-right" size={18} color="#475569" />
                                    </TouchableOpacity>
                                    {i < patients.length - 1 && <View style={s.cardDivider} />}
                                </View>
                            );
                        })
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    body: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 120 },
    loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    headerStats: {
        flexDirection: 'row', justifyContent: 'space-around', marginTop: 20,
        backgroundColor: '#FFFFFF', borderRadius: 20, paddingVertical: 20,
        borderWidth: 1, borderColor: '#F1F5F9', ...Theme.shadows.sharp,
    },
    hStat: { alignItems: 'center', flex: 1 },
    hStatVal: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
    hStatLbl: { fontSize: 9, fontWeight: '700', color: '#94A3B8', marginTop: 4, letterSpacing: 0.5 },
    hStatDivider: { width: 1, backgroundColor: '#F1F5F9' },

    sectionTitle: { fontSize: 12, fontWeight: '700', color: '#64748B', letterSpacing: 1, textTransform: 'uppercase', marginTop: 28, marginBottom: 12, paddingLeft: 4 },
    sectionCard: {
        backgroundColor: '#FFFFFF', borderRadius: 20, ...Theme.shadows.sharp,
        overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9',
    },

    infoRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 },
    infoContent: { flex: 1 },
    infoLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 2 },
    infoValue: { fontSize: 15, fontWeight: '700', color: '#1E293B' },

    itemRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    avatarBox: {
        width: 44, height: 44, borderRadius: 12, backgroundColor: '#F8FAFC',
        justifyContent: 'center', alignItems: 'center', marginRight: 16,
        borderWidth: 1, borderColor: '#F1F5F9',
    },
    avatarText: { fontSize: 18, fontWeight: '800', color: '#6366F1' },
    itemName: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
    itemSub: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '600' },

    statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

    cardDivider: { height: 1, backgroundColor: '#F1F5F9', marginLeft: 16 },

    emptyBox: { paddingVertical: 40, alignItems: 'center' },
    emptyText: { fontSize: 14, fontWeight: '700', color: '#94A3B8' },
});
