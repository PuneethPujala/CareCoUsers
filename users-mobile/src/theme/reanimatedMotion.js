/**
 * CareMyMed — Reanimated Motion Design Tokens & Physics
 * Premium spring, duration, and scale definitions.
 */

export const reanimatedMotion = {
    // ── Durations (ms) ──
    durations: {
        instant: 80,
        fast: 150,
        normal: 250,
        slow: 400,
        expressive: 600,
    },

    // ── Reanimated Spring Configurations ──
    springs: {
        // Instant transitions
        instant: {
            damping: 1,
            stiffness: 1,
            mass: 0.1,
        },
        // Fast, snappy transitions (switches, buttons, active states)
        snappy: {
            damping: 15,
            stiffness: 200,
            mass: 0.8,
        },
        // Standard interactive curves (cards, checklist, list items)
        default: {
            damping: 18,
            stiffness: 150,
            mass: 0.9,
        },
        // Slow, elegant transitions (swipes, sliders)
        gentle: {
            damping: 24,
            stiffness: 80,
            mass: 1.0,
        },
        // Springy/bouncy curve with overshoot (badges, celebrations, success indicators)
        bouncy: {
            damping: 10,
            stiffness: 100,
            mass: 0.8,
        },
        // Expressive layout shift (modal entries, bottom sheets)
        expressive: {
            damping: 14,
            stiffness: 120,
            mass: 0.95,
        },
    },
};

export default reanimatedMotion;
