const mongoose = require('mongoose');

const MedicationSchema = new mongoose.Schema(
    {
        patientId: {
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

        // ── Core medication info ─────────────────────────────────────
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        genericName: {
            type: String,
            trim: true,
            maxlength: 200,
        },
        dosage: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
            description: 'e.g., 500mg, 10 units',
        },
        route: {
            type: String,
            enum: ['oral', 'injection', 'topical', 'inhalation', 'sublingual', 'rectal', 'transdermal', 'iv', 'other'],
            default: 'oral',
        },
        frequency: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
            description: 'e.g., Daily, Twice daily, Weekly, As needed',
        },

        // ── Schedule ─────────────────────────────────────────────────
        scheduledTimes: [{
            type: String,
            trim: true,
            description: 'HH:MM AM/PM format, e.g., "08:00 AM"',
        }],
        times: [{
            type: String,
            trim: true,
            description: 'Legacy timeframe format, e.g., "morning", "afternoon", "night"',
        }],
        daysOfWeek: [{
            type: String,
            enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
            description: 'For non-daily medications (e.g., weekly Alendronate)',
        }],

        // ── Instructions ─────────────────────────────────────────────
        withFood: {
            type: Boolean,
            default: false,
        },
        instructions: {
            type: String,
            trim: true,
            maxlength: 1000,
        },

        // ── Prescriber info ──────────────────────────────────────────
        prescribedBy: {
            type: String,
            trim: true,
            maxlength: 200,
            description: 'Prescribing physician name',
        },
        prescribedDate: {
            type: Date,
        },

        // ── Effective dates ──────────────────────────────────────────
        startDate: {
            type: Date,
            required: true,
            default: Date.now,
        },
        endDate: {
            type: Date,
            description: 'Null = indefinite',
        },

        // ── Status ───────────────────────────────────────────────────
        status: {
            type: String,
            enum: ['active', 'paused', 'discontinued', 'completed'],
            default: 'active',
            index: true,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        discontinuedReason: {
            type: String,
            trim: true,
            maxlength: 500,
        },
        discontinuedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
        },
        discontinuedAt: {
            type: Date,
        },

        // ── Refill tracking ──────────────────────────────────────────
        refillInfo: {
            pharmacy: { type: String, trim: true, maxlength: 200 },
            pharmacyPhone: { type: String, trim: true },
            lastRefillDate: Date,
            nextRefillDate: Date,
            remainingDoses: { type: Number, min: 0 },
            autoRefill: { type: Boolean, default: false },
        },

        // ── Safety info ──────────────────────────────────────────────
        sideEffects: [{
            type: String,
            trim: true,
            maxlength: 200,
        }],
        interactions: [{
            type: String,
            trim: true,
            maxlength: 200,
            description: 'Known drug interactions',
        }],
        contraindications: [{
            type: String,
            trim: true,
            maxlength: 200,
        }],

        // ── Tracking metadata ────────────────────────────────────────
        addedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
            description: 'User who added this medication to the system',
        },
        lastModifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
        },
        notes: {
            type: String,
            trim: true,
            maxlength: 2000,
        },
        takenLogs: [{
            date: { type: String, trim: true },
            timestamp: { type: Date },
        }],
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

module.exports = mongoose.model('Medication', MedicationSchema);
