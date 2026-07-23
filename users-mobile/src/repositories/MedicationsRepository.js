import { apiService } from '../lib/api';

/**
 * MedicationsRepository — Decoupled data fetcher for patient medication schedules.
 */
export const MedicationsRepository = {
    /**
     * Fetch today's medication plan & adherence slots
     */
    async getTodayPlan() {
        const res = await apiService.patient.getTodayMeds();
        return res.data || res;
    },

    /**
     * Log a medication dose slot as taken or untaken
     */
    async toggleDoseSlot(medicationId, slotTime, taken) {
        const res = await apiService.patient.logDose({
            medication_id: medicationId,
            time_slot: slotTime,
            taken,
        });
        return res.data || res;
    },
};
