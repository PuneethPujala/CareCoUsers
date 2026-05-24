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

    const Organization = require('../models/Organization');
    const orgs = await Organization.find({});
    console.log(`Found ${orgs.length} organizations:`);
    orgs.forEach(o => {
        console.log(`- ID: ${o._id}, Name: ${o.name}, City: ${o.city}, IsActive: ${o.isActive}, Capacity: ${JSON.stringify(o.capacity)}, Counts: ${JSON.stringify(o.counts)}`);
    });

    const Patient = require('../models/Patient');
    const patientsCount = await Patient.countDocuments({});
    console.log(`Total Patients in database: ${patientsCount}`);

    const Profile = require('../models/Profile');
    const profilesCount = await Profile.countDocuments({});
    console.log(`Total Profiles in database: ${profilesCount}`);

    await mongoose.disconnect();
}

run().catch(console.error);
