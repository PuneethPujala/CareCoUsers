const { createClient } = require('@supabase/supabase-js');
const Profile = require('../models/Profile');
const Patient = require('../models/Patient');
const AuditLog = require('../models/AuditLog');
const tokenService = require('../services/tokenService');

let supabaseClient = null;
function getSupabase() {
  if (process.env.AUTH_ENABLE_SUPABASE_FALLBACK !== 'true') return null;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseClient;
}

function buildReqUserFromProfile(profile, subject) {
  const created = profile.createdAt || profile.created_at;
  return {
    id: subject,
    email: profile.email,
    email_confirmed_at: profile.emailVerified ? new Date().toISOString() : null,
    created_at: created,
  };
}

/**
 * Verify JWT and load Mongo profile/patient.
 */
async function attachJwtUser(token, req) {
  req._authProfileMissing = false;
  let payload;
  try {
    payload = tokenService.verifyAccessToken(token);
    const isValid = await tokenService.checkRedisSessionValidity(token, payload);
    if (!isValid) return false;
  } catch {
    return false;
  }

  const subject = payload.sub;
  const isPatient = payload.typ === 'patient';

  let profile;
  if (isPatient) {
    profile = await Patient.findOne({ supabase_uid: subject, is_active: true });
    if (profile) profile.organizationId = profile.organization_id;
  } else {
    profile = await Profile.findOne({ supabaseUid: subject, isActive: true }).populate(
      'organizationId',
      'name city'
    );
  }

  if (!profile && !isPatient && payload.email) {
    const emailProfile = await Profile.findOne({
      email: String(payload.email).toLowerCase().trim(),
      isActive: true,
    });
    if (emailProfile) {
      emailProfile.supabaseUid = subject;
      await emailProfile.save();
      profile = await Profile.findById(emailProfile._id).populate('organizationId', 'name city');
    }
  }

  if (!profile && isPatient && payload.email) {
    const emailPatient = await Patient.findOne({
      email: String(payload.email).toLowerCase().trim(),
      is_active: true,
    });
    if (emailPatient) {
      emailPatient.supabase_uid = subject;
      await emailPatient.save();
      profile = emailPatient;
      profile.organizationId = profile.organization_id;
    }
  }

  if (!profile) {
    req._authProfileMissing = true;
    req._authMissingSubject = subject;
    return false;
  }

  req.auth = {
    kind: 'jwt',
    subject,
    userId: profile._id,
    userType: isPatient ? 'Patient' : 'Profile',
  };
  req.user = buildReqUserFromProfile(profile, subject);
  req.profile = profile;
  return true;
}

/**
 * Supabase legacy: verify access token and load Mongo user.
 */
async function attachSupabaseUser(token, req) {
  const supabase = getSupabase();
  if (!supabase) return false;
  req._authProfileMissing = false;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) {
    await AuditLog.createLog({
      supabaseUid: 'anonymous',
      action: 'login_failed',
      resourceType: 'system',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      outcome: 'failure',
      details: { reason: error?.message || 'Invalid token' },
    });
    return false;
  }

  let profile = await Profile.findOne({ supabaseUid: user.id, isActive: true }).populate(
    'organizationId',
    'name city'
  );

  if (!profile && user.email) {
    const emailProfile = await Profile.findOne({
      email: user.email.toLowerCase().trim(),
      isActive: true,
    });
    if (emailProfile) {
      emailProfile.supabaseUid = user.id;
      await emailProfile.save();
      profile = await Profile.findById(emailProfile._id).populate('organizationId', 'name city');
    }
  }

  if (!profile) {
    let patient = await Patient.findOne({ supabase_uid: user.id, is_active: true });
    if (!patient && user.email) {
      const emailPatient = await Patient.findOne({
        email: user.email.toLowerCase().trim(),
        is_active: true,
      });
      if (emailPatient) {
        emailPatient.supabase_uid = user.id;
        await emailPatient.save();
        patient = emailPatient;
      }
    }
    if (patient) {
      profile = patient;
      profile.organizationId = patient.organization_id;
    }
  }

  if (!profile) {
    req._authProfileMissing = true;
    req._authMissingSubject = user.id;
    return false;
  }

  req.auth = {
    kind: 'supabase',
    subject: user.id,
    userId: profile._id,
    userType: profile.role === 'patient' ? 'Patient' : 'Profile',
  };
  req.user = {
    id: user.id,
    email: user.email,
    email_confirmed_at: user.email_confirmed_at,
    created_at: user.created_at,
  };
  req.profile = profile;
  return true;
}

async function runAuthGuards(req, res, profile) {
  if (profile.isLocked) {
    await AuditLog.createLog({
      supabaseUid: req.auth?.subject || 'unknown',
      action: 'login_failed',
      resourceType: 'profile',
      resourceId: profile._id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      outcome: 'failure',
      details: { reason: 'Account locked', lockedUntil: profile.accountLockedUntil },
    });
    return res.status(423).json({
      error: 'Account is temporarily locked',
      code: 'ACCOUNT_LOCKED',
      lockedUntil: profile.accountLockedUntil,
    });
  }

  if (
    profile.role !== 'super_admin' &&
    profile.role !== 'patient' &&
    !profile.emailVerified
  ) {
    return res.status(403).json({
      error: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }

  if (profile.failedLoginAttempts > 0) {
    await profile.resetFailedLogin();
  }

  await AuditLog.createLog({
    supabaseUid: req.auth?.subject || req.user?.id,
    action: 'login',
    resourceType: 'profile',
    resourceId: profile._id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    outcome: 'success',
    details: {
      role: profile.role,
      organizationId: profile.organizationId?._id,
    },
  });

  return null;
}

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid Authorization header',
        code: 'MISSING_AUTH_HEADER',
      });
    }

    const token = authHeader.split(' ')[1];
    let attached = await attachJwtUser(token, req);
    if (!attached) {
      attached = await attachSupabaseUser(token, req);
    }

    if (!attached || !req.profile) {
      if (req._authProfileMissing) {
        return res.status(403).json({
          error: 'Profile not found or inactive',
          code: 'PROFILE_NOT_FOUND',
        });
      }
      return res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
    }

    const guard = await runAuthGuards(req, res, req.profile);
    if (guard) return guard;

    next();
  } catch (err) {
    console.error('Authentication error:', err);
    return res.status(500).json({ error: 'Authentication error', code: 'AUTH_SYSTEM_ERROR' });
  }
};

const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return next();

    const token = authHeader.split(' ')[1];
    let attached = await attachJwtUser(token, req);
    if (!attached) {
      attached = await attachSupabaseUser(token, req);
    }

    if (
      req.profile &&
      !req.profile.isLocked &&
      (req.profile.role === 'super_admin' ||
        req.profile.role === 'patient' ||
        req.profile.emailVerified)
    ) {
      return next();
    }

    req.user = undefined;
    req.profile = undefined;
    req.auth = undefined;
    next();
  } catch (err) {
    console.error('Optional authentication error:', err);
    next();
  }
};

const authenticateSession = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid Authorization header',
        code: 'MISSING_AUTH_HEADER',
      });
    }

    const token = authHeader.split(' ')[1];
    const attached = await attachJwtUser(token, req);
    if (attached) {
      return next();
    }

    const supabase = getSupabase();
    if (!supabase) {
      return res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      email_confirmed_at: user.email_confirmed_at,
      created_at: user.created_at,
    };
    req.profile = null;
    req.auth = { kind: 'supabase', subject: user.id };
    next();
  } catch (err) {
    console.error('Session authentication error:', err);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.profile) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }
  if (!allowedRoles.includes(req.profile.role)) {
    return res.status(403).json({
      error: 'Insufficient role permissions',
      code: 'INSUFFICIENT_ROLE',
      required: allowedRoles,
      current: req.profile.role,
    });
  }
  next();
};

const requireOrganization = (organizationId) => (req, res, next) => {
  if (!req.profile) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }
  if (req.profile.role === 'super_admin') return next();
  if (!req.profile.organizationId || !req.profile.organizationId.equals(organizationId)) {
    return res.status(403).json({
      error: 'Access denied to this organization',
      code: 'ORGANIZATION_ACCESS_DENIED',
    });
  }
  next();
};

const requireOwnership = (resourceIdParam = 'id') => (req, res, next) => {
  if (!req.profile) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }
  if (req.profile.role === 'super_admin') return next();
  const resourceId = req.params[resourceIdParam];
  if (resourceId !== req.profile._id.toString()) {
    return res.status(403).json({
      error: 'Access denied — can only access own resources',
      code: 'OWNERSHIP_REQUIRED',
    });
  }
  next();
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  authenticateSession,
  requireRole,
  requireOrganization,
  requireOwnership,
};
