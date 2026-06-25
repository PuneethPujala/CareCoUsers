const mongoose = require("mongoose");

const weeklySummarySchema = new mongoose.Schema({
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true,
    index: true,
  },
  week_start: { type: Date, required: true },
  week_end: { type: Date, required: true },
  summary_text: { type: String, required: true },
  encouragement_text: { type: String },
  areas_to_improve: { type: String },
  read_at: { type: Date, default: null },
  generated_at: { type: Date, default: Date.now },
});

weeklySummarySchema.index({ patient_id: 1, week_start: 1 }, { unique: true });

module.exports = mongoose.model("WeeklySummary", weeklySummarySchema);
