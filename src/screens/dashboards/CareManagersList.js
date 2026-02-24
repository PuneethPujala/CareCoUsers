import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import { Search, X, User, Phone, Activity } from 'lucide-react-native';

const CARE_MANAGERS = [
    { id: 'cm1', name: 'Alice Manager', callers: 12, patients: 85, load: 78, status: 'active', email: 'alice@careconnect.com', phone: '+1234567890' },
    { id: 'cm2', name: 'Bob Director', callers: 8, patients: 62, load: 55, status: 'active', email: 'bob@careconnect.com', phone: '+1234567891' },
    { id: 'cm3', name: 'Carol Lead', callers: 15, patients: 110, load: 92, status: 'break', email: 'carol@careconnect.com', phone: '+1234567892' },
    { id: 'cm4', name: 'David Supervisor', callers: 10, patients: 95, load: 68, status: 'active', email: 'david@careconnect.com', phone: '+1234567893' },
];

function ManagerRow({ item, navigation }) {
    const loadColor = item.load > 85 ? Colors.error : item.load > 65 ? Colors.warning : Colors.success;
    return (
        <TouchableOpacity onPress={() => navigation.navigate('ManagerDetail', { managerId: item.id })}
            activeOpacity={0.7} style={s.mgrRow}>
            <View style={s.mgrAvatar}>
                <User size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={s.mgrName}>{item.name}</Text>
                <Text style={s.mgrSub}>{item.email}</Text>
                <Text style={s.mgrSub}>{item.phone}</Text>
                <Text style={s.mgrSub}>{item.callers} callers · {item.patients} patients</Text>
                <View style={s.loadBar}>
                    <View style={[s.loadFill, { width: `${item.load}%`, backgroundColor: loadColor }]} />
                </View>
            </View>
            <Text style={[s.loadPct, { color: loadColor }]}>{item.load}%</Text>
            <StatusBadge label={item.status} variant={item.status === 'active' ? 'success' : 'warning'} />
        </TouchableOpacity>
    );
}

export default function CareManagersList({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);

    const filteredManagers = CARE_MANAGERS.filter(m => {
        const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) || 
                           m.email.toLowerCase().includes(search.toLowerCase()) ||
                           m.phone.includes(search);
        const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return (
        <View style={s.container}>
            <GradientHeader
                title="Care Managers"
                subtitle={`${filteredManagers.length} total`}
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
                                placeholder="Search by name, email, or phone..."
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
                            <TouchableOpacity onPress={() => setStatusFilter('break')} style={[s.filterOption, statusFilter === 'break' && s.filterOptionActive]}>
                                <Text style={[s.filterOptionText, statusFilter === 'break' && s.filterOptionTextActive]}>On Break</Text>
                            </TouchableOpacity>
                        </View>

                        <PremiumCard style={{ padding: 0 }}>
                            {filteredManagers.map((m, i) => (
                                <React.Fragment key={m.id}>
                                    {i > 0 && <View style={s.divider} />}
                                    <ManagerRow item={m} navigation={navigation} />
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
    // Manager
    mgrRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    mgrAvatar: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    mgrName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    mgrSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    loadBar: { height: 4, backgroundColor: Colors.borderLight, borderRadius: 2, marginTop: Spacing.sm, width: '100%' },
    loadFill: { height: 4, borderRadius: 2 },
    loadPct: { ...Typography.captionBold, minWidth: 36, textAlign: 'right' },
});
