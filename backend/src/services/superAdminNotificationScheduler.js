/**
 * Super Admin Notification Scheduler
 * Runs periodically to check for super-admin-relevant events and sends push notifications.
 *
 * Notifications:
 *   1. Platform Daily Summary         — 8:00 AM IST
 *   2. Platform Weekly Summary        — Monday 8:00 AM IST
 *   3. New Organization Onboarded     — Event-driven (imported and triggered directly)
 */
const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const CallLog = require('../models/CallLog');
const Notification = require('../models/Notification');
const { createNotification } = require('./notificationService');

// ── IST Helpers ──────────────────────────────────────────────
function getISTDate() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    return new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
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

// ── 1. PLATFORM DAILY SUMMARY ──────────────────────────────────
async function checkPlatformDailySummary(superAdmins, ignoreTime = false) {
    const ist = getISTDate();
    const hour = ist.getHours();
    
    // Only fire between 8:00–8:59 AM IST
    if (!ignoreTime && hour !== 8) return;

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const startOfYesterday = new Date(yesterday); startOfYesterday.setHours(0,0,0,0);
    const endOfYesterday = new Date(yesterday); endOfYesterday.setHours(23,59,59,999);

    let sent = 0;
    const completedCalls = await CallLog.countDocuments({ scheduledTime: { $gte: startOfYesterday, $lte: endOfYesterday }, status: 'completed' });
    const activeOrgs = await mongoose.model('Organization').countDocuments({ isActive: true });

    for (const sa of superAdmins) {
        if (await alreadySent(sa._id, 'platform_daily_summary')) continue;
        await createNotification(sa._id, 'platform_daily_summary', { completedCalls, activeOrgs });
        sent++;
    }
    if (sent > 0) console.log(`[SuperAdmin Scheduler] Sent ${sent} daily summaries`);
    return sent;
}

// ── 2. PLATFORM WEEKLY SUMMARY ─────────────────────────────────
async function checkPlatformWeeklySummary(superAdmins, ignoreTime = false) {
    const ist = getISTDate();
    const day = ist.getDay();
    const hour = ist.getHours();
    
    // Only fire on Monday between 8:00–8:59 AM IST
    if (!ignoreTime && (day !== 1 || hour !== 8)) return;

    let sent = 0;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const startOfPastWeek = new Date(sevenDaysAgo); startOfPastWeek.setHours(0,0,0,0);
    const endOfPastWeek = new Date(); endOfPastWeek.setHours(23,59,59,999);

    const completedCalls = await CallLog.countDocuments({ scheduledTime: { $gte: startOfPastWeek, $lte: endOfPastWeek }, status: 'completed' });
    const activeOrgs = await mongoose.model('Organization').countDocuments({ isActive: true });
    
    const adherenceAgg = await CallLog.aggregate([
        { $match: { scheduledTime: { $gte: startOfPastWeek, $lte: endOfPastWeek }, status: { $in: ['completed', 'missed', 'no_answer'] } } },
        { $unwind: { path: '$medicationConfirmations', preserveNullAndEmptyArrays: false } },
        { $group: { _id: null, total: { $sum: 1 }, confirmed: { $sum: { $cond: ['$medicationConfirmations.confirmed', 1, 0] } } } }
    ]);
    const globalAdherence = adherenceAgg.length && adherenceAgg[0].total > 0 ? Math.round((adherenceAgg[0].confirmed / adherenceAgg[0].total) * 100) : 0;
    
    for (const sa of superAdmins) {
        if (await alreadySent(sa._id, 'platform_weekly_summary')) continue;
        await createNotification(sa._id, 'platform_weekly_summary', { completedCalls, activeOrgs, adherenceRate: globalAdherence });
        sent++;
    }
    if (sent > 0) console.log(`[SuperAdmin Scheduler] Sent ${sent} weekly summaries`);
    return sent;
}

// ── 3. NEW ORGANIZATION ONBOARDED (Event-Driven) ───────────────
async function notifyNewOrganizationOnboarded(organization) {
    const superAdmins = await Profile.find({ role: 'super_admin', isActive: true }).select('_id').lean();
    for (const sa of superAdmins) {
        await createNotification(sa._id, 'new_org_created', {
            orgName: organization.name,
            orgId: organization._id.toString(),
            relatedEntityType: 'organization',
            relatedEntityId: organization._id,
        });
    }
}

// ── SCHEDULER LOOP ─────────────────────────────────────────────
function startSuperAdminScheduler(intervalMs = 60 * 60 * 1000) {
    // Run hourly by default
    setInterval(async () => {
        try {
            const superAdmins = await Profile.find({ role: 'super_admin', isActive: true }).select('_id').lean();
            if (superAdmins.length === 0) return;

            await checkPlatformDailySummary(superAdmins);
            await checkPlatformWeeklySummary(superAdmins);
        } catch (err) {
            console.error('[SuperAdmin Scheduler] Error:', err.message);
        }
    }, intervalMs);
    console.log('[SuperAdmin Scheduler] Started');
}

module.exports = {
    startSuperAdminScheduler,
    notifyNewOrganizationOnboarded,
    checkPlatformDailySummary, // Exported for manual testing
    checkPlatformWeeklySummary, // Exported for manual testing
};
