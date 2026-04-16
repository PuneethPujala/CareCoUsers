const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const CallLog = require('../models/CallLog');
const Escalation = require('../models/Escalation');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const CaretakerPatient = require('../models/CaretakerPatient');
const { calculateAdherence, calculateStreak } = require('./adherenceCalculator');

/**
 * ═══════════════════════════════════════════════════════════════
 * NOTIFICATION SERVICE
 * Handles push, email, and in-app notifications.
 * Provides both manual sends and automated triggers.
 * ═══════════════════════════════════════════════════════════════
 */

// ── CONFIGURATION ──────────────────────────────────────────────

const OVERDUE_THRESHOLD_MINUTES = 5;

const NOTIFICATION_TEMPLATES = {
    call_overdue: {
        title: '⏰ Call Overdue',
        body: (data) => `Your call with ${data.patientName} was scheduled for ${data.scheduledTime} and is overdue.`,
        priority: 'high',
    },
    escalation_assigned: {
        title: '🚨 New Escalation Assigned',
        body: (data) => `${data.type.replace(/_/g, ' ')} alert for ${data.patientName}: ${data.message}`,
        priority: 'urgent',
    },
    patient_reassigned: {
        title: '🔄 Patient Reassigned',
        body: (data) => `${data.patientName} has been ${data.direction === 'to' ? 'assigned to' : 'removed from'} you.`,
        priority: 'high',
    },
    weekly_summary: {
        title: '📊 Weekly Performance Summary',
        body: (data) => `Completion: ${data.completionRate}% | Adherence: ${data.adherenceRate}% | Calls: ${data.totalCalls}`,
        priority: 'normal',
    },
    medication_reminder: {
        title: '💊 Medication Confirmation Pending',
        body: (data) => `${data.patientName} has ${data.medicationCount} medications pending confirmation.`,
        priority: 'high',
    },
    low_adherence_alert: {
        title: '⚠️ Low Adherence Alert',
        body: (data) => `${data.patientName}'s adherence dropped to ${data.adherenceRate}% (threshold: ${data.threshold}%).`,
        priority: 'high',
    },
};

// ── 1. SEND PUSH NOTIFICATION ──────────────────────────────────

/**
 * Sends a push notification via the platform's push service.
 * Currently uses an internal record + ready for FCM / APN integration.
 *
 * @param {ObjectId|string} userId — recipientId
 * @param {{ title: string, body: string, data?: object }} notification
 * @returns {Notification} — the created notification document
 */
async function sendPushNotification(userId, notification) {
    const profile = await Profile.findById(userId).select('organizationId').lean();

    const record = await Notification.create({
        recipientId: userId,
        organizationId: profile?.organizationId,
        type: notification.type || 'system_announcement',
        channel: 'push',
        title: notification.title,
        body: notification.body,
        priority: notification.priority || 'normal',
        data: notification.data || {},
        relatedEntityType: notification.relatedEntityType,
        relatedEntityId: notification.relatedEntityId,
        status: 'sent',
        sentAt: new Date(),
    });

    // ── FCM / APN hook ─────────────────────────────────────────
    // TODO: integrate actual push provider
    // if (profile?.pushToken) {
    //   await fcm.send({ token: profile.pushToken, notification: { title, body }, data });
    //   record.status = 'delivered';
    //   record.deliveredAt = new Date();
    //   await record.save();
    // }

    return record;
}

// ── 2. SEND EMAIL NOTIFICATION ─────────────────────────────────

/**
 * Creates an email notification record and dispatches via the email provider.
 *
 * @param {string} email
 * @param {string} template — key from NOTIFICATION_TEMPLATES or custom
 * @param {object} data — template variables
 * @returns {Notification}
 */
async function sendEmailNotification(email, template, data) {
    const profile = await Profile.findOne({ email }).select('_id organizationId').lean();
    const tmpl = NOTIFICATION_TEMPLATES[template];

    const title = tmpl ? tmpl.title : template;
    const body = tmpl ? tmpl.body(data) : JSON.stringify(data);

    const record = await Notification.create({
        recipientId: profile?._id,
        organizationId: profile?.organizationId,
        type: template,
        channel: 'email',
        title,
        body,
        priority: tmpl?.priority || 'normal',
        data,
        status: 'sent',
        sentAt: new Date(),
    });

    // ── Email provider hook ────────────────────────────────────
    // TODO: integrate SendGrid / SES / Nodemailer
    // await sendgrid.send({ to: email, subject: title, html: renderTemplate(template, data) });

    return record;
}

// ── 3. CREATE IN-APP NOTIFICATION ──────────────────────────────

/**
 * Creates a persisted in-app notification, visible in the app's notification center.
 *
 * @param {ObjectId|string} userId — recipientId
 * @param {string} type — notification type key
 * @param {object} data — event-specific data
 * @returns {Notification}
 */
async function createNotification(userId, type, data) {
    const tmpl = NOTIFICATION_TEMPLATES[type];
    const profile = await Profile.findById(userId).select('organizationId').lean();

    return Notification.create({
        recipientId: userId,
        organizationId: profile?.organizationId,
        type,
        channel: 'in_app',
        title: tmpl ? tmpl.title : type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        body: tmpl ? tmpl.body(data) : JSON.stringify(data),
        priority: tmpl?.priority || data.priority || 'normal',
        data,
        relatedEntityType: data.relatedEntityType,
        relatedEntityId: data.relatedEntityId,
    });
}

// ═══════════════════════════════════════════════════════════════
// AUTOMATED TRIGGERS
// ═══════════════════════════════════════════════════════════════

// ── 4. CHECK OVERDUE CALLS ─────────────────────────────────────

/**
 * Finds calls that are overdue by OVERDUE_THRESHOLD_MINUTES and notifies caretakers.
 * Designed to run on a 1-minute interval (cron or setInterval).
 *
 * @returns {{ notified: number }}
 */
async function checkOverdueCalls() {
    const thresholdTime = new Date(Date.now() - OVERDUE_THRESHOLD_MINUTES * 60 * 1000);
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);

    // Find calls scheduled before threshold that are still 'scheduled' (not started)
    const overdueCalls = await CallLog.find({
        scheduledTime: { $gte: startOfToday, $lte: thresholdTime },
        status: 'scheduled',
    })
        .populate('patientId', 'fullName')
        .lean();

    let notified = 0;

    for (const call of overdueCalls) {
        // Avoid duplicate notifications
        const existing = await Notification.findOne({
            recipientId: call.caretakerId,
            type: 'call_overdue',
            'data.callLogId': call._id.toString(),
            createdAt: { $gte: startOfToday },
        });

        if (existing) continue;

        await createNotification(call.caretakerId, 'call_overdue', {
            patientName: call.patientId?.fullName || 'a patient',
            scheduledTime: call.scheduledTime.toLocaleTimeString(),
            callLogId: call._id.toString(),
            relatedEntityType: 'call_log',
            relatedEntityId: call._id,
        });

        notified++;
    }

    return { notified };
}

// ── 5. NOTIFY NEW ESCALATION ────────────────────────────────────

/**
 * Sends notification when a new escalation is assigned.
 *
 * @param {ObjectId|string} escalationId
 */
async function notifyEscalationAssigned(escalationId) {
    const escalation = await Escalation.findById(escalationId)
        .populate('patientId', 'fullName')
        .lean();

    if (!escalation || !escalation.assignedTo) return;

    await createNotification(escalation.assignedTo, 'escalation_assigned', {
        type: escalation.type,
        priority: escalation.priority,
        patientName: escalation.patientId?.fullName || 'Unknown',
        message: escalation.message,
        relatedEntityType: 'escalation',
        relatedEntityId: escalation._id,
    });

    // If critical, also send push
    if (escalation.priority === 'critical') {
        await sendPushNotification(escalation.assignedTo, {
            type: 'escalation_alert',
            title: '🚨 CRITICAL ESCALATION',
            body: `${escalation.type.replace(/_/g, ' ').toUpperCase()} for ${escalation.patientId?.fullName}: ${escalation.message}`,
            priority: 'urgent',
            data: { screen: 'EscalationDetail', escalationId: escalation._id.toString() },
            relatedEntityType: 'escalation',
            relatedEntityId: escalation._id,
        });
    }
}

// ── 6. NOTIFY PATIENT REASSIGNMENT ──────────────────────────────

/**
 * Sends notifications when a patient is reassigned.
 *
 * @param {{ patientId, patientName, oldCaretakerId, newCaretakerId, organizationId }} data
 */
async function notifyPatientReassignment(data) {
    const notifications = [];

    // Notify new caretaker
    notifications.push({
        recipientId: data.newCaretakerId,
        organizationId: data.organizationId,
        type: 'patient_reassigned',
        channel: 'in_app',
        title: '🔄 New Patient Assigned',
        body: `${data.patientName} has been assigned to you.`,
        priority: 'high',
        data: { screen: 'PatientDetail', patientId: data.patientId.toString(), direction: 'to' },
        relatedEntityType: 'profile',
        relatedEntityId: data.patientId,
    });

    // Notify old caretaker
    if (data.oldCaretakerId) {
        notifications.push({
            recipientId: data.oldCaretakerId,
            organizationId: data.organizationId,
            type: 'patient_reassigned',
            channel: 'in_app',
            title: '🔄 Patient Reassigned',
            body: `${data.patientName} has been reassigned to another caretaker.`,
            priority: 'normal',
            data: { screen: 'Dashboard', direction: 'from' },
        });
    }

    await Notification.createBulk(notifications);
}

// ── 7. WEEKLY PERFORMANCE SUMMARY ───────────────────────────────

/**
 * Generates weekly performance summary for all active caretakers.
 * Designed to run as a weekly cron (e.g., every Monday at 8 AM).
 *
 * @param {ObjectId|string} [organizationId] — omit for platform-wide
 * @returns {{ sent: number }}
 */
async function sendWeeklyPerformanceSummary(organizationId) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const filter = { role: { $in: ['caretaker', 'caller'] }, isActive: true };
    if (organizationId) filter.organizationId = new mongoose.Types.ObjectId(organizationId);

    const caretakers = await Profile.find(filter).select('_id fullName organizationId').lean();
    let sent = 0;

    for (const ct of caretakers) {
        // Get week's stats
        const weekStats = await CallLog.aggregate([
            {
                $match: {
                    caretakerId: ct._id,
                    scheduledTime: { $gte: sevenDaysAgo },
                },
            },
            {
                $group: {
                    _id: null,
                    totalCalls: { $sum: 1 },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                },
            },
        ]);

        if (!weekStats.length || weekStats[0].totalCalls === 0) continue;

        const stats = weekStats[0];
        const completionRate = Math.round((stats.completed / stats.totalCalls) * 100);

        // Adherence for managed patients
        const assignments = await CaretakerPatient.find({ caretakerId: ct._id, status: 'active' }).select('patientId').lean();
        const patientIds = assignments.map(a => a.patientId);

        const adherenceAgg = await CallLog.aggregate([
            {
                $match: {
                    patientId: { $in: patientIds },
                    scheduledTime: { $gte: sevenDaysAgo },
                    status: { $in: ['completed', 'missed', 'no_answer'] },
                },
            },
            { $unwind: { path: '$medicationConfirmations', preserveNullAndEmptyArrays: false } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    confirmed: { $sum: { $cond: ['$medicationConfirmations.confirmed', 1, 0] } },
                },
            },
        ]);
        const adherenceRate = adherenceAgg.length
            ? Math.round((adherenceAgg[0].confirmed / adherenceAgg[0].total) * 100)
            : 0;

        await createNotification(ct._id, 'weekly_summary', {
            completionRate,
            adherenceRate,
            totalCalls: stats.totalCalls,
            completedCalls: stats.completed,
        });

        sent++;
    }

    return { sent };
}

// ── 8. LOW ADHERENCE ALERTS ─────────────────────────────────────

/**
 * Checks all active patients and alerts care managers when adherence drops
 * below threshold. Designed for a daily cron.
 *
 * @param {number} [threshold=70] — adherence percentage threshold
 * @returns {{ alerted: number }}
 */
async function checkLowAdherenceAlerts(threshold = 70) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const adherenceAgg = await CallLog.aggregate([
        {
            $match: {
                scheduledTime: { $gte: thirtyDaysAgo },
                status: { $in: ['completed', 'missed', 'no_answer'] },
            },
        },
        { $unwind: { path: '$medicationConfirmations', preserveNullAndEmptyArrays: false } },
        {
            $group: {
                _id: '$patientId',
                total: { $sum: 1 },
                confirmed: { $sum: { $cond: ['$medicationConfirmations.confirmed', 1, 0] } },
            },
        },
        {
            $project: {
                adherenceRate: { $round: [{ $multiply: [{ $divide: ['$confirmed', '$total'] }, 100] }, 0] },
            },
        },
        { $match: { adherenceRate: { $lt: threshold } } },
    ]);

    let alerted = 0;

    for (const item of adherenceAgg) {
        const patient = await Profile.findById(item._id).select('fullName organizationId').lean();
        if (!patient) continue;

        // Find the care manager via caretaker assignments
        const assignment = await CaretakerPatient.findOne({ patientId: item._id, status: 'active' })
            .populate('caretakerId', 'managedBy')
            .lean();

        const managerId = assignment?.caretakerId?.managedBy;
        if (!managerId) continue;

        // Avoid duplicate daily alerts
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        const existing = await Notification.findOne({
            recipientId: managerId,
            type: 'low_adherence_alert',
            'data.patientId': item._id.toString(),
            createdAt: { $gte: startOfToday },
        });
        if (existing) continue;

        await createNotification(managerId, 'low_adherence_alert', {
            patientName: patient.fullName,
            patientId: item._id.toString(),
            adherenceRate: item.adherenceRate,
            threshold,
            relatedEntityType: 'profile',
            relatedEntityId: item._id,
        });

        alerted++;
    }

    return { alerted };
}

// ── 9. CRON SCHEDULER ───────────────────────────────────────────

/**
 * Starts all automated notification cron jobs.
 * Call once at server startup.
 */
function startNotificationCrons() {
    // Check overdue calls every minute
    setInterval(async () => {
        try {
            const result = await checkOverdueCalls();
            if (result.notified > 0) {
                console.log(`[Cron] Notified ${result.notified} overdue calls`);
            }
        } catch (err) {
            console.error('[Cron] checkOverdueCalls error:', err.message);
        }
    }, 60 * 1000);

    // Check low adherence daily (check every hour, deduplicated)
    setInterval(async () => {
        try {
            const hour = new Date().getHours();
            if (hour === 9) { // Run at 9 AM only
                const result = await checkLowAdherenceAlerts();
                if (result.alerted > 0) {
                    console.log(`[Cron] Sent ${result.alerted} low adherence alerts`);
                }
            }
        } catch (err) {
            console.error('[Cron] checkLowAdherenceAlerts error:', err.message);
        }
    }, 60 * 60 * 1000);

    // Weekly summary every Monday at 8 AM (check hourly, run once)
    setInterval(async () => {
        try {
            const now = new Date();
            if (now.getDay() === 1 && now.getHours() === 8) {
                const result = await sendWeeklyPerformanceSummary();
                console.log(`[Cron] Sent ${result.sent} weekly summaries`);
            }
        } catch (err) {
            console.error('[Cron] sendWeeklyPerformanceSummary error:', err.message);
        }
    }, 60 * 60 * 1000);

    console.log('📡 Notification crons started');
}

module.exports = {
    // Manual sends
    sendPushNotification,
    sendEmailNotification,
    createNotification,

    // Automated triggers
    checkOverdueCalls,
    notifyEscalationAssigned,
    notifyPatientReassignment,
    sendWeeklyPerformanceSummary,
    checkLowAdherenceAlerts,

    // Cron bootstrap
    startNotificationCrons,

    // Templates (for testing / customization)
    NOTIFICATION_TEMPLATES,
};
