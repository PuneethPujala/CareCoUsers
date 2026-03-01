const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    supabaseUid: {
      type: String,
      required: true,
      index: true,
      description: 'User who performed the action'
    },
    action: {
      type: String,
      required: true,
      index: true,
      description: 'Action performed — free-text to support dynamic audit actions from routes and services'
    },
    resourceType: {
      type: String,
      enum: ['profile', 'patient', 'caretaker', 'mentor', 'organization', 'medication', 'call_log', 'report', 'system'],
      index: true
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true
    },

    // Request information
    ipAddress: {
      type: String,
      validate: {
        validator: function (v) {
          if (!v) return true;
          // Accept IPv4, IPv6-mapped IPv4 (::ffff:x.x.x.x), loopback, and general IPv6
          return /^(?:::ffff:)?(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(v) ||
            /^[0-9a-fA-F:]+$/.test(v); // basic IPv6 check
        },
        message: 'Invalid IP address format'
      }
    },
    userAgent: {
      type: String,
      maxlength: 500
    },

    // Geographic information (if available)
    location: {
      country: String,
      region: String,
      city: String,
      latitude: Number,
      longitude: Number,
    },

    // Result and outcome
    outcome: {
      type: String,
      enum: ['success', 'failure', 'partial'],
      default: 'success'
    },

    // Additional context and metadata
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // Previous values for update operations
    previousValues: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // New values for update operations
    newValues: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // Security-related information
    securityFlags: [{
      type: {
        type: String,
        enum: [
          'suspicious_location', 'unusual_time', 'multiple_failed_attempts',
          'privilege_escalation', 'data_access_anomaly', 'brute_force_detected',
          'session_hijacking', 'unauthorized_device', 'compliance_violation'
        ]
      },
      severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
      },
      description: String,
      detectedAt: { type: Date, default: Date.now }
    }],

    // Session information
    sessionId: String,
    deviceId: String,

    // Performance metrics
    responseTime: Number, // in milliseconds

    // Compliance and retention
    retentionPeriod: {
      type: Number,
      default: 2555 // 7 years in days (HIPAA requirement)
    },

    // Data classification
    dataClassification: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted'],
      default: 'confidential'
    },

    // Whether this log entry can be modified
    immutable: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for common queries
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ supabaseUid: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
AuditLogSchema.index({ outcome: 1, createdAt: -1 });
AuditLogSchema.index({ 'securityFlags.severity': 1, createdAt: -1 });

// TTL index for automatic cleanup based on retention period
AuditLogSchema.index({ createdAt: 1 }, {
  expireAfterSeconds: 2555 * 24 * 60 * 60 // 7 years default
});

// Virtual for checking if log entry is recent (last 24 hours)
AuditLogSchema.virtual('isRecent').get(function () {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.createdAt > twentyFourHoursAgo;
});

// Virtual for checking if log has high-priority security flags
AuditLogSchema.virtual('hasHighPriorityFlags').get(function () {
  return this.securityFlags.some(flag =>
    flag.severity === 'high' || flag.severity === 'critical'
  );
});

// Pre-save middleware to validate and sanitize data
AuditLogSchema.pre('save', function (next) {
  // Remove sensitive information from details
  if (this.details && typeof this.details === 'object') {
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'ssn', 'credit_card'];
    const removeSensitive = (obj) => {
      if (typeof obj !== 'object' || obj === null) return obj;

      const cleaned = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
          cleaned[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          cleaned[key] = removeSensitive(value);
        } else {
          cleaned[key] = value;
        }
      }
      return cleaned;
    };

    this.details = removeSensitive(this.details);
    this.previousValues = removeSensitive(this.previousValues);
    this.newValues = removeSensitive(this.newValues);
  }

  next();
});

// Static method to create audit log entry
AuditLogSchema.statics.createLog = async function (logData) {
  const log = new this(logData);
  return log.save();
};

// Static method to find logs by user
AuditLogSchema.statics.findByUser = function (supabaseUid, options = {}) {
  const query = { supabaseUid };

  if (options.action) query.action = options.action;
  if (options.resourceType) query.resourceType = options.resourceType;
  if (options.outcome) query.outcome = options.outcome;
  if (options.startDate) query.createdAt = { $gte: options.startDate };
  if (options.endDate) query.createdAt = { $lte: options.endDate };

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 100);
};

// Static method to find security incidents
AuditLogSchema.statics.findSecurityIncidents = function (options = {}) {
  const query = {
    'securityFlags.0': { $exists: true } // Has at least one security flag
  };

  if (options.severity) query['securityFlags.severity'] = options.severity;
  if (options.startDate) query.createdAt = { $gte: options.startDate };
  if (options.endDate) query.createdAt = { $lte: options.endDate };

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

// Static method to get user activity summary
AuditLogSchema.statics.getUserActivitySummary = function (supabaseUid, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return this.aggregate([
    {
      $match: {
        supabaseUid,
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          action: "$action"
        },
        count: { $sum: 1 },
        successCount: {
          $sum: { $cond: [{ $eq: ["$outcome", "success"] }, 1, 0] }
        }
      }
    },
    {
      $group: {
        _id: "$_id.date",
        actions: {
          $push: {
            action: "$_id.action",
            count: "$count",
            successCount: "$successCount"
          }
        },
        totalActions: { $sum: "$count" },
        totalSuccess: { $sum: "$successCount" }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
};

// Instance method to add security flag
AuditLogSchema.methods.addSecurityFlag = function (type, severity, description) {
  this.securityFlags.push({
    type,
    severity,
    description,
    detectedAt: new Date()
  });
  return this.save();
};

// Instance method to check for suspicious patterns
AuditLogSchema.methods.checkSuspiciousPatterns = function () {
  const patterns = [];

  // Check for unusual time access
  const hour = this.createdAt.getHours();
  if (hour < 6 || hour > 22) {
    patterns.push({
      type: 'unusual_time',
      severity: 'medium',
      description: `Access at unusual hour: ${hour}:00`
    });
  }

  // Check for multiple failed attempts (would need additional context)
  if (this.action === 'login_failed') {
    patterns.push({
      type: 'multiple_failed_attempts',
      severity: 'high',
      description: 'Failed login attempt detected'
    });
  }

  if (patterns.length > 0) {
    this.securityFlags.push(...patterns);
  }

  return this;
};

module.exports = mongoose.model('AuditLog', AuditLogSchema);
