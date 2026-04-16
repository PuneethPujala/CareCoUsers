require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const patients = await mongoose.connection.db.collection('patients').find({}).limit(5).toArray();
        console.log('Sample patients schema properties:');
        console.log(JSON.stringify(patients.map(p => ({
            id: p._id,
            organization_id: p.organization_id,
            organizationId: p.organizationId,
            is_active: p.is_active,
            isActive: p.isActive
        })), null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
test();
