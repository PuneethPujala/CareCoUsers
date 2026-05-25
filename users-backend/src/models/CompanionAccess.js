const mongoose = require('mongoose');

const CompanionAccessSchema = new mongoose.Schema(
  {
    companion_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Companion',
      required: true,
      index: true,
    },
    patient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    relationship_type: {
      type: String,
      enum: ['Spouse', 'Child', 'Sibling', 'Professional', 'Other'],
      default: 'Other',
    },
    access_level: {
      type: String,
      enum: ['viewer', 'caregiver', 'manager', 'emergency_only'],
      default: 'viewer',
    },
    permissions: {
      type: [String],
      default: ['read_only', 'alerts'],
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked', 'expired', 'blocked'],
      default: 'accepted',
      index: true,
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },
    joined_at: {
      type: Date,
      default: Date.now,
    },
    revoked_at: {
      type: Date,
    },
    revoked_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
    },
    invite_code: {
      type: String,
      trim: true,
    },
    invite_expires_at: {
      type: Date,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
    },
    notification_preferences: {
      missed_meds: { type: Boolean, default: true },
      long_inactivity: { type: Boolean, default: true },
      weekly_summaries: { type: Boolean, default: true },
      adherence_improvements: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

// Compound Unique Index to ensure a companion is mapped to a patient only once
CompanionAccessSchema.index({ companion_id: 1, patient_id: 1 }, { unique: true });

module.exports = mongoose.model('CompanionAccess', CompanionAccessSchema);
