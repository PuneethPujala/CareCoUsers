const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
    {
        patient_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient',
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ['health_tips', 'mental_wellness', 'activity', 'reminders', 'critical_alerts', 'system'],
            default: 'system',
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        message: {
            type: String,
            required: true,
        },
        is_read: {
            type: Boolean,
            default: false,
            index: true,
        },
        target_screen: {
            type: String,
            default: 'HomeScreen',
        },
        is_pinned: {
            type: Boolean,
            default: false,
        },
        push_delivered: {
            type: Boolean,
            default: false,
        },
        ai_context: {
            trigger: String,
            streak_impact: String,
            rule_matched: String,
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Auto-delete backend notifications after 30 days to save space
NotificationSchema.index({ created_at: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('Notification', NotificationSchema);
