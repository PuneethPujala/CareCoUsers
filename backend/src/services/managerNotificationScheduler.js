/**
 * Care Manager Notification Scheduler
 * Runs periodically to check for manager-relevant events and sends push notifications.
 * Non-spammy: uses tracking to avoid duplicate sends.
 *
 * Notifications (max 3-4 per day):
 *   1. Morning Briefing       — 9:00 AM IST
 *   2. Unassigned Patients     — 9:30 AM IST (only if action needed)
 *   3. Caller Inactivity       — Mid-shift (10:30 AM / 2:30 PM)
 *   4. Capacity Warning        — 10:00 AM IST (only if ≥85%)
 *   5. End-of-Day Summary      — 8:30 PM IST
 */
const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const Patient = require('../models/Patient');
const CallLog = require('../models/CallLog');
const CaretakerPatient = require('../models/CaretakerPatient');
const Escalation = require('../models/Escalation');
const Notification = require('../models/Notification');
const { sendPush } = require('./pushService');

// ── IST Helpers ──────────────────────────────────────────────
function getISTDate() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    return new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
}

function getCurrentShift() {
    const hour = getISTDate().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'night';
}

// ── DB-level deduplication (survives server restarts) ────────
async function alreadySent(managerId, eventType, qualifier = 'default') {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const existing = await Notification.findOne({
        recipientId: managerId,
        'data.schedulerEvent': `mgr_${eventType}_${qualifier}`,
        createdAt: { $gte: startOfToday },
    });
    return !!existing;
}

// ── Today bounds ─────────────────────────────────────────────
function getTodayBounds() {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

// ── Data helpers ─────────────────────────────────────────────
async function getActiveCareManagers() {
    return Profile.find({
        role: 'care_manager',
        isActive: { $ne: false },
    }).select('_id fullName organizationId').lean();
}

async function getManagedCallerIds(managerId) {
    const callers = await Profile.find({
        managedBy: managerId,
        role: { $in: ['caretaker', 'caller'] },
        isActive: true,
    }).select('_id fullName').lean();
    return callers;
}

async function getManagedPatientIds(managerId, callerIds) {
    const assignments = await CaretakerPatient.find({
        caretakerId: { $in: callerIds },
        status: 'active',
    }).select('patientId').lean();
    return [...new Set(assignments.map(a => a.patientId.toString()))];
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATION EVENTS
// ═══════════════════════════════════════════════════════════════

/**
 * 1. MORNING BRIEFING — Daily team overview at 9:00 AM IST
 */
async function checkMorningBriefing(managers) {
    const ist = getISTDate();
    const hour = ist.getHours();
    const min = ist.getMinutes();

    // Only fire between 9:00–9:10 AM IST
    if (hour !== 9 || min >= 10) return;

    const { start, end } = getTodayBounds();

    for (const mgr of managers) {
        if (await alreadySent(mgr._id, 'morning_briefing')) continue;

        const callers = await getManagedCallerIds(mgr._id);
        const callerIds = callers.map(c => c._id);
        const patientIds = await getManagedPatientIds(mgr._id, callerIds);

        const todayCalls = await CallLog.countDocuments({
            caretakerId: { $in: callerIds },
            scheduledTime: { $gte: start, $lte: end },
        });

        const openEscalations = await Escalation.countDocuments({
            $or: [
                { assignedTo: mgr._id },
                { caretakerId: { $in: callerIds } },
            ],
            status: { $in: ['open', 'acknowledged', 'in_progress'] },
        });

        const escalationNote = openEscalations > 0
            ? ` ${openEscalations} open escalation${openEscalations > 1 ? 's' : ''} need attention.`
            : '';

        await sendPush(mgr._id, {
            title: 'Daily Briefing',
            body: `${callerIds.length} caller${callerIds.length !== 1 ? 's' : ''} active, ${patientIds.length} patient${patientIds.length !== 1 ? 's' : ''} under care, ${todayCalls} call${todayCalls !== 1 ? 's' : ''} scheduled today.${escalationNote}`,
            type: 'team_briefing',
            priority: 'normal',
            data: { screen: 'CareManagerDashboard', schedulerEvent: 'mgr_morning_briefing_default' },
        });

        console.log(`[ManagerScheduler] Morning briefing sent to ${mgr.fullName}`);
    }
}

/**
 * 2. UNASSIGNED PATIENTS ALERT — 9:30 AM IST, only if action needed
 */
async function checkUnassignedPatients(managers) {
    const ist = getISTDate();
    const hour = ist.getHours();
    const min = ist.getMinutes();

    // Only fire between 9:30–9:40 AM IST
    if (hour !== 9 || min < 30 || min >= 40) return;

    for (const mgr of managers) {
        if (await alreadySent(mgr._id, 'unassigned_patients')) continue;

        const orgId = mgr.organizationId;
        if (!orgId) continue;

        // Count patients in org
        const totalPatients = await Patient.countDocuments({
            organization_id: orgId,
            is_active: true,
        });

        // Count assigned patients
        const assignedPatientIds = await CaretakerPatient.distinct('patientId', {
            status: 'active',
        });

        const unassigned = Math.max(0, totalPatients - assignedPatientIds.length);

        if (unassigned === 0) continue; // No action needed — skip silently

        await sendPush(mgr._id, {
            title: `${unassigned} Patient${unassigned > 1 ? 's' : ''} Unassigned`,
            body: `${unassigned} patient${unassigned > 1 ? 's need' : ' needs'} to be assigned to a caller. Tap to review the patient roster.`,
            type: 'assignment_change',
            priority: 'high',
            data: { screen: 'PatientsList', unassigned: 'true', schedulerEvent: 'mgr_unassigned_patients_default' },
        });

        console.log(`[ManagerScheduler] Unassigned patients alert sent to ${mgr.fullName} (${unassigned})`);
    }
}

/**
 * 3. CALLER INACTIVITY ALERT — Mid-shift check
 *    Fires at 10:30 AM (morning shift) and 2:30 PM (afternoon shift)
 *    Only if a managed caller has completed 0 calls 1.5h into their shift
 */
async function checkCallerInactivity(managers) {
    const ist = getISTDate();
    const hour = ist.getHours();
    const min = ist.getMinutes();

    // Check windows: 10:30-10:40 AM or 14:30-14:40 PM
    const isMorningCheck = (hour === 10 && min >= 30 && min < 40);
    const isAfternoonCheck = (hour === 14 && min >= 30 && min < 40);

    if (!isMorningCheck && !isAfternoonCheck) return;

    const shift = isMorningCheck ? 'morning' : 'afternoon';
    const { start, end } = getTodayBounds();

    for (const mgr of managers) {
        if (await alreadySent(mgr._id, 'caller_inactive', shift)) continue;

        const callers = await getManagedCallerIds(mgr._id);
        const inactiveCallers = [];

        for (const caller of callers) {
            const completedCalls = await CallLog.countDocuments({
                caretakerId: caller._id,
                scheduledTime: { $gte: start, $lte: end },
                status: { $in: ['completed', 'in_progress'] },
            });

            const scheduledCalls = await CallLog.countDocuments({
                caretakerId: caller._id,
                scheduledTime: { $gte: start, $lte: end },
            });

            // Only flag if they have calls scheduled but haven't done any
            if (scheduledCalls > 0 && completedCalls === 0) {
                inactiveCallers.push(caller.fullName);
            }
        }

        if (inactiveCallers.length === 0) continue;

        const names = inactiveCallers.length <= 2
            ? inactiveCallers.join(' and ')
            : `${inactiveCallers[0]} and ${inactiveCallers.length - 1} other${inactiveCallers.length - 1 > 1 ? 's' : ''}`;

        await sendPush(mgr._id, {
            title: `Caller Inactivity — ${shift.charAt(0).toUpperCase() + shift.slice(1)} Shift`,
            body: `${names} ha${inactiveCallers.length === 1 ? 's' : 've'} not completed any calls yet this ${shift} shift. Scheduled patients may be waiting.`,
            type: 'caller_inactive',
            priority: 'high',
            data: { screen: 'TeamList', role: 'caller', schedulerEvent: `mgr_caller_inactive_${shift}` },
        });

        console.log(`[ManagerScheduler] Caller inactivity alert sent to ${mgr.fullName} (${inactiveCallers.length} inactive)`);
    }
}

/**
 * 4. CAPACITY THRESHOLD ALERT — 10:00 AM IST, once daily
 *    Only fires when utilization >= 85%
 */
async function checkCapacityWarning(managers) {
    const ist = getISTDate();
    const hour = ist.getHours();
    const min = ist.getMinutes();

    // Only fire between 10:00–10:10 AM IST
    if (hour !== 10 || min >= 10) return;

    const MAX_PATIENTS_PER_CALLER = 25;

    for (const mgr of managers) {
        if (await alreadySent(mgr._id, 'capacity_warning')) continue;

        const orgId = mgr.organizationId;
        if (!orgId) continue;

        const activeCallers = await Profile.countDocuments({
            organizationId: orgId,
            role: { $in: ['caller', 'caretaker'] },
            isActive: { $ne: false },
        });

        if (activeCallers === 0) continue;

        const assignedCount = await CaretakerPatient.countDocuments({ status: 'active' });
        const totalCapacity = activeCallers * MAX_PATIENTS_PER_CALLER;
        const utilization = Math.round((assignedCount / totalCapacity) * 100);

        if (utilization < 85) continue; // Healthy — no notification

        const isCritical = utilization >= 95;
        const availableSlots = Math.max(0, totalCapacity - assignedCount);

        await sendPush(mgr._id, {
            title: isCritical
                ? 'Capacity Critical — Action Required'
                : 'Capacity Warning — Running High',
            body: isCritical
                ? `System at ${utilization}% capacity with only ${availableSlots} slot${availableSlots !== 1 ? 's' : ''} remaining. Consider onboarding additional callers to prevent overflow.`
                : `System at ${utilization}% capacity. ${availableSlots} slot${availableSlots !== 1 ? 's' : ''} available across ${activeCallers} caller${activeCallers !== 1 ? 's' : ''}. Plan ahead for growth.`,
            type: 'capacity_warning',
            priority: isCritical ? 'urgent' : 'high',
            data: { screen: 'CareManagerDashboard', schedulerEvent: 'mgr_capacity_warning_default' },
        });

        console.log(`[ManagerScheduler] Capacity warning sent to ${mgr.fullName} (${utilization}%)`);
    }
}

/**
 * 5. END-OF-DAY SUMMARY — 8:30 PM IST
 */
async function checkEndOfDaySummary(managers) {
    const ist = getISTDate();
    const hour = ist.getHours();
    const min = ist.getMinutes();

    // Only fire between 8:30–8:40 PM IST
    if (hour !== 20 || min < 30 || min >= 40) return;

    const { start, end } = getTodayBounds();

    for (const mgr of managers) {
        if (await alreadySent(mgr._id, 'eod_summary')) continue;

        const callers = await getManagedCallerIds(mgr._id);
        const callerIds = callers.map(c => c._id);

        if (callerIds.length === 0) continue;

        // Today's call stats
        const [totalCalls, completedCalls, missedCalls] = await Promise.all([
            CallLog.countDocuments({
                caretakerId: { $in: callerIds },
                scheduledTime: { $gte: start, $lte: end },
            }),
            CallLog.countDocuments({
                caretakerId: { $in: callerIds },
                scheduledTime: { $gte: start, $lte: end },
                status: 'completed',
            }),
            CallLog.countDocuments({
                caretakerId: { $in: callerIds },
                scheduledTime: { $gte: start, $lte: end },
                status: { $in: ['missed', 'no_answer'] },
            }),
        ]);

        const completionRate = totalCalls > 0
            ? Math.round((completedCalls / totalCalls) * 100)
            : 0;

        // Open escalations
        const openEscalations = await Escalation.countDocuments({
            $or: [
                { assignedTo: mgr._id },
                { caretakerId: { $in: callerIds } },
            ],
            status: { $in: ['open', 'acknowledged', 'in_progress'] },
        });

        const escalationNote = openEscalations > 0
            ? ` ${openEscalations} escalation${openEscalations > 1 ? 's' : ''} still open.`
            : ' No open escalations.';

        const emoji = completionRate >= 90 ? 'Excellent' : completionRate >= 70 ? 'Good' : 'Needs Review';

        await sendPush(mgr._id, {
            title: `Day Summary — ${completionRate}% Completion`,
            body: `${completedCalls}/${totalCalls} calls completed, ${missedCalls} missed. ${callerIds.length} caller${callerIds.length !== 1 ? 's' : ''} active today.${escalationNote}`,
            type: 'shift_reminder',
            priority: 'normal',
            data: { screen: 'CareManagerDashboard', summary: true, schedulerEvent: 'mgr_eod_summary_default' },
        });

        console.log(`[ManagerScheduler] EOD summary sent to ${mgr.fullName} (${completionRate}% completion)`);
    }
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULER RUNNER
// ═══════════════════════════════════════════════════════════════

let schedulerInterval = null;

async function runManagerSchedulerCycle() {
    try {
        if (mongoose.connection.readyState !== 1) return;
        const managers = await getActiveCareManagers();
        if (managers.length === 0) return;

        await checkMorningBriefing(managers);
        await checkUnassignedPatients(managers);
        await checkCallerInactivity(managers);
        await checkCapacityWarning(managers);
        await checkEndOfDaySummary(managers);
    } catch (err) {
        console.error('[ManagerScheduler] Cycle error:', err.message);
    }
}

function startManagerScheduler(intervalMs = 5 * 60 * 1000) {
    if (schedulerInterval) return;

    console.log('[ManagerScheduler] Care manager notification scheduler started (interval: ' + (intervalMs / 1000) + 's)');

    // Run first cycle after 45s delay (let server fully boot, stagger from caller scheduler)
    setTimeout(() => {
        runManagerSchedulerCycle();
        schedulerInterval = setInterval(runManagerSchedulerCycle, intervalMs);
    }, 45000);
}

function stopManagerScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('[ManagerScheduler] Stopped');
    }
}

module.exports = { startManagerScheduler, stopManagerScheduler, runManagerSchedulerCycle };
