import React, { useEffect } from 'react';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';
import { reanimatedMotion } from '../../theme/reanimatedMotion';

export default function ScaleFade({
    children,
    visible = true,
    initialScale = 0.95,
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
        return {
            opacity: progress.value,
            transform: [
                {
                    scale: initialScale + (1 - initialScale) * progress.value,
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
