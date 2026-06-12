import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme';
import { FONT, getDriverColor } from './constants';

export default function HealthDrivers({ driverData }) {
    return (
        <View style={s.container}>
            <Text style={s.sectionTitle}>HEALTH DRIVERS</Text>
            
            {driverData ? (
                <View style={s.driversList}>
                    {driverData.map((driver, idx) => (
                        <View key={idx}>
                            <View style={s.driverHeader}>
                                <Text style={s.driverLabel}>{driver.icon} {driver.label}</Text>
                                <Text style={[s.driverPct, { color: getDriverColor(driver.pct) }]}>{driver.pct}%</Text>
                            </View>
                            <View style={s.progressBarBg}>
                                <View style={[s.progressBarFill, { width: `${driver.pct}%`, backgroundColor: getDriverColor(driver.pct) }]} />
                            </View>
                        </View>
                    ))}
                </View>
            ) : (
                <View style={s.emptyCard}>
                    <Text style={s.emptyIcon}>📊</Text>
                    <Text style={s.emptyTitle}>Tracking Your Health</Text>
                    <Text style={s.emptyDesc}>
                        Complete your profile and log medications to see detailed health driver breakdowns.
                    </Text>
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 12,
        ...FONT.heavy,
        color: colors.textMuted,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 12,
    },
    driversList: {
        gap: 14,
    },
    driverHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    driverLabel: {
        fontSize: 14,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    driverPct: {
        fontSize: 13,
        ...FONT.bold,
    },
    progressBarBg: {
        height: 12,
        backgroundColor: colors.borderLight,
        borderRadius: 6,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 6,
    },
    emptyCard: {
        backgroundColor: colors.background,
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    emptyIcon: {
        fontSize: 24,
        marginBottom: 8,
    },
    emptyTitle: {
        fontSize: 13,
        ...FONT.bold,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    emptyDesc: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 18,
    },
});
