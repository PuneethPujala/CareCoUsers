const mongoose = require('mongoose');
const CallLog = require('../models/CallLog');
const Medication = require('../models/Medication');
const Profile = require('../models/Profile');
const CaretakerPatient = require('../models/CaretakerPatient');

/**
 * ═══════════════════════════════════════════════════════════════
 * ADHERENCE CALCULATOR SERVICE
 * Real-time patient adherence, streaks, and call completion rates.
 * Triggered after every call log completion.
 * ═══════════════════════════════════════════════════════════════
 */

// ── 1. PATIENT ADHERENCE RATE ──────────────────────────────────

/**
 * Calculates medication adherence rate for a patient over a given period.
 *
 * Logic:
 *   1. Get all active medications + their scheduled frequencies
 *   2. Compute total expected doses in the window
 *   3. Count confirmed doses from completed call logs
 *   4. Rate = (confirmed / expected) * 100
 *   5. Persist to Profile.metadata.adherence_rate
 *
 * @param {ObjectId|string} patientId
 * @param {number} [days=30] — look-back window
 * @returns {{ adherenceRate: number, confirmedDoses: number, expectedDoses: number, updatedProfile: boolean }}
 */
async function calculateAdherence(patientId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const pid = new mongoose.Types.ObjectId(patientId);

    // ── Expected doses ────────────────────────────────────────
    const medications = await Medication.find({
        patientId: pid,
        isActive: true,
        startDate: { $lte: new Date() },
    }).lean();

    let expectedDoses = 0;
    medications.forEach(med => {
        const medStart = new Date(Math.max(new Date(med.startDate).getTime(), startDate.getTime()));
        const medEnd = med.endDate && new Date(med.endDate) < new Date() ? new Date(med.endDate) : new Date();
        const activeDays = Math.max(1, Math.ceil((medEnd - medStart) / (24 * 60 * 60 * 1000)));

        let dosesPerDay = 1;
        switch (med.frequency) {
            case 'once_daily': dosesPerDay = 1; break;
            case 'twice_daily': dosesPerDay = 2; break;
            case 'three_times_daily': dosesPerDay = 3; break;
            case 'four_times_daily': dosesPerDay = 4; break;
            case 'every_other_day': dosesPerDay = 0.5; break;
            case 'weekly': dosesPerDay = 1 / 7; break;
            case 'as_needed': dosesPerDay = 0; break; // excluded from adherence
            default:
                // Use scheduledTimes array length if available
                dosesPerDay = med.scheduledTimes?.length || 1;
        }
        expectedDoses += Math.round(activeDays * dosesPerDay);
    });

    // ── Confirmed doses from call logs ────────────────────────
    const confirmResult = await CallLog.aggregate([
        {
            $match: {
                patientId: pid,
                scheduledTime: { $gte: startDate },
                status: 'completed',
            },
        },
        { $unwind: '$medicationConfirmations' },
        {
            $group: {
                _id: null,
                confirmed: { $sum: { $cond: ['$medicationConfirmations.confirmed', 1, 0] } },
                total: { $sum: 1 },
            },
        },
    ]);

    const confirmedDoses = confirmResult.length ? confirmResult[0].confirmed : 0;
    const totalFromCalls = confirmResult.length ? confirmResult[0].total : 0;

    // Use the larger denominator for accuracy (expected vs. actual confirmations tracked)
    const denominator = Math.max(expectedDoses, totalFromCalls, 1);
    const adherenceRate = Math.min(100, Math.round((confirmedDoses / denominator) * 100));

    // ── Persist to Profile ────────────────────────────────────
    let updatedProfile = false;
    try {
        await Profile.findByIdAndUpdate(patientId, {
            $set: {
                'metadata.adherence_rate': adherenceRate,
                'metadata.adherence_updated_at': new Date(),
            },
        });
        updatedProfile = true;
    } catch (err) {
        console.error('Failed to update adherence on profile:', err.message);
    }

    return { adherenceRate, confirmedDoses, expectedDoses: denominator, updatedProfile };
}

// ── 2. CALL COMPLETION RATE ─────────────────────────────────────

/**
 * Calculates call completion rate for a caretaker on a given date.
 *
 * @param {ObjectId|string} caretakerId
 * @param {Date|string} [date] — defaults to today
 * @returns {{ completionRate: number, completed: number, total: number, missed: number }}
 */
async function calculateCallCompletionRate(caretakerId, date) {
    const d = date ? new Date(date) : new Date();
    const startOfDay = new Date(d); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(d); endOfDay.setHours(23, 59, 59, 999);

    const ctId = new mongoose.Types.ObjectId(caretakerId);

    const result = await CallLog.aggregate([
        {
            $match: {
                caretakerId: ctId,
                scheduledTime: { $gte: startOfDay, $lte: endOfDay },
            },
        },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                missed: { $sum: { $cond: [{ $in: ['$status', ['missed', 'no_answer']] }, 1, 0] } },
                inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
            },
        },
    ]);

    if (!result.length) return { completionRate: 0, completed: 0, total: 0, missed: 0 };

    const { total, completed, missed, inProgress } = result[0];
    return {
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        completed,
        total,
        missed,
        inProgress,
    };
}

// ── 3. STREAK CALCULATOR ────────────────────────────────────────

/**
 * Calculates consecutive days with 100 % medication confirmation.
 *
 * Logic:
 *   Walk backward from yesterday, one day at a time.
 *   A "perfect day" = every call that day was completed AND
 *                     every medication confirmation was true.
 *   Stop at the first imperfect day.
 *
 * @param {ObjectId|string} patientId
 * @returns {{ currentStreak: number, longestStreak: number, lastPerfectDate: Date|null }}
 */
async function calculateStreak(patientId) {
    const pid = new mongoose.Types.ObjectId(patientId);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Get daily call/confirmation summary, newest first
    const dailySummary = await CallLog.aggregate([
        {
            $match: {
                patientId: pid,
                scheduledTime: { $gte: ninetyDaysAgo, $lt: new Date() },
            },
        },
        { $unwind: { path: '$medicationConfirmations', preserveNullAndEmptyArrays: true } },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$scheduledTime' } },
                totalCalls: { $addToSet: '$_id' },
                completedCalls: {
                    $addToSet: {
                        $cond: [{ $eq: ['$status', 'completed'] }, '$_id', '$$REMOVE'],
                    },
                },
                totalConfirmations: { $sum: 1 },
                confirmedCount: { $sum: { $cond: [{ $ifNull: ['$medicationConfirmations.confirmed', false] }, 1, 0] } },
            },
        },
        {
            $project: {
                date: '$_id',
                totalCalls: { $size: '$totalCalls' },
                completedCalls: { $size: '$completedCalls' },
                totalConfirmations: 1,
                confirmedCount: 1,
                isPerfect: {
                    $and: [
                        { $gt: ['$totalConfirmations', 0] },
                        { $eq: ['$confirmedCount', '$totalConfirmations'] },
                        { $eq: [{ $size: '$totalCalls' }, { $size: '$completedCalls' }] },
                    ],
                },
            },
        },
        { $sort: { _id: -1 } },
    ]);

    let currentStreak = 0;
    let longestStreak = 0;
    let runningStreak = 0;
    let lastPerfectDate = null;

    // Walk through days checking for gaps
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dayMap = Object.fromEntries(dailySummary.map(d => [d.date, d]));

    for (let i = 1; i <= 90; i++) {
        const checkDate = new Date(today - i * 24 * 60 * 60 * 1000);
        const dateStr = checkDate.toISOString().split('T')[0];
        const day = dayMap[dateStr];

        if (!day) {
            // No calls scheduled → doesn't break streak, but doesn't add
            continue;
        }

        if (day.isPerfect) {
            runningStreak++;
            if (!lastPerfectDate) lastPerfectDate = checkDate;
        } else {
            if (runningStreak > longestStreak) longestStreak = runningStreak;
            if (currentStreak === 0) currentStreak = runningStreak;
            runningStreak = 0;
            if (currentStreak > 0) break; // We've found the current streak boundary
        }
    }

    // Handle case where streak goes the full 90 days
    if (currentStreak === 0) currentStreak = runningStreak;
    if (runningStreak > longestStreak) longestStreak = runningStreak;

    // Persist to Profile
    try {
        await Profile.findByIdAndUpdate(patientId, {
            $set: {
                'metadata.current_streak': currentStreak,
                'metadata.longest_streak': longestStreak,
                'metadata.streak_updated_at': new Date(),
            },
        });
    } catch (err) {
        console.error('Failed to update streak on profile:', err.message);
    }

    return { currentStreak, longestStreak, lastPerfectDate };
}

// ── 4. BATCH RECALCULATION ──────────────────────────────────────

/**
 * Recalculates adherence + streak for ALL active patients in an org.
 * Useful for nightly cron jobs.
 *
 * @param {ObjectId|string} [organizationId] — omit to recalc platform-wide
 * @returns {{ processed: number, errors: number }}
 */
async function batchRecalculate(organizationId) {
    const filter = { role: 'patient', isActive: true };
    if (organizationId) filter.organizationId = new mongoose.Types.ObjectId(organizationId);

    const patients = await Profile.find(filter).select('_id').lean();
    let processed = 0;
    let errors = 0;

    for (const patient of patients) {
        try {
            await calculateAdherence(patient._id);
            await calculateStreak(patient._id);
            processed++;
        } catch (err) {
            console.error(`Recalc error for patient ${patient._id}:`, err.message);
            errors++;
        }
    }

    return { processed, errors };
}

// ── 5. POST-CALL TRIGGER ────────────────────────────────────────

/**
 * Called after a call is marked complete. Recalculates all KPIs
 * for the patient in that call and updates relevant records.
 *
 * @param {ObjectId|string} callLogId
 */
async function onCallCompleted(callLogId) {
    const call = await CallLog.findById(callLogId).lean();
    if (!call) return;

    // Recalculate patient KPIs
    const [adherence, streak] = await Promise.all([
        calculateAdherence(call.patientId),
        calculateStreak(call.patientId),
    ]);

    // Update CaretakerPatient assignment metrics
    await CaretakerPatient.findOneAndUpdate(
        { caretakerId: call.caretakerId, patientId: call.patientId, status: 'active' },
        {
            $inc: { 'metrics.totalCalls': 1, 'metrics.completedCalls': 1 },
            $set: { 'metrics.lastCallDate': new Date() },
        }
    );

    return { adherence, streak };
}

module.exports = {
    calculateAdherence,
    calculateCallCompletionRate,
    calculateStreak,
    batchRecalculate,
    onCallCompleted,
};
