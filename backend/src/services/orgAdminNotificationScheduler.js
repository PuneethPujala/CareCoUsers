/**
 * Org Admin Notification Scheduler
 * Runs periodically to check for org-admin-relevant events and sends push notifications.
 *
 * Notifications:
 *   1. Org Daily Summary         — 8:00 AM IST
 *   2. Org Weekly Summary        — Monday 8:00 AM IST
 *   3. Critical Escalation Alert — Event-driven (imported and triggered directly)
 */
const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const CallLog = require('../models/CallLog');
const Escalation = require('../models/Escalation');
const Notification = require('../models/Notification');
const { createNotification, sendPushNotification } = require('./notificationService');

// ── IST Helpers ──────────────────────────────────────────────
function getISTDate() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    return new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
}

function getTodayBounds() {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

async function alreadySent(adminId, eventType) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const existing = await Notification.findOne({
        recipientId: adminId,
        type: eventType,
        createdAt: { $gte: startOfToday },
    });
    return !!existing;
}

// ── 1. ORG DAILY SUMMARY ───────────────────────────────────────
async function checkOrgDailySummary(orgAdmins, ignoreTime = false) {
    const ist = getISTDate();
    const hour = ist.getHours();
    
    // Only fire between 8:00–8:59 AM IST
    if (!ignoreTime && hour !== 8) return;

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const startOfYesterday = new Date(yesterday); startOfYesterday.setHours(0,0,0,0);
    const endOfYesterday = new Date(yesterday); endOfYesterday.setHours(23,59,59,999);

    let sent = 0;
    for (const oa of orgAdmins) {
        if (!oa.organizationId) continue;
        if (await alreadySent(oa._id, 'org_daily_summary')) continue;

        const callers = await Profile.find({ organizationId: oa.organizationId, role: { $in: ['caretaker', 'caller'] } }).select('_id').lean();
        const callerIds = callers.map(c => c._id);
        
        const orgStats = await CallLog.aggregate([
            { $match: { caretakerId: { $in: callerIds }, scheduledTime: { $gte: startOfYesterday, $lte: endOfYesterday } } },
            { $group: { _id: null, totalCalls: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } }
        ]);
        const adherenceAgg = await CallLog.aggregate([
            { $match: { caretakerId: { $in: callerIds }, scheduledTime: { $gte: startOfYesterday, $lte: endOfYesterday }, status: { $in: ['completed', 'missed', 'no_answer'] } } },
            { $unwind: { path: '$medicationConfirmations', preserveNullAndEmptyArrays: false } },
            { $group: { _id: null, total: { $sum: 1 }, confirmed: { $sum: { $cond: ['$medicationConfirmations.confirmed', 1, 0] } } } }
        ]);
        
        const completedCalls = orgStats.length ? orgStats[0].completed : 0;
        const adherenceRate = adherenceAgg.length && adherenceAgg[0].total > 0 ? Math.round((adherenceAgg[0].confirmed / adherenceAgg[0].total) * 100) : 0;
        const escalationCount = await Escalation.countDocuments({ organizationId: oa.organizationId, createdAt: { $gte: startOfYesterday, $lte: endOfYesterday } });
        
        await createNotification(oa._id, 'org_daily_summary', { completedCalls, adherenceRate, escalationCount });
        sent++;
    }
    if (sent > 0) console.log(`[OrgAdmin Scheduler] Sent ${sent} daily summaries`);
    return sent;
}

// ── 2. ORG WEEKLY SUMMARY ──────────────────────────────────────
async function checkOrgWeeklySummary(orgAdmins, ignoreTime = false) {
    const ist = getISTDate();
    const day = ist.getDay();
    const hour = ist.getHours();
    
    // Only fire on Monday between 8:00–8:59 AM IST
    if (!ignoreTime && (day !== 1 || hour !== 8)) return;

    let sent = 0;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const startOfPastWeek = new Date(sevenDaysAgo); startOfPastWeek.setHours(0,0,0,0);
    const endOfPastWeek = new Date(); endOfPastWeek.setHours(23,59,59,999);

    for (const oa of orgAdmins) {
        if (!oa.organizationId) continue;
        if (await alreadySent(oa._id, 'org_weekly_summary')) continue;

        const callers = await Profile.find({ organizationId: oa.organizationId, role: { $in: ['caretaker', 'caller'] } }).select('_id').lean();
        const callerIds = callers.map(c => c._id);
        
        const orgStats = await CallLog.aggregate([
            { $match: { caretakerId: { $in: callerIds }, scheduledTime: { $gte: startOfPastWeek, $lte: endOfPastWeek } } },
            { $group: { _id: null, totalCalls: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } }
        ]);
        const adherenceAgg = await CallLog.aggregate([
            { $match: { caretakerId: { $in: callerIds }, scheduledTime: { $gte: startOfPastWeek, $lte: endOfPastWeek }, status: { $in: ['completed', 'missed', 'no_answer'] } } },
            { $unwind: { path: '$medicationConfirmations', preserveNullAndEmptyArrays: false } },
            { $group: { _id: null, total: { $sum: 1 }, confirmed: { $sum: { $cond: ['$medicationConfirmations.confirmed', 1, 0] } } } }
        ]);
        
        const completedCalls = orgStats.length ? orgStats[0].completed : 0;
        const adherenceRate = adherenceAgg.length && adherenceAgg[0].total > 0 ? Math.round((adherenceAgg[0].confirmed / adherenceAgg[0].total) * 100) : 0;
        
        await createNotification(oa._id, 'org_weekly_summary', { completedCalls, adherenceRate });
        sent++;
    }
    if (sent > 0) console.log(`[OrgAdmin Scheduler] Sent ${sent} weekly summaries`);
    return sent;
}

// ── 3. CRITICAL ESCALATION (Event-Driven) ──────────────────────
async function notifyCriticalEscalation(escalation) {
    if (!escalation.organizationId || escalation.priority !== 'critical') return;

    const orgAdmins = await Profile.find({ organizationId: escalation.organizationId, role: 'org_admin', isActive: true }).select('_id').lean();
    for (const oa of orgAdmins) {
        await createNotification(oa._id, 'critical_escalation_alert', {
            patientName: escalation.patientId?.fullName || 'Unknown',
            escalationId: escalation._id.toString(),
            relatedEntityType: 'escalation',
            relatedEntityId: escalation._id,
        });
        await sendPushNotification(oa._id, {
            type: 'critical_escalation_alert',
            title: 'CRITICAL ESCALATION',
            body: `CRITICAL ALERT: Medical emergency reported for patient ${escalation.patientId?.fullName || 'Unknown'}. Care Manager has been notified.`,
            priority: 'urgent',
            data: { screen: 'EscalationDetail', escalationId: escalation._id.toString() },
            relatedEntityType: 'escalation',
            relatedEntityId: escalation._id,
        });
    }
}

// ── SCHEDULER LOOP ─────────────────────────────────────────────
function startOrgAdminScheduler(intervalMs = 60 * 60 * 1000) {
    // Run hourly by default
    setInterval(async () => {
        try {
            const orgAdmins = await Profile.find({ role: 'org_admin', isActive: true }).select('_id organizationId').lean();
            if (orgAdmins.length === 0) return;

            await checkOrgDailySummary(orgAdmins);
            await checkOrgWeeklySummary(orgAdmins);
        } catch (err) {
            console.error('[OrgAdmin Scheduler] Error:', err.message);
        }
    }, intervalMs);
    console.log('[OrgAdmin Scheduler] Started');
}

module.exports = {
    startOrgAdminScheduler,
    notifyCriticalEscalation,
    checkOrgDailySummary, // Exported for manual testing
    checkOrgWeeklySummary, // Exported for manual testing
};
