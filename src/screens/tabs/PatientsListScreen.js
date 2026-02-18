import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';

import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';

const PATIENTS = [
    { id: 'p1', name: 'Robert Williams', age: 72, conditions: ['Diabetes', 'Hypertension'], adherence: 92, lastCall: 'Today', status: 'stable' },
    { id: 'p2', name: 'Margaret Chen', age: 68, conditions: ['Heart Disease'], adherence: 68, lastCall: 'Yesterday', status: 'attention' },
    { id: 'p3', name: 'James Wilson', age: 75, conditions: ['Post-Surgery', 'COPD'], adherence: 85, lastCall: 'Today', status: 'stable' },
    { id: 'p4', name: 'Dorothy Brown', age: 80, conditions: ['Arthritis'], adherence: 95, lastCall: '2 days ago', status: 'stable' },
    { id: 'p5', name: 'Henry Davis', age: 70, conditions: ['Diabetes'], adherence: 78, lastCall: '3 days ago', status: 'attention' },
];

function PatientRow({ item, navigation }) {
    const adhColor = item.adherence >= 90 ? Colors.success : item.adherence >= 75 ? Colors.warning : Colors.error;
    return (
        <PremiumCard onPress={() => navigation.navigate('PatientDetail', { patientId: item.id })} style={s.patCard}>
            <View style={s.patRow}>
                <View style={s.patAvatar}><Text style={s.patAvatarText}>{item.name.charAt(0)}</Text></View>
                <View style={{ flex: 1 }}>
                    <Text style={s.patName}>{item.name}</Text>
                    <Text style={s.patSub}>Age {item.age} · Last call: {item.lastCall}</Text>
                    <View style={s.tagRow}>
                        {item.conditions.map((c, i) => <StatusBadge key={i} label={c} variant="primary" />)}
                    </View>
                </View>
                <View style={s.adhWrap}>
                    <Text style={[s.adhValue, { color: adhColor }]}>{item.adherence}%</Text>
                    <StatusBadge label={item.status === 'stable' ? 'Stable' : 'Attention'} variant={item.status === 'stable' ? 'success' : 'warning'} />
                </View>
            </View>
        </PremiumCard>
    );
}

export default function PatientsListScreen({ navigation }) {
    const [search, setSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);

    const filtered = PATIENTS.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <View style={s.container}>
            <GradientHeader title="Patients" subtitle={`${PATIENTS.length} total patients`} />

            <View style={s.searchWrap}>
                <Text style={s.searchIcon}>🔍</Text>
                <TextInput style={s.searchInput} placeholder="Search patients..." placeholderTextColor={Colors.textMuted}
                    value={search} onChangeText={setSearch} />
            </View>

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
                {filtered.length === 0 ? (
                    <EmptyState icon="🔍" title="No patients found" subtitle="Try a different search term" />
                ) : (
                    <View style={{ gap: Spacing.sm }}>
                        {filtered.map(p => <PatientRow key={p.id} item={p} navigation={navigation} />)}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    body: { flex: 1, paddingHorizontal: Spacing.md },
    searchWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, marginVertical: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, borderRadius: Radius.md, backgroundColor: Colors.white, ...Shadows.card },
    searchIcon: { fontSize: 16 },
    searchInput: { flex: 1, ...Typography.body, color: Colors.textPrimary },
    patCard: { padding: Spacing.md },
    patRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
    patAvatar: { width: 44, height: 44, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    patAvatarText: { ...Typography.bodySemibold, color: Colors.primary },
    patName: { ...Typography.bodySemibold, color: Colors.textPrimary },
    patSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm },
    adhWrap: { alignItems: 'flex-end', gap: Spacing.xs },
    adhValue: { ...Typography.h3 },
});
