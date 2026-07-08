const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Patient = require('../models/Patient');
const Profile = require('../models/Profile');
const Caller = require('../models/Caller');

async function checkPrakash() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('MONGODB_URI not found!');
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');

    // Find caller Prakash
    const caller = await Caller.findOne({ name: /Prakash/i });
    console.log('--- Caller Document ---');
    console.log(JSON.stringify(caller, null, 2));

    // Find associated Profile if any
    if (caller) {
      const profile = await Profile.findOne({ email: caller.email });
      console.log('--- Profile Document ---');
      console.log(JSON.stringify(profile, null, 2));
    }

    // Find matched patient (Pujala)
    const patient = await Patient.findOne({ name: /Pujala/i });
    console.log('--- Patient Document ---');
    console.log(JSON.stringify(patient, null, 2));

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}

checkPrakash();
