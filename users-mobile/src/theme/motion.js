/**
 * CareMyMed — Motion System Design Tokens & Animators
 * Unified physics, easing, and timing system.
 */

import { useState, useEffect } from 'react';
import { Animated, AccessibilityInfo } from 'react-native';

export const motion = {
    // ── Timings (ms) ──
    instant: 80,
    fast: 120,
    normal: 220,
    slow: 350,
    deliberate: 500,

    // ── Spring Physics (Damping / Stiffness) ──
    springSoft: {
        damping: 18,
        stiffness: 180,
    },
    springHero: {
        damping: 12,
        stiffness: 120,
    },
    springCelebration: {
        damping: 8,
        stiffness: 100,
    },
};

/**
 * Hook to dynamically track reduced motion accessibility preference.
 */
export function useReduceMotion() {
    const [reduceMotion, setReduceMotion] = useState(false);

    useEffect(() => {
        let mounted = true;

        AccessibilityInfo.isReduceMotionEnabled()
            .then((enabled) => {
                if (mounted) setReduceMotion(enabled);
            })
            .catch(() => {
                if (mounted) setReduceMotion(false);
            });

        const subscription = AccessibilityInfo.addEventListener(
            'reduceMotionChanged',
            (enabled) => {
                if (mounted) setReduceMotion(enabled);
            }
        );

        return () => {
            mounted = false;
            if (subscription && typeof subscription.remove === 'function') {
                subscription.remove();
            } else if (typeof AccessibilityInfo.removeEventListener === 'function') {
                AccessibilityInfo.removeEventListener('reduceMotionChanged', () => {});
            }
        };
    }, []);

    return reduceMotion;
}

export const anim = {
    /**
     * Standard fade-in timing animation
     */
    fadeIn: (animatedValue, toValue = 1, duration = motion.normal, isReduced = false) => {
        return Animated.timing(animatedValue, {
            toValue,
            duration: isReduced ? motion.instant : duration,
            useNativeDriver: true,
        });
    },

    /**
     * Springy slide-up translation helper (Fades & stays in place when reduced motion is on)
     */
    slideUp: (animatedValue, toValue = 0, isReduced = false) => {
        if (isReduced) {
            return Animated.timing(animatedValue, {
                toValue,
                duration: motion.instant,
                useNativeDriver: true,
            });
        }
        return Animated.spring(animatedValue, {
            toValue,
            ...motion.springSoft,
            useNativeDriver: true,
        });
    },

    /**
     * Standard springy card lift/scale feedback (Instant scale when reduced motion is on)
     */
    cardLift: (animatedValue, toValue = 1, isReduced = false) => {
        if (isReduced) {
            return Animated.timing(animatedValue, {
                toValue,
                duration: motion.instant,
                useNativeDriver: true,
            });
        }
        return Animated.spring(animatedValue, {
            toValue,
            ...motion.springHero,
            useNativeDriver: true,
        });
    },

    /**
     * Scale in transition (Instant scale when reduced motion is on)
     */
    scaleIn: (animatedValue, toValue = 1, isReduced = false) => {
        if (isReduced) {
            return Animated.timing(animatedValue, {
                toValue,
                duration: motion.instant,
                useNativeDriver: true,
            });
        }
        return Animated.spring(animatedValue, {
            toValue,
            ...motion.springHero,
            useNativeDriver: true,
        });
    },

    /**
     * Bouncing success checkmark pulse animation (Skipped/Simplified when reduced motion is on)
     */
    successPulse: (animatedValue, scale = 1.08, isReduced = false) => {
        if (isReduced) {
            return Animated.timing(animatedValue, {
                toValue: 1,
                duration: motion.instant,
                useNativeDriver: true,
            });
        }
        return Animated.sequence([
            Animated.spring(animatedValue, {
                toValue: scale,
                ...motion.springCelebration,
                useNativeDriver: true,
            }),
            Animated.spring(animatedValue, {
                toValue: 1,
                ...motion.springSoft,
                useNativeDriver: true,
            }),
        ]);
    },

    /**
     * Stagger animation coordinator
     */
    stagger: (delay, animations) => {
        return Animated.stagger(delay, animations);
    },
};

export default { motion, anim, useReduceMotion };
