const mongoose = require('mongoose');
async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const p = await mongoose.connection.db.collection('profiles').find({ email: 'puneethpujala@gmail.com' }).toArray();
  console.log(`Found ${p.length} profiles with puneethpujala@gmail.com`);
  p.forEach(doc => console.log(`- ID: ${doc._id}, Role: ${doc.role}, Active: ${doc.isActive}`));
  mongoose.disconnect();
}
check();
