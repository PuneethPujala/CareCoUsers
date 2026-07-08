import React, { useEffect } from 'react';
import { FlatList } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withDelay,
    withSpring,
} from 'react-native-reanimated';
import { reanimatedMotion } from '../../theme/reanimatedMotion';

export default function AnimatedList({
    data,
    renderItem,
    staggerDelay = 40,
    slideDistance = 15,
    ...props
}) {
    const renderAnimatedItem = ({ item, index }) => {
        return (
            <AnimatedItem
                index={index}
                staggerDelay={staggerDelay}
                slideDistance={slideDistance}
            >
                {renderItem({ item, index })}
            </AnimatedItem>
        );
    };

    return (
        <FlatList
            data={data}
            renderItem={renderAnimatedItem}
            {...props}
        />
    );
}

function AnimatedItem({ children, index, staggerDelay, slideDistance }) {
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
