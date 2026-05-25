const logger = require('../utils/logger');
const Profile = require('../models/Profile');
const Companion = require('../models/Companion');
const SystemMigration = require('../models/SystemMigration');

const runSeparateProfilesMigration = async () => {
    const MIGRATION_KEY = 'separate_companion_profiles_into_dedicated_collection';

    try {
        // 1. Check if the migration has already been executed successfully
        const existingMigration = await SystemMigration.findOne({ key: MIGRATION_KEY });
        if (existingMigration) {
            logger.info(`[Migration] Companion profile separation already executed on ${existingMigration.executed_at}. Skipping.`);
            return;
        }

        logger.info('[Migration] Starting Companion profile separation migration...');

        // 2. Fetch all profiles with role: 'companion'
        const companionProfiles = await Profile.find({ role: 'companion' });

        logger.info(`[Migration] Found ${companionProfiles.length} companion profiles to migrate.`);

        let migrateCount = 0;
        for (const profile of companionProfiles) {
            // Check if the companion already exists in the new collection
            const existingCompanion = await Companion.findById(profile._id);
            if (!existingCompanion) {
                // Insert into Companion collection preserving the exact _id
                await Companion.create({
                    _id: profile._id,
                    supabaseUid: profile.supabaseUid,
                    email: profile.email,
                    passwordHash: profile.passwordHash,
                    fullName: profile.fullName,
                    phone: profile.phone,
                    role: 'companion',
                    isActive: profile.isActive !== undefined ? profile.isActive : true,
                    emailVerified: profile.emailVerified !== undefined ? profile.emailVerified : false,
                    lastLoginAt: profile.lastLoginAt,
                    failedLoginAttempts: profile.failedLoginAttempts || 0,
                    accountLockedUntil: profile.accountLockedUntil,
                    createdAt: profile.createdAt,
                    updatedAt: profile.updatedAt
                });
            }

            // Delete from Profile collection to keep it clean and only contain admin users!
            await Profile.deleteOne({ _id: profile._id });
            migrateCount++;
        }

        // 3. Mark the migration as executed successfully with lock key
        await SystemMigration.create({
            key: MIGRATION_KEY,
            version: '1.0.0',
            executed_at: new Date()
        });

        logger.info(`[Migration] Success! Successfully migrated and separated ${migrateCount} companion profiles into their own collection.`);
    } catch (err) {
        logger.error('[Migration] Failed during Companion profile separation migration:', err);
        throw err;
    }
};

module.exports = { runSeparateProfilesMigration };
