const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); // Workaround for Node.js Atlas connection issues over IPv6

require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const Patient = require('./src/models/Patient');
        const Notification = require('./src/models/Notification');

        console.log('\nSearching for patient Pujala...');
        const patients = await Patient.find({ name: /Pujala|Puneeth/i });
        
        if (patients.length === 0) {
            console.log('No patient matching Pujala or Puneeth found.');
            process.exit(0);
        }

        for (const p of patients) {
            console.log(`\n----------------------------------------`);
            console.log(`Patient Name: ${p.name}`);
            console.log(`Patient Email: ${p.email}`);
            console.log(`Patient ID: ${p._id}`);
            console.log(`Expo Push Token: "${p.expo_push_token}"`);
            console.log(`Push Notifications Enabled: ${p.push_notifications_enabled}`);
            console.log(`Medication Reminders Enabled: ${p.medication_reminders_enabled}`);
            console.log(`Device Platform: ${p.device_platform}`);
            console.log(`Device Name: ${p.device_name}`);

            console.log(`\nRecent Notifications:`);
            const notifs = await Notification.find({ patient_id: p._id }).sort({ created_at: -1 }).limit(10);
            if (notifs.length === 0) {
                console.log('  No notifications found.');
            } else {
                notifs.forEach(n => {
                    console.log(`  - Title: "${n.title}"`);
                    console.log(`    Message: "${n.message.substring(0, 60)}..."`);
                    console.log(`    Created At: ${n.created_at}`);
                    console.log(`    Push Delivered: ${n.push_delivered}`);
                    console.log(`    Expo Ticket ID: ${n.expo_ticket_id}`);
                    console.log(`    Expo Push Token Used: "${n.expo_push_token}"`);
                    console.log(`    Expo Receipt Status: ${n.expo_receipt_status}`);
                    console.log(`    Expo Receipt Error: ${n.expo_receipt_error}`);
                    console.log(`    ---`);
                });
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
