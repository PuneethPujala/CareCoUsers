import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme';
import { FONT } from './constants';

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
                                <Text style={s.driverPct}>{driver.pct}%</Text>
                            </View>
                            <View style={s.progressBarBg}>
                                <View style={[s.progressBarFill, { width: `${driver.pct}%`, backgroundColor: '#7C3AED' }]} />
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
        color: '#94A3B8',
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
        color: '#0F172A',
    },
    driverPct: {
        fontSize: 13,
        ...FONT.bold,
        color: '#7C3AED',
    },
    progressBarBg: {
        height: 10,
        backgroundColor: '#F1F5F9',
        borderRadius: 5,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 5,
    },
    emptyCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(15, 23, 42, 0.04)',
    },
    emptyIcon: {
        fontSize: 24,
        marginBottom: 8,
    },
    emptyTitle: {
        fontSize: 13,
        ...FONT.bold,
        color: '#0F172A',
        marginBottom: 4,
    },
    emptyDesc: {
        fontSize: 12,
        ...FONT.medium,
        color: '#94A3B8',
        textAlign: 'center',
        lineHeight: 18,
    },
});

