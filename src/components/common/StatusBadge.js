import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../../theme/colors';

const VARIANTS = {
    success: { bg: Colors.successLight, color: Colors.success },
    warning: { bg: Colors.warningLight, color: Colors.warning },
    error: { bg: Colors.errorLight, color: Colors.error },
    info: { bg: Colors.infoLight, color: Colors.info },
    neutral: { bg: Colors.borderLight, color: Colors.textSecondary },
    primary: { bg: Colors.surfaceAlt, color: Colors.primary },
};

/**
 * Status badge
 *
 * @param {object} props
 * @param {string} props.label
 * @param {'success'|'warning'|'error'|'info'|'neutral'|'primary'} [props.variant='neutral']
 * @param {boolean} [props.dot=false] — show dot instead of filled badge
 * @param {object} [props.style]
 */
export default function StatusBadge({ label, variant = 'neutral', dot = false, style }) {
    const v = VARIANTS[variant] || VARIANTS.neutral;

    if (dot) {
        return (
            <View style={[styles.dotContainer, style]}>
                <View style={[styles.dot, { backgroundColor: v.color }]} />
                <Text style={[styles.dotLabel, { color: v.color }]}>{label}</Text>
            </View>
        );
    }

    return (
        <View style={[styles.badge, { backgroundColor: v.bg }, style]}>
            <Text style={[styles.badgeText, { color: v.color }]}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        paddingHorizontal: Spacing.sm + 2,
        paddingVertical: Spacing.xs,
        borderRadius: Radius.sm,
    },
    badgeText: {
        ...Typography.tiny,
    },
    dotContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs + 2,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    dotLabel: {
        ...Typography.tiny,
    },
});
