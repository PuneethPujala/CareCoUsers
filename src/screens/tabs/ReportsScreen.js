import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import PremiumButton from '../../components/common/PremiumButton';
import StatusBadge from '../../components/common/StatusBadge';

const PERIODS = ['Week', 'Month', 'Quarter'];

const REPORTS = {
    Week: { calls: 142, avgDuration: '14 min', adherence: '88%', resolved: 128, highlights: ['12% increase in call volume', 'Avg adherence up 3%', '2 new patients onboarded'], chart: [65, 78, 82, 90, 85, 88, 92] },
    Month: { calls: 580, avgDuration: '13 min', adherence: '86%', resolved: 510, highlights: ['Best month for adherence', 'Team expanded by 2 callers', '15 escalations resolved'], chart: [72, 78, 82, 86] },
    Quarter: { calls: 1650, avgDuration: '14 min', adherence: '85%', resolved: 1480, highlights: ['Q4 target exceeded', 'Patient satisfaction: 4.6/5', 'Zero SLA breaches'], chart: [80, 83, 85] },
};

export default function ReportsScreen({ navigation }) {
    const [period, setPeriod] = useState('Week');
    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);

    const data = REPORTS[period];


const maxChart = Math.max(...data.chart);

    return (
        <View style={s.container}>
            <GradientHeader title="Reports" subtitle="Performance Overview" colors={Colors.roleGradient.care_manager} />

            <View style={s.periodRow}>
                {PERIODS.map(p => (
                    <TouchableOpacity key={p} onPress={() => setPeriod(p)}
                        style={[s.periodTab, period === p && s.periodActive]} activeOpacity={0.8}>
                        <Text style={[s.periodText, period === p && s.periodTextActive]}>{p}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>

                {/* Summary Stats */}
                <View style={s.statsGrid}>
                    {[
                        { label: 'Total Calls', value: data.calls, icon: '📞' },
                        { label: 'Avg Duration', value: data.avgDuration, icon: '⏱️' },
                        { label: 'Adherence', value: data.adherence, icon: '✅' },
                        { label: 'Resolved', value: data.resolved, icon: '📋' },
                    ].map((s2, i) => (
                        <PremiumCard key={i} style={s.statCard}>
                            <Text style={s.statIcon}>{s2.icon}</Text>
                            <Text style={s.statValue}>{s2.value}</Text>
                            <Text style={s.statLabel}>{s2.label}</Text>
                        </PremiumCard>
                    ))}
                </View>

                {/* Chart */}
                <View>
                    <Text style={s.sectionTitle}>Adherence Trend</Text>
                    <PremiumCard style={s.chartCard}>
                        <View style={s.chartRow}>
                            {data.chart.map((val, i) => (
                                <View key={i} style={s.barWrap}>
                                    <View style={[s.bar, { height: (val / maxChart) * 100, backgroundColor: val >= 85 ? Colors.success : Colors.warning }]} />
                                    <Text style={s.barLabel}>{val}%</Text>
                                </View>
                            ))}
                        </View>
                    </PremiumCard>
                </View>

                {/* Highlights */}
                <View>
                    <Text style={s.sectionTitle}>Highlights</Text>
                    <PremiumCard style={{ padding: 0 }}>
                        {data.highlights.map((h, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && <View style={s.divider} />}
                                <View style={s.highlightRow}>
                                    <Text style={s.highlightIcon}>✨</Text>
                                    <Text style={s.highlightText}>{h}</Text>
                                </View>
                            </React.Fragment>
                        ))}
                    </PremiumCard>
                </View>

                {/* Export */}
                <PremiumButton
                    title="Export Report"
                    icon="📤"
                    variant="secondary"
                    style={{ marginTop: Spacing.lg }}
                    onPress={() => Alert.alert('Exported', `${period}ly report exported successfully.`)}
                />
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    body: { flex: 1, paddingHorizontal: Spacing.md },
    periodRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: Spacing.sm, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
    periodTab: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.full, alignItems: 'center', backgroundColor: Colors.background },
    periodActive: { backgroundColor: Colors.primary },
    periodText: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '600' },
    periodTextActive: { color: '#fff' },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
    statCard: { width: '48%', alignItems: 'center', paddingVertical: Spacing.md },
    statIcon: { fontSize: 24, marginBottom: Spacing.sm },
    statValue: { ...Typography.h2, color: Colors.textPrimary },
    statLabel: { ...Typography.tiny, color: Colors.textMuted, marginTop: Spacing.xs },
    sectionTitle: { ...Typography.h3, color: Colors.textPrimary, marginTop: Spacing.lg, marginBottom: Spacing.md },
    chartCard: { paddingVertical: Spacing.lg },
    chartRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 120 },
    barWrap: { alignItems: 'center', gap: Spacing.xs },
    bar: { width: 28, borderRadius: 4 },
    barLabel: { ...Typography.tiny, color: Colors.textMuted },
    divider: { height: 1, backgroundColor: Colors.borderLight },
    highlightRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 14 },
    highlightIcon: { fontSize: 18 },
    highlightText: { ...Typography.body, color: Colors.textPrimary, fontSize: 14 },
});
