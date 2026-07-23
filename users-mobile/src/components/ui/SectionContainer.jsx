import React from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import SectionErrorCard from './SectionErrorCard';

export default function SectionContainer({
    isLoading = false,
    isRevalidating = false,
    isError = false,
    error = null,
    onRetry,
    lastUpdated = null,
    skeletonHeight = 120,
    title = 'Section',
    children,
    style,
}) {
    // 1. Loading without cache -> render skeleton container
    if (isLoading && !children) {
        return (
            <View style={[s.skeletonContainer, { height: skeletonHeight }, style]}>
                <ActivityIndicator size="small" color="#7C3AED" />
            </View>
        );
    }

    // 2. Error without cached data -> render SectionErrorCard
    if (isError && !children) {
        return (
            <View style={style}>
                <SectionErrorCard
                    title={`Unable to load ${title}`}
                    message={error?.message || 'Tap retry to load this section.'}
                    onRetry={onRetry}
                    lastUpdated={lastUpdated}
                />
            </View>
        );
    }

    // 3. Normal / Cached Data Render (with optional background revalidation indicator)
    return (
        <View style={[s.container, style]}>
            {children}
            {isError && children && (
                <View style={s.inlineErrorOverlay}>
                    <SectionErrorCard
                        title={`Stale ${title}`}
                        message="Failed to refresh fresh data. Showing cached version."
                        onRetry={onRetry}
                        lastUpdated={lastUpdated}
                    />
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        position: 'relative',
    },
    skeletonContainer: {
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginVertical: 8,
    },
    inlineErrorOverlay: {
        marginTop: 6,
    },
});
