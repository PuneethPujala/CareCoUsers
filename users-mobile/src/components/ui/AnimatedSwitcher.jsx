import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
import { reanimatedMotion } from '../../theme/reanimatedMotion';

export default function AnimatedSwitcher({
    children,
    transitionKey,
    style,
    duration = reanimatedMotion.durations.normal,
    direction = 'slide', // 'fade' | 'slide'
}) {
    const [currentChild, setCurrentChild] = useState(children);
    const [prevChild, setPrevChild] = useState(null);
    const [isTransitioning, setIsTransitioning] = useState(false);

    const progress = useSharedValue(1);
    const prevKeyRef = useRef(transitionKey);

    useEffect(() => {
        if (transitionKey !== prevKeyRef.current) {
            setPrevChild(currentChild);
            setIsTransitioning(true);
            prevKeyRef.current = transitionKey;

            // Step 1: Animate out
            progress.value = withTiming(0, { duration: duration / 2 }, () => {
                runOnJS(() => {
                    // Step 2: Swap Content
                    setCurrentChild(children);
                    setPrevChild(null);

                    // Step 3: Animate in
                    progress.value = withTiming(1, { duration: duration / 2 }, () => {
                        runOnJS(setIsTransitioning)(false);
                    });
                })();
            });
        } else {
            // Update children in case props inside children changed without key change
            setCurrentChild(children);
        }
    }, [transitionKey, children, duration, progress]);

    const animatedStyle = useAnimatedStyle(() => {
        const opacity = progress.value;
        const translateX = direction === 'slide' ? (1 - progress.value) * 20 : 0;
        const scale = direction === 'slide' ? 0.98 + 0.02 * progress.value : 1;

        return {
            opacity,
            transform: [{ translateX }, { scale }],
        };
    });

    return (
        <View style={[styles.container, style]}>
            {isTransitioning && prevChild ? (
                <Animated.View style={animatedStyle}>
                    {prevChild}
                </Animated.View>
            ) : (
                <Animated.View style={animatedStyle}>
                    {currentChild}
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
    },
});
