const mongoose = require('mongoose');

// ─── VitalLog Schema ────────────────────────────────────────────
// Tracks a patient's vital signs for a specific date.
// Metrics required for manual entries; optional for device-synced data.
const VitalLogSchema = new mongoose.Schema(
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
        // Exact timestamp from the wearable device (preserves full resolution)
        raw_timestamp: {
            type: Date,
        },
        heart_rate: {
            type: Number,
            required: true,
            min: [30, 'Heart rate must be at least 30 bpm'],
            max: [250, 'Heart rate cannot exceed 250 bpm'],
        },
        blood_pressure: {
            systolic: {
                type: Number,
                min: [60, 'Systolic BP must be at least 60 mmHg'],
                max: [250, 'Systolic BP cannot exceed 250 mmHg'],
            },
            diastolic: {
                type: Number,
                min: [40, 'Diastolic BP must be at least 40 mmHg'],
                max: [150, 'Diastolic BP cannot exceed 150 mmHg'],
            },
        },
        oxygen_saturation: {
            type: Number,
            min: [0, 'SpO₂ cannot be below 0%'],
            max: [100, 'SpO₂ cannot exceed 100%'],
        },
        hydration: {
            type: Number,
            min: [0, 'Hydration cannot be below 0%'],
            max: [100, 'Hydration cannot exceed 100%'],
        },
        source: {
            type: String,
            enum: ['manual', 'health_connect', 'healthkit'],
            default: 'manual',
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ─── Conditional validation ─────────────────────────────────────
// Manual entries must have all fields; device sources only need heart_rate
VitalLogSchema.pre('validate', function (next) {
    if (this.source === 'manual') {
        if (this.blood_pressure?.systolic == null || this.blood_pressure?.diastolic == null) {
            return next(new Error('Blood pressure (systolic & diastolic) is required for manual entries'));
        }
        if (this.oxygen_saturation == null) {
            return next(new Error('Oxygen saturation is required for manual entries'));
        }
        if (this.hydration == null) {
            return next(new Error('Hydration is required for manual entries'));
        }
    }
    next();
});

// Compound index for efficient patient + date range queries
VitalLogSchema.index({ patient_id: 1, date: -1 });

// Deduplication index: prevent duplicate wearable readings for the same patient + timestamp + source
VitalLogSchema.index(
    { patient_id: 1, raw_timestamp: 1, source: 1 },
    { unique: true, partialFilterExpression: { raw_timestamp: { $exists: true } } }
);

module.exports = mongoose.model('VitalLog', VitalLogSchema);
