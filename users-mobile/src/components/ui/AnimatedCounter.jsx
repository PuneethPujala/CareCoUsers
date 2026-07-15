import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withSpring,
    runOnJS,
} from 'react-native-reanimated';
import { reanimatedMotion } from '../../theme/reanimatedMotion';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export default function AnimatedCounter({
    value = 0,
    decimals = 0,
    prefix = '',
    suffix = '',
    useGrouping = true,
    fromValue,
    style,
    ...props
}) {
    const animatedValue = useSharedValue(fromValue !== undefined ? fromValue : value);

    useEffect(() => {
        if (fromValue !== undefined) {
            animatedValue.value = fromValue;
        }
        animatedValue.value = withSpring(value, reanimatedMotion.springs.default);
    }, [value, fromValue, animatedValue]);

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

    const startValue = fromValue !== undefined ? fromValue : value;
    const initialFormatted = `${prefix}${startValue.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, useGrouping ? ',' : '')}${suffix}`;

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
