import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, TextInput } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import { Search, X, Phone, Activity } from 'lucide-react-native';

import EmptyState from '../../components/common/EmptyState';
import { apiService } from '../../lib/api';

// Removed Hardcoded CALLERS array

function CallerRow({ item, navigation }) {
    const performanceScore = item.metrics?.completionRate || 0;
    const perfColor = performanceScore > 90 ? Colors.success : performanceScore > 80 ? Colors.warning : Colors.error;
    
    const isActive = item.isActive !== false;
    const statusLabel = isActive ? 'Active' : 'Offline';
    const accentColor = isActive ? '#10B981' : '#64748B';
    const bgLight = isActive ? '#ECFDF5' : '#F1F5F9';
    const initial = item.fullName ? item.fullName.charAt(0).toUpperCase() : 'C';

    return (
        <TouchableOpacity onPress={() => navigation.navigate('CallerDetail', { callerId: item._id || item.id })}
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
                        <Text style={s.itemTitle}>{item.fullName || 'Unknown Caller'}</Text>
                        <View style={s.contactRow}>
                            <Feather name="mail" size={13} color="#94A3B8" style={{ marginRight: 6 }} />
                            <Text style={s.itemSubValue} numberOfLines={1}>{item.email}</Text>
                        </View>
                        <View style={s.contactRow}>
                            <Feather name="phone" size={13} color="#94A3B8" style={{ marginRight: 6 }} />
                            <Text style={s.itemSubValue}>{item.phone || 'No phone'}</Text>
                        </View>
                    </View>

                    <View style={s.rightActionWrap}>
                        <View style={[s.statusBadge, { backgroundColor: bgLight }]}>
                            <View style={[s.statusDot, { backgroundColor: accentColor }]} />
                            <Text style={[s.statusText, { color: accentColor }]}>{statusLabel}</Text>
                        </View>
                        <View style={s.perfWrap}>
                            <Text style={[s.perfScore, { color: perfColor }]}>{performanceScore}</Text>
                            <Text style={s.perfLabel}>SCORE</Text>
                        </View>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );
}


export default function CallersList({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [callers, setCallers] = useState([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const fetchCallers = useCallback(async (isRefresh = false) => {
        try {
            if (!isRefresh) setLoading(true);
            const res = await apiService.profiles.getAll({ role: 'caller' });
            setCallers(Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []));
        } catch (error) {
            console.error('[CallersList] Failed to fetch:', error);
            if (isRefresh) Alert.alert('Error', 'Failed to refresh callers.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useEffect(() => { fetchCallers(); }, [fetchCallers]);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchCallers(true); }, [fetchCallers]);

    const filteredCallers = callers.filter(c => {
        const name = (c.fullName || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        const phone = (c.phone || '');
        const matchesSearch = name.includes(search.toLowerCase()) || 
                           email.includes(search.toLowerCase()) ||
                           phone.includes(search);
                           
        const status = c.isActive !== false ? 'active' : 'offline';
        const matchesStatus = statusFilter === 'all' || status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return (
        <View style={s.container}>
            <GradientHeader
                title="Callers"
                subtitle={`${filteredCallers.length} total`}
                colors={Colors.roleGradient.org_admin}
                rightAction={
                    <TouchableOpacity style={s.bellBtn} onPress={() => navigation.navigate('Notifications')}>
                        <Text style={{ fontSize: 20 }}>🔔</Text>
                    </TouchableOpacity>
                }
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
                            <Search size={20} color="#64748B" style={s.searchIcon} />
                            <TextInput
                                style={s.searchInput}
                                placeholder="Search by name, email, or phone..."
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
                            <TouchableOpacity onPress={() => setStatusFilter('offline')} style={[s.filterOption, statusFilter === 'offline' && s.filterOptionActive]}>
                                <Text style={[s.filterOptionText, statusFilter === 'offline' && s.filterOptionTextActive]}>Offline</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={s.listContainer}>
                            {filteredCallers.length === 0 ? (
                                <PremiumCard style={{ padding: 0 }}>
                                    <EmptyState icon="phone" title="No Callers" subtitle="No callers found matching your search." />
                                </PremiumCard>
                            ) : (
                                filteredCallers.map((c, i) => (
                                    <CallerRow key={c._id || Math.random().toString()} item={c} navigation={navigation} />
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
    
    perfWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F8FAFC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    perfScore: { fontSize: 14, fontWeight: '800' },
    perfLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' },
});
