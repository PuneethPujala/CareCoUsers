const Patient = require('../models/Patient');
const Profile = require('../models/Profile');
const CaretakerPatient = require('../models/CaretakerPatient');

/**
 * Reconcile unassigned patients in an organization by auto-assigning
 * them to the least-loaded callers using round-robin.
 * 
 * @param {string} orgId - Organization ID to reconcile
 * @param {string} assignedById - Profile ID of the user triggering reconciliation
 * @returns {Object} { assigned, remaining, message }
 */
async function reconcileUnassignedPatients(orgId, assignedById) {
    if (!orgId) {
        return { assigned: 0, remaining: 0, message: 'No organization ID provided' };
    }

    // 1. Find all patients in this org that have NO active caretaker assignment
    const assignedPatientIds = await CaretakerPatient.find({ status: 'active' }).distinct('patientId');
    const unassignedPatients = await Patient.find({
        organization_id: orgId,
        is_active: true,
        _id: { $nin: assignedPatientIds }
    });

    if (unassignedPatients.length === 0) {
        return { assigned: 0, remaining: 0, message: 'All patients are already assigned' };
    }

    // 2. Get all active callers in this org (with their managedBy info)
    const allCallers = await Profile.find({
        organizationId: orgId,
        role: { $in: ['caller', 'caretaker'] },
        isActive: { $ne: false }
    }).select('_id fullName managedBy');

    if (allCallers.length === 0) {
        return { 
            assigned: 0, 
            remaining: unassignedPatients.length, 
            message: 'No available callers in this organization' 
        };
    }

    // 3. Get current assignment counts per caller
    const callerIds = allCallers.map(c => c._id);
    const counts = await CaretakerPatient.aggregate([
        { $match: { caretakerId: { $in: callerIds }, status: 'active' } },
        { $group: { _id: '$caretakerId', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    counts.forEach(d => { countMap[d._id.toString()] = d.count; });

    let assignedCount = 0;

    // 4. Assign each unassigned patient to the least-loaded caller,
    //    preferring callers under the patient's existing care manager
    for (const patient of unassignedPatients) {
        const existingManagerId = patient.care_manager_id || patient.assigned_manager_id || null;

        // Filter callers: prefer same-manager callers if patient has an existing manager
        let eligibleCallers = allCallers;
        if (existingManagerId) {
            const sameManagerCallers = allCallers.filter(c =>
                c.managedBy && c.managedBy.toString() === existingManagerId.toString()
            );
            // Only use same-manager pool if it has available callers
            if (sameManagerCallers.length > 0) {
                eligibleCallers = sameManagerCallers;
            }
        }

        // Find least-loaded caller from the eligible pool
        let bestCaller = eligibleCallers[0];
        let bestCount = countMap[bestCaller._id.toString()] || 0;
        for (const c of eligibleCallers) {
            const cc = countMap[c._id.toString()] || 0;
            if (cc < bestCount) { bestCount = cc; bestCaller = c; }
        }

        // Stop if all callers are at capacity
        if (bestCount >= 30) {
            console.warn('[Reconciliation] All callers at capacity (30), stopping');
            break;
        }

        // Resolve the care manager: use existing patient manager, or fall back to caller's managedBy
        const resolvedManagerId = existingManagerId || bestCaller.managedBy || assignedById;

        // Direct upsert — bypasses Profile-only validation in caretakerService
        await CaretakerPatient.findOneAndUpdate(
            { caretakerId: bestCaller._id, patientId: patient._id },
            {
                caretakerId: bestCaller._id,
                patientId: patient._id,
                careManagerId: resolvedManagerId,
                assignedBy: assignedById,
                status: 'active',
                notes: [{ 
                    content: 'System Auto-Assigned (Continuous Reconciliation)', 
                    addedBy: assignedById 
                }],
                schedule: { startDate: new Date() }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Mirror assignments directly onto the Profile and Patient documents for User App compatability!
        try {
            await Profile.findByIdAndUpdate(patient._id, {
                caller_id: bestCaller._id,
                assigned_caller_id: bestCaller._id,
                care_manager_id: resolvedManagerId,
                assigned_manager_id: resolvedManagerId,
            });
            await Patient.findByIdAndUpdate(patient._id, {
                caller_id: bestCaller._id,
                assigned_caller_id: bestCaller._id,
                care_manager_id: resolvedManagerId,
                assigned_manager_id: resolvedManagerId,
            });
        } catch (e) {
            console.error('[Reconciliation] Failed to mirror ID to patient:', e.message);
        }

        countMap[bestCaller._id.toString()] = (countMap[bestCaller._id.toString()] || 0) + 1;
        assignedCount++;
        console.log(`[Reconciliation] Patient ${patient.name} -> Caller ${bestCaller.fullName} (manager preserved: ${resolvedManagerId})`);
    }

    return {
        assigned: assignedCount,
        remaining: unassignedPatients.length - assignedCount,
        message: `Reconciliation complete: ${assignedCount} patients auto-assigned`
    };
}

module.exports = { reconcileUnassignedPatients };
