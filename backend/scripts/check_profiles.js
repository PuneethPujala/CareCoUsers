const mongoose = require('mongoose');

async function checkProfiles() {
  await mongoose.connect('mongodb+srv://Prakash45:prakash4533@sih.faidhae.mongodb.net/careconnect?retryWrites=true&w=majority');
  
  const profiles = await mongoose.connection.db.collection('profiles').find({ role: 'org_admin' }).toArray();
  console.log(JSON.stringify(profiles.map(p => ({
    email: p.email,
    isActive: p.isActive,
    fullName: p.fullName
  })), null, 2));

  mongoose.disconnect();
}
checkProfiles();
