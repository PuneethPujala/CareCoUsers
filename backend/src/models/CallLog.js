const mongoose = require('mongoose');

const MedicationConfirmationSchema = new mongoose.Schema({
    medicationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Medication',
        required: true,
    },
    medicationName: {
        type: String,
        required: true,
        trim: true,
        description: 'Denormalized for quick display without join',
    },
    confirmed: {
        type: Boolean,
        required: true,
        description: 'Whether the patient confirmed taking this medication',
    },
    reason: {
        type: String,
        trim: true,
        maxlength: 500,
        description: 'Reason if not confirmed (e.g., side effects, forgot, ran out)',
    },
    notes: {
        type: String,
        trim: true,
        maxlength: 500,
    },
}, { _id: false });

const CallLogSchema = new mongoose.Schema(
    {
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
            required: true,
            index: true,
        },
        caretakerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
            required: true,
            index: true,
        },
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: true,
            index: true,
        },

        // ── Scheduling ───────────────────────────────────────────────
        scheduledTime: {
            type: Date,
            required: true,
            index: true,
        },
        actualStartTime: {
            type: Date,
        },
        actualEndTime: {
            type: Date,
        },
        duration: {
            type: Number,
            min: 0,
            description: 'Call duration in seconds',
        },

        // ── Status & outcome ─────────────────────────────────────────
        status: {
            type: String,
            enum: ['scheduled', 'in_progress', 'completed', 'missed', 'cancelled', 'no_answer', 'voicemail'],
            default: 'scheduled',
            index: true,
        },
        priority: {
            type: String,
            enum: ['routine', 'urgent', 'critical', 'follow_up'],
            default: 'routine',
            index: true,
        },
        outcome: {
            type: String,
            enum: ['answered_completed', 'answered_partial', 'no_answer', 'voicemail', 'refused', 'rescheduled', 'wrong_number', ''],
            default: '',
        },
        attempts: {
            type: Number,
            default: 1,
            min: 1,
            description: 'Number of call attempts for this scheduled slot',
        },

        // ── Medication confirmations ─────────────────────────────────
        medicationConfirmations: [MedicationConfirmationSchema],

        // ── Notes ────────────────────────────────────────────────────
        notes: {
            type: String,
            trim: true,
            maxlength: 5000,
        },
        privateNotes: {
            type: String,
            trim: true,
            maxlength: 2000,
            description: 'Internal notes, not visible to patient/mentor',
        },

        // ── Follow-up ────────────────────────────────────────────────
        followUpRequired: {
            type: Boolean,
            default: false,
        },
        followUpDate: {
            type: Date,
        },
        followUpNotes: {
            type: String,
            trim: true,
            maxlength: 1000,
        },
        followUpCompletedAt: {
            type: Date,
        },

        // ── Call quality ─────────────────────────────────────────────
        callQuality: {
            rating: { type: Number, min: 1, max: 5 },
            issues: [{
                type: String,
                enum: ['poor_connection', 'background_noise', 'patient_confused', 'language_barrier', 'technical_issue', 'other'],
            }],
            reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
            reviewedAt: Date,
            reviewNotes: { type: String, trim: true, maxlength: 500 },
        },

        // ── Escalation link ──────────────────────────────────────────
        escalationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Escalation',
            description: 'If this call triggered an escalation',
        },

        // ── Patient mood/health indicators ───────────────────────────
        patientMood: {
            type: String,
            enum: ['happy', 'neutral', 'sad', 'anxious', 'confused', 'angry', 'unresponsive'],
        },
        healthConcerns: [{
            type: String,
            trim: true,
            maxlength: 500,
        }],

        // ── Audit ────────────────────────────────────────────────────
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ── Indexes ────────────────────────────────────────────────────
CallLogSchema.index({ caretakerId: 1, scheduledTime: -1 });
CallLogSchema.index({ patientId: 1, scheduledTime: -1 });
CallLogSchema.index({ organizationId: 1, status: 1, scheduledTime: -1 });
CallLogSchema.index({ scheduledTime: -1, status: 1 });
CallLogSchema.index({ organizationId: 1, caretakerId: 1, status: 1 });
CallLogSchema.index({ followUpRequired: 1, followUpDate: 1 });

// ── Virtuals ───────────────────────────────────────────────────
CallLogSchema.virtual('durationFormatted').get(function () {
    if (!this.duration) return null;
    const mins = Math.floor(this.duration / 60);
    const secs = this.duration % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
});

CallLogSchema.virtual('isOverdue').get(function () {
    if (this.status !== 'scheduled') return false;
    return this.scheduledTime < new Date();
});

CallLogSchema.virtual('allMedicationsConfirmed').get(function () {
    if (!this.medicationConfirmations || this.medicationConfirmations.length === 0) return false;
    return this.medicationConfirmations.every(mc => mc.confirmed === true);
});

// ── Pre-save ───────────────────────────────────────────────────
CallLogSchema.pre('save', function (next) {
    // Auto-calculate duration from start/end
    if (this.actualStartTime && this.actualEndTime && !this.duration) {
        this.duration = Math.round((this.actualEndTime - this.actualStartTime) / 1000);
    }
    next();
});

// ── Statics ────────────────────────────────────────────────────

// Get patient adherence rate from call logs over a date range
CallLogSchema.statics.calculateAdherenceRate = async function (patientId, daysBack = 30) {
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    const result = await this.aggregate([
        {
            $match: {
                patientId: new mongoose.Types.ObjectId(patientId),
                scheduledTime: { $gte: startDate },
                status: { $in: ['completed', 'missed', 'no_answer'] },
            },
        },
        {
            $unwind: {
                path: '$medicationConfirmations',
                preserveNullAndEmptyArrays: false,
            },
        },
        {
            $group: {
                _id: null,
                totalConfirmations: { $sum: 1 },
                confirmedCount: {
                    $sum: { $cond: ['$medicationConfirmations.confirmed', 1, 0] },
                },
            },
        },
    ]);

    if (!result.length || result[0].totalConfirmations === 0) return 0;
    return Math.round((result[0].confirmedCount / result[0].totalConfirmations) * 100);
};

// Get current adherence streak for a patient
CallLogSchema.statics.calculateCurrentStreak = async function (patientId) {
    const logs = await this.find({
        patientId,
        status: 'completed',
    })
        .sort({ scheduledTime: -1 })
        .limit(90)
        .select('medicationConfirmations scheduledTime');

    let streak = 0;
    for (const log of logs) {
        const allConfirmed = log.medicationConfirmations?.every(mc => mc.confirmed);
        if (allConfirmed) {
            streak++;
        } else {
            break;
        }
    }
    return streak;
};

// Get caretaker performance metrics
CallLogSchema.statics.getCaretakerPerformance = async function (caretakerId, daysBack = 30) {
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    const result = await this.aggregate([
        {
            $match: {
                caretakerId: new mongoose.Types.ObjectId(caretakerId),
                scheduledTime: { $gte: startDate },
            },
        },
        {
            $group: {
                _id: null,
                totalScheduled: { $sum: 1 },
                totalCompleted: {
                    $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
                },
                totalMissed: {
                    $sum: { $cond: [{ $eq: ['$status', 'missed'] }, 1, 0] },
                },
                avgDuration: { $avg: '$duration' },
                avgRating: { $avg: '$callQuality.rating' },
            },
        },
    ]);

    if (!result.length) {
        return { totalScheduled: 0, totalCompleted: 0, totalMissed: 0, completionRate: 0, avgDuration: 0, avgRating: 0 };
    }

    const r = result[0];
    return {
        totalScheduled: r.totalScheduled,
        totalCompleted: r.totalCompleted,
        totalMissed: r.totalMissed,
        completionRate: r.totalScheduled > 0 ? Math.round((r.totalCompleted / r.totalScheduled) * 100) : 0,
        avgDuration: Math.round(r.avgDuration || 0),
        avgRating: r.avgRating ? Math.round(r.avgRating * 10) / 10 : null,
    };
};

// Get daily call stats for dashboard
CallLogSchema.statics.getDailyStats = async function (organizationId, date = new Date()) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.aggregate([
        {
            $match: {
                organizationId: new mongoose.Types.ObjectId(organizationId),
                scheduledTime: { $gte: startOfDay, $lte: endOfDay },
            },
        },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
            },
        },
    ]);
};

// Get today's calls for a caretaker
CallLogSchema.statics.getTodayCallsForCaretaker = function (caretakerId) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    return this.find({
        caretakerId,
        scheduledTime: { $gte: startOfDay, $lte: endOfDay },
    })
        .populate('patientId', 'fullName avatarUrl phone')
        .sort({ scheduledTime: 1 });
};

module.exports = mongoose.model('CallLog', CallLogSchema);
