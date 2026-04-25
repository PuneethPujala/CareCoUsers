const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const Patient = require('../models/Patient');
const CaretakerPatient = require('../models/CaretakerPatient');
const Notification = require('../models/Notification');

/**
 * Auto Round-Robin Assignment
 * Automatically assigns unassigned patients in an org to available callers.
 * Uses round-robin: assigns to the caller with the fewest current patients.
 * 
 * Called:
 * - On server startup
 * - When a new patient is created
 * - Periodically via cron (optional)
 */
async function autoAssignPatients(orgId) {
    if (!orgId) return { assigned: 0, unassigned: 0 };

    try {
        const orgIdStr = orgId.toString();

        // 1. Get all active callers in this org
        const callers = await Profile.find({
            organizationId: orgId,
            role: { $in: ['caller', 'caretaker'] },
            isActive: { $ne: false },
        }).select('_id fullName').lean();

        if (callers.length === 0) {
            console.log(`[RoundRobin] No callers found in org ${orgIdStr}`);
            return { assigned: 0, unassigned: 0, error: 'no_callers' };
        }

        // 2. Get all active patients in this org (from Patient collection)
        const orgPatients = await Patient.find({
            organization_id: orgId,
            is_active: true,
        }).select('_id name').lean();

        // Also check Profile collection for patients
        const orgProfilePatients = await Profile.find({
            organizationId: orgId,
            role: 'patient',
            isActive: { $ne: false },
        }).select('_id fullName').lean();

        // Merge patient IDs (dedup)
        const allPatientMap = {};
        for (const p of orgPatients) {
            allPatientMap[p._id.toString()] = p.name;
        }
        for (const p of orgProfilePatients) {
            if (!allPatientMap[p._id.toString()]) {
                allPatientMap[p._id.toString()] = p.fullName;
            }
        }

        const allPatientIds = Object.keys(allPatientMap);
        if (allPatientIds.length === 0) {
            return { assigned: 0, unassigned: 0 };
        }

        // 3. Find already-assigned patients
        const existingAssignments = await CaretakerPatient.find({
            patientId: { $in: allPatientIds.map(id => new mongoose.Types.ObjectId(id)) },
            status: 'active',
        }).select('patientId caretakerId').lean();

        const assignedSet = new Set(existingAssignments.map(a => a.patientId.toString()));

        // 4. Find unassigned patients
        const unassignedIds = allPatientIds.filter(id => !assignedSet.has(id));
        if (unassignedIds.length === 0) {
            console.log(`[RoundRobin] All ${allPatientIds.length} patients in org ${orgIdStr} are assigned`);
            return { assigned: 0, unassigned: 0 };
        }

        // 5. Get current assignment counts per caller
        const callerIds = callers.map(c => c._id);
        const countAgg = await CaretakerPatient.aggregate([
            { $match: { caretakerId: { $in: callerIds }, status: 'active' } },
            { $group: { _id: '$caretakerId', count: { $sum: 1 } } },
        ]);
        const countMap = {};
        countAgg.forEach(c => { countMap[c._id.toString()] = c.count; });

        const callerSlots = callers.map(c => ({
            id: c._id,
            name: c.fullName,
            count: countMap[c._id.toString()] || 0,
        }));

        // 6. Round-robin assign
        let assignedCount = 0;
        for (const patientId of unassignedIds) {
            // Sort by fewest patients (round-robin)
            callerSlots.sort((a, b) => a.count - b.count);
            const target = callerSlots[0];

            try {
                // Resolve the caller's care manager for patient app visibility
                const callerProfile = await Profile.findById(target.id).select('managedBy').lean();
                const callerManagerId = callerProfile?.managedBy || null;

                await CaretakerPatient.create({
                    caretakerId: target.id,
                    patientId: new mongoose.Types.ObjectId(patientId),
                    careManagerId: callerManagerId,
                    assignedBy: target.id, // auto-assigned
                    status: 'active',
                    priority: 5,
                    schedule: { startDate: new Date() },
                    careInstructions: 'Auto-assigned via round-robin',
                });

                // Sync with Patient model for users app visibility
                const patientUpdate = { 
                    assigned_caller_id: target.id,
                    caller_id: target.id 
                };
                if (callerManagerId) {
                    patientUpdate.care_manager_id = callerManagerId;
                    patientUpdate.assigned_manager_id = callerManagerId;
                }
                await Patient.updateOne(
                    { _id: new mongoose.Types.ObjectId(patientId) },
                    { $set: patientUpdate }
                );

                target.count += 1;
                assignedCount++;
                console.log(`[RoundRobin] Assigned ${allPatientMap[patientId]} -> ${target.name} (now ${target.count} patients)`);
            } catch (err) {
                console.error(`[RoundRobin] Failed to assign patient ${patientId}:`, err.message);
            }
        }

        // 7. If there are still unassigned patients (callers at capacity), alert care managers
        const stillUnassigned = unassignedIds.length - assignedCount;
        if (stillUnassigned > 0) {
            const careManagers = await Profile.find({
                organizationId: orgId,
                role: 'care_manager',
                isActive: { $ne: false },
            }).select('_id').lean();

            for (const mgr of careManagers) {
                try {
                    await Notification.create({
                        recipientId: mgr._id,
                        senderId: mgr._id,
                        organizationId: orgId,
                        type: 'system_alert',
                        channel: 'in_app',
                        title: 'Unassigned Patients Alert',
                        body: `${stillUnassigned} patient(s) could not be auto-assigned. All callers may be at capacity.`,
                        priority: 'high',
                        data: { screen: 'PatientAssignment' },
                    });
                } catch (e) { /* ignore */ }
            }
        }

        console.log(`[RoundRobin] Org ${orgIdStr}: Assigned ${assignedCount}/${unassignedIds.length} patients`);
        return { assigned: assignedCount, unassigned: stillUnassigned };
    } catch (error) {
        console.error('[RoundRobin] Auto-assignment error:', error);
        return { assigned: 0, unassigned: 0, error: error.message };
    }
}

/**
 * Run auto-assignment for ALL organizations on startup.
 */
async function runAutoAssignmentForAllOrgs() {
    try {
        const Organization = require('../models/Organization');
        const orgs = await Organization.find({ isActive: { $ne: false } }).select('_id name').lean();
        console.log(`[RoundRobin] Running auto-assignment for ${orgs.length} organizations...`);

        let totalAssigned = 0;
        for (const org of orgs) {
            const result = await autoAssignPatients(org._id);
            totalAssigned += result.assigned;
        }
        console.log(`[RoundRobin] Startup complete. Total patients assigned: ${totalAssigned}`);
    } catch (error) {
        console.error('[RoundRobin] Startup assignment error:', error);
    }
}

module.exports = { autoAssignPatients, runAutoAssignmentForAllOrgs };
