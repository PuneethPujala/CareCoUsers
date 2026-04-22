const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Organization = require('./src/models/Organization');
  const org = await Organization.findOne();
  console.log('Total Revenue:', org ? org.totalRevenue : 'No org');
  if (org && org.collaborations) {
     console.log('Collabs:', org.collaborations.map(c => c.dealAmount));
  }
  process.exit();
}
run();
