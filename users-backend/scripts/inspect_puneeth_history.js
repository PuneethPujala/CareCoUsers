const mongoose = require('mongoose');
require('dotenv').config();

const Patient = require('../src/models/Patient');
const PatientHealthStateHistory = require('../src/models/PatientHealthStateHistory');

async function test() {
    const localUri = 'mongodb://localhost:27017/caremymed-test';
    console.log("Connecting to:", localUri);
    try {
        await mongoose.connect(localUri);
        console.log("Connected to MongoDB successfully!");
    } catch (err) {
        console.error("Local connection failed...", err.message);
        process.exit(1);
    }

    const email = 'puneethpujala@gmail.com';
    let patient = await Patient.findOne({ email });
    if (!patient) {
        console.log("No patient found with email:", email);
        console.log("Listing some patients in DB:");
        const list = await Patient.find({}).limit(5).lean();
        list.forEach(p => {
            console.log(`- ID: ${p._id}, Name: ${p.name}, Email: ${p.email}`);
        });
        if (list.length > 0) {
            patient = list[0];
            console.log(`Using patient: ${patient.name} (${patient.email})`);
        } else {
            process.exit(0);
        }
    }
    
    console.log("Patient name:", patient.name);
    console.log("Patient ID:", patient._id);

    const history = await PatientHealthStateHistory.find({ patient_id: patient._id }).sort({ date: 1 });
    console.log(`\nFound ${history.length} history records for patient.`);
    if (history.length > 0) {
        history.forEach((h, index) => {
            console.log(`[${index + 1}] Date: ${h.date.toISOString().slice(0, 10)}, Score: ${h.score}, Adherence: ${JSON.stringify(h.adherence)}`);
        });
    }

    process.exit(0);
}

test().catch(console.error);
