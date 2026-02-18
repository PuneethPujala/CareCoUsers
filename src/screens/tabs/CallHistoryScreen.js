import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';

const FILTERS = ['All', 'Done', 'Missed'];

const CALLS = [
    { id: 1, patient: 'Robert Williams', date: 'Today', time: '9:30 AM', duration: '12 min', mood: '😊', outcome: 'Completed', done: true },
    { id: 2, patient: 'Margaret Chen', date: 'Today', time: '10:00 AM', duration: '—', mood: '😔', outcome: 'Missed', done: false },
    { id: 3, patient: 'James Wilson', date: 'Today', time: '11:00 AM', duration: '18 min', mood: '😊', outcome: 'Completed', done: true },
    { id: 4, patient: 'Dorothy Brown', date: 'Yesterday', time: '2:00 PM', duration: '14 min', mood: '😐', outcome: 'Completed', done: true },
    { id: 5, patient: 'Henry Davis', date: 'Yesterday', time: '3:30 PM', duration: '—', mood: '😔', outcome: 'Missed', done: false },
];

export default function CallHistoryScreen({ navigation }) {
    const [filter, setFilter] = useState('All');
    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);

    let filtered = CALLS;
    if (filter === 'Done') filtered = CALLS.filter(c => c.done);
    if (filter === 'Missed') filtered = CALLS.filter(c => !c.done);

    // Group by date
    const grouped = {};
    filtered.forEach(c => { if (!grouped[c.date]) grouped[c.date] = []; grouped[c.date].push(c); });

    return (
        <View style={s.container}>
            <GradientHeader title="Call History" subtitle={`${CALLS.length} total calls`} />

            <View style={s.filterRow}>
                {FILTERS.map(f => (
                    <TouchableOpacity key={f} onPress={() => setFilter(f)}
                        style={[s.filterTab, filter === f && s.filterActive]} activeOpacity={0.8}>
                        <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
                {filtered.length === 0 ? (
                    <EmptyState icon="📋" title="No calls" subtitle={`No ${filter.toLowerCase()} calls to show`} />
                ) : (
                    Object.entries(grouped).map(([date, calls]) => (
                        <View key={date}>
                            <Text style={s.dateLabel}>{date}</Text>
                            <View style={{ gap: Spacing.sm }}>
                                {calls.map(c => (
                                    <PremiumCard key={c.id} style={s.callCard}
                                        onPress={() => c.done && navigation.navigate('PatientDetail', { patientId: 'p1' })}>
                                        <View style={s.callRow}>
                                            <Text style={s.callMood}>{c.mood}</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.callPatient}>{c.patient}</Text>
                                                <Text style={s.callSub}>{c.time} · {c.duration}</Text>
                                            </View>
                                            <StatusBadge label={c.outcome} variant={c.done ? 'success' : 'error'} />
                                        </View>
                                    </PremiumCard>
                                ))}
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    body: { flex: 1, paddingHorizontal: Spacing.md },
    filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: Spacing.sm, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
    filterTab: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.background },
    filterActive: { backgroundColor: Colors.primary },
    filterText: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '600' },
    filterTextActive: { color: '#fff' },
    dateLabel: { ...Typography.captionBold, color: Colors.textMuted, marginTop: Spacing.lg, marginBottom: Spacing.sm, paddingHorizontal: Spacing.xs },
    callCard: { padding: Spacing.md },
    callRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    callMood: { fontSize: 28 },
    callPatient: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    callSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
});
