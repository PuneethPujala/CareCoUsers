import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withSpring,
} from 'react-native-reanimated';
import { reanimatedMotion } from '../../theme/reanimatedMotion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function AnimatedProgressRing({
    progress = 0,
    size = 88,
    strokeWidth = 8,
    colors = ['#A78BFA', '#7C3AED'], // gradient array
    trackColor = '#F3E8FF',
    children,
}) {
    const animatedProgress = useSharedValue(progress);

    useEffect(() => {
        animatedProgress.value = withSpring(
            progress,
            reanimatedMotion.springs.default
        );
    }, [progress, animatedProgress]);

    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    const animatedProps = useAnimatedProps(() => {
        const cappedProgress = Math.max(0, Math.min(100, animatedProgress.value));
        const strokeDashoffset = circumference * (1 - cappedProgress / 100);
        return {
            strokeDashoffset,
        };
    });

    const isGradient = Array.isArray(colors) && colors.length > 1;

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Defs>
                    {isGradient && (
                        <LinearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <Stop offset="0%" stopColor={colors[0]} />
                            <Stop offset="100%" stopColor={colors[colors.length - 1]} />
                        </LinearGradient>
                    )}
                </Defs>
                
                {/* Background Ring */}
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={trackColor}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                />

                {/* Animated Progress Ring */}
                <AnimatedCircle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={isGradient ? 'url(#progressGrad)' : colors[0] || '#7C3AED'}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={`${circumference}`}
                    animatedProps={animatedProps}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </Svg>

            {/* Custom centered children inside the ring */}
            {children && <View style={styles.childContainer}>{children}</View>}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    childContainer: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
