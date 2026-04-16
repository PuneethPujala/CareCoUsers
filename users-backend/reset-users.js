require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        await db.collection('patients').updateMany({}, {
            $set: {
                'subscription.plan': 'free',
                assigned_caller_id: null,
                conditions: [],
                medical_history: [],
                allergies: [],
                medications: []
            }
        });
        console.log('Reset all patients to Free tier.');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}
run();
