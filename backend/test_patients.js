const mongoose = require('mongoose');
require('./src/models/Organization');
const Patient = require('./src/models/Patient');

async function testPatients() {
  await mongoose.connect('mongodb+srv://Prakash45:prakash4533@sih.faidhae.mongodb.net/careconnect?retryWrites=true&w=majority');
  
  try {
    const patients = await Patient.find({ is_active: true })
      .populate('organization_id', 'name type')
      .limit(1);
      
    console.log(JSON.stringify(patients, null, 2));
  } catch(e) {
    console.error('Error:', e);
  }
  mongoose.disconnect();
}
testPatients();
