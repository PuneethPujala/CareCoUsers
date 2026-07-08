const BodyCompositionLog = require("../models/BodyCompositionLog");
const Patient = require("../models/Patient");

class BodyCompositionService {
  /**
   * Process a body composition snapshot (weight, height, body fat).
   * Calculates BMI and updates/caches values to the Patient's profile if it's the latest measurement.
   *
   * @param {string} patientId
   * @param {object} data - { date, weight_kg, height_cm, body_fat_pct }
   * @param {string} source - 'health_connect' | 'healthkit'
   * @returns {Promise<object>}
   */
  static async processSnapshot(patientId, data, source) {
    if (!data || !data.date) {
      return { accepted: false, reason: "Missing body composition data or date" };
    }

    const date = new Date(data.date);
    if (isNaN(date.getTime())) {
      return { accepted: false, reason: "Invalid date" };
    }

    // Normalize date to day level for single daily composition snapshot
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const doc = {
      patient_id: patientId,
      date: startOfDay,
      source,
    };

    let weight = data.weight_kg != null ? Number(data.weight_kg) : null;
    let height = data.height_cm != null ? Number(data.height_cm) : null;

    // If one is missing from data, try to retrieve the other from the patient profile to compute BMI
    if (weight && !height) {
      const patient = await Patient.findById(patientId).select("height_cm");
      if (patient?.height_cm) {
        height = patient.height_cm;
      }
    } else if (!weight && height) {
      const patient = await Patient.findById(patientId).select("weight_kg");
      if (patient?.weight_kg) {
        weight = patient.weight_kg;
      }
    }

    if (weight != null && weight >= 10 && weight <= 500) doc.weight_kg = weight;
    if (height != null && height >= 30 && height <= 300) doc.height_cm = height;

    if (data.body_fat_pct != null) {
      const bf = Number(data.body_fat_pct);
      if (bf >= 1 && bf <= 70) doc.body_fat_pct = bf;
    }

    // Compute BMI: BMI = weight (kg) / (height (m) ^ 2)
    if (doc.weight_kg && doc.height_cm) {
      const heightInMeters = doc.height_cm / 100;
      if (heightInMeters > 0) {
        doc.bmi =
          Math.round((doc.weight_kg / (heightInMeters * heightInMeters)) * 10) /
          10;
      }
    }

    if (data.metadata) {
      doc.metadata = {
        device_name: data.metadata.device_name,
        device_manufacturer: data.metadata.device_manufacturer,
        device_model: data.metadata.device_model,
        record_id: data.metadata.record_id,
        last_modified: data.metadata.last_modified
          ? new Date(data.metadata.last_modified)
          : undefined,
        timezone: data.metadata.timezone,
        recorded_at: data.metadata.recorded_at
          ? new Date(data.metadata.recorded_at)
          : undefined,
      };
    }

    // Upsert composition log
    const savedLog = await BodyCompositionLog.findOneAndUpdate(
      { patient_id: patientId, date: startOfDay },
      doc,
      { upsert: true, new: true, runValidators: true }
    );

    // Cache to Patient profile if this log's date is newer than or equal to the latest measurement
    const latestLog = await BodyCompositionLog.findOne({ patient_id: patientId })
      .sort({ date: -1 })
      .select("date weight_kg height_cm")
      .lean();

    if (latestLog && savedLog.date.getTime() >= latestLog.date.getTime()) {
      const patientUpdate = {};
      if (savedLog.weight_kg != null) patientUpdate.weight_kg = savedLog.weight_kg;
      if (savedLog.height_cm != null) patientUpdate.height_cm = savedLog.height_cm;

      if (Object.keys(patientUpdate).length > 0) {
        await Patient.findByIdAndUpdate(patientId, patientUpdate);
      }
    }

    return { accepted: true, log: savedLog };
  }
}

module.exports = BodyCompositionService;
