const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema(
  {
    patient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    // Daily aggregate metrics
    steps: {
      type: Number,
      min: [0, 'Steps cannot be negative'],
    },
    distance_meters: {
      type: Number,
      min: [0, 'Distance cannot be negative'],
    },
    active_calories: {
      type: Number,
      min: [0, 'Active calories cannot be negative'],
    },
    total_calories: {
      type: Number,
      min: [0, 'Total calories cannot be negative'],
    },
    floors_climbed: {
      type: Number,
      min: [0, 'Floors climbed cannot be negative'],
    },
    vo2_max: {
      type: Number,
      min: [0, 'VO₂ max cannot be negative'],
      max: [100, 'VO₂ max cannot exceed 100 ml/kg/min'],
    },
    // Exercise sessions list
    exercises: [
      {
        type: {
          type: String,
          required: true,
        },
        start_time: Date,
        end_time: Date,
        duration_minutes: Number,
        calories: Number,
        distance_meters: Number,
        avg_heart_rate: Number,
        source_id: String,
      },
    ],
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
        'manual',
        'health_connect',
        'healthkit',
        'google_fit',
        'fitbit',
        'garmin',
        'oura',
        'whoop',
        'samsung_health',
        'withings',
        'polar',
      ],
      default: 'manual',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound unique index for daily activity documents
ActivityLogSchema.index({ patient_id: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
