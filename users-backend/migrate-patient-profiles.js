require('dotenv').config();
const mongoose = require('mongoose');
const Patient = require('./src/models/Patient');
const Profile = require('./src/models/Profile');
const connectDB = require('./src/config/database');

async function runMigration() {
    try {
        console.log('Connecting to database...');
        await connectDB();
        console.log('Connected.');

        // 1. Find all patients missing a profile_id
        const patientsToUpdate = await Patient.find({ profile_id: { $exists: false } });
        console.log(`Found ${patientsToUpdate.length} patients missing a profile_id.`);

        if (patientsToUpdate.length === 0) {
            console.log('Nothing to migrate. Exiting.');
            process.exit(0);
        }

        let successCount = 0;
        let failCount = 0;

        // 2. Iterate through each patient and link them to their profile via supabase_uid
        for (const patient of patientsToUpdate) {
            const profile = await Profile.findOne({ supabaseUid: patient.supabase_uid });

            if (profile) {
                patient.profile_id = profile._id;
                await patient.save();
                console.log(`[SUCCESS] Linked Patient ${patient.name} to Profile ${profile._id}`);
                successCount++;
            } else {
                console.error(`[ERROR] No Profile found for Patient ${patient.name} (UID: ${patient.supabase_uid})`);
                failCount++;
            }
        }

        console.log('\n--- Migration Summary ---');
        console.log(`Successfully migrated: ${successCount}`);
        console.log(`Failed to migrate: ${failCount}`);

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database.');
        process.exit();
    }
}

runMigration();
