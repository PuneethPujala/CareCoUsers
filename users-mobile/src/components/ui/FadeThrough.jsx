import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
import { reanimatedMotion } from '../../theme/reanimatedMotion';

export default function FadeThrough({ children, duration = reanimatedMotion.durations.normal, style }) {
    const [currentChild, setCurrentChild] = useState(children);
    const [prevChild, setPrevChild] = useState(null);
    const [isTransitioning, setIsTransitioning] = useState(false);

    const opacity = useSharedValue(1);
    const scale = useSharedValue(1);

    const prevChildRef = useRef(children);

    useEffect(() => {
        if (children !== prevChildRef.current) {
            setPrevChild(prevChildRef.current);
            setIsTransitioning(true);
            prevChildRef.current = children;

            // Step 1: Fade out the current/previous child
            opacity.value = withTiming(0, { duration: duration / 2 }, () => {
                runOnJS(() => {
                    // Step 2: Swap the content once faded out
                    setCurrentChild(children);
                    setPrevChild(null);

                    // Step 3: Fade in the new content
                    scale.value = 0.98;
                    opacity.value = withTiming(1, { duration: duration / 2 }, () => {
                        runOnJS(setIsTransitioning)(false);
                    });
                    scale.value = withTiming(1, { duration: duration / 2 });
                })();
            });
        }
    }, [children, duration, opacity, scale]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: opacity.value,
            transform: [{ scale: scale.value }],
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
