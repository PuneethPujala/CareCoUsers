const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function migrate() {
    try {
        console.log('🚀 Starting Medication Schema Cleanup...');
        
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI not found in .env');
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔗 Connected to MongoDB');

        const db = mongoose.connection.db;
        const collection = db.collection('patients');

        // Fields to unset from the medications array
        const fieldsToUnset = {
            "medications.$[].frequency": "",
            "medications.$[].takenDates": "",
            "medications.$[].start_date": "",
            "medications.$[].end_date": "",
            "medications.$[].refill_due": "",
            "medications.$[].prescribed_by": ""
        };

        const result = await collection.updateMany(
            {}, 
            { $unset: fieldsToUnset }
        );

        console.log(`\n✅ Cleanup complete!`);
        console.log(`   - Documents updated: ${result.modifiedCount}`);
        console.log(`   - Fields purged: [frequency, takenDates, start_date, end_date, refill_due, prescribed_by]`);
        
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
        process.exit(0);
    }
}

migrate();
