const cron = require('node-cron');
const moment = require('moment-timezone');
const Patient = require('../models/Patient');
const MedicineLog = require('../models/MedicineLog');
const CompanionAccess = require('../models/CompanionAccess');
const Notification = require('../models/Notification');
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

            // Find active patients in this timezone
            const patients = await Patient.find({
                timezone: tz,
                is_active: true,
            });

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
                    const tz = patient.timezone || 'UTC';
                    const startOfTodayLocal = moment().tz(tz).startOf('day');
                    const existing = await Notification.findOne({
                        patient_id: patient._id,
                        'ai_context.trigger': 'missed_dose_1',
                        created_at: { $gte: startOfTodayLocal.toDate() }
                    });

                    if (!existing && patient.expo_push_token && patient.push_notifications_enabled) {
                        const notificationDoc = await Notification.create({
                            patient_id: patient._id,
                            type: 'reminders',
                            title: '💊 Missed Dose',
                            message: 'You missed your last medication. Please take it as soon as possible.',
                            target_screen: 'HomeScreen',
                            push_delivered: false,
                            expo_push_token: patient.expo_push_token || undefined,
                            ai_context: {
                                trigger: 'missed_dose_1'
                            }
                        });

                        const pushResult = await NotificationService.sendPush(patient._id, {
                            title: '💊 Missed Dose',
                            body: 'You missed your last medication. Please take it as soon as possible.',
                            data: { screen: 'HomeScreen', notification_id: notificationDoc._id.toString() }
                        });

                        if (pushResult.success) {
                            notificationDoc.push_delivered = true;
                            if (pushResult.ticketId) {
                                notificationDoc.expo_ticket_id = pushResult.ticketId;
                                notificationDoc.expo_push_token = patient.expo_push_token;
                            }
                            await notificationDoc.save();
                        }
                    }
                } else if (missedCount === 2) {
                    const tz = patient.timezone || 'UTC';
                    const startOfTodayLocal = moment().tz(tz).startOf('day');
                    const existing = await Notification.findOne({
                        patient_id: patient._id,
                        'ai_context.trigger': 'missed_dose_2',
                        created_at: { $gte: startOfTodayLocal.toDate() }
                    });

                    if (!existing && patient.expo_push_token && patient.push_notifications_enabled) {
                        const notificationDoc = await Notification.create({
                            patient_id: patient._id,
                            type: 'reminders',
                            title: '⚠️ Missed Multiple Doses',
                            message: 'You have missed 2 doses in a row. It is very important to stay on track!',
                            target_screen: 'HomeScreen',
                            push_delivered: false,
                            expo_push_token: patient.expo_push_token || undefined,
                            ai_context: {
                                trigger: 'missed_dose_2'
                            }
                        });

                        const pushResult = await NotificationService.sendPush(patient._id, {
                            title: '⚠️ Missed Multiple Doses',
                            body: 'You have missed 2 doses in a row. It is very important to stay on track!',
                            data: { screen: 'HomeScreen', notification_id: notificationDoc._id.toString() }
                        });

                        if (pushResult.success) {
                            notificationDoc.push_delivered = true;
                            if (pushResult.ticketId) {
                                notificationDoc.expo_ticket_id = pushResult.ticketId;
                                notificationDoc.expo_push_token = patient.expo_push_token;
                            }
                            await notificationDoc.save();
                        }
                    }
                } else if (missedCount >= 3) {
                    // Query only active companion linkages for this specific patient
                    const activeCompanionsCount = await CompanionAccess.countDocuments({
                        patient_id: patient._id,
                        is_active: true,
                        status: 'accepted'
                    });

                    if (activeCompanionsCount > 0) {
                        // Generate alert for companion dashboard
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
    } catch (error) {
        logger.error('[Job] Escalation Job failed:', { error: error.message });
    } finally {
        logger.info(`[Job] Escalation Job finished in ${Date.now() - startTime}ms`);
    }
};

let isEscalationCronStarted = false;

const startEscalationCron = () => {
    if (isEscalationCronStarted) {
        console.warn('⚠️ Escalation cron already started. Skipping duplicate initialization.');
        return;
    }
    cron.schedule('0 * * * *', runEscalationJob);
    isEscalationCronStarted = true;
};

module.exports = { runEscalationJob, startEscalationCron };
