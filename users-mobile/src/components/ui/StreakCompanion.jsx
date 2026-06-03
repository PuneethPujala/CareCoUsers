import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, StyleSheet, Easing } from 'react-native';
import { getStreakState } from '../../utils/streakHelper';

/**
 * StreakCompanion Component
 * Renders the state-aware plant companion mascot with premium visual effects, centering, and animations.
 *
 * @param {object} props
 * @param {number} props.streak - Adherence streak count
 * @param {Array} [props.dailyLog=[]] - Daily history log for calculating missed days
 * @param {number} [props.size=48] - Size of the companion image
 * @param {boolean} [props.animate=true] - Whether to apply idle breathing and swaying animations
 * @param {boolean} [props.showEffects=true] - Whether to show state-specific particle effects (e.g. sparkles, hearts, rain)
 * @param {object} [props.style] - Style override for the wrapper container
 * @param {object} [props.imageStyle] - Style override for the Image
 */
export default function StreakCompanion({
    streak,
    dailyLog = [],
    size = 48,
    animate = true,
    showEffects = true,
    style,
    imageStyle,
}) {
    const companion = getStreakState(streak, dailyLog);

    // 1. Breathing Animation (Scale)
    const breatheAnim = useRef(new Animated.Value(0)).current;
    // 2. Swaying Animation (Rotation)
    const swayAnim = useRef(new Animated.Value(0)).current;

    // Sparkle / Particle animations
    const particle1 = useRef(new Animated.Value(0)).current;
    const particle2 = useRef(new Animated.Value(0)).current;
    const particle3 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!animate) return;

        // Breathing loop
        const breatheLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(breatheAnim, {
                    toValue: 1,
                    duration: 2200,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(breatheAnim, {
                    toValue: 0,
                    duration: 2200,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        );

        // Swaying loop
        const swayLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(swayAnim, {
                    toValue: 1,
                    duration: 2800,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(swayAnim, {
                    toValue: -1,
                    duration: 2800,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        );

        breatheLoop.start();
        swayLoop.start();

        return () => {
            breatheLoop.stop();
            swayLoop.stop();
        };
    }, [animate]);

    // Particle effect loops
    useEffect(() => {
        if (!showEffects) return;

        // Helper to animate a single particle loop with randomized timing/delay
        const animateParticle = (anim, delay) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(anim, {
                        toValue: 1,
                        duration: 1800,
                        easing: Easing.out(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(anim, {
                        toValue: 0,
                        duration: 0,
                        useNativeDriver: true,
                    }),
                ])
            );
        };

        const activeParticles = [
            animateParticle(particle1, 0),
            animateParticle(particle2, 600),
            animateParticle(particle3, 1200),
        ];

        activeParticles.forEach(p => p.start());

        return () => {
            activeParticles.forEach(p => p.stop());
        };
    }, [showEffects, companion.key]);

    // Interpolations for breathing and swaying
    const scale = breatheAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.97, 1.04],
    });

    const rotate = swayAnim.interpolate({
        inputRange: [-1, 1],
        outputRange: ['-3deg', '3deg'],
    });

    // Particle rendering helper
    const renderParticles = () => {
        if (!showEffects) return null;

        let emoji = '';
        if (companion.key === 'blooming_health') {
            emoji = '✨';
        } else if (companion.key === 'revive_window') {
            emoji = '❤️';
        } else if (companion.key === 'miss_2_days') {
            emoji = '💧';
        } else {
            return null; // No particles for other states
        }

        // Interpolations for each particle (different trajectories)
        const getParticleStyle = (anim, dx, delayY) => {
            const translateY = anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -32],
            });
            const translateX = anim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, dx, dx * 0.5],
            });
            const opacity = anim.interpolate({
                inputRange: [0, 0.2, 0.8, 1],
                outputRange: [0, 1, 0.8, 0],
            });
            const pScale = anim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.4, 1, 0.6],
            });

            return {
                position: 'absolute',
                fontSize: size * 0.25,
                transform: [{ translateX }, { translateY }, { scale: pScale }],
                opacity,
            };
        };

        return (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <Animated.Text style={[getParticleStyle(particle1, -12, 0), { left: '20%', top: '30%' }]}>
                    {emoji}
                </Animated.Text>
                <Animated.Text style={[getParticleStyle(particle2, 12, 600), { right: '20%', top: '25%' }]}>
                    {emoji}
                </Animated.Text>
                <Animated.Text style={[getParticleStyle(particle3, -4, 1200), { left: '45%', top: '15%' }]}>
                    {emoji}
                </Animated.Text>
            </View>
        );
    };

    return (
        <View style={[styles.container, style]}>
            {renderParticles()}
            <Animated.View
                style={[
                    styles.imageContainer,
                    {
                        width: size,
                        height: size,
                        transform: animate ? [{ scale }, { rotate }] : [],
                    },
                ]}
            >
                <Image
                    source={companion.image}
                    style={[styles.image, { width: size, height: size, borderRadius: size * 0.2 }, imageStyle]}
                    resizeMode="contain"
                />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    imageContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    image: {
        // Keep the image centered within the outer container
    },
});
