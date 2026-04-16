const mongoose = require('mongoose');
const fs = require('fs');

async function getLogs() {
  await mongoose.connect('mongodb+srv://Prakash45:prakash4533@sih.faidhae.mongodb.net/careconnect?retryWrites=true&w=majority');
  
  const logs = await mongoose.connection.db.collection('auditlogs')
    .find({})
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();
    
  fs.writeFileSync('log_dump.json', JSON.stringify(logs, null, 2), 'utf8');
  mongoose.disconnect();
}
getLogs();
