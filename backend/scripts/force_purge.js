require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');

async function purge() {
  await mongoose.connect('mongodb+srv://Prakash45:prakash4533@sih.faidhae.mongodb.net/careconnect?retryWrites=true&w=majority');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const profile = await mongoose.connection.db.collection('profiles').findOne({ email: 'puneethpujala@gmail.com' });
  if (profile) {
    console.log('Found MongoDB Profile:', profile._id);
    if (profile.supabaseUid) {
      console.log('Found Supabase Uid:', profile.supabaseUid);
      const res = await supabase.auth.admin.deleteUser(profile.supabaseUid);
      console.log('Supabase Delete:', res.error ? res.error.message : 'Success');
    }
    
    await mongoose.connection.db.collection('profiles').deleteOne({ _id: profile._id });
    console.log('Mongo Profile Deleted');
  } else {
    console.log('No profile found in MongoDB');
  }

  mongoose.disconnect();
}
purge();
