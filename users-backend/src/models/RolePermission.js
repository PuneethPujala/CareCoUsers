const mongoose = require('mongoose');

const RolePermissionSchema = new mongoose.Schema({
  role: { 
    type: String, 
    required: true,
    enum: ['super_admin', 'org_admin', 'care_manager', 'caretaker', 'patient_mentor', 'patient'],
  },
  resource: { 
    type: String, 
    required: true,
    description: 'e.g., patients, reports, medications, call_logs'
  },
  action: { 
    type: String, 
    required: true,
    enum: ['create', 'read', 'update', 'delete', 'assign', 'authorize', 'revoke', '*'],
    description: 'Action that can be performed on the resource'
  },
  
  // Additional context for the permission
  description: {
    type: String,
    maxlength: 500
  },
  
  // Whether this permission is active
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Priority for permission resolution (higher wins)
  priority: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Compound unique index for role, resource, and action
RolePermissionSchema.index({ role: 1, resource: 1, action: 1 }, { unique: true });

// Indexes for common queries
RolePermissionSchema.index({ role: 1, isActive: 1 });
RolePermissionSchema.index({ resource: 1, action: 1, isActive: 1 });

// Static method to get permissions for a role
RolePermissionSchema.statics.getRolePermissions = function(role) {
  return this.find({ 
    $or: [
      { role, isActive: true },
      { role: 'super_admin', isActive: true } // Super admin permissions apply to all
    ]
  }).sort({ priority: -1 });
};

// Static method to check if a role has permission
RolePermissionSchema.statics.hasPermission = async function(role, resource, action) {
  // Super admin has all permissions
  if (role === 'super_admin') {
    return true;
  }
  
  // Check for specific permission
  const specificPermission = await this.findOne({
    role,
    resource,
    action,
    isActive: true
  });
  
  if (specificPermission) {
    return true;
  }
  
  // Check for wildcard resource permission
  const wildcardResourcePermission = await this.findOne({
    role,
    resource: '*',
    action,
    isActive: true
  });
  
  if (wildcardResourcePermission) {
    return true;
  }
  
  // Check for wildcard action permission
  const wildcardActionPermission = await this.findOne({
    role,
    resource,
    action: '*',
    isActive: true
  });
  
  if (wildcardActionPermission) {
    return true;
  }
  
  // Check for global wildcard permission
  const globalWildcardPermission = await this.findOne({
    role,
    resource: '*',
    action: '*',
    isActive: true
  });
  
  return !!globalWildcardPermission;
};

// Static method to get all resources a role can access
RolePermissionSchema.statics.getAccessibleResources = function(role) {
  return this.distinct('resource', {
    $or: [
      { role, isActive: true },
      { role: 'super_admin', isActive: true }
    ]
  });
};

// Static method to get all actions a role can perform on a resource
RolePermissionSchema.statics.getAllowedActions = function(role, resource) {
  return this.distinct('action', {
    $or: [
      { role, resource, isActive: true },
      { role, resource: '*', isActive: true }
    ]
  });
};

// Pre-save middleware to validate permission combinations
RolePermissionSchema.pre('save', function(next) {
  // If this is a wildcard permission, ensure it doesn't conflict with specific permissions
  if ((this.resource === '*' || this.action === '*') && this.priority === 0) {
    this.priority = 100; // Give wildcard permissions higher priority by default
  }
  next();
});

// Instance method to check if this permission applies to a given resource/action
RolePermissionSchema.methods.appliesTo = function(resource, action) {
  const resourceMatch = this.resource === '*' || this.resource === resource;
  const actionMatch = this.action === '*' || this.action === action;
  return resourceMatch && actionMatch && this.isActive;
};

module.exports = mongoose.model('RolePermission', RolePermissionSchema);
