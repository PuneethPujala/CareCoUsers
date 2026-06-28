const mongoose = require("mongoose");

const patientHealthStateHistorySchema = new mongoose.Schema(
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
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    score_breakdown: {
      medications: { type: Number, default: 0 },
      vitals: { type: Number, default: 0 },
      lifestyle: { type: Number, default: 0 },
      conditions: { type: Number, default: 0 },
    },
    adherence: {
      today: { type: Number, required: true },
      streak: { type: Number, required: true },
    },
    mood: {
      type: String,
      enum: ["sad", "okay", "good", "great", null],
      default: null,
    },
    sleepHours: {
      type: Number,
      default: 0,
    },
    bpAvg: {
      systolic: { type: Number, default: null },
      diastolic: { type: Number, default: null },
    },
    risk: {
      type: String,
      enum: ["low", "medium", "high", "unknown"],
      default: "low",
    },
    schema_version: {
      type: Number,
      default: 1,
    },
    algorithm_version: {
      type: Number,
      default: 1,
    },
    personal_baseline: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
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

// Compound index for unique daily states per patient
patientHealthStateHistorySchema.index(
  { patient_id: 1, date: 1 },
  { unique: true },
);

// TTL index to automatically purge entries after 60 days
patientHealthStateHistorySchema.index(
  { expires_at: 1 },
  { expireAfterSeconds: 0 },
);

module.exports = mongoose.model(
  "PatientHealthStateHistory",
  patientHealthStateHistorySchema,
);
