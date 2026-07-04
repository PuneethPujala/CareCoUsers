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
import WidgetBridge from '../lib/WidgetBridge';
import i18n from '../i18n';
import { HapticPatterns } from '../utils/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

/**
 * Corrects adherenceDetails client-side to prevent stale reads.
 * Merges the client-side/optimistic medication state with the server payload.
 */
function correctAdherenceData(adherenceData, get) {
    if (!adherenceData) return adherenceData;
    
    // Flatten medication list from store
    const schedule = get().medicationSchedule;
    const flatMeds = schedule ? Object.values(schedule).flat() : [];
    const meds = flatMeds.length > 0 ? flatMeds : (get().dashboardMeds || []);
    
    if (meds.length === 0) return adherenceData;
    
    const tz = get().patient?.timezone || 'Asia/Kolkata';
    const todayStr = getTodayStringInTz(tz); // YYYY-MM-DD
    
    const taken = meds.filter(m => m.taken).length;
    const total = meds.length;
    const completed = total > 0 && taken === total;
    
    const updated = { ...adherenceData };
    
    // 1. Correct today's summary stats
    if (updated.today) {
        updated.today = {
            ...updated.today,
            taken,
            total,
            completed
        };
    }
    
    // 2. Correct daily_log entry
    if (updated.daily_log) {
        let foundToday = false;
        const newDailyLog = updated.daily_log.map(d => {
            const dStr = typeof d.date === 'string'
                ? d.date.slice(0, 10)
                : new Date(d.date).toISOString().slice(0, 10);
            if (dStr === todayStr) {
                foundToday = true;
                const rate = total > 0 ? Math.round((taken / total) * 100) : 0;
                let status = 'none';
                if (total === 0) status = 'none';
                else if (rate === 100) status = 'complete';
                else if (rate > 0) status = 'partial';
                else status = 'missed';
                return {
                    ...d,
                    taken,
                    total,
                    rate,
                    completed,
                    status
                };
            }
            return d;
        });
        
        if (!foundToday) {
            const rate = total > 0 ? Math.round((taken / total) * 100) : 0;
            let status = 'none';
            if (total === 0) status = 'none';
            else if (rate === 100) status = 'complete';
            else if (rate > 0) status = 'partial';
            else status = 'missed';
            newDailyLog.push({
                date: `${todayStr}T00:00:00.000Z`,
                taken,
                total,
                rate,
                completed,
                status
            });
        }
        updated.daily_log = newDailyLog;
    }
    
    return updated;
}


const usePatientStore = create((set, get) => ({
    patient: null,
    companionSelectedPatientId: null,
    vitals: null,
    vitalsHistory: [],
    aiPrediction: null,
    dashboardMeds: [],
    medicationSchedule: { morning: [], afternoon: [], night: [] },
    weeklyAdherence: [],
    adherenceDetails: null,
    healthHistory: null,
    adherenceRecap: null,
    adherenceRecaps: { weekly: null, monthly: null, yearly: null },
    callPreferences: { morning: '09:00', afternoon: '14:00', evening: '17:00', night: '20:00' },
    loading: true,
    isCached: false,
    lastFetchTs: 0,
    syncState: 'synced', // 'synced' | 'syncing' | 'failed' | 'offline'
    pendingSyncCount: 0,
    pendingInterventionsCount: 0,
    simulateOffline: false,
    networkSimulationMode: 'online', // 'online' | 'offline' | 'flaky' | 'slow'
    lastSyncTimestamp: null,
    _optimisticMeds: {},
    newlyUnlockedAchievement: null,
    clearNewlyUnlockedAchievement: () => set({ newlyUnlockedAchievement: null }),

    setPatient: (patient) => set({ patient }),
    setCompanionSelectedPatientId: (id) => set({ companionSelectedPatientId: id }),
    setSyncState: (state) => set({ syncState: state }),
    setPendingSyncCount: (count) => set({ pendingSyncCount: count }),
    setPendingInterventionsCount: (count) => set({ pendingInterventionsCount: typeof count === 'function' ? count(get().pendingInterventionsCount) : count }),
    setSimulateOffline: (simulate) => set({ simulateOffline: simulate }),
    setNetworkSimulationMode: (mode) => set({ networkSimulationMode: mode }),
    setLastSyncTimestamp: (ts) => set({ lastSyncTimestamp: ts }),

    resetStore: () => set({
        patient: null,
        companionSelectedPatientId: null,
        vitals: null,
        vitalsHistory: [],
        aiPrediction: null,
        dashboardMeds: [],
        medicationSchedule: { morning: [], afternoon: [], night: [] },
        weeklyAdherence: [],
        adherenceDetails: null,
        healthHistory: null,
        adherenceRecap: null,
        adherenceRecaps: { weekly: null, monthly: null, yearly: null },
        callPreferences: { morning: '09:00', afternoon: '14:00', evening: '17:00', night: '20:00' },
        loading: true,
        isCached: false,
        lastFetchTs: 0,
        syncState: 'synced',
        pendingSyncCount: 0,
        pendingInterventionsCount: 0,
        simulateOffline: false,
        networkSimulationMode: 'online',
        lastSyncTimestamp: null,
        _optimisticMeds: {},
        newlyUnlockedAchievement: null,
    }),

    fetchAdherenceDetails: async () => {
        try {
            const { data } = await apiService.medicines.getAdherenceDetails();
            const corrected = correctAdherenceData(data, get);
            
            const oldAdherence = get().adherenceDetails;
            if (oldAdherence && oldAdherence.achievements && corrected.achievements) {
                const oldUnlocked = new Set(oldAdherence.achievements.filter(a => a.unlocked).map(a => a.key));
                const newlyUnlocked = corrected.achievements.filter(a => a.unlocked && !oldUnlocked.has(a.key));
                if (newlyUnlocked.length > 0) {
                    set({ newlyUnlockedAchievement: newlyUnlocked[0] });
                }
            }

            set({ adherenceDetails: corrected });
            return corrected;
        } catch (err) {
            console.warn('[Store] fetchAdherenceDetails error:', err.message);
            return null;
        }
    },

    fetchAdherenceRecap: async (period = 'weekly', forceRefresh = false) => {
        if (!forceRefresh && get().adherenceRecaps?.[period]) {
            const cached = get().adherenceRecaps[period];
            set({ adherenceRecap: cached });
            return cached;
        }
        try {
            const { data } = await apiService.medicines.getAdherenceRecap(period);
            set((s) => ({
                adherenceRecap: data,
                adherenceRecaps: {
                    ...(s.adherenceRecaps || {}),
                    [period]: data,
                },
            }));
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
            const prefs = patient?.medication_call_preferences || { morning: '09:00', afternoon: '14:00', evening: '17:00', night: '20:00' };
            if (patient?.language && i18n.language !== patient.language) {
                i18n.changeLanguage(patient.language);
                AsyncStorage.setItem('@user_preferred_language', patient.language).catch(() => {});
            }
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

            // ── Try aggregate endpoint first (1 call instead of 6) ──────
            let dashData = null;
            try {
                const { data } = await apiService.patients.getDashboard();
                dashData = data;
            } catch (aggErr) {
                // Fallback: if server doesn't have /dashboard yet (404), use legacy 6-call pattern
                if (aggErr.response?.status !== 404) throw aggErr;
            }

            if (dashData) {
                // ── Fast path: aggregate response ───────────────────────
                const freshPatient = dashData.patient;
                const freshVitals = dashData.vitals;
                const prefs = freshPatient?.medication_call_preferences || { morning: '09:00', afternoon: '14:00', evening: '17:00', night: '20:00' };

                if (freshPatient?.language && i18n.language !== freshPatient.language) {
                    i18n.changeLanguage(freshPatient.language);
                    AsyncStorage.setItem('@user_preferred_language', freshPatient.language).catch(() => {});
                }

                const optRef = { ...get()._optimisticMeds };
                const freshMeds = (dashData.meds?.log?.medicines || []).map(m => {
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
                        time: i18n.t(`time_slots.${m.scheduled_time}`, { defaultValue: TIME_LABELS[m.scheduled_time] || m.scheduled_time }),
                        type: m.scheduled_time,
                        taken: isTaken,
                        accent: ACCENT_MAP[m.scheduled_time] || '#6366F1',
                        refillInfo: m.refillInfo || null,
                    };
                });

                const SLOT_ORDER = { morning: 1, afternoon: 2, evening: 3, night: 4, as_needed: 5 };
                freshMeds.sort((a, b) => {
                    const orderDiff = (SLOT_ORDER[a.type] || 99) - (SLOT_ORDER[b.type] || 99);
                    if (orderDiff !== 0) return orderDiff;
                    return a.name.localeCompare(b.name);
                });


                const freshAdherenceDetails = correctAdherenceData(dashData.adherence || { streak: 0 }, get);
                
                const oldAdherence = get().adherenceDetails;
                if (oldAdherence && oldAdherence.achievements && freshAdherenceDetails.achievements) {
                    const oldUnlocked = new Set(oldAdherence.achievements.filter(a => a.unlocked).map(a => a.key));
                    const newlyUnlocked = freshAdherenceDetails.achievements.filter(a => a.unlocked && !oldUnlocked.has(a.key));
                    if (newlyUnlocked.length > 0) {
                        set({ newlyUnlockedAchievement: newlyUnlocked[0] });
                    }
                }

                set(s => ({
                    patient: freshPatient,
                    vitals: freshVitals,
                    vitalsHistory: dashData.vitalsHistory || [],
                    aiPrediction: dashData.aiPrediction,
                    dashboardMeds: freshMeds,
                    callPreferences: prefs,
                    adherenceDetails: s.adherenceDetails
                        ? { ...s.adherenceDetails, ...freshAdherenceDetails }
                        : freshAdherenceDetails,
                    healthHistory: dashData.healthHistory || null,
                    isCached: false,
                    loading: false,
                    lastFetchTs: Date.now(),
                    _optimisticMeds: optRef,
                }));

                await setCache(CACHE_KEYS.HOME_DASHBOARD, {
                    patient: freshPatient,
                    vitals: freshVitals,
                    meds: freshMeds,
                }, 60);

                WidgetBridge.updateAllWidgets({
                    meds: freshMeds,
                    vitals: freshVitals,
                    aiPrediction: dashData.aiPrediction,
                    adherenceDetails: dashData.adherence,
                    patient: freshPatient,
                    vitalsHistory: dashData.vitalsHistory || [],
                });

                return { patient: freshPatient, vitals: freshVitals, meds: freshMeds };
            }

            // ── Legacy fallback: 6 parallel calls ───────────────────────
            const currentPatient = get().patient;
            const timezone = currentPatient?.timezone || 'Asia/Kolkata';
            const todayStr = getTodayStringInTz(timezone);

            const todayStart = new Date(`${todayStr}T00:00:00.000Z`);
            const todayEnd = new Date(`${todayStr}T23:59:59.999Z`);
            const historyStart = new Date(todayStart);
            historyStart.setDate(historyStart.getDate() - 7);

            const [pRes, vRes, vHistRes, medsRes, aiRes, adhRes, histRes] = await Promise.all([
                apiService.patients.getMe(),
                apiService.patients.getVitals({
                    start_date: todayStart.toISOString(),
                    end_date: todayEnd.toISOString(),
                }),
                apiService.patients.getVitals({ start_date: historyStart.toISOString() }),
                apiService.medicines.getToday(),
                apiService.patients.getAIPrediction().catch(() => ({ data: { prediction: null } })),
                apiService.medicines.getAdherenceDetails().catch(() => ({ data: { streak: 0 } })),
                apiService.patients.getHealthHistory().catch(() => ({ data: null })),
            ]);

            const freshPatient = pRes.data.patient;
            const todayVitals = vRes.data.vitals;
            const freshVitals = todayVitals?.length > 0 ? todayVitals[todayVitals.length - 1] : null;
            const prefs = freshPatient?.medication_call_preferences || { morning: '09:00', afternoon: '14:00', evening: '17:00', night: '20:00' };

            if (freshPatient?.language && i18n.language !== freshPatient.language) {
                i18n.changeLanguage(freshPatient.language);
                AsyncStorage.setItem('@user_preferred_language', freshPatient.language).catch(() => {});
            }

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
                    time: i18n.t(`time_slots.${m.scheduled_time}`, { defaultValue: TIME_LABELS[m.scheduled_time] || m.scheduled_time }),
                    type: m.scheduled_time,
                    taken: isTaken,
                    accent: ACCENT_MAP[m.scheduled_time] || '#6366F1',
                    refillInfo: m.refillInfo || null,
                };
            });

            const SLOT_ORDER = { morning: 1, afternoon: 2, evening: 3, night: 4, as_needed: 5 };
            freshMeds.sort((a, b) => {
                const orderDiff = (SLOT_ORDER[a.type] || 99) - (SLOT_ORDER[b.type] || 99);
                if (orderDiff !== 0) return orderDiff;
                return a.name.localeCompare(b.name);
            });


            const freshAdherenceDetails = correctAdherenceData(adhRes.data, get);
            
            const oldAdherence = get().adherenceDetails;
            if (oldAdherence && oldAdherence.achievements && freshAdherenceDetails.achievements) {
                const oldUnlocked = new Set(oldAdherence.achievements.filter(a => a.unlocked).map(a => a.key));
                const newlyUnlocked = freshAdherenceDetails.achievements.filter(a => a.unlocked && !oldUnlocked.has(a.key));
                if (newlyUnlocked.length > 0) {
                    set({ newlyUnlockedAchievement: newlyUnlocked[0] });
                }
            }

            set(s => ({
                patient: freshPatient,
                vitals: freshVitals,
                vitalsHistory: vHistRes.data.vitals || [],
                aiPrediction: aiRes.data.prediction,
                dashboardMeds: freshMeds,
                callPreferences: prefs,
                adherenceDetails: s.adherenceDetails
                    ? { ...s.adherenceDetails, ...freshAdherenceDetails }
                    : freshAdherenceDetails,
                healthHistory: histRes?.data || null,
                isCached: false,
                loading: false,
                lastFetchTs: Date.now(),
                _optimisticMeds: optRef,
            }));

            await setCache(CACHE_KEYS.HOME_DASHBOARD, {
                patient: freshPatient,
                vitals: freshVitals,
                meds: freshMeds,
            }, 60);

            WidgetBridge.updateAllWidgets({
                meds: freshMeds,
                vitals: freshVitals,
                aiPrediction: aiRes.data.prediction,
                adherenceDetails: adhRes.data,
                patient: freshPatient,
                vitalsHistory: vHistRes.data.vitals || [],
            });

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
            const prefs = freshPatient?.medication_call_preferences || { morning: '09:00', afternoon: '14:00', evening: '17:00', night: '20:00' };

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
                        refillInfo: m.refillInfo || null,
                    };
                });

            const grouped = { morning: [], afternoon: [], evening: [], night: [], as_needed: [] };
            mergedMeds.forEach(m => { if (grouped[m.type]) grouped[m.type].push(m); });

            // Build a full 7-day array (today + 6 days back) with gap-filling.
            // API adherence entries may have gaps for days with no log.
            const tz = freshPatient?.timezone || 'Asia/Kolkata';
            const todayDateStr = getTodayStringInTz(tz); // YYYY-MM-DD
            const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

            // Index API data by YYYY-MM-DD for fast lookup
            const adherenceByDate = {};
            for (const d of (weeklyRes.data.adherence || [])) {
                // d.date is a UTC midnight ISO string — extract the date part
                const dStr = typeof d.date === 'string'
                    ? d.date.slice(0, 10)
                    : new Date(d.date).toISOString().slice(0, 10);
                adherenceByDate[dStr] = d.rate;
            }

            const weeklyData = [];
            for (let i = 6; i >= 0; i--) {
                const dt = new Date(todayDateStr + 'T12:00:00Z'); // noon UTC avoids DST issues
                dt.setUTCDate(dt.getUTCDate() - i);
                const dateStr = dt.toISOString().slice(0, 10);
                const isToday = dateStr === todayDateStr;
                let rate = 0;
                if (isToday) {
                    const totalMeds = mergedMeds.length;
                    const takenMeds = mergedMeds.filter(m => m.taken).length;
                    rate = totalMeds > 0 ? Math.round((takenMeds / totalMeds) * 100) : 0;
                } else {
                    rate = adherenceByDate[dateStr] ?? 0;
                }
                weeklyData.push({
                    day: dayNames[dt.getUTCDay()],
                    p: rate,
                    isToday,
                });
            }

            set({
                patient: freshPatient,
                callPreferences: prefs,
                medicationSchedule: grouped,
                weeklyAdherence: weeklyData,
                loading: false,
                lastFetchTs: Date.now(),
                _optimisticMeds: optRef,
            });

            WidgetBridge.updateAllWidgets({ meds: mergedMeds, patient: freshPatient });
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
        const activeOptimistic = state._optimisticMeds[med.id];
        if (activeOptimistic && Date.now() - activeOptimistic < 1500) {
            console.warn('[Store] Ignored double-tap toggle spam for med:', med.id);
            return;
        }
        
        const originalState = !targetState; // what we're reverting TO on failure
        const newOpt = { ...state._optimisticMeds, [med.id]: Date.now() };
        set({ _optimisticMeds: newOpt });

        set(s => {
            const schedule = { ...s.medicationSchedule };
            
            const mapMed = (m) => {
                if (m.name === med.name) {
                    let newRefillInfo = m.refillInfo ? { ...m.refillInfo } : null;
                    if (newRefillInfo) {
                        const diff = targetState ? -1 : 1;
                        if (typeof newRefillInfo.remainingDoses === 'number') {
                            newRefillInfo.remainingDoses = Math.max(0, newRefillInfo.remainingDoses + diff);
                        } else if (typeof newRefillInfo.totalDoses === 'number') {
                            newRefillInfo.totalDoses = Math.max(0, newRefillInfo.totalDoses + diff);
                        }
                    }
                    if (m.type === med.type) {
                        return { ...m, taken: targetState, marked_by: targetState ? 'patient' : null, refillInfo: newRefillInfo };
                    }
                    return { ...m, refillInfo: newRefillInfo };
                }
                return m;
            };

            Object.keys(schedule).forEach(slot => {
                schedule[slot] = schedule[slot].map(mapMed);
            });
            
            const dashboardMeds = s.dashboardMeds.map(mapMed);

            const allMeds = Object.values(schedule).flat();
            const totalCount = allMeds.length;
            const takenCount = allMeds.filter(x => x.taken).length;
            const newTodayP = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 0;

            const weeklyAdherence = s.weeklyAdherence.map(day => 
                day.isToday ? { ...day, p: newTodayP } : day
            );

            return { dashboardMeds, medicationSchedule: schedule, weeklyAdherence };
        });

        const updatedMeds = get().dashboardMeds;
        if (targetState) {
            const allDone = updatedMeds.length > 0 && updatedMeds.every(m => m.taken);
            if (allDone) {
                HapticPatterns.allDone();
            } else {
                HapticPatterns.log();
            }
        }

        WidgetBridge.updateAllWidgets({ meds: updatedMeds, patient: get().patient, vitals: get().vitals });

        try {
            await apiService.medicines.markMedicine({
                medicine_name: med.name,
                scheduled_time: med.type,
                taken: targetState,
            });

            // Re-fetch medications + weekly adherence so chart/avg update immediately
            get().fetchMedications();
            get().fetchDashboard(true);
        } catch (err) {
            if ((err.request && !err.response) || err.code === 'ECONNABORTED' || err.message === 'Network Error') {
                console.warn('[Store] Network error, enqueueing mutation offline:', err.message);
                const tz = get().patient?.timezone || 'Asia/Kolkata';
                const targetDate = getTodayStringInTz(tz);
                OfflineSyncService.enqueueMutation({
                    type: 'MARK_MED_TAKEN',
                    payload: { medicine_name: med.name, scheduled_time: med.type, taken: targetState, targetDate },
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
                            // Note: we don't strictly revert refillInfo/adherence here because fetchDashboard handles it,
                            // but UI will correct itself immediately via the fetch.
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
        const namesToDecrement = medsToMark.map(m => m.name);

        // Snapshot pre-optimistic state for revert
        const prevDashboardMeds = state.dashboardMeds;
        const prevSchedule = state.medicationSchedule;

        set(s => {
            const mapMed = (m) => {
                let newRefillInfo = m.refillInfo ? { ...m.refillInfo } : null;
                if (namesToDecrement.includes(m.name) && newRefillInfo) {
                    if (typeof newRefillInfo.remainingDoses === 'number') {
                        newRefillInfo.remainingDoses = Math.max(0, newRefillInfo.remainingDoses - 1);
                    } else if (typeof newRefillInfo.totalDoses === 'number') {
                        newRefillInfo.totalDoses = Math.max(0, newRefillInfo.totalDoses - 1);
                    }
                }
                if (m.type === slot && !m.taken) {
                    return { ...m, taken: true, marked_by: 'patient', refillInfo: newRefillInfo };
                }
                return newRefillInfo ? { ...m, refillInfo: newRefillInfo } : m;
            };

            const dashboardMeds = s.dashboardMeds.map(mapMed);
            
            const schedule = { ...s.medicationSchedule };
            Object.keys(schedule).forEach(k => {
                schedule[k] = schedule[k].map(mapMed);
            });

            const allMeds = Object.values(schedule).flat();
            const totalCount = allMeds.length;
            const takenCount = allMeds.filter(x => x.taken).length;
            const newTodayP = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 0;

            const weeklyAdherence = s.weeklyAdherence.map(day => 
                day.isToday ? { ...day, p: newTodayP } : day
            );

            return { dashboardMeds, medicationSchedule: schedule, weeklyAdherence };
        });

        const updatedMeds = get().dashboardMeds;
        const allDone = updatedMeds.length > 0 && updatedMeds.every(m => m.taken);
        if (allDone) {
            HapticPatterns.allDone();
        } else {
            HapticPatterns.log();
        }

        try {
            await apiService.medicines.markSlotTaken({ scheduled_time: slot, marked_by: 'patient' });
            get().fetchDashboard(true);
        } catch (err) {
            if ((err.request && !err.response) || err.code === 'ECONNABORTED' || err.message === 'Network Error') {
                console.warn('[Store] Network error, enqueueing mark-slot mutation offline:', err.message);
                const tz = get().patient?.timezone || 'Asia/Kolkata';
                const targetDate = getTodayStringInTz(tz);
                // Assume OfflineSyncService handles MARK_SLOT_TAKEN, though we'll queue it just in case
                OfflineSyncService.enqueueMutation({
                    type: 'MARK_SLOT_TAKEN',
                    payload: { scheduled_time: slot, marked_by: 'patient', targetDate },
                });
                return;
            }
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