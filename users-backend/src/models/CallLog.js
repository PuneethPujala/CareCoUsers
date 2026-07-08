const mongoose = require('mongoose');

const CallLogSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    caretakerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Caller',
      required: true,
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
    },
    scheduledTime: {
      type: Date,
      required: true,
    },
    duration: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: [
        'completed',
        'missed',
        'refused',
        'escalated',
        'attempted',
        'pending',
        'rejected',
        'callback_requested',
        'secure_message_left',
      ],
      index: true,
    },
    priority: {
      type: String,
    },
    outcome: {
      type: String,
    },
    attempts: {
      type: Number,
      default: 1,
    },
    medicationConfirmations: [
      {
        type: mongoose.Schema.Types.Mixed,
      },
    ],
    notes: {
      type: String,
      default: '',
    },
    followUpRequired: {
      type: Boolean,
      default: false,
    },
    callQuality: {
      type: mongoose.Schema.Types.Mixed,
    },
    patientMood: {
      type: String,
    },
    healthConcerns: [
      {
        type: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// Compound indexes for common queries
CallLogSchema.index({ caretakerId: 1, scheduledTime: -1 });
CallLogSchema.index({ patientId: 1, scheduledTime: -1 });
CallLogSchema.index({ organizationId: 1, scheduledTime: -1 });

module.exports = mongoose.model('CallLog', CallLogSchema);
