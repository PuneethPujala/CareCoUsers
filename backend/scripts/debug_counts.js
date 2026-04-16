const mongoose = require('mongoose');

async function debugCounts() {
  await mongoose.connect('mongodb+srv://Prakash45:prakash4533@sih.faidhae.mongodb.net/careconnect?retryWrites=true&w=majority');
  
  const orgs = await mongoose.connection.db.collection('organizations').find({}).toArray();
  console.log('Orgs:', orgs.map(o => ({ id: o._id, isActive: o.isActive, name: o.name })));
  
  const profiles = await mongoose.connection.db.collection('profiles').find({}).toArray();
  console.log('Profiles Map:', profiles.reduce((acc, p) => {
      acc[p.role] = acc[p.role] || [];
      acc[p.role].push({ id: p._id, isActive: p.isActive, org: p.organizationId, name: p.fullName });
      return acc;
  }, {}));

  const patients = await mongoose.connection.db.collection('patients').find({}).toArray();
  console.log('Patients:', patients.map(p => ({ id: p._id, is_active: p.is_active, amount: p.subscription?.amount })));
  
  mongoose.disconnect();
}
debugCounts();
