const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb+srv://Prakash45:prakash4533@sih.faidhae.mongodb.net/careconnect?retryWrites=true&w=majority');
  
  try {
    const revenueAgg = await mongoose.connection.db.collection('patients').aggregate([
        { $match: { 'subscription.status': 'active' } },
        { $group: { _id: null, total: { $sum: '$subscription.amount' } } }
    ]).toArray();
    console.log('Revenue:', revenueAgg);

    const orgPatientCounts = await mongoose.connection.db.collection('patients').aggregate([
        { $match: { is_active: { $ne: false }, organization_id: { $exists: true, $ne: null } } },
        { $group: { _id: '$organization_id', count: { $sum: 1 } } }
    ]).toArray();
    console.log('OrgPatientCounts:', orgPatientCounts);

    const patientCount = await mongoose.connection.db.collection('patients').countDocuments({ is_active: { $ne: false } });
    console.log('PatientCount:', patientCount);
  } catch(e) {
    console.error('Error:', e);
  }
  mongoose.disconnect();
}
test();
