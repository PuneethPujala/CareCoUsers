/**
 * One-time data fix: Re-sync care_manager_id on Patient documents
 * 
 * Problem: Previous failover/reconciliation events may have overwritten
 * patients' care_manager_id with the wrong manager when callers were
 * reassigned across manager boundaries.
 * 
 * Fix: For each active CaretakerPatient assignment, look up the caller's
 * managedBy (care manager) and ensure the Patient document reflects it.
 * 
 * Usage:
 *   cd backend
 *   node scripts/fix_care_manager_sync.js
 * 
 * Requires MONGODB_URI in .env
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Profile = require('../src/models/Profile');
const Patient = require('../src/models/Patient');
const CaretakerPatient = require('../src/models/CaretakerPatient');

async function fixCareManagerSync() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI not set in .env');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('[Fix] Connected to MongoDB');

    try {
        // 1. Get all active (non-temporary) assignments
        const activeAssignments = await CaretakerPatient.find({
            status: 'active',
            isTemporary: { $ne: true },
        }).select('caretakerId patientId careManagerId').lean();

        console.log(`[Fix] Found ${activeAssignments.length} active assignments to check`);

        let fixed = 0;
        let alreadyCorrect = 0;
        let errors = 0;

        for (const assignment of activeAssignments) {
            try {
                // 2. Look up the caller's actual care manager (managedBy)
                const callerProfile = await Profile.findById(assignment.caretakerId)
                    .select('fullName managedBy').lean();

                if (!callerProfile || !callerProfile.managedBy) continue;

                const correctManagerId = callerProfile.managedBy;

                // 3. Check the Patient document
                const patient = await Patient.findById(assignment.patientId)
                    .select('name care_manager_id assigned_manager_id').lean();

                if (!patient) continue;

                const currentManagerId = patient.care_manager_id?.toString();
                const expectedManagerId = correctManagerId.toString();

                if (currentManagerId === expectedManagerId) {
                    alreadyCorrect++;
                    continue;
                }

                // 4. Fix the mismatch
                await Patient.updateOne(
                    { _id: assignment.patientId },
                    {
                        $set: {
                            care_manager_id: correctManagerId,
                            assigned_manager_id: correctManagerId,
                        },
                    }
                );

                // Also fix the CaretakerPatient record if needed
                if (assignment.careManagerId?.toString() !== expectedManagerId) {
                    await CaretakerPatient.updateOne(
                        { _id: assignment._id },
                        { $set: { careManagerId: correctManagerId } }
                    );
                }

                const oldManager = currentManagerId
                    ? await Profile.findById(currentManagerId).select('fullName').lean()
                    : null;
                const newManager = await Profile.findById(correctManagerId).select('fullName').lean();

                console.log(
                    `[Fix] Patient "${patient.name}" — manager: ` +
                    `"${oldManager?.fullName || 'none'}" → "${newManager?.fullName || correctManagerId}" ` +
                    `(via caller "${callerProfile.fullName}")`
                );
                fixed++;
            } catch (err) {
                console.error(`[Fix] Error processing assignment ${assignment._id}:`, err.message);
                errors++;
            }
        }

        console.log('\n=== Summary ===');
        console.log(`Total assignments checked: ${activeAssignments.length}`);
        console.log(`Already correct: ${alreadyCorrect}`);
        console.log(`Fixed: ${fixed}`);
        console.log(`Errors: ${errors}`);
    } catch (err) {
        console.error('[Fix] Fatal error:', err.message);
    } finally {
        await mongoose.disconnect();
        console.log('[Fix] Disconnected from MongoDB');
    }
}

fixCareManagerSync();
