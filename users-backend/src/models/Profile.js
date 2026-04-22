const mongoose = require('mongoose');

const ProfileSchema = new mongoose.Schema(
  {
    /** Stable auth subject (legacy Supabase UUID or server-issued UUID for local auth) */
    supabaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    /** Local auth credential (never returned in JSON) */
    passwordHash: {
      type: String,
      select: false,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
        },
        message: 'Please enter a valid email address',
      },
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    phone: {
      type: String,
      validate: {
        validator: function (v) {
          return !v || /^[+]?[1-9]\d{0,15}$/.test(v);
        },
        message: 'Please enter a valid phone number',
      },
    },

    // ── Roles ─────────────────────────────────────
    // super_admin  → CareCo platform level
    // org_admin    → runs a city organisation
    // care_manager → manages up to 50 callers
    // caller       → makes calls, manages up to 30 patients
    // patient      → end user receiving care
    role: {
      type: String,
      required: true,
      enum: ['super_admin', 'org_admin', 'care_manager', 'caller', 'patient'],
      index: true,
    },

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
    },
    avatarUrl: {
      type: String,
      validate: {
        validator: function (v) {
          return !v || /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)$/i.test(v);
        },
        message: 'Please enter a valid image URL',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ── Password Management ───────────────────────
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
    passwordChangedAt: {
      type: Date,
    },
    // Stores last 3 hashed passwords to prevent reuse
    passwordHistory: [{ type: String }],

    // ── Account Metadata ──────────────────────────
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // ── Auth & Security ───────────────────────────
    emailVerified: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: {
      type: Date,
    },
    // ── MFA / TOTP ────────────────────────────────
    mfaEnabled: {
      type: Boolean,
      default: false,
    },
    mfaSecret: {
      type: String,
      select: false, // Never returned by default
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
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        // Never expose sensitive fields
        delete ret.passwordHistory;
        delete ret.passwordHash;
        delete ret.failedLoginAttempts;
        delete ret.accountLockedUntil;
        delete ret.mfaSecret;
        delete ret.mfaRecoveryCodes;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────
ProfileSchema.index({ organizationId: 1, role: 1 });
ProfileSchema.index({ organizationId: 1, isActive: 1 });
ProfileSchema.index({ role: 1, isActive: 1 });

// ── Virtuals ──────────────────────────────────────
ProfileSchema.virtual('isLocked').get(function () {
  return !!(this.accountLockedUntil && this.accountLockedUntil > Date.now());
});

// ── Middleware ────────────────────────────────────
ProfileSchema.pre('save', function (next) {
  // Keep only last 3 password hashes
  if (this.isModified('passwordHistory') && this.passwordHistory.length > 3) {
    this.passwordHistory = this.passwordHistory.slice(-3);
  }
  next();
});

// ── Statics ───────────────────────────────────────
ProfileSchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, isActive: true });
};

ProfileSchema.statics.findByOrganization = function (organizationId, filter = {}) {
  return this.find({ organizationId, ...filter });
};

// ── Methods ───────────────────────────────────────
ProfileSchema.methods.hasRole = function (role) {
  return this.role === role;
};

ProfileSchema.methods.hasAnyRole = function (roles) {
  return roles.includes(this.role);
};

ProfileSchema.methods.incrementFailedLogin = function () {
  this.failedLoginAttempts += 1;
  if (this.failedLoginAttempts >= 5) {
    // Lock account for 30 minutes after 5 failed attempts
    this.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000);
  }
  return this.save();
};

ProfileSchema.methods.resetFailedLogin = function () {
  this.failedLoginAttempts = 0;
  this.accountLockedUntil = undefined;
  this.lastLoginAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Profile', ProfileSchema);