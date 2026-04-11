const mongoose = require('mongoose');

const PredictionSchema = new mongoose.Schema(
    {
        date: { type: Date, required: true },
        heart_rate: { type: Number, required: true },
        blood_pressure: {
            systolic: { type: Number, required: true },
            diastolic: { type: Number, required: true }
        },
        oxygen_saturation: { type: Number, required: true },
        hydration: { type: Number, required: true },
    },
    { _id: false }
);

const AIVitalPredictionSchema = new mongoose.Schema(
    {
        patient_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        health_label: {
            type: String,
            enum: ['Normal', 'Warning', 'Critical'],
            default: 'Normal',
        },
        consecutive_critical_days: {
            type: Number,
            default: 0,
        },
        predictions: [PredictionSchema],
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

module.exports = mongoose.model('AIVitalPrediction', AIVitalPredictionSchema);
