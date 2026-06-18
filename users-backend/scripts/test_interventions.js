const mongoose = require('mongoose');
require('dotenv').config();

const Patient = require('../src/models/Patient');
const { generateInterventions } = require('../src/services/interventionEngineService');
const { getOrGenerateInsights } = require('../src/services/companionAiService');

async function test() {
    console.log("Connecting to MONGODB_URI:", process.env.MONGODB_URI);
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Find any patient
    const patient = await Patient.findOne();
    if (!patient) {
        console.log("No patient found in the database.");
        process.exit(0);
    }
    
    console.log("Found patient ID:", patient._id, "Name:", patient.name);
    
    try {
        console.log("Calling getOrGenerateInsights...");
        const insights = await getOrGenerateInsights(patient._id);
        console.log("Insights calculated:", insights ? "Yes" : "No (null)");
        
        console.log("Calling generateInterventions...");
        const interventions = await generateInterventions(patient._id);
        console.log("Interventions generated:", interventions);
    } catch (err) {
        console.error("CRASH ERROR:", err);
    }
    
    process.exit(0);
}

test().catch(console.error);
