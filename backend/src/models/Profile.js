const mongoose = require('mongoose');

const ProfileSchema = new mongoose.Schema(
  {
    supabaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
      description: 'Maps 1:1 to Supabase auth.users UUID',
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
        message: 'Please enter a valid email address'
      }
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100
    },
    phone: {
      type: String,
      validate: {
        validator: function (v) {
          return !v || /^[\+]?[1-9][\d]{0,15}$/.test(v);
        },
        message: 'Please enter a valid phone number'
      }
    },
    role: {
      type: String,
      required: true,
      enum: ['super_admin', 'org_admin', 'care_manager', 'caretaker', 'caller', 'mentor', 'patient_mentor', 'patient'],
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
        message: 'Please enter a valid image URL'
      }
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    // Temp password management
    mustChangePassword: {
      type: Boolean,
      default: false,
      description: 'True when account created with temp password; blocks access until changed',
    },
    passwordChangedAt: {
      type: Date,
      description: 'Timestamp of last password change',
    },

    // Password history for "cannot reuse last 3" enforcement
    passwordHistory: [{
      type: String,
      description: 'Stores last 3 hashed passwords'
    }],

    // Who created this account (for admin-created accounts)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      description: 'Admin who created this account (null for self-registered)',
    },

    // Flexible role-specific metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // Email verification status
    emailVerified: {
      type: Boolean,
      default: false,
    },

    // Last login tracking
    lastLoginAt: {
      type: Date,
    },

    // Two-factor authentication status
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },

    // Account lockout for security
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
        delete ret.passwordHistory;
        delete ret.failedLoginAttempts;
        delete ret.accountLockedUntil;
        return ret;
      }
    },
    toObject: { virtuals: true }
  }
);

// Compound indexes for common queries
ProfileSchema.index({ organizationId: 1, role: 1 });
ProfileSchema.index({ organizationId: 1, isActive: 1 });
ProfileSchema.index({ role: 1, isActive: 1 });

// Virtual for checking if account is locked
ProfileSchema.virtual('isLocked').get(function () {
  return !!(this.accountLockedUntil && this.accountLockedUntil > Date.now());
});

// Pre-save middleware to handle password history
ProfileSchema.pre('save', function (next) {
  if (this.isModified('passwordHistory') && this.passwordHistory.length > 3) {
    this.passwordHistory = this.passwordHistory.slice(-3);
  }
  next();
});

// Static method to find active profiles
ProfileSchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, isActive: true });
};

// Static method to find by organization
ProfileSchema.statics.findByOrganization = function (organizationId, filter = {}) {
  return this.find({ organizationId, ...filter });
};

// Instance method to check if user has specific role
ProfileSchema.methods.hasRole = function (role) {
  return this.role === role;
};

// Instance method to check if user has any of the specified roles
ProfileSchema.methods.hasAnyRole = function (roles) {
  return roles.includes(this.role);
};

// Instance method to increment failed login attempts
ProfileSchema.methods.incrementFailedLogin = function () {
  this.failedLoginAttempts += 1;
  if (this.failedLoginAttempts >= 5) {
    this.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
  }
  return this.save();
};

// Instance method to reset failed login attempts
ProfileSchema.methods.resetFailedLogin = function () {
  this.failedLoginAttempts = 0;
  this.accountLockedUntil = undefined;
  this.lastLoginAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Profile', ProfileSchema);
