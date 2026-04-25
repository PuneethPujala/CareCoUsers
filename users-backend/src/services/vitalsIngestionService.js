const VitalLog = require('../models/VitalLog');
const Notification = require('../models/Notification');
const Patient = require('../models/Patient');
const PushNotificationService = require('../utils/pushNotifications');

// ─── Clinical danger thresholds ─────────────────────────────────
// These trigger IMMEDIATE alerts, even before the AI layer kicks in.
const DANGER_THRESHOLDS = {
    heart_rate: { min: 45, max: 180 },
    oxygen_saturation: { min: 88, max: 100 },
    systolic: { min: 70, max: 200 },
    diastolic: { min: 40, max: 130 },
};

class VitalsIngestionService {
    /**
     * Process a batch of vitals readings from a wearable device.
     * Handles deduplication, validation, anomaly detection, and AI queue triggering.
     * 
     * @param {string} patientId - The patient's MongoDB ObjectId
     * @param {Array<object>} readings - Array of vital readings from the device
     * @param {string} source - 'health_connect' | 'healthkit'
     * @returns {object} - Summary of the sync operation
     */
    static async processBatch(patientId, readings, source) {
        const summary = {
            received: readings.length,
            accepted: 0,
            duplicates: 0,
            invalid: 0,
            anomalies: [],
        };

        const validDocs = [];

        for (const reading of readings) {
            // ── Validate required fields ──────────────────────────
            if (!reading.timestamp || !reading.heart_rate) {
                summary.invalid++;
                continue;
            }

            const rawTimestamp = new Date(reading.timestamp);
            if (isNaN(rawTimestamp.getTime())) {
                summary.invalid++;
                continue;
            }

            // Range-check heart_rate
            const hr = Number(reading.heart_rate);
            if (hr < 30 || hr > 250) {
                summary.invalid++;
                continue;
            }

            // ── Build the document ────────────────────────────────
            const doc = {
                patient_id: patientId,
                date: rawTimestamp,
                raw_timestamp: rawTimestamp,
                heart_rate: hr,
                source,
            };

            // Optional fields from device
            if (reading.oxygen_saturation != null) {
                const o2 = Number(reading.oxygen_saturation);
                if (o2 >= 0 && o2 <= 100) doc.oxygen_saturation = o2;
            }

            if (reading.blood_pressure?.systolic != null && reading.blood_pressure?.diastolic != null) {
                const sys = Number(reading.blood_pressure.systolic);
                const dia = Number(reading.blood_pressure.diastolic);
                if (sys >= 60 && sys <= 250 && dia >= 40 && dia <= 150) {
                    doc.blood_pressure = { systolic: sys, diastolic: dia };
                }
            }

            // ── Anomaly detection ─────────────────────────────────
            const anomaly = this._detectAnomaly(doc);
            if (anomaly) {
                summary.anomalies.push({
                    timestamp: rawTimestamp.toISOString(),
                    ...anomaly,
                });
            }

            validDocs.push(doc);
        }

        if (validDocs.length === 0) {
            return summary;
        }

        // ── Bulk insert with ordered:false to skip duplicates ─────
        try {
            const result = await VitalLog.insertMany(validDocs, {
                ordered: false,       // Continue inserting even if some fail
                rawResult: true,      // Get detailed result info
            });
            summary.accepted = result.insertedCount || validDocs.length;
        } catch (err) {
            if (err.code === 11000 || err.writeErrors) {
                // Partial success — some were duplicates
                const insertedCount = err.insertedDocs?.length || 0;
                const dupCount = (err.writeErrors || []).filter(e => e.err?.code === 11000).length;
                summary.accepted = validDocs.length - dupCount;
                summary.duplicates = dupCount;
            } else {
                throw err; // Re-throw non-duplicate errors
            }
        }

        // ── Trigger anomaly alerts ────────────────────────────────
        if (summary.anomalies.length > 0) {
            // Fire-and-forget — don't block the sync response
            this._triggerAnomalyAlerts(patientId, summary.anomalies).catch(err => {
                console.error('❌ Failed to trigger anomaly alerts:', err.message);
            });
        }

        // ── Trigger AI prediction queue if enough data ────────────
        if (summary.accepted > 0) {
            this._maybeQueueAIPrediction(patientId).catch(err => {
                console.error('❌ Failed to queue AI prediction:', err.message);
            });
        }

        return summary;
    }

    /**
     * Detect if a single reading crosses clinical danger thresholds.
     * @param {object} doc - The vital log document
     * @returns {object|null} - Anomaly details, or null if within range
     */
    static _detectAnomaly(doc) {
        const alerts = [];

        if (doc.heart_rate < DANGER_THRESHOLDS.heart_rate.min) {
            alerts.push(`Heart rate critically low: ${doc.heart_rate} bpm`);
        }
        if (doc.heart_rate > DANGER_THRESHOLDS.heart_rate.max) {
            alerts.push(`Heart rate critically high: ${doc.heart_rate} bpm`);
        }

        if (doc.oxygen_saturation != null && doc.oxygen_saturation < DANGER_THRESHOLDS.oxygen_saturation.min) {
            alerts.push(`SpO₂ critically low: ${doc.oxygen_saturation}%`);
        }

        if (doc.blood_pressure?.systolic != null) {
            if (doc.blood_pressure.systolic > DANGER_THRESHOLDS.systolic.max) {
                alerts.push(`Systolic BP critically high: ${doc.blood_pressure.systolic} mmHg`);
            }
            if (doc.blood_pressure.systolic < DANGER_THRESHOLDS.systolic.min) {
                alerts.push(`Systolic BP critically low: ${doc.blood_pressure.systolic} mmHg`);
            }
        }

        if (alerts.length > 0) {
            return { level: 'critical', alerts };
        }
        return null;
    }

    /**
     * Send push notification + DB notification for anomalous readings.
     * @param {string} patientId
     * @param {Array<object>} anomalies
     */
    static async _triggerAnomalyAlerts(patientId, anomalies) {
        const patient = await Patient.findById(patientId);
        if (!patient) return;

        const alertMessages = anomalies.flatMap(a => a.alerts);
        const uniqueAlerts = [...new Set(alertMessages)];
        const message = uniqueAlerts.join('. ') + '.';

        // 1. Create persistent notification
        await Notification.create({
            patient_id: patient._id,
            title: '🚨 Abnormal Vital Sign Detected',
            message: `Your wearable detected concerning readings: ${message}`,
            type: 'alert',
            target_screen: 'VitalsScreen',
        });

        // 2. Send push notification
        await PushNotificationService.sendPush(
            patient.expo_push_token,
            '🚨 Abnormal Vital Sign Detected',
            `Concerning readings detected: ${uniqueAlerts[0]}${uniqueAlerts.length > 1 ? ` (+${uniqueAlerts.length - 1} more)` : ''}`,
            { screen: 'VitalsHistory', type: 'vital_anomaly' }
        );

        console.log(`🚨 Anomaly alert sent for patient ${patient.name}: ${message}`);
    }

    /**
     * Check if the patient has enough data for AI prediction and enqueue if so.
     * Uses dynamic import to avoid circular dependency with the queue module.
     * @param {string} patientId
     */
    static async _maybeQueueAIPrediction(patientId) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const count = await VitalLog.countDocuments({
            patient_id: patientId,
            date: { $gte: sevenDaysAgo },
        });

        if (count >= 7) {
            try {
                const { vitalsQueue } = require('../jobs/vitalsQueue');
                await vitalsQueue.add('predict', { patientId: patientId.toString() }, {
                    removeOnComplete: true,
                    removeOnFail: false,
                    attempts: 2,
                    backoff: { type: 'exponential', delay: 5000 },
                    // Deduplicate: don't queue the same patient twice in quick succession
                    jobId: `sync-predict-${patientId}-${new Date().toISOString().slice(0, 13)}`,
                });
                console.log(`🤖 AI prediction job enqueued for patient: ${patientId}`);
            } catch (err) {
                // Queue might not be running in dev — that's fine
                console.warn('⚠️ Could not enqueue AI prediction (queue may be offline):', err.message);
            }
        }
    }
}

module.exports = VitalsIngestionService;
