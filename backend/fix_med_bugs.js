require('dotenv').config();
const mongoose = require('mongoose');
const Med = require('./src/models/Medication');
const Pat = require('./src/models/Patient');

async function fix() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Fix 1: Deactivate orphaned medications (patients no longer exist)
    console.log('=== Fixing orphaned medications ===');
    
    const r1 = await Med.updateOne(
        { _id: new mongoose.Types.ObjectId('69e73ae9362890906ed34967') },
        { $set: { isActive: false, is_active: false, status: 'inactive' } }
    );
    console.log('Metformin (orphaned) deactivated:', r1.modifiedCount);

    const r2 = await Med.updateOne(
        { _id: new mongoose.Types.ObjectId('69edd99af63839732bcbc8f5') },
        { $set: { isActive: false, is_active: false, status: 'inactive' } }
    );
    console.log('Glucovita (orphaned) deactivated:', r2.modifiedCount);

    // Fix 2: Sync "Dolo" to Patient.medications embedded array
    console.log('\n=== Syncing Dolo to Patient.medications ===');
    const dolo = await Med.findById('69e89f03f0dbc2d7b572fa2d').lean();
    if (!dolo) { console.log('Dolo not found'); process.exit(1); }

    const pat = await Pat.findById('69e4a969de08797aabec118a');
    if (!pat) { console.log('Patient not found'); process.exit(1); }

    const exists = (pat.medications || []).some(
        m => m._id && m._id.toString() === '69e89f03f0dbc2d7b572fa2d'
    );

    if (!exists) {
        if (!pat.medications) pat.medications = [];
        pat.medications.push({
            _id: dolo._id,
            name: dolo.name,
            dosage: dolo.dosage,
            times: dolo.times || ['morning'],
            scheduledTimes: dolo.scheduledTimes || [],
            route: dolo.route || 'oral',
            instructions: dolo.instructions || '',
            is_active: true,
            isActive: true,
        });
        pat.markModified('medications');
        await pat.save();
        console.log('Dolo synced to Patient.medications ✅');
    } else {
        console.log('Dolo already in embedded array');
    }

    // Verify fixes
    console.log('\n=== Verification ===');
    const activeMeds = await Med.find({ isActive: true }).lean();
    console.log('Active medications:', activeMeds.length);
    for (const m of activeMeds) {
        const p = await Pat.findById(m.patientId).lean();
        console.log(`  ${m.name} → patient ${m.patientId}: ${p ? 'EXISTS' : 'MISSING'}`);
        if (p && p.medications) {
            const inEmb = p.medications.some(em => em._id?.toString() === m._id.toString());
            console.log(`    In Patient.medications: ${inEmb ? 'YES ✅' : 'NO ❌'}`);
        }
    }

    process.exit(0);
}

fix().catch(e => { console.error(e); process.exit(1); });
