const moment = require("moment-timezone");
const Patient = require("../models/Patient");
const MedicineLog = require("../models/MedicineLog");
const VitalLog = require("../models/VitalLog");
const SleepLog = require("../models/SleepLog");
const PatientHealthStateHistory = require("../models/PatientHealthStateHistory");
const AchievementEvent = require("../models/AchievementEvent");
const { computeHealthScore, gradeFromScore } = require("./healthScoreService");
const {
  buildMergedMeds,
  computeCurrentStreak,
} = require("../routes/users/medicines");
const logger = require("../utils/logger");

const HEALTH_HISTORY_SCHEMA_VERSION = 2;
const HEALTH_HISTORY_ALGORITHM_VERSION = 1;
const HEALTH_HISTORY_MIN_RECORDS = 30;

/**
 * Recomputes the health state for a patient for a specific target date (or today)
 * and caches it to the patient record in the database.
 * @param {string} patientId
 * @param {string|null} targetDate - Optional target date in 'YYYY-MM-DD' format
 * @returns {Promise<Object>} The computed patient_health_state object
 */
async function recomputeAndCacheHealthState(patientId, targetDate = null) {
  try {
    let patient = await Patient.findById(patientId);
    // Robust mock execution check for tests where Patient.findById returns a non-thenable query mock
    if (
      patient &&
      typeof patient.select === "function" &&
      !patient.save &&
      !patient._id
    ) {
      patient = await patient.select();
    }
    if (!patient) return null;

    const timezone = patient.timezone || "Asia/Kolkata";
    const todayStr = targetDate
      ? moment(targetDate).tz(timezone).format("YYYY-MM-DD")
      : moment().tz(timezone).format("YYYY-MM-DD");
    const todayUtc = new Date(`${todayStr}T00:00:00.000Z`);
    const todayEndUtc = moment
      .tz(todayStr, "YYYY-MM-DD", timezone)
      .endOf("day")
      .toDate();
    const thirtyDaysAgo = moment
      .tz(todayStr, "YYYY-MM-DD", timezone)
      .subtract(30, "days")
      .startOf("day")
      .toDate();

    // 1. Fetch data in parallel
    const [
      todayVitals,
      vitalsHistory,
      todayMedLog,
      adherenceLogs,
      sleepHistory,
    ] = await Promise.all([
      (async () => {
        let query = VitalLog.find({
          patient_id: patient._id,
          date: { $gte: todayUtc, $lte: todayEndUtc },
        });
        if (!query) return [];
        if (typeof query.sort === "function") query = query.sort({ date: -1 });
        if (typeof query.lean === "function") query = query.lean();
        return query;
      })(),

      (async () => {
        let query = VitalLog.find({
          patient_id: patient._id,
          date: { $gte: thirtyDaysAgo, $lte: todayEndUtc },
        });
        if (!query) return [];
        if (typeof query.sort === "function") query = query.sort({ date: 1 });
        if (typeof query.lean === "function") query = query.lean();
        return query;
      })(),

      // Today's medication log or build it dynamically
      (async () => {
        let log = await MedicineLog.findOne({
          patient_id: patient._id,
          date: todayUtc,
        });
        // Robust mock execution check for tests where findOne returns a query mock (e.g. tests/companion.test.js)
        if (log && typeof log.then === "function") {
          log = await log;
        } else if (
          log &&
          typeof log.lean === "function" &&
          !log.medicines &&
          !log.save
        ) {
          log = await log.lean();
        }
        // Guard: ensure we have an actual document, not a raw query object
        if (log && !log.medicines && typeof log.lean === "function") {
          log = null; // query object returned instead of document
        }
        const allMedsRaw = await buildMergedMeds(patient);

        if (!log && allMedsRaw.length > 0) {
          const medicines = [];
          for (const med of allMedsRaw) {
            if (med.is_active !== false) {
              for (const time of med.times) {
                medicines.push({
                  medicine_name: med.name,
                  scheduled_time: time,
                  taken: false,
                });
              }
            }
          }
          if (medicines.length > 0) {
            log = new MedicineLog({
              patient_id: patient._id,
              date: todayUtc,
              medicines,
            });
            if (typeof log.save === "function") await log.save();
          }
        } else if (log && Array.isArray(log.medicines)) {
          let isModified = false;
          const activeMedNames = allMedsRaw
            .filter((m) => m.is_active !== false)
            .map((m) => m.name);
          const originalCount = log.medicines.length;
          log.medicines = log.medicines.filter((m) =>
            activeMedNames.includes(m.medicine_name),
          );
          if (log.medicines.length !== originalCount) isModified = true;
          for (const med of allMedsRaw) {
            if (med.is_active !== false) {
              for (const time of med.times) {
                const exists = log.medicines.some(
                  (m) =>
                    m.medicine_name === med.name && m.scheduled_time === time,
                );
                if (!exists) {
                  log.medicines.push({
                    medicine_name: med.name,
                    scheduled_time: time,
                    taken: false,
                  });
                  isModified = true;
                }
              }
            }
          }
          if (isModified && typeof log.save === "function") await log.save();
        }
        return log;
      })(),

      (async () => {
        let query = MedicineLog.find({
          patient_id: patient._id,
          date: { $gte: thirtyDaysAgo, $lte: todayEndUtc },
        });
        if (!query) return [];
        if (typeof query.sort === "function") query = query.sort({ date: 1 });
        if (typeof query.lean === "function") query = query.lean();
        return query;
      })(),

      (async () => {
        let query = SleepLog.find({
          patient_id: patient._id,
          date: { $gte: thirtyDaysAgo, $lte: todayEndUtc },
        });
        if (!query) return [];
        if (typeof query.sort === "function") query = query.sort({ date: 1 });
        if (typeof query.lean === "function") query = query.lean();
        return query;
      })(),
    ]);

    // Ensure arrays (auto-mocked models may return undefined)
    const safeAdherenceLogs = Array.isArray(adherenceLogs) ? adherenceLogs : [];
    const safeVitalsHistory = Array.isArray(vitalsHistory) ? vitalsHistory : [];
    const safeSleepHistory = Array.isArray(sleepHistory) ? sleepHistory : [];
    const todaySleep = safeSleepHistory.find(
      (s) => s.date && new Date(s.date).toISOString().slice(0, 10) === todayStr,
    );

    // 2. Compute medication adherence & streak
    let weeklyTaken = 0;
    let weeklyTotal = 0;
    const dailyLog = [];

    for (const log of safeAdherenceLogs) {
      // Guard: skip entries without a valid date
      if (!log.date) continue;
      const active = (log.medicines || []).filter((m) => m.is_active !== false);
      const taken = active.filter((m) => m.taken).length;
      const total = active.length;
      const logDate = log.date instanceof Date ? log.date : new Date(log.date);
      if (isNaN(logDate.getTime())) continue;
      const dateStr = logDate.toISOString().slice(0, 10);

      const logDateMoment = moment(dateStr, "YYYY-MM-DD");
      const weeklyStart = moment(todayStr, "YYYY-MM-DD").subtract(6, "days");
      const weeklyEnd = moment(todayStr, "YYYY-MM-DD");

      if (
        logDateMoment.isSameOrAfter(weeklyStart, "day") &&
        logDateMoment.isSameOrBefore(weeklyEnd, "day")
      ) {
        weeklyTaken += taken;
        weeklyTotal += total;
      }

      dailyLog.push({
        date: dateStr,
        taken,
        total,
        rate: total > 0 ? Math.round((taken / total) * 100) : 0,
      });
    }

    const historyStartStr = moment(todayUtc)
      .tz(timezone)
      .subtract(30, "days")
      .format("YYYY-MM-DD");
    const streak = computeCurrentStreak(dailyLog, todayStr, historyStartStr);
    let adherenceRate = null;
    if (weeklyTotal > 0) {
      adherenceRate = (weeklyTaken / weeklyTotal) * 100;
    }

    const todayMedsActive = todayMedLog
      ? (todayMedLog.medicines || []).filter((m) => m.is_active !== false)
      : [];
    const todayMedsTaken = todayMedsActive.filter((m) => m.taken).length;
    const todayMedsTotal = todayMedsActive.length;
    const todayAdherencePct =
      todayMedsTotal > 0
        ? Math.round((todayMedsTaken / todayMedsTotal) * 100)
        : null;

    // 3. Compute score/grade/label
    const latestVital =
      safeVitalsHistory.length > 0
        ? safeVitalsHistory[safeVitalsHistory.length - 1]
        : null;
    const patientObj =
      typeof patient.toObject === "function" ? patient.toObject() : patient;
    const scoreDetails = computeHealthScore(
      patientObj,
      todayAdherencePct,
      latestVital,
    );

    // 4. Compute mood state (today's log, trend)
    let todayMood = null;
    const todayStart = new Date(`${todayStr}T00:00:00.000Z`);
    const todayEnd = new Date(`${todayStr}T23:59:59.999Z`);
    const loggedToday = (patient.moodHistory || []).find(
      (m) => m.date >= todayStart && m.date <= todayEnd,
    );
    if (loggedToday) {
      todayMood = loggedToday.mood || loggedToday.value;
    }

    // Calculate Mood Trend:
    // Convert to numbers: sad=1, okay=2, good=3, great=4
    const moodValues = { sad: 1, okay: 2, good: 3, great: 4 };
    let moodTrend = "stable";
    const sortedMoods = (patient.moodHistory || [])
      .filter((m) => m.date && new Date(m.date) <= todayEndUtc)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (sortedMoods.length >= 2) {
      const lastVal =
        moodValues[
          sortedMoods[sortedMoods.length - 1].mood ||
            sortedMoods[sortedMoods.length - 1].value
        ] || 2;
      const prevVal =
        moodValues[
          sortedMoods[sortedMoods.length - 2].mood ||
            sortedMoods[sortedMoods.length - 2].value
        ] || 2;
      if (lastVal > prevVal) moodTrend = "improving";
      else if (lastVal < prevVal) moodTrend = "declining";
      else moodTrend = "stable";
    }

    // Extract today's values for Z-score feature vector
    const MOOD_VALUES_MAP = { sad: 1, okay: 2, good: 3, great: 4 };
    const currentSystolic = latestVital
      ? (latestVital.blood_pressure?.systolic ?? latestVital.systolic)
      : null;
    const currentDiastolic = latestVital
      ? (latestVital.blood_pressure?.diastolic ?? latestVital.diastolic)
      : null;
    const currentHeartRate = latestVital ? latestVital.heart_rate : null;
    const currentSpo2 = latestVital ? latestVital.oxygen_saturation : null;
    const currentSleep = todaySleep ? todaySleep.hours : null;
    const currentMood = todayMood ? MOOD_VALUES_MAP[todayMood] : null;
    const currentAdherence = todayAdherencePct;

    const { calculatePersonalAnomaly } = require("./personalBaselineService");
    const baselineReport = calculatePersonalAnomaly(
      patientObj,
      todayStr,
      safeVitalsHistory,
      safeAdherenceLogs,
      safeSleepHistory,
      {
        systolic: currentSystolic,
        diastolic: currentDiastolic,
        heart_rate: currentHeartRate,
        oxygen_saturation: currentSpo2,
        sleep_hours: currentSleep,
        mood: currentMood,
        adherence: currentAdherence,
      },
    );

    // Apply personal baseline engine modifiers to final score
    let finalScore = scoreDetails.score;
    if (baselineReport.anomaly_level === "significant") {
      finalScore = Math.max(35, finalScore - 5);
    } else if (baselineReport.anomaly_level === "extreme") {
      finalScore = Math.max(35, finalScore - 10);
    }

    // Recalculate grade details based on adjusted finalScore
    const adjustedGrade = gradeFromScore(finalScore);

    // Append baseline anomaly insights directly into AI tips so patient is aware
    if (baselineReport.insights && baselineReport.insights.length > 0) {
      for (const insightText of baselineReport.insights) {
        scoreDetails.tips.unshift({
          category: "vitals",
          priority: 1,
          impact: "medium",
          icon: "⚠️",
          title: "Personal Baseline Alert",
          body: insightText,
        });
      }
    }

    // 5. Compute vitals status
    let vitalsStatus = "stable";
    let bpStatus = "normal";
    let hrStatus = "normal";

    if (latestVital) {
      const hr = latestVital.heart_rate;
      const sys = latestVital.blood_pressure?.systolic ?? latestVital.systolic;
      const dia =
        latestVital.blood_pressure?.diastolic ?? latestVital.diastolic;
      const spo2 = latestVital.oxygen_saturation;

      // HR Status
      if (hr) {
        if (hr < 60) hrStatus = "low";
        else if (hr <= 100) hrStatus = "normal";
        else hrStatus = "high";
      }

      // BP Status
      if (sys && dia) {
        if (sys < 90 || dia < 60) bpStatus = "low";
        else if (sys <= 130 && dia <= 85) bpStatus = "normal";
        else if (sys <= 140 && dia <= 90) bpStatus = "elevated";
        else bpStatus = "high";
      }

      // Vitals Status
      const isCritical =
        (spo2 && spo2 < 90) ||
        (hr && (hr > 120 || hr < 45)) ||
        (sys && sys > 160) ||
        (dia && dia > 100);
      const isWatch =
        (spo2 && spo2 < 95 && spo2 >= 90) ||
        (hr && (hr > 100 || hr < 55) && !isCritical) ||
        (sys && sys > 140 && !isCritical) ||
        (dia && dia > 90 && !isCritical);

      if (isCritical) vitalsStatus = "critical";
      else if (isWatch) vitalsStatus = "watch";
      else vitalsStatus = "stable";
    }

    // 6. Compute AI coach insight & primary focus
    let primaryFocus = "adherence";
    if (
      todayAdherencePct < 80 ||
      (adherenceRate !== null && adherenceRate < 80)
    ) {
      primaryFocus = "adherence";
    } else if (vitalsStatus === "critical" || vitalsStatus === "watch") {
      primaryFocus = "vitals";
    } else if (
      todayMood === "sad" ||
      todayMood === "okay" ||
      moodTrend === "declining"
    ) {
      primaryFocus = "mood";
    }

    let coachInsight = "";
    let suggestedQuestion = "";

    if (primaryFocus === "adherence") {
      const incomplete = todayMedsTotal - todayMedsTaken;
      if (todayMedsTotal > 0 && incomplete === 0) {
        coachInsight =
          "You have taken all medications today! Outstanding consistency.";
      } else if (incomplete === 1) {
        coachInsight =
          "Only one medication remains for today. Let's get it done!";
      } else {
        coachInsight =
          "Pairing medications with daily routines like meals helps build consistency.";
      }
      suggestedQuestion = "How can I improve medication consistency?";
    } else if (primaryFocus === "vitals") {
      if (vitalsStatus === "critical") {
        coachInsight =
          "Your vitals show alert values today. Please rest and consider consulting your healthcare team.";
      } else {
        coachInsight =
          "Your vitals are stable, but let's keep monitoring them daily.";
      }
      suggestedQuestion = "What is a normal blood pressure range for my age?";
    } else if (primaryFocus === "mood") {
      if (todayMood === "sad") {
        coachInsight =
          "You indicated feeling low today. Take it easy and focus on small wins.";
      } else {
        coachInsight =
          "Mood fluctuations are normal. Keep checking in daily for wellness trends.";
      }
      suggestedQuestion = "How does mood affect physical health?";
    }

    // 7. Goals
    const target =
      scoreDetails.score < 85
        ? 85
        : scoreDetails.score < 90
          ? 90
          : scoreDetails.score < 95
            ? 95
            : 100;

    // 8. Achievements
    let nextBadge = {
      id: "streak_7",
      progress: streak,
      target: 7,
      label: "7 Day Streak",
    };
    if (streak >= 7 && streak < 14) {
      nextBadge = {
        id: "streak_14",
        progress: streak,
        target: 14,
        label: "14 Day Streak",
      };
    } else if (streak >= 14 && streak < 30) {
      nextBadge = {
        id: "streak_30",
        progress: streak,
        target: 30,
        label: "30 Day Streak",
      };
    } else if (streak >= 30) {
      nextBadge = {
        id: "unstoppable",
        progress: streak,
        target: 100,
        label: "100 Day Streak",
      };
    }

    // 9. Construct final state
    const stateObj = {
      score: finalScore,
      grade: adjustedGrade.grade,
      label: adjustedGrade.label,
      color: adjustedGrade.color,
      personal_baseline: {
        z_scores: baselineReport.z_scores,
        anomaly_level: baselineReport.anomaly_level,
        insights: baselineReport.insights,
        max_z: baselineReport.max_z,
      },
      mood: {
        today: todayMood,
        trend: moodTrend,
      },
      adherence: {
        today: todayAdherencePct,
        streak: streak,
      },
      vitals: {
        status: vitalsStatus,
        bp: bpStatus,
        hr: hrStatus,
      },
      coach: {
        primary_focus: primaryFocus,
        insight: coachInsight,
        suggested_question: suggestedQuestion,
        confidence: "high",
        generated_at: new Date().toISOString(),
      },
      goals: {
        current: `Reach Score ${target}`,
        progress: scoreDetails.score,
        target: target,
      },
      achievements: {
        unlocked: patient.unlockedAchievements || [],
        next: nextBadge,
      },
      computed_at: new Date().toISOString(),
    };

    // 10. Check for milestones and record AchievementEvents
    const unlocked = patient.unlockedAchievements || [];
    const newUnlocks = [];

    // Perfect Day
    if (
      todayAdherencePct === 100 &&
      todayMedsTotal > 0 &&
      !unlocked.includes("first_perfect_day")
    ) {
      newUnlocks.push("first_perfect_day");
    }
    // Streaks
    if (streak >= 7 && !unlocked.includes("streak_7")) {
      newUnlocks.push("streak_7");
    }
    if (streak >= 30 && !unlocked.includes("streak_30")) {
      newUnlocks.push("streak_30");
    }
    // BP Stabilized
    if (safeVitalsHistory.length >= 3) {
      const last3 = safeVitalsHistory.slice(-3);
      const allStable = last3.every((v) => {
        const sys = v.blood_pressure?.systolic ?? v.systolic;
        const dia = v.blood_pressure?.diastolic ?? v.diastolic;
        return sys && dia && sys <= 130 && dia <= 85;
      });
      if (allStable && !unlocked.includes("bp_stabilized")) {
        newUnlocks.push("bp_stabilized");
      }
    }
    // 30-day adherence
    if (dailyLog.length >= 14) {
      const totalMedsLog = dailyLog.reduce((sum, item) => sum + item.total, 0);
      const takenMedsLog = dailyLog.reduce((sum, item) => sum + item.taken, 0);
      if (
        totalMedsLog > 0 &&
        takenMedsLog / totalMedsLog >= 0.9 &&
        !unlocked.includes("adherence_30d_90")
      ) {
        newUnlocks.push("adherence_30d_90");
      }
    }
    // Score +20
    const firstHistoryEntry = await PatientHealthStateHistory.findOne({
      patient_id: patient._id,
    })
      .sort({ date: 1 })
      .lean();
    if (
      firstHistoryEntry &&
      scoreDetails.score - firstHistoryEntry.score >= 20 &&
      !unlocked.includes("score_plus_20")
    ) {
      newUnlocks.push("score_plus_20");
    }

    if (newUnlocks.length > 0) {
      patient.unlockedAchievements = [...unlocked, ...newUnlocks];
      for (const key of newUnlocks) {
        try {
          await AchievementEvent.create({
            patient_id: patient._id,
            achievement: key,
            earned_at: new Date(),
          });
        } catch (err) {
          // Ignore achievement creation errors in tests/failures
        }
      }
      stateObj.achievements.unlocked = patient.unlockedAchievements;
    }

    // Cache state back to patient document (only for current/today's state)
    const isToday =
      !targetDate || targetDate === moment().tz(timezone).format("YYYY-MM-DD");
    if (isToday) {
      patient.patient_health_state = stateObj;
      // Also update legacy health score cache
      patient.healthScoreCache = scoreDetails.score;
      patient.healthScoreUpdatedAt = new Date();

      if (typeof patient.save === "function") {
        await patient.save();
      }
    }

    // 11. Save snapshot to PatientHealthStateHistory (60-day expiration)
    try {
      const historyExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      let bpSystolicSum = 0;
      let bpDiastolicSum = 0;
      let bpCount = 0;
      for (const v of todayVitals) {
        const sys = v.blood_pressure?.systolic ?? v.systolic;
        const dia = v.blood_pressure?.diastolic ?? v.diastolic;
        if (sys && dia) {
          bpSystolicSum += sys;
          bpDiastolicSum += dia;
          bpCount++;
        }
      }
      const bpAvg =
        bpCount > 0
          ? {
              systolic: Math.round(bpSystolicSum / bpCount),
              diastolic: Math.round(bpDiastolicSum / bpCount),
            }
          : { systolic: null, diastolic: null };

      await PatientHealthStateHistory.findOneAndUpdate(
        { patient_id: patient._id, date: todayUtc },
        {
          patient_id: patient._id,
          date: todayUtc,
          score: stateObj.score,
          score_breakdown: {
            medications: scoreDetails.breakdown?.adherence?.pts ?? 0,
            vitals: scoreDetails.breakdown?.vitals?.pts ?? 0,
            lifestyle: scoreDetails.breakdown?.lifestyle?.pts ?? 0,
            conditions: scoreDetails.breakdown?.conditions?.pts ?? 0,
          },
          adherence: {
            today: stateObj.adherence.today,
            streak: stateObj.adherence.streak,
          },
          mood: stateObj.mood.today,
          sleepHours: todaySleep?.hours || 0,
          bpAvg,
          risk:
            patient.risk_level ||
            (stateObj.vitals.status === "critical"
              ? "high"
              : stateObj.vitals.status === "watch"
                ? "medium"
                : "low"),
          personal_baseline: stateObj.personal_baseline,
          schema_version: HEALTH_HISTORY_SCHEMA_VERSION,
          algorithm_version: HEALTH_HISTORY_ALGORITHM_VERSION,
          expires_at: historyExpiresAt,
        },
        { upsert: true, new: true },
      );
    } catch (historyErr) {
      logger.error(
        "[PatientHealthStateService] Failed to save daily health state history",
        { error: historyErr.message, patientId },
      );
    }

    // Trigger background companion insights generation (2-minute debounced) — only for live recomputations (no targetDate)
    if (!targetDate) {
      try {
        const companionAiService = require("./companionAiService");
        if (
          companionAiService &&
          typeof companionAiService.enqueueCompanionInsights === "function"
        ) {
          companionAiService
            .enqueueCompanionInsights(patientId)
            .catch((err) => {
              logger.warn(
                "[PatientHealthStateService] Failed to enqueue companion insights",
                { error: err.message, patientId },
              );
            });
        } else {
          logger.warn(
            "[PatientHealthStateService] companionAiService or enqueueCompanionInsights not fully loaded during circular dependency resolution",
          );
        }
      } catch (enqueueErr) {
        logger.error(
          "[PatientHealthStateService] Error loading enqueueCompanionInsights",
          { error: enqueueErr.message },
        );
      }
    }

    return stateObj;
  } catch (err) {
    logger.error("[PatientHealthStateService] Recomputation failed", {
      error: err.message,
      patientId,
    });
    return null;
  }
}

/**
 * Retrieves the cached health state if it exists and is fresh enough (under 30 minutes).
 * If stale or missing, triggers a synchronous recomputation.
 * @param {Object} patient Patient document/object
 * @returns {Promise<Object>}
 */
async function getCachedHealthState(patient) {
  if (!patient) return null;

  const patientId = patient._id || patient.id;
  let state = patient.patient_health_state;

  // Check if state has computed_at and is fresh enough (30 mins)
  const MAX_STALE_MS = 30 * 60 * 1000;
  if (state && state.computed_at) {
    const age = Date.now() - new Date(state.computed_at).getTime();
    if (age < MAX_STALE_MS) {
      return state;
    }
  }

  return recomputeAndCacheHealthState(patientId);
}

/**
 * Enqueues a health state recomputation job to BullMQ.
 * Deduplicates multiple events for the same patient within a 5-second window.
 * Falls back to synchronous recompute if Redis/BullMQ is unavailable.
 * @param {string} patientId
 * @param {object} options - Extensible payload options
 * @param {string|null} options.targetDate - Optional target date in 'YYYY-MM-DD' format
 * @returns {Promise<void>}
 */
async function enqueueHealthStateRecompute(patientId, options = {}) {
  const targetDate = options?.targetDate || null;
  if (
    process.env.NODE_ENV !== "test" &&
    process.env.USE_BULLMQ_WORKERS !== "true"
  ) {
    logger.info(
      `[PatientHealthStateService] Running in-process background health-state recomputation for patient ${patientId} date ${targetDate || "today"} (5s delay)`,
    );
    setTimeout(() => {
      recomputeAndCacheHealthState(patientId, targetDate).catch((err) => {
        logger.error(
          "[PatientHealthStateService] In-process background recomputation failed",
          { error: err.message, patientId },
        );
      });
    }, 5000);
    return;
  }
  try {
    const { healthStateQueue, PRIORITY } = require("../jobs/jobQueues");
    if (!healthStateQueue) {
      logger.warn(
        "[PatientHealthStateService] healthStateQueue not initialized. Falling back to synchronous recomputation.",
      );
      await recomputeAndCacheHealthState(patientId, targetDate);
      return;
    }

    const payload = { patientId };
    if (targetDate) {
      payload.options = { targetDate };
    }

    const jobId = targetDate
      ? `health-state-${patientId}-${targetDate}`
      : `health-state-${patientId}`;
    await healthStateQueue.add("recompute", payload, {
      jobId,
      delay: 5000,
      priority: PRIORITY ? PRIORITY.HIGH : 5,
    });
    logger.info(
      `[PatientHealthStateService] Enqueued debounced health-state recompute for patient ${patientId} date ${targetDate || "today"}`,
    );
  } catch (err) {
    logger.warn(
      "[PatientHealthStateService] Queue unavailable, falling back to synchronous recomputation",
      { error: err.message, patientId },
    );
    await recomputeAndCacheHealthState(patientId, targetDate);
  }
}

const activeInProcessBackfills = new Set();
const lastBackfillAttempt = new Map(); // patientId -> timestamp

/**
 * Retrieves the daily health snapshots for the past 30 days and calculates deltas.
 * Triggers an asynchronous backfill if the history has fewer than 5 records.
 * @param {string} patientId
 * @param {string} timezone
 * @returns {Promise<Object>} containing history list and delta calculations.
 */
async function getHealthHistory(patientId, timezone = "Asia/Kolkata") {
  // Find all history records for the patient, sorted by date ascending
  let history = await PatientHealthStateHistory.find({ patient_id: patientId })
    .sort({ date: 1 })
    .lean();

  const patientKey = patientId.toString();
  // Check if backfill is currently active/pending
  let isBackfilling = activeInProcessBackfills.has(patientKey);
  if (!isBackfilling && process.env.USE_BULLMQ_WORKERS === "true") {
    try {
      const { healthHistoryBackfillQueue } = require("../jobs/jobQueues");
      if (healthHistoryBackfillQueue) {
        const job = await healthHistoryBackfillQueue.getJob(
          `backfill-${patientId}`,
        );
        if (job) {
          const state = await job.getState();
          if (
            state === "active" ||
            state === "waiting" ||
            state === "delayed"
          ) {
            isBackfilling = true;
          }
        }
      }
    } catch (e) {
      // Ignore error
    }
  }

  const now = Date.now();
  const lastAttempt = lastBackfillAttempt.get(patientKey) || 0;

  const hasOldSchema = history.some(
    (h) =>
      !h.schema_version || h.schema_version < HEALTH_HISTORY_SCHEMA_VERSION,
  );
  const needsBackfill =
    history.length < HEALTH_HISTORY_MIN_RECORDS || hasOldSchema;

  // If history needs backfill, trigger backfill asynchronously (cooldown of 5 minutes)
  if (needsBackfill && !isBackfilling && now - lastAttempt > 5 * 60 * 1000) {
    lastBackfillAttempt.set(patientKey, now);
    logger.info(
      `[PatientHealthStateService] History needs backfill (count=${history.length}, hasOldSchema=${hasOldSchema}). Triggering background backfill for patient ${patientId}`,
    );
    isBackfilling = true;
    if (
      process.env.NODE_ENV !== "test" &&
      process.env.USE_BULLMQ_WORKERS !== "true"
    ) {
      backfillHealthStateHistory(patientId, timezone).catch((err) =>
        logger.error(
          "[PatientHealthStateService] In-process background backfill failed",
          { error: err.message },
        ),
      );
    } else {
      try {
        const {
          healthHistoryBackfillQueue,
          PRIORITY,
        } = require("../jobs/jobQueues");
        if (healthHistoryBackfillQueue) {
          healthHistoryBackfillQueue
            .add(
              "backfill",
              { patientId, timezone },
              {
                jobId: `backfill-${patientId}`,
                priority: PRIORITY ? PRIORITY.LOW : 25,
              },
            )
            .catch((err) => {
              logger.warn(
                "[PatientHealthStateService] Failed to enqueue backfill job, falling back to in-process execution",
                { error: err.message },
              );
              backfillHealthStateHistory(patientId, timezone).catch((err2) =>
                logger.error(
                  "[PatientHealthStateService] Fallback in-process background backfill failed",
                  { error: err2.message },
                ),
              );
            });
        } else {
          backfillHealthStateHistory(patientId, timezone).catch((err) =>
            logger.error(
              "[PatientHealthStateService] Background backfill failed",
              { error: err.message },
            ),
          );
        }
      } catch (err) {
        logger.warn(
          "[PatientHealthStateService] Failed to check queue, running in-process",
          { error: err.message },
        );
        backfillHealthStateHistory(patientId, timezone).catch((err2) =>
          logger.error(
            "[PatientHealthStateService] In-process background backfill failed",
            { error: err2.message },
          ),
        );
      }
    }
  }

  // Calculate deltas dynamically
  let score_delta_7d = 0;
  let score_delta_30d = 0;
  let adherence_delta_30d = 0;

  if (history.length > 0) {
    const latest = history[history.length - 1];

    // 7d delta
    const target7d = moment().tz(timezone).subtract(7, "days").startOf("day");
    const entry7d = history.find((h) => moment(h.date).isSameOrAfter(target7d));
    if (entry7d) score_delta_7d = latest.score - entry7d.score;

    // 30d delta
    const target30d = moment().tz(timezone).subtract(30, "days").startOf("day");
    let entry30d = history.find((h) => moment(h.date).isSameOrAfter(target30d));
    if (!entry30d && history.length > 0) {
      entry30d = history[0];
    }
    if (entry30d) {
      score_delta_30d = latest.score - entry30d.score;
      adherence_delta_30d =
        (latest.adherence?.today ?? 0) - (entry30d.adherence?.today ?? 0);
    }
  }

  return {
    history,
    isBackfilling,
    deltas: {
      score_delta_7d,
      score_delta_30d,
      adherence_delta_30d,
    },
  };
}

/**
 * Sequential background backfill of daily health states for the past 30 days.
 * @param {string} patientId
 * @param {string} timezone
 * @returns {Promise<void>}
 */
async function backfillHealthStateHistory(patientId, timezone) {
  const patientKey = patientId.toString();
  if (activeInProcessBackfills.has(patientKey)) {
    logger.info(
      `[PatientHealthStateService] Backfill already in progress in-process for patient ${patientKey}, skipping duplicate run`,
    );
    return;
  }
  activeInProcessBackfills.add(patientKey);
  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;
  try {
    const today = moment().tz(timezone);
    logger.info(
      `[PatientHealthStateService] Health history migration started for patient ${patientId} to schema version ${HEALTH_HISTORY_SCHEMA_VERSION}`,
    );
    for (let i = 30; i >= 0; i--) {
      const targetDateStr = today
        .clone()
        .subtract(i, "days")
        .format("YYYY-MM-DD");
      try {
        const res = await recomputeAndCacheHealthState(
          patientId,
          targetDateStr,
        );
        if (res) successCount++;
        else failCount++;
      } catch (err) {
        failCount++;
        logger.error(
          `[PatientHealthStateService] Backfill failed for day -${i} (${targetDateStr})`,
          { error: err.message, patientId },
        );
      }
    }
    const duration = Date.now() - startTime;
    logger.info(
      `[PatientHealthStateService] Health history migration finished for patient ${patientId}. Status: Success=${successCount}, Failures=${failCount}, Duration=${duration}ms`,
    );
  } finally {
    activeInProcessBackfills.delete(patientKey);
  }
}

module.exports = {
  recomputeAndCacheHealthState,
  getCachedHealthState,
  enqueueHealthStateRecompute,
  getHealthHistory,
  backfillHealthStateHistory,
};
