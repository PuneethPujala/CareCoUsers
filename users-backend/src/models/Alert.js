const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: [
                'missed_call',
                'medicine_refusal',
                'medication_modification',
                'unresponsive_7days',
                'caller_performance',
                'patient_unreachable_3attempts',
                'caller_capacity',
                'team_lead_recommended',
            ],
            required: true,
            index: true,
        },
        patient_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient',
            index: true,
        },
        caller_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Caller',
            index: true,
        },
        manager_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
            index: true,
        },
        organization_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            index: true,
        },
        status: {
            type: String,
            enum: ['open', 'actioned', 'resolved'],
            default: 'open',
            index: true,
        },
        auto_generated: {
            type: Boolean,
            default: true,
        },
        action_taken: String,
        description: String,
        resolved_at: Date,
    },
    {
        timestamps: { createdAt: 'created_at' },
    }
);

// Compound indexes
AlertSchema.index({ manager_id: 1, status: 1 });
AlertSchema.index({ organization_id: 1, status: 1 });

module.exports = mongoose.model('Alert', AlertSchema);
