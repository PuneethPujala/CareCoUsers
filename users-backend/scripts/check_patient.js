const mongoose = require('mongoose');
require('dotenv').config();

const Patient = require('../src/models/Patient');
const Profile = require('../src/models/Profile');

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const email = 'puneethpujala@gmail.com';
    
    console.log('--- Checking Profiles ---');
    const profile = await Profile.findOne({ email });
    console.log(profile ? `Found Profile for ${email}: supabaseUid=${profile.supabaseUid}` : `No Profile found for ${email}`);
    
    console.log('\n--- Checking Patients ---');
    const patientByEmail = await Patient.findOne({ email });
    console.log(patientByEmail ? `Found Patient by email: supabase_uid=${patientByEmail.supabase_uid}, id=${patientByEmail._id}` : `No Patient found by email`);

    if (profile) {
        const patientByUid = await Patient.findOne({ supabase_uid: profile.supabaseUid });
        console.log(patientByUid ? `Found Patient by supabase_uid: id=${patientByUid._id}` : `No Patient found by supabase_uid ${profile.supabaseUid}`);
    }

    process.exit(0);
}

test().catch(console.error);
