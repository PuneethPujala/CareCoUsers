/**
 * CareMyMed — TabScreenTransition
 *
 * Wraps every screen to provide a unified page entrance animation:
 *   opacity: 0 → 1
 *   translateY: 15px → 0
 *   spring: gentle (damping: 24, stiffness: 80)
 *
 * Uses centralized motion tokens from reanimatedMotion.js.
 * Apple doesn't scale pages — we removed the scale transform.
 */

import React, { useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    interpolate,
} from 'react-native-reanimated';
import { reanimatedMotion } from '../../theme/reanimatedMotion';

export default function TabScreenTransition({ children, style }) {
    const isFocused = useIsFocused();
    const progress = useSharedValue(0);

    useEffect(() => {
        if (isFocused) {
            progress.value = withSpring(1, reanimatedMotion.springs.gentle);
        } else {
            progress.value = withTiming(0, {
                duration: reanimatedMotion.durations.tap,
            });
        }
    }, [isFocused, progress]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: progress.value,
        transform: [
            {
                translateY: interpolate(
                    progress.value,
                    [0, 1],
                    [reanimatedMotion.fadeUp.page, 0]
                ),
            },
        ],
    }));

    return (
        <Animated.View style={[{ flex: 1 }, style, animatedStyle]}>
            {children}
        </Animated.View>
    );
}
