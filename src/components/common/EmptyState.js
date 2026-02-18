import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme/colors';
import PremiumButton from './PremiumButton';

/**
 * Empty state component
 *
 * @param {object} props
 * @param {string} props.icon - emoji
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {string} [props.actionTitle]
 * @param {Function} [props.onAction]
 */
export default function EmptyState({ icon, title, subtitle, actionTitle, onAction }) {
    return (
        <View style={styles.container}>
            <Text style={styles.icon}>{icon}</Text>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            {actionTitle && onAction && (
                <PremiumButton
                    title={actionTitle}
                    onPress={onAction}
                    variant="secondary"
                    style={{ marginTop: Spacing.md }}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.xxxl,
        paddingHorizontal: Spacing.xl,
    },
    icon: {
        fontSize: 48,
        marginBottom: Spacing.md,
    },
    title: {
        ...Typography.h3,
        color: Colors.textPrimary,
        textAlign: 'center',
    },
    subtitle: {
        ...Typography.body,
        color: Colors.textMuted,
        textAlign: 'center',
        marginTop: Spacing.sm,
    },
});
