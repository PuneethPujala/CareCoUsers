import React from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';
import { reanimatedMotion } from '../../theme/reanimatedMotion';
import { useMotion } from '../../theme/MotionProvider';
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
    const { reduceMotion } = useMotion();
    const scale = useSharedValue(1);
    const liftProgress = useSharedValue(0); // 0 (flat) to 1 (lifted)

    const handlePressIn = () => {
        if (reduceMotion) return;
        scale.value = withSpring(pressScale, reanimatedMotion.springs.default);
        liftProgress.value = withSpring(1, reanimatedMotion.springs.default);
    };

    const handlePressOut = () => {
        if (reduceMotion) return;
        scale.value = withSpring(1, reanimatedMotion.springs.default);
        liftProgress.value = withSpring(0, reanimatedMotion.springs.default);
    };

    const handlePress = () => {
        if (onPress) {
            if (hapticType !== 'none' && HapticPatterns[hapticType]) {
                HapticPatterns[hapticType]();
            }
            onPress();
        }
    };

    const animatedStyle = useAnimatedStyle(() => {
        if (reduceMotion) {
            return {
                transform: [{ scale: 1 }],
            };
        }
        // Interpolate elevation/shadow properties to simulate a "card lift"
        const elevation = 2 + liftProgress.value * 6; // Lift from 2 to 8
        const shadowRadius = 24 + liftProgress.value * 8; // Soften ambient shadow on lift
        const shadowOpacity = 0.04 + liftProgress.value * 0.04;

        return {
            elevation,
            shadowRadius,
            shadowOpacity,
            shadowOffset: {
                width: 0,
                height: 8 + liftProgress.value * 4,
            },
            transform: [{ scale: scale.value }],
        };
    });

    const borderGlowStyle = useAnimatedStyle(() => {
        if (reduceMotion) return { borderColor: 'transparent', borderWidth: 0 };
        return {
            borderColor: enableGlow && liftProgress.value > 0.5 ? glowColor : 'transparent',
            borderWidth: enableGlow ? 1.5 : 0,
        };
    });

    // Dual-Shadow layout:
    // Outer component gets the Ambient shadow and Reanimated scale/lift animations
    // Inner component gets the Sharp shadow and border highlights
    return (
        <AnimatedPressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={onPress ? handlePress : undefined}
            disabled={!onPress}
            style={[styles.outerCard, animatedStyle, style]}
            {...props}
        >
            <View style={[styles.innerCard, borderGlowStyle]}>
                {children}
            </View>
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    outerCard: {
        // Large ambient shadow
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.04,
        shadowRadius: 24,
        elevation: 3,
        borderRadius: 20,
        backgroundColor: 'transparent',
    },
    innerCard: {
        // Small sharp shadow + card background & padding
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 16,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 2,
        width: '100%',
    },
});
