const mongoose = require('mongoose');
const moment = require('moment-timezone');

async function test() {
    try {
        console.log('Connecting to local MongoDB...');
        await mongoose.connect('mongodb://localhost:27017/caremymed-test');
        console.log('Connected.');

        // Load models
        const Patient = require('./src/models/Patient');
        const Profile = require('./src/models/Profile');
        const Companion = require('./src/models/Companion');
        const CompanionAccess = require('./src/models/CompanionAccess');
        const Intervention = require('./src/models/Intervention');
        const VitalLog = require('./src/models/VitalLog');
        const MedicineLog = require('./src/models/MedicineLog');

        // Clean collections
        await Promise.all([
            Patient.deleteMany({}),
            Profile.deleteMany({}),
            Companion.deleteMany({}),
            CompanionAccess.deleteMany({}),
            Intervention.deleteMany({}),
            VitalLog.deleteMany({}),
            MedicineLog.deleteMany({})
        ]);

        console.log('Cleaned collections.');

        // Create profile
        const profile = await Profile.create({
            fullName: 'Test Patient Profile',
            email: 'patient@test.com',
            supabaseUid: 'patient-supabase-uid',
            role: 'patient'
        });

        // Create patient
        const patient = await Patient.create({
            supabase_uid: 'patient-supabase-uid',
            name: 'Priyanka Test',
            email: 'patient@test.com',
            role: 'patient',
            profile_id: profile._id,
            timezone: 'Asia/Kolkata',
            gamification: { current_streak: 5 }
        });

        // Create companion
        const companion = await Companion.create({
            supabaseUid: 'test-companion-uid',
            email: 'caregiver@test.com',
            passwordHash: 'dummyhash',
            fullName: 'Family Caregiver',
            role: 'companion'
        });

        // Create access
        await CompanionAccess.create({
            companion_id: companion._id,
            patient_id: patient._id,
            relationship_type: 'Other',
            access_level: 'caregiver',
            status: 'accepted',
            is_active: true
        });

        console.log('Created test data. Patient ID:', patient._id);

        const { generateInterventions } = require('./src/services/interventionEngineService');

        console.log('Running generateInterventions...');
        const result = await generateInterventions(patient._id);
        console.log('Result:', result);

        await mongoose.disconnect();
        console.log('Done.');
    } catch (err) {
        console.error('Test failed with error:', err);
        mongoose.disconnect();
    }
}

test();
