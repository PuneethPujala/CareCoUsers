import React from 'react';
import { Image } from 'react-native';

// ── Streak companion plant assets ────────────────────────────────
const STREAK_IMAGES = {
    seed_of_hope: require('../../assets/companion/seed_of_hope.jpg'),
    growing_strength: require('../../assets/companion/growing_strength.jpg'),
    recovery_buddy: require('../../assets/companion/recovery_buddy.jpg'),
    blooming_health: require('../../assets/companion/blooming_health.jpg'),
    miss_1_day: require('../../assets/companion/miss_1_day.jpg'),
    miss_2_days: require('../../assets/companion/miss_2_days.jpg'),
    miss_3_days: require('../../assets/companion/miss_3_days.jpg'),
    revive_window: require('../../assets/companion/revive_window.jpg'),
};

/**
 * Resolves the streak companion state from the current streak value and daily history log.
 *
 * Healthy Path:
 *   Day 1         → Seed of Hope 🌱
 *   Day 2-3       → Growing Strength 🌿
 *   Day 4-6       → Recovery Buddy 🍀
 *   Day 7+        → Blooming Health 🌸
 *
 * Missed Path (streak === 0):
 *   Miss 1 Day    → Slight droop, concerned face
 *   Miss 2 Days   → More droop, little rain cloud
 *   Miss 3+ Days  → Wilted, greyish tone
 *   Revive Window → Hopeful smile, fresh green shoot emerging, heart particles
 *
 * @param {number} streak - Current consecutive-day streak
 * @param {Array} [dailyLog=[]] - Chronological array of daily adherence entries
 * @returns {{ key: string, image: any, label: string, subtitle: string }}
 */
export function getStreakState(streak, dailyLog = []) {
    if (streak > 0) {
        if (streak >= 7) {
            return {
                key: 'blooming_health',
                image: STREAK_IMAGES.blooming_health,
                label: 'Blooming Health',
                subtitle: "You're on fire! Keep it up 🔥",
            };
        }
        if (streak >= 4) {
            return {
                key: 'recovery_buddy',
                image: STREAK_IMAGES.recovery_buddy,
                label: 'Recovery Buddy',
                subtitle: 'Your companion is thriving! 🍀',
            };
        }
        if (streak >= 2) {
            return {
                key: 'growing_strength',
                image: STREAK_IMAGES.growing_strength,
                label: 'Growing Strength',
                subtitle: 'Building momentum! 🌿',
            };
        }
        return {
            key: 'seed_of_hope',
            image: STREAK_IMAGES.seed_of_hope,
            label: 'Seed of Hope',
            subtitle: 'Great start! Keep going 🌱',
        };
    }

    // Calculate missed days from dailyLog
    let missedDays = 0;
    if (Array.isArray(dailyLog) && dailyLog.length > 0) {
        // Iterate backwards from the end of the log
        for (let i = dailyLog.length - 1; i >= 0; i--) {
            const entry = dailyLog[i];
            // Only count entries that had scheduled medications
            if (entry.total > 0) {
                if (entry.taken === 0) {
                    missedDays++;
                } else {
                    break;
                }
            }
        }
    }

    if (missedDays >= 3) {
        return {
            key: 'miss_3_days',
            image: STREAK_IMAGES.miss_3_days,
            label: 'Wilted',
            subtitle: 'Your companion misses you 🥀',
        };
    }
    if (missedDays === 2) {
        return {
            key: 'miss_2_days',
            image: STREAK_IMAGES.miss_2_days,
            label: 'Feeling Low',
            subtitle: 'A little rain cloud appeared ☁️',
        };
    }
    if (missedDays === 1) {
        return {
            key: 'miss_1_day',
            image: STREAK_IMAGES.miss_1_day,
            label: 'Slight Droop',
            subtitle: 'Your companion is concerned 🥺',
        };
    }

    // missedDays === 0 and streak === 0 → revive window / fresh green shoot emerging
    return {
        key: 'revive_window',
        image: STREAK_IMAGES.revive_window,
        label: 'Revive Window',
        subtitle: 'Hopeful smile, fresh green shoot emerging! ❤️',
    };
}

export default STREAK_IMAGES;
