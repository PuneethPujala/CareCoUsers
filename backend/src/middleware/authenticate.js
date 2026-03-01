const { createClient } = require('@supabase/supabase-js');
const Profile = require('../models/Profile');
const AuditLog = require('../models/AuditLog');

// Initialize Supabase client with service role key for server-side verification
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * Authentication middleware - verifies Supabase JWT and fetches user profile
 * Attaches req.user (Supabase user) and req.profile (MongoDB profile) to request
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Check for Authorization header
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid Authorization header',
        code: 'MISSING_AUTH_HEADER'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify JWT with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      // Log failed authentication attempt
      await AuditLog.createLog({
        supabaseUid: 'anonymous',
        action: 'login_failed',
        resourceType: 'system',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        outcome: 'failure',
        details: {
          reason: error?.message || 'Invalid token',
          tokenPrefix: token.substring(0, 10) + '...'
        }
      });

      return res.status(401).json({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Fetch full profile from MongoDB
    const profile = await Profile.findOne({
      supabaseUid: user.id,
      isActive: true
    }).populate('organizationId', 'name type');

    if (!profile) {
      // Auto-create profile for users who exist in Supabase but not in MongoDB
      // This handles cases where users were created directly in Supabase dashboard
      try {
        const userMeta = user.user_metadata || {};
        const newProfile = await Profile.create({
          supabaseUid: user.id,
          email: user.email,
          fullName: userMeta.full_name || userMeta.name || user.email.split('@')[0],
          role: userMeta.role || 'patient',
          emailVerified: !!user.email_confirmed_at,
          isActive: true,
        });

        req.user = user;
        req.profile = newProfile;
        return next();
      } catch (createError) {
        console.warn('Failed to auto-create profile:', createError?.message);

        return res.status(403).json({
          error: 'Profile not found or account deactivated',
          code: 'PROFILE_NOT_FOUND'
        });
      }
    }

    // Check if account is locked
    if (profile.isLocked) {
      await AuditLog.createLog({
        supabaseUid: user.id,
        action: 'login_failed',
        resourceType: 'profile',
        resourceId: profile._id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        outcome: 'failure',
        details: {
          reason: 'Account locked',
          lockedUntil: profile.accountLockedUntil
        }
      });

      return res.status(423).json({
        error: 'Account is temporarily locked',
        code: 'ACCOUNT_LOCKED',
        lockedUntil: profile.accountLockedUntil
      });
    }

    // Check if email is verified (except for super admins)
    if (profile.role !== 'super_admin' && !profile.emailVerified) {
      return res.status(403).json({
        error: 'Email verification required',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    // Reset failed login attempts on successful authentication
    if (profile.failedLoginAttempts > 0) {
      await profile.resetFailedLogin();
    }

    // Attach user and profile to request
    req.user = user;         // Supabase user object
    req.profile = profile;   // MongoDB profile with role and org

    // Log successful authentication
    await AuditLog.createLog({
      supabaseUid: user.id,
      action: 'login',
      resourceType: 'profile',
      resourceId: profile._id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      outcome: 'success',
      details: {
        role: profile.role,
        organizationId: profile.organizationId?._id
      }
    });

    next();
  } catch (err) {
    console.error('Authentication error:', err);

    // Log system error
    await AuditLog.createLog({
      supabaseUid: 'anonymous',
      action: 'login_failed',
      resourceType: 'system',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      outcome: 'failure',
      details: {
        reason: 'System error during authentication',
        error: err.message
      }
    });

    return res.status(500).json({
      error: 'Authentication error',
      code: 'AUTH_SYSTEM_ERROR'
    });
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token provided
 * Still attaches req.user and req.profile if valid token is present
 */
const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return next(); // No token, continue without authentication
    }

    const token = authHeader.split(' ')[1];

    // Verify JWT with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return next(); // Invalid token, continue without authentication
    }

    // Fetch profile from MongoDB
    const profile = await Profile.findOne({
      supabaseUid: user.id,
      isActive: true
    }).populate('organizationId', 'name type');

    if (profile && !profile.isLocked &&
      (profile.role === 'super_admin' || profile.emailVerified)) {
      req.user = user;
      req.profile = profile;
    }

    next();
  } catch (err) {
    console.error('Optional authentication error:', err);
    next(); // Continue without authentication on error
  }
};

/**
 * Middleware to check if user has specific role
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.profile) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!allowedRoles.includes(req.profile.role)) {
      return res.status(403).json({
        error: 'Insufficient role permissions',
        code: 'INSUFFICIENT_ROLE',
        required: allowedRoles,
        current: req.profile.role
      });
    }

    next();
  };
};

/**
 * Middleware to check if user belongs to specific organization
 */
const requireOrganization = (organizationId) => {
  return (req, res, next) => {
    if (!req.profile) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (req.profile.role === 'super_admin') {
      return next(); // Super admin can access any organization
    }

    if (!req.profile.organizationId || !req.profile.organizationId.equals(organizationId)) {
      return res.status(403).json({
        error: 'Access denied to this organization',
        code: 'ORGANIZATION_ACCESS_DENIED'
      });
    }

    next();
  };
};

/**
 * Middleware to check if user is accessing their own resource
 */
const requireOwnership = (resourceIdParam = 'id') => {
  return (req, res, next) => {
    if (!req.profile) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const resourceId = req.params[resourceIdParam];
    const profileId = req.profile._id.toString();

    // Super admins can access any resource
    if (req.profile.role === 'super_admin') {
      return next();
    }

    // Check if user is accessing their own resource
    if (resourceId !== profileId) {
      return res.status(403).json({
        error: 'Access denied - can only access own resources',
        code: 'OWNERSHIP_REQUIRED'
      });
    }

    next();
  };
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  requireRole,
  requireOrganization,
  requireOwnership
};
