import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, radius, spacing } from '../../theme';

// Format a Date object as YYYY-MM-DD in the target timezone
const getLocalDateString = (date, tz) => {
    try {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        return formatter.format(date); // Output format: YYYY-MM-DD
    } catch (e) {
        const pad = (num) => String(num).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
};

// Format a Date object as MMM D, YYYY in the target timezone
const getFormattedDateString = (date, tz) => {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
        return formatter.format(date); // e.g. "Jun 13, 2026"
    } catch (e) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }
};

const StreakCalendar = ({ dailyLog = [], timezone = 'Asia/Kolkata' }) => {
    const [selectedDay, setSelectedDay] = useState(null);

    // Generate last 35 days
    const days = [];
    const now = new Date();

    for (let i = 34; i >= 0; i--) {
        const date = new Date();
        date.setDate(now.getDate() - i);
        const dateStr = getLocalDateString(date, timezone);
        
        // Find matching log entry
        const log = dailyLog.find((l) => l.date === dateStr);
        days.push({
            date: date,
            dateStr: dateStr,
            log: log || null,
        });
    }

    // Map compliance to colors
    const getSquareColor = (day) => {
        if (!day.log || day.log.total === 0) {
            return colors.borderLight; // Rest day / no logs
        }
        const rate = day.log.rate;
        if (rate === 100) return colors.success; // Perfect compliance
        if (rate >= 75) return '#4ADE80'; // High compliance
        if (rate >= 50) return '#86EFAC'; // Medium compliance
        if (rate > 0) return '#CDFFE0'; // Low compliance
        return colors.dangerLight; // Missed all meds
    };

    const handlePressDay = (day) => {
        setSelectedDay(day);
    };

    // Weekday headers
    const weekHeaders = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    return (
        <View style={styles.container}>
            <Text style={styles.title}>35-Day Consistency Board</Text>
            
            {/* Weekday Headers */}
            <View style={styles.headerRow}>
                {weekHeaders.map((h, i) => (
                    <Text key={i} style={styles.headerText}>
                        {h}
                    </Text>
                ))}
            </View>

            {/* Grid */}
            <View style={styles.grid}>
                {days.map((day, idx) => {
                    const bgColor = getSquareColor(day);
                    const isSelected = selectedDay?.dateStr === day.dateStr;
                    return (
                        <TouchableOpacity
                            key={idx}
                            style={[
                                styles.square,
                                { backgroundColor: bgColor },
                                isSelected && styles.selectedSquare,
                            ]}
                            onPress={() => handlePressDay(day)}
                            activeOpacity={0.7}
                        />
                    );
                })}
            </View>

            {/* Selection info details */}
            <View style={styles.detailBox}>
                {selectedDay ? (
                    <Text style={styles.detailText}>
                        {getFormattedDateString(selectedDay.date, timezone)}:{' '}
                        {selectedDay.log && selectedDay.log.total > 0 ? (
                            <Text style={{ fontWeight: '700', color: getSquareColor(selectedDay) === colors.success ? colors.success : colors.textPrimary }}>
                                {selectedDay.log.rate}% Adherence ({selectedDay.log.taken}/{selectedDay.log.total} taken)
                            </Text>
                        ) : (
                            <Text style={{ fontStyle: 'italic', color: colors.textSecondary }}>No medications scheduled / Rest day</Text>
                        )}
                    </Text>
                ) : (
                    <Text style={[styles.detailText, { fontStyle: 'italic', color: colors.textMuted }]}>
                        Tap any square to view daily compliance stats
                    </Text>
                )}
            </View>

            {/* Legend */}
            <View style={styles.legend}>
                <Text style={styles.legendText}>Less</Text>
                <View style={[styles.legendBox, { backgroundColor: colors.borderLight }]} />
                <View style={[styles.legendBox, { backgroundColor: '#CDFFE0' }]} />
                <View style={[styles.legendBox, { backgroundColor: '#86EFAC' }]} />
                <View style={[styles.legendBox, { backgroundColor: '#4ADE80' }]} />
                <View style={[styles.legendBox, { backgroundColor: colors.success }]} />
                <Text style={styles.legendText}>More</Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        padding: spacing.md,
        marginVertical: spacing.sm,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    title: {
        fontSize: typography.sizes.body,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: spacing.md,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginBottom: spacing.xs,
    },
    headerText: {
        width: 32,
        textAlign: 'center',
        fontSize: 10,
        fontWeight: '700',
        color: colors.textMuted,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    square: {
        width: 32,
        height: 32,
        borderRadius: 4,
        marginVertical: 4,
    },
    selectedSquare: {
        borderWidth: 2,
        borderColor: colors.primary,
        transform: [{ scale: 1.1 }],
    },
    detailBox: {
        marginTop: spacing.md,
        minHeight: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    detailText: {
        fontSize: typography.sizes.caption,
        color: colors.textSecondary,
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginTop: spacing.md,
        paddingRight: 4,
    },
    legendText: {
        fontSize: 10,
        color: colors.textMuted,
        marginHorizontal: 4,
        fontWeight: '600',
    },
    legendBox: {
        width: 12,
        height: 12,
        borderRadius: 2,
        marginHorizontal: 2,
    },
});

export default StreakCalendar;
