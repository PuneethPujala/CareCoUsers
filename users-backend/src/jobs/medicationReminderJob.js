const cron = require('node-cron');
const moment = require('moment-timezone');
const Patient = require('../models/Patient');
const Notification = require('../models/Notification');
const NotificationService = require('../services/NotificationService');

/**
 * Medication Reminder Job
 *
 * Runs every minute.
 * 1. Identifies all unique timezones in the database.
 * 2. Calculates the current local HH:mm for each timezone.
 * 3. Finds patients in those timezones with medications scheduled at that time.
 * 4. Consolidates multiple medications into a single push notification.
 *
 * FIX: moment().format('monday') is not a valid moment format token — it
 *      outputs the literal string "monday" for every patient on every day.
 *      Corrected to .format('dddd').toLowerCase() which returns the actual
 *      day name (e.g. "tuesday"). dayOfWeek is now threaded into the query
 *      and filter so day-specific schedules work correctly.
 */

const runMedicationReminders = async () => {
    const startTime = Date.now();
    console.log(`[Job] Medication Reminder Scan started at ${new Date().toISOString()}`);

    try {
        const timezones = await Patient.distinct('timezone', {
            is_active: true,
            medication_reminders_enabled: true,
            expo_push_token: { $exists: true, $ne: null, $ne: '' },
        });

        const nowUtc = moment.utc();

        for (const tz of timezones) {
            const localTime = nowUtc.clone().tz(tz);
            const hhmm = localTime.format('HH:mm');

            // We want to notify 15 minutes BEFORE the preferred time.
            // So we check: "which preferred time is 15 minutes from now?"
            // i.e. if it's currently 08:45, we fire the reminder for the 09:00 slot.
            const targetTime = localTime.clone().add(15, 'minutes').format('HH:mm');

            // FIX: was moment().format('monday') — not a format token, always
            // returned the literal string "monday". Correct call is .format('dddd').
            const dayOfWeek = localTime.format('dddd').toLowerCase(); // e.g. "tuesday"

            const patients = await Patient.find({
                timezone: tz,
                is_active: true,
                medication_reminders_enabled: true,
                expo_push_token: { $exists: true, $ne: '' },
                $or: [
                    // Case A: Med has explicit scheduledTimes (HH:mm strings)
                    { 'medications.scheduledTimes': targetTime },

                    // Case B: Med uses named buckets matched against patient preferences
                    { $and: [{ 'medications.times': 'morning' }, { 'medication_call_preferences.morning': targetTime }] },
                    { $and: [{ 'medications.times': 'afternoon' }, { 'medication_call_preferences.afternoon': targetTime }] },
                    { $and: [{ 'medications.times': 'night' }, { 'medication_call_preferences.night': targetTime }] },
                    { $and: [{ 'medications.times': 'evening' }, { 'medication_call_preferences.night': targetTime }] },
                ],
            }).select('name medications medication_call_preferences expo_push_token');

            if (patients.length === 0) continue;

            console.log(`[Job] ${patients.length} patient(s) in ${tz} (${dayOfWeek}) at ${hhmm}`);

            for (const patient of patients) {
                const dueMeds = patient.medications.filter(med => {
                    if (!med.is_active) return false;

                    // FIX: dayOfWeek is now the correct day string and is checked
                    // against med.days when the field exists. If the med has no days
                    // restriction, it fires every day (backward-compatible).
                    if (med.days && med.days.length > 0 && !med.days.includes(dayOfWeek)) {
                        return false;
                    }

                    if (med.scheduledTimes?.includes(targetTime)) return true;

                    const prefs = patient.medication_call_preferences || {};
                    if (med.times?.includes('morning') && prefs.morning === targetTime) return true;
                    if (med.times?.includes('afternoon') && prefs.afternoon === targetTime) return true;
                    if (med.times?.includes('night') && prefs.night === targetTime) return true;
                    if (med.times?.includes('evening') && prefs.night === targetTime) return true;

                    return false;
                });

                if (dueMeds.length === 0) continue;

                const medNames = dueMeds.map(m => m.name);
                let messageBody;
                if (medNames.length === 1) {
                    messageBody = `Time to take your ${medNames[0]} in 15 minutes. Get ready! 💊`;
                } else if (medNames.length === 2) {
                    messageBody = `${medNames[0]} and ${medNames[1]} are due in 15 minutes.`;
                } else {
                    messageBody = `${medNames[0]}, ${medNames[1]} and ${medNames.length - 2} more — due in 15 minutes.`;
                }

                const pushDelivered = await NotificationService.sendPush(patient._id, {
                    title: '💊 Medication Reminder',
                    body: messageBody,
                    data: {
                        screen: 'Medications',
                        type: 'medication_reminder',
                        slot: dueMeds[0].times?.[0] || 'morning',
                        medication_ids: dueMeds.map(m => m._id.toString()).join(','),
                        categoryIdentifier: 'medication_reminder',
                    },
                });

                await Notification.create({
                    patient_id: patient._id,
                    type: 'reminders',
                    title: '💊 Medication Reminder',
                    message: messageBody,
                    target_screen: 'Medications',
                    push_delivered: pushDelivered,
                });
            }
        }
    } catch (error) {
        console.error('[Job] Medication Reminder Job failed:', error);
    } finally {
        console.log(`[Job] Medication Reminder Scan finished in ${Date.now() - startTime}ms`);
    }
};

cron.schedule('* * * * *', runMedicationReminders);

module.exports = { runMedicationReminders };