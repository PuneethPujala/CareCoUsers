import React, { useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    interpolate,
} from 'react-native-reanimated';

export default function TabScreenTransition({ children, style }) {
    const isFocused = useIsFocused();
    const progress = useSharedValue(0);

    useEffect(() => {
        if (isFocused) {
            progress.value = withSpring(1, {
                damping: 18,
                stiffness: 110,
                mass: 0.9,
            });
        } else {
            progress.value = withTiming(0, { duration: 150 });
        }
    }, [isFocused, progress]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: progress.value,
            transform: [
                {
                    translateY: interpolate(progress.value, [0, 1], [25, 0]),
                },
                {
                    scale: interpolate(progress.value, [0, 1], [0.975, 1]),
                },
            ],
        };
    });

    return (
        <Animated.View style={[{ flex: 1 }, style, animatedStyle]}>
            {children}
        </Animated.View>
    );
}
