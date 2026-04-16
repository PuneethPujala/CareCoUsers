import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../../theme/colors';

/**
 * Premium input with focus border effect and icon support
 *
 * @param {object} props
 * @param {string} [props.label]
 * @param {React.ReactNode | string} [props.icon] - Vector icon element or string
 * @param {string} [props.placeholder]
 * @param {string} props.value
 * @param {Function} props.onChangeText
 * @param {boolean} [props.secureTextEntry]
 * @param {string} [props.keyboardType]
 * @param {string} [props.autoCapitalize]
 * @param {React.ReactNode} [props.rightElement]
 * @param {string} [props.error]
 * @param {object} [props.style]
 */
export default function PremiumInput({
    label, icon, placeholder, value, onChangeText,
    secureTextEntry, keyboardType, autoCapitalize,
    rightElement, error, style,
}) {
    const [focused, setFocused] = useState(false);

    const borderColor = error ? Colors.error : focused ? Colors.primary : Colors.border;

    return (
        <View style={[styles.container, style]}>
            {label && <Text style={styles.label}>{label}</Text>}
            <View style={[
                styles.inputWrap,
                { borderColor },
                focused && styles.inputFocused,
            ]}>
                {icon && (
                    <View style={styles.iconContainer}>
                        {typeof icon === 'string' ? <Text style={styles.iconText}>{icon}</Text> : icon}
                    </View>
                )}
                <TextInput
                    style={styles.input}
                    placeholder={placeholder}
                    placeholderTextColor={Colors.textMuted}
                    value={value}
                    onChangeText={onChangeText}
                    secureTextEntry={secureTextEntry}
                    keyboardType={keyboardType}
                    autoCapitalize={autoCapitalize}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                />
                {rightElement}
            </View>
            {error && <Text style={styles.error}>{error}</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.md,
    },
    label: {
        ...Typography.label,
        color: Colors.textSecondary,
        marginBottom: Spacing.sm,
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm + 2,
        backgroundColor: Colors.background,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: 14,
        borderWidth: 1.5,
        borderColor: Colors.border,
    },
    inputFocused: {
        backgroundColor: Colors.surfaceAlt,
    },
    iconContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        width: 20,
    },
    iconText: {
        fontSize: 16,
    },
    input: {
        flex: 1,
        ...Typography.body,
        color: Colors.textPrimary,
    },
    error: {
        ...Typography.tiny,
        color: Colors.error,
        marginTop: Spacing.xs,
    },
});
