const mongoose = require('mongoose');

const CarePlanHistorySchema = new mongoose.Schema(
    {
        patient_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient',
            required: true,
            index: true,
        },
        week_start: {
            type: Date,
            required: true,
            index: true,
        },
        week_end: {
            type: Date,
            required: true,
            index: true,
        },
        version: {
            type: Number,
            required: true,
            default: 1,
        },
        medication_tasks: [
            {
                name: { type: String, required: true },
                time_slot: { type: String, required: true },
            }
        ],
        vitals_target: {
            type: String,
            default: 'BP check every 2 days',
        },
        sleep_hours_goal: {
            type: Number,
            default: 7.5,
        },
        target_health_score: {
            type: Number,
            required: true,
        },
        active: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
);

// Ensure unique active version per week start per patient
CarePlanHistorySchema.index({ patient_id: 1, week_start: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('CarePlanHistory', CarePlanHistorySchema);
