require('dotenv').config();
const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function purge() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔗 Connected to MongoDB');

    // Mongoose Models Note: Using connection.collection to bypass schemas if needed, 
    // but we can just use the models directory.
    const Organization = require('./src/models/Organization');
    const Profile = require('./src/models/Profile');
    const Patient = require('./src/models/Patient');
    const CaretakerPatient = require('./src/models/CaretakerPatient');
    const Medication = require('./src/models/Medication');
    const CallLog = require('./src/models/CallLog');
    const Notification = require('./src/models/Notification');
    const MentorAuthorization = require('./src/models/MentorAuthorization');

    // The Guntur instances
    const gunturOrgs = await Organization.find({ name: { $regex: /guntur/i } });
    const gunturOrgIds = gunturOrgs.map(o => o._id);
    console.log('📌 Preserving Guntur Orgs:', gunturOrgs.map(o => o.name).join(', '));

    // 1. Delete Non-Guntur Organizations
    const deletedOrgs = await Organization.deleteMany({ _id: { $nin: gunturOrgIds } });
    console.log(`🗑️ Deleted ${deletedOrgs.deletedCount} Non-Guntur Organizations.`);

    // 2. Prepare to Wipe All Non-Guntur Profiles (Supabase Sync)
    const profilesToDelete = await Profile.find({
      role: { $ne: 'super_admin' },
      $or: [
        { organizationId: { $nin: gunturOrgIds } },
        { organizationId: { $exists: false } }
      ]
    });

    console.log(`⏳ Synchronizing deletion of ${profilesToDelete.length} non-Guntur profiles with Supabase...`);
    let supabaseDelCnt = 0;
    
    for (const profile of profilesToDelete) {
      if (profile.supabaseUid) {
        const { error } = await supabase.auth.admin.deleteUser(profile.supabaseUid);
        if (error) {
          if (!error.message.includes("User not found")) {
            console.error(`❌ Supabase deletion error for ${profile.email}:`, error.message);
          }
        } else {
          supabaseDelCnt++;
        }
      }
      await Profile.deleteOne({ _id: profile._id });
    }
    console.log(`✅ Fully purged ${profilesToDelete.length} Profiles from MongoDB, ${supabaseDelCnt} from Supabase Cloud Auth.`);

    // 3. Delete Non-Guntur Patients
    const deletedPatientsRes = await Patient.find({
      $or: [
        { organizationId: { $nin: gunturOrgIds } },
        { organization_id: { $nin: gunturOrgIds } },
        { organization_id: { $exists: false }, organizationId: { $exists: false } }
      ]
    });
    
    const pIds = deletedPatientsRes.map(p => p._id);
    await Patient.deleteMany({ _id: { $in: pIds } });
    console.log(`🗑️ Deleted ${pIds.length} Non-Guntur Patients.`);

    // 4. Scrub Dependent Data
    const cpr = await CaretakerPatient.deleteMany({ patientId: { $in: pIds } });
    console.log(`🗑️ Deleted ${cpr.deletedCount} Orphaned Caretaker-Patient Assigments.`);

    const meds = await Medication.deleteMany({ patientId: { $in: pIds } });
    console.log(`🗑️ Deleted ${meds.deletedCount} Orphaned Medications.`);

    const cl = await CallLog.deleteMany({ patientId: { $in: pIds } });
    console.log(`🗑️ Deleted ${cl.deletedCount} Orphaned Call Logs.`);

    const notif = await Notification.deleteMany({ user: { $in: profilesToDelete.map(p => p._id) } });
    console.log(`🗑️ Deleted ${notif.deletedCount} Orphaned Notifications.`);
    
    // We also delete notifications meant for patients directly if applicable
    const notifPat = await Notification.deleteMany({ patientId: { $in: pIds } });
    console.log(`🗑️ Deleted ${notifPat.deletedCount} Patient-facing Notifications.`);

    const mentors = await MentorAuthorization.deleteMany({ patientId: { $in: pIds } });
    console.log(`🗑️ Deleted ${mentors.deletedCount} Mentor Authorizations.`);

    console.log('\n✅ Database and Supabase successfully reset to Guntur isolation.');
    process.exit(0);
  } catch (e) {
    console.error('❌ FATAL SCRIPT ERROR:', e);
    process.exit(1);
  }
}

purge();
