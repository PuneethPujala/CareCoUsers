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
        expo_ticket_id: {
            type: String,
            index: true,
        },
        expo_receipt_status: {
            type: String,
            enum: ['pending', 'ok', 'error'],
            default: 'pending',
            index: true,
        },
        expo_receipt_error: {
            type: String,
        },
        expo_push_token: {
            type: String,
        },
        receipt_checked_at: {
            type: Date,
        },
        ai_context: {
            trigger: String,
            streak_impact: String,
            rule_matched: String,
        },
        dedupe_key: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Compound indexes for common query patterns
NotificationSchema.index({ patient_id: 1, created_at: -1 }); // list notifications sorted by date
NotificationSchema.index({ patient_id: 1, is_read: 1, created_at: -1 }); // unread count + filtered lists

// Idempotency: Ensure no duplicate reminders are generated (sparse prevents errors if missing)
NotificationSchema.index({ dedupe_key: 1 }, { unique: true, sparse: true });

// Auto-delete backend notifications after 30 days to save space
NotificationSchema.index({ created_at: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('Notification', NotificationSchema);
