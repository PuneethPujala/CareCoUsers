/**
 * notificationJob.js
 * 
 * Cron job that calculates Context and Timing Intelligence 
 * to dispatch AI Health Companion nudges.
 */

const cron = require('node-cron');
const moment = require('moment-timezone');
const Patient = require('../models/Patient');
const { triggerAiNotification } = require('../services/aiNotificationService');

let jobInstance = null;

async function processPatients() {
    console.log('[AI-Notification] Running evaluation cycle...');
    
    // We only fetch active patients with push notifications enabled and a defined timezone
    const patients = await Patient.find({
        is_active: true,
        push_notifications_enabled: true,
    });

    for (const patient of patients) {
        try {
            const tz = patient.timezone || 'Asia/Kolkata'; // fallback
            const now = moment().tz(tz);
            const hour = now.hour();
            
            // Check Quiet Hours (08:00 - 21:00) default
            const limits = patient.notification_limits || {};
            const endHour = parseInt((limits.quiet_hours_end || '08:00').split(':')[0]);
            const startHour = parseInt((limits.quiet_hours_start || '21:00').split(':')[0]);
            
            if (hour < endHour || hour >= startHour) {
                // In quiet hours
                continue;
            }

            // --- TIMING INTELLIGENCE ENGINE ---

            // 1. Morning Nudge (08:00 - 10:00)
            if (hour >= 8 && hour < 10) {
                // Dispatch morning routine if not done today
                await triggerAiNotification('morning_nudge', patient, 'reminders');
            }
            
            // 2. Mid-morning Dip (10:00 - 12:00)
            else if (hour >= 10 && hour < 12) {
                await triggerAiNotification('energy_dip', patient, 'health_tips');
            }
            
            // 3. Lunch (12:00 - 14:00)
            else if (hour >= 12 && hour < 14) {
                await triggerAiNotification('lunch_nudge', patient, 'health_tips');
            }
            
            // 4. Evening Walk (16:00 - 19:00)
            else if (hour >= 16 && hour < 19) {
                await triggerAiNotification('weather_walk', patient, 'activity');
            }
            
            // 5. Night Wind Down (19:00 - 21:00)
            else if (hour >= 19 && hour < 21) {
                await triggerAiNotification('wind_down', patient, 'mental_wellness');
            }

        } catch (err) {
            console.error(`[AI-Notification] Error evaluating patient ${patient._id}:`, err.message);
        }
    }
}

function startNotificationCron() {
    if (jobInstance) return;
    
    // Run every 60 minutes.
    // Given frequency boundaries, hourly is safer than every 15 minutes to avoid rapid looping caps if timezone shifts.
    jobInstance = cron.schedule('0 * * * *', () => {
        processPatients();
    });
    
    console.log('🤖 AI Health Companion Cron started (Hourly evaluating patient timezones).');
}

module.exports = {
    startNotificationCron,
    processPatients // Exported for manual testing/triggering
};
