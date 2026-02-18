import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';

const ORG = {
    name: 'City General Hospital', status: 'Active', type: 'Hospital Network',
    address: '123 Healthcare Ave, Medical City, MC 10001', phone: '555-1000', email: 'admin@cgh.com',
    stats: [
        { label: 'Managers', value: '8', icon: '📋' },
        { label: 'Callers', value: '42', icon: '📞' },
        { label: 'Patients', value: '420', icon: '👥' },
        { label: 'Adherence', value: '91%', icon: '✅' },
    ],
};

export default function OrgDetailScreen({ navigation }) {

return (
        <View style={s.container}>
            <GradientHeader title={ORG.name} subtitle={ORG.type} onBack={() => navigation.goBack()}
                colors={Colors.roleGradient.org_admin}>
                <View style={s.statusRow}>
                    <StatusBadge label={ORG.status} variant="success" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
                </View>
            </GradientHeader>

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
                <View>
                    <View style={s.statsGrid}>
                        {ORG.stats.map((item, i) => (
                            <PremiumCard key={i} style={s.statCard}>
                                <Text style={s.statIcon}>{item.icon}</Text>
                                <Text style={s.statValue}>{item.value}</Text>
                                <Text style={s.statLabel}>{item.label}</Text>
                            </PremiumCard>
                        ))}
                    </View>
                </View>

                <View>
                    <Text style={s.secTitle}>Contact Information</Text>
                    <PremiumCard style={{ padding: 0 }}>
                        <View style={s.infoRow}><Text style={s.infoIcon}>📍</Text><View><Text style={s.infoLabel}>Address</Text><Text style={s.infoValue}>{ORG.address}</Text></View></View>
                        <View style={s.divider} />
                        <View style={s.infoRow}><Text style={s.infoIcon}>📞</Text><View><Text style={s.infoLabel}>Phone</Text><Text style={s.infoValue}>{ORG.phone}</Text></View></View>
                        <View style={s.divider} />
                        <View style={s.infoRow}><Text style={s.infoIcon}>✉️</Text><View><Text style={s.infoLabel}>Email</Text><Text style={s.infoValue}>{ORG.email}</Text></View></View>
                    </PremiumCard>
                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    body: { flex: 1, paddingHorizontal: Spacing.md },
    statusRow: { marginTop: Spacing.md },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
    statCard: { width: '48%', alignItems: 'center', paddingVertical: Spacing.md },
    statIcon: { fontSize: 28, marginBottom: Spacing.sm },
    statValue: { ...Typography.h2, color: Colors.textPrimary },
    statLabel: { ...Typography.tiny, color: Colors.textMuted, marginTop: Spacing.xs },
    secTitle: { ...Typography.h3, color: Colors.textPrimary, marginTop: Spacing.lg, marginBottom: Spacing.md },
    divider: { height: 1, backgroundColor: Colors.borderLight },
    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 14 },
    infoIcon: { fontSize: 20, marginTop: 2 },
    infoLabel: { ...Typography.tiny, color: Colors.textMuted },
    infoValue: { ...Typography.bodyMedium, color: Colors.textPrimary, fontSize: 14, marginTop: 2 },
});
