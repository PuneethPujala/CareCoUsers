const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        const p1 = await mongoose.connection.db.collection('patients').findOne({ medical_history: { $exists: true, $not: {$size: 0} } });
        const data = {
            medical_history: p1 ? p1.medical_history : null,
            conditions: p1 ? p1.conditions : null,
            allergies: p1 ? p1.allergies : null,
            vaccinations: p1 ? p1.vaccinations : null,
        };
        fs.writeFileSync('tmp-patient.json', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
});
