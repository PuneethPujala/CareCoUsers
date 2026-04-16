const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
    {
        recipientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
            required: true,
            index: true,
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
            description: 'Null for system-generated notifications',
        },
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            index: true,
        },

        // ── Classification ───────────────────────────────────────────
        type: {
            type: String,
            required: true,
            enum: [
                'call_reminder',
                'medication_alert',
                'escalation_alert',
                'shift_reminder',
                'report_ready',
                'system_announcement',
                'patient_update',
                'compliance_alert',
                'assignment_change',
                'invoice_generated',
                'payment_received',
                'account_activity',
                'password_change',
                'new_user_added',
                'schedule_change',
                'sla_breach',
                'call_overdue',
            ],
            index: true,
        },
        channel: {
            type: String,
            enum: ['push', 'email', 'sms', 'in_app'],
            default: 'in_app',
            index: true,
        },
        priority: {
            type: String,
            enum: ['low', 'normal', 'high', 'urgent'],
            default: 'normal',
        },

        // ── Content ──────────────────────────────────────────────────
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        body: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000,
        },
        data: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
            description: 'Action payload — e.g., { screen: "PatientDetail", id: "xxx" }',
        },

        // ── Delivery tracking ────────────────────────────────────────
        status: {
            type: String,
            enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
            default: 'pending',
            index: true,
        },
        sentAt: {
            type: Date,
        },
        deliveredAt: {
            type: Date,
        },
        readAt: {
            type: Date,
        },
        failedAt: {
            type: Date,
        },
        failedReason: {
            type: String,
            trim: true,
            maxlength: 500,
        },
        retryCount: {
            type: Number,
            default: 0,
        },

        // ── Grouping ─────────────────────────────────────────────────
        groupKey: {
            type: String,
            trim: true,
            description: 'For grouping related notifications (e.g., same escalation)',
        },

        // ── Linked entities ──────────────────────────────────────────
        relatedEntityType: {
            type: String,
            enum: ['call_log', 'escalation', 'medication', 'invoice', 'profile', 'organization'],
        },
        relatedEntityId: {
            type: mongoose.Schema.Types.ObjectId,
        },

        // ── TTL ──────────────────────────────────────────────────────
        expiresAt: {
            type: Date,
            index: { expires: 0 },
            description: 'Auto-deletes after this date',
        },

        // ── Push notification metadata ───────────────────────────────
        pushToken: {
            type: String,
            trim: true,
        },
        pushReceipt: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ── Indexes ────────────────────────────────────────────────────
NotificationSchema.index({ recipientId: 1, status: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, readAt: 1 });
NotificationSchema.index({ organizationId: 1, type: 1, createdAt: -1 });
NotificationSchema.index({ groupKey: 1, createdAt: -1 });

// ── Virtuals ───────────────────────────────────────────────────
NotificationSchema.virtual('isRead').get(function () {
    return this.status === 'read' || !!this.readAt;
});

NotificationSchema.virtual('isExpired').get(function () {
    return this.expiresAt && this.expiresAt < new Date();
});

// ── Pre-save ───────────────────────────────────────────────────
NotificationSchema.pre('save', function (next) {
    // Auto-set expiry if not provided (90 days for in_app, 30 days for others)
    if (this.isNew && !this.expiresAt) {
        const days = this.channel === 'in_app' ? 90 : 30;
        this.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }
    next();
});

// ── Statics ────────────────────────────────────────────────────
NotificationSchema.statics.findUnreadByRecipient = function (recipientId, limit = 50) {
    return this.find({
        recipientId,
        status: { $in: ['pending', 'sent', 'delivered'] },
        $or: [
            { expiresAt: { $gt: new Date() } },
            { expiresAt: null },
        ],
    })
        .sort({ createdAt: -1 })
        .limit(limit);
};

NotificationSchema.statics.getUnreadCount = function (recipientId) {
    return this.countDocuments({
        recipientId,
        status: { $in: ['pending', 'sent', 'delivered'] },
        $or: [
            { expiresAt: { $gt: new Date() } },
            { expiresAt: null },
        ],
    });
};

NotificationSchema.statics.markAllAsRead = function (recipientId) {
    return this.updateMany(
        {
            recipientId,
            status: { $in: ['pending', 'sent', 'delivered'] },
        },
        {
            $set: { status: 'read', readAt: new Date() },
        }
    );
};

NotificationSchema.statics.createBulk = async function (notifications) {
    return this.insertMany(notifications, { ordered: false });
};

NotificationSchema.statics.findPendingForDelivery = function (channel, limit = 100) {
    return this.find({
        channel,
        status: 'pending',
        retryCount: { $lt: 3 },
    })
        .sort({ priority: -1, createdAt: 1 })
        .limit(limit);
};

// ── Instance methods ───────────────────────────────────────────
NotificationSchema.methods.markAsRead = function () {
    this.status = 'read';
    this.readAt = new Date();
    return this.save();
};

NotificationSchema.methods.markAsSent = function () {
    this.status = 'sent';
    this.sentAt = new Date();
    return this.save();
};

NotificationSchema.methods.markAsDelivered = function () {
    this.status = 'delivered';
    this.deliveredAt = new Date();
    return this.save();
};

NotificationSchema.methods.markAsFailed = function (reason) {
    this.status = 'failed';
    this.failedAt = new Date();
    this.failedReason = reason;
    this.retryCount += 1;
    return this.save();
};

module.exports = mongoose.model('Notification', NotificationSchema);
