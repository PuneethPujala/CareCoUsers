import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, TextInput } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import { Search, X, Heart, Calendar } from 'lucide-react-native';

const PATIENTS = [
    { id: 'p1', name: 'Robert Williams', age: 65, condition: 'Diabetes', adherence: 95, lastCall: '2 days ago', email: 'robert@careconnect.com', phone: '+1234567890', status: 'active' },
    { id: 'p2', name: 'Margaret Chen', age: 72, condition: 'Hypertension', adherence: 87, lastCall: '1 day ago', email: 'margaret@careconnect.com', phone: '+1234567891', status: 'active' },
    { id: 'p3', name: 'James Wilson', age: 58, condition: 'Post-Surgery', adherence: 92, lastCall: '3 days ago', email: 'james@careconnect.com', phone: '+1234567892', status: 'active' },
    { id: 'p4', name: 'Linda Garcia', age: 69, condition: 'Arthritis', adherence: 78, lastCall: '5 days ago', email: 'linda@careconnect.com', phone: '+1234567893', status: 'warning' },
];

function PatientRow({ item, navigation }) {
    const adherenceColor = item.adherence >= 90 ? Colors.success : item.adherence >= 80 ? Colors.warning : Colors.error;
    return (
        <TouchableOpacity onPress={() => navigation.navigate('PatientDetail', { patientId: item.id })}
            activeOpacity={0.7} style={s.patientRow}>
            <View style={s.patientAvatar}>
                <Heart size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={s.patientName}>{item.name}</Text>
                <Text style={s.patientSub}>{item.age} years · {item.condition}</Text>
                <Text style={s.patientSub}>{item.email}</Text>
                <Text style={s.patientSub}>{item.phone}</Text>
                <Text style={s.patientSub}>Last call: {item.lastCall}</Text>
            </View>
            <View style={s.adherenceWrap}>
                <Text style={[s.adherenceScore, { color: adherenceColor }]}>{item.adherence}%</Text>
                <Text style={s.adherenceLabel}>Adherence</Text>
            </View>
            <StatusBadge label={item.status} variant={item.status === 'active' ? 'success' : 'warning'} />
        </TouchableOpacity>
    );
}

export default function PatientsList({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [adherenceFilter, setAdherenceFilter] = useState('all');

    useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);

    const filteredPatients = PATIENTS.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                           p.email.toLowerCase().includes(search.toLowerCase()) ||
                           p.phone.includes(search) ||
                           p.condition.toLowerCase().includes(search.toLowerCase());
        const matchesAdherence = adherenceFilter === 'all' || 
            (adherenceFilter === 'high' && p.adherence >= 90) ||
            (adherenceFilter === 'medium' && p.adherence >= 80 && p.adherence < 90) ||
            (adherenceFilter === 'low' && p.adherence < 80);
        return matchesSearch && matchesAdherence;
    });

    return (
        <View style={s.container}>
            <GradientHeader
                title="Patients"
                subtitle={`${filteredPatients.length} total`}
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
                                placeholder="Search by name, email, phone, or condition..."
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
                            <TouchableOpacity onPress={() => setAdherenceFilter('all')} style={[s.filterOption, adherenceFilter === 'all' && s.filterOptionActive]}>
                                <Text style={[s.filterOptionText, adherenceFilter === 'all' && s.filterOptionTextActive]}>All</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setAdherenceFilter('high')} style={[s.filterOption, adherenceFilter === 'high' && s.filterOptionActive]}>
                                <Text style={[s.filterOptionText, adherenceFilter === 'high' && s.filterOptionTextActive]}>High (≥90%)</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setAdherenceFilter('medium')} style={[s.filterOption, adherenceFilter === 'medium' && s.filterOptionActive]}>
                                <Text style={[s.filterOptionText, adherenceFilter === 'medium' && s.filterOptionTextActive]}>Medium (80-89%)</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setAdherenceFilter('low')} style={[s.filterOption, adherenceFilter === 'low' && s.filterOptionActive]}>
                                <Text style={[s.filterOptionText, adherenceFilter === 'low' && s.filterOptionTextActive]}>Low (&lt;80%)</Text>
                            </TouchableOpacity>
                        </View>

                        <PremiumCard style={{ padding: 0 }}>
                            {filteredPatients.map((p, i) => (
                                <React.Fragment key={p.id}>
                                    {i > 0 && <View style={s.divider} />}
                                    <PatientRow item={p} navigation={navigation} />
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
    // Patient
    patientRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    patientAvatar: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    patientName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    patientSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    adherenceWrap: { alignItems: 'center' },
    adherenceScore: { ...Typography.h3, fontWeight: '700', fontSize: 16 },
    adherenceLabel: { ...Typography.tiny, color: Colors.textMuted },
});
