require('dotenv').config();
const mongoose = require('mongoose');
const { Types } = mongoose;
const { vitalsQueue } = require('../src/lib/vitalsQueue');

// Models
const Patient = require('../src/models/Patient');
const VitalLog = require('../src/models/VitalLog');
const AIVitalPrediction = require('../src/models/AIVitalPrediction');

async function runTest() {
    console.log('--- STARTING AI VITAL PREDICTIONS TEST ---');

    console.log('1. Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected.');

    // 2. Create dummy patient
    const mockEmail = 'ai_test_patient_' + Date.now() + '@careco.test';
    const patient = await Patient.create({
        supabase_uid: 'fake_uid_' + Date.now(),
        email: mockEmail,
        name: 'AI Test Patient',
        organization_id: new Types.ObjectId()
    });
    console.log(`2. Created mock patient: ${patient._id}`);

    // 3. Generate 10 days of historical vitals to give the prediction model something to trend
    // Let's make the BP trend progressively higher so the model predicts a warning/critical state
    console.log('3. Seeding 10 historical VitalLogs...');
    const now = new Date();
    const logs = [];
    for (let i = 10; i >= 1; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        logs.push({
            patient_id: patient._id,
            date: d,
            heart_rate: 75 + i, // slight increase
            blood_pressure: {
                systolic: 120 + (10 - i) * 3, // 120 -> 147 (rising)
                diastolic: 80 + (10 - i) * 2
            },
            oxygen_saturation: 98,
            hydration: 70
        });
    }
    await VitalLog.insertMany(logs);
    console.log('Finished seeding VitalLogs.');

    // 4. Trigger Queue Job
    console.log('4. Pushing prediction job to vitalsQueue (BullMQ)...');
    await vitalsQueue.add('predict_vitals', { patient_id: patient._id.toString() });
    console.log('Job pushed successfully.');

    // 5. Wait for queue and worker to process
    console.log('5. Waiting 15 seconds for BullMQ worker and Python AI Service to process...');
    await new Promise(resolve => setTimeout(resolve, 15000));

    // 6. Verify Outcome
    console.log('6. Verifying generated predictions in MongoDB...');
    const aiPred = await AIVitalPrediction.findOne({ patient_id: patient._id });
    if (!aiPred) {
        console.error('❌ FAILURE: AI Prediction document was not created.');
    } else {
        console.log('✅ SUCCESS: AI Prediction found!');
        console.log(`   👉 Health Label: ${aiPred.health_label}`);
        console.log(`   👉 Forecast Days: ${aiPred.predictions.length}`);
        if(aiPred.predictions.length > 0) {
            const first = aiPred.predictions[0];
            console.log(`   👉 Tomorrows forecasted BP: ${first.blood_pressure.systolic.toFixed(1)} / ${first.blood_pressure.diastolic.toFixed(1)}`);
        }
    }

    // Cleanup
    console.log('7. Cleaning up test data...');
    await Patient.findByIdAndDelete(patient._id);
    await VitalLog.deleteMany({ patient_id: patient._id });
    if (aiPred) await AIVitalPrediction.findByIdAndDelete(aiPred._id);

    console.log('Cleanup complete. Shutting down.');
    await mongoose.disconnect();
    process.exit(0);
}

runTest().catch((err) => {
    console.error('Test execution error:', err);
    process.exit(1);
});
