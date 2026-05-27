const mongoose = require('mongoose');
const Patient = require('../src/models/Patient');

async function run() {
    require('dotenv').config();
    await mongoose.connect(process.env.MONGODB_URI);
    const patients = await Patient.find({ expo_push_token: { $ne: null, $ne: '' } });
    console.log(patients.map(p => ({ email: p.email, name: p.name, token: p.expo_push_token, active: p.is_active, notifs: p.push_notifications_enabled })));
    process.exit(0);
}
run();
