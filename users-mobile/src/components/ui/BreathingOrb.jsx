/**
 * CareMyMed — BreathingOrb
 *
 * GPU-rendered breathing AI orb using React Native Skia.
 * Three concentric layers create a living, organic glow:
 *
 *   Core:       scale 1.00 → 1.04   (solid gradient fill)
 *   Inner glow: scale 1.00 → 1.18   (opacity 0.25 → 0.45)
 *   Outer glow: opacity  0.10 → 0.30 (large blur radius)
 *
 * Fully disabled when Reduce Motion is on (renders static).
 *
 * Usage:
 *   <BreathingOrb size={80} />
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, Circle, Group, Blur, RadialGradient, vec } from '@shopify/react-native-skia';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    Easing,
    interpolate,
    useAnimatedProps,
} from 'react-native-reanimated';
import { useMotion } from '../../theme/MotionProvider';

const BREATH_DURATION = 2800; // Full breath cycle (inhale + exhale)

export default function BreathingOrb({
    size = 80,
    coreColors = ['#A78BFA', '#7C3AED'],
    glowColor = '#8B5CF6',
    style,
}) {
    const { reduceMotion } = useMotion();
    const breath = useSharedValue(0);

    useEffect(() => {
        if (reduceMotion) {
            breath.value = 0;
            return;
        }

        breath.value = withRepeat(
            withSequence(
                withTiming(1, {
                    duration: BREATH_DURATION / 2,
                    easing: Easing.inOut(Easing.sin),
                }),
                withTiming(0, {
                    duration: BREATH_DURATION / 2,
                    easing: Easing.inOut(Easing.sin),
                })
            ),
            -1, // infinite
            false
        );
    }, [reduceMotion, breath]);

    const center = size / 2;
    const coreRadius = size * 0.28;
    const innerGlowRadius = size * 0.38;
    const outerGlowRadius = size * 0.48;

    // Animate the wrapper view for scale (core layer)
    const coreAnimatedStyle = useAnimatedStyle(() => {
        const scale = interpolate(breath.value, [0, 1], [1.0, 1.04]);
        return {
            transform: [{ scale }],
        };
    });

    // Inner glow scale + opacity
    const innerGlowAnimatedStyle = useAnimatedStyle(() => {
        const scale = interpolate(breath.value, [0, 1], [1.0, 1.18]);
        const opacity = interpolate(breath.value, [0, 1], [0.25, 0.45]);
        return {
            transform: [{ scale }],
            opacity,
        };
    });

    // Outer glow opacity
    const outerGlowAnimatedStyle = useAnimatedStyle(() => {
        const opacity = interpolate(breath.value, [0, 1], [0.10, 0.30]);
        return { opacity };
    });

    const staticOpacity = reduceMotion ? 0.35 : undefined;

    return (
        <View style={[styles.container, { width: size, height: size }, style]}>
            {/* Layer 3: Outer glow (largest, faintest) */}
            <Animated.View style={[styles.absoluteFill, outerGlowAnimatedStyle, staticOpacity != null && { opacity: staticOpacity }]}>
                <Canvas style={{ width: size, height: size }}>
                    <Circle cx={center} cy={center} r={outerGlowRadius} opacity={0.5}>
                        <RadialGradient
                            c={vec(center, center)}
                            r={outerGlowRadius}
                            colors={[glowColor, 'transparent']}
                        />
                        <Blur blur={12} />
                    </Circle>
                </Canvas>
            </Animated.View>

            {/* Layer 2: Inner glow */}
            <Animated.View style={[styles.absoluteFill, innerGlowAnimatedStyle, staticOpacity != null && { opacity: 0.35 }]}>
                <Canvas style={{ width: size, height: size }}>
                    <Circle cx={center} cy={center} r={innerGlowRadius} opacity={0.7}>
                        <RadialGradient
                            c={vec(center, center)}
                            r={innerGlowRadius}
                            colors={[coreColors[0], 'transparent']}
                        />
                        <Blur blur={6} />
                    </Circle>
                </Canvas>
            </Animated.View>

            {/* Layer 1: Core (solid gradient) */}
            <Animated.View style={[styles.absoluteFill, coreAnimatedStyle]}>
                <Canvas style={{ width: size, height: size }}>
                    <Circle cx={center} cy={center} r={coreRadius}>
                        <RadialGradient
                            c={vec(center, center)}
                            r={coreRadius}
                            colors={coreColors}
                        />
                    </Circle>
                </Canvas>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    absoluteFill: {
        ...StyleSheet.absoluteFillObject,
    },
});
