/**
 * Caller Failover Service
 * Automatically redistributes patients when callers are absent.
 *
 * Case 1 — Temporary absence (no calls 30 min into shift):
 *   Creates isTemporary: true assignments, reverts at shift end.
 *
 * Case 2 — Permanent removal (caller deactivated):
 *   Deletes old assignments, runs round-robin reassignment.
 */
const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const Patient = require('../models/Patient');
const CallLog = require('../models/CallLog');
const CaretakerPatient = require('../models/CaretakerPatient');
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

function getShiftBounds() {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

function getShiftLabel(shift) {
    return shift === 'morning' ? 'Morning' : shift === 'afternoon' ? 'Afternoon' : 'Night';
}

// ── DB-level deduplication ───────────────────────────────────
async function alreadyHandled(eventKey) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const existing = await Notification.findOne({
        'data.failoverEvent': eventKey,
        createdAt: { $gte: startOfToday },
    });
    return !!existing;
}

// ═══════════════════════════════════════════════════════════════
// CASE 1: SHIFT-LEVEL AUTO-COVERAGE (TEMPORARY)
// ═══════════════════════════════════════════════════════════════

/**
 * Main check — runs every 5 min, acts only during the 30-40 min window
 * after each shift starts (8:30, 12:30, 17:30 IST).
 */
async function checkShiftCoverage() {
    const ist = getISTDate();
    const hour = ist.getHours();
    const min = ist.getMinutes();

    // Coverage check: 30-40 min into each shift
    const isCoverageWindow = (
        (hour === 8 && min >= 30 && min < 40) ||
        (hour === 12 && min >= 30 && min < 40) ||
        (hour === 17 && min >= 30 && min < 40)
    );

    // Revert check: last 10 min of each shift
    const isRevertWindow = (
        (hour === 11 && min >= 50) ||
        (hour === 16 && min >= 50) ||
        (hour === 20 && min >= 50)
    );

    if (isCoverageWindow) {
        await activateTemporaryCoverage();
    }

    if (isRevertWindow) {
        await revertTemporaryAssignments();
    }
}

/**
 * Detect absent callers and redistribute their patients.
 */
async function activateTemporaryCoverage() {
    const shift = getCurrentShift();
    const eventKey = `failover_coverage_${shift}`;
    if (await alreadyHandled(eventKey)) return;

    try {
        const { start, end } = getShiftBounds();

        // Get all organizations
        const Organization = require('../models/Organization');
        const orgs = await Organization.find({ isActive: { $ne: false } }).select('_id').lean();

        for (const org of orgs) {
            await activateCoverageForOrg(org._id, shift, start, end);
        }
    } catch (err) {
        console.error('[Failover] Coverage check error:', err.message);
    }
}

async function activateCoverageForOrg(orgId, shift, dayStart, dayEnd) {
    // 1. Get all active callers in this org
    const allCallers = await Profile.find({
        organizationId: orgId,
        role: { $in: ['caller', 'caretaker'] },
        isActive: { $ne: false },
    }).select('_id fullName managedBy').lean();

    if (allCallers.length <= 1) return; // Need at least 2 callers for redistribution

    const callerIds = allCallers.map(c => c._id);

    // 2. Find which callers have made calls today
    const callersWithCalls = await CallLog.distinct('caretakerId', {
        caretakerId: { $in: callerIds },
        scheduledTime: { $gte: dayStart, $lte: dayEnd },
        status: { $in: ['completed', 'in_progress'] },
    });
    const activeCallerSet = new Set(callersWithCalls.map(id => id.toString()));

    // 3. Find absent callers (have assignments but 0 calls)
    const absentCallers = [];
    for (const caller of allCallers) {
        if (activeCallerSet.has(caller._id.toString())) continue;

        // Check if this caller has any assigned patients
        const assignmentCount = await CaretakerPatient.countDocuments({
            caretakerId: caller._id,
            status: 'active',
            isTemporary: { $ne: true },
        });

        if (assignmentCount > 0) {
            absentCallers.push(caller);
        }
    }

    if (absentCallers.length === 0) return; // All callers are active

    // 4. Get active callers (the ones who HAVE made calls)
    const activeCallers = allCallers.filter(c => activeCallerSet.has(c._id.toString()));
    if (activeCallers.length === 0) {
        // ALL callers are absent — notify care manager but can't redistribute
        await notifyCareManagerAllAbsent(orgId, absentCallers.length, shift);
        return;
    }

    // 5. Get current patient counts for active callers (for load balancing)
    const countAgg = await CaretakerPatient.aggregate([
        { $match: { caretakerId: { $in: activeCallers.map(c => c._id) }, status: 'active' } },
        { $group: { _id: '$caretakerId', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    countAgg.forEach(c => { countMap[c._id.toString()] = c.count; });

    const callerSlots = activeCallers.map(c => ({
        id: c._id,
        name: c.fullName,
        count: countMap[c._id.toString()] || 0,
    }));

    // 6. For each absent caller, redistribute their patients
    for (const absentCaller of absentCallers) {
        const absentEventKey = `failover_${absentCaller._id}_${shift}`;
        if (await alreadyHandled(absentEventKey)) continue;

        const assignments = await CaretakerPatient.find({
            caretakerId: absentCaller._id,
            status: 'active',
            isTemporary: { $ne: true },
        }).select('patientId').lean();

        const patientIds = assignments.map(a => a.patientId);
        if (patientIds.length === 0) continue;

        // Check if patients already have temp coverage today
        const existingTemp = await CaretakerPatient.find({
            patientId: { $in: patientIds },
            isTemporary: true,
            createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        }).select('patientId').lean();
        const alreadyCoveredSet = new Set(existingTemp.map(t => t.patientId.toString()));

        const uncoveredPatients = patientIds.filter(id => !alreadyCoveredSet.has(id.toString()));
        if (uncoveredPatients.length === 0) continue;

        // 7. Round-robin distribute to active callers
        let assignedCount = 0;
        const coveringCallerIds = new Set();

        for (const patientId of uncoveredPatients) {
            callerSlots.sort((a, b) => a.count - b.count);
            const target = callerSlots[0];

            try {
                await CaretakerPatient.create({
                    caretakerId: target.id,
                    patientId: patientId,
                    careManagerId: absentCaller.managedBy || null,
                    assignedBy: target.id,
                    status: 'active',
                    isTemporary: true,
                    priority: 8, // Higher priority so they show up first
                    schedule: { startDate: new Date() },
                    careInstructions: `Temporary coverage for ${absentCaller.fullName} (${getShiftLabel(shift)} shift)`,
                });

                target.count += 1;
                assignedCount++;
                coveringCallerIds.add(target.id.toString());
            } catch (err) {
                // Duplicate key = patient already has assignment to this caller, skip
                if (err.code !== 11000) {
                    console.error(`[Failover] Failed to create temp assignment:`, err.message);
                }
            }
        }

        if (assignedCount === 0) continue;

        console.log(`[Failover] ${absentCaller.fullName} absent — ${assignedCount} patients redistributed to ${coveringCallerIds.size} callers`);

        // 8. Notify care manager
        const careManagerId = absentCaller.managedBy;
        if (careManagerId) {
            await sendPush(careManagerId, {
                title: 'Caller Coverage Activated',
                body: `${absentCaller.fullName} has not made any calls this ${shift} shift. ${assignedCount} patient${assignedCount !== 1 ? 's have' : ' has'} been temporarily redistributed to ${coveringCallerIds.size} active caller${coveringCallerIds.size !== 1 ? 's' : ''}.`,
                type: 'caller_coverage',
                priority: 'high',
                data: {
                    screen: 'TeamList',
                    absentCallerId: absentCaller._id.toString(),
                    failoverEvent: absentEventKey,
                },
            });
        }

        // 9. Notify covering callers
        for (const coveringId of coveringCallerIds) {
            const coverCount = await CaretakerPatient.countDocuments({
                caretakerId: new mongoose.Types.ObjectId(coveringId),
                isTemporary: true,
                createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            });

            await sendPush(new mongoose.Types.ObjectId(coveringId), {
                title: 'Temporary Patients Added',
                body: `${coverCount} additional patient${coverCount !== 1 ? 's' : ''} from ${absentCaller.fullName} added to your queue for this shift.`,
                type: 'caller_coverage',
                priority: 'normal',
                data: {
                    screen: 'CallerDashboard',
                    failoverEvent: `cover_notify_${coveringId}_${shift}`,
                },
            });
        }
    }
}

/**
 * Notify care manager when ALL callers are absent.
 */
async function notifyCareManagerAllAbsent(orgId, absentCount, shift) {
    const eventKey = `failover_all_absent_${orgId}_${shift}`;
    if (await alreadyHandled(eventKey)) return;

    const careManagers = await Profile.find({
        organizationId: orgId,
        role: 'care_manager',
        isActive: { $ne: false },
    }).select('_id').lean();

    for (const mgr of careManagers) {
        await sendPush(mgr._id, {
            title: 'All Callers Inactive',
            body: `No callers have started their ${shift} shift. ${absentCount} caller${absentCount !== 1 ? 's are' : ' is'} absent. Patients are not being contacted. Immediate action required.`,
            type: 'caller_coverage',
            priority: 'urgent',
            data: {
                screen: 'TeamList',
                failoverEvent: eventKey,
            },
        });
    }

    console.log(`[Failover] ALL callers absent in org ${orgId} — care managers notified`);
}

// ═══════════════════════════════════════════════════════════════
// REVERT TEMPORARY ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════

/**
 * Clean up all temporary assignments at shift end.
 * Called during the last 10 min of each shift.
 */
async function revertTemporaryAssignments() {
    const shift = getCurrentShift();
    const revertKey = `failover_revert_${shift}`;
    if (await alreadyHandled(revertKey)) return;

    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        // Find and delete all temp assignments created today
        const tempAssignments = await CaretakerPatient.find({
            isTemporary: true,
            createdAt: { $gte: startOfToday },
        }).lean();

        if (tempAssignments.length === 0) return;

        const result = await CaretakerPatient.deleteMany({
            isTemporary: true,
            createdAt: { $gte: startOfToday },
        });

        console.log(`[Failover] Reverted ${result.deletedCount} temporary assignments at ${shift} shift end`);

        // Notify care managers about the revert
        const orgIds = [...new Set(tempAssignments.map(a => a.careManagerId?.toString()).filter(Boolean))];

        // Get unique org IDs through the assignments
        const affectedCallerIds = [...new Set(tempAssignments.map(a => a.caretakerId.toString()))];
        const affectedCallers = await Profile.find({
            _id: { $in: affectedCallerIds },
        }).select('organizationId managedBy').lean();

        const managerIds = [...new Set(affectedCallers.map(c => c.managedBy?.toString()).filter(Boolean))];

        for (const mgrId of managerIds) {
            await sendPush(new mongoose.Types.ObjectId(mgrId), {
                title: 'Coverage Reverted',
                body: `Temporary patient coverage from the ${shift} shift has been reverted. ${tempAssignments.length} patient${tempAssignments.length !== 1 ? 's' : ''} returned to their original callers.`,
                type: 'coverage_revert',
                priority: 'normal',
                data: {
                    screen: 'CareManagerDashboard',
                    failoverEvent: revertKey,
                },
            });
        }
    } catch (err) {
        console.error('[Failover] Revert error:', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// CASE 2: PERMANENT REMOVAL (RESIGNATION/DEACTIVATION)
// ═══════════════════════════════════════════════════════════════

/**
 * Called when a caller is deactivated (isActive = false).
 * Permanently reassigns all their patients via round-robin.
 */
async function handleCallerDeactivation(callerId, orgId) {
    try {
        const caller = await Profile.findById(callerId).select('fullName managedBy').lean();
        if (!caller) return { reassigned: 0 };

        // 1. Get all active assignments for this caller
        const assignments = await CaretakerPatient.find({
            caretakerId: callerId,
            status: 'active',
        }).lean();

        if (assignments.length === 0) return { reassigned: 0 };

        // 2. Terminate all assignments
        await CaretakerPatient.updateMany(
            { caretakerId: callerId, status: 'active' },
            { $set: { status: 'terminated' } }
        );

        // 3. Also delete any temp assignments for this caller
        await CaretakerPatient.deleteMany({
            caretakerId: callerId,
            isTemporary: true,
        });

        console.log(`[Failover] Terminated ${assignments.length} assignments for deactivated caller ${caller.fullName}`);

        // 4. Run round-robin reassignment for the org
        const { autoAssignPatients } = require('../utils/autoAssign');
        const result = await autoAssignPatients(orgId);

        // 5. Notify care manager
        const careManagerId = caller.managedBy;
        if (careManagerId) {
            await sendPush(careManagerId, {
                title: 'Caller Removed — Patients Reassigned',
                body: `${caller.fullName} has been deactivated. ${assignments.length} patient${assignments.length !== 1 ? 's have' : ' has'} been permanently reassigned to other callers.`,
                type: 'caller_coverage',
                priority: 'urgent',
                data: {
                    screen: 'TeamList',
                    deactivatedCallerId: callerId.toString(),
                },
            });
        }

        return { reassigned: result.assigned, terminated: assignments.length };
    } catch (err) {
        console.error('[Failover] Deactivation handler error:', err.message);
        return { reassigned: 0, error: err.message };
    }
}

// ═══════════════════════════════════════════════════════════════
// STARTUP CLEANUP
// ═══════════════════════════════════════════════════════════════

/**
 * Clean up any stale temporary assignments from previous days
 * (in case the server crashed before shift-end revert).
 */
async function cleanupStaleTemporaryAssignments() {
    try {
        if (mongoose.connection.readyState !== 1) return;
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const result = await CaretakerPatient.deleteMany({
            isTemporary: true,
            createdAt: { $lt: startOfToday },
        });

        if (result.deletedCount > 0) {
            console.log(`[Failover] Cleaned up ${result.deletedCount} stale temporary assignments from previous days`);
        }
    } catch (err) {
        console.error('[Failover] Stale cleanup error:', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULER
// ═══════════════════════════════════════════════════════════════

let failoverInterval = null;

async function runFailoverCycle() {
    try {
        if (mongoose.connection.readyState !== 1) return;
        await checkShiftCoverage();
    } catch (err) {
        console.error('[Failover] Cycle error:', err.message);
    }
}

function startFailoverService(intervalMs = 5 * 60 * 1000) {
    if (failoverInterval) return;

    console.log(`[Failover] Caller failover service started (interval: ${intervalMs / 1000}s)`);

    // Clean up stale temp assignments on startup
    cleanupStaleTemporaryAssignments();

    // Start checking after 60s delay (let other schedulers boot first)
    setTimeout(() => {
        runFailoverCycle();
        failoverInterval = setInterval(runFailoverCycle, intervalMs);
    }, 60000);
}

function stopFailoverService() {
    if (failoverInterval) {
        clearInterval(failoverInterval);
        failoverInterval = null;
        console.log('[Failover] Stopped');
    }
}

module.exports = {
    startFailoverService,
    stopFailoverService,
    handleCallerDeactivation,
    checkShiftCoverage,
    revertTemporaryAssignments,
    cleanupStaleTemporaryAssignments,
};
