const mongoose = require('mongoose');

const PushTokenSchema = new mongoose.Schema({
    profileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Profile',
        required: true,
        index: true,
    },
    token: {
        type: String,
        required: true,
        unique: true,
    },
    platform: {
        type: String,
        enum: ['ios', 'android', 'web'],
        default: 'android',
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

// One token per profile (upsert-friendly)
PushTokenSchema.index({ profileId: 1, token: 1 }, { unique: true });

module.exports = mongoose.model('PushToken', PushTokenSchema);
