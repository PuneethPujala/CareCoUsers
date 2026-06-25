const mongoose = require("mongoose");

/**
 * MedicineCache — Caches AI lookups so we don't call Groq
 * repeatedly for the same medicine name.
 */
const MedicineCacheSchema = new mongoose.Schema(
  {
    nameKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      description: "Lowercase, trimmed medicine name used as cache key",
    },
    originalName: { type: String, trim: true },
    riskTier: {
      type: String,
      enum: ["safe", "caution", "restricted"],
      default: "caution",
    },
    genericName: { type: String, trim: true, default: "" },
    aiSummary: { type: String, trim: true, default: "" },
    sideEffects: [{ type: String, trim: true }],
    warnings: [{ type: String, trim: true }],
    interactions: [{ type: String, trim: true }],
    commonUses: [{ type: String, trim: true }],
  },
  { timestamps: true },
);

module.exports = mongoose.model("MedicineCache", MedicineCacheSchema);
