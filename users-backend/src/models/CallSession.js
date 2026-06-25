const mongoose = require("mongoose");

const CallSessionSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    caretakerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Caller",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["ringing", "accepted", "rejected", "missed", "completed"],
      default: "ringing",
      index: true,
    },
    channelName: {
      type: String,
      required: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("CallSession", CallSessionSchema);
