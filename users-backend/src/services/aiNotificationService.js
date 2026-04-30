/**
 * aiNotificationService.js
 * 
 * Orchestrator for the AI Health Companion. 
 * Evaluates frequency limits, grabs content, generates DB records, and dispatches to Expo.
 */

const Patient = require('../models/Patient');
const Notification = require('../models/Notification');
const NotificationService = require('./NotificationService');
const { generateMessage } = require('./notificationContentEngine');
const moment = require('moment-timezone');

/**
 * Checks if the patient is eligible for a notification right now based on frequency limits.
 * @param {object} patient
 * @returns {boolean}
 */
async function isEligibleForNotification(patient) {
    if (!patient.push_notifications_enabled) return false;

    // Daily limit check
    const limits = patient.notification_limits || { max_daily: 3 };
    
    // Check if last_notification_date was today (in patient's timezone or UTC)
    const tz = patient.timezone || 'UTC';
    const nowLocal = moment().tz(tz);
    
    // Reset daily counter if a new day has started
    if (patient.last_notification_date) {
        const lastNotifLocal = moment(patient.last_notification_date).tz(tz);
        if (nowLocal.date() !== lastNotifLocal.date() || nowLocal.month() !== lastNotifLocal.month()) {
            patient.daily_notifications_sent = 0;
        }
    }

    if (patient.daily_notifications_sent >= limits.max_daily) {
        return false;
    }

    return true;
}

/**
 * Generates and triggers a notification for a specific event
 * @param {string} trigger - e.g. 'energy_dip'
 * @param {object} patient - Patient document
 * @param {string} category - e.g. 'health_tips' (matches Notification schema enum)
 * @param {object} customVars - e.g. { streak: 3 }
 * @param {boolean} force - Send even if over daily limit (for critical alerts)
 */
async function triggerAiNotification(trigger, patient, category = 'health_tips', customVars = {}, force = false) {
    
    if (!force) {
        const eligible = await isEligibleForNotification(patient);
        if (!eligible) {
            console.log(`[AI-Notification] Suppressed ${trigger} for ${patient.email} (Limit reached or disabled)`);
            return null;
        }
    }

    const messageBody = generateMessage(trigger, patient, customVars);
    if (!messageBody) {
        return null; // Empty message = suppress
    }

    // Determine target screen based on category
    let targetScreen = 'HomeScreen';
    if (category === 'mental_wellness') targetScreen = 'WellnessScreen';
    if (category === 'activity') targetScreen = 'ActivityScreen';

    // 1. Create permanent In-App record
    const notificationDoc = await Notification.create({
        patient_id: patient._id,
        type: category,
        title: 'CareMyMed Companion', // Title could also be dynamic later
        message: messageBody,
        target_screen: targetScreen,
        push_delivered: false,
        ai_context: {
            trigger: trigger,
        }
    });

    // 2. Dispatch Push
    const pushDelivered = await NotificationService.sendPush(patient._id, {
        title: 'CareCo Companion 🤖',
        body: messageBody,
        data: { screen: targetScreen, notification_id: notificationDoc._id.toString() },
    });

    if (pushDelivered) {
        notificationDoc.push_delivered = true;
        await notificationDoc.save();
    }

    // 3. Update Frequency Limits
    patient.daily_notifications_sent = (patient.daily_notifications_sent || 0) + 1;
    patient.last_notification_date = new Date();
    await patient.save();

    console.log(`[AI-Notification] Sent "${trigger}" to ${patient.email}`);
    
    return notificationDoc;
}

module.exports = {
    triggerAiNotification,
    isEligibleForNotification
};
