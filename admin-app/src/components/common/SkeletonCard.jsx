// admin-app/src/components/common/SkeletonCard.jsx
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../../theme/theme';

const { width: SW } = Dimensions.get('window');

export default function SkeletonCard({ width = '48%', height = 180 }) {
    const shimmerValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.timing(shimmerValue, {
                toValue: 1,
                duration: 1500,
                useNativeDriver: true,
            })
        );
        animation.start();

        return () => animation.stop();
    }, []);

    const translateX = shimmerValue.interpolate({
        inputRange: [0, 1],
        outputRange: [-SW, SW],
    });

    return (
        <View style={[s.container, { width, height }]}>
            <View style={s.staticBg} />
            <Animated.View style={[s.shimmerContainer, { transform: [{ translateX }] }]}>
                <LinearGradient
                    colors={['transparent', 'rgba(255,255,255,0.05)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s.shimmer}
                />
            </Animated.View>
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        backgroundColor: Theme.colors.background.card,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        marginBottom: 16,
    },
    staticBg: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    shimmerContainer: {
        ...StyleSheet.absoluteFillObject,
        width: SW * 2,
    },
    shimmer: {
        flex: 1,
    }
});
