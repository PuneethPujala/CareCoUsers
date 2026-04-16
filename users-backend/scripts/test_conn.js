const mongoose = require('mongoose');
require('dotenv').config();

async function testConn() {
    try {
        // Force Node to use Google DNS because local Windows DNS resolution for SRV records is failing
        dns.setServers(['8.8.8.8', '8.8.4.4']);

        console.log('Testing connection to:', process.env.MONGODB_URI?.split('@')[1]);
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
        console.log('✅ Connected successfully!');
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));
    } catch (err) {
        console.error('❌ Connection failed:', err);
    } finally {
        await mongoose.connection.close();
    }
}

testConn();
