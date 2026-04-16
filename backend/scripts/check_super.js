const mongoose = require('mongoose');
async function check() {
  await mongoose.connect('mongodb+srv://Prakash45:prakash4533@sih.faidhae.mongodb.net/careconnect?retryWrites=true&w=majority');
  
  const p = await mongoose.connection.db.collection('profiles').findOne({ email: 'puneethpujala@gmail.com' });
  console.log('--- DB RECORD FOR PUNEETHPUJALA@GMAIL.COM ---');
  console.log(JSON.stringify(p, null, 2));
  
  mongoose.disconnect();
}
check();
