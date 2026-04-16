require('dotenv').config();
const mongoose = require('mongoose');
const Profile = require('./src/models/Profile');
const fs = require('fs');

async function checkProfiles() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const orgAdmins = await Profile.find({ role: 'org_admin' }, '_id email organizationId isActive').lean();
        const careManagers = await Profile.find({ role: 'care_manager' }, '_id email organizationId isActive').lean();

        fs.writeFileSync('test-profiles-output.json', JSON.stringify({
            orgAdmins,
            careManagers
        }, null, 2));
        console.log('Done writing to test-profiles-output.json');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

checkProfiles();
