/**
 * usePatientStore — Zustand global state for patient data.
 *
 * Replaces DeviceEventEmitter-based syncing between HomeScreen,
 * MedicationsScreen, and ProfileScreen.  Any screen that mutates
 * patient data calls a store action; every other screen automatically
 * re-renders with the fresh values.
 */
import { create } from 'zustand';
import { apiService } from '../lib/api';
import { getCache, setCache, CACHE_KEYS } from '../lib/CacheService';

const TIME_LABELS = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' };
const ACCENT_MAP = { morning: '#22C55E', afternoon: '#F59E0B', night: '#8B5CF6' };

const usePatientStore = create((set, get) => ({
    // ── Core data ───────────────────────────────────────────
    patient: null,
    vitals: null,
    vitalsHistory: [],
    aiPrediction: null,

    // Dashboard meds (flat list for HomeScreen)
    dashboardMeds: [],

    // Detailed schedule meds (grouped for MedicationsScreen)
    medicationSchedule: { morning: [], afternoon: [], night: [] },
    weeklyAdherence: [],
    adherenceDetails: null,
    adherenceRecap: null,
    callPreferences: { morning: '09:00', afternoon: '14:00', night: '20:00' },

    // State flags
    loading: true,
    isCached: false,
    lastFetchTs: 0,

    // Optimistic mutation tracking
    _optimisticMeds: {},

    // ── Actions ─────────────────────────────────────────────

    /**
     * setPatient — manually update the patient object (e.g. after
     * a profile save) without doing a full refetch.
     */
    setPatient: (patient) => set({ patient }),

    /**
     * fetchAdherenceDetails — Full fetch for AdherenceScreen.
     * Populates score, level, momentum, daily_log, achievements.
     */
    fetchAdherenceDetails: async () => {
        try {
            const { data } = await apiService.medicines.getAdherenceDetails();
            set({ adherenceDetails: data });
            return data;
        } catch (err) {
            console.warn('[Store] fetchAdherenceDetails error:', err.message);
            return null;
        }
    },

    /**
     * fetchAdherenceRecap — Fetch period-based recap (weekly/monthly/yearly).
     */
    fetchAdherenceRecap: async (period = 'weekly') => {
        try {
            const { data } = await apiService.medicines.getAdherenceRecap(period);
            set({ adherenceRecap: data });
            return data;
        } catch (err) {
            console.warn('[Store] fetchAdherenceRecap error:', err.message);
            return null;
        }
    },

    /**
     * fetchProfile — Lightweight fetch of just /me.
     * Useful after settings or profile edits.
     */
    fetchProfile: async () => {
        try {
            const { data } = await apiService.patients.getMe();
            const patient = data.patient;
            const prefs = patient?.medication_call_preferences || { morning: '09:00', afternoon: '14:00', night: '20:00' };
            set({ patient, callPreferences: prefs });
            return patient;
        } catch (err) {
            console.warn('[Store] fetchProfile error:', err.message);
            return null;
        }
    },

    /**
     * fetchDashboard — Full parallel fetch for dashboard data.
     * Populates patient, vitals, dashboardMeds, aiPrediction.
     */
    fetchDashboard: async (skipCache = false) => {
        const state = get();
        try {
            // Load from cache first for instant paint
            if (!skipCache) {
                const cached = await getCache(CACHE_KEYS.HOME_DASHBOARD);
                if (cached) {
                    set({
                        patient: cached.data.patient,
                        vitals: cached.data.vitals,
                        dashboardMeds: cached.data.meds,
                        isCached: true,
                        loading: false,
                    });
                }
            }

            // Network fetch
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            const historyStart = new Date();
            historyStart.setDate(historyStart.getDate() - 7);

            const [pRes, vRes, vHistRes, medsRes, aiRes] = await Promise.all([
                apiService.patients.getMe(),
                apiService.patients.getVitals({
                    start_date: todayStart.toISOString(),
                    end_date: todayEnd.toISOString(),
                }),
                apiService.patients.getVitals({ start_date: historyStart.toISOString() }),
                apiService.medicines.getToday(),
                apiService.patients.getAIPrediction().catch(() => ({ data: { prediction: null } })),
            ]);

            const freshPatient = pRes.data.patient;
            const todayVitals = vRes.data.vitals;
            const freshVitals = todayVitals?.length > 0 ? todayVitals[todayVitals.length - 1] : null;
            const prefs = freshPatient?.medication_call_preferences || { morning: '09:00', afternoon: '14:00', night: '20:00' };

            // Build dashboard meds using optimistic tracking
            const optRef = { ...get()._optimisticMeds };
            const freshMeds = (medsRes.data.log?.medicines || []).map((m) => {
                const id = `${m.medicine_name}_${m.scheduled_time}`;
                const optTs = optRef[id];
                let isTaken = m.taken;

                if (optTs) {
                    if (isTaken) {
                        delete optRef[id];
                    } else if (Date.now() - optTs < 60000) {
                        isTaken = true;
                    } else {
                        delete optRef[id];
                    }
                }

                return {
                    id,
                    name: m.medicine_name,
                    dosage: m.dosage || 'As prescribed',
                    instructions: m.instructions || '',
                    time: TIME_LABELS[m.scheduled_time] || m.scheduled_time,
                    type: m.scheduled_time,
                    taken: isTaken,
                    accent: ACCENT_MAP[m.scheduled_time] || '#6366F1',
                };
            });

            set({
                patient: freshPatient,
                vitals: freshVitals,
                vitalsHistory: vHistRes.data.vitals || [],
                aiPrediction: aiRes.data.prediction,
                dashboardMeds: freshMeds,
                callPreferences: prefs,
                isCached: false,
                loading: false,
                lastFetchTs: Date.now(),
                _optimisticMeds: optRef,
            });

            // Persist for offline
            await setCache(CACHE_KEYS.HOME_DASHBOARD, {
                patient: freshPatient,
                vitals: freshVitals,
                meds: freshMeds,
            }, 60);

            return { patient: freshPatient, vitals: freshVitals, meds: freshMeds };
        } catch (err) {
            console.warn('[Store] fetchDashboard error:', err.message);
            set({ loading: false });
            return null;
        }
    },

    /**
     * fetchMedications — Full fetch for MedicationsScreen.
     * Builds the grouped schedule and adherence chart.
     * 
     * ⚡ Architecture: Uses MedicineLog as the SINGLE source of truth.
     * The backend's /medicines/today endpoint returns a pre-calculated
     * daily checklist (MedicineLog document) that is already synchronized
     * with the master Medication collection. We do NOT loop through
     * patient.medications on the client side.
     */
    fetchMedications: async () => {
        try {
            const pRes = await apiService.patients.getMe();
            const freshPatient = pRes.data.patient;
            const prefs = freshPatient?.medication_call_preferences || { morning: '09:00', afternoon: '14:00', night: '20:00' };

            if (freshPatient?.subscription?.plan === 'free') {
                set({ patient: freshPatient, callPreferences: prefs, loading: false });
                return;
            }

            const [todayRes, weeklyRes] = await Promise.all([
                apiService.medicines.getToday(),
                apiService.medicines.getWeeklyAdherence(),
            ]);

            // MedicineLog is the single source of truth
            const logMeds = todayRes.data.log?.medicines || [];
            const optRef = { ...get()._optimisticMeds };

            const mergedMeds = logMeds
                .filter(m => m.is_active !== false)
                .map((m) => {
                    const id = `${m.medicine_name}_${m.scheduled_time}`;
                    const optTs = optRef[id];
                    let isTaken = m.taken;

                    if (optTs) {
                        if (isTaken) delete optRef[id];
                        else if (Date.now() - optTs < 60000) isTaken = true;
                        else delete optRef[id];
                    }

                    return {
                        id,
                        name: m.medicine_name,
                        dosage: m.dosage || 'As prescribed',
                        instructions: m.instructions || '',
                        type: m.scheduled_time,
                        taken: isTaken,
                        marked_by: m.marked_by || null,
                        verifiedByCaller: m.marked_by === 'caller',
                        accent: ACCENT_MAP[m.scheduled_time] || '#6366F1',
                        preferred_time: m.preferred_time || prefs[m.scheduled_time] || '',
                    };
                });

            const grouped = { morning: [], afternoon: [], night: [] };
            mergedMeds.forEach((m) => {
                if (grouped[m.type]) grouped[m.type].push(m);
            });

            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const weeklyData = (weeklyRes.data.adherence || []).map((d) => ({
                day: days[new Date(d.date).getDay()],
                p: d.rate,
                isToday: new Date(d.date).toDateString() === new Date().toDateString(),
            }));

            set({
                patient: freshPatient,
                callPreferences: prefs,
                medicationSchedule: grouped,
                weeklyAdherence: weeklyData,
                loading: false,
                lastFetchTs: Date.now(),
                _optimisticMeds: optRef,
            });
        } catch (err) {
            console.warn('[Store] fetchMedications error:', err.message);
            set({ loading: false });
        }
    },

    /**
     * optimisticToggleMed — marks a med as taken in the store immediately,
     * then fires the API call.  On failure, reverts.
     */
    optimisticToggleMed: async (med, targetState = true) => {
        const state = get();
        const newOpt = { ...state._optimisticMeds, [med.id]: Date.now() };
        set({ _optimisticMeds: newOpt });

        // Update dashboardMeds (safe matching by name and type to sync across screens perfectly)
        set((s) => ({
            dashboardMeds: s.dashboardMeds.map((m) =>
                (m.name === med.name && m.type === med.type) ? { ...m, taken: targetState, marked_by: targetState ? 'patient' : null } : m
            ),
        }));

        // Update medicationSchedule perfectly
        set((s) => {
            const schedule = { ...s.medicationSchedule };
            Object.keys(schedule).forEach((slot) => {
                schedule[slot] = schedule[slot].map((m) =>
                    (m.name === med.name && m.type === med.type) ? { ...m, taken: targetState, marked_by: targetState ? 'patient' : null } : m
                );
            });
            return { medicationSchedule: schedule };
        });

        try {
            await apiService.medicines.markMedicine({
                medicine_name: med.name,
                scheduled_time: med.type,
                taken: targetState,
            });
        } catch (err) {
            console.warn('[Store] optimisticToggleMed failed, reverting:', err.message);
            // Revert
            const revOpt = { ...get()._optimisticMeds };
            delete revOpt[med.id];
            set({
                _optimisticMeds: revOpt,
                dashboardMeds: get().dashboardMeds.map((m) =>
                    (m.name === med.name && m.type === med.type) ? { ...m, taken: false, marked_by: null } : m
                ),
            });
            set((s) => {
                const schedule = { ...s.medicationSchedule };
                Object.keys(schedule).forEach((slot) => {
                    schedule[slot] = schedule[slot].map((m) =>
                        (m.name === med.name && m.type === med.type) ? { ...m, taken: false, marked_by: null } : m
                    );
                });
                return { medicationSchedule: schedule };
            });
            throw err; // Let the caller handle UI feedback
        }
    },

    /**
     * optimisticMarkSlotTaken — bulk marks all meds in a time slot when "TAKEN" tapped from OS Notification Background.
     */
    optimisticMarkSlotTaken: async (slot) => {
        const state = get();
        const medsToMark = state.medicationSchedule[slot]?.filter(m => !m.taken) || [];
        if (medsToMark.length === 0) return;

        // Optimistically update
        set((s) => ({
            dashboardMeds: s.dashboardMeds.map((m) =>
                m.type === slot ? { ...m, taken: true, marked_by: 'patient' } : m
            ),
        }));
        set((s) => {
            const schedule = { ...s.medicationSchedule };
            if (schedule[slot]) {
                schedule[slot] = schedule[slot].map((m) => ({ ...m, taken: true, marked_by: 'patient' }));
            }
            return { medicationSchedule: schedule };
        });

        // Fire all API requests silently in the background
        Promise.all(medsToMark.map(med => 
            apiService.medicines.markMedicine({
                medicine_name: med.name,
                scheduled_time: med.type,
                taken: true,
            }).catch(() => console.warn('Failed to background mark:', med.name))
        ));
    },

    /**
     * saveCallPreferences — Updates call preferences on the server,
     * then refreshes the store with the response.
     */
    saveCallPreferences: async (prefs) => {
        // Optimistically apply preferences locally for instant UI update
        set({ callPreferences: prefs });
        const res = await apiService.patients.updateCallPreferences(prefs);
        if (res.data?.preferences) {
            set({ callPreferences: res.data.preferences });
        }
        // Background refresh to catch updated scheduled_times 
        get().fetchMedications();
        return res.data;
    },
}));

export default usePatientStore;
