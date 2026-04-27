const express = require('express');
const moment = require('moment-timezone'); // BUG 9 FIX: top-level require, not inside hot path
const Patient = require('../../models/Patient');
const MedicineLog = require('../../models/MedicineLog');
const Medication = require('../../models/Medication');
const { authenticateSession: authenticate } = require('../../middleware/authenticate');
const { getOrCreatePatient } = require('../../utils/patientHelpers');

const router = express.Router();

// ─── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Get today's UTC-midnight Date for a given IANA timezone.
 * MedicineLog dates are stored as UTC midnight (new Date(`YYYY-MM-DDT00:00:00.000Z`)).
 * We must derive the local date string first, then build the UTC midnight to match.
 *
 * BUG 1 + 2 FIX: The original code used new Date() + getFullYear/Month/Date which
 * reads server-local time (UTC on most servers). For IST patients between midnight
 * and 5:30am IST, the server date is still "yesterday" UTC — so they'd get yesterday's
 * log. All date derivation now goes through moment-timezone.
 */
function getTodayUtcMidnight(timezone) {
    const tz = timezone || 'Asia/Kolkata';
    const todayStr = moment().tz(tz).format('YYYY-MM-DD');
    return { todayStr, date: new Date(`${todayStr}T00:00:00.000Z`) };
}

/**
 * Get the UTC-midnight Date for N days ago in a given timezone.
 * BUG 4 FIX: sevenDaysAgo/thirtyDaysAgo were derived with setHours(0,0,0,0)
 * in server local time, not patient timezone.
 */
function getDaysAgoUtcMidnight(timezone, n) {
    const tz = timezone || 'Asia/Kolkata';
    const dateStr = moment().tz(tz).subtract(n, 'days').format('YYYY-MM-DD');
    return new Date(`${dateStr}T00:00:00.000Z`);
}

function mapTimeToLegacyBucket(timeStr) {
    if (!timeStr) return 'morning';
    const isPM = timeStr.toLowerCase().includes('pm');
    const isAM = timeStr.toLowerCase().includes('am');
    const match = timeStr.match(/(\d+):(\d+)/);
    if (match) {
        let hour = parseInt(match[1]);
        if (isPM && hour < 12) hour += 12;
        if (isAM && hour === 12) hour = 0;
        if (hour >= 5 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 21) return 'evening';
        return 'night';
    }
    return 'morning';
}

/**
 * Build the merged medication list (patient embedded + external Medication collection).
 * Extracted so /today, /mark, and /mark-slot all use the same merge logic.
 * BUG 3 FIX: mark-slot's fallback log creation was missing external meds.
 */
async function buildMergedMeds(patient) {
    const searchIds = [patient._id];
    if (patient.profile_id) searchIds.push(patient.profile_id);
    const externalMeds = await Medication.find({ patientId: { $in: searchIds }, isActive: true });

    const allMedsRaw = [...(patient.medications || [])];
    for (const extMed of externalMeds) {
        if (!allMedsRaw.some(m => m.name === extMed.name)) {
            let mappedTimes = extMed.times?.length > 0
                ? extMed.times
                : (extMed.scheduledTimes || []).map(mapTimeToLegacyBucket);
            mappedTimes = [...new Set(mappedTimes)];
            if (mappedTimes.length === 0) mappedTimes = ['morning'];
            allMedsRaw.push({
                name: extMed.name,
                dosage: extMed.dosage,
                instructions: extMed.instructions,
                is_active: extMed.isActive,
                times: mappedTimes,
            });
        }
    }
    return allMedsRaw;
}

/**
 * Streak calculation — shared by /adherence/details and /adherence/recap.
 *
 * BUG 5 + 8 FIX: The original code did:
 *   const reqDate = new Date(todayStr + "T00:00:00Z")  → UTC midnight ✓
 *   checkDate.setDate(checkDate.getDate() - 1)         → mutates in local TZ ✗
 * On a server in UTC this works, but it's fragile. More importantly, the
 * daily entries use YYYY-MM-DD strings derived from stored UTC-midnight dates.
 * Iterating by subtracting days from a Date object in local time is correct
 * only when server TZ === UTC. Replaced with moment-based string iteration.
 *
 * BUG 6 FIX: Today detection used new Date().toISOString().slice(0,10) (UTC date)
 * compared against todayStr (patient-TZ date). These differ for IST users between
 * midnight IST and 5:30am IST. Now both use todayStr derived from patient TZ.
 *
 * REST DAY FIX: A day with total === 0 (no medications scheduled — e.g. a patient
 * on a Mon/Wed/Fri regimen has no entries on Tuesday) or with no log at all is now
 * treated as a neutral "rest day" and does NOT break the streak. The streak only
 * breaks when a day has scheduled medications (total > 0) AND the patient failed
 * to meet the threshold. This mirrors how fitness streaks handle rest days.
 *
 * The one exception is today: if today has no log yet (app just opened, log not
 * created) we skip it without breaking — same as before.
 */
function computeCurrentStreak(dailyLog, todayStr, startDateStr, threshold = 80) {
    let streak = 0;
    let cursor = moment(todayStr, 'YYYY-MM-DD');
    const limit = moment(startDateStr, 'YYYY-MM-DD');

    while (!cursor.isBefore(limit)) {
        const dStr = cursor.format('YYYY-MM-DD');
        const entry = dailyLog.find(d => d.date === dStr);

        // No log exists for this day, or no meds were scheduled (rest day).
        // Treat as neutral — skip without breaking.
        // Exception: if this is a future day somehow, also just skip.
        if (!entry || entry.total === 0) {
            cursor.subtract(1, 'day');
            continue;
        }

        // Day has scheduled meds — evaluate it
        if (entry.rate >= threshold) {
            streak++;
        } else if (dStr === todayStr) {
            // Today is below threshold but the day isn't over yet — skip, don't break
        } else {
            // Past day with meds scheduled but threshold not met — streak broken
            break;
        }
        cursor.subtract(1, 'day');
    }
    return streak;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/users/medicines/today
 */
router.get('/today', authenticate, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);

        // BUG 1 FIX: derive today's date in patient's timezone
        const { todayStr, date: today } = getTodayUtcMidnight(patient.timezone);

        let log = await MedicineLog.findOne({ patient_id: patient._id, date: today });

        const allMedsRaw = await buildMergedMeds(patient);

        if (!log && allMedsRaw.length > 0) {
            const medicines = [];
            for (const med of allMedsRaw) {
                if (med.is_active !== false) {
                    for (const time of med.times) {
                        medicines.push({ medicine_name: med.name, scheduled_time: time, taken: false });
                    }
                }
            }
            if (medicines.length > 0) {
                log = new MedicineLog({ patient_id: patient._id, date: today, medicines });
                await log.save();
            }
        } else if (log) {
            let isModified = false;
            const activeMedNames = allMedsRaw.filter(m => m.is_active !== false).map(m => m.name);

            const originalCount = log.medicines.length;
            log.medicines = log.medicines.filter(m => activeMedNames.includes(m.medicine_name));
            if (log.medicines.length !== originalCount) isModified = true;

            for (const med of allMedsRaw) {
                if (med.is_active !== false) {
                    for (const time of med.times) {
                        const exists = log.medicines.some(m => m.medicine_name === med.name && m.scheduled_time === time);
                        if (!exists) {
                            log.medicines.push({ medicine_name: med.name, scheduled_time: time, taken: false });
                            isModified = true;
                        }
                    }
                }
            }
            if (isModified) await log.save();
        }

        const logObj = log ? log.toObject() : { medicines: [], date: today };
        const preferences = patient.medication_call_preferences || { morning: '09:00', afternoon: '14:00', night: '20:00' };

        if (logObj.medicines) {
            logObj.medicines = logObj.medicines.filter(m => m.is_active !== false);
            logObj.medicines = logObj.medicines.map(m => {
                const patMed = allMedsRaw.find(p => p.name === m.medicine_name);
                return {
                    ...m,
                    dosage: patMed?.dosage || '',
                    instructions: patMed?.instructions || '',
                    preferred_time: preferences[m.scheduled_time] || '',
                };
            });
        }

        res.json({ log: logObj, preferences });
    } catch (error) {
        console.error('Get today medicines error:', error);
        res.status(500).json({ error: "Failed to get today's medicines" });
    }
});

/**
 * PUT /api/users/medicines/mark
 */
router.put('/mark', authenticate, async (req, res) => {
    try {
        const { medicine_name, scheduled_time, taken, marked_by = 'patient' } = req.body;
        const patient = await getOrCreatePatient(req);

        // BUG 2 FIX: same UTC date derivation fix as /today
        const { todayStr, date: today } = getTodayUtcMidnight(patient.timezone);

        let log = await MedicineLog.findOne({ patient_id: patient._id, date: today });

        if (!log) {
            // BUG 3 FIX: use merged meds (patient + external) for fallback log
            const allMedsRaw = await buildMergedMeds(patient);
            log = new MedicineLog({
                patient_id: patient._id,
                date: today,
                medicines: allMedsRaw.flatMap(med => {
                    if (med.is_active === false) return [];
                    return med.times.map(t => ({ medicine_name: med.name, scheduled_time: t, taken: false }));
                }),
            });
            await log.save();
        }

        const med = log.medicines.find(
            m => m.medicine_name === medicine_name && m.scheduled_time === scheduled_time
        );
        if (!med) return res.status(404).json({ error: 'Medicine not found in schedule' });

        med.taken = taken;
        med.taken_at = taken ? new Date() : null;
        med.marked_by = marked_by;
        await log.save();

        const patientMed = patient.medications.find(m => m.name === medicine_name);
        if (patientMed) {
            if (!patientMed.takenLogs) patientMed.takenLogs = [];
            patientMed.takenLogs.push({ timestamp: new Date(), status: taken ? 'taken' : 'missed', markedBy: marked_by });

            if (taken) {
                if (!patientMed.takenDates) patientMed.takenDates = [];
                const alreadyTakenToday = patientMed.takenDates.some(d => {
                    try { return new Date(d).toISOString().split('T')[0] === todayStr; } catch { return false; }
                });
                if (!alreadyTakenToday) patientMed.takenDates.push(new Date());
            }
            await patient.save();
        } else {
            const searchIds = [patient._id];
            if (patient.profile_id) searchIds.push(patient.profile_id);
            const extMed = await Medication.findOne({ patientId: { $in: searchIds }, name: medicine_name });
            if (extMed) {
                if (!extMed.takenLogs) extMed.takenLogs = [];
                extMed.takenLogs.push({ date: todayStr, timestamp: new Date() });
                await extMed.save();
            }
        }

        const streakService = require('../../services/streakService');
        streakService.evaluateAndUpdateStreak(patient._id).catch(e => console.error('Streak Update Failed:', e));

        res.json({ log });
    } catch (error) {
        console.error('Mark medicine error:', error);
        res.status(500).json({ error: 'Failed to mark medicine' });
    }
});

/**
 * PUT /api/users/medicines/mark-slot
 */
router.put('/mark-slot', authenticate, async (req, res) => {
    try {
        const { scheduled_time, marked_by = 'patient' } = req.body;
        const patient = await getOrCreatePatient(req);

        const { todayStr, date: today } = getTodayUtcMidnight(patient.timezone);

        let log = await MedicineLog.findOne({ patient_id: patient._id, date: today });
        if (!log) {
            // BUG 3 FIX: was only using patient.medications — now uses full merged list
            const allMedsRaw = await buildMergedMeds(patient);
            log = new MedicineLog({
                patient_id: patient._id,
                date: today,
                medicines: allMedsRaw.flatMap(med => {
                    if (med.is_active === false) return [];
                    return med.times.map(t => ({ medicine_name: med.name, scheduled_time: t, taken: false }));
                }),
            });
        }

        let updatedAny = false;
        log.medicines.forEach(m => {
            if (m.scheduled_time === scheduled_time && !m.taken) {
                m.taken = true;
                m.taken_at = new Date();
                m.marked_by = marked_by;
                updatedAny = true;

                const patientMed = patient.medications.find(pm => pm.name === m.medicine_name);
                if (patientMed) {
                    if (!patientMed.takenLogs) patientMed.takenLogs = [];
                    patientMed.takenLogs.push({ timestamp: new Date(), status: 'taken', markedBy: marked_by });
                    if (!patientMed.takenDates) patientMed.takenDates = [];
                    const alreadyTakenToday = patientMed.takenDates.some(d => {
                        try { return new Date(d).toISOString().split('T')[0] === todayStr; } catch { return false; }
                    });
                    if (!alreadyTakenToday) patientMed.takenDates.push(new Date());
                }
            }
        });

        if (updatedAny) {
            await Promise.all([log.save(), patient.save()]);
            const streakService = require('../../services/streakService');
            await streakService.evaluateAndUpdateStreak(patient._id);
        }

        res.json({ success: true, log });
    } catch (error) {
        console.error('Mark slot error:', error);
        res.status(500).json({ error: 'Failed to mark medications as taken' });
    }
});

/**
 * GET /api/users/medicines/adherence/weekly
 */
router.get('/adherence/weekly', authenticate, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);

        // BUG 4 FIX: use patient timezone for range boundary
        const sevenDaysAgo = getDaysAgoUtcMidnight(patient.timezone, 7);

        const logs = await MedicineLog.find({
            patient_id: patient._id,
            date: { $gte: sevenDaysAgo },
        }).sort({ date: 1 });

        const weeklyData = logs.map(log => {
            const total = log.medicines.length;
            const taken = log.medicines.filter(m => m.taken).length;
            return {
                date: log.date,
                total,
                taken,
                missed: total - taken,
                rate: total > 0 ? Math.round((taken / total) * 100) : 0,
            };
        });

        res.json({ adherence: weeklyData });
    } catch (error) {
        console.error('Get weekly adherence error:', error);
        res.status(500).json({ error: 'Failed to get weekly adherence' });
    }
});

/**
 * GET /api/users/medicines/adherence/monthly
 */
router.get('/adherence/monthly', authenticate, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);

        // BUG 4 FIX: patient timezone for range
        const thirtyDaysAgo = getDaysAgoUtcMidnight(patient.timezone, 30);

        const logs = await MedicineLog.find({
            patient_id: patient._id,
            date: { $gte: thirtyDaysAgo },
        });

        let totalMeds = 0;
        let takenMeds = 0;
        for (const log of logs) {
            totalMeds += log.medicines.length;
            takenMeds += log.medicines.filter(m => m.taken).length;
        }

        res.json({
            monthly: {
                total: totalMeds,
                taken: takenMeds,
                rate: totalMeds > 0 ? Math.round((takenMeds / totalMeds) * 100) : 0,
                days_tracked: logs.length,
            },
        });
    } catch (error) {
        console.error('Get monthly adherence error:', error);
        res.status(500).json({ error: 'Failed to get monthly adherence' });
    }
});

/**
 * GET /api/users/medicines/adherence/details
 */
router.get('/adherence/details', authenticate, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);

        const VitalLog = require('../../models/VitalLog');
        const timezone = patient.timezone || 'Asia/Kolkata';

        // BUG 4 + 6 FIX: derive all date boundaries from patient timezone
        const { todayStr } = getTodayUtcMidnight(timezone);
        const thirtyDaysAgo = getDaysAgoUtcMidnight(timezone, 30);
        const thirtyDaysAgoStr = moment().tz(timezone).subtract(30, 'days').format('YYYY-MM-DD');

        const logs = await MedicineLog.find({
            patient_id: patient._id,
            date: { $gte: thirtyDaysAgo },
        }).sort({ date: 1 });

        const vitals = await VitalLog.find({
            patient_id: patient._id,
            date: { $gte: thirtyDaysAgo },
        }).sort({ date: 1 });

        const vitalsMap = {};
        for (const v of vitals) {
            const dateStr = v.date.toISOString().slice(0, 10);
            vitalsMap[dateStr] = v;
        }

        const dailyLog = logs.map(log => {
            const dateStr = log.date.toISOString().slice(0, 10);
            const activeMeds = log.medicines.filter(m => m.is_active !== false);
            const total = activeMeds.length;
            const taken = activeMeds.filter(m => m.taken).length;
            const rate = total > 0 ? Math.round((taken / total) * 100) : 0;
            let status = 'none';
            if (total === 0) status = 'none';
            else if (rate === 100) status = 'complete';
            else if (rate > 0) status = 'partial';
            else status = 'missed';
            return {
                date: dateStr,
                taken,
                total,
                rate,
                status,
                medicines: activeMeds.map(m => ({ name: m.medicine_name, taken: m.taken, time: m.scheduled_time })),
                vitals: vitalsMap[dateStr] ? {
                    heart_rate: vitalsMap[dateStr].heart_rate,
                    systolic: vitalsMap[dateStr].blood_pressure?.systolic,
                    diastolic: vitalsMap[dateStr].blood_pressure?.diastolic,
                    oxygen_saturation: vitalsMap[dateStr].oxygen_saturation,
                    hydration: vitalsMap[dateStr].hydration,
                } : null,
            };
        });

        const last7 = dailyLog.slice(-7);
        const last30 = dailyLog;

        const calcScore = arr => {
            if (arr.length === 0) return 0;
            const totalMeds = arr.reduce((s, d) => s + d.total, 0);
            const takenMeds = arr.reduce((s, d) => s + d.taken, 0);
            return totalMeds > 0 ? Math.round((takenMeds / totalMeds) * 100) : 0;
        };

        const weeklyScore = calcScore(last7);
        const monthlyScore = calcScore(last30);

        let vitalsAdherence = 0;
        if (last30.length > 0) {
            vitalsAdherence = Math.round((last30.filter(d => d.vitals).length / last30.length) * 100);
        }

        let level;
        if (monthlyScore >= 90) level = { key: 'optimal', label: 'Optimal', emoji: '🏆' };
        else if (monthlyScore >= 70) level = { key: 'consistent', label: 'Consistent', emoji: '🌳' };
        else if (monthlyScore >= 50) level = { key: 'improving', label: 'Improving', emoji: '🌿' };
        else level = { key: 'beginner', label: 'Beginner', emoji: '🌱' };

        const last3 = dailyLog.slice(-3);
        const last3Avg = calcScore(last3);
        const momentum = last3Avg >= 80 ? 'rising' : last3Avg < 60 ? 'falling' : 'steady';

        // BUG 6 FIX: was new Date().toISOString().slice(0,10) (UTC date) vs todayStr (TZ date)
        const todayEntry = dailyLog.find(d => d.date === todayStr);
        const today = todayEntry || { taken: 0, total: 0, completed: false };
        today.completed = today.total > 0 && today.taken === today.total;

        const weekTaken = last7.reduce((s, d) => s + d.taken, 0);
        const weekMissed = last7.reduce((s, d) => s + (d.total - d.taken), 0);
        const prev7 = dailyLog.slice(-14, -7);
        const improvement = weeklyScore - calcScore(prev7);
        const weeklySummary = { taken: weekTaken, missed: weekMissed, improvement };

        const achievements = [];
        const perfectDays = dailyLog.filter(d => d.rate === 100);
        const has3Consecutive = (() => {
            let count = 0;
            for (const d of dailyLog) {
                if (d.rate >= 80) { count++; if (count >= 3) return true; }
                else count = 0;
            }
            return false;
        })();

        // BUG 7 FIX: original used logs.every() across all 30 days — a day where the
        // patient had no morning medication (discontinued med) would fail the check.
        // Now only considers logs that actually have at least one active morning entry.
        const logsWithMorningMeds = logs.filter(log =>
            log.medicines.some(m => m.scheduled_time === 'morning' && m.is_active !== false)
        );
        const morningLogs = logsWithMorningMeds.length >= 1 && logsWithMorningMeds.every(log =>
            log.medicines
                .filter(m => m.scheduled_time === 'morning' && m.is_active !== false)
                .every(m => m.taken)
        );

        achievements.push({ key: 'first_perfect_day', label: 'First 100% Day', description: 'Complete all doses in a single day', emoji: '🟢', unlocked: perfectDays.length >= 1 });
        achievements.push({ key: '3_day_consistent', label: '3 Days Consistent', description: 'Score 80%+ for 3 consecutive days', emoji: '🟡', unlocked: has3Consecutive });
        achievements.push({ key: 'never_missed_morning', label: 'Morning Champion', description: 'Never miss a morning dose', emoji: '🔵', unlocked: logsWithMorningMeds.length >= 3 && morningLogs });
        achievements.push({ key: 'weekly_90', label: 'Weekly 90%+', description: 'Achieve 90%+ in a week', emoji: '🟣', unlocked: weeklyScore >= 90 });
        achievements.push({ key: '7_perfect_days', label: 'Perfect Week', description: '7 days with 100% adherence', emoji: '💎', unlocked: perfectDays.length >= 7 });
        achievements.push({ key: 'monthly_consistent', label: 'Monthly Warrior', description: 'Maintain 80%+ for 30 days', emoji: '🏅', unlocked: monthlyScore >= 80 && last30.length >= 25 });

        const insights = [];
        if (monthlyScore >= 90) {
            insights.push("Excellent consistency! Your medication routine is well-established.");
        } else {
            const times = { morning: { total: 0, taken: 0 }, afternoon: { total: 0, taken: 0 }, night: { total: 0, taken: 0 } };
            logs.forEach(log => {
                log.medicines.forEach(m => {
                    if (m.is_active !== false && times[m.scheduled_time]) {
                        times[m.scheduled_time].total++;
                        if (m.taken) times[m.scheduled_time].taken++;
                    }
                });
            });
            let lowestRate = 100, lowestTime = null;
            Object.keys(times).forEach(k => {
                if (times[k].total > 0) {
                    const r = (times[k].taken / times[k].total) * 100;
                    if (r < lowestRate && r < 80) { lowestRate = r; lowestTime = k; }
                }
            });
            if (lowestTime) {
                insights.push(`Insight: You frequently miss your ${lowestTime} doses (${Math.round(lowestRate)}%). Consider setting an extra reminder!`);
            } else if (monthlyScore > 0) {
                insights.push("Keep it up! Every dose counts toward your long-term health goals.");
            }
        }
        if (vitalsAdherence >= 80) insights.push("Great job consistently logging your vitals alongside your medications.");
        else if (vitalsAdherence < 30) insights.push("Try to log your vitals more frequently to build a complete health profile.");

        // BUG 5 FIX: replaced native Date arithmetic with TZ-safe moment string iteration
        const currentStreak = computeCurrentStreak(dailyLog, todayStr, thirtyDaysAgoStr);

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weeklyTrend = [];
        for (let i = 6; i >= 0; i--) {
            const d = moment().tz(timezone).subtract(i, 'days');
            const dateStr = d.format('YYYY-MM-DD');
            const entry = dailyLog.find(e => e.date === dateStr);
            weeklyTrend.push({ day: dayNames[d.day()], date: dateStr, rate: entry ? entry.rate : 0 });
        }

        res.json({
            score: { weekly: weeklyScore, monthly: monthlyScore },
            level,
            momentum,
            today,
            daily_log: dailyLog,
            achievements,
            weekly_summary: weeklySummary,
            vitals_adherence: vitalsAdherence,
            insights,
            streak: currentStreak,
            weekly_trend: weeklyTrend,
        });
    } catch (error) {
        console.error('Get adherence details error:', error);
        res.status(500).json({ error: 'Failed to get adherence details' });
    }
});

/**
 * GET /api/users/medicines/adherence/recap
 */
router.get('/adherence/recap', authenticate, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);

        const VitalLog = require('../../models/VitalLog');
        const timezone = patient.timezone || 'Asia/Kolkata';

        const period = req.query.period || 'weekly';
        const now = moment().tz(timezone);
        const { todayStr } = getTodayUtcMidnight(timezone);

        let daysBack;
        if (period === 'yearly') daysBack = 365;
        else if (period === 'monthly') daysBack = 30;
        else daysBack = 7;

        let startDateStr = now.clone().subtract(daysBack, 'days').format('YYYY-MM-DD');
        let startDate = new Date(`${startDateStr}T00:00:00.000Z`);
        let isAllTimeFallback = false;

        if (period === 'yearly') {
            const firstLog = await MedicineLog.findOne({ patient_id: patient._id }).sort({ date: 1 });
            if (firstLog && firstLog.date > startDate) {
                startDate = new Date(firstLog.date);
                startDateStr = startDate.toISOString().slice(0, 10);
                daysBack = Math.max(1, Math.ceil((Date.now() - startDate.getTime()) / 86400000));
                isAllTimeFallback = true;
            }
        }

        const logs = await MedicineLog.find({
            patient_id: patient._id,
            date: { $gte: startDate },
        }).sort({ date: 1 });

        const vitals = await VitalLog.find({ patient_id: patient._id, date: { $gte: startDate } });

        const dailyEntries = logs.map(log => {
            const activeMeds = log.medicines.filter(m => m.is_active !== false);
            const total = activeMeds.length;
            const taken = activeMeds.filter(m => m.taken).length;
            return {
                date: log.date.toISOString().slice(0, 10),
                total,
                taken,
                rate: total > 0 ? Math.round((taken / total) * 100) : 0,
                medicines: activeMeds,
            };
        });

        let totalScheduled = 0, totalTaken = 0;
        dailyEntries.forEach(d => { totalScheduled += d.total; totalTaken += d.taken; });
        const adherenceRate = totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : 0;

        // BUG 8 FIX: replaced native Date arithmetic with TZ-safe moment string iteration
        const currentStreak = computeCurrentStreak(dailyEntries, todayStr, startDateStr);

        let bestStreak = 0, tempStreak = 0;
        for (const d of dailyEntries) {
            if (d.total > 0 && d.rate >= 80) { tempStreak++; bestStreak = Math.max(bestStreak, tempStreak); }
            else tempStreak = 0;
        }

        const times = { morning: { total: 0, taken: 0 }, afternoon: { total: 0, taken: 0 }, night: { total: 0, taken: 0 } };
        logs.forEach(log => {
            log.medicines.forEach(m => {
                if (m.is_active !== false && times[m.scheduled_time]) {
                    times[m.scheduled_time].total++;
                    if (m.taken) times[m.scheduled_time].taken++;
                }
            });
        });
        let mostConsistent = null, mostMissed = null, highestRate = -1, lowestRate = 101;
        Object.keys(times).forEach(k => {
            if (times[k].total > 0) {
                const r = (times[k].taken / times[k].total) * 100;
                if (r > highestRate) { highestRate = r; mostConsistent = k; }
                if (r < lowestRate) { lowestRate = r; mostMissed = k; }
            }
        });

        const perfectDays = dailyEntries.filter(d => d.rate === 100).length;

        let level;
        if (adherenceRate >= 90) level = { key: 'optimal', label: 'Optimal', emoji: '🏆' };
        else if (adherenceRate >= 70) level = { key: 'consistent', label: 'Consistent', emoji: '🌳' };
        else if (adherenceRate >= 50) level = { key: 'improving', label: 'Improving', emoji: '🌿' };
        else level = { key: 'beginner', label: 'Beginner', emoji: '🌱' };

        const medStats = {};
        logs.forEach(log => {
            log.medicines.forEach(m => {
                if (m.is_active === false) return;
                if (!medStats[m.medicine_name]) medStats[m.medicine_name] = { total: 0, taken: 0 };
                medStats[m.medicine_name].total++;
                if (m.taken) medStats[m.medicine_name].taken++;
            });
        });
        let topMed = null, topRate = -1;
        Object.keys(medStats).forEach(name => {
            const r = medStats[name].total > 0 ? Math.round((medStats[name].taken / medStats[name].total) * 100) : 0;
            if (r > topRate) { topRate = r; topMed = { name, rate: r }; }
        });

        const prevStart = new Date(startDate);
        prevStart.setDate(prevStart.getDate() - daysBack);
        const prevLogs = await MedicineLog.find({ patient_id: patient._id, date: { $gte: prevStart, $lt: startDate } });
        let prevTotal = 0, prevTaken = 0;
        prevLogs.forEach(log => {
            log.medicines.forEach(m => {
                if (m.is_active !== false) { prevTotal++; if (m.taken) prevTaken++; }
            });
        });
        const prevRate = prevTotal > 0 ? Math.round((prevTaken / prevTotal) * 100) : 0;
        const improvement = adherenceRate - prevRate;

        const badgesEarned = [
            perfectDays >= 1,
            bestStreak >= 3,
            adherenceRate >= 90,
            perfectDays >= 7,
            adherenceRate >= 80 && dailyEntries.length >= 25,
        ].filter(Boolean).length;

        const messages = {
            optimal: ["You're unstoppable! 🔥", "Health champion status achieved! 💪", "Consistency is your superpower! ⭐"],
            consistent: ["Great momentum — keep pushing! 🚀", "You're building healthy habits! 🌟", "Almost at the top — don't stop! 💫"],
            improving: ["Every dose counts — you're growing! 🌿", "Progress is progress, no matter how small! 📈", "Keep going, you're on the right track! 🛤️"],
            beginner: ["Today is a fresh start! 🌅", "One step at a time — you've got this! 💙", "Small steps lead to big changes! 🦋"],
        };
        const pool = messages[level.key] || messages.beginner;
        const motivationalMessage = pool[Math.floor(Math.random() * pool.length)];

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weeklyTrend = [];
        for (let i = 6; i >= 0; i--) {
            const d = moment().tz(timezone).subtract(i, 'days');
            const dateStr = d.format('YYYY-MM-DD');
            const entry = dailyEntries.find(e => e.date === dateStr);
            weeklyTrend.push({ day: dayNames[d.day()], date: dateStr, rate: entry ? entry.rate : 0 });
        }

        const monthlyTrend = [];
        for (let i = 29; i >= 0; i--) {
            const d = moment().tz(timezone).subtract(i, 'days');
            const dateStr = d.format('YYYY-MM-DD');
            const entry = dailyEntries.find(e => e.date === dateStr);
            monthlyTrend.push({ date: dateStr, day: d.date(), rate: entry ? entry.rate : 0 });
        }

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const yearlyTrend = [];
        for (let i = 11; i >= 0; i--) {
            const d = moment().tz(timezone).subtract(i, 'months');
            const monthKey = d.format('YYYY-MM');
            const monthEntries = dailyEntries.filter(e => e.date.startsWith(monthKey));
            const monthTotal = monthEntries.reduce((s, e) => s + e.total, 0);
            const monthTaken = monthEntries.reduce((s, e) => s + e.taken, 0);
            yearlyTrend.push({
                month: monthNames[d.month()],
                rate: monthTotal > 0 ? Math.round((monthTaken / monthTotal) * 100) : 0,
                days: monthEntries.length,
            });
        }

        res.json({
            period,
            is_all_time_fallback: isAllTimeFallback,
            date_range: { start: startDateStr, end: todayStr },
            total_doses_scheduled: totalScheduled,
            total_doses_taken: totalTaken,
            adherence_rate: adherenceRate,
            streak_best: bestStreak,
            streak_current: currentStreak,
            most_consistent_time: mostConsistent,
            most_missed_time: mostMissed,
            perfect_days: perfectDays,
            total_days_tracked: dailyEntries.length,
            level,
            top_medication: topMed,
            improvement_vs_previous: improvement,
            vitals_logged_days: vitals.length,
            badges_earned: badgesEarned,
            motivational_message: motivationalMessage,
            weekly_trend: weeklyTrend,
            monthly_trend: monthlyTrend,
            yearly_trend: yearlyTrend,
        });
    } catch (error) {
        console.error('Get adherence recap error:', error);
        res.status(500).json({ error: 'Failed to get adherence recap' });
    }
});

module.exports = router;