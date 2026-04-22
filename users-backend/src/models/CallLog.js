const mongoose = require('mongoose');

const CallLogSchema = new mongoose.Schema(
    {
        patient_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient',
            required: true,
            index: true,
        },
        caller_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Caller',
            required: true,
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
        call_date: {
            type: Date,
            required: true,
            default: Date.now,
        },
        call_duration_seconds: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: ['completed', 'missed', 'refused', 'escalated', 'attempted'],
            required: true,
            index: true,
        },
        ai_summary: {
            type: String,
            default: '',
        },
        // Visible to managers and above ONLY — stripped from Users App patient endpoints
        caller_notes: {
            type: String,
            default: '',
        },
        // Visible to admins ONLY — NEVER exposed via patient-facing or caller-facing endpoints
        admin_notes: {
            type: String,
            default: '',
        },
        medicine_adherence: {
            taken: [String],
            refused: [String],
            pending: [String],
        },
    },
    {
        timestamps: { createdAt: 'created_at' },
    }
);

// Compound indexes for common queries
CallLogSchema.index({ caller_id: 1, call_date: -1 });
CallLogSchema.index({ patient_id: 1, call_date: -1 });
CallLogSchema.index({ organization_id: 1, call_date: -1 });

module.exports = mongoose.model('CallLog', CallLogSchema);
