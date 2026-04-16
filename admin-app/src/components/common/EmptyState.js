import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Theme } from '../../theme/theme';

/**
 * Empty state component — HD Premium version using Feather icons
 *
 * @param {object} props
 * @param {string} props.icon - Feather icon name (e.g. 'inbox', 'users', 'phone')
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {string} [props.actionTitle]
 * @param {Function} [props.onAction]
 */
export default function EmptyState({ icon = 'inbox', title, subtitle, actionTitle, onAction }) {
    return (
        <View style={styles.container}>
            <View style={styles.iconWrap}>
                <Feather name={icon} size={36} color="#94A3B8" />
            </View>
            <Text style={[styles.title, Theme.typography.common]}>{title}</Text>
            {subtitle && <Text style={[styles.subtitle, Theme.typography.common]}>{subtitle}</Text>}
            {actionTitle && onAction && (
                <View style={styles.actionWrap}>
                    <Text onPress={onAction} style={[styles.actionText, Theme.typography.common]}>{actionTitle}</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 32,
    },
    iconWrap: {
        width: 80,
        height: 80,
        borderRadius: 24,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        ...Theme.shadows.sharp,
    },
    title: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 15,
        fontWeight: '500',
        color: '#64748B',
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 22,
    },
    actionWrap: {
        marginTop: 20,
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#2563EB',
        borderRadius: 12,
    },
    actionText: {
        fontSize: 15,
        fontWeight: '800',
        color: '#FFFFFF',
    },
});
