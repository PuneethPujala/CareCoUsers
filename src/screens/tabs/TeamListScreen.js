import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet, RefreshControl } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';

const CALLERS = [
    { id: 'c1', name: 'Sarah Johnson', score: 96, calls: 28, status: 'active', patients: 12 },
    { id: 'c2', name: 'Mike Chen', score: 91, calls: 24, status: 'active', patients: 10 },
    { id: 'c3', name: 'Emily Davis', score: 88, calls: 22, status: 'break', patients: 8 },
    { id: 'c4', name: 'Alex Turner', score: 82, calls: 18, status: 'active', patients: 9 },
    { id: 'c5', name: 'Lisa Wang', score: 79, calls: 15, status: 'offline', patients: 7 },
];

export default function TeamListScreen({ navigation }) {
    const [search, setSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);

    const filtered = CALLERS.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <View style={s.container}>
            <GradientHeader title="Team" subtitle={`${CALLERS.length} callers`} colors={Colors.roleGradient.care_manager} />

            <View style={s.searchWrap}>
                <Text style={s.searchIcon}>🔍</Text>
                <TextInput style={s.searchInput} placeholder="Search team..." placeholderTextColor={Colors.textMuted}
                    value={search} onChangeText={setSearch} />
            </View>

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
                {filtered.length === 0 ? (
                    <EmptyState icon="👥" title="No callers found" subtitle="Try a different search term" />
                ) : (
                    <View style={{ gap: Spacing.sm }}>
                        {filtered.map(c => (
                            <PremiumCard key={c.id} onPress={() => navigation.navigate('CallerDetail', { callerId: c.id })} style={s.callerCard}>
                                <View style={s.callerRow}>
                                    <View style={s.callerAvatar}>
                                        <Text style={s.callerAvatarText}>{c.name.charAt(0)}</Text>
                                        <View style={[s.statusDot, { backgroundColor: c.status === 'active' ? Colors.success : c.status === 'break' ? Colors.warning : Colors.textMuted }]} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.callerName}>{c.name}</Text>
                                        <Text style={s.callerSub}>{c.calls} calls · {c.patients} patients</Text>
                                    </View>
                                    <View style={s.scoreWrap}>
                                        <Text style={s.scoreValue}>{c.score}</Text>
                                    </View>
                                    <StatusBadge label={c.status} variant={c.status === 'active' ? 'success' : c.status === 'break' ? 'warning' : 'neutral'} />
                                </View>
                            </PremiumCard>
                        ))}
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
    callerCard: { padding: Spacing.md },
    callerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    callerAvatar: { width: 44, height: 44, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    callerAvatarText: { ...Typography.bodySemibold, color: Colors.primary },
    statusDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colors.white },
    callerName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    callerSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    scoreWrap: { backgroundColor: Colors.surfaceAlt, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs, borderRadius: Radius.sm },
    scoreValue: { ...Typography.captionBold, color: Colors.primary },
});
