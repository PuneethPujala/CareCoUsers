const mongoose = require('mongoose');

const CaretakerPatientSchema = new mongoose.Schema(
  {
    caretakerId: {
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
    assignedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Profile',
      required: true
    },
    
    // Assignment status
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'terminated'],
      default: 'active'
    },
    
    // Assignment priority (for caretakers with multiple patients)
    priority: {
      type: Number,
      min: 1,
      max: 10,
      default: 5
    },
    
    // Assignment schedule (if applicable)
    schedule: {
      startDate: Date,
      endDate: Date,
      daysOfWeek: [{
        type: String,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      }],
      startTime: String, // HH:MM format
      endTime: String,   // HH:MM format
    },
    
    // Care instructions and notes
    careInstructions: {
      type: String,
      maxlength: 2000
    },
    
    // Emergency contact information
    emergencyContact: {
      name: String,
      relationship: String,
      phone: String,
    },
    
    // Assignment metadata
    notes: [{
      content: { type: String, required: true, maxlength: 1000 },
      addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true },
      addedAt: { type: Date, default: Date.now },
      isPrivate: { type: Boolean, default: false }
    }],
    
    // Performance metrics
    metrics: {
      totalCalls: { type: Number, default: 0 },
      averageCallDuration: { type: Number, default: 0 }, // in minutes
      patientSatisfactionScore: { type: Number, min: 1, max: 5 },
      lastCallDate: Date,
    },
    
    // Compliance and audit
    complianceFlags: [{
      type: {
        type: String,
        enum: ['missed_call', 'late_call', 'protocol_violation', 'complaint', 'other']
      },
      description: String,
      reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
      reportedAt: { type: Date, default: Date.now },
      resolvedAt: Date,
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
    }]
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Compound unique index for caretaker-patient relationship
CaretakerPatientSchema.index({ caretakerId: 1, patientId: 1 }, { unique: true });

// Additional indexes for common queries
CaretakerPatientSchema.index({ caretakerId: 1, status: 1 });
CaretakerPatientSchema.index({ patientId: 1, status: 1 });
CaretakerPatientSchema.index({ assignedBy: 1 });
CaretakerPatientSchema.index({ 'schedule.startDate': 1, 'schedule.endDate': 1 });

// Virtual for checking if assignment is currently active
CaretakerPatientSchema.virtual('isActive').get(function() {
  if (this.status !== 'active') return false;
  
  const now = new Date();
  if (this.schedule.startDate && now < this.schedule.startDate) return false;
  if (this.schedule.endDate && now > this.schedule.endDate) return false;
  
  return true;
});

// Virtual for assignment duration in days
CaretakerPatientSchema.virtual('assignmentDuration').get(function() {
  const start = this.schedule.startDate || this.createdAt;
  const end = this.schedule.endDate || new Date();
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to validate caretaker and patient are in the same organization
CaretakerPatientSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('caretakerId') || this.isModified('patientId')) {
    const Profile = mongoose.model('Profile');
    
    const [caretaker, patient] = await Promise.all([
      Profile.findById(this.caretakerId),
      Profile.findById(this.patientId)
    ]);
    
    if (!caretaker || !patient) {
      return next(new Error('Caretaker and patient must exist'));
    }
    
    if (caretaker.role !== 'caretaker') {
      return next(new Error('Assigned caretaker must have caretaker role'));
    }
    
    if (patient.role !== 'patient') {
      return next(new Error('Assigned patient must have patient role'));
    }
    
    if (!caretaker.organizationId.equals(patient.organizationId)) {
      return next(new Error('Caretaker and patient must be in the same organization'));
    }
  }
  next();
});

// Static method to find active assignments for a caretaker
CaretakerPatientSchema.statics.findActiveByCaretaker = function(caretakerId) {
  return this.find({
    caretakerId,
    status: 'active',
    $or: [
      { 'schedule.startDate': { $lte: new Date() } },
      { 'schedule.startDate': { $exists: false } }
    ],
    $or: [
      { 'schedule.endDate': { $gte: new Date() } },
      { 'schedule.endDate': { $exists: false } }
    ]
  }).populate('patientId', 'fullName email phone');
};

// Static method to find active assignments for a patient
CaretakerPatientSchema.statics.findActiveByPatient = function(patientId) {
  return this.find({
    patientId,
    status: 'active',
    $or: [
      { 'schedule.startDate': { $lte: new Date() } },
      { 'schedule.startDate': { $exists: false } }
    ],
    $or: [
      { 'schedule.endDate': { $gte: new Date() } },
      { 'schedule.endDate': { $exists: false } }
    ]
  }).populate('caretakerId', 'fullName email phone');
};

// Static method to get assignment statistics
CaretakerPatientSchema.statics.getAssignmentStats = function(organizationId) {
  return this.aggregate([
    {
      $lookup: {
        from: 'profiles',
        localField: 'caretakerId',
        foreignField: '_id',
        as: 'caretaker'
      }
    },
    {
      $unwind: '$caretaker'
    },
    {
      $match: {
        'caretaker.organizationId': mongoose.Types.ObjectId(organizationId)
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
};

// Instance method to add a note
CaretakerPatientSchema.methods.addNote = function(content, addedBy, isPrivate = false) {
  this.notes.push({
    content,
    addedBy,
    isPrivate,
    addedAt: new Date()
  });
  return this.save();
};

// Instance method to update metrics
CaretakerPatientSchema.methods.updateMetrics = function(callData) {
  this.metrics.totalCalls += 1;
  if (callData.duration) {
    const totalDuration = this.metrics.averageCallDuration * (this.metrics.totalCalls - 1) + callData.duration;
    this.metrics.averageCallDuration = totalDuration / this.metrics.totalCalls;
  }
  this.metrics.lastCallDate = new Date();
  return this.save();
};

module.exports = mongoose.model('CaretakerPatient', CaretakerPatientSchema);
