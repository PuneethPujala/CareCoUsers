const mongoose = require('mongoose');

const InterventionSchema = new mongoose.Schema(
    {
        patient_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient',
            required: true,
            index: true,
        },
        companion_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
            index: true,
        },
        type: {
            type: String,
            enum: ['medication_reminder', 'bp_request', 'checkin_call', 'escalation_contact'],
            required: true,
            index: true,
        },
        source: {
            type: String,
            enum: ['system', 'companion'],
            default: 'system',
            index: true,
        },
        status: {
            type: String,
            enum: ['generated', 'completed', 'dismissed'],
            default: 'generated',
            index: true,
        },
        priority_score: {
            type: Number,
            min: 0,
            max: 100,
            default: 50,
        },
        reason: {
            type: String,
        },
        generated_at: {
            type: Date,
            default: Date.now,
        },
        completed_at: {
            type: Date,
        },
        cooldown_until: {
            type: Date,
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
);

// Compound index for cooldown check
InterventionSchema.index({ patient_id: 1, type: 1, status: 1 });

module.exports = mongoose.model('Intervention', InterventionSchema);
