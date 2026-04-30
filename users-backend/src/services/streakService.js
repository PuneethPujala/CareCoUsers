const Patient = require('../models/Patient');
const MedicineLog = require('../models/MedicineLog');
const moment = require('moment-timezone');

/**
 * Validates and updates a patient's Care Streak safely.
 *
 * BUG 10 FIX: MedicineLog dates are stored as UTC midnight
 * (new Date(`YYYY-MM-DDT00:00:00.000Z`)). The original query used
 * now.clone().startOf('day').toDate() which produces LOCAL midnight
 * in the patient's timezone — these are different moments. For IST
 * patients, local midnight is 5:30am UTC, not UTC midnight, so the
 * query would never match a stored log. Fixed to derive the patient's
 * local date string first, then construct the UTC midnight Date.
 *
 * BUG 11 FIX: When daysMissed === 0 (same-day double call, edge case),
 * the condition `available_freezes >= daysMissed` was `N >= 0` = always
 * true, which would attempt to deduct 0 freezes and still increment.
 * This is actually harmless because subtracting 0 changes nothing, but
 * the guard now explicitly short-circuits the Condition C branch when
 * daysDiff === 1 (yesterday = consecutive), which is the correct path
 * for that case and prevents Condition C from running at all.
 */
exports.evaluateAndUpdateStreak = async (patientId) => {
    try {
        const patient = await Patient.findById(patientId);
        if (!patient) return null;

        const timezone = patient.timezone || 'Asia/Kolkata';
        const now = moment().tz(timezone);

        // BUG 10 FIX: derive local date string first, then build UTC midnight
        // to match how /today stores logs: new Date(`YYYY-MM-DDT00:00:00.000Z`)
        const todayStr = now.format('YYYY-MM-DD');
        const yesterdayStr = now.clone().subtract(1, 'day').format('YYYY-MM-DD');
        const todayUtcMidnight = new Date(`${todayStr}T00:00:00.000Z`);

        const todayLog = await MedicineLog.findOne({
            patient_id: patientId,
            date: todayUtcMidnight, // was: now.clone().startOf('day').toDate() — wrong
        });

        if (!todayLog) return patient.gamification;

        const activeMeds = todayLog.medicines.filter(m => m.is_active !== false);
        if (activeMeds.length === 0) return patient.gamification;

        const takenCount = activeMeds.filter(m => m.taken === true).length;
        const takenRatio = takenCount / activeMeds.length;
        
        // User requested: Taking >50% of meds continues the streak
        if (takenRatio <= 0.5) return patient.gamification;

        if (!patient.gamification) {
            patient.gamification = {
                current_streak: 0,
                longest_streak: 0,
                available_freezes: 2,
                history_dates: [],
                last_streak_update: null,
            };
        }

        const g = patient.gamification;
        const lastUpdateStr = g.last_streak_update
            ? moment(g.last_streak_update).tz(timezone).format('YYYY-MM-DD')
            : null;

        // Already updated today — idempotent guard
        if (lastUpdateStr === todayStr) return g;

        let streakChanged = false;

        if (!lastUpdateStr || lastUpdateStr === yesterdayStr) {
            // Condition B: First ever update, or yesterday was the last perfect day
            g.current_streak += 1;
            g.last_streak_update = now.toDate();
            streakChanged = true;
        } else {
            // Condition C: There's a gap — calculate how many days were missed
            const lastUpdateMoment = moment.tz(lastUpdateStr, 'YYYY-MM-DD', timezone).startOf('day');
            const todayMoment = now.clone().startOf('day');
            const daysDiff = todayMoment.diff(lastUpdateMoment, 'days');

            // BUG 11 FIX: daysDiff === 1 means consecutive (yesterday) — should
            // have been caught by Condition B but guard here for safety.
            // daysDiff === 0 means same day — already guarded above by lastUpdateStr === todayStr.
            const daysMissed = Math.max(0, daysDiff - 1);

            if (daysMissed === 0) {
                // Consecutive — shouldn't reach here but handle gracefully
                g.current_streak += 1;
                g.last_streak_update = now.toDate();
                streakChanged = true;
            } else if (g.available_freezes >= daysMissed) {
                g.available_freezes -= daysMissed;
                g.current_streak += 1;
                g.last_streak_update = now.toDate();
                streakChanged = true;
            } else {
                // Streak broken — start fresh at 1 (this day IS perfect)
                g.current_streak = 1;
                g.last_streak_update = now.toDate();
                streakChanged = true;
            }
        }

        if (streakChanged) {
            if (g.current_streak > g.longest_streak) {
                g.longest_streak = g.current_streak;
            }
            if (!g.history_dates.includes(todayStr)) {
                g.history_dates.push(todayStr);
            }
            await patient.save();
        }

        return g;
    } catch (error) {
        console.error('[StreakService] Error:', error);
        return null;
    }
};