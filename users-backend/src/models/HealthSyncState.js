const mongoose = require("mongoose");

const HealthSyncStateSchema = new mongoose.Schema(
  {
    patient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      unique: true,
      index: true,
    },
    last_sync: {
      type: Date,
    },
    last_successful_sync: {
      type: Date,
    },
    sync_version: {
      type: Number,
      default: 1,
    },
    platform: {
      type: String,
      enum: ["android", "ios"],
    },
    permissions_granted: [
      {
        type: String,
      },
    ],
    device_id: {
      type: String,
    },
    device_name: {
      type: String,
    },
    health_provider: {
      type: String,
    },
    sync_count_today: {
      type: Number,
      default: 0,
    },
    last_error: {
      type: String,
    },
    last_error_at: {
      type: Date,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

module.exports = mongoose.model("HealthSyncState", HealthSyncStateSchema);
