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
import { Search, X, User, Star } from 'lucide-react-native';

import EmptyState from '../../components/common/EmptyState';
import { apiService } from '../../lib/api';

// Removed Hardcoded MENTORS array

import { Feather } from '@expo/vector-icons';

function MentorRow({ item, navigation }) {
    const satisfaction = item.metrics?.patientSatisfaction || 4.0;
    const satColor = satisfaction >= 4.8 ? Colors.success : satisfaction >= 4.5 ? Colors.warning : Colors.error;
    
    const isActive = item.isActive !== false;
    const statusLabel = isActive ? 'Active' : 'Away';
    const accentColor = isActive ? '#10B981' : '#64748B';
    const bgLight = isActive ? '#ECFDF5' : '#F1F5F9';

    const name = item.fullName || 'Unknown Mentor';
    const email = item.email || '';
    const phone = item.phone || 'No phone';
    const initial = name.charAt(0).toUpperCase();

    return (
        <TouchableOpacity onPress={() => navigation.navigate('MentorDetail', { mentorId: item._id || item.id })}
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
                            <Feather name="user" size={13} color="#94A3B8" style={{ marginRight: 6 }} />
                            <Text style={s.itemSubValue}>{item.specialty || 'General'}</Text>
                        </View>
                    </View>

                    <View style={s.rightActionWrap}>
                        <View style={[s.statusBadge, { backgroundColor: bgLight }]}>
                            <View style={[s.statusDot, { backgroundColor: accentColor }]} />
                            <Text style={[s.statusText, { color: accentColor }]}>{statusLabel}</Text>
                        </View>
                        <View style={s.satWrap}>
                            <View style={s.ratingContainer}>
                                <Star size={12} color={satColor} fill={satColor} />
                                <Text style={[s.ratingText, { color: satColor }]}>{satisfaction.toFixed(1)}</Text>
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );
}

export default function PatientMentorsList({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [mentors, setMentors] = useState([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const fetchMentors = useCallback(async (isRefresh = false) => {
        try {
            if (!isRefresh) setLoading(true);
            const res = await apiService.profiles.getAll({ role: 'mentor' });
            setMentors(Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []));
        } catch (error) {
            console.error('[PatientMentorsList] Failed to fetch:', error);
            if (isRefresh) Alert.alert('Error', 'Failed to refresh mentors.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useEffect(() => { fetchMentors(); }, [fetchMentors]);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchMentors(true); }, [fetchMentors]);

    const filteredMentors = mentors.filter(m => {
        const name = (m.fullName || '').toLowerCase();
        const email = (m.email || '').toLowerCase();
        const phone = (m.phone || '');
        const specialty = (m.specialty || '').toLowerCase();
        
        const matchesSearch = name.includes(search.toLowerCase()) || 
                           email.includes(search.toLowerCase()) ||
                           phone.includes(search) ||
                           specialty.includes(search.toLowerCase());
                           
        const status = m.isActive !== false ? 'active' : 'away';
        const matchesStatus = statusFilter === 'all' || status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return (
        <View style={s.container}>
            <GradientHeader
                title="Patient Mentors"
                subtitle={`${filteredMentors.length} total`}
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
                                placeholder="Search by name, email, phone, or specialty..."
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
                            <TouchableOpacity onPress={() => setStatusFilter('away')} style={[s.filterOption, statusFilter === 'away' && s.filterOptionActive]}>
                                <Text style={[s.filterOptionText, statusFilter === 'away' && s.filterOptionTextActive]}>Away</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={s.listContainer}>
                            {filteredMentors.length === 0 ? (
                                <PremiumCard style={{ padding: 0 }}>
                                    <EmptyState icon="user" title="No Mentors" subtitle="No mentors found matching your search." />
                                </PremiumCard>
                            ) : (
                                filteredMentors.map((m, i) => (
                                    <MentorRow key={m._id || Math.random().toString()} item={m} navigation={navigation} />
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
    
    satWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    ratingContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    ratingText: { fontSize: 13, fontWeight: '800' },
});

