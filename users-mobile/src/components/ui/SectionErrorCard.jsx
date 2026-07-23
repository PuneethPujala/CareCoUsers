import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { colors, radius } from '../../theme';
import { FONT } from '../health/constants';

export default function SectionErrorCard({
    title = 'Unable to load section',
    message = 'Check your connection and try again.',
    onRetry,
    retrying = false,
    lastUpdated = null,
}) {
    const formatLastUpdated = (ts) => {
        if (!ts) return null;
        const diffMins = Math.floor((Date.now() - ts) / 60000);
        if (diffMins < 1) return 'Cached just now';
        if (diffMins < 60) return `Cached ${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `Cached ${diffHours}h ago`;
        return `Cached ${Math.floor(diffHours / 24)}d ago`;
    };

    const timeString = formatLastUpdated(lastUpdated);

    return (
        <View style={s.card}>
            <View style={s.iconWrap}>
                <AlertCircle size={20} color="#EF4444" />
            </View>
            <View style={s.content}>
                <Text style={s.title}>{title}</Text>
                <Text style={s.message}>{message}</Text>
                {timeString && (
                    <View style={s.timestampBadge}>
                        <Text style={s.timestampTxt}>{timeString}</Text>
                    </View>
                )}
            </View>
            {onRetry && (
                <Pressable
                    style={({ pressed }) => [s.retryBtn, pressed && { opacity: 0.7 }]}
                    onPress={onRetry}
                    disabled={retrying}
                    hitSlop={8}
                >
                    {retrying ? (
                        <ActivityIndicator size="small" color="#7C3AED" />
                    ) : (
                        <>
                            <RefreshCw size={14} color="#7C3AED" />
                            <Text style={s.retryTxt}>Retry</Text>
                        </>
                    )}
                </Pressable>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF2F2',
        borderRadius: radius.md,
        padding: 14,
        borderWidth: 1,
        borderColor: '#FECACA',
        marginVertical: 6,
        gap: 12,
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#FEE2E2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flex: 1,
    },
    title: {
        fontSize: 14,
        ...FONT.bold,
        color: '#991B1B',
    },
    message: {
        fontSize: 12,
        ...FONT.medium,
        color: '#7F1D1D',
        marginTop: 2,
    },
    timestampBadge: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(185, 28, 28, 0.08)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 100,
        marginTop: 6,
    },
    timestampTxt: {
        fontSize: 10,
        ...FONT.bold,
        color: '#991B1B',
    },
    retryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: 'rgba(124, 58, 237, 0.2)',
    },
    retryTxt: {
        fontSize: 13,
        ...FONT.bold,
        color: '#7C3AED',
    },
});
