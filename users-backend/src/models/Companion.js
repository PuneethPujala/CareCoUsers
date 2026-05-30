const mongoose = require('mongoose');

const CompanionSchema = new mongoose.Schema(
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
      validate: {
        validator: function(v) {
          return /^[a-zA-Z0-9\s'.,()&-]+$/.test(v);
        },
        message: props => `${props.value} is not a valid name! Names can only contain letters, numbers, spaces, parentheses, hyphens, apostrophes, periods, commas, and ampersands.`
      }
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
    role: {
      type: String,
      required: true,
      default: 'companion',
      enum: ['companion'],
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
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
    acceptedTermsVersion: {
      type: String,
    },
    acceptedPrivacyVersion: {
      type: String,
    },
    acceptedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.passwordHash;
        delete ret.failedLoginAttempts;
        delete ret.accountLockedUntil;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

CompanionSchema.virtual('isLocked').get(function () {
  return !!(this.accountLockedUntil && this.accountLockedUntil > Date.now());
});

CompanionSchema.methods.hasRole = function (role) {
  return this.role === role;
};

CompanionSchema.methods.hasAnyRole = function (roles) {
  return roles.includes(this.role);
};

CompanionSchema.methods.incrementFailedLogin = function () {
  this.failedLoginAttempts += 1;
  if (this.failedLoginAttempts >= 5) {
    this.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000);
  }
  return this.save();
};

CompanionSchema.methods.resetFailedLogin = function () {
  this.failedLoginAttempts = 0;
  this.accountLockedUntil = undefined;
  this.lastLoginAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Companion', CompanionSchema);
