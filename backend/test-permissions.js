require('dotenv').config();
const mongoose = require('mongoose');
const RolePermission = require('./src/models/RolePermission');

async function checkPermissions() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const orgAdminPermissions = await RolePermission.find({ role: 'org_admin' });
        console.log(`Found ${orgAdminPermissions.length} permissions for org_admin`);

        const profileRead = orgAdminPermissions.find(p => p.resource === 'profile' && p.action === 'read');
        console.log('Has profile:read permission?', !!profileRead);

        // Also check if there are ANY permissions. If 0, the seed script was never run.
        const totalPerms = await RolePermission.countDocuments();
        console.log(`Total permissions in DB: ${totalPerms}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

checkPermissions();
