const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'missed_call',
        'medicine_refusal',
        'medication_modification',
        'unresponsive_7days',
        'caller_performance',
        'patient_unreachable_3attempts',
        'caller_capacity',
        'team_lead_recommended',
        'general',
        'other',
        'medication_missed',
      ],
      required: true,
      index: true,
    },
    patient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
    },
    caller_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Caller',
    },
    manager_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
    },
    organization_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
    },
    status: {
      type: String,
      enum: ['open', 'actioned', 'resolved', 'acknowledged'],
      default: 'open',
      index: true,
    },
    auto_generated: {
      type: Boolean,
      default: true,
    },
    action_taken: String,
    description: String,
    resolved_at: Date,
    prescription_url: String,
    extracted_medicines: [
      {
        name: String,
        dosage: String,
        frequency: String,
        duration: String,
      },
    ],
    acknowledged_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
    },
    acknowledged_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at' },
  }
);

// Compound indexes
AlertSchema.index({ manager_id: 1, status: 1 });
AlertSchema.index({ organization_id: 1, status: 1 });

// Feed queries: alerts by caller or patient, sorted by date
AlertSchema.index({ caller_id: 1, created_at: -1 });
AlertSchema.index({ patient_id: 1, created_at: -1 });

// Open alerts lookup by patient
AlertSchema.index({ patient_id: 1, status: 1, created_at: -1 });

module.exports = mongoose.model('Alert', AlertSchema);
