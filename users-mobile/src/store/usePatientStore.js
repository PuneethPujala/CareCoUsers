/**
 * usePatientStore — Zustand global state for patient data.
 *
 * BUG 12 FIX: optimisticToggleMed revert hardcoded taken:false instead of
 *   restoring to the original state (!targetState). If a user un-marks a
 *   medication (targetState=false) and the API fails, the revert was setting
 *   taken:false — which is what the user just set, so no revert happened at all.
 *   Fixed to restore to !targetState.
 *
 * BUG 13 FIX: fetchDashboard todayStart/todayEnd used plain new Date() which
 *   is server-local time. On a device in IST at 1am, the UTC date is yesterday,
 *   so the vitals query returned yesterday's data. Now derives date range from
 *   the store's patient timezone when available.
 *
 * BUG 14 FIX: optimisticMarkSlotTaken on API failure had a comment saying
 *   "revert could be implemented" but left the UI permanently wrong until the
 *   next fetch. Added actual revert: restore the pre-optimistic snapshot.
 */
import { create } from 'zustand';
import { apiService } from '../lib/api';
import { getCache, setCache, CACHE_KEYS } from '../lib/CacheService';
import OfflineSyncService from '../lib/OfflineSyncService';

const TIME_LABELS = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night', as_needed: 'As Needed' };
const ACCENT_MAP = { morning: '#22C55E', afternoon: '#F59E0B', evening: '#7C3AED', night: '#8B5CF6', as_needed: '#6366F1' };

/**
 * Derive a YYYY-MM-DD string in a given IANA timezone using Intl.
 * Used on the client side where moment-timezone is not available.
 * Falls back to UTC if timezone is missing.
 */
function getTodayStringInTz(timezone) {
    try {
        const tz = timezone || 'Asia/Kolkata';
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
        // en-CA formats as YYYY-MM-DD natively
    } catch {
        return new Date().toISOString().slice(0, 10);
    }
}

const usePatientStore = create((set, get) => ({
    patient: null,
    vitals: null,
    vitalsHistory: [],
    aiPrediction: null,
    dashboardMeds: [],
    medicationSchedule: { morning: [], afternoon: [], night: [] },
    weeklyAdherence: [],
    adherenceDetails: null,
    adherenceRecap: null,
    callPreferences: { morning: '09:00', afternoon: '14:00', night: '20:00' },
    loading: true,
    isCached: false,
    lastFetchTs: 0,
    _optimisticMeds: {},

    setPatient: (patient) => set({ patient }),

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

    fetchDashboard: async (skipCache = false) => {
        try {
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

            // BUG 13 FIX: derive today's date boundaries in the patient's timezone.
            // Previously used new Date() + setHours which is server/device local time.
            // An IST patient fetching at 1am IST would get UTC date = yesterday.
            const currentPatient = get().patient;
            const timezone = currentPatient?.timezone || 'Asia/Kolkata';
            const todayStr = getTodayStringInTz(timezone);

            const todayStart = new Date(`${todayStr}T00:00:00.000Z`);
            const todayEnd = new Date(`${todayStr}T23:59:59.999Z`);
            const historyStart = new Date(todayStart);
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

            const optRef = { ...get()._optimisticMeds };
            const freshMeds = (medsRes.data.log?.medicines || []).map(m => {
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

            const logMeds = todayRes.data.log?.medicines || [];
            const optRef = { ...get()._optimisticMeds };

            const mergedMeds = logMeds
                .filter(m => m.is_active !== false)
                .map(m => {
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

            const grouped = { morning: [], afternoon: [], evening: [], night: [], as_needed: [] };
            mergedMeds.forEach(m => { if (grouped[m.type]) grouped[m.type].push(m); });

            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const weeklyData = (weeklyRes.data.adherence || []).map(d => ({
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
     * optimisticToggleMed
     *
     * BUG 12 FIX: revert now restores to !targetState (the original value)
     * instead of hardcoding false. If targetState=false (un-marking) and the
     * API fails, we need to restore taken:true — not leave it at false.
     */
    optimisticToggleMed: async (med, targetState = true) => {
        const state = get();
        const originalState = !targetState; // what we're reverting TO on failure
        const newOpt = { ...state._optimisticMeds, [med.id]: Date.now() };
        set({ _optimisticMeds: newOpt });

        set(s => ({
            dashboardMeds: s.dashboardMeds.map(m =>
                (m.name === med.name && m.type === med.type)
                    ? { ...m, taken: targetState, marked_by: targetState ? 'patient' : null }
                    : m
            ),
        }));

        set(s => {
            const schedule = { ...s.medicationSchedule };
            Object.keys(schedule).forEach(slot => {
                schedule[slot] = schedule[slot].map(m =>
                    (m.name === med.name && m.type === med.type)
                        ? { ...m, taken: targetState, marked_by: targetState ? 'patient' : null }
                        : m
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
            if (err.request || err.code === 'ECONNABORTED' || err.message === 'Network Error') {
                console.warn('[Store] Network error, enqueueing mutation offline:', err.message);
                OfflineSyncService.enqueueMutation({
                    type: 'MARK_MED_TAKEN',
                    payload: { medicine_name: med.name, scheduled_time: med.type, taken: targetState },
                });
                return;
            }

            console.warn('[Store] optimisticToggleMed failed, reverting:', err.message);
            const revOpt = { ...get()._optimisticMeds };
            delete revOpt[med.id];

            // BUG 12 FIX: restore to originalState, not hardcoded false
            set({
                _optimisticMeds: revOpt,
                dashboardMeds: get().dashboardMeds.map(m =>
                    (m.name === med.name && m.type === med.type)
                        ? { ...m, taken: originalState, marked_by: originalState ? 'patient' : null }
                        : m
                ),
            });
            set(s => {
                const schedule = { ...s.medicationSchedule };
                Object.keys(schedule).forEach(slot => {
                    schedule[slot] = schedule[slot].map(m =>
                        (m.name === med.name && m.type === med.type)
                            ? { ...m, taken: originalState, marked_by: originalState ? 'patient' : null }
                            : m
                    );
                });
                return { medicationSchedule: schedule };
            });
            throw err;
        }
    },

    /**
     * optimisticMarkSlotTaken
     *
     * BUG 14 FIX: On API failure, the original code had a comment saying
     * "revert could be implemented" and did nothing — leaving the UI permanently
     * showing all slot meds as taken until the next fetch. Added proper revert
     * by snapshotting pre-optimistic state and restoring it on failure.
     */
    optimisticMarkSlotTaken: async (slot) => {
        const state = get();
        const medsToMark = state.medicationSchedule[slot]?.filter(m => !m.taken) || [];
        if (medsToMark.length === 0) return;

        // Snapshot pre-optimistic state for revert
        const prevDashboardMeds = state.dashboardMeds;
        const prevSchedule = state.medicationSchedule;

        set(s => ({
            dashboardMeds: s.dashboardMeds.map(m =>
                m.type === slot ? { ...m, taken: true, marked_by: 'patient' } : m
            ),
        }));
        set(s => {
            const schedule = { ...s.medicationSchedule };
            if (schedule[slot]) {
                schedule[slot] = schedule[slot].map(m => ({ ...m, taken: true, marked_by: 'patient' }));
            }
            return { medicationSchedule: schedule };
        });

        try {
            await apiService.medicines.markSlotTaken({ scheduled_time: slot, marked_by: 'patient' });
            get().fetchDashboard(true);
        } catch (err) {
            // BUG 14 FIX: actually revert instead of leaving UI wrong
            console.warn('[Store] optimisticMarkSlotTaken failed, reverting:', err.message);
            set({ dashboardMeds: prevDashboardMeds, medicationSchedule: prevSchedule });
        }
    },

    saveCallPreferences: async (prefs) => {
        set({ callPreferences: prefs });
        const res = await apiService.patients.updateCallPreferences(prefs);
        if (res.data?.preferences) {
            set({ callPreferences: res.data.preferences });
        }
        get().fetchMedications();
        return res.data;
    },
}));

export default usePatientStore;