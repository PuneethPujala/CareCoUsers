/**
 * clean-duplicate-patients.js
 * Utility script to dry-run and clean up duplicate Patient records
 * mistakenly created for Companion email addresses.
 *
 * Usage:
 *   node src/scripts/clean-duplicate-patients.js [--execute]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const Profile = require('../models/Profile');
const fs = require('fs');
const path = require('path');

const executeMode = process.argv.includes('--execute');

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('Error: MONGODB_URI environment variable is not defined.');
    process.exit(1);
  }

  console.log(`Connecting to MongoDB...`);
  await mongoose.connect(mongoUri);
  console.log('Connected successfully.\n');

  console.log('--------------------------------------------------');
  console.log(`RUN MODE: ${executeMode ? '⚠️ EXECUTE (Modifying Database)' : '🔍 DRY-RUN (Log Only)'}`);
  console.log('--------------------------------------------------\n');

  // Find all companion profiles
  const companions = await Profile.find({ role: 'companion' });
  console.log(`Found ${companions.length} companion profile(s) in database.`);

  const duplicates = [];

  for (const companion of companions) {
    const companionEmail = companion.email.toLowerCase().trim();
    // Search for a matching Patient record
    const duplicatePatient = await Patient.findOne({ email: companionEmail });
    if (duplicatePatient) {
      duplicates.push({
        companionProfileId: companion._id,
        patientId: duplicatePatient._id,
        email: companionEmail,
        patientName: duplicatePatient.name,
        patientActive: duplicatePatient.is_active,
        patientCreatedAt: duplicatePatient.createdAt || duplicatePatient.created_at,
      });
    }
  }

  console.log(`Identified ${duplicates.length} duplicate Patient record(s) matching Companion emails.\n`);

  if (duplicates.length === 0) {
    console.log('No duplicates found. Database is healthy!');
    await mongoose.disconnect();
    return;
  }

  // Backup / Log duplicates details
  const backupDir = path.join(__dirname, '../../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupFile = path.join(backupDir, `duplicate-patients-backup-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(duplicates, null, 2));
  console.log(`💾 Backup log written to: ${backupFile}\n`);

  for (const dup of duplicates) {
    console.log(`[DUPLICATE DETECTED]`);
    console.log(` - Email: ${dup.email}`);
    console.log(` - Companion Profile ID: ${dup.companionProfileId}`);
    console.log(` - Patient ID to clean: ${dup.patientId}`);
    console.log(` - Patient Name: ${dup.patientName}`);
    console.log(` - Patient Created At: ${dup.patientCreatedAt}`);
    console.log(` - Status: ${dup.patientActive ? 'Active' : 'Inactive'}`);

    if (executeMode) {
      console.log(` 🗑️ Deleting duplicate Patient document ${dup.patientId}...`);
      await Patient.findByIdAndDelete(dup.patientId);
      console.log(` ✅ Successfully removed duplicate Patient document.\n`);
    } else {
      console.log(` 🔍 [DRY-RUN] Patient document ${dup.patientId} would be deleted.\n`);
    }
  }

  console.log('--------------------------------------------------');
  if (executeMode) {
    console.log(`✅ Cleanup completed successfully. Deleted ${duplicates.length} duplicate record(s).`);
  } else {
    console.log(`🔍 Dry-run complete. Re-run this script with the --execute flag to perform deletions.`);
  }
  console.log('--------------------------------------------------');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
