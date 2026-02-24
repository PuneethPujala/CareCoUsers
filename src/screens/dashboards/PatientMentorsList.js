import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, TextInput } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import { Search, X, User, Star } from 'lucide-react-native';

const MENTORS = [
    { id: 'm1', name: 'Dr. John Smith', patients: 25, satisfaction: 4.8, status: 'active', email: 'john@careconnect.com', phone: '+1234567890', specialty: 'Cardiology' },
    { id: 'm2', name: 'Nurse Jane Doe', patients: 18, satisfaction: 4.9, status: 'active', email: 'jane@careconnect.com', phone: '+1234567891', specialty: 'Diabetes' },
    { id: 'm3', name: 'Dr. Mike Wilson', patients: 32, satisfaction: 4.7, status: 'away', email: 'mike@careconnect.com', phone: '+1234567892', specialty: 'General Practice' },
    { id: 'm4', name: 'Dr. Sarah Brown', patients: 22, satisfaction: 4.6, status: 'active', email: 'sarah@careconnect.com', phone: '+1234567893', specialty: 'Pediatrics' },
];

function MentorRow({ item, navigation }) {
    const satColor = item.satisfaction >= 4.8 ? Colors.success : item.satisfaction >= 4.5 ? Colors.warning : Colors.error;
    return (
        <TouchableOpacity onPress={() => navigation.navigate('MentorDetail', { mentorId: item.id })}
            activeOpacity={0.7} style={s.mentorRow}>
            <View style={s.mentorAvatar}>
                <User size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={s.mentorName}>{item.name}</Text>
                <Text style={s.mentorSub}>{item.specialty}</Text>
                <Text style={s.mentorSub}>{item.email}</Text>
                <Text style={s.mentorSub}>{item.phone}</Text>
                <Text style={s.mentorSub}>{item.patients} patients</Text>
            </View>
            <View style={s.satWrap}>
                <View style={s.ratingContainer}>
                    <Star size={14} color={Colors.warning} fill={Colors.warning} />
                    <Text style={s.ratingText}>{item.satisfaction}</Text>
                </View>
                <Text style={s.satLabel}>Rating</Text>
            </View>
            <StatusBadge label={item.status} variant={item.status === 'active' ? 'success' : 'warning'} />
        </TouchableOpacity>
    );
}

export default function PatientMentorsList({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);

    const filteredMentors = MENTORS.filter(m => {
        const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) || 
                           m.email.toLowerCase().includes(search.toLowerCase()) ||
                           m.phone.includes(search) ||
                           m.specialty.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
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
                        <View style={s.searchContainer}>
                            <Search size={18} color={Colors.textMuted} style={s.searchIcon} />
                            <TextInput
                                style={s.searchInput}
                                placeholder="Search by name, email, phone, or specialty..."
                                value={search}
                                onChangeText={setSearch}
                                placeholderTextColor={Colors.textMuted}
                            />
                            {search.length > 0 && (
                                <TouchableOpacity onPress={() => setSearch('')} style={s.clearBtn}>
                                    <X size={16} color={Colors.textMuted} />
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

                        <PremiumCard style={{ padding: 0 }}>
                            {filteredMentors.map((m, i) => (
                                <React.Fragment key={m.id}>
                                    {i > 0 && <View style={s.divider} />}
                                    <MentorRow item={m} navigation={navigation} />
                                </React.Fragment>
                            ))}
                        </PremiumCard>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    body: { flex: 1, paddingHorizontal: Spacing.md },
    bellBtn: { width: 44, height: 44, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.md, paddingHorizontal: Spacing.sm, marginBottom: Spacing.md, ...Shadows.sm },
    searchIcon: { marginRight: Spacing.sm },
    searchInput: { ...Typography.body, flex: 1, color: Colors.textPrimary, fontSize: 14 },
    clearBtn: { padding: Spacing.xs },
    filterOptions: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
    filterOption: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: Radius.sm, backgroundColor: Colors.surfaceAlt },
    filterOptionActive: { backgroundColor: Colors.primary },
    filterOptionText: { ...Typography.caption, fontSize: 12 },
    filterOptionTextActive: { ...Typography.caption, fontSize: 12, color: '#fff' },
    divider: { height: 1, backgroundColor: Colors.borderLight },
    // Mentor
    mentorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    mentorAvatar: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    mentorName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    mentorSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    ratingContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    ratingText: { ...Typography.h3, fontWeight: '700', fontSize: 16 },
    satWrap: { alignItems: 'center' },
    satLabel: { ...Typography.tiny, color: Colors.textMuted },
});
