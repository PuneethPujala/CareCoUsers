import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Shadows } from '../../theme/colors';

/**
 * Premium card with soft shadow and optional press animation
 *
 * @param {object} props
 * @param {Function} [props.onPress]
 * @param {object} [props.style]
 * @param {React.ReactNode} props.children
 * @param {'sm'|'md'|'lg'} [props.shadow='card']
 * @param {boolean} [props.pressable=false]
 */
export default function PremiumCard({
    onPress, style, children, shadow = 'card', pressable = false,
}) {
    const content = (
        <View style={[
            styles.card,
            Shadows[shadow] || Shadows.card,
            style,
        ]}>
            {children}
        </View>
    );

    if (onPress) {
        return (
            <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.7}
            >
                {content}
            </TouchableOpacity>
        );
    }

    return content;
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.white,
        borderRadius: Radius.lg,
        padding: Spacing.md,
    },
});
