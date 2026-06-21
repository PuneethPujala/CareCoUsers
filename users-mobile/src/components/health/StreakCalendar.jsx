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

    // Map overall health score to colors
    const getSquareColor = (day) => {
        if (!day.log || day.log.score === null || day.log.score === undefined) {
            return colors.borderLight; // No log for this day
        }
        const score = day.log.score;
        if (score >= 85) return colors.success;   // Excellent
        if (score >= 70) return '#4ADE80';         // Good
        if (score >= 50) return '#FCD34D';         // Fair / Warning
        return '#FCA5A5';                         // Low / Attention needed
    };

    const handlePressDay = (day) => {
        setSelectedDay(day);
    };

    // Weekday headers
    const weekHeaders = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    return (
        <View style={styles.container}>
            <Text style={styles.title}>35-Day Health Balance Board</Text>
            
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
                {(() => {
                    const weeks = [];
                    for (let i = 0; i < days.length; i += 7) {
                        weeks.push(days.slice(i, i + 7));
                    }
                    return weeks.map((week, wIdx) => (
                        <View key={`week-${wIdx}`} style={styles.weekRow}>
                            {week.map((day, dIdx) => {
                                const bgColor = getSquareColor(day);
                                const isSelected = selectedDay?.dateStr === day.dateStr;
                                return (
                                    <TouchableOpacity
                                        key={`day-${dIdx}`}
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
                    ));
                })()}
            </View>

            {/* Selection info details */}
            <View style={styles.detailBox}>
                {selectedDay ? (
                    <View style={styles.detailCard}>
                        <View style={styles.detailHeader}>
                            <Text style={styles.detailDate}>
                                {getFormattedDateString(selectedDay.date, timezone)}
                            </Text>
                            {selectedDay.log && selectedDay.log.score !== null ? (
                                <View style={[styles.scoreBadge, { backgroundColor: getSquareColor(selectedDay) + '22' }]}>
                                    <Text style={[styles.scoreBadgeText, { color: getSquareColor(selectedDay) === colors.success ? colors.success : getSquareColor(selectedDay) }]}>
                                        Daily Score: {selectedDay.log.score}/100
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                        
                        {selectedDay.log ? (
                            <View style={styles.metricsRow}>
                                <View style={styles.metricItem}>
                                    <Text style={styles.metricIcon}>💊</Text>
                                    <Text style={styles.metricText}>
                                        {selectedDay.log.adherence !== null ? `${selectedDay.log.adherence}%` : '—'}
                                    </Text>
                                    <Text style={styles.metricLabel}>Meds</Text>
                                </View>
                                <View style={styles.metricDivider} />
                                <View style={styles.metricItem}>
                                    <Text style={styles.metricIcon}>
                                        {selectedDay.log.mood === 'great' ? '😄' : selectedDay.log.mood === 'good' ? '😊' : selectedDay.log.mood === 'okay' ? '😐' : selectedDay.log.mood === 'sad' ? '😢' : '—'}
                                    </Text>
                                    <Text style={styles.metricText}>
                                        {selectedDay.log.mood ? selectedDay.log.mood.charAt(0).toUpperCase() + selectedDay.log.mood.slice(1) : '—'}
                                    </Text>
                                    <Text style={styles.metricLabel}>Mood</Text>
                                </View>
                                <View style={styles.metricDivider} />
                                <View style={styles.metricItem}>
                                    <Text style={styles.metricIcon}>😴</Text>
                                    <Text style={styles.metricText}>
                                        {selectedDay.log.sleepHours ? `${selectedDay.log.sleepHours}h` : '—'}
                                    </Text>
                                    <Text style={styles.metricLabel}>Sleep</Text>
                                </View>
                                <View style={styles.metricDivider} />
                                <View style={styles.metricItem}>
                                    <Text style={styles.metricIcon}>🩺</Text>
                                    <Text style={styles.metricText}>
                                        {selectedDay.log.bp && selectedDay.log.bp.systolic ? `${selectedDay.log.bp.systolic}/${selectedDay.log.bp.diastolic}` : '—'}
                                    </Text>
                                    <Text style={styles.metricLabel}>BP</Text>
                                </View>
                            </View>
                        ) : (
                            <Text style={styles.noDataText}>No health data logged for this day</Text>
                        )}
                    </View>
                ) : (
                    <Text style={styles.placeholderText}>
                        Tap any square to view daily wellness and vitals stats
                    </Text>
                )}
            </View>

            {/* Legend */}
            <View style={styles.legend}>
                <View style={[styles.legendBox, { backgroundColor: '#FCA5A5' }]} />
                <Text style={styles.legendText}>Low</Text>
                <View style={[styles.legendBox, { backgroundColor: '#FCD34D' }]} />
                <Text style={styles.legendText}>Fair</Text>
                <View style={[styles.legendBox, { backgroundColor: '#4ADE80' }]} />
                <Text style={styles.legendText}>Good</Text>
                <View style={[styles.legendBox, { backgroundColor: colors.success }]} />
                <Text style={styles.legendText}>Excellent</Text>
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
        width: '100%',
    },
    weekRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginVertical: 4,
    },
    square: {
        width: 32,
        height: 32,
        borderRadius: 4,
    },
    selectedSquare: {
        borderWidth: 2,
        borderColor: colors.primary,
        transform: [{ scale: 1.1 }],
    },
    detailBox: {
        marginTop: spacing.md,
        minHeight: 80,
        justifyContent: 'center',
        width: '100%',
    },
    detailCard: {
        width: '100%',
        backgroundColor: colors.background,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    detailHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    detailDate: {
        fontSize: typography.sizes.body,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    scoreBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    scoreBadgeText: {
        fontSize: 10,
        fontWeight: '700',
    },
    metricsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    metricItem: {
        flex: 1,
        alignItems: 'center',
    },
    metricIcon: {
        fontSize: 16,
        marginBottom: 2,
    },
    metricText: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    metricLabel: {
        fontSize: 9,
        color: colors.textMuted,
        marginTop: 2,
        textTransform: 'uppercase',
        fontWeight: '600',
    },
    metricDivider: {
        width: 1,
        height: 24,
        backgroundColor: colors.borderLight,
    },
    noDataText: {
        fontSize: typography.sizes.caption,
        color: colors.textMuted,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    placeholderText: {
        fontSize: typography.sizes.caption,
        color: colors.textMuted,
        textAlign: 'center',
        fontStyle: 'italic',
        width: '100%',
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
