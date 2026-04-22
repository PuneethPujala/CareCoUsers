require('dotenv').config();
const mongoose = require('mongoose');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const Patient = require('./src/models/Patient');
    const Organization = require('./src/models/Organization');
    
    const org = await Organization.findOne({ name: /Guntur/i });
    if(!org) {
        process.exit(1);
    }
    
    const crypto = require('crypto');
    const patients = Array.from({length: 15}).map((_, i) => ({
      name: 'Test Patient ' + (i+1),
      email: 'patient'+(i+1)+crypto.randomBytes(4).toString('hex')+'@guntur.test',
      phone: '123-456-' + String(i).padStart(4, '0'),
      organization_id: org._id,
      supabase_uid: crypto.randomUUID(),
      is_active: true
    }));
    
    await Patient.insertMany(patients);
    await Organization.updateOne({_id: org._id}, { 
        $set: { currentPatientCount: 15, 'counts.patients': 15 } 
    });
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
seed();
