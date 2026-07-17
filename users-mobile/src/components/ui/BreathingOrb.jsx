/**
 * CareMyMed — BreathingOrb
 *
 * Pulse-rendered breathing AI orb using pure React Native Animated component.
 * Three concentric layers create a living, organic glow:
 *
 *   Core:       scale 1.00 → 1.04   (solid background color)
 *   Inner glow: scale 1.00 → 1.18   (opacity 0.25 → 0.45)
 *   Outer glow: opacity  0.10 → 0.30 (large scale)
 *
 * Fully disabled when Reduce Motion is on (renders static).
 *
 * Usage:
 *   <BreathingOrb size={80} />
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useMotion } from '../../theme/MotionProvider';

export default function BreathingOrb({
    size = 80,
    coreColors = ['#A78BFA', '#7C3AED'],
    glowColor = '#8B5CF6',
    style,
}) {
    const { reduceMotion } = useMotion();
    const breathAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (reduceMotion) {
            breathAnim.setValue(0);
            return;
        }

        Animated.loop(
            Animated.sequence([
                Animated.timing(breathAnim, {
                    toValue: 1,
                    duration: 1400,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(breathAnim, {
                    toValue: 0,
                    duration: 1400,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, [reduceMotion]);

    const coreSize = size * 0.56;
    const innerGlowSize = size * 0.76;
    const outerGlowSize = size * 0.96;

    // Animate scale & opacity
    const coreScale = breathAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1.0, 1.04],
    });

    const innerScale = breathAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1.0, 1.18],
    });

    const innerOpacity = breathAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.25, 0.45],
    });

    const outerOpacity = breathAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.10, 0.30],
    });

    const staticOpacity = reduceMotion ? 0.35 : undefined;

    return (
        <View style={[styles.container, { width: size, height: size }, style]}>
            {/* Layer 3: Outer glow */}
            <Animated.View
                style={[
                    styles.circle,
                    {
                        width: outerGlowSize,
                        height: outerGlowSize,
                        borderRadius: outerGlowSize / 2,
                        backgroundColor: glowColor,
                        opacity: staticOpacity ?? outerOpacity,
                        transform: [{ scale: innerScale }],
                    },
                ]}
            />

            {/* Layer 2: Inner glow */}
            <Animated.View
                style={[
                    styles.circle,
                    {
                        width: innerGlowSize,
                        height: innerGlowSize,
                        borderRadius: innerGlowSize / 2,
                        backgroundColor: coreColors[0],
                        opacity: staticOpacity ?? innerOpacity,
                        transform: [{ scale: innerScale }],
                    },
                ]}
            />

            {/* Layer 1: Core */}
            <Animated.View
                style={[
                    styles.circle,
                    {
                        width: coreSize,
                        height: coreSize,
                        borderRadius: coreSize / 2,
                        backgroundColor: coreColors[1],
                        transform: [{ scale: coreScale }],
                        shadowColor: coreColors[1],
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 6,
                        elevation: 4,
                    },
                ]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    circle: {
        position: 'absolute',
    },
});
