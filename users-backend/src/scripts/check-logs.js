const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("MONGODB_URI not found in env!");
        process.exit(1);
    }
    console.log("Connecting to MongoDB...");
    await mongoose.connect(uri);
    console.log("Connected!");

    // Check recent Patients
    const Patient = require('../models/Patient');
    const recentPatients = await Patient.find({}).sort({ createdAt: -1 }).limit(5);
    console.log("\n--- Recent Patients ---");
    recentPatients.forEach(p => {
        console.log(`Email: ${p.email}, Uid: ${p.supabase_uid}, CreatedAt: ${p.createdAt}, Active: ${p.is_active}`);
    });

    // Check recent Profiles
    const Profile = require('../models/Profile');
    const recentProfiles = await Profile.find({}).sort({ createdAt: -1 }).limit(5);
    console.log("\n--- Recent Profiles ---");
    recentProfiles.forEach(p => {
        console.log(`Email: ${p.email}, Uid: ${p.supabaseUid}, Role: ${p.role}, CreatedAt: ${p.createdAt}`);
    });

    // Check recent Events / Audit Logs
    try {
        const EventLog = mongoose.model('EventLog') || mongoose.model('AuditLog');
        const logs = await EventLog.find({}).sort({ timestamp: -1 }).limit(10);
        console.log("\n--- Recent Event Logs ---");
        logs.forEach(l => {
            console.log(`Timestamp: ${l.timestamp}, Event: ${l.eventType}, Subject: ${l.subjectId || l.subject}, UserType: ${l.userType}, Details: ${JSON.stringify(l.details)}`);
        });
    } catch (e) {
        console.log("Could not fetch EventLogs directly:", e.message);
    }

    await mongoose.disconnect();
}

run().catch(console.error);
