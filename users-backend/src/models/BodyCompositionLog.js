const mongoose = require("mongoose");

const BodyCompositionLogSchema = new mongoose.Schema(
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
      default: Date.now,
    },
    weight_kg: {
      type: Number,
      min: [10, "Weight must be at least 10 kg"],
      max: [500, "Weight cannot exceed 500 kg"],
    },
    height_cm: {
      type: Number,
      min: [30, "Height must be at least 30 cm"],
      max: [300, "Height cannot exceed 300 cm"],
    },
    body_fat_pct: {
      type: Number,
      min: [1, "Body fat percentage must be at least 1%"],
      max: [70, "Body fat percentage cannot exceed 70%"],
    },
    bmi: {
      type: Number,
      min: [10, "BMI must be at least 10"],
      max: [80, "BMI cannot exceed 80"],
    },
    metadata: {
      device_name: String,
      device_manufacturer: String,
      device_model: String,
      record_id: String,
      last_modified: Date,
      timezone: String,
      recorded_at: Date,
    },
    source: {
      type: String,
      enum: [
        "manual",
        "health_connect",
        "healthkit",
        "google_fit",
        "fitbit",
        "garmin",
        "oura",
        "whoop",
        "samsung_health",
        "withings",
        "polar",
      ],
      default: "manual",
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound unique index for daily composition snapshots
BodyCompositionLogSchema.index({ patient_id: 1, date: 1 }, { unique: true });
// Fast query index for fetching history (ordered by date desc)
BodyCompositionLogSchema.index({ patient_id: 1, date: -1 });

module.exports = mongoose.model("BodyCompositionLog", BodyCompositionLogSchema);
