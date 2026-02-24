import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, TextInput } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import { Search, X, Phone, Activity } from 'lucide-react-native';

const CALLERS = [
    { id: 'c1', name: 'Sarah Johnson', calls: 28, patients: 12, performance: 96, status: 'active', email: 'sarah@careconnect.com', phone: '+1234567890' },
    { id: 'c2', name: 'Mike Chen', calls: 24, patients: 8, performance: 91, status: 'active', email: 'mike@careconnect.com', phone: '+1234567891' },
    { id: 'c3', name: 'Emily Davis', calls: 22, patients: 15, performance: 88, status: 'offline', email: 'emily@careconnect.com', phone: '+1234567892' },
    { id: 'c4', name: 'John Wilson', calls: 30, patients: 18, performance: 94, status: 'active', email: 'john@careconnect.com', phone: '+1234567893' },
];

function CallerRow({ item, navigation }) {
    const perfColor = item.performance > 90 ? Colors.success : item.performance > 80 ? Colors.warning : Colors.error;
    return (
        <TouchableOpacity onPress={() => navigation.navigate('CallerDetail', { callerId: item.id })}
            activeOpacity={0.7} style={s.callerRow}>
            <View style={s.callerAvatar}>
                <Phone size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={s.callerName}>{item.name}</Text>
                <Text style={s.callerSub}>{item.email}</Text>
                <Text style={s.callerSub}>{item.phone}</Text>
                <Text style={s.callerSub}>{item.calls} calls today · {item.patients} patients</Text>
            </View>
            <View style={s.perfWrap}>
                <Text style={[s.perfScore, { color: perfColor }]}>{item.performance}</Text>
                <Text style={s.perfLabel}>Score</Text>
            </View>
            <StatusBadge label={item.status} variant={item.status === 'active' ? 'success' : item.status === 'offline' ? 'neutral' : 'warning'} />
        </TouchableOpacity>
    );
}

export default function CallersList({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);

    const filteredCallers = CALLERS.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || 
                           c.email.toLowerCase().includes(search.toLowerCase()) ||
                           c.phone.includes(search);
        const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
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
                            <TouchableOpacity onPress={() => setStatusFilter('offline')} style={[s.filterOption, statusFilter === 'offline' && s.filterOptionActive]}>
                                <Text style={[s.filterOptionText, statusFilter === 'offline' && s.filterOptionTextActive]}>Offline</Text>
                            </TouchableOpacity>
                        </View>

                        <PremiumCard style={{ padding: 0 }}>
                            {filteredCallers.map((c, i) => (
                                <React.Fragment key={c.id}>
                                    {i > 0 && <View style={s.divider} />}
                                    <CallerRow item={c} navigation={navigation} />
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
    // Caller
    callerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    callerAvatar: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    callerName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    callerSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    perfWrap: { alignItems: 'center' },
    perfScore: { ...Typography.h3, fontWeight: '700', fontSize: 16 },
    perfLabel: { ...Typography.tiny, color: Colors.textMuted },
});
