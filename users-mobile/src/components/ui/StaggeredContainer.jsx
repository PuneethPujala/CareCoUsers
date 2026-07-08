import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withDelay,
    withSpring,
} from 'react-native-reanimated';
import { reanimatedMotion } from '../../theme/reanimatedMotion';

export default function StaggeredContainer({
    children,
    staggerDelay = 40,
    slideDistance = 15,
    style,
    ...props
}) {
    const childrenArray = React.Children.toArray(children);

    return (
        <View style={style} {...props}>
            {childrenArray.map((child, index) => (
                <StaggeredItem
                    key={child.key || index}
                    index={index}
                    staggerDelay={staggerDelay}
                    slideDistance={slideDistance}
                >
                    {child}
                </StaggeredItem>
            ))}
        </View>
    );
}

function StaggeredItem({ children, index, staggerDelay, slideDistance }) {
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = withDelay(
            index * staggerDelay,
            withSpring(1, reanimatedMotion.springs.default)
        );
    }, [index, staggerDelay, progress]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: progress.value,
            transform: [
                {
                    translateY: (1 - progress.value) * slideDistance,
                },
                {
                    scale: 0.98 + 0.02 * progress.value,
                },
            ],
        };
    });

    return (
        <Animated.View style={animatedStyle}>
            {children}
        </Animated.View>
    );
}
