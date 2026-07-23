import { apiService } from '../lib/api';

/**
 * VitalsRepository — Decoupled data fetcher & transformer for physiological vitals.
 */
export const VitalsRepository = {
    /**
     * Fetch daily vitals summary & wearable sync state
     */
    async getDailyVitalsSummary() {
        const res = await apiService.vitals.getSummary();
        return res.data || res;
    },

    /**
     * Fetch vitals historical logs for trend charts
     */
    async getVitalsHistory(days = 7) {
        const res = await apiService.vitals.getHistory({ days });
        return res.data || res;
    },
};
