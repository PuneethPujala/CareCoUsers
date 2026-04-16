require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // Override node DNS resolver for SRV queries

const mongoose = require('mongoose');
const Patient = require('./src/models/Patient');
const PushNotificationService = require('./src/utils/pushNotifications');

async function testPush() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');
        const patients = await Patient.find({ expo_push_token: { $exists: true, $ne: null } });
        console.log(`Found ${patients.length} patients with push tokens`);
        
        for (const p of patients) {
            console.log(`Sending to patient: ${p.name || p.email}, Token: ${p.expo_push_token}`);
            const result = await PushNotificationService.sendPush(
                p.expo_push_token,
                'Testing Push Notifications 🚀',
                'If you receive this, the Samvaya backend and Expo Push routing is working perfectly!'
            );
            console.log('Result:', result);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

testPush();
