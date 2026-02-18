import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, Radius } from '../../theme/colors';

/**
 * Premium gradient header with title, subtitle, back button, and action slot
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {string[]} [props.colors] - gradient colors (defaults to blue)
 * @param {Function} [props.onBack] - back button handler
 * @param {React.ReactNode} [props.rightAction] - right side content
 * @param {React.ReactNode} [props.children] - content below title
 * @param {'light-content'|'dark-content'} [props.barStyle]
 */
export default function GradientHeader({
    title, subtitle, colors, onBack,
    rightAction, children, barStyle = 'light-content',
}) {
    const gradColors = colors || Colors.gradient;

    return (
        <LinearGradient colors={gradColors} style={styles.container} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <StatusBar barStyle={barStyle} />
            <SafeAreaView edges={['top']}>
                <View style={styles.topRow}>
                    {onBack ? (
                        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
                            <Text style={styles.backIcon}>←</Text>
                        </TouchableOpacity>
                    ) : <View style={styles.backPlaceholder} />}
                    <View style={{ flex: 1 }} />
                    {rightAction || <View style={styles.backPlaceholder} />}
                </View>

                <View style={styles.titleArea}>
                    {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                    <Text style={styles.title}>{title}</Text>
                </View>

                {children}
            </SafeAreaView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.lg,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Spacing.sm,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: Radius.full,
        backgroundColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    backIcon: {
        fontSize: 20,
        color: '#fff',
        fontWeight: '700',
    },
    backPlaceholder: { width: 40 },
    titleArea: {
        marginTop: Spacing.md,
    },
    subtitle: {
        ...Typography.caption,
        color: 'rgba(255,255,255,0.75)',
        marginBottom: Spacing.xs,
    },
    title: {
        ...Typography.h1,
        color: '#fff',
    },
});
