const mongoose = require("mongoose");

const achievementEventSchema = new mongoose.Schema(
  {
    patient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    achievement: {
      type: String,
      required: true,
    },
    earned_at: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

// Compound index to guarantee uniqueness of achievement event per patient
achievementEventSchema.index(
  { patient_id: 1, achievement: 1 },
  { unique: true },
);

// Optimize query index
achievementEventSchema.index({ patient_id: 1, earned_at: -1 });

module.exports = mongoose.model("AchievementEvent", achievementEventSchema);
