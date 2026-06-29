import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const REGISTRY_KEY = '@user_guided_tours';

export const TourService = {
    /**
     * Retrieve the current logged-in user profile ID.
     */
    async getUserId() {
        try {
            const raw = await SecureStore.getItemAsync('CareMyMed_user_profile');
            if (raw) {
                const profile = JSON.parse(raw);
                return profile.id || profile._id || null;
            }
        } catch (e) {
            console.warn('[TourService] Failed to read user profile for prefixing:', e);
        }
        return null;
    },

    /**
     * Retrieve the centralized guided tour registry.
     */
    async getRegistry() {
        try {
            const userId = await this.getUserId();
            const key = userId ? `${REGISTRY_KEY}_${userId}` : REGISTRY_KEY;
            const data = await AsyncStorage.getItem(key);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.warn('[TourService] Failed to read tour registry:', e);
            return {};
        }
    },

    /**
     * Check if a specific tour has been seen by the user.
     */
    async isTourSeen(tourKey) {
        const registry = await this.getRegistry();
        return !!registry[tourKey];
    },

    /**
     * Mark a specific tour as seen.
     */
    async markTourSeen(tourKey) {
        try {
            const userId = await this.getUserId();
            const key = userId ? `${REGISTRY_KEY}_${userId}` : REGISTRY_KEY;
            const registry = await this.getRegistry();
            registry[tourKey] = true;
            await AsyncStorage.setItem(key, JSON.stringify(registry));
        } catch (e) {
            console.warn(`[TourService] Failed to mark tour seen for ${tourKey}:`, e);
        }
    },

    /**
     * Reset all tours to unseen (for setting/debugging replay).
     */
    async resetAllTours() {
        try {
            const userId = await this.getUserId();
            const key = userId ? `${REGISTRY_KEY}_${userId}` : REGISTRY_KEY;
            await AsyncStorage.removeItem(key);
        } catch (e) {
            console.warn('[TourService] Failed to reset tour registry:', e);
        }
    },

    /**
     * Generic migration/backfill evaluator. Runs the screen's domain-specific
     * heuristic checks once per tourKey. If the user is determined to be an existing
     * user, marks the tour as seen.
     *
     * In case of heuristic failure, it fail-safes by NOT marking the tour as migrated
     * (so it can be retried on next render) and defaults to showing the tour.
     */
    async evaluateMigration(tourKey, heuristicFn) {
        try {
            const userId = await this.getUserId();
            const key = userId ? `${REGISTRY_KEY}_${userId}` : REGISTRY_KEY;
            const registry = await this.getRegistry();
            // If already processed migration for this tour key, do nothing
            if (registry[`_migrated_${tourKey}`]) {
                return registry;
            }

            let isExisting = false;
            try {
                isExisting = await heuristicFn();
            } catch (err) {
                console.warn(`[TourService] Migration heuristic failed for ${tourKey}:`, err);
                // Fail-safe direction: do NOT mark as migrated, return current registry
                return registry;
            }

            if (isExisting) {
                registry[tourKey] = true;
            }
            registry[`_migrated_${tourKey}`] = true;
            await AsyncStorage.setItem(key, JSON.stringify(registry));
            return registry;
        } catch (e) {
            console.warn(`[TourService] Migration error for ${tourKey}:`, e);
            return {};
        }
    }
};
