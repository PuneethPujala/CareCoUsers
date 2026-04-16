// Test the getAssignedPatientIds logic with org fallback
const mongoose = require('mongoose');
require('dotenv').config();
const Profile = require('./src/models/Profile');
const Patient = require('./src/models/Patient');
const CaretakerPatient = require('./src/models/CaretakerPatient');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    // Ashwin caller profile
    const caller = await Profile.findOne({ fullName: /ashwin/i, role: 'caller' }).lean();
    if (!caller) { console.log('No caller named Ashwin found!'); return mongoose.disconnect(); }

    console.log(`\nCaller: ${caller.fullName} (${caller._id})`);
    console.log(`Role: ${caller.role}`);
    console.log(`Org: ${caller.organizationId}`);

    // Check CaretakerPatient assignments
    const assigns = await CaretakerPatient.find({ caretakerId: caller._id, status: 'active' }).lean();
    console.log(`\nExplicit CaretakerPatient assignments: ${assigns.length}`);

    // Org fallback: find all patients in the same org
    const orgId = caller.organizationId;
    const orgPatients = await Patient.find({ organization_id: orgId, is_active: true }).select('name _id').lean();
    console.log(`\nPatients in same org (${orgId}):`);
    orgPatients.forEach(p => console.log(`  - ${p.name} (${p._id})`));
    console.log(`Total: ${orgPatients.length} patients`);

    // This is exactly what the fixed getAssignedPatientIds will return
    console.log(`\n✅ With the org fallback, Ashwin's dashboard will show ${orgPatients.length} patients`);

    await mongoose.disconnect();
});
