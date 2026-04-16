// admin-app/src/components/premium/AnimatedNumber.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Text, Animated, Easing } from 'react-native';

/**
 * AnimatedNumber Component
 * @param {number} value - Final value to count to
 * @param {number} duration - Animation duration in ms
 * @param {string} prefix - Symbol to prepend (e.g. ₹, $)
 * @param {string} suffix - String to append (e.g. %, K, M)
 * @param {object} style - Text styles
 */
export default function AnimatedNumber({ 
    value, 
    duration = 2000, 
    prefix = '', 
    suffix = '', 
    style 
}) {
    const animatedValue = useRef(new Animated.Value(0)).current;
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        // Reset to 0 and animate to target
        animatedValue.setValue(0);

        const listener = animatedValue.addListener(({ value: val }) => {
            setDisplayValue(Math.floor(val));
        });

        Animated.timing(animatedValue, {
            toValue: value,
            duration,
            easing: Easing.out(Easing.exp),
            useNativeDriver: false,
        }).start(() => {
            setDisplayValue(Math.round(value));
        });

        return () => {
            animatedValue.removeListener(listener);
        };
    }, [value, duration]);

    return (
        <Text style={style}>
            {prefix}{displayValue.toLocaleString()}{suffix}
        </Text>
    );
}
