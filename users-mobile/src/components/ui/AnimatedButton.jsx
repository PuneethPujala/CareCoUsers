import React, { useEffect } from 'react';
import { StyleSheet, Pressable, ActivityIndicator, Platform, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { reanimatedMotion } from '../../theme/reanimatedMotion';
import { HapticPatterns } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function AnimatedButton({
    children,
    onPress,
    disabled = false,
    loading = false,
    hapticType = 'selection', // 'selection' | 'log' | 'milestone' | 'none'
    pressScale = 0.97,
    backgroundColor = '#7C3AED',
    rippleColor = 'rgba(255, 255, 255, 0.2)',
    style,
    contentStyle,
    loaderColor = '#FFFFFF',
    ...props
}) {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(1);

    useEffect(() => {
        opacity.value = withTiming(disabled ? 0.5 : 1, {
            duration: reanimatedMotion.durations.fast,
        });
    }, [disabled, opacity]);

    const handlePressIn = () => {
        if (disabled || loading) return;
        scale.value = withSpring(pressScale, reanimatedMotion.springs.snappy);
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, reanimatedMotion.springs.snappy);
    };

    const handlePress = () => {
        if (disabled || loading) return;
        if (hapticType !== 'none' && HapticPatterns[hapticType]) {
            HapticPatterns[hapticType]();
        }
        if (onPress) onPress();
    };

    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: opacity.value,
            transform: [{ scale: scale.value }],
        };
    });

    return (
        <AnimatedPressable
            disabled={disabled || loading}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handlePress}
            android_ripple={
                !disabled && !loading
                    ? { color: rippleColor, borderless: false }
                    : null
            }
            style={[
                styles.button,
                { backgroundColor },
                animatedStyle,
                style,
            ]}
            {...props}
        >
            <View style={[styles.contentContainer, contentStyle]}>
                {loading ? (
                    <ActivityIndicator size="small" color={loaderColor} testID="loader" />
                ) : (
                    children
                )}
            </View>
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    button: {
        borderRadius: 12,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 24,
    },
    contentContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
