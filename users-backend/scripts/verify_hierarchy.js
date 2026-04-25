const mongoose = require('mongoose');
const dns = require('dns');
require('dotenv').config();
const Profile = require('../src/models/Profile');
const Caller = require('../src/models/Caller');
const Organization = require('../src/models/Organization');

async function verifyHierarchy() {
    try {
        // Force Node to use Google DNS because local Windows DNS resolution for SRV records is failing
        dns.setServers(['8.8.8.8', '8.8.4.4']);

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔗 Connected to MongoDB\n');

        // 1. Setup an Organization
        let testOrg = await Organization.findOne({ city: 'TestCity' });
        if (!testOrg) {
            testOrg = await Organization.create({
                name: 'Hierarchy Test Org',
                city: 'TestCity',
                createdBy: 'system_test',
                isActive: true
            });
        }
        console.log(`🏢 Test Org: ${testOrg.name} (${testOrg._id})`);

        // 2. Create an Org Admin
        const orgAdmin = await Profile.findOneAndUpdate(
            { email: 'org.admin.test@careco.in' },
            {
                supabaseUid: 'test-org-admin-id',
                fullName: 'Test Org Admin',
                role: 'org_admin',
                organizationId: testOrg._id,
                isActive: true
            },
            { upsert: true, new: true }
        );
        console.log(`👤 Org Admin: ${orgAdmin.fullName} (${orgAdmin._id})`);

        // 3. Create a Care Manager
        const careManager = await Profile.findOneAndUpdate(
            { email: 'manager.test@careco.in' },
            {
                supabaseUid: 'test-manager-id',
                fullName: 'Test Care Manager',
                role: 'care_manager',
                organizationId: testOrg._id,
                managerId: orgAdmin._id, // Managed by org admin
                isActive: true
            },
            { upsert: true, new: true }
        );
        console.log(`👨‍💼 Care Manager: ${careManager.fullName} (${careManager._id})`);

        // 4. Create a Caller under the Manager
        // This simulates the behavior of the create-user route
        const callerEmail = 'caller.test@careco.in';
        let callerProfile = await Profile.findOne({ email: callerEmail });
        if (callerProfile) await callerProfile.deleteOne();
        let callerOp = await Caller.findOne({ email: callerEmail });
        if (callerOp) await callerOp.deleteOne();

        callerProfile = new Profile({
            supabaseUid: 'test-caller-id-' + Date.now(),
            email: callerEmail,
            fullName: 'Test Caller',
            role: 'caller',
            organizationId: testOrg._id,
            managerId: careManager._id,
            isActive: true
        });
        await callerProfile.save();
        console.log(`📞 Caller Profile created: ${callerProfile.fullName} under Manager ${careManager.fullName}`);

        // 5. Verify Hook - Did the Caller operational document get created?
        // Wait a bit for the post-save hook to finish (though it's async in the controller, it's a hook here)
        await new Promise(resolve => setTimeout(resolve, 1000));

        const callerDoc = await Caller.findOne({ email: callerEmail });
        if (callerDoc && callerDoc.manager_id.equals(careManager._id)) {
            console.log('✅ PASS: Caller operational document created and synced with manager_id');
        } else {
            console.error('❌ FAIL: Caller operational document not found or manager_id mismatch');
            console.log('Caller Doc:', callerDoc);
        }

        // 6. Test reassignment
        console.log('\n🔄 Testing reassignment by Org Admin...');
        const newManager = await Profile.create({
            supabaseUid: 'test-manager-2-id-' + Date.now(),
            email: 'manager2.test@careco.in',
            fullName: 'New Care Manager',
            role: 'care_manager',
            organizationId: testOrg._id,
            isActive: true
        });

        callerProfile.managerId = newManager._id;
        await callerProfile.save();
        console.log(`Caller reassigned to ${newManager.fullName}`);

        await new Promise(resolve => setTimeout(resolve, 500));
        const updatedCallerDoc = await Caller.findOne({ email: callerEmail });
        if (updatedCallerDoc && updatedCallerDoc.manager_id.equals(newManager._id)) {
            console.log('✅ PASS: Caller operational document synced after reassignment');
        } else {
            console.error('❌ FAIL: Caller operational document failed to sync after reassignment');
        }

        console.log('\n🚀 Verification completed!');
    } catch (err) {
        console.error('\n❌ Verification failed:', err);
    } finally {
        // Cleanup test data
        await Profile.deleteMany({ email: /test@careco\.in/ });
        await Caller.deleteMany({ email: /test@careco\.in/ });
        await mongoose.connection.close();
        process.exit(0);
    }
}

verifyHierarchy();
