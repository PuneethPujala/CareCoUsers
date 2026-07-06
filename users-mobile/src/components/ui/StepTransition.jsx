import React, { useEffect } from 'react';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    interpolate,
} from 'react-native-reanimated';

export default function StepTransition({ children, trigger, style }) {
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = 0;
        progress.value = withSpring(1, {
            damping: 18,
            stiffness: 110,
            mass: 0.9,
        });
    }, [trigger]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: progress.value,
            transform: [
                {
                    translateY: interpolate(progress.value, [0, 1], [15, 0]),
                },
                {
                    scale: interpolate(progress.value, [0, 1], [0.98, 1]),
                },
            ],
        };
    });

    return (
        <Animated.View style={[style, animatedStyle]}>
            {children}
        </Animated.View>
    );
}
