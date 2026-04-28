const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema(
    {
        // ── Core Identity ─────────────────────────────
        /** Stable auth subject (legacy Supabase UUID or server-issued UUID) */
        supabase_uid: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        passwordHash: {
            type: String,
            select: false,
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
            validate: {
                validator: function(v) {
                    return /^[a-zA-Z\s'-]+$/.test(v);
                },
                message: props => `${props.value} is not a valid name! Names can only contain letters, spaces, hyphens, and apostrophes.`
            }
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

        // ── Auth & Security ───────────────────────────
        emailVerified: {
            type: Boolean,
            default: false,
        },
        lastLoginAt: {
            type: Date,
        },
        mfaEnabled: {
            type: Boolean,
            default: false,
        },
        mfaSecret: {
            type: String,
            select: false,
        },
        mfaRecoveryCodes: {
            type: [String],
            select: false,
        },
        failedLoginAttempts: {
            type: Number,
            default: 0,
        },
        accountLockedUntil: {
            type: Date,
        },
        // Stores last 3 hashed passwords to prevent reuse (Audit Bug #6)
        passwordHistory: [{ type: String }],
        
        allow_screenshots: {
            type: Boolean,
            default: true,
        },

        // ── Notifications ─────────────────────────────
        expo_push_token: {
            type: String,
            trim: true,
        },
        push_notifications_enabled: {
            type: Boolean,
            default: true,
        },
        medication_reminders_enabled: {
            type: Boolean,
            default: true,
        },
        notification_limits: {
            max_daily: { type: Number, default: 3 },
            quiet_hours_start: { type: String, default: '21:00' },
            quiet_hours_end: { type: String, default: '08:00' },
        },
        daily_notifications_sent: {
            type: Number,
            default: 0,
        },
        last_notification_date: {
            type: Date,
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
                enum: ['free', 'basic', 'premium', 'explore'],
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

        // ── Gamification ──────────────────────────────
        gamification: {
            current_streak: { type: Number, default: 0 },
            longest_streak: { type: Number, default: 0 },
            last_streak_update: { type: Date },
            available_freezes: { type: Number, default: 2 },
            history_dates: [{ type: String }], // Array of YYYY-MM-DD
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
                times: [
                    {
                        type: String,
                        enum: ['morning', 'afternoon', 'evening', 'night', 'as_needed'],
                    },
                ],
                scheduledTimes: [String], // NEW - Array of HH:MM strings
                takenLogs: [             // Rich audit trail
                    {
                        timestamp: { type: Date, default: Date.now },
                        status: { type: String, enum: ['taken', 'missed', 'refused'], default: 'taken' },
                        markedBy: { type: String, enum: ['patient', 'caller', 'system'], default: 'patient' },
                        notes: String
                    }
                ],
                takenDates: [{ type: Date }], // Dates when this medication was taken
                is_active: { type: Boolean, default: true },
                instructions: String,
            },
        ],
        uploaded_prescriptions: [
            {
                file_url: { type: String, required: true },
                file_name: String,
                status: { type: String, enum: ['pending', 'reviewed', 'rejected'], default: 'pending' },
                uploaded_at: { type: Date, default: Date.now },
                reviewed_by: String,
                reviewer_notes: String,
            }
        ],
        trusted_contacts: [
            {
                name: { 
                    type: String, 
                    required: true,
                    validate: {
                        validator: function(v) {
                            return /^[a-zA-Z\s'-]+$/.test(v);
                        },
                        message: props => `${props.value} is not a valid name!`
                    }
                },
                phone: { type: String, required: true },
                relation: String,
                email: String,
                is_primary: { type: Boolean, default: false },
                is_emergency: { type: Boolean, default: false },
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
        lifestyle: {
            height_cm: { type: Number },
            weight_kg: { type: Number },
            smoking_status: { type: String, enum: ['never', 'former', 'current'], default: 'never' },
            alcohol_use: { type: String, enum: ['none', 'occasional', 'heavy'], default: 'none' },
            exercise_frequency: { type: String, enum: ['none', 'light', 'moderate', 'active'], default: 'none' },
            mobility_level: { type: String, enum: ['full', 'limited', 'wheelchair', 'bedridden'], default: 'full' },
            mobility_aids: { type: [String], default: [] }, // e.g. ['Cane', 'Walker']
            dietary_restrictions: { type: [String], default: [] }, // e.g. ['Low Sodium', 'Diabetic']
            device_sync_status: { type: String, enum: ['disconnected', 'apple_health', 'google_fit'], default: 'disconnected' },
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
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret.passwordHash;
                delete ret.mfaSecret;
                delete ret.mfaRecoveryCodes;
                return ret;
            },
        },
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
// Clear TTL once the patient is a legitimate account.
// Any of these conditions indicates a real user whose record must persist:
//  - paid + profile_complete (original check)
//  - active subscription
//  - has a passwordHash (set via signup or Set Password)
//  - email verified (completed OTP during signup)
PatientSchema.pre('save', function (next) {
    const isLegitimate =
        (this.paid === 1 && this.profile_complete) ||
        this.subscription?.status === 'active' ||
        this.passwordHash ||
        this.emailVerified === true;
    if (isLegitimate && this.expireAt) {
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