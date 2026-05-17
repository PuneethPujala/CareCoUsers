/**
 * Caller Notification Scheduler
 * Runs periodically to check for caller-relevant events and sends push notifications.
 * Non-spammy: uses tracking to avoid duplicate sends.
 */
const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const Patient = require('../models/Patient');
const CallLog = require('../models/CallLog');
const CaretakerPatient = require('../models/CaretakerPatient');
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

function getShiftLabel(shift) {
    return shift === 'morning' ? 'Morning' : shift === 'afternoon' ? 'Afternoon' : 'Night';
}

// Track what we've already sent to avoid spam
// Key: `${callerProfileId}_${eventType}_${shift}_${dateStr}`
const sentTracker = new Map();

function alreadySent(callerId, eventType, shift) {
    const dateStr = new Date().toISOString().split('T')[0];
    const key = `${callerId}_${eventType}_${shift}_${dateStr}`;
    return sentTracker.has(key);
}

function markSent(callerId, eventType, shift) {
    const dateStr = new Date().toISOString().split('T')[0];
    const key = `${callerId}_${eventType}_${shift}_${dateStr}`;
    sentTracker.set(key, Date.now());

    // Cleanup old entries (older than 24h)
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [k, v] of sentTracker) {
        if (v < cutoff) sentTracker.delete(k);
    }
}

// ── Get today's start/end ────────────────────────────────────
function getTodayBounds() {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

// ── Find all active callers ──────────────────────────────────
async function getActiveCallers() {
    return Profile.find({
        role: { $in: ['caretaker', 'caller'] },
        isActive: { $ne: false },
    }).select('_id fullName').lean();
}

// ── Get assigned patients for a caller ───────────────────────
async function getAssignedPatients(callerId) {
    const assignments = await CaretakerPatient.find({
        caretakerId: callerId,
        isActive: true,
    }).select('patientId').lean();

    const patientIds = assignments.map(a => a.patientId);
    if (patientIds.length === 0) return [];

    return Patient.find({
        $or: [
            { _id: { $in: patientIds } },
            { profile_id: { $in: patientIds } },
        ],
        isActive: { $ne: false },
    }).select('_id profile_id name medications').lean();
}

// ── Count today's completed calls for a caller ───────────────
async function getTodayCallCount(callerId) {
    const { start, end } = getTodayBounds();
    return CallLog.countDocuments({
        caretakerId: callerId,
        scheduledTime: { $gte: start, $lte: end },
        status: { $in: ['completed', 'no_answer', 'missed'] },
    });
}

// ── Count uncalled patients today ────────────────────────────
async function getUncalledCount(callerId, patients) {
    const { start, end } = getTodayBounds();
    const patientIds = patients.map(p => p._id);

    const calledPatientIds = await CallLog.distinct('patientId', {
        caretakerId: callerId,
        scheduledTime: { $gte: start, $lte: end },
        status: { $in: ['completed', 'no_answer', 'missed'] },
    });

    const calledSet = new Set(calledPatientIds.map(id => id.toString()));
    return patientIds.filter(id => !calledSet.has(id.toString())).length;
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATION EVENTS
// ═══════════════════════════════════════════════════════════════

/**
 * 1. SHIFT START — Notify callers when a new shift begins
 */
async function checkShiftStart(callers) {
    const shift = getCurrentShift();
    const ist = getISTDate();
    const hour = ist.getHours();
    const min = ist.getMinutes();

    // Only trigger in the first 10 minutes of a shift
    const isShiftStart = (
        (shift === 'morning' && hour >= 8 && hour === 8 && min < 10) ||
        (shift === 'afternoon' && hour === 12 && min < 10) ||
        (shift === 'night' && hour === 17 && min < 10)
    );

    if (!isShiftStart) return;

    for (const caller of callers) {
        if (alreadySent(caller._id, 'shift_start', shift)) continue;

        const patients = await getAssignedPatients(caller._id);
        const patientCount = patients.length;

        if (patientCount === 0) continue;

        await sendPush(caller._id, {
            title: `${getShiftLabel(shift)} Shift Started 🌅`,
            body: `You have ${patientCount} patient${patientCount > 1 ? 's' : ''} to call this shift. Let's go!`,
            type: 'shift_reminder',
            priority: 'normal',
            data: { screen: 'CallerDashboard', shift },
        });

        markSent(caller._id, 'shift_start', shift);
        console.log(`[Scheduler] Shift start notification sent to ${caller.fullName}`);
    }
}

/**
 * 2. PATIENTS WAITING — 15 min into shift, if uncalled patients exist
 */
async function checkPatientsWaiting(callers) {
    const shift = getCurrentShift();
    const ist = getISTDate();
    const hour = ist.getHours();
    const min = ist.getMinutes();

    // 15 minutes into shift
    const is15Min = (
        (shift === 'morning' && hour === 8 && min >= 15 && min < 25) ||
        (shift === 'afternoon' && hour === 12 && min >= 15 && min < 25) ||
        (shift === 'night' && hour === 17 && min >= 15 && min < 25)
    );

    if (!is15Min) return;

    for (const caller of callers) {
        if (alreadySent(caller._id, 'patients_waiting', shift)) continue;

        const patients = await getAssignedPatients(caller._id);
        const uncalled = await getUncalledCount(caller._id, patients);

        if (uncalled === 0) continue;

        await sendPush(caller._id, {
            title: `${uncalled} Patient${uncalled > 1 ? 's' : ''} Waiting 📋`,
            body: `${uncalled} patient${uncalled > 1 ? 's haven\'t' : ' hasn\'t'} been contacted yet this ${shift} shift.`,
            type: 'call_reminder',
            priority: 'high',
            data: { screen: 'CallerDashboard', shift },
        });

        markSent(caller._id, 'patients_waiting', shift);
        console.log(`[Scheduler] Patients waiting notification sent to ${caller.fullName}`);
    }
}

/**
 * 3. CALL REMINDER — 45 min into shift, stronger nudge
 */
async function checkCallReminder(callers) {
    const shift = getCurrentShift();
    const ist = getISTDate();
    const hour = ist.getHours();
    const min = ist.getMinutes();

    // 45 minutes into shift
    const is45Min = (
        (shift === 'morning' && hour === 8 && min >= 45 && min < 55) ||
        (shift === 'afternoon' && hour === 12 && min >= 45 && min < 55) ||
        (shift === 'night' && hour === 17 && min >= 45 && min < 55)
    );

    if (!is45Min) return;

    for (const caller of callers) {
        if (alreadySent(caller._id, 'call_reminder', shift)) continue;

        const patients = await getAssignedPatients(caller._id);
        const uncalled = await getUncalledCount(caller._id, patients);

        if (uncalled === 0) continue;

        await sendPush(caller._id, {
            title: `Action Needed ⚡`,
            body: `${uncalled} patient${uncalled > 1 ? 's' : ''} still pending in your ${getShiftLabel(shift).toLowerCase()} queue. Patients are waiting for medication confirmation.`,
            type: 'call_overdue',
            priority: 'urgent',
            data: { screen: 'CallerDashboard', shift },
        });

        markSent(caller._id, 'call_reminder', shift);
        console.log(`[Scheduler] Call reminder notification sent to ${caller.fullName}`);
    }
}

/**
 * 4. SHIFT SUMMARY — Near the end of a shift
 */
async function checkShiftSummary(callers) {
    const shift = getCurrentShift();
    const ist = getISTDate();
    const hour = ist.getHours();
    const min = ist.getMinutes();

    // Last 10 minutes of shift
    const isShiftEnd = (
        (shift === 'morning' && hour === 11 && min >= 50) ||
        (shift === 'afternoon' && hour === 16 && min >= 50) ||
        (shift === 'night' && hour === 20 && min >= 50)
    );

    if (!isShiftEnd) return;

    for (const caller of callers) {
        if (alreadySent(caller._id, 'shift_summary', shift)) continue;

        const callCount = await getTodayCallCount(caller._id);
        const patients = await getAssignedPatients(caller._id);
        const uncalled = await getUncalledCount(caller._id, patients);

        await sendPush(caller._id, {
            title: `${getShiftLabel(shift)} Shift Wrapping Up 📊`,
            body: `Great work! ${callCount} call${callCount !== 1 ? 's' : ''} completed. ${uncalled > 0 ? `${uncalled} patient${uncalled > 1 ? 's' : ''} still pending.` : 'All patients contacted! 🎉'}`,
            type: 'shift_reminder',
            priority: 'normal',
            data: { screen: 'CallerDashboard', shift, summary: true },
        });

        markSent(caller._id, 'shift_summary', shift);
        console.log(`[Scheduler] Shift summary notification sent to ${caller.fullName}`);
    }
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULER RUNNER
// ═══════════════════════════════════════════════════════════════

let schedulerInterval = null;

async function runSchedulerCycle() {
    try {
        const callers = await getActiveCallers();
        if (callers.length === 0) return;

        await checkShiftStart(callers);
        await checkPatientsWaiting(callers);
        await checkCallReminder(callers);
        await checkShiftSummary(callers);
    } catch (err) {
        console.error('[Scheduler] Cycle error:', err.message);
    }
}

function startScheduler(intervalMs = 5 * 60 * 1000) {
    if (schedulerInterval) return;

    console.log('[Scheduler] Caller notification scheduler started (interval: ' + (intervalMs / 1000) + 's)');
    
    // Run first cycle after 30s delay (let server fully boot)
    setTimeout(() => {
        runSchedulerCycle();
        schedulerInterval = setInterval(runSchedulerCycle, intervalMs);
    }, 30000);
}

function stopScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('[Scheduler] Stopped');
    }
}

module.exports = { startScheduler, stopScheduler, runSchedulerCycle };
