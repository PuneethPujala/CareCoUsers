const axios = require('axios');
const VitalLog = require('../models/VitalLog');
const AIVitalPrediction = require('../models/AIVitalPrediction');
const Notification = require('../models/Notification');
const Patient = require('../models/Patient');
const Caller = require('../models/Caller');
const PushNotificationService = require('../utils/pushNotifications');

const AI_VITALS_URL = process.env.AI_VITALS_URL || 'http://localhost:8000';
const AI_REQUEST_TIMEOUT_MS = 30000; // 30s timeout for AI service calls

class AIPredictionService {
  /**
   * Fetch historical vitals, query AI service, and handle streak logic.
   * @param {string} patientId 
   */
  static async processPatientPrediction(patientId) {
    try {
      // 1. Fetch historical data (up to last 14 days, minimum 7 days)
      const date14DaysAgo = new Date();
      date14DaysAgo.setDate(date14DaysAgo.getDate() - 14);

      const vitals = await VitalLog.find({ 
        patient_id: patientId, 
        date: { $gte: date14DaysAgo } 
      }).sort({ date: 1 }).lean();

      if (vitals.length < 7) {
        // Not enough data, skip silently
        return { success: false, message: 'Not enough historical data' };
      }

      // 2. Format payload
      const historicalData = vitals.map(v => ({
        date: v.date.toISOString(),
        heart_rate: v.heart_rate,
        blood_pressure: {
          systolic: v.blood_pressure.systolic,
          diastolic: v.blood_pressure.diastolic
        },
        oxygen_saturation: v.oxygen_saturation,
        hydration: v.hydration
      }));

      // 3. Query AI Microservice with timeout
      const response = await axios.post(`${AI_VITALS_URL}/api/predict-vitals`, {
        patient_id: patientId.toString(),
        historical_data: historicalData,
        horizon_days: 3
      }, {
        timeout: AI_REQUEST_TIMEOUT_MS,
      });

      const { health_label, predictions } = response.data;

      // 4. Update Database & Handle Streak Logic
      let predictionDoc = await AIVitalPrediction.findOne({ patient_id: patientId });

      if (!predictionDoc) {
        predictionDoc = new AIVitalPrediction({ patient_id: patientId });
      }

      const currentStreak = this.calculateStreak(predictionDoc, health_label);

      // Update doc
      predictionDoc.health_label = health_label;
      predictionDoc.predictions = predictions;
      predictionDoc.consecutive_critical_days = currentStreak;
      predictionDoc.updated_at = new Date();

      await predictionDoc.save();

      // 5. Evaluate Push Notification Rules
      const shouldNotify = this.shouldSendAlert(currentStreak, health_label);

      if (shouldNotify) {
        await this.triggerCriticalPushAlert(patientId, predictionDoc);
      }

      return { success: true, health_label, currentStreak, notified: shouldNotify };

    } catch (error) {
      console.error(`AI Prediction Error for Patient ${patientId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate the consecutive critical days streak.
   * @param {object} existingDoc - The existing AIVitalPrediction document
   * @param {string} newLabel - The new health label from the AI service
   * @returns {number} The updated streak count
   */
  static calculateStreak(existingDoc, newLabel) {
    const previousStreak = existingDoc?.consecutive_critical_days || 0;

    if (newLabel === 'Critical') {
      return previousStreak + 1;
    }
    return 0; // Reset streak on any non-critical label
  }

  /**
   * Determine if a push notification should be sent based on the streak.
   * 
   * Alert Matrix:
   *   Day 1 Critical → NO push (streak=1)
   *   Day 2 Critical → YES push (streak=2) — first alert
   *   Day 3 Critical → NO push (streak=3)
   *   Day 4 Critical → YES push (streak=4) — re-alert
   *   Day 5 Critical → NO push (streak=5)
   *   Day 6 Critical → NO push (streak=6)
   *   Day 7 Critical → YES push (streak=7) — re-alert (3-day gap from Day 4)
   *   Day 10 Critical → YES push (streak=10)
   *   Any non-Critical → streak resets to 0, NO push
   * 
   * @param {number} streak - Current consecutive critical days
   * @param {string} healthLabel - Current health label
   * @returns {boolean}
   */
  static shouldSendAlert(streak, healthLabel) {
    if (healthLabel !== 'Critical') return false;
    if (streak < 1) return false;

    // Day 2: first alert
    if (streak === 2) return true;

    // Day 4: second alert (2-day gap from first)
    if (streak === 4) return true;

    // Day 7, 10, 13, ... : re-alert every 3 days starting from Day 4
    if (streak > 4 && (streak - 4) % 3 === 0) return true;

    return false;
  }

  /**
   * Trigger a critical push alert for a patient and their assigned caller.
   * Creates a persistent Notification record AND sends an Expo push notification.
   * @param {string} patientId 
   * @param {object} predictionDoc - The saved AIVitalPrediction document
   */
  static async triggerCriticalPushAlert(patientId, predictionDoc) {
    try {
      const patient = await Patient.findById(patientId);
      if (!patient) return;

      const latestPrediction = predictionDoc.predictions?.[0];
      const alertMessage = `Your predicted vitals are trending towards critical levels. Please review your health dashboard.`;

      // 1. Create persistent notification in DB for the patient
      await Notification.create({
        patient_id: patient._id,
        title: '⚠️ Critical Vital Trend Detected',
        message: alertMessage,
        type: 'alert',
        target_screen: 'VitalsScreen',
      });

      // 2. Send Expo push notification to the patient
      await PushNotificationService.sendCriticalVitalAlert(patient, predictionDoc);

      // 3. Alert the assigned caller if one exists
      if (patient.assigned_caller_id) {
        try {
          const caller = await Caller.findById(patient.assigned_caller_id);
          if (caller) {
            await PushNotificationService.sendCallerCriticalAlert(caller, patient, predictionDoc);
          }
        } catch (callerErr) {
          console.warn('⚠️ Could not notify caller:', callerErr.message);
        }
      }

      console.log(`🚨 Critical alert sent for patient ${patient.name} (streak: ${predictionDoc.consecutive_critical_days})`);
    } catch (error) {
      console.error('❌ Error triggering critical push alert:', error.message);
    }
  }
}

module.exports = AIPredictionService;
