/**
 * aiContextService.js
 *
 * Responsible for building a highly compressed, token-optimized JSON payload
 * representing the patient's current health context.
 *
 * Strict Truncation Rules:
 * - Vitals: 7-day aggregate only
 * - Medications: Active only, with next scheduled time
 * - Adherence: 3-day history summary only
 */

const moment = require("moment-timezone");
const Patient = require("../models/Patient");
const Profile = require("../models/Profile");
const Medication = require("../models/Medication");
const MedicineLog = require("../models/MedicineLog");
const VitalLog = require("../models/VitalLog");
const CallLog = require("../models/CallLog");

/**
 * Builds the truncated patient context for LLM injection
 * @param {string} patientId
 * @returns {object} Highly optimized JSON object
 */
async function buildPatientContext(patientId) {
  // 1. Fetch Patient & Profile
  const patient = await Patient.findById(patientId).select(
    "name date_of_birth gender profile_id timezone medications gamification patient_health_state",
  );
  if (!patient) return null;

  const tz = patient.timezone || "Asia/Kolkata";
  const profile = await Profile.findById(patient.profile_id).select(
    "blood_type dietary_restrictions medical_history vaccinations",
  );

  const now = moment().tz(tz);
  const todayStr = now.format("YYYY-MM-DD");
  const threeDaysAgoDate = new Date(
    `${now.clone().subtract(3, "days").format("YYYY-MM-DD")}T00:00:00.000Z`,
  );
  const sevenDaysAgoDate = new Date(
    `${now.clone().subtract(7, "days").format("YYYY-MM-DD")}T00:00:00.000Z`,
  );

  // 2. Active Medications (search both patient._id and profile_id like the rest of the app)
  const searchIds = [patient._id];
  if (patient.profile_id) searchIds.push(patient.profile_id);

  const externalMeds = await Medication.find({
    patientId: { $in: searchIds },
    isActive: true,
  }).select("name dosage frequency times scheduledTimes instructions -_id");

  // Also include embedded patient.medications
  const embeddedMeds = (patient.medications || []).filter(
    (m) => m.is_active !== false,
  );

  // Merge (external first, dedup by name)
  const seenNames = new Set();
  const allMeds = [];
  for (const m of externalMeds) {
    if (m.name && !seenNames.has(m.name.toLowerCase())) {
      seenNames.add(m.name.toLowerCase());
      allMeds.push({
        name: m.name,
        dosage: m.dosage,
        freq: m.frequency,
        times: m.times || m.scheduledTimes,
      });
    }
  }
  for (const m of embeddedMeds) {
    if (m.name && !seenNames.has(m.name.toLowerCase())) {
      seenNames.add(m.name.toLowerCase());
      allMeds.push({
        name: m.name,
        dosage: m.dosage,
        freq: "daily",
        times: m.times,
      });
    }
  }

  // 3. Adherence (Last 7 Days)
  const sevenDaysLogs = await MedicineLog.find({
    patient_id: patient._id,
    date: { $gte: sevenDaysAgoDate },
  }).sort({ date: -1 });

  const logs = sevenDaysLogs.filter(
    (log) => new Date(log.date) >= threeDaysAgoDate,
  );

  let takenMeds = 0;
  let totalMeds = 0;
  logs.forEach((log) => {
    const activeMeds = log.medicines.filter((m) => m.is_active !== false);
    totalMeds += activeMeds.length;
    takenMeds += activeMeds.filter((m) => m.taken).length;
  });
  const missedMeds = totalMeds - takenMeds;

  // 3b. Today's session state — individual med status + last log time
  const todayDate = new Date(`${todayStr}T00:00:00.000Z`);
  const todayLog = await MedicineLog.findOne({
    patient_id: patient._id,
    date: todayDate,
  });
  let todayStatus = null;
  if (todayLog) {
    const activeTodayMeds = todayLog.medicines.filter(
      (m) => m.is_active !== false,
    );
    const todayTaken = activeTodayMeds.filter((m) => m.taken).length;
    const todayTotal = activeTodayMeds.length;
    const lastTakenEntry = activeTodayMeds
      .filter((m) => m.taken && m.taken_at)
      .sort((a, b) => new Date(b.taken_at) - new Date(a.taken_at))[0];

    todayStatus = {
      total_scheduled: todayTotal,
      taken: todayTaken,
      missed: todayTotal - todayTaken,
      rate:
        todayTotal > 0
          ? Math.round((todayTaken / todayTotal) * 100) + "%"
          : "N/A",
      all_done: todayTotal > 0 && todayTaken === todayTotal,
      last_log_time: lastTakenEntry
        ? moment(lastTakenEntry.taken_at).tz(tz).format("h:mm A")
        : null,
      medicines: activeTodayMeds.map((m) => ({
        name: m.medicine_name,
        time_slot: m.scheduled_time,
        taken: m.taken,
      })),
    };
  }

  // 4. Vitals (7-Day Aggregate)
  const vitals = await VitalLog.find({
    patient_id: patient._id,
    date: { $gte: sevenDaysAgoDate },
  }).select(
    "heart_rate blood_pressure oxygen_saturation hydration date createdAt",
  );

  // Compute Proactive Insights
  const proactive_insights = [];

  // Check rising blood pressure trend
  if (vitals.length >= 3) {
    const sortedVitals = [...vitals].sort(
      (a, b) =>
        new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt),
    );
    const sysVals = sortedVitals
      .map((v) => v.blood_pressure?.systolic)
      .filter(Boolean);
    if (sysVals.length >= 3) {
      const last = sysVals[sysVals.length - 1];
      const prev1 = sysVals[sysVals.length - 2];
      const prev2 = sysVals[sysVals.length - 3];
      if (last > prev1 && prev1 > prev2) {
        proactive_insights.push({
          type: "blood_pressure_trend",
          priority: "medium",
          message:
            "I noticed your blood pressure has increased slightly over the last three readings.",
        });
      }
    }
  }

  // Check missed medications pattern (morning/evening) in last 7 days
  let missedMorningCount = 0;
  let missedEveningCount = 0;
  sevenDaysLogs.forEach((log) => {
    if (log.medicines) {
      log.medicines.forEach((m) => {
        if (!m.taken && m.is_active !== false) {
          const slot = (m.scheduled_time || "").toLowerCase();
          if (
            slot.includes("am") ||
            slot.includes("morning") ||
            slot.includes("8:") ||
            slot.includes("9:")
          ) {
            missedMorningCount++;
          } else if (
            slot.includes("pm") ||
            slot.includes("evening") ||
            slot.includes("night") ||
            slot.includes("20:") ||
            slot.includes("21:")
          ) {
            missedEveningCount++;
          }
        }
      });
    }
  });

  if (missedMorningCount >= 2) {
    proactive_insights.push({
      type: "missed_meds_morning",
      priority: "medium",
      message:
        "You missed your morning medication twice this week. Need help setting stronger reminders?",
    });
  }
  if (missedEveningCount >= 2) {
    proactive_insights.push({
      type: "missed_meds_evening",
      priority: "medium",
      message:
        "You missed your evening medication twice this week. Need help setting stronger reminders?",
    });
  }

  let vitalsSummary = "No vitals logged in last 7 days";
  if (vitals.length > 0) {
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    const hrs = vitals.map((v) => v.heart_rate).filter(Boolean);
    const sys = vitals.map((v) => v.blood_pressure?.systolic).filter(Boolean);
    const dia = vitals.map((v) => v.blood_pressure?.diastolic).filter(Boolean);
    const ox = vitals.map((v) => v.oxygen_saturation).filter(Boolean);

    vitalsSummary = {
      days_logged: vitals.length,
      heart_rate: hrs.length
        ? {
            min: Math.min(...hrs),
            max: Math.max(...hrs),
            avg: Math.round(sum(hrs) / hrs.length),
          }
        : null,
      blood_pressure: sys.length
        ? {
            sys_avg: Math.round(sum(sys) / sys.length),
            dia_avg: Math.round(sum(dia) / dia.length),
          }
        : null,
      spo2_avg: ox.length ? Math.round(sum(ox) / ox.length) : null,
    };
  }

  // 5. Streak
  const currentStreak = patient.gamification?.current_streak || 0;
  const longestStreak = patient.gamification?.longest_streak || 0;

  // 6. Care Coordinator & Recent Interactions
  let careTeam = null;
  let recentCall = null;

  if (patient.assigned_manager_id) {
    const manager = await Profile.findById(patient.assigned_manager_id).select(
      "name role",
    );
    if (manager) {
      careTeam = {
        assigned_caller: manager.name,
        role: manager.role,
      };

      const lastCall = await CallLog.findOne({
        patient_id: patient._id,
        manager_id: manager._id,
      })
        .sort({ started_at: -1 })
        .select("status started_at call_duration_seconds");

      if (lastCall) {
        recentCall = {
          date: moment(lastCall.started_at).tz(tz).format("MMM D, h:mm A"),
          status: lastCall.status,
          duration_seconds: lastCall.call_duration_seconds,
        };
      }
    }
  }

  const { getCachedHealthState } = require("./patientHealthStateService");
  let healthState = await getCachedHealthState(patient);

  // 7. Build final payload
  const payload = {
    patient: {
      name: patient.name,
      age: patient.date_of_birth
        ? moment().diff(patient.date_of_birth, "years")
        : "Unknown",
      gender: patient.gender,
      blood_type: profile?.blood_type,
      diet: profile?.dietary_restrictions,
    },
    patient_health_state: healthState,
    care_team: careTeam,
    latest_interaction: recentCall,
    today: todayStr,
    current_time: now.format("h:mm A"),
    streak: {
      current: currentStreak,
      longest: longestStreak,
      label:
        currentStreak >= 14
          ? "Strong"
          : currentStreak >= 7
            ? "Building"
            : currentStreak >= 3
              ? "Starting"
              : "New",
    },
    today_status: todayStatus,
    medical_history: (profile?.medical_history || [])
      .map((h) => h.event)
      .slice(0, 5), // Top 5
    vaccinations: (profile?.vaccinations || []).map((v) => v.name),
    medications: allMeds,
    recent_adherence: {
      period: "Last 3 days",
      total_scheduled: totalMeds,
      taken: takenMeds,
      missed: missedMeds,
      rate:
        totalMeds > 0 ? Math.round((takenMeds / totalMeds) * 100) + "%" : "N/A",
    },
    recent_vitals: vitalsSummary,
    proactive_insights: proactive_insights,
  };

  return payload;
}

module.exports = { buildPatientContext };
