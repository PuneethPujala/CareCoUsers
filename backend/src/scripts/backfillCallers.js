/**
 * ═══════════════════════════════════════════════════════════════
 * BACKFILL SCRIPT — Assign care managers to existing callers with managedBy: null
 *
 * Usage:
 *   node src/scripts/backfillCallers.js
 * ═══════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const Profile = require('../models/Profile');

async function run() {
  await connectDB();

  console.log('\n🔍 Finding active callers without an assigned Care Manager...');
  const callers = await Profile.find({
    role: 'caller',
    isActive: true,
    $or: [{ managedBy: null }, { managedBy: { $exists: false } }]
  });

  if (callers.length === 0) {
    console.log('✅ No existing callers need backfilling.');
    // Close DB connection cleanly
    await mongoose.connection.close();
    process.exit(0);
  }

  console.log(`📋 Found ${callers.length} callers to backfill.`);

  for (const caller of callers) {
    const targetOrgId = caller.organizationId;
    if (!targetOrgId) {
      console.warn(`⚠️ Caller ${caller.fullName} (${caller.email}) has no organizationId. Skipping.`);
      continue;
    }

    try {
      // Find all active managers in the organization
      const managers = await Profile.find({
        organizationId: targetOrgId,
        role: 'care_manager',
        isActive: true
      }).select('_id fullName');

      if (managers.length === 0) {
        console.warn(`⚠️ No active care managers found in organization ${targetOrgId} for caller ${caller.fullName}. Skipping.`);
        continue;
      }

      const managerIds = managers.map(m => m._id);
      // Retrieve workloads of callers for each manager
      const workloads = await Profile.aggregate([
        { $match: { managedBy: { $in: managerIds }, role: 'caller', isActive: true } },
        { $group: { _id: '$managedBy', count: { $sum: 1 } } }
      ]);

      const workloadMap = {};
      workloads.forEach(w => {
        workloadMap[String(w._id)] = w.count;
      });

      // Sort managers by current caller workload (ascending)
      managers.sort((a, b) => {
        const countA = workloadMap[String(a._id)] || 0;
        const countB = workloadMap[String(b._id)] || 0;
        return countA - countB;
      });

      const resolvedManager = managers[0];
      caller.managedBy = resolvedManager._id;
      await caller.save();

      console.log(`✅ Assigned caller ${caller.fullName} (${caller.email}) → Care Manager ${resolvedManager.fullName}`);
    } catch (err) {
      console.error(`❌ Failed to backfill caller ${caller.fullName}:`, err.message);
    }
  }

  console.log('\n🎉 Backfill complete!');
  await mongoose.connection.close();
  process.exit(0);
}

run().catch(async (err) => {
  console.error('❌ Script failed:', err);
  try {
    await mongoose.connection.close();
  } catch (e) {}
  process.exit(1);
});
