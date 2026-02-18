/**
 * Animation hooks — static pass-through (Animated API removed for RN new architecture compatibility)
 * 
 * The React Native Animated API's _tracking mechanism is incompatible with
 * Fabric's frozen objects. These hooks now return static styles so components
 * render instantly without animation, avoiding the "_tracking" crash.
 */

/**
 * Fade-in entrance — returns opacity: 1 immediately
 */
export function useFadeIn(delay = 0, duration = 450) {
    return {
        opacity: 1,
        style: { opacity: 1 },
    };
}

/**
 * Scale-press — returns identity transform (no-op)
 */
export function useScalePress(toValue = 0.97) {
    return {
        scaleValue: 1,
        onPressIn: () => { },
        onPressOut: () => { },
        animatedStyle: {},
    };
}

/**
 * Shimmer — returns static opacity for skeleton loaders
 */
export function useShimmer() {
    return { opacity: 0.5 };
}

/**
 * Staggered entrance — returns array of 1s (fully visible)
 */
export function useStaggerEntrance(count, stagger = 80) {
    return Array.from({ length: count }, () => 1);
}
