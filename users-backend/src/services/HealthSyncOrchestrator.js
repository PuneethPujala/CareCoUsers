const HealthSyncState = require("../models/HealthSyncState");
const VitalsIngestionService = require("./vitalsIngestionService");
const ActivityIngestionService = require("./ActivityIngestionService");
const BodyCompositionService = require("./BodyCompositionService");

class HealthSyncOrchestrator {
  /**
   * Orchestrates the parsing and ingestion of wearable health records from a single POST payload.
   *
   * @param {string} patientId
   * @param {object} payload - { vitals, activity, body, metadata }
   * @returns {Promise<object>} - Integration ingestion results summary
   */
  static async processSync(patientId, payload) {
    const { vitals, activity, body, metadata } = payload || {};
    const effectiveSource = payload.source || "health_connect";
    const platform =
      payload.platform ||
      (effectiveSource === "healthkit" ? "ios" : "android");

    const results = {
      vitals: null,
      activity: null,
      body: null,
    };

    let hasErrors = false;
    let errorMessage = "";

    try {
      // 1. Process Vitals (batch of point-in-time metrics)
      if (vitals && Array.isArray(vitals) && vitals.length > 0) {
        try {
          results.vitals = await VitalsIngestionService.processBatch(
            patientId,
            vitals,
            effectiveSource
          );
        } catch (err) {
          hasErrors = true;
          errorMessage += `Vitals: ${err.message}. `;
        }
      }

      // 2. Process Activity (daily aggregate and exercise sessions)
      if (activity && typeof activity === "object") {
        try {
          results.activity = await ActivityIngestionService.processDaily(
            patientId,
            activity,
            effectiveSource
          );
        } catch (err) {
          hasErrors = true;
          errorMessage += `Activity: ${err.message}. `;
        }
      }

      // 3. Process Body Composition (daily snapshots)
      if (body && typeof body === "object") {
        try {
          results.body = await BodyCompositionService.processSnapshot(
            patientId,
            body,
            effectiveSource
          );
        } catch (err) {
          hasErrors = true;
          errorMessage += `Body: ${err.message}. `;
        }
      }

      // 4. Update HealthSyncState
      const syncUpdate = {
        last_sync: new Date(),
        platform,
        health_provider: effectiveSource,
      };

      if (metadata) {
        if (metadata.device_id) syncUpdate.device_id = metadata.device_id;
        if (metadata.device_name) syncUpdate.device_name = metadata.device_name;
        if (
          metadata.permissions_granted &&
          Array.isArray(metadata.permissions_granted)
        ) {
          syncUpdate.permissions_granted = metadata.permissions_granted;
        }
      }

      if (hasErrors) {
        syncUpdate.last_error = errorMessage;
        syncUpdate.last_error_at = new Date();
      } else {
        syncUpdate.last_successful_sync = new Date();
        syncUpdate.$inc = { sync_count_today: 1 };
      }

      await HealthSyncState.findOneAndUpdate(
        { patient_id: patientId },
        syncUpdate,
        { upsert: true, new: true }
      );

      return {
        success: !hasErrors,
        results,
        error: hasErrors ? errorMessage : undefined,
      };
    } catch (e) {
      console.error("Orchestrator error:", e);
      try {
        await HealthSyncState.findOneAndUpdate(
          { patient_id: patientId },
          {
            last_sync: new Date(),
            last_error: e.message,
            last_error_at: new Date(),
          },
          { upsert: true }
        );
      } catch (err) {}
      throw e;
    }
  }
}

module.exports = HealthSyncOrchestrator;
