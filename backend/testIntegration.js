const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Organization = require('./src/models/Organization');
  const org = await Organization.findOne({ collaborations: { $exists: true, $not: { $size: 0 } } });
  
  if (!org) {
      console.log('No org with collabs found. Creating one...');
      const newOrg = new Organization({
          name: 'Test Org',
          type: 'clinic',
          createdBy: 'test-admin',
          collaborations: [{ partnerName: 'Test Deal', dealAmount: 500 }],
      });
      newOrg.totalRevenue = 500;
      await newOrg.save();
      console.log('Created test org. Run again.');
      process.exit();
  }
  
  console.log('Before: Total Revenue:', org.totalRevenue);
  
  // Simulate the exact code from organizations.js
  const collabIds = [org.collaborations[0]._id.toString()];
  
  let revenueToDeduct = 0;
  const originalCollabs = org.collaborations || [];
  
  org.collaborations = originalCollabs.filter(c => {
    if (collabIds.includes(c._id.toString())) {
      revenueToDeduct += (c.dealAmount || 0);
      return false;
    }
    return true;
  });

  org.totalRevenue = Math.max(0, (org.totalRevenue || 0) - revenueToDeduct);
  await org.save();
  
  const updatedOrg = await Organization.findById(org._id);
  console.log('After: Total Revenue:', updatedOrg.totalRevenue);
  
  process.exit();
}
run();
