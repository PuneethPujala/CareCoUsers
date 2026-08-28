import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, Animated } from 'react-native';
import { useMotion } from '../../theme/MotionProvider';

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
    const safeValue = Number.isFinite(value) ? value : 0;
    const [displayValue, setDisplayValue] = useState(reduceMotion ? safeValue : 0);
    const animValue = useRef(new Animated.Value(reduceMotion ? safeValue : 0)).current;

    useEffect(() => {
        if (reduceMotion) {
            setDisplayValue(safeValue);
            return;
        }

        const id = animValue.addListener(({ value: val }) => {
            const numVal = Number.isFinite(val) ? val : 0;
            setDisplayValue(numVal);
        });

        Animated.spring(animValue, {
            toValue: safeValue,
            speed: 12,
            bounciness: 4,
            useNativeDriver: false,
        }).start();

        return () => {
            animValue.removeListener(id);
        };
    }, [safeValue, reduceMotion, animValue]);

    const numToFormat = Number.isFinite(displayValue) ? displayValue : 0;
    const rounded = numToFormat.toFixed(decimals);
    let formatted = rounded;
    if (useGrouping) {
        const parts = rounded.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        formatted = parts.join('.');
    }

    const textValue = `${prefix}${formatted}${suffix}`;

    return (
        <Text style={[styles.text, style]} {...props}>
            {textValue}
        </Text>
    );
}

const styles = StyleSheet.create({
    text: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#0F172A',
    },
});
