const mongoose = require('mongoose');

const PasswordResetOtpSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        otp: {
            type: String,
            required: true,
            description: 'Hashed 6-digit OTP',
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expires: 0 }, // TTL index — auto-deletes expired docs
        },
        used: {
            type: Boolean,
            default: false,
        },
        attempts: {
            type: Number,
            default: 0,
            description: 'Number of failed verification attempts',
        },
    },
    { timestamps: true }
);

// Compound index for quick lookup
PasswordResetOtpSchema.index({ email: 1, used: 1 });

module.exports = mongoose.model('PasswordResetOtp', PasswordResetOtpSchema);
