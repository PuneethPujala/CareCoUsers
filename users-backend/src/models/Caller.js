const mongoose = require('mongoose');

const CallerSchema = new mongoose.Schema(
    {
        supabase_uid: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        employee_id: {
            type: String,
            unique: true,
            sparse: true,
        },
        city: {
            type: String,
            required: true,
            trim: true,
        },
        organization_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: true,
            index: true,
        },
        manager_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
            index: true,
        },
        patient_ids: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Patient',
            },
        ],
        profile_photo_url: String,
        languages_spoken: [String],
        experience_years: {
            type: Number,
            default: 0,
        },
        phone: String,
        email: {
            type: String,
            lowercase: true,
            trim: true,
        },
        performance: {
            calls_this_week: { type: Number, default: 0 },
            adherence_rate: { type: Number, default: 0 },
            escalations: { type: Number, default: 0 },
        },
        is_active: {
            type: Boolean,
            default: true,
            index: true,
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Virtual for patient count
CallerSchema.virtual('patient_count').get(function () {
    return this.patient_ids ? this.patient_ids.length : 0;
});

// Indexes
CallerSchema.index({ organization_id: 1, is_active: 1 });

module.exports = mongoose.model('Caller', CallerSchema);
