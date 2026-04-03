const mongoose = require('mongoose');

const ApplicationSchema = new mongoose.Schema(
    {
        applicant_name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        phone: {
            type: String,
            required: true,
        },
        city: {
            type: String,
            required: true,
            trim: true,
        },
        role_applied: {
            type: String,
            enum: ['caller', 'manager', 'org_admin'],
            required: true,
        },
        experience_years: {
            type: Number,
            default: 0,
        },
        current_employer: String,
        personal_statement: String,
        resume_url: String,
        date_of_birth: Date,
        address: String,
        certifications: [String],
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'info_requested'],
            default: 'pending',
            index: true,
        },
        reviewed_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
        },
        review_notes: String,
        offer_sent: {
            type: Boolean,
            default: false,
        },
        offer_post_flagged: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
);

// Indexes
ApplicationSchema.index({ city: 1, status: 1 });
ApplicationSchema.index({ role_applied: 1, status: 1 });

module.exports = mongoose.model('Application', ApplicationSchema);
