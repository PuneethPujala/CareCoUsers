import React from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '../../theme';

const FONT = {
    semibold: { fontFamily: 'Inter_600SemiBold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export default function CompanionHeader({
    subtitle,
    title,
    onBack,
    right,
    badge,
    titleNumberOfLines = 1,
    style,
}) {
    const isTransparent = style?.backgroundColor === 'transparent';
    const statusBarBg = isTransparent ? 'transparent' : (style?.backgroundColor || colors.surface);

    return (
        <View style={[styles.header, style]}>
            <StatusBar barStyle="dark-content" backgroundColor={statusBarBg} translucent={isTransparent} />
            <View style={styles.leftGroup}>
                {onBack && (
                    <Pressable
                        onPress={onBack}
                        style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
                        hitSlop={10}
                    >
                        <ChevronLeft color={colors.textPrimary} size={28} />
                    </Pressable>
                )}
                <View style={styles.titleBlock}>
                    <Text style={styles.headerSub}>{subtitle}</Text>
                    <View style={styles.titleRow}>
                        <Text
                            style={styles.title}
                            numberOfLines={titleNumberOfLines}
                            adjustsFontSizeToFit
                            minimumFontScale={0.78}
                        >
                            {title}
                        </Text>
                        {badge ? (
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>{badge}</Text>
                            </View>
                        ) : null}
                    </View>
                </View>
            </View>
            {right ? <View style={styles.rightGroup}>{right}</View> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingTop: 60,
        paddingHorizontal: 24,
        paddingBottom: 20,
        backgroundColor: colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    leftGroup: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    backButton: {
        padding: 4,
        marginLeft: -4,
    },
    titleBlock: {
        flex: 1,
        minWidth: 0,
    },
    headerSub: {
        fontSize: 12,
        ...FONT.semibold,
        color: colors.primary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        minWidth: 0,
    },
    title: {
        flexShrink: 1,
        minWidth: 0,
        fontSize: 24,
        ...FONT.heavy,
        color: colors.textPrimary,
    },
    rightGroup: {
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    badge: {
        flexShrink: 0,
        backgroundColor: '#FFF0F2',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    badgeText: {
        color: '#E11D48',
        fontSize: 11,
        ...FONT.semibold,
    },
});
