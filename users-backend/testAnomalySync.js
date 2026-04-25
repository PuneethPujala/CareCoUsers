require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // Override node DNS resolver for SRV queries

const mongoose = require('mongoose');
const Patient = require('./src/models/Patient');
const VitalsIngestionService = require('./src/services/vitalsIngestionService');
const PushNotificationService = require('./src/utils/pushNotifications');

async function testAnomalySync() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Find a patient who has a push token, or just grab the first patient
        let patient = await Patient.findOne({ expo_push_token: { $exists: true, $ne: null, $ne: '' } });

        if (!patient) {
            console.log('⚠️ No patient with a valid push token found. Grabbing the first patient and assigning a mock token for testing...');
            patient = await Patient.findOne();
            if (!patient) {
                console.error('❌ No patients exist in the database at all.');
                return;
            }
            // Assign a mock token to allow the push notification service to attempt sending
            patient.expo_push_token = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';
            await patient.save();
        }

        console.log(`🤖 Using Patient: ${patient.name || patient.email} (${patient._id})`);
        console.log(`📱 Push Token: ${patient.expo_push_token}`);

        // Construct a batch of vitals with at least one critical anomaly
        const readings = [
            {
                timestamp: new Date().toISOString(),
                heart_rate: 195, // Critically high (threshold is 180)
                oxygen_saturation: 85, // Critically low (threshold is 88)
            }
        ];

        console.log('⏳ Running VitalsIngestionService.processBatch()...');
        
        // This should trigger _triggerAnomalyAlerts() inside the service
        const summary = await VitalsIngestionService.processBatch(patient._id, readings, 'health_connect');

        console.log('📊 Sync Summary:', JSON.stringify(summary, null, 2));

        if (summary.anomalies.length > 0) {
            console.log('🚨 Anomaly successfully detected! A push notification command should have been dispatched.');
            
            // Note: Since _triggerAnomalyAlerts doesn't wait/block processBatch and is a floating promise,
            // we will wait a couple of seconds to let it complete sending before we kill the script process.
            console.log('Waiting 3 seconds for async push generation before exiting...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
            console.log('⚠️ No anomalies detected. Check the danger thresholds in VitalsIngestionService.');
        }

    } catch (e) {
        console.error('❌ Error during testing:', e);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

testAnomalySync();
