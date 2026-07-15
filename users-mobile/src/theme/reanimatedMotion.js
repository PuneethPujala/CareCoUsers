/**
 * CareMyMed — Reanimated Motion Design Tokens & Physics
 * The single source of truth for ALL animation physics in the app.
 *
 * Every screen, component, and interaction must reference these tokens
 * rather than inventing inline spring configs. This ensures the entire
 * app feels like one coherent motion language.
 */

export const reanimatedMotion = {
    // ── Duration Targets (ms) ──
    // Not enforced by springs, but useful for withTiming fallbacks
    // and for communicating intent to other developers.
    durations: {
        instant: 80,       // Reduce-motion fallback
        tap: 150,           // Tap feedback (120-180ms range)
        fast: 200,          // Quick state changes
        card: 300,          // Card entrances (250-350ms range)
        normal: 350,        // Standard transitions
        page: 450,          // Page transitions (350-500ms range)
        slow: 600,          // Expressive / cinematic
        orchestration: 800, // Full morning entrance sequence
    },

    // ── Reanimated Spring Configurations ──
    springs: {
        // Instant — reduce-motion fallback, no physics
        instant: {
            damping: 100,
            stiffness: 1000,
            mass: 0.1,
        },

        // Snappy — tap feedback, toggles, button presses (120-180ms feel)
        snappy: {
            damping: 15,
            stiffness: 250,
            mass: 0.8,
        },

        // Default — card entrances, list items, general transitions
        default: {
            damping: 18,
            stiffness: 150,
            mass: 0.9,
        },

        // Gentle — page transitions, modal entries, bottom sheets
        gentle: {
            damping: 24,
            stiffness: 80,
            mass: 1.0,
        },

        // Bouncy — celebrations, success states, confetti
        bouncy: {
            damping: 10,
            stiffness: 100,
            mass: 0.8,
        },

        // Breathing — continuous AI orb loops, pulse animations
        breathing: {
            damping: 20,
            stiffness: 40,
            mass: 1.2,
        },

        // Expressive — modal entries, hero transitions
        expressive: {
            damping: 14,
            stiffness: 120,
            mass: 0.95,
        },
    },

    // ── Scale Tokens ──
    scales: {
        pressed: 0.96,          // Tap-down scale for interactive elements
        cardHover: 1.01,        // Slight lift on press (AnimatedCard existing behavior)
        entranceFrom: 0.97,     // Card entrance starting scale
        entranceTo: 1.0,        // Card entrance final scale
    },

    // ── FadeUp Tokens (translateY distances in px) ──
    fadeUp: {
        subtle: 8,              // Minimal shift (labels, badges)
        default: 15,            // Standard card/section entrance
        hero: 25,               // Page-level entrance (TabScreenTransition)
        page: 15,               // Refined page transition distance
    },

    // ── Stagger Delays (ms between each child) ──
    stagger: {
        tight: 40,              // Fast list items
        default: 60,            // Dashboard card stagger
        relaxed: 100,           // Onboarding steps, large cards
    },

    // ── Haptic Semantic Map ──
    // Maps interaction types to haptic pattern names (from utils/haptics.js)
    haptics: {
        tap: 'selection',
        medicationComplete: 'allDone',
        error: 'attention',
        sos: 'attention',
        aiBriefing: 'log',
        milestone: 'milestone',
        premium: 'premiumUnlocked',
        stepComplete: 'stepComplete',
    },

    // ── Navigation Transition Definitions ──
    // Not enforced here, but documents the intended motion per navigation type.
    // Implementations live in navigator config.
    navigation: {
        rootStack: 'fadeSlideUp',   // Root stack: fade + translateY
        bottomTabs: 'horizontal',    // Tab switches: horizontal slide
        modal: 'verticalSpring',     // Modal presentation: spring from bottom
        bottomSheet: 'spring',       // Bottom sheet: spring snap
    },
};

export default reanimatedMotion;
