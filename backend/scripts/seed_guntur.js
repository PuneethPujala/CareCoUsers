const mongoose = require('mongoose');
const dns = require('dns');
require('dotenv').config();
const Organization = require('../src/models/Organization');
const Profile = require('../src/models/Profile');
const Caller = require('../src/models/Caller');
const Patient = require('../src/models/Patient');

async function seedGuntur() {
    try {
        // Force Node to use Google DNS because local Windows DNS resolution for SRV records is failing
        dns.setServers(['8.8.8.8', '8.8.4.4']);

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔗 Connected to MongoDB');

        // 1. Ensure Guntur Organization exists
        let gunturOrg = await Organization.findOne({ city: 'Guntur' });
        if (!gunturOrg) {
            gunturOrg = await Organization.create({
                name: 'CareCo Guntur Branch',
                city: 'Guntur',
                state: 'Andhra Pradesh',
                createdBy: 'system_seed',
                isActive: true
            });
            console.log('🏙️ Created Guntur Organization');
        }

        // 2. Create Org Admin: Rajesh
        let rajesh = await Profile.findOne({ email: 'rajesh.guntur@careco.in' });
        if (!rajesh) {
            rajesh = await Profile.create({
                supabaseUid: 'rajesh-guntur-admin-id',
                email: 'rajesh.guntur@careco.in',
                fullName: 'Rajesh',
                role: 'org_admin',
                organizationId: gunturOrg._id,
                isActive: true
            });
            console.log('👤 Created Org Admin: Rajesh');
        }

        // 3. Create Care Manager: Abhi under Rajesh
        let abhi = await Profile.findOne({ email: 'abhi.guntur@careco.in' });
        if (!abhi) {
            abhi = await Profile.create({
                supabaseUid: 'abhi-guntur-manager-id',
                email: 'abhi.guntur@careco.in',
                fullName: 'Abhi',
                role: 'care_manager',
                organizationId: gunturOrg._id,
                managerId: rajesh._id,
                isActive: true
            });
            console.log('👨‍💼 Created Care Manager: Abhi');
        }

        // 4. Create Caller: naveen under Abhi
        let naveenProfile = await Profile.findOne({ email: 'naveen.guntur@careco.in' });
        if (!naveenProfile) {
            naveenProfile = await Profile.create({
                supabaseUid: 'naveen-guntur-caller-id',
                email: 'naveen.guntur@careco.in',
                fullName: 'naveen',
                role: 'caller',
                organizationId: gunturOrg._id,
                managerId: abhi._id,
                isActive: true
            });
            console.log('📞 Created Caller Profile: naveen');
        }

        let naveenCaller = await Caller.findOne({ supabase_uid: naveenProfile.supabaseUid });
        if (!naveenCaller) {
            naveenCaller = await Caller.create({
                supabase_uid: naveenProfile.supabaseUid,
                name: 'naveen',
                email: 'naveen.guntur@careco.in',
                city: 'Guntur',
                organization_id: gunturOrg._id,
                manager_id: abhi._id,
                is_active: true
            });
            console.log('📑 Created Caller Operational Document: naveen');
        }

        // 5. Update Patient: Pujala Kavitha
        let patient = await Patient.findOne({ email: 'pujalakavitha87@gmail.com' });
        if (patient) {
            patient.city = 'Guntur';
            patient.organization_id = gunturOrg._id;
            patient.assigned_caller_id = naveenCaller._id;
            patient.assigned_manager_id = abhi._id;
            await patient.save();
            console.log('🏥 Updated Patient: Pujala Kavitha (assigned to naveen and Abhi)');
        } else {
            console.log('⚠️ Patient Pujala Kavitha not found in database');
        }

        console.log('\n✅ Guntur specific seeding completed!');
    } catch (err) {
        console.error('\n❌ Seeding failed:', err);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

seedGuntur();
