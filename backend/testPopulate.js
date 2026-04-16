require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./src/config/database');

async function testPopulate() {
    await connectDB();
    const Patient = require('./src/models/Patient');
    const Profile = require('./src/models/Profile');
    const CaretakerPatient = require('./src/models/CaretakerPatient');
    
    // First let's check CaretakerPatient schema reference for patientId
    console.log('Fetching active assignments without populate...');
    const rawAssignments = await CaretakerPatient.find({ status: 'active' }).lean();
    
    for (const a of rawAssignments) {
        console.log(`Assignment ID: ${a._id}`);
        console.log(`  patientId: ${a.patientId}`);
        console.log(`  caretakerId: ${a.caretakerId}`);
        
        // Let's manually fetch the patient
        const pt = await Patient.findById(a.patientId).lean();
        console.log(`  Patient found in DB: ${pt ? pt.name : 'NO'}`);
        
        const ct = await Profile.findById(a.caretakerId).lean();
        console.log(`  Caretaker found in DB: ${ct ? ct.fullName : 'NO'}`);
    }

    console.log('\nFetching active assignments WITH populate...');
    const assignments = await CaretakerPatient.find({ status: 'active' }).populate('patientId caretakerId').lean();
    for (const a of assignments) {
        console.log(`Populated Patient for ${a._id}:`, a.patientId ? a.patientId.name : 'NULL');
    }

    await mongoose.disconnect();
}

testPopulate().catch(console.error);
