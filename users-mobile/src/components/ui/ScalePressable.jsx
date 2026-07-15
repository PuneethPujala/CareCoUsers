/**
 * CareMyMed — ScalePressable
 *
 * Global wrapper that gives any touchable element spring-physics
 * tap feedback. Scales down to 0.96 on press, bounces back with
 * a snappy spring, and fires a selection haptic.
 *
 * Usage:
 *   <ScalePressable onPress={() => navigate('Details')}>
 *     <MyCard />
 *   </ScalePressable>
 */

import React from 'react';
import { Pressable } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';
import { reanimatedMotion } from '../../theme/reanimatedMotion';
import { useMotion } from '../../theme/MotionProvider';
import { HapticPatterns } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function ScalePressable({
    children,
    onPress,
    onLongPress,
    pressScale,
    hapticType = 'tap',
    disabled = false,
    style,
    activeOpacity = 1,
    ...props
}) {
    const { reduceMotion } = useMotion();
    const scale = useSharedValue(1);

    const resolvedScale = pressScale ?? reanimatedMotion.scales.pressed;

    const handlePressIn = () => {
        if (reduceMotion) {
            scale.value = 1;
            return;
        }
        scale.value = withSpring(resolvedScale, reanimatedMotion.springs.snappy);
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, reanimatedMotion.springs.snappy);
    };

    const handlePress = () => {
        if (disabled) return;
        if (hapticType !== 'none' && HapticPatterns[hapticType]) {
            HapticPatterns[hapticType]();
        }
        if (onPress) onPress();
    };

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    return (
        <AnimatedPressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handlePress}
            onLongPress={onLongPress}
            disabled={disabled}
            style={[animatedStyle, style]}
            {...props}
        >
            {children}
        </AnimatedPressable>
    );
}
