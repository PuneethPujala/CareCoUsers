const mongoose = require("mongoose");

const sleepLogSchema = new mongoose.Schema(
  {
    patient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    hours: {
      type: Number,
      required: true,
      min: [0, "Sleep hours cannot be negative"],
      max: [24, "Sleep hours cannot exceed 24"],
    },
    quality: {
      type: String,
      enum: ["poor", "fair", "good", "excellent"],
    },
    deep_sleep_hours: {
      type: Number,
      min: 0,
      max: 24,
    },
    rem_sleep_hours: {
      type: Number,
      min: 0,
      max: 24,
    },
    source: {
      type: String,
      enum: ["manual", "health_connect", "healthkit", "fitbit", "garmin"],
      default: "manual",
    },
    expires_at: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

// Compound unique index for patient and date to guarantee database-level idempotency
sleepLogSchema.index({ patient_id: 1, date: 1 }, { unique: true });

// TTL index to automatically delete expired logs after 60 days
sleepLogSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("SleepLog", sleepLogSchema);
