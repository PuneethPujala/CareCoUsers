const mongoose = require('mongoose');

// ─── VitalLog Schema ────────────────────────────────────────────
// Tracks a patient's vital signs for a specific date.
// All metrics are required with strict clinical-range validation.
const VitalLogSchema = new mongoose.Schema(
    {
        patient_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        date: {
            type: Date,
            required: true,
            default: Date.now,
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
                required: true,
                min: [60, 'Systolic BP must be at least 60 mmHg'],
                max: [250, 'Systolic BP cannot exceed 250 mmHg'],
            },
            diastolic: {
                type: Number,
                required: true,
                min: [40, 'Diastolic BP must be at least 40 mmHg'],
                max: [150, 'Diastolic BP cannot exceed 150 mmHg'],
            },
        },
        oxygen_saturation: {
            type: Number,
            required: true,
            min: [0, 'SpO₂ cannot be below 0%'],
            max: [100, 'SpO₂ cannot exceed 100%'],
        },
        hydration: {
            type: Number,
            required: true,
            min: [0, 'Hydration cannot be below 0%'],
            max: [100, 'Hydration cannot exceed 100%'],
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Compound index for efficient patient + date range queries
VitalLogSchema.index({ patient_id: 1, date: -1 });

module.exports = mongoose.model('VitalLog', VitalLogSchema);
