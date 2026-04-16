const mongoose = require('mongoose');
const fs = require('fs');

async function checkPatients() {
  await mongoose.connect('mongodb+srv://Prakash45:prakash4533@sih.faidhae.mongodb.net/careconnect?retryWrites=true&w=majority');
  
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  
  const patients = db.collection('patients');
  const patientCount = await patients.countDocuments();
  const samplePatient = await patients.findOne({});

  const profiles = db.collection('profiles');
  const profileCounts = await profiles.aggregate([
    { $group: { _id: '$role', count: { $sum: 1 } } }
  ]).toArray();

  const orgs = db.collection('organizations');
  const orgCount = await orgs.countDocuments({});

  const result = {
    collections: collections.map(c => c.name),
    patientCount,
    samplePatient,
    profileCounts,
    orgCount
  };

  fs.writeFileSync('output.json', JSON.stringify(result, null, 2));
  mongoose.disconnect();
}

checkPatients().catch(console.error);
