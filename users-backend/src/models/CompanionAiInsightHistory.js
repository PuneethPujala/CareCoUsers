const mongoose = require("mongoose");

const companionAiInsightHistorySchema = new mongoose.Schema(
  {
    patient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    schema_version: { type: Number, default: 1 },
    risk_level: {
      type: String,
      enum: ["low", "medium", "high"],
      required: true,
    },
    risk_score: { type: Number, min: 0, max: 100, required: true },
    risk_breakdown: {
      adherence: { type: Number, required: true },
      vitals: { type: Number, required: true },
      mood: { type: Number, required: true },
      visibility: { type: Number, required: true },
    },
    visibility_score: { type: Number, min: 0, max: 100, required: true },
    confidence_score: { type: Number, min: 0, max: 100, required: true },
    generated_at: { type: Date, default: Date.now, required: true },
    expires_at: { type: Date, required: true },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

// TTL index to automatically delete records after 60 days
companionAiInsightHistorySchema.index(
  { expires_at: 1 },
  { expireAfterSeconds: 0 },
);

module.exports = mongoose.model(
  "CompanionAiInsightHistory",
  companionAiInsightHistorySchema,
);
