/**
 * CareMyMed — MotionProvider
 *
 * Global context that controls the motion system for the entire app.
 * Wraps the app root so every component can access:
 *   - reduceMotion: whether the OS accessibility setting is on
 *   - animationSpeed: multiplier for animation durations (future use)
 *   - springs: pre-resolved spring configs that auto-degrade
 *
 * Usage:
 *   // In App.js root:
 *   <MotionProvider>
 *     <AppNavigator />
 *   </MotionProvider>
 *
 *   // In any component:
 *   const { reduceMotion, getSpring } = useMotion();
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { reanimatedMotion } from './reanimatedMotion';

const DEFAULT_CONFIG = {
    animationSpeed: 1.0,
    speed: 6.5,
    bounce: 6.0,
    smoothness: 5.0,
};

const MotionContext = createContext({
    reduceMotion: false,
    animationSpeed: 1.0,
    motionOverrides: DEFAULT_CONFIG,
    candidateOverrides: DEFAULT_CONFIG,
    isPreviewing: false,
    updateCandidateOverrides: () => {},
    applyCandidateOverrides: () => {},
    saveOverrides: () => {},
    resetOverrides: () => {},
    getSpring: () => {},
    getDuration: () => {},
    getSpringForConfig: () => {},
    getDurationForConfig: () => {},
    getScale: (name) => reanimatedMotion.scales[name] || 1,
    getFadeUp: (name) => reanimatedMotion.fadeUp[name] || reanimatedMotion.fadeUp.default,
    getStagger: (name) => reanimatedMotion.stagger[name] || reanimatedMotion.stagger.default,
});

export function MotionProvider({ children }) {
    const [reduceMotion, setReduceMotion] = useState(false);
    const [motionOverrides, setMotionOverrides] = useState(DEFAULT_CONFIG);
    const [candidateOverrides, setCandidateOverrides] = useState(DEFAULT_CONFIG);
    const [isPreviewing, setIsPreviewing] = useState(false);

    // Track OS-level Reduce Motion setting
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
            }
        };
    }, []);

    // Load overrides from AsyncStorage on mount
    useEffect(() => {
        const loadOverrides = async () => {
            try {
                const stored = await AsyncStorage.getItem('@caremymed_motion_overrides');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    const merged = { ...DEFAULT_CONFIG, ...parsed };
                    setMotionOverrides(merged);
                    setCandidateOverrides(merged);
                }
            } catch (e) {
                console.warn('[MotionProvider] Failed to load overrides:', e);
            }
        };
        loadOverrides();
    }, []);

    const updateCandidateOverrides = useCallback((updates) => {
        setCandidateOverrides(prev => ({ ...prev, ...updates }));
    }, []);

    const applyCandidateOverrides = useCallback(() => {
        setIsPreviewing(true);
    }, []);

    const saveOverrides = useCallback(async () => {
        try {
            setMotionOverrides(candidateOverrides);
            setIsPreviewing(false);
            await AsyncStorage.setItem('@caremymed_motion_overrides', JSON.stringify(candidateOverrides));
        } catch (e) {
            console.warn('[MotionProvider] Failed to save overrides:', e);
        }
    }, [candidateOverrides]);

    const resetOverrides = useCallback(async (category) => {
        try {
            if (category === 'speed') {
                const updated = { ...candidateOverrides, animationSpeed: 1.0 };
                setCandidateOverrides(updated);
                if (!isPreviewing) {
                    setMotionOverrides(prev => ({ ...prev, animationSpeed: 1.0 }));
                    const stored = await AsyncStorage.getItem('@caremymed_motion_overrides');
                    const parsed = stored ? JSON.parse(stored) : {};
                    await AsyncStorage.setItem('@caremymed_motion_overrides', JSON.stringify({ ...parsed, animationSpeed: 1.0 }));
                }
            } else if (category === 'spring') {
                const updated = {
                    ...candidateOverrides,
                    speed: DEFAULT_CONFIG.speed,
                    bounce: DEFAULT_CONFIG.bounce,
                    smoothness: DEFAULT_CONFIG.smoothness,
                };
                setCandidateOverrides(updated);
                if (!isPreviewing) {
                    setMotionOverrides(prev => ({
                        ...prev,
                        speed: DEFAULT_CONFIG.speed,
                        bounce: DEFAULT_CONFIG.bounce,
                        smoothness: DEFAULT_CONFIG.smoothness,
                    }));
                    const stored = await AsyncStorage.getItem('@caremymed_motion_overrides');
                    const parsed = stored ? JSON.parse(stored) : {};
                    await AsyncStorage.setItem('@caremymed_motion_overrides', JSON.stringify({
                        ...parsed,
                        speed: DEFAULT_CONFIG.speed,
                        bounce: DEFAULT_CONFIG.bounce,
                        smoothness: DEFAULT_CONFIG.smoothness,
                    }));
                }
            } else {
                setCandidateOverrides(DEFAULT_CONFIG);
                setMotionOverrides(DEFAULT_CONFIG);
                setIsPreviewing(false);
                await AsyncStorage.removeItem('@caremymed_motion_overrides');
            }
        } catch (e) {
            console.warn('[MotionProvider] Failed to reset overrides:', e);
        }
    }, [candidateOverrides, isPreviewing]);

    const getSpringForConfig = useCallback((name = 'default', config) => {
        if (reduceMotion) return reanimatedMotion.springs.instant;
        if (name === 'default' && config) {
            const stiffness = config.speed * 25 + 10;
            const damping = 32 - config.bounce * 2.2;
            const mass = 0.5 + config.smoothness * 0.1;
            return { damping, stiffness, mass };
        }
        return reanimatedMotion.springs[name] || reanimatedMotion.springs.default;
    }, [reduceMotion]);

    const getDurationForConfig = useCallback((name = 'normal', config) => {
        if (reduceMotion) return reanimatedMotion.durations.instant;
        const base = reanimatedMotion.durations[name] || reanimatedMotion.durations.normal;
        const speedMultiplier = config ? config.animationSpeed : 1.0;
        return Math.round(base / speedMultiplier);
    }, [reduceMotion]);

    const value = useMemo(() => ({
        reduceMotion,
        animationSpeed: isPreviewing ? candidateOverrides.animationSpeed : motionOverrides.animationSpeed,
        motionOverrides,
        candidateOverrides,
        isPreviewing,
        updateCandidateOverrides,
        applyCandidateOverrides,
        saveOverrides,
        resetOverrides,
        getSpringForConfig,
        getDurationForConfig,

        getSpring: (name = 'default') => {
            if (reduceMotion) return reanimatedMotion.springs.instant;
            if (name === 'default') {
                const active = isPreviewing ? candidateOverrides : motionOverrides;
                const stiffness = active.speed * 25 + 10;
                const damping = 32 - active.bounce * 2.2;
                const mass = 0.5 + active.smoothness * 0.1;
                return { damping, stiffness, mass };
            }
            return reanimatedMotion.springs[name] || reanimatedMotion.springs.default;
        },

        getDuration: (name = 'normal') => {
            if (reduceMotion) return reanimatedMotion.durations.instant;
            const active = isPreviewing ? candidateOverrides : motionOverrides;
            const base = reanimatedMotion.durations[name] || reanimatedMotion.durations.normal;
            return Math.round(base / active.animationSpeed);
        },

        getScale: (name = 'pressed') => {
            if (reduceMotion) return 1.0;
            return reanimatedMotion.scales[name] || 1.0;
        },

        getFadeUp: (name = 'default') => {
            if (reduceMotion) return 0;
            return reanimatedMotion.fadeUp[name] || reanimatedMotion.fadeUp.default;
        },

        getStagger: (name = 'default') => {
            if (reduceMotion) return 0;
            return reanimatedMotion.stagger[name] || reanimatedMotion.stagger.default;
        },

        tokens: reanimatedMotion,
    }), [
        reduceMotion,
        motionOverrides,
        candidateOverrides,
        isPreviewing,
        updateCandidateOverrides,
        applyCandidateOverrides,
        saveOverrides,
        resetOverrides,
        getSpringForConfig,
        getDurationForConfig
    ]);

    return (
        <MotionContext.Provider value={value}>
            {children}
        </MotionContext.Provider>
    );
}

export function useMotion() {
    return useContext(MotionContext);
}

export default MotionProvider;
