const mongoose = require('mongoose');

const riskTransitionSchema = new mongoose.Schema(
  {
    patient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      default: Date.now,
      required: true,
    },
    from: {
      type: String,
      enum: ['low', 'medium', 'high', 'unknown'],
      required: true,
    },
    to: {
      type: String,
      enum: ['low', 'medium', 'high', 'unknown'],
      required: true,
    },
    reason: {
      summary: { type: String },
      factors: [{ type: String }],
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Optimize sorting index
riskTransitionSchema.index({ patient_id: 1, date: -1 });

module.exports = mongoose.model('RiskTransition', riskTransitionSchema);
