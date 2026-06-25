const moment = require("moment-timezone");
const MedicineLog = require("../models/MedicineLog");
const VitalLog = require("../models/VitalLog");

/**
 * Check if a medication was active on a given date string (YYYY-MM-DD) in patient's timezone.
 */
function isMedicationActiveOnDate(med, dateStr, timezone) {
  // If the medication has a start date, parse it. Default to when it was created/created_at.
  const start = med.startDate || med.createdAt || med.created_at;
  const medStartStr = start
    ? moment(start).tz(timezone).format("YYYY-MM-DD")
    : null;
  if (medStartStr && dateStr < medStartStr) {
    return false;
  }

  // Check end date or discontinued date
  const end = med.endDate || med.discontinuedAt;
  if (end) {
    const medEndStr = moment(end).tz(timezone).format("YYYY-MM-DD");
    if (dateStr > medEndStr) {
      return false;
    }
  }

  // If currently inactive but no explicit end date, check updatedAt to estimate when it was deactivated
  if ((med.isActive === false || med.is_active === false) && !end) {
    const updateTime = med.updatedAt || med.updated_at;
    if (updateTime) {
      const medEndStr = moment(updateTime).tz(timezone).format("YYYY-MM-DD");
      if (dateStr > medEndStr) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Builds the gap-filled timeline from startDateStr to endDateStr (inclusive).
 * Past days with no database logs are dynamically filled as missed/no_medications.
 * Today is NOT backfilled and remains pending.
 */
async function buildDailyAdherenceTimeline(patient, startDateStr, endDateStr) {
  const timezone = patient.timezone || "Asia/Kolkata";
  const { buildMergedMeds } = require("../routes/users/medicines");

  const startDate = new Date(`${startDateStr}T00:00:00.000Z`);
  const endDate = new Date(`${endDateStr}T23:59:59.999Z`);

  // Fetch database logs and vitals
  const [logs, vitals, allMedsRaw] = await Promise.all([
    MedicineLog.find({
      patient_id: patient._id,
      date: { $gte: startDate, $lte: new Date(`${endDateStr}T00:00:00.000Z`) },
    }).sort({ date: 1 }),
    VitalLog.find({
      patient_id: patient._id,
      date: { $gte: startDate, $lte: endDate },
    }).sort({ date: 1 }),
    buildMergedMeds(patient),
  ]);

  const vitalsMap = {};
  for (const v of vitals) {
    const dateStr = v.date.toISOString().slice(0, 10);
    vitalsMap[dateStr] = v;
  }

  // Map existing database logs
  const dailyLog = logs.map((log) => {
    const dateStr = log.date.toISOString().slice(0, 10);
    const activeMeds = log.medicines.filter((m) => m.is_active !== false);
    const total = activeMeds.length;
    const taken = activeMeds.filter((m) => m.taken).length;
    const rate = total > 0 ? Math.round((taken / total) * 100) : 0;

    let status = "no_medications";
    if (total > 0) {
      if (rate === 100) status = "complete";
      else if (rate > 0) status = "partial";
      else status = "missed";
    }
    return {
      date: dateStr,
      taken,
      total,
      rate,
      status,
      medicines: activeMeds.map((m) => ({
        name: m.medicine_name,
        medicine_name: m.medicine_name,
        taken: m.taken,
        time: m.scheduled_time,
        scheduled_time: m.scheduled_time,
        is_active: m.is_active !== false,
      })),
      vitals: vitalsMap[dateStr]
        ? {
            heart_rate: vitalsMap[dateStr].heart_rate,
            systolic: vitalsMap[dateStr].blood_pressure?.systolic,
            diastolic: vitalsMap[dateStr].blood_pressure?.diastolic,
            oxygen_saturation: vitalsMap[dateStr].oxygen_saturation,
            hydration: vitalsMap[dateStr].hydration,
          }
        : null,
    };
  });

  const dailyLogMap = new Map();
  dailyLog.forEach((item) => {
    dailyLogMap.set(item.date, item);
  });

  // Determine boundaries for backfilling
  const createdDate = patient.created_at || patient.createdAt || new Date();
  const createdDateStr = moment(createdDate).tz(timezone).format("YYYY-MM-DD");

  // Gap fill only up to yesterday
  const todayStr = moment().tz(timezone).format("YYYY-MM-DD");
  const yesterdayStr = moment()
    .tz(timezone)
    .subtract(1, "days")
    .format("YYYY-MM-DD");

  // Iterate through the requested date range
  const cursor = moment(startDateStr, "YYYY-MM-DD");
  const limit = moment(endDateStr, "YYYY-MM-DD");

  while (!cursor.isAfter(limit)) {
    const dateStr = cursor.format("YYYY-MM-DD");

    if (!dailyLogMap.has(dateStr)) {
      // We only backfill if:
      // 1. The date is a past date (<= yesterdayStr)
      // 2. The date is >= patient's creation date (we don't penalize before joining)
      if (dateStr <= yesterdayStr && dateStr >= createdDateStr) {
        // Determine active medications scheduled on this specific date
        const activeMedsOnDate = allMedsRaw.filter((med) =>
          isMedicationActiveOnDate(med, dateStr, timezone),
        );

        const simulatedMedicines = [];
        for (const med of activeMedsOnDate) {
          for (const time of med.times) {
            simulatedMedicines.push({
              name: med.name,
              medicine_name: med.name,
              taken: false,
              time: time,
              scheduled_time: time,
              is_active: true,
            });
          }
        }

        const total = simulatedMedicines.length;
        let status = "no_medications";
        if (total > 0) {
          status = "missed";
        }

        dailyLogMap.set(dateStr, {
          date: dateStr,
          taken: 0,
          total: total,
          rate: 0,
          status: status,
          medicines: simulatedMedicines,
          vitals: vitalsMap[dateStr]
            ? {
                heart_rate: vitalsMap[dateStr].heart_rate,
                systolic: vitalsMap[dateStr].blood_pressure?.systolic,
                diastolic: vitalsMap[dateStr].blood_pressure?.diastolic,
                oxygen_saturation: vitalsMap[dateStr].oxygen_saturation,
                hydration: vitalsMap[dateStr].hydration,
              }
            : null,
        });
      } else {
        // Future dates or dates before account creation have no data
        dailyLogMap.set(dateStr, {
          date: dateStr,
          taken: 0,
          total: 0,
          rate: 0,
          status: "no_medications",
          medicines: [],
          vitals: vitalsMap[dateStr]
            ? {
                heart_rate: vitalsMap[dateStr].heart_rate,
                systolic: vitalsMap[dateStr].blood_pressure?.systolic,
                diastolic: vitalsMap[dateStr].blood_pressure?.diastolic,
                oxygen_saturation: vitalsMap[dateStr].oxygen_saturation,
                hydration: vitalsMap[dateStr].hydration,
              }
            : null,
        });
      }
    }

    cursor.add(1, "day");
  }

  // Return the sorted final timeline
  return Array.from(dailyLogMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

module.exports = {
  buildDailyAdherenceTimeline,
  isMedicationActiveOnDate,
};
