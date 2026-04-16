const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  organization_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  caller_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
  care_manager_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date },
  profile_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
  supabase_uid: String,
  subscription: { type: Object }
}, { 
  strict: false,
  collection: 'patients',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

PatientSchema.virtual('fullName').get(function() { return this.name; });
PatientSchema.virtual('isActive').get(function() { return this.is_active; });
PatientSchema.virtual('organizationId').get(function() { return this.organization_id; });
PatientSchema.virtual('callerId').get(function() { return this.caller_id; });
PatientSchema.virtual('careManagerId').get(function() { return this.care_manager_id; });

module.exports = mongoose.model('Patient', PatientSchema);
