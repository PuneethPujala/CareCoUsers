const mongoose = require('mongoose');

const MentorAuthorizationSchema = new mongoose.Schema(
  {
    mentorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      required: true,
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      required: true,
      index: true,
    },
    authorizedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Profile',
      required: true
    },
    
    // Authorization status
    status: {
      type: String,
      enum: ['active', 'revoked', 'expired', 'suspended'],
      default: 'active'
    },
    
    // Revocation tracking
    revokedAt: { 
      type: Date, 
      default: null 
    },
    revokedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Profile',
      default: null 
    },
    revocationReason: {
      type: String,
      maxlength: 500
    },
    
    // Authorization scope and permissions
    permissions: [{
      type: String,
      enum: [
        'view_medical_info',
        'view_medications',
        'manage_medications',
        'view_call_logs',
        'make_calls_on_behalf',
        'view_health_journal',
        'manage_health_journal',
        'receive_notifications',
        'emergency_contact'
      ],
      default: ['view_medical_info', 'view_medications', 'view_call_logs', 'view_health_journal']
    }],
    
    // Time-based access control
    accessSchedule: {
      startDate: { type: Date, default: Date.now },
      endDate: Date,
      allowedDays: [{
        type: String,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      }],
      allowedHours: {
        start: { type: String, default: '00:00' }, // HH:MM format
        end: { type: String, default: '23:59' }   // HH:MM format
      }
    },
    
    // Relationship information
    relationship: {
      type: String,
      enum: ['parent', 'spouse', 'child', 'sibling', 'friend', 'caregiver', 'other'],
      required: true
    },
    relationshipOther: {
      type: String,
      maxlength: 100,
      validate: {
        validator: function(v) {
          return !v || this.relationship === 'other';
        },
        message: 'RelationshipOther is only required when relationship is "other"'
      }
    },
    
    // Contact information
    contactPhone: String,
    contactEmail: String,
    
    // Emergency access
    emergencyAccess: {
      enabled: { type: Boolean, default: false },
      conditions: [String], // e.g., ['missed_medications', 'no_response', 'health_decline']
      contactPriority: { type: Number, min: 1, max: 10, default: 5 }
    },
    
    // Audit and compliance
    accessLog: [{
      accessedAt: { type: Date, default: Date.now },
      accessedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
      action: { type: String, required: true },
      resourceType: String,
      resourceId: mongoose.Schema.Types.ObjectId,
      ipAddress: String,
      userAgent: String,
    }],
    
    // Consent and agreements
    consent: {
      givenAt: { type: Date, required: true },
      givenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true },
      version: { type: String, required: true },
      ipAddress: String,
    },
    
    // Notifications preferences
    notificationPreferences: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true },
      frequency: {
        type: String,
        enum: ['immediate', 'daily', 'weekly', 'never'],
        default: 'immediate'
      }
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Compound unique index for mentor-patient relationship
MentorAuthorizationSchema.index({ mentorId: 1, patientId: 1 }, { unique: true });

// Additional indexes for common queries
MentorAuthorizationSchema.index({ patientId: 1, status: 1 });
MentorAuthorizationSchema.index({ authorizedBy: 1 });
MentorAuthorizationSchema.index({ 'accessSchedule.endDate': 1 });
MentorAuthorizationSchema.index({ status: 1, revokedAt: 1 });

// Virtual for checking if authorization is currently active
MentorAuthorizationSchema.virtual('isActive').get(function() {
  if (this.status !== 'active') return false;
  
  const now = new Date();
  if (this.accessSchedule.startDate && now < this.accessSchedule.startDate) return false;
  if (this.accessSchedule.endDate && now > this.accessSchedule.endDate) return false;
  
  return true;
});

// Virtual for authorization duration in days
MentorAuthorizationSchema.virtual('authorizationDuration').get(function() {
  const start = this.accessSchedule.startDate || this.createdAt;
  const end = this.revokedAt || this.accessSchedule.endDate || new Date();
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
});

// Virtual for checking if current time is within allowed hours
MentorAuthorizationSchema.virtual('isWithinAllowedHours').get(function() {
  if (!this.accessSchedule.allowedHours) return true;
  
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  
  return currentTime >= this.accessSchedule.allowedHours.start && 
         currentTime <= this.accessSchedule.allowedHours.end;
});

// Pre-save middleware to validate mentor and patient relationship
MentorAuthorizationSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('mentorId') || this.isModified('patientId')) {
    const Profile = mongoose.model('Profile');
    
    const [mentor, patient] = await Promise.all([
      Profile.findById(this.mentorId),
      Profile.findById(this.patientId)
    ]);
    
    if (!mentor || !patient) {
      return next(new Error('Mentor and patient must exist'));
    }
    
    if (mentor.role !== 'patient_mentor') {
      return next(new Error('Mentor must have patient_mentor role'));
    }
    
    if (patient.role !== 'patient') {
      return next(new Error('Patient must have patient role'));
    }
    
    // Mentors and patients can be in different organizations (cross-org access allowed)
  }
  
  // Set consent timestamp if not provided
  if (this.isNew && !this.consent.givenAt) {
    this.consent.givenAt = new Date();
  }
  
  next();
});

// Static method to find active authorizations for a mentor
MentorAuthorizationSchema.statics.findActiveByMentor = function(mentorId) {
  return this.find({
    mentorId,
    status: 'active',
    $or: [
      { 'accessSchedule.endDate': { $gte: new Date() } },
      { 'accessSchedule.endDate': { $exists: false } }
    ]
  }).populate('patientId', 'fullName email phone');
};

// Static method to find active authorizations for a patient
MentorAuthorizationSchema.statics.findActiveByPatient = function(patientId) {
  return this.find({
    patientId,
    status: 'active',
    $or: [
      { 'accessSchedule.endDate': { $gte: new Date() } },
      { 'accessSchedule.endDate': { $exists: false } }
    ]
  }).populate('mentorId', 'fullName email phone relationship');
};

// Static method to check if mentor has specific permission for patient
MentorAuthorizationSchema.statics.hasPermission = async function(mentorId, patientId, permission) {
  const auth = await this.findOne({
    mentorId,
    patientId,
    status: 'active',
    permissions: permission,
    $or: [
      { 'accessSchedule.endDate': { $gte: new Date() } },
      { 'accessSchedule.endDate': { $exists: false } }
    ]
  });
  
  return !!auth;
};

// Instance method to revoke authorization
MentorAuthorizationSchema.methods.revoke = function(revokedBy, reason = '') {
  this.status = 'revoked';
  this.revokedAt = new Date();
  this.revokedBy = revokedBy;
  this.revocationReason = reason;
  return this.save();
};

// Instance method to log access
MentorAuthorizationSchema.methods.logAccess = function(action, accessedBy, resourceType = null, resourceId = null, req = null) {
  this.accessLog.push({
    action,
    accessedBy,
    resourceType,
    resourceId,
    ipAddress: req?.ip,
    userAgent: req?.headers['user-agent'],
    accessedAt: new Date()
  });
  
  // Keep only last 100 access log entries
  if (this.accessLog.length > 100) {
    this.accessLog = this.accessLog.slice(-100);
  }
  
  return this.save();
};

// Instance method to check if mentor has permission
MentorAuthorizationSchema.methods.hasPermission = function(permission) {
  return this.isActive && this.permissions.includes(permission);
};

module.exports = mongoose.model('MentorAuthorization', MentorAuthorizationSchema);
