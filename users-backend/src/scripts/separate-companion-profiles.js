const logger = require('../utils/logger');
const Profile = require('../models/Profile');
const Companion = require('../models/Companion');
const SystemMigration = require('../models/SystemMigration');

const runSeparateProfilesMigration = async () => {
  const MIGRATION_KEY = 'separate_companion_profiles_into_dedicated_collection';

  try {
    // 1. Fetch all profiles with role: 'companion' (Safety check on every boot)
    const companionProfiles = await Profile.find({ role: 'companion' });

    if (companionProfiles.length === 0) {
      // Check if we need to set the migration key just for bookkeeping
      const existingMigration = await SystemMigration.findOne({
        key: MIGRATION_KEY,
      });
      if (!existingMigration) {
        await SystemMigration.create({
          key: MIGRATION_KEY,
          version: '1.0.0',
          executed_at: new Date(),
        });
      }
      return;
    }

    logger.info(
      `[Migration] Leaked companion profiles found! Starting Companion profile separation migration for ${companionProfiles.length} user(s)...`
    );

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
          emailVerified:
            profile.emailVerified !== undefined ? profile.emailVerified : false,
          lastLoginAt: profile.lastLoginAt,
          failedLoginAttempts: profile.failedLoginAttempts || 0,
          accountLockedUntil: profile.accountLockedUntil,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
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
      executed_at: new Date(),
    });

    logger.info(
      `[Migration] Success! Successfully migrated and separated ${migrateCount} companion profiles into their own collection.`
    );
  } catch (err) {
    logger.error(
      '[Migration] Failed during Companion profile separation migration:',
      err
    );
    throw err;
  }
};

module.exports = { runSeparateProfilesMigration };
