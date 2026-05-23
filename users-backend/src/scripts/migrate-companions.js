const logger = require('../utils/logger');
const Patient = require('../models/Patient');
const CompanionAccess = require('../models/CompanionAccess');
const SystemMigration = require('../models/SystemMigration');

const runMigrations = async () => {
    const MIGRATION_KEY = 'migrate_companions_to_access_collection';

    try {
        // 1. Check if the migration has already been executed successfully
        const existingMigration = await SystemMigration.findOne({ key: MIGRATION_KEY });
        if (existingMigration) {
            logger.info(`[Migration] Decoupled Companion relationship migration already executed on ${existingMigration.executed_at}. Skipping.`);
            return;
        }

        logger.info('[Migration] Starting CompanionAccess decoupled migration...');

        // 2. Fetch all patients that have companions inside their legacy embedded array
        const patients = await Patient.find({
            companions: { $exists: true, $not: { $size: 0 } }
        });

        logger.info(`[Migration] Found ${patients.length} patients with legacy companions.`);

        let migrateCount = 0;
        for (const patient of patients) {
            for (const companion of patient.companions) {
                if (!companion.profile_id) continue;

                // Create the CompanionAccess relationship document (upsert style to be safe)
                await CompanionAccess.updateOne(
                    { companion_id: companion.profile_id, patient_id: patient._id },
                    {
                        $setOnInsert: {
                            relationship_type: 'Other',
                            access_level: 'caregiver',
                            permissions: ['read_only', 'alerts'],
                            status: 'accepted',
                            is_active: companion.is_active !== undefined ? companion.is_active : true,
                            joined_at: companion.joined_at || new Date(),
                            notification_preferences: companion.notification_preferences || {
                                missed_meds: true,
                                long_inactivity: true,
                                weekly_summaries: true,
                                adherence_improvements: true
                            }
                        }
                    },
                    { upsert: true }
                );
                migrateCount++;
            }
        }

        // 3. Mark the migration as executed successfully with lock key
        await SystemMigration.create({
            key: MIGRATION_KEY,
            version: '1.0.0',
            executed_at: new Date()
        });

        logger.info(`[Migration] Success! Successfully migrated ${migrateCount} legacy companion mappings to decoupled CompanionAccess collection.`);
    } catch (err) {
        logger.error('[Migration] Failed during CompanionAccess migration:', err);
        throw err;
    }
};

module.exports = { runMigrations };
