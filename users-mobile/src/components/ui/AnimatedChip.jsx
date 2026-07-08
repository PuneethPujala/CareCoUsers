import React, { useEffect } from 'react';
import { StyleSheet, Pressable } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    interpolateColor,
} from 'react-native-reanimated';
import { reanimatedMotion } from '../../theme/reanimatedMotion';
import { HapticPatterns } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function AnimatedChip({
    label,
    selected = false,
    onPress,
    hapticType = 'selection', // 'selection' | 'none'
    activeBg = '#FAF5FF',
    inactiveBg = '#FFFFFF',
    activeBorder = '#C084FC',
    inactiveBorder = '#E2E8F0',
    activeText = '#7C3AED',
    inactiveText = '#64748B',
    style,
    textStyle,
    ...props
}) {
    const scale = useSharedValue(1);
    const selectProgress = useSharedValue(selected ? 1 : 0);

    useEffect(() => {
        selectProgress.value = withTiming(
            selected ? 1 : 0,
            { duration: reanimatedMotion.durations.fast }
        );
    }, [selected, selectProgress]);

    const handlePressIn = () => {
        scale.value = withSpring(0.96, reanimatedMotion.springs.snappy);
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, reanimatedMotion.springs.snappy);
    };

    const handlePress = () => {
        if (hapticType !== 'none' && HapticPatterns[hapticType]) {
            HapticPatterns[hapticType]();
        }
        if (onPress) onPress();
    };

    const animatedStyle = useAnimatedStyle(() => {
        const backgroundColor = interpolateColor(
            selectProgress.value,
            [0, 1],
            [inactiveBg, activeBg]
        );
        const borderColor = interpolateColor(
            selectProgress.value,
            [0, 1],
            [inactiveBorder, activeBorder]
        );

        return {
            backgroundColor,
            borderColor,
            transform: [{ scale: scale.value }],
        };
    });

    const animatedTextStyle = useAnimatedStyle(() => {
        const color = interpolateColor(
            selectProgress.value,
            [0, 1],
            [inactiveText, activeText]
        );
        return {
            color,
        };
    });

    return (
        <AnimatedPressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handlePress}
            style={[styles.chip, animatedStyle, style]}
            {...props}
        >
            <Animated.Text style={[styles.labelText, animatedTextStyle, textStyle]}>
                {label}
            </Animated.Text>
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    chip: {
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-start',
    },
    labelText: {
        fontSize: 13,
        fontWeight: '600',
    },
});
