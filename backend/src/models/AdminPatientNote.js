const mongoose = require('mongoose');

/**
 * Admin Patient Notes
 * ⚠️ This collection is NEVER exposed via Users App endpoints.
 * Invisible to patients and callers.
 */
const AdminPatientNoteSchema = new mongoose.Schema(
    {
        patient_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient',
            required: true,
            index: true,
        },
        author_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
            required: true,
        },
        author_role: {
            type: String,
            enum: ['manager', 'org_admin', 'super_admin'],
            required: true,
        },
        note: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: { createdAt: 'created_at' },
    }
);

AdminPatientNoteSchema.index({ patient_id: 1, created_at: -1 });

module.exports = mongoose.model('AdminPatientNote', AdminPatientNoteSchema);
