const mongoose = require('mongoose');
async function check() {
  await mongoose.connect('mongodb+srv://Prakash45:prakash4533@sih.faidhae.mongodb.net/careconnect?retryWrites=true&w=majority');
  const p = await mongoose.connection.db.collection('profiles').findOne({ email: 'puneethpujala@gmail.com' });
  console.log('Role of puneethpujala@gmail.com:', p.role);
  mongoose.disconnect();
}
check();
