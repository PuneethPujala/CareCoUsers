import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme';
import { FONT } from './constants';

export default function MomentumCard({
    streakDays,
    streakLabel,
    daysOfWeek,
    completedDays,
    todayIdx
}) {
    return (
        <View style={s.card}>
            <View style={s.headerRow}>
                <Text style={s.title}>
                    {streakDays > 0 ? `🔥 ${streakDays} Day ${streakLabel}` : `🎯 Start Your ${streakLabel}`}
                </Text>
                <Text style={[s.badge, { color: streakDays > 0 ? colors.success : colors.textMuted }]}>
                    {streakDays > 0 ? 'Active' : 'Tracking'}
                </Text>
            </View>

            <View style={s.daysRow}>
                {daysOfWeek.map((day, idx) => {
                    const isCompleted = completedDays[idx];
                    const isToday = idx === todayIdx;
                    return (
                        <View key={idx} style={s.dayItem}>
                            <View style={[
                                s.dayCircle,
                                {
                                    borderColor: isCompleted ? colors.success : isToday ? colors.primary : colors.borderLight,
                                    borderStyle: isCompleted ? 'solid' : 'dashed',
                                    backgroundColor: isCompleted ? '#ECFDF5' : isToday ? colors.primarySoft : 'transparent',
                                }
                             ]}>
                                {isCompleted ? (
                                    <Text style={s.checkTxt}>✓</Text>
                                ) : (
                                    <Text style={[s.dayLetter, isToday && { color: colors.primary }]}>{day}</Text>
                                )}
                            </View>
                            <Text style={[s.dayLabel, isToday && { color: colors.primary }]}>{day}</Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: 28,
        padding: 20,
        borderWidth: 1,
        borderColor: colors.borderLight,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 1,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    title: {
        fontSize: 14,
        ...FONT.heavy,
        color: colors.textPrimary,
    },
    badge: {
        fontSize: 12,
        ...FONT.bold,
    },
    daysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    dayItem: {
        alignItems: 'center',
        gap: 6,
    },
    dayCircle: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkTxt: {
        fontSize: 12,
        color: colors.success,
        ...FONT.bold,
    },
    dayLetter: {
        fontSize: 11,
        color: colors.textMuted,
        ...FONT.medium,
    },
    dayLabel: {
        fontSize: 10,
        ...FONT.semibold,
        color: colors.textSecondary,
    },
});
