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
                <Text style={[s.badge, { color: '#7C3AED' }]}>
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
                                    borderColor: isCompleted ? '#7C3AED' : isToday ? '#7C3AED' : '#E4E4E7',
                                    borderStyle: isCompleted ? 'solid' : 'dashed',
                                    backgroundColor: isCompleted ? '#7C3AED' : isToday ? '#FAF5FF' : 'transparent',
                                }
                             ]}>
                                {isCompleted ? (
                                    <Text style={s.checkTxt}>✓</Text>
                                ) : (
                                    <Text style={[s.dayLetter, isToday && { color: '#7C3AED' }]}>{day}</Text>
                                )}
                            </View>
                            <Text style={[s.dayLabel, isToday && { color: '#7C3AED' }]}>{day}</Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(15, 23, 42, 0.04)',
        marginBottom: 20,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 30,
        elevation: 4,
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
        color: '#0F172A',
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
        color: '#FFFFFF',
        ...FONT.bold,
    },
    dayLetter: {
        fontSize: 11,
        color: '#94A3B8',
        ...FONT.medium,
    },
    dayLabel: {
        fontSize: 10,
        ...FONT.semibold,
        color: '#64748B',
    },
});

