import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';

/**
 * Premium button with gradient fill and press animation
 *
 * @param {object} props
 * @param {string} props.title
 * @param {Function} props.onPress
 * @param {'primary'|'secondary'|'danger'|'ghost'} [props.variant='primary']
 * @param {boolean} [props.loading]
 * @param {boolean} [props.disabled]
 * @param {string} [props.icon] - emoji/icon before title
 * @param {object} [props.style]
 */
export default function PremiumButton({
    title, onPress, variant = 'primary',
    loading = false, disabled = false, icon, style,
}) {
    const isDisabled = disabled || loading;

    const renderContent = () => (
        <>
            {loading ? (
                <ActivityIndicator color={variant === 'primary' ? '#fff' : Colors.primary} size="small" />
            ) : (
                <>
                    {icon && <Text style={[styles.icon, variant !== 'primary' && { color: Colors.primary }]}>{icon}</Text>}
                    <Text style={[styles.text, variantStyles[variant]?.text]}>{title}</Text>
                </>
            )}
        </>
    );

    return (
        <View style={style}>
            <TouchableOpacity
                onPress={onPress}
                disabled={isDisabled}
                activeOpacity={0.7}
                style={[isDisabled && { opacity: 0.6 }]}
            >
                {variant === 'primary' ? (
                    <LinearGradient
                        colors={Colors.gradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.base, styles.primary, Shadows.lg]}
                    >
                        {renderContent()}
                    </LinearGradient>
                ) : (
                    <View style={[styles.base, variantStyles[variant]?.container]}>
                        {renderContent()}
                    </View>
                )}
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    base: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.lg,
        borderRadius: Radius.lg,
    },
    primary: {},
    text: {
        ...Typography.button,
        color: '#fff',
    },
    icon: {
        fontSize: 18,
        color: '#fff',
    },
});

const variantStyles = {
    primary: {
        text: { color: '#fff' },
    },
    secondary: {
        container: {
            backgroundColor: Colors.surfaceAlt,
            borderWidth: 1.5,
            borderColor: Colors.primary + '30',
        },
        text: { color: Colors.primary },
    },
    danger: {
        container: {
            backgroundColor: Colors.errorLight,
            borderWidth: 1.5,
            borderColor: Colors.error + '30',
        },
        text: { color: Colors.error },
    },
    ghost: {
        container: {
            backgroundColor: 'transparent',
        },
        text: { color: Colors.primary },
    },
};
