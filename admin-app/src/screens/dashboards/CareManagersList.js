import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, TextInput } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import { Search, X, User, Phone, Activity } from 'lucide-react-native';
import { Feather } from '@expo/vector-icons';

import EmptyState from '../../components/common/EmptyState';
import { apiService } from '../../lib/api';

// Removed Hardcoded CARE_MANAGERS array

function ManagerRow({ item, navigation }) {
    const load = item.metrics?.activeEscalations || 0;
    
    // Fallbacks
    const name = item.fullName || 'Unknown Manager';
    const email = item.email || '';
    const phone = item.phone || 'No phone';
    const initial = name.charAt(0).toUpperCase();

    // Active Escalations metric
    const displayScore = item.metrics?.activeEscalations !== undefined ? item.metrics.activeEscalations : 0;
    
    const isActive = item.isActive !== false;
    const statusLabel = isActive ? 'Active' : 'Offline';
    const accentColor = isActive ? '#10B981' : '#64748B';
    const bgLight = isActive ? '#ECFDF5' : '#F1F5F9';

    return (
        <TouchableOpacity onPress={() => navigation.navigate('ManagerDetail', { managerId: item._id || item.id })}
            activeOpacity={0.7} style={s.cardWrapper}>
            <View style={[s.userCard, { borderLeftColor: accentColor }]}>
                <View style={s.cardBody}>
                    <View style={s.avatarWrap}>
                        <LinearGradient colors={isActive ? ['#3B82F6', '#2563EB'] : ['#94A3B8', '#64748B']} style={s.avatarBg}>
                            <Text style={s.avatarLetter}>{initial}</Text>
                        </LinearGradient>
                        <View style={[s.statusDotSmall, { backgroundColor: isActive ? Colors.success : '#94A3B8' }]} />
                    </View>
                    
                    <View style={s.infoWrap}>
                        <Text style={s.itemTitle}>{name}</Text>
                        <View style={s.contactRow}>
                            <Feather name="mail" size={13} color="#94A3B8" style={{ marginRight: 6 }} />
                            <Text style={s.itemSubValue} numberOfLines={1}>{email || 'No email provided'}</Text>
                        </View>
                        <View style={s.contactRow}>
                            <Feather name="phone" size={13} color="#94A3B8" style={{ marginRight: 6 }} />
                            <Text style={s.itemSubValue}>{phone}</Text>
                        </View>
                    </View>

                    <View style={s.rightActionWrap}>
                        <View style={[s.statusBadge, { backgroundColor: bgLight }]}>
                            <View style={[s.statusDot, { backgroundColor: accentColor }]} />
                            <Text style={[s.statusText, { color: accentColor }]}>{statusLabel}</Text>
                        </View>
                        <View style={s.perfWrap}>
                            <Text style={[s.perfScore, { color: displayScore > 0 ? Colors.warning : Colors.success }]}>{displayScore}</Text>
                            <Text style={s.perfLabel}>ESC.</Text>
                        </View>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );
}

export default function CareManagersList({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [managers, setManagers] = useState([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const fetchManagers = useCallback(async (isRefresh = false) => {
        try {
            if (!isRefresh) setLoading(true);
            const res = await apiService.profiles.getAll({ role: 'care_manager' });
            // Fallback to empty array if response is unexpected
            setManagers(Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []));
        } catch (error) {
            console.error('[CareManagersList] Failed to fetch:', error);
            if (isRefresh) Alert.alert('Error', 'Failed to refresh managers.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useEffect(() => { fetchManagers(); }, [fetchManagers]);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchManagers(true); }, [fetchManagers]);

    const filteredManagers = managers.filter(m => {
        const name = (m.fullName || '').toLowerCase();
        const email = (m.email || '').toLowerCase();
        const phone = (m.phone || '');
        const matchesSearch = name.includes(search.toLowerCase()) || 
                           email.includes(search.toLowerCase()) ||
                           phone.includes(search);
                           
        const status = m.isActive ? 'active' : 'inactive';
        const matchesStatus = statusFilter === 'all' || status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return (
        <View style={s.container}>
            <GradientHeader
                title="Care Managers"
                subtitle={`${filteredManagers.length} CARE MANAGERS`}
                onBack={() => navigation.goBack()}
            />

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
                {loading ? (
                    <View style={{ paddingTop: Spacing.md }}>
                        {[0, 1, 2, 3].map(i => <SkeletonLoader key={i} variant="card" />)}
                    </View>
                ) : (
                    <>
                        <View style={[s.searchContainer, { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 }]}>
                            <Search size={20} color="#8B5CF6" style={s.searchIcon} />
                            <TextInput
                                style={s.searchInput}
                                placeholder="Search..."
                                value={search}
                                onChangeText={setSearch}
                                placeholderTextColor="#64748B"
                            />
                            {search.length > 0 && (
                                <TouchableOpacity onPress={() => setSearch('')}>
                                    <X size={20} color="#64748B" />
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={s.filterOptions}>
                            <TouchableOpacity onPress={() => setStatusFilter('all')} style={[s.filterOption, statusFilter === 'all' && s.filterOptionActive]}>
                                <Text style={[s.filterOptionText, statusFilter === 'all' && s.filterOptionTextActive]}>All</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setStatusFilter('active')} style={[s.filterOption, statusFilter === 'active' && s.filterOptionActive]}>
                                <Text style={[s.filterOptionText, statusFilter === 'active' && s.filterOptionTextActive]}>Active</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setStatusFilter('break')} style={[s.filterOption, statusFilter === 'break' && s.filterOptionActive]}>
                                <Text style={[s.filterOptionText, statusFilter === 'break' && s.filterOptionTextActive]}>On Break</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={s.listContainer}>
                            {filteredManagers.length === 0 ? (
                                <View style={{ padding: 20 }}>
                                    <EmptyState icon="briefcase" title="No Care Managers" subtitle="No managers found matching your search." />
                                </View>
                            ) : (
                                filteredManagers.map((m, i) => (
                                    <ManagerRow key={m._id || Math.random().toString()} item={m} navigation={navigation} />
                                ))
                            )}
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    body: { flex: 1, paddingHorizontal: Spacing.md },
    bellBtn: { width: 44, height: 44, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    searchContainer: { 
        flexDirection: 'row', alignItems: 'center', 
        backgroundColor: '#FFFFFF', 
        borderWidth: 1, borderColor: '#F1F5F9',
        overflow: 'hidden', marginBottom: Spacing.md,
        shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.02, shadowRadius: 10, elevation: 1
    },
    searchIcon: { marginRight: Spacing.sm },
    searchInput: { flex: 1, ...Typography.body, color: '#0F172A', fontSize: 15, fontWeight: '500' },
    
    filterOptions: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
    filterOption: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: Radius.sm, backgroundColor: Colors.surfaceAlt },
    filterOptionActive: { backgroundColor: Colors.primary },
    filterOptionText: { ...Typography.caption, fontSize: 12 },
    filterOptionTextActive: { ...Typography.caption, fontSize: 12, color: '#fff' },
    divider: { height: 1, backgroundColor: Colors.borderLight },
    
    // Premium Clean Card
    listContainer: { gap: 12 },
    cardWrapper: {
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 12,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        elevation: 3,
        backgroundColor: '#FFFFFF',
    },
    userCard: { 
        backgroundColor: '#FFFFFF', 
        paddingLeft: 16, paddingRight: 20, paddingVertical: 18,
        borderLeftWidth: 4,
    },
    cardBody: { flexDirection: 'row', alignItems: 'center' },
    avatarWrap: { marginRight: 16, shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
    avatarBg: { 
        width: 52, height: 52, borderRadius: 16, 
        justifyContent: 'center', alignItems: 'center',
    },
    avatarLetter: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
    statusDotSmall: { position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#FFFFFF' },
    
    infoWrap: { flex: 1, paddingRight: 10, justifyContent: 'center' },
    itemTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginBottom: 6, letterSpacing: -0.3 },
    itemSubValue: { fontSize: 13, color: '#64748B', fontWeight: '500' },
    contactRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    
    rightActionWrap: { alignItems: 'flex-end', justifyContent: 'space-between', height: 52 },
    statusBadge: { 
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 8, paddingVertical: 4, 
        borderRadius: 12,
    },
    statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
    statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    
    perfWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    perfScore: { fontSize: 14, fontWeight: '800' },
    perfLabel: { fontSize: 10, fontWeight: '700', color: '#EF4444', textTransform: 'uppercase' },
});
