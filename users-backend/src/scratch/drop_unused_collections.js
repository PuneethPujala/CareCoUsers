const mongoose = require('mongoose');
const path = require('path');
const dns = require('dns');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const collectionsToDrop = [
    'escalations',
    'invoices',
    'mentorauthorizations',
    'devicetokens',
    'medications',
    'caretakerpatients'
];

async function cleanup() {
    try {
        console.log('Connecting to MongoDB...');
        // Force Google DNS for Atlas connectivity on Windows
        dns.setServers(['8.8.8.8', '8.8.4.4']);
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected.');

        const db = mongoose.connection.db;
        const currentCollections = (await db.listCollections().toArray()).map(c => c.name);

        for (const col of collectionsToDrop) {
            if (currentCollections.includes(col)) {
                console.log(`Dropping collection: ${col}...`);
                await db.dropCollection(col);
                console.log(`✅ Dropped ${col}`);
            } else {
                console.log(`ℹ️ Collection ${col} not found, skipping.`);
            }
        }

        console.log('\n✨ Database cleanup complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Cleanup failed:', error);
        process.exit(1);
    }
}

cleanup();
