const cron = require('node-cron');
const moment = require('moment-timezone');
const Patient = require('../models/Patient');
const MedicineLog = require('../models/MedicineLog');
const NotificationService = require('../services/NotificationService');
const logger = require('../utils/logger');

/**
 * Escalation Ladder Job
 * Runs every hour to check for missed doses and notify companions.
 */
const runEscalationJob = async () => {
    const startTime = Date.now();
    logger.info(`[Job] Escalation Job started at ${new Date().toISOString()}`);

    try {
        const timezones = await Patient.distinct('timezone', {
            is_active: true,
        });

        const nowUtc = moment.utc();

        for (const tz of timezones) {
            const localTime = nowUtc.clone().tz(tz);
            const todayStr = localTime.format('YYYY-MM-DD');
            const yesterdayStr = localTime.clone().subtract(1, 'day').format('YYYY-MM-DD');

            // Find patients with companions
            const patients = await Patient.find({
                timezone: tz,
                is_active: true,
            }).populate('companions.profile_id');

            for (const patient of patients) {
                // Determine past thresholds for today based on current hour
                const currentHour = localTime.hour();
                const prefs = patient.medication_call_preferences || { morning: '09:00', afternoon: '14:00', night: '20:00' };
                
                const pastSlots = [];
                if (currentHour > parseInt(prefs.morning.split(':')[0]) + 2) pastSlots.push('morning');
                if (currentHour > parseInt(prefs.afternoon.split(':')[0]) + 2) pastSlots.push('afternoon');
                if (currentHour > parseInt(prefs.night.split(':')[0]) + 2) pastSlots.push('night');

                if (pastSlots.length === 0 && currentHour < 10) {
                    // Check yesterday's night meds if it's early morning
                    pastSlots.push('yesterday_night');
                }

                // Simplified consecutive miss count: 
                // In a production scenario, we'd query MedicineLog and sequence them.
                // For this MVP, if they missed 3+ active meds recently, we escalate.
                const recentLogs = await MedicineLog.find({
                    patient_id: patient._id,
                    date: { $gte: new Date(yesterdayStr) }
                });

                let missedCount = 0;
                for (const log of recentLogs) {
                    for (const med of log.medicines) {
                        if (med.is_active && !med.taken) {
                            if (pastSlots.includes(med.scheduled_time)) {
                                missedCount++;
                            }
                        }
                    }
                }

                // ── Escalate based on missedCount ──
                if (missedCount === 1) {
                    // Local patient reminder
                    if (patient.expo_push_token && patient.push_notifications_enabled) {
                        await NotificationService.sendPush(patient._id, {
                            title: '💊 Missed Dose',
                            body: 'You missed your last medication. Please take it as soon as possible.',
                        });
                    }
                } else if (missedCount === 2) {
                    // Stronger patient reminder
                    if (patient.expo_push_token && patient.push_notifications_enabled) {
                        await NotificationService.sendPush(patient._id, {
                            title: '⚠️ Missed Multiple Doses',
                            body: 'You have missed 2 doses in a row. It is very important to stay on track!',
                        });
                    }
                } else if (missedCount >= 3) {
                    // Notify Companions
                    if (patient.companions && patient.companions.length > 0) {
                        const companionProfiles = patient.companions.map(c => c.profile_id);
                        for (const comp of companionProfiles) {
                            // In real system, lookup companion push tokens. 
                            // Here we just log the alert for the companion dashboard.
                            const Alert = require('../models/Alert');
                            await Alert.updateOne(
                                { patient_id: patient._id, type: 'medication_missed', status: 'open' },
                                { 
                                    $set: { 
                                        description: `${patient.name} has missed 3+ consecutive doses.`,
                                        organization_id: patient.organization_id 
                                    } 
                                },
                                { upsert: true }
                            );
                        }
                    }
                }
            }
        }
    } catch (error) {
        logger.error('[Job] Escalation Job failed:', { error: error.message });
    } finally {
        logger.info(`[Job] Escalation Job finished in ${Date.now() - startTime}ms`);
    }
};

cron.schedule('0 * * * *', runEscalationJob);

module.exports = { runEscalationJob };
