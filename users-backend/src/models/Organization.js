const mongoose = require('mongoose');

const OrganizationSchema = new mongoose.Schema(
    {
        // ── Core Identity ─────────────────────────────
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 200,
        },

        // City is the primary geographic key.
        // Every manager, caller, patient, and facility
        // in this org belongs to this city.
        city: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        state: {
            type: String,
            trim: true,
        },
        country: {
            type: String,
            trim: true,
            default: 'IN',
        },
        timezone: {
            type: String,
            default: 'Asia/Kolkata',
        },

        // ── Contact ───────────────────────────────────
        phone: {
            type: String,
            validate: {
                validator: (v) => !v || /^[+]?[1-9]\d{0,15}$/.test(v),
                message: 'Please enter a valid phone number',
            },
        },
        email: {
            type: String,
            lowercase: true,
            trim: true,
            validate: {
                validator: (v) => !v || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v),
                message: 'Please enter a valid email address',
            },
        },

        // ── Subscription / Plan ───────────────────────
        subscriptionPlan: {
            type: String,
            enum: ['starter', 'professional', 'enterprise'],
            default: 'starter',
        },

        // Hard capacity limits — enforced at API layer before assignment
        // Defaults: 10 managers × 50 callers × 30 patients = 15,000 patients/city
        limits: {
            max_managers:  { type: Number, default: 10 },
            max_callers:   { type: Number, default: 500 },
            max_patients:  { type: Number, default: 15000 },
        },

        // Live counters — increment/decrement on assignment using transactions
        counts: {
            managers:   { type: Number, default: 0, min: 0 },
            callers:    { type: Number, default: 0, min: 0 },
            patients:   { type: Number, default: 0, min: 0 },
            facilities: { type: Number, default: 0, min: 0 },
        },

        // ── Billing ───────────────────────────────────
        billing: {
            stripeCustomerId: String,
            subscriptionId:   String,
            lastBillingDate:  Date,
            nextBillingDate:  Date,
        },

        // ── Licensing ─────────────────────────────────
        licenseNumber:       String,
        licenseExpiryDate:   Date,
        accreditationStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'expired'],
            default: 'pending',
        },

        // ── Settings ──────────────────────────────────
        settings: {
            allowPatientSelfRegistration: { type: Boolean, default: true },
            enableTwoFactorAuth:          { type: Boolean, default: false },
            // Placeholder for future agentic AI facility-matching config
            ai_matching: {
                enabled:              { type: Boolean, default: false },
                prioritise_proximity: { type: Boolean, default: true },
                prioritise_severity:  { type: Boolean, default: true },
            },
        },

        // ── Compliance ────────────────────────────────
        complianceAgreements: [
            {
                type:     { type: String, required: true },
                signedAt: { type: Date,   required: true },
                signedBy: { type: String, required: true }, // supabaseUid
                version:  String,
            },
        ],

        // ── Meta ──────────────────────────────────────
        createdBy: {
            type: String,
            required: true, // supabaseUid of super_admin
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
    },
    {
        timestamps: true,
        toJSON:   { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ── Indexes ───────────────────────────────────────
OrganizationSchema.index({ city: 1, isActive: 1 });
OrganizationSchema.index({ subscriptionPlan: 1, isActive: 1 });
OrganizationSchema.index({ createdBy: 1 });

// ── Virtuals ──────────────────────────────────────
OrganizationSchema.virtual('isAtPatientCapacity').get(function () {
    return this.counts.patients >= this.limits.max_patients;
});

OrganizationSchema.virtual('isAtCallerCapacity').get(function () {
    return this.counts.callers >= this.limits.max_callers;
});

OrganizationSchema.virtual('isAtManagerCapacity').get(function () {
    return this.counts.managers >= this.limits.max_managers;
});

OrganizationSchema.virtual('isLicenseExpired').get(function () {
    return !!(this.licenseExpiryDate && this.licenseExpiryDate < new Date());
});

// True only if active AND license is valid
OrganizationSchema.virtual('isOperational').get(function () {
    return this.isActive && !this.isLicenseExpired;
});

// ── Middleware ────────────────────────────────────
OrganizationSchema.pre('save', function (next) {
    if (
        this.isModified('limits.max_patients') &&
        this.limits.max_patients < this.counts.patients
    ) {
        return next(new Error('Cannot set max_patients below current patient count'));
    }
    next();
});

// ── Statics ───────────────────────────────────────
OrganizationSchema.statics.findActive = function (filter = {}) {
    return this.find({ ...filter, isActive: true });
};

// Primary lookup — find the org for a given city
OrganizationSchema.statics.findByCity = function (city) {
    return this.findOne({ city, isActive: true });
};

// ── Methods ───────────────────────────────────────

// Check if a role can still be added within capacity limits
OrganizationSchema.methods.canAdd = function (role) {
    if (!this.isOperational)                                  return false;
    if (role === 'patient'      && this.isAtPatientCapacity)  return false;
    if (role === 'caller'       && this.isAtCallerCapacity)   return false;
    if (role === 'care_manager' && this.isAtManagerCapacity)  return false;
    return true;
};

// Recalculate counts from DB — use for reconciliation jobs, not on hot path
OrganizationSchema.methods.recalculateCounts = async function () {
    const Patient = mongoose.model('Patient');
    const Profile = mongoose.model('Profile');

    const [patients, callers, managers] = await Promise.all([
        Patient.countDocuments({ organization_id: this._id, is_active: true }),
        Profile.countDocuments({ organizationId: this._id, role: 'caller',       isActive: true }),
        Profile.countDocuments({ organizationId: this._id, role: 'care_manager', isActive: true }),
    ]);

    this.counts.patients = patients;
    this.counts.callers  = callers;
    this.counts.managers = managers;
    return this.save();
};

module.exports = mongoose.model('Organization', OrganizationSchema);