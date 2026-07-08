const ActivityLog = require("../models/ActivityLog");

class ActivityIngestionService {
  /**
   * Process daily activity data.
   * Upserts the ActivityLog entry for a patient on a given date.
   *
   * @param {string} patientId
   * @param {object} activityData - { date, steps, distance_meters, active_calories, total_calories, floors_climbed, vo2_max, exercises: [...] }
   * @param {string} source - 'health_connect' | 'healthkit'
   * @returns {Promise<object>} - Summary of ingestion
   */
  static async processDaily(patientId, activityData, source) {
    if (!activityData || !activityData.date) {
      return { accepted: false, reason: "Missing activity data or date" };
    }

    const date = new Date(activityData.date);
    if (isNaN(date.getTime())) {
      return { accepted: false, reason: "Invalid date" };
    }

    // Normalize date to start of day (midnight) to allow single document per patient per day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    // Build update query
    const update = {
      source,
    };

    if (activityData.steps != null) {
      const steps = Number(activityData.steps);
      if (steps >= 0) update.steps = steps;
    }

    if (activityData.distance_meters != null) {
      const dist = Number(activityData.distance_meters);
      if (dist >= 0) update.distance_meters = dist;
    }

    if (activityData.active_calories != null) {
      const cals = Number(activityData.active_calories);
      if (cals >= 0) update.active_calories = cals;
    }

    if (activityData.total_calories != null) {
      const totCals = Number(activityData.total_calories);
      if (totCals >= 0) update.total_calories = totCals;
    }

    if (activityData.floors_climbed != null) {
      const floors = Number(activityData.floors_climbed);
      if (floors >= 0) update.floors_climbed = floors;
    }

    if (activityData.vo2_max != null) {
      const vo2 = Number(activityData.vo2_max);
      if (vo2 >= 0 && vo2 <= 100) update.vo2_max = vo2;
    }

    // Add exercises if present.
    // Avoid duplicates by checking existing exercise source_ids.
    let addedExercisesCount = 0;
    if (activityData.exercises && Array.isArray(activityData.exercises)) {
      const validExercises = activityData.exercises.filter((e) => e.type);

      if (validExercises.length > 0) {
        // Find existing doc
        const existing = await ActivityLog.findOne({
          patient_id: patientId,
          date: startOfDay,
        });
        const existingSourceIds = existing
          ? existing.exercises.map((e) => e.source_id).filter(Boolean)
          : [];

        const newExercises = validExercises.filter(
          (e) => !e.source_id || !existingSourceIds.includes(e.source_id)
        );

        if (newExercises.length > 0) {
          update.$addToSet = {
            exercises: {
              $each: newExercises.map((e) => ({
                type: e.type,
                start_time: e.start_time ? new Date(e.start_time) : undefined,
                end_time: e.end_time ? new Date(e.end_time) : undefined,
                duration_minutes:
                  e.duration_minutes != null
                    ? Number(e.duration_minutes)
                    : undefined,
                calories: e.calories != null ? Number(e.calories) : undefined,
                distance_meters:
                  e.distance_meters != null
                    ? Number(e.distance_meters)
                    : undefined,
                avg_heart_rate:
                  e.avg_heart_rate != null ? Number(e.avg_heart_rate) : undefined,
                source_id: e.source_id,
              })),
            },
          };
          addedExercisesCount = newExercises.length;
        }
      }
    }

    if (activityData.metadata) {
      update.metadata = {
        device_name: activityData.metadata.device_name,
        device_manufacturer: activityData.metadata.device_manufacturer,
        device_model: activityData.metadata.device_model,
        record_id: activityData.metadata.record_id,
        last_modified: activityData.metadata.last_modified
          ? new Date(activityData.metadata.last_modified)
          : undefined,
        timezone: activityData.metadata.timezone,
        recorded_at: activityData.metadata.recorded_at
          ? new Date(activityData.metadata.recorded_at)
          : undefined,
      };
    }

    await ActivityLog.findOneAndUpdate(
      { patient_id: patientId, date: startOfDay },
      update,
      { upsert: true, new: true, runValidators: true }
    );

    return {
      accepted: true,
      date: startOfDay,
      added_exercises: addedExercisesCount,
    };
  }
}

module.exports = ActivityIngestionService;
