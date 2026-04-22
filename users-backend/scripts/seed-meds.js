/**
 * One-off script to seed medications AND health profile for puneethpujala@gmail.com
 * Run: node scripts/seed-meds.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Patient = require('../src/models/Patient');

async function seed() {
    // Note: If connection fails, whitelist your IP in MongoDB Atlas -> Security -> Network Access
    const directURI = 'mongodb://Prakash45:prakash4533@ac-zhof8tf-shard-00-00.faidhae.mongodb.net:27017,ac-zhof8tf-shard-00-01.faidhae.mongodb.net:27017,ac-zhof8tf-shard-00-02.faidhae.mongodb.net:27017/careconnect?ssl=true&replicaSet=atlas-zhof8tf-shard-0&authSource=admin&retryWrites=true&w=majority';
    await mongoose.connect(directURI);
    console.log('Connected to MongoDB');

    const patient = await Patient.findOne({ email: 'puneethpujala@gmail.com' });
    if (!patient) {
        console.error('Patient not found!');
        process.exit(1);
    }

    console.log(`Found patient: ${patient.name || patient.email} (${patient._id})`);

    // 1. Seed Realistic Medications
    patient.medications = [
        {
            name: 'Metformin',
            dosage: '500mg',
            frequency: 'twice_daily',
            times: ['morning', 'night'],
            scheduledTimes: ['09:00', '20:00'],
            start_date: new Date('2026-03-01'),
            is_active: true,
            instructions: 'Take with food to avoid stomach upset',
            prescribed_by: 'Dr. Sharma',
        },
        {
            name: 'Amlodipine',
            dosage: '5mg',
            frequency: 'once_daily',
            times: ['morning'],
            scheduledTimes: ['09:00'],
            start_date: new Date('2026-02-15'),
            is_active: true,
            instructions: 'Take on empty stomach',
            prescribed_by: 'Dr. Patel',
        },
        {
            name: 'Vitamin D3',
            dosage: '60000 IU',
            frequency: 'once_weekly',
            times: ['morning'],
            scheduledTimes: ['09:00'],
            start_date: new Date('2026-01-01'),
            is_active: true,
            instructions: 'Take once every Sunday',
            prescribed_by: 'Dr. Sharma',
        }
    ];

    // 2. Seed Health Profile Data
    patient.conditions = [
        { name: 'Type 2 Diabetes', diagnosed_date: new Date('2024-05-15'), status: 'active', notes: 'Managed with Metformin and diet' },
        { name: 'Hypertension', diagnosed_date: new Date('2025-01-10'), status: 'active', notes: 'Under control' }
    ];

    patient.allergies = [
        { allergen_name: 'Penicillin', severity: 'high', reaction: 'Hives and swelling', identified_date: new Date('2015-06-01') },
        { allergen_name: 'Peanuts', severity: 'mild', reaction: 'Mild skin rash', identified_date: new Date('2010-09-12') }
    ];

    patient.medical_history = [
        { condition_name: 'Appendicitis', diagnosis_date: new Date('2018-03-14'), resolved_date: new Date('2018-04-01'), treatment: 'Appendectomy surgery', doctor_name: 'Dr. Gupta' }
    ];

    await patient.save();

    console.log(`✅ Successfully seeded Medications & Health Profile for ${patient.email}`);
    
    await mongoose.disconnect();
    process.exit(0);
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
