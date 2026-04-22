const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');

let supabaseCache = null;
const getSupabase = () => {
  if (!supabaseCache && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseCache = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabaseCache;
};

const safeSupabaseDelete = async (uid) => {
  if (!uid) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { error } = await sb.auth.admin.deleteUser(uid);
    if (error && !error.message.includes('User not found')) {
      console.error(`[Mongoose Hook] Supabase sync deletion failed for uid ${uid}:`, error.message);
    }
  } catch (err) {
    console.error(`[Mongoose Hook] Supabase sync caught exception for uid ${uid}:`, err.message);
  }
};
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
          return !v || /^[\+]?[0-9\s\-\(\)]{1,20}$/.test(v);
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

    // ── Patient-specific fields ──────────────────────────────────
    dateOfBirth: {
      type: Date,
      description: 'Patient date of birth — used to calculate age',
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say'],
    },
    allergies: [{
      type: String,
      trim: true,
      maxlength: 200,
    }],
    conditions: [{
      type: String,
      trim: true,
      maxlength: 200,
      description: 'Medical conditions (e.g., Diabetes Type 2, Hypertension)',
    }],
    emergencyContact: {
      name: { type: String, trim: true, maxlength: 100 },
      phone: { type: String, trim: true },
      relation: { type: String, trim: true, maxlength: 50 },
    },
    callerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      description: 'The assigned caller for this patient'
    },
    careManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      description: 'The assigned care manager for this patient'
    },

    // ── Caretaker/Staff-specific fields ──────────────────────────
    languages: [{
      type: String,
      trim: true,
      maxlength: 50,
      description: 'Languages spoken (applies to caretakers, care managers)',
    }],
    hireDate: {
      type: Date,
      description: 'Staff hire date (caretakers, care managers)',
    },

    // ── Shared operational fields ────────────────────────────────
    managedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      index: true,
      description: 'Care manager who manages this caretaker, or org_admin who manages this care manager',
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

    // ── Address / Location ────────────────────────────────────
    address: {
      street: { type: String, trim: true, maxlength: 200 },
      city: { type: String, trim: true, maxlength: 100 },
      state: { type: String, trim: true, maxlength: 100 },
      country: { type: String, trim: true, maxlength: 100 },
      postalCode: { type: String, trim: true, maxlength: 20 },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number },
      },
      formattedAddress: { type: String, trim: true, maxlength: 300 },
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

    // Phone verification status
    phoneVerified: {
      type: Boolean,
      default: false,
      description: 'True after user verifies their phone number via OTP',
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
ProfileSchema.index({ managedBy: 1, role: 1, isActive: 1 });

// Virtual for patient age (calculated from dateOfBirth)
ProfileSchema.virtual('age').get(function () {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birth = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
});

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

// ── Supabase Synchronization Hooks ─────────────────────────────
ProfileSchema.pre('findOneAndDelete', async function(next) {
  try {
    const docToUpdate = await this.model.findOne(this.getFilter());
    if (docToUpdate && docToUpdate.supabaseUid) {
      await safeSupabaseDelete(docToUpdate.supabaseUid);
    }
  } catch (err) {
    console.error('[Profile Hook] Error inside findOneAndDelete:', err.message);
  }
  next();
});

ProfileSchema.pre('deleteOne', { document: false, query: true }, async function(next) {
  try {
    const docToUpdate = await this.model.findOne(this.getFilter());
    if (docToUpdate && docToUpdate.supabaseUid) {
      await safeSupabaseDelete(docToUpdate.supabaseUid);
    }
  } catch (err) {
    console.error('[Profile Hook] Error inside deleteOne query:', err.message);
  }
  next();
});

ProfileSchema.pre('deleteOne', { document: true, query: false }, async function(next) {
  try {
    if (this.supabaseUid) {
      await safeSupabaseDelete(this.supabaseUid);
    }
  } catch (err) {
    console.error('[Profile Hook] Error inside deleteOne document:', err.message);
  }
  next();
});

ProfileSchema.pre('deleteMany', async function(next) {
  try {
    const docs = await this.model.find(this.getFilter());
    for (const doc of docs) {
      if (doc.supabaseUid) {
        await safeSupabaseDelete(doc.supabaseUid);
      }
    }
  } catch (err) {
    console.error('[Profile Hook] Error inside deleteMany:', err.message);
  }
  next();
});


// ── Callers Collection Sync Hook ──────────────────────────────
ProfileSchema.post('save', async function (doc) {
  if (doc && doc.role === 'caller') {
    try {
      const callerData = {
        _id: doc._id,
        supabase_uid: doc.supabaseUid,
        name: doc.fullName || 'Care Caller',
        employee_id: doc.metadata?.employeeId || doc._id.toString().substring(18),
        city: doc.metadata?.city || 'Default City',
        organization_id: doc.organizationId,
        manager_id: doc.managedBy,
        profile_photo_url: doc.avatarUrl,
        languages_spoken: doc.languages && doc.languages.length ? doc.languages : ['English', 'Hindi'],
        experience_years: doc.metadata?.experience_years || 2,
        phone: doc.phone,
        email: doc.email,
        is_active: doc.isActive,
        created_at: doc.createdAt,
        updated_at: doc.updatedAt
      };
      await mongoose.connection.collection('callers').updateOne(
        { _id: doc._id },
        { $set: callerData },
        { upsert: true }
      );
    } catch (err) {
      console.error('[Profile Hook] Error syncing caller to callers collection:', err.message);
    }
  }
});

ProfileSchema.post('findOneAndUpdate', async function (doc) {
  if (doc && doc.role === 'caller') {
    try {
      const callerData = {
        _id: doc._id,
        supabase_uid: doc.supabaseUid,
        name: doc.fullName || 'Care Caller',
        employee_id: doc.metadata?.employeeId || doc._id.toString().substring(18),
        city: doc.metadata?.city || 'Default City',
        organization_id: doc.organizationId,
        manager_id: doc.managedBy,
        profile_photo_url: doc.avatarUrl,
        languages_spoken: doc.languages && doc.languages.length ? doc.languages : ['English', 'Hindi'],
        experience_years: doc.metadata?.experience_years || 2,
        phone: doc.phone,
        email: doc.email,
        is_active: doc.isActive,
        created_at: doc.createdAt,
        updated_at: doc.updatedAt
      };
      await mongoose.connection.collection('callers').updateOne(
        { _id: doc._id },
        { $set: callerData },
        { upsert: true }
      );
    } catch (err) {
      console.error('[Profile Hook] Error syncing caller to callers collection:', err.message);
    }
  }
});

module.exports = mongoose.model('Profile', ProfileSchema);
