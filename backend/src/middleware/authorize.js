const mongoose = require('mongoose');
const RolePermission = require('../models/RolePermission');
const AuditLog = require('../models/AuditLog');

/**
 * Authorization middleware factory - checks if current user's role has permission
 * for a given resource + action combination.
 * 
 * @param {string} resource - The resource type (e.g., 'patients', 'reports')
 * @param {string} action - The action (e.g., 'create', 'read', 'update', 'delete')
 * @param {Object} options - Additional options
 * @param {boolean} options.logFailures - Whether to log authorization failures (default: true)
 * @returns {Function} Express middleware function
 */
const authorize = (resource, action, options = {}) => {
  const { logFailures = true } = options;

  return async (req, res, next) => {
    try {
      // Ensure user is authenticated
      if (!req.profile) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const { role } = req.profile;

      // Super admin bypasses all permission checks
      if (role === 'super_admin') {
        return next();
      }

      // Check permission in database
      const hasPermission = await RolePermission.hasPermission(role, resource, action);

      if (!hasPermission) {
        // Log authorization failure if enabled
        if (logFailures) {
          await AuditLog.createLog({
            supabaseUid: req.profile.supabaseUid,
            action: 'permission_denied',
            resourceType: resource,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'failure',
            details: {
              requiredAction: action,
              userRole: role,
              attemptedResource: resource,
              endpoint: req.path,
              method: req.method
            }
          });
        }

        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED',
          required: { resource, action },
          current: role
        });
      }

      // Log successful authorization for sensitive operations
      if (['create', 'update', 'delete', 'assign', 'revoke'].includes(action)) {
        await AuditLog.createLog({
          supabaseUid: req.profile.supabaseUid,
          action: `${action}_authorized`,
          resourceType: resource,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          outcome: 'success',
          details: {
            authorizedAction: action,
            resource,
            endpoint: req.path
          }
        });
      }

      next();
    } catch (err) {
      console.error('Authorization error:', err);

      // Log system error
      await AuditLog.createLog({
        supabaseUid: req.profile?.supabaseUid || 'anonymous',
        action: 'authorization_error',
        resourceType: 'system',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        outcome: 'failure',
        details: {
          error: err.message,
          resource,
          action,
          endpoint: req.path
        }
      });

      return res.status(500).json({
        error: 'Authorization error',
        code: 'AUTH_SYSTEM_ERROR'
      });
    }
  };
};

/**
 * Middleware factory for checking multiple permissions
 * User must have at least one of the specified permissions
 */
const authorizeAny = (permissions, options = {}) => {
  const { logFailures = true } = options;

  return async (req, res, next) => {
    try {
      if (!req.profile) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const { role } = req.profile;

      // Super admin bypasses all permission checks
      if (role === 'super_admin') {
        return next();
      }

      // Check if user has any of the required permissions
      let hasAnyPermission = false;
      let grantedPermission = null;

      for (const { resource, action } of permissions) {
        const hasPermission = await RolePermission.hasPermission(role, resource, action);
        if (hasPermission) {
          hasAnyPermission = true;
          grantedPermission = { resource, action };
          break;
        }
      }

      if (!hasAnyPermission) {
        if (logFailures) {
          await AuditLog.createLog({
            supabaseUid: req.profile.supabaseUid,
            action: 'permission_denied',
            resourceType: 'system',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'failure',
            details: {
              requiredPermissions: permissions,
              userRole: role,
              endpoint: req.path,
              method: req.method
            }
          });
        }

        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED',
          required: permissions,
          current: role
        });
      }

      // Log successful authorization
      await AuditLog.createLog({
        supabaseUid: req.profile.supabaseUid,
        action: `${grantedPermission.action}_authorized`,
        resourceType: grantedPermission.resource,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        outcome: 'success',
        details: {
          authorizedAction: grantedPermission.action,
          resource: grantedPermission.resource,
          endpoint: req.path
        }
      });

      next();
    } catch (err) {
      console.error('Authorization error:', err);
      return res.status(500).json({
        error: 'Authorization error',
        code: 'AUTH_SYSTEM_ERROR'
      });
    }
  };
};

/**
 * Middleware factory for checking all specified permissions
 * User must have all of the specified permissions
 */
const authorizeAll = (permissions, options = {}) => {
  const { logFailures = true } = options;

  return async (req, res, next) => {
    try {
      if (!req.profile) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const { role } = req.profile;

      // Super admin bypasses all permission checks
      if (role === 'super_admin') {
        return next();
      }

      // Check if user has all required permissions
      const permissionChecks = await Promise.all(
        permissions.map(({ resource, action }) =>
          RolePermission.hasPermission(role, resource, action)
        )
      );

      const hasAllPermissions = permissionChecks.every(Boolean);

      if (!hasAllPermissions) {
        const missingPermissions = permissions.filter((_, index) => !permissionChecks[index]);

        if (logFailures) {
          await AuditLog.createLog({
            supabaseUid: req.profile.supabaseUid,
            action: 'permission_denied',
            resourceType: 'system',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'failure',
            details: {
              requiredPermissions: permissions,
              missingPermissions,
              userRole: role,
              endpoint: req.path,
              method: req.method
            }
          });
        }

        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED',
          required: permissions,
          missing: missingPermissions,
          current: role
        });
      }

      // Log successful authorization
      await AuditLog.createLog({
        supabaseUid: req.profile.supabaseUid,
        action: 'multiple_actions_authorized',
        resourceType: 'system',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        outcome: 'success',
        details: {
          authorizedPermissions: permissions,
          endpoint: req.path
        }
      });

      next();
    } catch (err) {
      console.error('Authorization error:', err);
      return res.status(500).json({
        error: 'Authorization error',
        code: 'AUTH_SYSTEM_ERROR'
      });
    }
  };
};

/**
 * Middleware to check if user can perform action on specific resource
 * Takes into account both role permissions and resource ownership
 */
const authorizeResource = (resource, action, getResourceOwner) => {
  return async (req, res, next) => {
    try {
      if (!req.profile) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const { role } = req.profile;

      // Super admin bypasses all checks
      if (role === 'super_admin') {
        return next();
      }

      // Check role-based permission first
      const hasPermission = await RolePermission.hasPermission(role, resource, action);

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED',
          required: { resource, action },
          current: role
        });
      }

      // For certain actions, check resource ownership
      if (['read', 'update', 'delete'].includes(action) && getResourceOwner) {
        const resourceOwnerId = await getResourceOwner(req);

        if (resourceOwnerId && !resourceOwnerId.equals(req.profile._id)) {
          // Check if user has special permissions (e.g., care manager can access patient data)
          const hasSpecialAccess = await checkSpecialAccess(req.profile, resource, action, resourceOwnerId);

          if (!hasSpecialAccess) {
            return res.status(403).json({
              error: 'Access denied - resource ownership required',
              code: 'RESOURCE_OWNERSHIP_REQUIRED'
            });
          }
        }
      }

      next();
    } catch (err) {
      console.error('Resource authorization error:', err);
      return res.status(500).json({
        error: 'Authorization error',
        code: 'AUTH_SYSTEM_ERROR'
      });
    }
  };
};

/**
 * Helper function to check special access permissions
 * (e.g., care manager accessing patient data, caretaker accessing assigned patients)
 */
async function checkSpecialAccess(profile, resource, action, resourceOwnerId) {
  const Profile = mongoose.model('Profile');
  const CaretakerPatient = mongoose.model('CaretakerPatient');
  const MentorAuthorization = mongoose.model('MentorAuthorization');

  switch (profile.role) {
    case 'care_manager':
    case 'org_admin':
      // Can access resources within their organization
      const resourceOwner = await Profile.findById(resourceOwnerId);
      return resourceOwner &&
        profile.organizationId &&
        resourceOwner.organizationId &&
        profile.organizationId.equals(resourceOwner.organizationId);

    case 'caretaker':
      // Can access assigned patients
      if (resource === 'patients') {
        const assignment = await CaretakerPatient.findOne({
          caretakerId: profile._id,
          patientId: resourceOwnerId,
          status: 'active'
        });
        return !!assignment;
      }
      break;

    case 'patient_mentor':
      // Can access authorized patients
      if (resource === 'patients') {
        const authorization = await MentorAuthorization.findOne({
          mentorId: profile._id,
          patientId: resourceOwnerId,
          status: 'active'
        });
        return !!authorization;
      }
      break;
  }

  return false;
}

module.exports = {
  authorize,
  authorizeAny,
  authorizeAll,
  authorizeResource
};
