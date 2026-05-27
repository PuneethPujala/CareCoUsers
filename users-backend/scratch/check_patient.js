const mongoose = require('mongoose');
const Patient = require('../src/models/Patient');

async function check() {
    await mongoose.connect('mongodb+srv://Prakash45:CareMyMed4533@sih.faidhae.mongodb.net/careconnect?retryWrites=true&w=majority');
    const patient = await Patient.findOne({ email: 'medisettypriyanka05@gmail.com' });
    if (!patient) {
        console.log("Not found by email medisettypriyanka05@gmail.com");
        const p2 = await Patient.findOne({ name: /Priyanka/i });
        if (p2) {
             console.log("Found patient:", p2.name);
             console.log("Push token:", p2.expo_push_token);
             console.log("Med reminders enabled:", p2.medication_reminders_enabled);
             console.log("Preferences:", p2.medication_call_preferences);
             console.log("Meds:", JSON.stringify(p2.medications, null, 2));
        }
    } else {
        console.log("Found patient:", patient.name);
        console.log("Push token:", patient.expo_push_token);
        console.log("Med reminders enabled:", patient.medication_reminders_enabled);
        console.log("Preferences:", patient.medication_call_preferences);
        console.log("Meds:", JSON.stringify(patient.medications, null, 2));
    }
    process.exit(0);
}

check();
