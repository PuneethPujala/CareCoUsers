/**
 * CareMyMed — AnimatedNumber
 *
 * Counts up from 0 to the target value with spring physics.
 * Reduce-motion-aware: shows final value immediately when
 * accessibility setting is on.
 *
 * Usage:
 *   <AnimatedNumber value={85} suffix="%" style={styles.bigNumber} />
 *   <AnimatedNumber value={12} prefix="🔥 " suffix=" Day Streak" />
 */

import React, { useEffect } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { reanimatedMotion } from '../../theme/reanimatedMotion';
import { useMotion } from '../../theme/MotionProvider';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export default function AnimatedNumber({
    value = 0,
    decimals = 0,
    prefix = '',
    suffix = '',
    useGrouping = true,
    springConfig = 'default',
    style,
    ...props
}) {
    const { reduceMotion } = useMotion();
    const animatedValue = useSharedValue(reduceMotion ? value : 0);

    useEffect(() => {
        if (reduceMotion) {
            // Immediately jump to value — no animation
            animatedValue.value = withTiming(value, { duration: 0 });
        } else {
            animatedValue.value = withSpring(
                value,
                reanimatedMotion.springs[springConfig] || reanimatedMotion.springs.default
            );
        }
    }, [value, reduceMotion, animatedValue, springConfig]);

    const formatNumber = (num) => {
        'worklet';
        const rounded = num.toFixed(decimals);
        if (!useGrouping) return rounded;

        const parts = rounded.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return parts.join('.');
    };

    const animatedProps = useAnimatedProps(() => {
        const formatted = `${prefix}${formatNumber(animatedValue.value)}${suffix}`;
        return {
            text: formatted,
            value: formatted,
        };
    });

    const initialFormatted = reduceMotion
        ? `${prefix}${value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, useGrouping ? ',' : '')}${suffix}`
        : `${prefix}0${suffix}`;

    return (
        <AnimatedTextInput
            editable={false}
            pointerEvents="none"
            style={[styles.textInput, style]}
            animatedProps={animatedProps}
            defaultValue={initialFormatted}
            {...props}
        />
    );
}

const styles = StyleSheet.create({
    textInput: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#0F172A',
        padding: 0,
        margin: 0,
    },
});
