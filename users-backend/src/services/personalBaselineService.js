/**
 * personalBaselineService.js
 *
 * Implements a Personal Baseline Engine that calculates standard deviations and
 * rolling Z-scores for a patient's health feature vector over a 30-day window.
 */

"use strict";

const moment = require("moment-timezone");

const MOOD_VALUES = { sad: 1, okay: 2, good: 3, great: 4 };

/**
 * Calculates Z-scores for the current day's features compared to the last 30 days.
 *
 * @param {Object} patient         - Patient Mongoose model / object
 * @param {string} targetDateStr   - Target date in YYYY-MM-DD format
 * @param {Array} vitalsHistory    - 30-day history of VitalLogs
 * @param {Array} adherenceLogs   - 30-day history of MedicineLogs
 * @param {Array} sleepHistory     - 30-day history of SleepLogs
 * @param {Object} currentValues   - Current values for today: { systolic, diastolic, heart_rate, oxygen_saturation, sleep_hours, mood, adherence }
 * @returns {Object}               - Anomaly report with z_scores, level, and explainable insights
 */
function calculatePersonalAnomaly(patient, targetDateStr, vitalsHistory, adherenceLogs, sleepHistory, currentValues) {
  const timezone = patient.timezone || "Asia/Kolkata";
  const targetDate = moment.tz(targetDateStr, "YYYY-MM-DD", timezone);

  // Define the historical baseline window: [targetDate - 30 days, targetDate - 1 day]
  const windowStart = targetDate.clone().subtract(30, "days").startOf("day");
  const windowEnd = targetDate.clone().subtract(1, "days").endOf("day");

  // Helper to check if a date is within the baseline window
  const inWindow = (dateVal) => {
    if (!dateVal) return false;
    const mDate = moment(dateVal);
    return mDate.isSameOrAfter(windowStart) && mDate.isSameOrBefore(windowEnd);
  };

  // Extract historical feature vectors
  const histVitals = vitalsHistory.filter(v => inWindow(v.date));
  const histSleep = sleepHistory.filter(s => inWindow(s.date));
  const histMood = (patient.moodHistory || []).filter(m => inWindow(m.date));
  
  // Calculate daily medicine adherence for historical logs
  const histAdherence = [];
  for (const log of adherenceLogs) {
    if (!inWindow(log.date)) continue;
    const active = (log.medicines || []).filter(m => m.is_active !== false);
    const total = active.length;
    if (total > 0) {
      const taken = active.filter(m => m.taken).length;
      histAdherence.push((taken / total) * 100);
    }
  }

  // Define our 7 features arrays for history
  const features = {
    systolic: histVitals.map(v => v.blood_pressure?.systolic ?? v.systolic).filter(v => v != null),
    diastolic: histVitals.map(v => v.blood_pressure?.diastolic ?? v.diastolic).filter(v => v != null),
    heart_rate: histVitals.map(v => v.heart_rate).filter(v => v != null),
    oxygen_saturation: histVitals.map(v => v.oxygen_saturation).filter(v => v != null),
    sleep_hours: histSleep.map(s => s.hours).filter(v => v != null),
    mood: histMood.map(m => MOOD_VALUES[m.mood || m.value]).filter(v => v != null),
    adherence: histAdherence
  };

  const z_scores = {};
  const stats = {};
  const insights = [];

  // Calculate statistics (Mean, StdDev) for each feature
  for (const key of Object.keys(features)) {
    const vals = features[key];
    
    // We need at least 3 historical data points to establish a stable baseline
    if (vals.length < 3) {
      z_scores[key] = 0.0;
      stats[key] = { mean: null, std: null, count: vals.length };
      continue;
    }

    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length;
    const std = Math.sqrt(variance);

    stats[key] = { mean, std, count: vals.length };

    const currentVal = currentValues[key];
    if (currentVal === null || currentVal === undefined) {
      z_scores[key] = 0.0;
      continue;
    }

    if (std === 0) {
      // Standard deviation is 0 (all values are identical), deviation from it is either 0 or infinity.
      // If today matches mean, Z is 0. Else if it deviates, treat it as a significant deviation if large,
      // but to be safe and avoid division by zero, we map Z-score to 0 or a fixed value.
      z_scores[key] = currentVal === mean ? 0.0 : (currentVal > mean ? 3.0 : -3.0);
    } else {
      z_scores[key] = parseFloat(((currentVal - mean) / std).toFixed(2));
    }

    // Generate explainable insights for significant deviations
    const absZ = Math.abs(z_scores[key]);
    if (absZ >= 1.5) {
      const zStr = absZ.toFixed(1);
      const direction = z_scores[key] > 0 ? "above" : "below";
      
      if (key === "systolic") {
        insights.push(`Your systolic BP is ${zStr} standard deviations ${direction} your normal level.`);
      } else if (key === "diastolic") {
        insights.push(`Your diastolic BP is ${zStr} standard deviations ${direction} your normal level.`);
      } else if (key === "heart_rate") {
        insights.push(`Your heart rate is ${zStr} standard deviations ${direction} your normal baseline.`);
      } else if (key === "oxygen_saturation" && z_scores[key] < 0) {
        insights.push(`Your oxygen saturation is ${zStr} standard deviations below your normal average.`);
      } else if (key === "sleep_hours") {
        const diffHours = Math.abs(currentVal - mean).toFixed(1);
        insights.push(`You slept ${diffHours} hours ${z_scores[key] > 0 ? "more" : "less"} than usual (${zStr} standard deviations deviation).`);
      } else if (key === "mood" && z_scores[key] < 0) {
        insights.push(`Your mood is significantly lower than your recent pattern.`);
      } else if (key === "adherence" && z_scores[key] < 0) {
        insights.push(`Your medication adherence dropped significantly below your usual average.`);
      }
    }
  }

  // Calculate overall anomaly level
  const maxAbsZ = Math.max(...Object.values(z_scores).map(Math.abs));
  let anomaly_level = "normal";
  if (maxAbsZ >= 3.0) {
    anomaly_level = "extreme";
  } else if (maxAbsZ >= 2.0) {
    anomaly_level = "significant";
  } else if (maxAbsZ >= 1.5) {
    anomaly_level = "mild";
  }

  return {
    z_scores,
    anomaly_level,
    insights,
    stats,
    max_z: maxAbsZ
  };
}

module.exports = { calculatePersonalAnomaly };
