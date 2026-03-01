const mongoose = require('mongoose');

const OrganizationSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true, 
      trim: true,
      minlength: 2,
      maxlength: 200
    },
    type: {
      type: String,
      enum: ['clinic', 'hospital', 'home_health', 'telehealth'],
      required: true,
    },
    subscriptionPlan: {
      type: String,
      enum: ['starter', 'professional', 'enterprise'],
      default: 'starter',
    },
    maxPatients: { 
      type: Number,
      min: 1,
      max: 10000,
      default: 100,
    },
    isActive: { 
      type: Boolean, 
      default: true,
      index: true
    },
    createdBy: { 
      type: String,
      required: true,
      description: 'supabaseUid of the creator (Super Admin)'
    },
    
    // Contact information
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: { type: String, default: 'US' }
    },
    phone: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^[\+]?[1-9][\d]{0,15}$/.test(v);
        },
        message: 'Please enter a valid phone number'
      }
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      validate: {
        validator: function(v) {
          return !v || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
        },
        message: 'Please enter a valid email address'
      }
    },

    // Licensing and compliance
    licenseNumber: String,
    licenseExpiryDate: Date,
    accreditationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'expired'],
      default: 'pending'
    },

    // Configuration settings
    settings: {
      allowPatientSelfRegistration: { type: Boolean, default: true },
      requireMentorAuthorization: { type: Boolean, default: false },
      autoAssignCaretakers: { type: Boolean, default: false },
      enableTwoFactorAuth: { type: Boolean, default: false },
    },

    // Usage tracking
    currentPatientCount: {
      type: Number,
      default: 0,
      min: 0
    },
    currentCaretakerCount: {
      type: Number,
      default: 0,
      min: 0
    },

    // Billing information
    billing: {
      stripeCustomerId: String,
      subscriptionId: String,
      lastBillingDate: Date,
      nextBillingDate: Date,
    },

    // Compliance and audit
    complianceAgreements: [{
      type: { type: String, required: true },
      signedAt: { type: Date, required: true },
      signedBy: { type: String, required: true }, // supabaseUid
      version: String,
    }],
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for common queries
OrganizationSchema.index({ type: 1, isActive: 1 });
OrganizationSchema.index({ subscriptionPlan: 1, isActive: 1 });
OrganizationSchema.index({ createdBy: 1 });

// Virtual for checking if organization is at patient capacity
OrganizationSchema.virtual('isAtPatientCapacity').get(function() {
  return this.currentPatientCount >= this.maxPatients;
});

// Virtual for checking if license is expired
OrganizationSchema.virtual('isLicenseExpired').get(function() {
  return this.licenseExpiryDate && this.licenseExpiryDate < new Date();
});

// Pre-save middleware to validate capacity
OrganizationSchema.pre('save', function(next) {
  if (this.isModified('maxPatients') && this.maxPatients < this.currentPatientCount) {
    const error = new Error('Cannot set max patients below current patient count');
    return next(error);
  }
  next();
});

// Static method to find active organizations
OrganizationSchema.statics.findActive = function(filter = {}) {
  return this.find({ ...filter, isActive: true });
};

// Static method to find by type
OrganizationSchema.statics.findByType = function(type, filter = {}) {
  return this.find({ type, ...filter });
};

// Instance method to update patient count
OrganizationSchema.methods.updatePatientCount = function() {
  const Profile = mongoose.model('Profile');
  return Profile.countDocuments({ organizationId: this._id, role: 'patient', isActive: true })
    .then(count => {
      this.currentPatientCount = count;
      return this.save();
    });
};

// Instance method to update caretaker count
OrganizationSchema.methods.updateCaretakerCount = function() {
  const Profile = mongoose.model('Profile');
  return Profile.countDocuments({ organizationId: this._id, role: 'caretaker', isActive: true })
    .then(count => {
      this.currentCaretakerCount = count;
      return this.save();
    });
};

// Instance method to check if user can be added
OrganizationSchema.methods.canAddUser = function(role) {
  if (role === 'patient' && this.isAtPatientCapacity) {
    return false;
  }
  return this.isActive && !this.isLicenseExpired;
};

module.exports = mongoose.model('Organization', OrganizationSchema);
