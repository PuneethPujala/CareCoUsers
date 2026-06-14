const mongoose = require('mongoose');
require('dotenv').config();

const Patient = require('../src/models/Patient');
const MedicineLog = require('../src/models/MedicineLog');

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const email = 'puneethpujala@gmail.com';
    const patient = await Patient.findOne({ email });
    if (!patient) {
        console.log("No patient found with email:", email);
        process.exit(0);
    }
    
    console.log("Patient ID:", patient._id);
    console.log("Current Streak (from DB gamification):", patient.gamification?.current_streak);
    console.log("Unlocked Achievements in DB:", patient.unlockedAchievements);
    
    const logs = await MedicineLog.find({ patient_id: patient._id });
    console.log("Number of MedicineLogs:", logs.length);
    if (logs.length > 0) {
        console.log("First log:", logs[0].date, logs[0].medicines);
    }
    
    process.exit(0);
}

test().catch(console.error);
