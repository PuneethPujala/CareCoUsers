require('dotenv').config();
const mongoose = require('mongoose');
const Profile = require('./src/models/Profile');

async function testAggregate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        // Let's take the first org admin
        const orgAdmin = await Profile.findOne({ role: 'org_admin' });
        console.log('Org Admin orgId:', orgAdmin.organizationId);

        const organizationId = orgAdmin.organizationId;
        const roles = ['care_manager', 'caller', 'patient_mentor', 'patient'];

        const roleCounts = await Profile.aggregate([
            { $match: { organizationId, role: { $in: roles }, isActive: true } },
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);

        console.log('Role counts result:', roleCounts);

        // Test without organizationId to see if anything matches
        const roleCountsAll = await Profile.aggregate([
            { $match: { role: { $in: roles }, isActive: true } },
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);
        console.log('Global Role counts result:', roleCountsAll);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

testAggregate();
