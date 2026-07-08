import React from 'react';
import { StyleSheet, Pressable } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';
import { reanimatedMotion } from '../../theme/reanimatedMotion';
import { HapticPatterns } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function AnimatedCard({
    children,
    onPress,
    pressScale = 1.01,
    hapticType = 'selection', // 'selection' | 'log' | 'none'
    glowColor = '#C084FC',
    enableGlow = false,
    style,
    ...props
}) {
    const scale = useSharedValue(1);
    const liftProgress = useSharedValue(0); // 0 (flat) to 1 (lifted)

    const handlePressIn = () => {
        scale.value = withSpring(pressScale, reanimatedMotion.springs.default);
        liftProgress.value = withSpring(1, reanimatedMotion.springs.default);
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, reanimatedMotion.springs.default);
        liftProgress.value = withSpring(0, reanimatedMotion.springs.default);
    };

    const handlePress = () => {
        if (hapticType !== 'none' && HapticPatterns[hapticType]) {
            HapticPatterns[hapticType]();
        }
        if (onPress) onPress();
    };

    const animatedStyle = useAnimatedStyle(() => {
        // Interpolate elevation/shadow properties to simulate a "card lift"
        const elevation = 2 + liftProgress.value * 6; // Lift from 2 to 8
        const shadowRadius = 4 + liftProgress.value * 8; // Soften shadow on lift
        const shadowOpacity = 0.06 + liftProgress.value * 0.12;

        return {
            elevation,
            shadowRadius,
            shadowOpacity,
            shadowOffset: {
                width: 0,
                height: 2 + liftProgress.value * 4,
            },
            transform: [{ scale: scale.value }],
            borderColor: enableGlow && liftProgress.value > 0.5 ? glowColor : 'transparent',
            borderWidth: enableGlow ? 1.5 : 0,
        };
    });

    return (
        <AnimatedPressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handlePress}
            style={[styles.card, animatedStyle, style]}
            {...props}
        >
            {children}
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
    },
});
