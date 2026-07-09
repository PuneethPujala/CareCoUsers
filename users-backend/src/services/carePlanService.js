const moment = require('moment-timezone');
const Patient = require('../models/Patient');
const SleepLog = require('../models/SleepLog');
const CarePlanHistory = require('../models/CarePlanHistory');
const { buildMergedMeds } = require('../routes/users/medicines');
const logger = require('../utils/logger');

/**
 * Helper to get local start/end of the current week (Monday to Sunday) based on patient's timezone.
 * @param {string} timezone
 * @returns {{ weekStart: Date, weekEnd: Date }}
 */
function getWeekRange(timezone) {
  const nowLocal = moment().tz(timezone);
  const startOfWeek = nowLocal.clone().startOf('isoWeek'); // ISO week starts on Monday
  const endOfWeek = nowLocal.clone().endOf('isoWeek'); // ISO week ends on Sunday
  return {
    weekStart: startOfWeek.toDate(),
    weekEnd: endOfWeek.toDate(),
  };
}

/**
 * Computes the sleep target based on historical sleep logs:
 * - Queries last 14 days of sleep logs.
 * - If >= 10 logs exist, return 14-day average.
 * - Else, fallback to last 7 days average.
 * - If fewer than 3 logs, return default 7.5 hours.
 * @param {string} patientId
 * @param {string} timezone
 * @returns {Promise<number>}
 */
async function computeSleepTarget(patientId, timezone) {
  const nowLocal = moment().tz(timezone);

  // 14 days range
  const fourteenDaysAgo = nowLocal
    .clone()
    .subtract(14, 'days')
    .startOf('day')
    .toDate();
  const sleepLogs14 = await SleepLog.find({
    patient_id: patientId,
    date: { $gte: fourteenDaysAgo },
  }).lean();

  if (sleepLogs14.length >= 10) {
    const sum = sleepLogs14.reduce((acc, log) => acc + log.hours, 0);
    return parseFloat((sum / sleepLogs14.length).toFixed(1));
  }

  // Fallback to 7 days
  const sevenDaysAgo = nowLocal
    .clone()
    .subtract(7, 'days')
    .startOf('day')
    .toDate();
  const sleepLogs7 = sleepLogs14.filter(
    (log) => new Date(log.date) >= sevenDaysAgo
  );

  if (sleepLogs7.length >= 3) {
    const sum = sleepLogs7.reduce((acc, log) => acc + log.hours, 0);
    return parseFloat((sum / sleepLogs7.length).toFixed(1));
  }

  // Default target
  return 7.5;
}

/**
 * Gets or generates a version-tracked Care Plan for the patient for the current week.
 * If details have changed since the last version, increments version number.
 * @param {string} patientId
 * @returns {Promise<Object>} The active CarePlanHistory document
 */
async function getOrGenerateCarePlan(patientId) {
  try {
    const patient = await Patient.findById(patientId);
    if (!patient) return null;

    const timezone = patient.timezone || 'Asia/Kolkata';
    const { weekStart, weekEnd } = getWeekRange(timezone);

    // Fetch active care plans for this week
    const activePlan = await CarePlanHistory.findOne({
      patient_id: patientId,
      week_start: weekStart,
      active: true,
    });

    // 1. Gather current settings to build tasks
    const allMedsRaw = await buildMergedMeds(patient);
    const medicationTasks = [];
    for (const med of allMedsRaw) {
      if (med.is_active !== false) {
        for (const time of med.times) {
          medicationTasks.push({
            name: med.name,
            time_slot: time,
          });
        }
      }
    }

    // Sort tasks for easy comparison
    medicationTasks.sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.time_slot.localeCompare(b.time_slot)
    );

    // Sleep Target
    const sleepTarget = await computeSleepTarget(patientId, timezone);

    // Target health score (current score + 5, capped at 100)
    const currentScore = patient.healthScoreCache ?? 80;
    const targetScore = Math.min(100, currentScore + 5);

    const vitalsTarget = 'BP check every 2 days';

    if (activePlan) {
      // Check if details have changed
      const medsChanged =
        JSON.stringify(
          activePlan.medication_tasks
            .map((t) => ({ name: t.name, time_slot: t.time_slot }))
            .sort(
              (a, b) =>
                a.name.localeCompare(b.name) ||
                a.time_slot.localeCompare(b.time_slot)
            )
        ) !== JSON.stringify(medicationTasks);
      const sleepChanged =
        Math.abs(activePlan.sleep_hours_goal - sleepTarget) > 0.1;
      const targetScoreChanged = activePlan.target_health_score !== targetScore;

      if (!medsChanged && !sleepChanged && !targetScoreChanged) {
        // Return existing active plan if details match
        return activePlan;
      }

      // Details changed, set previous active plan inactive
      activePlan.active = false;
      await activePlan.save();

      // Create new version
      const nextVersion = activePlan.version + 1;
      const newPlan = await CarePlanHistory.create({
        patient_id: patientId,
        week_start: weekStart,
        week_end: weekEnd,
        version: nextVersion,
        medication_tasks: medicationTasks,
        vitals_target: vitalsTarget,
        sleep_hours_goal: sleepTarget,
        target_health_score: targetScore,
        active: true,
      });

      logger.info(
        `[CarePlanService] Upgraded Care Plan for patient ${patientId} to Version ${nextVersion} due to changes.`
      );
      return newPlan;
    }

    // Create initial week care plan
    const initialPlan = await CarePlanHistory.create({
      patient_id: patientId,
      week_start: weekStart,
      week_end: weekEnd,
      version: 1,
      medication_tasks: medicationTasks,
      vitals_target: vitalsTarget,
      sleep_hours_goal: sleepTarget,
      target_health_score: targetScore,
      active: true,
    });

    logger.info(
      `[CarePlanService] Generated new Initial Care Plan for patient ${patientId}`
    );
    return initialPlan;
  } catch (err) {
    logger.error('[CarePlanService] Error in getOrGenerateCarePlan', {
      error: err.message,
      patientId,
    });
    return null;
  }
}

module.exports = {
  getOrGenerateCarePlan,
  computeSleepTarget,
  getWeekRange,
};
