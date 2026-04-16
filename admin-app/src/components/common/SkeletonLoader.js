import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius } from '../../theme/colors';

/**
 * Skeleton loading placeholder with shimmer effect
 *
 * @param {object} props
 * @param {'text'|'card'|'avatar'|'stat'|'listItem'} [props.variant='text']
 * @param {number} [props.lines=1] — for text variant
 * @param {object} [props.style]
 */
export default function SkeletonLoader({ variant = 'text', lines = 1, style }) {
    const shimmerOpacity = 0.5;

    if (variant === 'avatar') {
        return (
            <View style={[styles.avatar, { opacity: shimmerOpacity }, style]} />
        );
    }

    if (variant === 'card') {
        return (
            <View style={[styles.card, { opacity: shimmerOpacity }, style]}>
                <View style={styles.cardTitle} />
                <View style={styles.cardLine} />
                <View style={[styles.cardLine, { width: '60%' }]} />
            </View>
        );
    }

    if (variant === 'stat') {
        return (
            <View style={[styles.stat, { opacity: shimmerOpacity }, style]}>
                <View style={styles.statIcon} />
                <View style={styles.statVal} />
                <View style={styles.statLabel} />
            </View>
        );
    }

    if (variant === 'listItem') {
        return (
            <View style={[styles.listItem, { opacity: shimmerOpacity }, style]}>
                <View style={styles.listAvatar} />
                <View style={{ flex: 1, gap: Spacing.sm }}>
                    <View style={styles.listTitle} />
                    <View style={styles.listSub} />
                </View>
            </View>
        );
    }

    // text variant
    return (
        <View style={[{ gap: Spacing.sm }, style]}>
            {Array.from({ length: lines }).map((_, i) => (
                <View
                    key={i}
                    style={[
                        styles.textLine,
                        { opacity: shimmerOpacity, width: i === lines - 1 ? '60%' : '100%' },
                    ]}
                />
            ))}
        </View>
    );
}

const base = {
    backgroundColor: Colors.border,
    borderRadius: Radius.sm,
};

const styles = StyleSheet.create({
    textLine: { ...base, height: 14 },
    avatar: { ...base, width: 48, height: 48, borderRadius: Radius.full },
    card: {
        backgroundColor: Colors.white,
        borderRadius: Radius.lg,
        padding: Spacing.md,
        gap: Spacing.sm,
    },
    cardTitle: { ...base, height: 16, width: '45%' },
    cardLine: { ...base, height: 12, width: '80%' },
    stat: {
        backgroundColor: Colors.white,
        borderRadius: Radius.lg,
        padding: Spacing.md,
        alignItems: 'center',
        gap: Spacing.sm,
        width: '48%',
    },
    statIcon: { ...base, width: 40, height: 40, borderRadius: Radius.md },
    statVal: { ...base, height: 24, width: 60 },
    statLabel: { ...base, height: 12, width: 80 },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        backgroundColor: Colors.white,
        borderRadius: Radius.lg,
        padding: Spacing.md,
    },
    listAvatar: { ...base, width: 44, height: 44, borderRadius: Radius.full },
    listTitle: { ...base, height: 14, width: '60%' },
    listSub: { ...base, height: 12, width: '40%' },
});
