const mongoose = require('mongoose');
require('dotenv').config();
const Profile = require('./src/models/Profile');
const Patient = require('./src/models/Patient');
const CaretakerPatient = require('./src/models/CaretakerPatient');
const Medication = require('./src/models/Medication');
const CallLog = require('./src/models/CallLog');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    // 1. Find Ashwin's profiles
    const ashwins = await Profile.find({ fullName: /ashwin/i }).select('fullName role organizationId').lean();
    console.log('\n=== ASHWIN PROFILES ===');
    ashwins.forEach(a => console.log(`  ID: ${a._id} | Name: ${a.fullName} | Role: ${a.role} | Org: ${a.organizationId}`));

    // 2. All callers/caretakers
    const callers = await Profile.find({ role: { $in: ['caller', 'caretaker'] } }).select('fullName role organizationId').lean();
    console.log('\n=== ALL CALLERS/CARETAKERS ===');
    callers.forEach(c => console.log(`  ID: ${c._id} | Name: ${c.fullName} | Role: ${c.role}`));

    // 3. All CaretakerPatient assignments
    const assigns = await CaretakerPatient.find({}).lean();
    console.log(`\n=== CARETAKERPATIENT ASSIGNMENTS (${assigns.length}) ===`);
    assigns.forEach(a => console.log(`  Caretaker: ${a.caretakerId} -> Patient: ${a.patientId} | Status: ${a.status}`));

    // 4. All patients in Patient collection
    const patients = await Patient.find({}).select('name email is_active organization_id').lean();
    console.log(`\n=== PATIENT COLLECTION (${patients.length}) ===`);
    patients.forEach(p => console.log(`  ID: ${p._id} | Name: ${p.name} | Active: ${p.is_active} | Org: ${p.organization_id}`));

    // 5. All profiles with role 'patient'
    const patientProfiles = await Profile.find({ role: 'patient' }).select('fullName organizationId').lean();
    console.log(`\n=== PROFILE COLLECTION (role=patient) (${patientProfiles.length}) ===`);
    patientProfiles.forEach(p => console.log(`  ID: ${p._id} | Name: ${p.fullName} | Org: ${p.organizationId}`));

    // 6. Medications
    const meds = await Medication.find({}).select('patientId name isActive').lean();
    console.log(`\n=== MEDICATIONS (${meds.length}) ===`);
    meds.forEach(m => console.log(`  PatientID: ${m.patientId} | Name: ${m.name} | Active: ${m.isActive}`));

    // 7. Call logs today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const logs = await CallLog.find({ scheduledTime: { $gte: today } }).lean();
    console.log(`\n=== CALL LOGS TODAY (${logs.length}) ===`);
    logs.forEach(l => console.log(`  ID: ${l._id} | Caretaker: ${l.caretakerId} | Patient: ${l.patientId} | Status: ${l.status}`));

    await mongoose.disconnect();
    console.log('\nDone.');
});
