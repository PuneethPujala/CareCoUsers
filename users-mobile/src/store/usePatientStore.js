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
            const optRef = { ...state._optimisticMeds };
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

            const markedMeds = todayRes.data.log?.medicines || [];
            const profileMeds = freshPatient?.medications || [];
            const optRef = { ...get()._optimisticMeds };

            // Merge: Unroll profile medications by their 'times' array
            const mergedMeds = [];
            profileMeds.forEach((pm) => {
                let timeTypes = pm.times?.length > 0 ? [...pm.times] : [];
                if (timeTypes.length === 0 && pm.scheduledTimes?.length > 0) {
                    pm.scheduledTimes.forEach((st) => {
                        const hr = parseInt(st.split(':')[0], 10);
                        if (hr < 12 && !timeTypes.includes('morning')) timeTypes.push('morning');
                        else if (hr >= 12 && hr < 17 && !timeTypes.includes('afternoon')) timeTypes.push('afternoon');
                        else if (hr >= 17 && !timeTypes.includes('night')) timeTypes.push('night');
                    });
                }
                timeTypes.forEach((type) => {
                    const id = `${pm.name}_${type}`;
                    const optTs = optRef[id];
                    let isTaken = false;

                    const marked = markedMeds.find(
                        (mm) => mm.medicine_name === pm.name && mm.scheduled_time === type
                    );
                    if (marked) isTaken = marked.taken;

                    if (optTs) {
                        if (isTaken) delete optRef[id];
                        else if (Date.now() - optTs < 60000) isTaken = true;
                        else delete optRef[id];
                    }

                    mergedMeds.push({
                        id,
                        name: pm.name,
                        dosage: pm.dosage || (type === 'morning' ? '500mg' : type === 'afternoon' ? '5mg' : '10mg'),
                        instructions: pm.instructions || (type === 'morning' ? 'Take with food' : type === 'afternoon' ? 'Take after lunch' : 'Take before sleep'),
                        type,
                        taken: isTaken,
                        marked_by: marked ? marked.marked_by : null,
                        accent: ACCENT_MAP[type] || '#6366F1',
                        scheduled_times: pm.scheduledTimes || [],
                    });
                });
            });

            // Fallback for log-only meds
            markedMeds.forEach((mm) => {
                if (!mergedMeds.some((m) => m.name === mm.medicine_name && m.type === mm.scheduled_time)) {
                    mergedMeds.push({
                        id: `${mm.medicine_name}_${mm.scheduled_time}_log`,
                        name: mm.medicine_name,
                        dosage: mm.dosage,
                        instructions: mm.instructions,
                        type: mm.scheduled_time,
                        taken: mm.taken,
                        marked_by: mm.marked_by,
                        accent: ACCENT_MAP[mm.scheduled_time],
                        scheduled_times: mm.scheduled_times || [],
                    });
                }
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
    optimisticToggleMed: async (med) => {
        const state = get();
        const newOpt = { ...state._optimisticMeds, [med.id]: Date.now() };
        set({ _optimisticMeds: newOpt });

        // Update dashboardMeds
        set((s) => ({
            dashboardMeds: s.dashboardMeds.map((m) =>
                m.id === med.id ? { ...m, taken: true } : m
            ),
        }));

        // Update medicationSchedule
        set((s) => {
            const schedule = { ...s.medicationSchedule };
            Object.keys(schedule).forEach((slot) => {
                schedule[slot] = schedule[slot].map((m) =>
                    m.id === med.id ? { ...m, taken: true } : m
                );
            });
            return { medicationSchedule: schedule };
        });

        try {
            await apiService.medicines.markMedicine({
                medicine_name: med.name,
                scheduled_time: med.type,
                taken: true,
            });
        } catch (err) {
            console.warn('[Store] optimisticToggleMed failed, reverting:', err.message);
            // Revert
            const revOpt = { ...get()._optimisticMeds };
            delete revOpt[med.id];
            set({
                _optimisticMeds: revOpt,
                dashboardMeds: get().dashboardMeds.map((m) =>
                    m.id === med.id ? { ...m, taken: false } : m
                ),
            });
            set((s) => {
                const schedule = { ...s.medicationSchedule };
                Object.keys(schedule).forEach((slot) => {
                    schedule[slot] = schedule[slot].map((m) =>
                        m.id === med.id ? { ...m, taken: false } : m
                    );
                });
                return { medicationSchedule: schedule };
            });
            throw err; // Let the caller handle UI feedback
        }
    },

    /**
     * saveCallPreferences — Updates call preferences on the server,
     * then refreshes the store with the response.
     */
    saveCallPreferences: async (prefs) => {
        const res = await apiService.patients.updateCallPreferences(prefs);
        set({ callPreferences: res.data.preferences });
        // Refresh medications to pick up any scheduledTimes changes
        get().fetchMedications();
        return res.data;
    },
}));

export default usePatientStore;
