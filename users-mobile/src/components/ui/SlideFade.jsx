import React, { useEffect } from 'react';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';
import { reanimatedMotion } from '../../theme/reanimatedMotion';

export default function SlideFade({
    children,
    visible = true,
    slideDistance = 15,
    direction = 'up', // 'up' | 'down' | 'left' | 'right'
    style,
}) {
    const progress = useSharedValue(visible ? 1 : 0);

    useEffect(() => {
        progress.value = withSpring(
            visible ? 1 : 0,
            reanimatedMotion.springs.default
        );
    }, [visible, progress]);

    const animatedStyle = useAnimatedStyle(() => {
        let translateX = 0;
        let translateY = 0;

        const offset = (1 - progress.value) * slideDistance;

        if (direction === 'up') translateY = offset;
        else if (direction === 'down') translateY = -offset;
        else if (direction === 'left') translateX = offset;
        else if (direction === 'right') translateX = -offset;

        return {
            opacity: progress.value,
            transform: [{ translateX }, { translateY }],
        };
    });

    return (
        <Animated.View style={[style, animatedStyle]}>
            {children}
        </Animated.View>
    );
}
