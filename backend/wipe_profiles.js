require('dotenv').config();
const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function wipeProfiles() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔗 Connected to MongoDB');

    const Profile = require('./src/models/Profile');
    
    // Find all profiles EXCEPT super_admin
    const targets = await Profile.find({ role: { $ne: 'super_admin' } });
    console.log(`Found ${targets.length} profiles to obliterate.`);

    let supabaseDeleted = 0;
    
    // Quick and dirty UUID validator so Supabase library doesn't crash internally
    const isValidUUID = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    for (const p of targets) {
      if (p.supabaseUid && isValidUUID(p.supabaseUid)) {
        try {
          const { error } = await supabase.auth.admin.deleteUser(p.supabaseUid);
          if (error && !error.message.includes('User not found')) {
             console.error(`❌ Supabase cloud deletion failed for ${p.email}:`, error.message);
          } else if (!error) {
             supabaseDeleted++;
          }
        } catch (subErr) {
          console.error(`❌ Caught internal Supabase error for ${p.email}:`, subErr.message);
        }
      } else if (p.supabaseUid) {
        console.warn(`⚠️ Skipped Supabase deletion for ${p.email} because UI is malformed: ${p.supabaseUid}`);
      }
      
      await Profile.deleteOne({ _id: p._id });
    }

    console.log(`✅ MongoDB wiped ${targets.length} profiles. Supabase wiped ${supabaseDeleted} users.`);
    process.exit(0);
  } catch (error) {
    console.error('Error during wipe:', error);
    process.exit(1);
  }
}

wipeProfiles();
