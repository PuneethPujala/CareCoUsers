const mongoose = require('mongoose');
require('dotenv').config();

const Patient = require('../src/models/Patient');
const Caller = require('../src/models/Caller');

async function test() {
    const localUri = 'mongodb://localhost:27017/careconnect';
    console.log("Connecting to:", localUri);
    try {
        await mongoose.connect(localUri);
        console.log("Connected to MongoDB successfully!");
    } catch (err) {
        console.error("Local connection failed, trying caremymed-test...", err.message);
        try {
            await mongoose.connect('mongodb://localhost:27017/caremymed-test');
            console.log("Connected to caremymed-test successfully!");
        } catch (err2) {
            console.error("All connections failed", err2.message);
            process.exit(1);
        }
    }

    const email = 'puneethpujala@gmail.com';
    const patient = await Patient.findOne({ email });
    if (!patient) {
        console.log("No patient found with email:", email);
        
        console.log("\nSearching for any patients in DB:");
        const anyPatients = await Patient.find({}).limit(5);
        anyPatients.forEach(p => {
            console.log(`- ID: ${p._id}, Name: ${p.name}, Email: ${p.email}, Assigned Caller: ${p.assigned_caller_id}`);
        });
        
        process.exit(0);
    }
    
    console.log("Patient name:", patient.name);
    console.log("Patient ID:", patient._id);
    console.log("Assigned Caller ID:", patient.assigned_caller_id);

    if (patient.assigned_caller_id) {
        const caller = await Caller.findById(patient.assigned_caller_id);
        if (caller) {
            console.log("\nAssigned Caller from assigned_caller_id:");
            console.log("ID:", caller._id);
            console.log("Name:", caller.name);
            console.log("Phone:", caller.phone);
            console.log("Is Active:", caller.is_active);
            console.log("Last Active At:", caller.last_active_at);
            console.log("Current Call ID:", caller.current_call_id);
        } else {
            console.log("\nAssigned Caller not found in Caller collection with ID:", patient.assigned_caller_id);
        }
    }

    const callerByLink = await Caller.findOne({ patient_ids: patient._id });
    if (callerByLink) {
        console.log("\nCaller linking to this patient (via patient_ids array):");
        console.log("ID:", callerByLink._id);
        console.log("Name:", callerByLink.name);
        console.log("Phone:", callerByLink.phone);
        console.log("Is Active:", callerByLink.is_active);
        console.log("Last Active At:", callerByLink.last_active_at);
        console.log("Current Call ID:", callerByLink.current_call_id);
    } else {
        console.log("\nNo caller has this patient's ID in patient_ids");
    }

    console.log("\nAll Callers in DB:");
    const allCallers = await Caller.find({});
    allCallers.forEach(c => {
        console.log(`- ID: ${c._id}, Name: ${c.name}, Phone: ${c.phone}, Active: ${c.is_active}, Last Active: ${c.last_active_at}, Patient IDs: ${JSON.stringify(c.patient_ids)}`);
    });

    process.exit(0);
}

test().catch(console.error);
