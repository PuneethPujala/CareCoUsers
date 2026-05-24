const mongoose = require('mongoose');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI environment variable is not defined.');
  process.exit(1);
}

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected!');

    // Let's get the collections
    const db = mongoose.connection.db;
    
    console.log('\n--- FETCHING RECENT AUDIT LOGS ---');
    const auditLogs = await db.collection('auditlogs')
      .find({ action: { $in: ['security_event', 'login_failed', 'companion_oauth_linked', 'patient_oauth_linked'] } })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    console.log(JSON.stringify(auditLogs, null, 2));

    console.log('\n--- FETCHING ALL RECENT AUDIT LOGS ---');
    const allLogs = await db.collection('auditlogs')
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    console.log(JSON.stringify(allLogs, null, 2));

    await mongoose.connection.close();
    console.log('\nDone.');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
