const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema(
    {
        // ── Core Identity ─────────────────────────────
        supabase_uid: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        profile_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
            index: true,
        },
        role: {
            type: String,
            default: 'patient',
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        phone: {
            type: String,
            trim: true,
        },
        date_of_birth: {
            type: Date,
        },
        gender: {
            type: String,
            enum: ['male', 'female', 'other', 'prefer_not_to_say'],
        },
        avatar_url: {
            type: String,
        },
        profile_complete: {
            type: Boolean,
            default: false,
        },

        // ── Location ──────────────────────────────────
        city: {
            type: String,
            trim: true,
            index: true,
        },
        address: {
            street: { type: String, trim: true },
            state: { type: String, trim: true },
            postcode: { type: String, trim: true },
            country: { type: String, trim: true, default: 'India' },
        },
        saved_addresses: [
            {
                label: { type: String, enum: ['Home', 'Office', 'Family', 'Other'], default: 'Other' },
                title: String,
                address_line: String, // Full formatted address string
                flat_no: String,
                street: String,
                city: String,
                state: String,
                postcode: String,
                lat: Number,
                lon: Number,
                is_default: { type: Boolean, default: false },
            }
        ],

        // ── Relationships ─────────────────────────────
        organization_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            index: true,
        },
        assigned_caller_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Caller',
            index: true,
        },
        assigned_manager_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
            index: true,
        },
        assigned_at: {
            type: Date, // when the current caller was assigned
        },

        // ── Scheduling / Time Slots ───────────────────
        timezone: {
            type: String,
            default: 'Asia/Kolkata',
        },
        medication_call_preferences: {
            morning: { type: String, default: '09:00' },
            afternoon: { type: String, default: '14:00' },
            night: { type: String, default: '20:00' }
        },
        preferred_call_times: [
            {
                day_of_week: {
                    type: String,
                    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
                    required: true,
                },
                start_time: { type: String, required: true }, // "HH:MM" 24hr
                end_time: { type: String, required: true },
                slot_type: {
                    type: String,
                    enum: ['call', 'visit', 'checkin'],
                    default: 'call',
                },
                is_active: { type: Boolean, default: true },
                notes: { type: String },
            },
        ],
        last_called_at: { type: Date },
        next_call_scheduled: { type: Date },
        call_frequency_days: { type: Number, default: 7 },

        // ── Subscription / Billing ────────────────────
        subscription: {
            status: {
                type: String,
                enum: ['active', 'pending_payment', 'cancelled', 'expired'],
                default: 'pending_payment',
            },
            plan: {
                type: String,
                enum: ['basic', 'premium', 'explore'],
                default: 'basic',
            },
            amount: { type: Number, default: 0 },
            currency: { type: String, default: 'INR' },
            payment_date: Date,
            started_at: Date,
            expires_at: Date,
            next_billing: Date,
            stripe_customer_id: { type: String },
            stripe_subscription_id: { type: String },
        },
        paid: {
            type: Number,
            default: 0,
            enum: [0, 1],
        },

        // ── Medical Data ──────────────────────────────
        conditions: [
            {
                name: { type: String, required: true },
                diagnosed_on: Date,
                status: {
                    type: String,
                    enum: ['active', 'managed', 'resolved'],
                    default: 'active',
                },
                severity: {
                    type: String,
                    enum: ['mild', 'moderate', 'severe'],
                },
                notes: { type: String },
            },
        ],
        medical_history: [
            {
                event: { type: String, required: true },
                date: Date,
                notes: String,
            },
        ],
        allergies: [
            {
                name: { type: String, required: true },
                severity: {
                    type: String,
                    enum: ['mild', 'moderate', 'severe'],
                    default: 'moderate',
                },
                reaction: { type: String }, // e.g. "Rash", "Anaphylaxis"
            }
        ],
        medications: [
            {
                name: { type: String, required: true },
                dosage: String,
                frequency: String,
                times: [
                    {
                        type: String,
                        enum: ['morning', 'afternoon', 'evening', 'night', 'as_needed'],
                    },
                ],
                scheduledTimes: [String], // NEW - Array of HH:MM strings
                takenDates: [Date],      // NEW - Array of dates when medicine was taken
                takenLogs: [             // NEW - Rich audit trail
                    {
                        timestamp: { type: Date, default: Date.now },
                        status: { type: String, enum: ['taken', 'missed', 'refused'], default: 'taken' },
                        markedBy: { type: String, enum: ['patient', 'caller', 'system'], default: 'patient' },
                        notes: String
                    }
                ],
                start_date: { type: Date },
                end_date: { type: Date },   // null = ongoing
                is_active: { type: Boolean, default: true },
                refill_due: { type: Date },
                prescribed_by: String,
                instructions: String,
            },
        ],
        emergency_contact: {
            name: { type: String, trim: true },
            phone: { type: String, trim: true },
            relation: { type: String, trim: true },
        },
        trusted_contacts: [
            {
                name: String,
                phone: String,
                relation: String,
                email: String,
                is_primary: { type: Boolean, default: false },
                can_view_data: { type: Boolean, default: false },
                permissions: [String], // e.g. ['medications', 'mood', 'bp']
            },
        ],
        care_instructions: {
            type: String,
            trim: true,
        },
        gp_name: { type: String, trim: true },
        gp_phone: { type: String, trim: true },
        gp_email: { type: String, trim: true },
        blood_type: {
            type: String,
            enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'],
            default: 'unknown',
        },
        language: {
            type: String,
            default: 'en_IN',
        },
        mobility_level: {
            type: String,
            enum: ['full', 'limited', 'wheelchair', 'bedridden'],
            default: 'full',
        },
        push_notifications_enabled: {
            type: Boolean,
            default: true,
        },
        medication_reminders_enabled: {
            type: Boolean,
            default: true,
        },
        expo_push_token: {
            type: String,
            trim: true,
        },

        // ── Notes & Flags ─────────────────────────────
        notes: { type: String },
        risk_level: {
            type: String,
            enum: ['low', 'medium', 'high'],
            default: 'low',
            index: true,
        },
        is_active: {
            type: Boolean,
            default: true,
            index: true,
        },
        deactivated_at: { type: Date },
        deactivated_reason: { type: String },

        // ── Auth & Security ──────────────────────────────
        emailVerified: {
            type: Boolean,
            default: false,
        },
        lastLoginAt: {
            type: Date,
        },
        failedLoginAttempts: {
            type: Number,
            default: 0,
        },
        accountLockedUntil: {
            type: Date,
        },

        // ── Lifestyle & Extensions ──────────────────
        height_cm: { type: Number },
        weight_kg: { type: Number },
        smoking_status: {
            type: String,
            enum: ['never', 'former', 'current'],
            default: 'never',
        },
        alcohol_use: {
            type: String,
            enum: ['none', 'occasional', 'moderate', 'heavy'],
            default: 'none',
        },
        exercise_frequency: {
            type: String,
            enum: ['none', 'light', 'moderate', 'active'],
            default: 'none',
        },
        vaccinations: [
            {
                name: { type: String, required: true },
                date_given: { type: Date },
                next_due: { type: Date },
                administered_by: { type: String },
            }
        ],
        appointments: [
            {
                title: { type: String, required: true },
                doctor_name: { type: String },
                location: { type: String },
                date: { type: Date, required: true },
                notes: { type: String },
                status: {
                    type: String,
                    enum: ['upcoming', 'completed', 'cancelled'],
                    default: 'upcoming',
                },
            }
        ],

        // ── TTL / Cleanup ─────────────────────────────
        // Auto-deletes incomplete/unpaid patients after 24h
        expireAt: {
            type: Date,
            default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ── Indexes ───────────────────────────────────────
PatientSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });           // TTL
PatientSchema.index({ organization_id: 1, is_active: 1 });
PatientSchema.index({ organization_id: 1, assigned_caller_id: 1 });
PatientSchema.index({ assigned_caller_id: 1, next_call_scheduled: 1 });
PatientSchema.index({ city: 1, assigned_caller_id: 1 });
PatientSchema.index({ risk_level: 1, is_active: 1 });
PatientSchema.index({ 'subscription.status': 1 });
PatientSchema.index({ 'subscription.status': 1, 'subscription.expires_at': 1 });

// ── Middleware ────────────────────────────────────
// Clear TTL once patient has paid and completed profile
PatientSchema.pre('save', function (next) {
    if (this.paid === 1 && this.profile_complete) {
        this.expireAt = undefined;
    }
    next();
});

// ── Virtuals ──────────────────────────────────────
PatientSchema.virtual('isLocked').get(function () {
    return !!(this.accountLockedUntil && this.accountLockedUntil > Date.now());
});

PatientSchema.virtual('age').get(function () {
    if (!this.date_of_birth) return null;
    const diff = Date.now() - this.date_of_birth.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
});

PatientSchema.virtual('active_medications').get(function () {
    return this.medications.filter((m) => m.is_active);
});

// ── Methods ───────────────────────────────────────
PatientSchema.methods.incrementFailedLogin = function () {
    this.failedLoginAttempts += 1;
    if (this.failedLoginAttempts >= 5) {
        this.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000);
    }
    return this.save();
};

PatientSchema.methods.resetFailedLogin = function () {
    this.failedLoginAttempts = 0;
    this.accountLockedUntil = undefined;
    this.lastLoginAt = new Date();
    return this.save();
};

module.exports = mongoose.model('Patient', PatientSchema);