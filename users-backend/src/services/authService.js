const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const Profile = require('../models/Profile');
const Patient = require('../models/Patient');
const Caller = require('../models/Caller');
const Organization = require('../models/Organization');
const RefreshToken = require('../models/RefreshToken');
const { ROLE_LABELS, CREATION_HIERARCHY } = require('../constants/auth');
const { logEvent, logSecurityEvent } = require('./auditService');
const { sendTempPasswordEmail, sendPasswordChangedEmail, sendPasswordResetEmail } = require('./emailService');
const { createOTP, verifyOTP } = require('./otpService');
const passwordService = require('./passwordService');
const tokenService = require('./tokenService');

function generateTempPassword() {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  let pwd = '';
  for (let i = 0; i < 4; i++) pwd += upper[Math.floor(Math.random() * upper.length)];
  for (let i = 0; i < 4; i++) pwd += digits[Math.floor(Math.random() * digits.length)];
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

let supabaseFallbackClient = null;
function getSupabaseFallback() {
  if (process.env.AUTH_ENABLE_SUPABASE_FALLBACK !== 'true') return null;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!supabaseFallbackClient) {
    supabaseFallbackClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseFallbackClient;
}

function buildSessionUser(subject, email, emailVerified) {
  return {
    id: subject,
    email,
    email_verified: !!emailVerified,
  };
}

function resolveIdentity(patient, deactivated, profile, companion, requestedRole = null) {
  // Priority 1: If a requestedRole was provided, let it guide the choice when matches exist (supports patient, companion, and staff separation)
  if (requestedRole) {
    if (requestedRole === 'patient' && patient) {
      return { account: patient, isPatient: true };
    }
    if (requestedRole === 'companion' && companion) {
      return { account: companion, isPatient: false, isCompanion: true };
    }
    if (requestedRole === 'companion' && profile && profile.role === 'companion') {
      return { account: profile, isPatient: false };
    }
    if (requestedRole !== 'patient' && requestedRole !== 'companion' && profile) {
      return { account: profile, isPatient: false };
    }
  }

  // Priority 2: If companion exists in dedicated collection, it wins fallback
  if (companion) {
    return { account: companion, isPatient: false, isCompanion: true };
  }

  // Priority 2b: Legacy fallback for companion role in profiles
  if (profile && profile.role === 'companion') {
    return { account: profile, isPatient: false };
  }

  // Priority 3: Active (or reactivated) patient
  if (patient) {
    return { account: patient, isPatient: true };
  }

  // Priority 4: Fallback active profile
  if (profile) {
    return { account: profile, isPatient: false };
  }

  return { account: null, isPatient: false };
}


async function assertGlobalUniqueEmail(email, ignoreId = null, ignoreModel = null, skipModels = []) {
  const emailNorm = email.toLowerCase().trim();

  // 1. Check Patient collection
  if (!skipModels.includes('Patient')) {
    const patient = await Patient.findOne({ email: emailNorm });
    if (patient && !(ignoreModel === 'Patient' && patient._id.equals(ignoreId))) {
      const err = new Error(`An account with the email "${email}" already exists.`);
      err.status = 400;
      err.code = 'EMAIL_ALREADY_EXISTS';
      throw err;
    }
  }

  // 2. Check Profile collection (staff accounts)
  if (!skipModels.includes('Profile')) {
    const profile = await Profile.findOne({ email: emailNorm });
    if (profile && !(ignoreModel === 'Profile' && profile._id.equals(ignoreId))) {
      const err = new Error(`An account with the email "${email}" already exists.`);
      err.status = 400;
      err.code = 'EMAIL_ALREADY_EXISTS';
      throw err;
    }
  }

  // 3. Check Companion collection
  // NOTE: Patients and Companions are allowed to share emails (dual-role users),
  // so callers should pass skipModels: ['Companion'] when registering a Patient.
  if (!skipModels.includes('Companion')) {
    const Companion = require('../models/Companion');
    const companion = await Companion.findOne({ email: emailNorm });
    if (companion && !(ignoreModel === 'Companion' && companion._id.equals(ignoreId))) {
      const err = new Error(`An account with the email "${email}" already exists.`);
      err.status = 400;
      err.code = 'EMAIL_ALREADY_EXISTS';
      throw err;
    }
  }
}


function buildLoginProfile(account, isPatient) {
  const accountId = account._id;
  let subscriptionStatus = null;
  if (isPatient) {
    subscriptionStatus = account.subscription?.status || 'pending_payment';
  }
  return {
    id: accountId,
    email: account.email,
    fullName: isPatient ? account.name : account.fullName,
    role: isPatient ? 'patient' : account.role,
    organizationId: isPatient ? account.organization_id : account.organizationId,
    isActive: isPatient ? account.is_active : account.isActive,
    emailVerified: account.emailVerified,
    mustChangePassword: account.mustChangePassword || false,
    subscription_status: subscriptionStatus,
  };
}

async function registerPatient(body, req) {
  const { email, password, fullName, city, organizationId, phone, supabaseUid, acceptedTermsVersion, acceptedPrivacyVersion, acceptedAt } = body;
  if (!email || !fullName) {
    const err = new Error('Missing required fields: email, fullName');
    err.status = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  // Google OAuth users register without a password; email-password users must provide one
  const isOAuth = !!supabaseUid;
  if (!isOAuth && !password) {
    const err = new Error('Password is required');
    err.status = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  if (password) {
    const pwErrors = passwordService.validatePasswordComplexity(password);
    if (pwErrors.length) {
      const err = new Error('Password does not meet requirements');
      err.status = 400;
      err.code = 'PASSWORD_POLICY';
      err.details = pwErrors;
      throw err;
    }
  }

  const emailNorm = email.toLowerCase().trim();

  // Find existing documents in both collections for robust cross-collection identity check
  const existingPatient = await Patient.findOne({ email: emailNorm });
  const existingProfile = await Profile.findOne({ email: emailNorm });
  const Companion = require('../models/Companion');
  const existingCompanion = await Companion.findOne({ email: emailNorm });

  // 1. If the email belongs to an existing Companion and this is an OAuth request,
  // link the OAuth identity to the companion account (backward compat).
  // For non-OAuth, we simply allow the patient to register separately —
  // a companion CAN also be a patient (e.g., caring for a parent while being a patient themselves).
  if (existingCompanion && isOAuth) {
    // Overwrite Guard: if supabaseUid is already set, verify they match!
    const isPlaceholder = existingCompanion.supabaseUid && existingCompanion.supabaseUid.startsWith('cmp_');
    if (existingCompanion.supabaseUid && existingCompanion.supabaseUid !== supabaseUid && !isPlaceholder) {
      const err = new Error('This account is already linked to a different Google identity.');
      err.status = 400;
      err.code = 'OAUTH_LINK_CONFLICT';
      throw err;
    }

    // Link Google OAuth to companion
    existingCompanion.supabaseUid = supabaseUid;
    if (fullName && !existingCompanion.fullName) existingCompanion.fullName = fullName;
    await existingCompanion.save();

    await logEvent(supabaseUid, 'companion_oauth_linked', 'companion', existingCompanion._id, req, {
      email: emailNorm,
    });

    const tokens = await tokenService.issueTokenPair(
      {
        userId: existingCompanion._id,
        userType: 'Companion',
        subject: supabaseUid,
        role: existingCompanion.role,
        email: existingCompanion.email,
        emailVerified: existingCompanion.emailVerified,
      },
      req
    );

    return {
      message: 'Account linked successfully',
      user: { id: supabaseUid, email: emailNorm },
      session: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        expires_at: tokens.expires_at,
        user: buildSessionUser(supabaseUid, emailNorm, existingCompanion.emailVerified),
      },
      profile: buildLoginProfile(existingCompanion, false),
    };
  }

  // 2. Resolve conflicts / link OAuth for existing Profile (Legacy companion)
  if (existingProfile && existingProfile.role === 'companion') {
    if (isOAuth) {
      // Overwrite Guard: if supabaseUid is already set, verify they match!
      const isPlaceholder = existingProfile.supabaseUid && existingProfile.supabaseUid.startsWith('cmp_');
      if (existingProfile.supabaseUid && existingProfile.supabaseUid !== supabaseUid && !isPlaceholder) {
        const err = new Error('This account is already linked to a different Google identity.');
        err.status = 400;
        err.code = 'OAUTH_LINK_CONFLICT';
        throw err;
      }

      // Link Google OAuth to companion Profile
      existingProfile.supabaseUid = supabaseUid;
      if (fullName && !existingProfile.fullName) existingProfile.fullName = fullName;
      await existingProfile.save();

      await logEvent(supabaseUid, 'companion_oauth_linked', 'profile', existingProfile._id, req, {
        email: emailNorm,
      });

      const tokens = await tokenService.issueTokenPair(
        {
          userId: existingProfile._id,
          userType: 'Profile',
          subject: supabaseUid,
          role: existingProfile.role,
          email: existingProfile.email,
          emailVerified: existingProfile.emailVerified,
        },
        req
      );

      return {
        message: 'Account linked successfully',
        user: { id: supabaseUid, email: emailNorm },
        session: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          expires_at: tokens.expires_at,
          user: buildSessionUser(supabaseUid, emailNorm, existingProfile.emailVerified),
        },
        profile: buildLoginProfile(existingProfile, false),
      };
    }

    const err = new Error(`An account with the email "${email}" already exists with a different role. Please log in instead.`);
    err.status = 400;
    err.code = 'EMAIL_ALREADY_EXISTS';
    throw err;
  }

  // 2. Resolve conflicts / link OAuth for existing Patient
  if (existingPatient) {
    if (isOAuth) {
      // Overwrite Guard: if supabaseUid is already set, verify they match!
      const isPlaceholder = !!existingPatient.passwordHash;
      if (existingPatient.supabase_uid && existingPatient.supabase_uid !== supabaseUid && !isPlaceholder) {
        const err = new Error('This account is already linked to a different Google identity.');
        err.status = 400;
        err.code = 'OAUTH_LINK_CONFLICT';
        throw err;
      }

      existingPatient.supabase_uid = supabaseUid;
      if (fullName && !existingPatient.name) existingPatient.name = fullName;
      if (!existingPatient.is_active && existingPatient.deactivated_reason === 'user_requested') {
        existingPatient.is_active = true;
        existingPatient.deactivated_at = undefined;
        existingPatient.deactivated_reason = undefined;
      }
      await existingPatient.save();

      await logEvent(supabaseUid, 'patient_oauth_linked', 'patient', existingPatient._id, req, {
        email: emailNorm,
      });

      const tokens = await tokenService.issueTokenPair(
        {
          userId: existingPatient._id,
          userType: 'Patient',
          subject: supabaseUid,
          role: 'patient',
          email: existingPatient.email,
          emailVerified: existingPatient.emailVerified,
        },
        req
      );

      return {
        message: 'Account linked successfully',
        user: { id: supabaseUid, email: emailNorm },
        session: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          expires_at: tokens.expires_at,
          user: buildSessionUser(supabaseUid, emailNorm, existingPatient.emailVerified),
        },
        profile: buildLoginProfile(existingPatient, true),
      };
    }

    if (!existingPatient.is_active && existingPatient.deactivated_reason === 'user_requested') {
      const err = new Error('Your account was deactivated. Please log in with your credentials to reactivate it.');
      err.status = 400;
      err.code = 'ACCOUNT_DEACTIVATED';
      err.hint = 'Log in with your existing credentials to reactivate your account.';
      throw err;
    }

    const err = new Error(`An account with the email "${email}" already exists. Please log in instead.`);
    err.status = 400;
    err.code = 'EMAIL_ALREADY_EXISTS';
    throw err;
  }

  let targetOrgId = organizationId;
  if (city && !targetOrgId) {
    const org = await Organization.findOne({ city, isActive: true });
    if (!org) {
      const err = new Error(`No active organisation found for city: ${city}`);
      err.status = 400;
      throw err;
    }
    targetOrgId = org._id;
  }
  if (!targetOrgId) {
    const defaultOrg = await Organization.findOne({ isActive: true });
    if (!defaultOrg) {
      const err = new Error('No active organization available for registration');
      err.status = 400;
      throw err;
    }
    targetOrgId = defaultOrg._id;
  }

  const org = await Organization.findById(targetOrgId);
  if (!org || !org.isActive) {
    const err = new Error('Invalid or inactive organization');
    err.status = 400;
    throw err;
  }
  // Defensive: canAdd may fail if counts field is undefined on the org doc
  try {
    if (typeof org.canAdd === 'function' && !org.canAdd('patient')) {
      const err = new Error('This organisation has reached its patient capacity. Please contact support.');
      err.status = 400;
      throw err;
    }
  } catch (capacityErr) {
    if (capacityErr.status === 400) throw capacityErr;
    console.warn('[Auth] org.canAdd() check failed, allowing registration:', capacityErr.message);
  }

  // For OAuth users use their Supabase UID; for email-password generate a new one
  const subject = isOAuth ? supabaseUid : crypto.randomUUID();
  const passwordHash = password ? await passwordService.hashPassword(password) : undefined;

  const patientData = {
    supabase_uid: subject,
    email: emailNorm,
    name: fullName,
    city: city || null,
    organization_id: targetOrgId,
    phone: phone || null,
    role: 'patient',
    emailVerified: true,
    acceptedTermsVersion,
    acceptedPrivacyVersion,
    acceptedAt,
  };
  if (passwordHash) patientData.passwordHash = passwordHash;

  const patient = new Patient(patientData);
  try {
    await patient.save();
  } catch (e) {
    if (e && e.code === 11000) {
      const err = new Error(`An account with the email "${email}" already exists. Please log in instead.`);
      err.status = 400;
      err.code = 'EMAIL_ALREADY_EXISTS';
      throw err;
    }
    throw e;
  }

  await Organization.findByIdAndUpdate(targetOrgId, { $inc: { 'counts.patients': 1 } });

  await logEvent(subject, 'patient_created', 'patient', patient._id, req, {
    email: emailNorm,
    role: 'patient',
    organizationId: targetOrgId,
    authMethod: isOAuth ? 'google_oauth' : 'email_password',
  });

  const result = {
    message: 'Registration successful',
    user: { id: subject, email: emailNorm },
    profile: {
      id: patient._id,
      email: patient.email,
      fullName: patient.name,
      role: patient.role,
      organizationId: patient.organization_id,
      isActive: patient.is_active,
    },
  };

  // For OAuth users, issue CareMyMednnect JWTs so the mobile has usable tokens.
  // Email-password users get their tokens from the subsequent login() call.
  if (isOAuth) {
    const tokens = await tokenService.issueTokenPair(
      {
        userId: patient._id,
        userType: 'Patient',
        subject,
        role: 'patient',
        email: emailNorm,
        emailVerified: true,
      },
      req
    );
    result.session = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      expires_at: tokens.expires_at,
      user: buildSessionUser(subject, emailNorm, true),
    };
  }

  return result;
}

async function login({ email, password, role }, req) {
  if (!email || !password) {
    const err = new Error('Email and password are required');
    err.status = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  // NOTE: We no longer require the 'role' parameter to be strictly selected or matched beforehand,
  // making login truly identity-based. We support the role parameter as a fallback/hint, but prioritize
  // companion role resolving to prevent duplicates and onboarding loop traps.
  const emailNorm = email.toLowerCase().trim();

  // Query all potential matches in parallel for optimal timing normalization and constant performance
  let patientQuery = Patient.findOne({ email: emailNorm, is_active: true });
  if (patientQuery && typeof patientQuery.select === 'function') {
    patientQuery = patientQuery.select('+passwordHash');
  }

  let deactivatedQuery = Patient.findOne({ email: emailNorm, is_active: false });
  if (deactivatedQuery && typeof deactivatedQuery.select === 'function') {
    deactivatedQuery = deactivatedQuery.select('+passwordHash');
  }

  let profileQuery = Profile.findOne({ email: emailNorm, isActive: true });
  if (profileQuery && typeof profileQuery.select === 'function') {
    profileQuery = profileQuery.select('+passwordHash');
  }
  if (profileQuery && typeof profileQuery.populate === 'function') {
    profileQuery = profileQuery.populate('organizationId', 'name city');
  }

  const Companion = require('../models/Companion');
  let companionQuery = Companion.findOne({ email: emailNorm, isActive: true });
  if (companionQuery && typeof companionQuery.select === 'function') {
    companionQuery = companionQuery.select('+passwordHash');
  }

  let [patient, deactivated, profile, companion] = await Promise.all([
    patientQuery,
    deactivatedQuery,
    profileQuery,
    companionQuery,
  ]);

  // Reactivate deactivated patient if needed, before identity resolution
  if (!patient && deactivated && deactivated.deactivated_reason === 'user_requested') {
    deactivated.is_active = true;
    deactivated.deactivated_at = undefined;
    deactivated.deactivated_reason = undefined;
    await deactivated.save();
    patient = deactivated;
    await logEvent(deactivated.supabase_uid, 'account_reactivated', 'patient', deactivated._id, req, {
      method: 'login',
    });
  }

  // Resolve identity using priority rules (companions win conflicts)
  const resolved = resolveIdentity(patient, deactivated, profile, companion, role);
  const account = resolved.account;
  const isPatient = resolved.isPatient;
  const isCompanion = resolved.isCompanion;

  // SEC-FIX-1: Generic error for all "account not found" paths to prevent user enumeration.
  // We still perform a dummy bcrypt compare to keep response time constant.
  if (!account) {
    await passwordService.safeComparePassword(password, null);
    const err = new Error('Invalid email or password');
    err.status = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  if (account.isLocked) {
    await logSecurityEvent(
      isPatient ? account.supabase_uid : account.supabaseUid,
      'login_failed',
      'high',
      'Account is locked',
      req
    );
    const err = new Error('Account is temporarily locked');
    err.status = 423;
    err.code = 'ACCOUNT_LOCKED';
    err.lockedUntil = account.accountLockedUntil;
    throw err;
  }

  let passwordValid = false;
  const supabase = getSupabaseFallback();

  if (account.passwordHash) {
    passwordValid = await passwordService.verifyPassword(password, account.passwordHash);
  } else if (supabase) {
    const res = await supabase.auth.signInWithPassword({ email: emailNorm, password });
    passwordValid = !!(res && !res.error && res.data);
    if (passwordValid) {
      account.passwordHash = await passwordService.hashPassword(password);
      await account.save();
    }
  } else {
    // Account exists but has no password (Google-only user who never set one)
    passwordValid = false;
  }

  if (!passwordValid) {
    // SEC-FIX-1: Differentiate Google-only accounts with a specific code
    // so the mobile app can show a helpful message, but the error text stays generic.
    if (!account.passwordHash) {
      const err = new Error('Invalid email or password');
      err.status = 401;
      err.code = 'NO_PASSWORD_SET';
      throw err;
    }
    await account.incrementFailedLogin();
    await logSecurityEvent('anonymous', 'login_failed', 'medium', 'Failed login attempt', req);
    const err = new Error('Invalid email or password');
    err.status = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  if (account.failedLoginAttempts > 0) {
    await account.resetFailedLogin();
  }

  const subject = isPatient ? account.supabase_uid : account.supabaseUid;
  const userType = isPatient ? 'Patient' : (isCompanion ? 'Companion' : 'Profile');

  // ── MFA Challenge Gate (Audit 2.1-2.4, 2.8) ─────────────────────────────
  // If MFA is enabled, do NOT issue full tokens yet.
  // Instead, issue a short-lived mfa_token the client must exchange
  // via POST /api/auth/mfa/verify with a valid TOTP code.
  if (account.mfaEnabled) {
    const jwtConfig = require('../config/jwt');
    const mfaToken = jwt.sign(
      {
        purpose: 'mfa_challenge',
        userId: account._id.toString(),
        userType,
        subject,
        role: isPatient ? 'patient' : account.role,
        email: account.email,
        emailVerified: account.emailVerified,
        profileSnapshot: buildLoginProfile(account, isPatient),
      },
      jwtConfig.secret,
      { expiresIn: '5m' }
    );

    await logEvent(subject, 'login_mfa_required', isPatient ? 'patient' : 'profile', account._id, req, {
      role: isPatient ? 'patient' : account.role,
    });

    return {
      message: 'MFA verification required',
      requireMfa: true,
      mfa_token: mfaToken,
      profile: buildLoginProfile(account, isPatient),
    };
  }

  const tokens = await tokenService.issueTokenPair(
    {
      userId: account._id,
      userType,
      subject,
      role: isPatient ? 'patient' : account.role,
      email: account.email,
      emailVerified: account.emailVerified,
    },
    req
  );

  await logEvent(subject, 'login', isPatient ? 'patient' : 'profile', account._id, req, {
    role: isPatient ? 'patient' : account.role,
    organizationId: isPatient ? account.organization_id : account.organizationId?._id,
  });

  return {
    message: 'Login successful',
    session: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      expires_at: tokens.expires_at,
      user: buildSessionUser(subject, account.email, account.emailVerified),
    },
    profile: buildLoginProfile(account, isPatient),
  };
}

async function refreshSession(rawRefresh, req) {
  if (!rawRefresh) {
    const err = new Error('Refresh token is required');
    err.status = 400;
    throw err;
  }

  const tokenHash = RefreshToken.hashToken(rawRefresh);
  const doc = await RefreshToken.findOne({
    tokenHash,
    expiresAt: { $gt: new Date() },
  });

  if (!doc) {
    const err = new Error('Invalid or expired refresh token');
    err.status = 401;
    err.code = 'INVALID_REFRESH_TOKEN';
    throw err;
  }

  // Detect token reuse
  if (doc.revokedAt != null) {
    await tokenService.revokeAllForUser(doc.userId, doc.userType);
    await logSecurityEvent('anonymous', 'refresh_token_reuse', 'critical', 'Attempted reuse of revoked refresh token', req);
    const err = new Error('Security alert: Token reuse detected. All sessions revoked.');
    err.status = 401;
    err.code = 'TOKEN_REUSE_DETECTED';
    throw err;
  }

  let account;
  let isPatient = doc.userType === 'Patient';
  let isCompanion = doc.userType === 'Companion';
  
  if (isPatient) {
    account = await Patient.findById(doc.userId);
  } else if (isCompanion) {
    const Companion = require('../models/Companion');
    account = await Companion.findById(doc.userId);
  } else {
    account = await Profile.findById(doc.userId).populate('organizationId', 'name city');
  }

  if (!account || (isPatient ? !account.is_active : !account.isActive)) {
    const err = new Error('Profile not found or account deactivated');
    err.status = 403;
    err.code = 'PROFILE_NOT_FOUND';
    throw err;
  }

  if (account.isLocked) {
    const err = new Error('Account is temporarily locked');
    err.status = 423;
    err.code = 'ACCOUNT_LOCKED';
    err.lockedUntil = account.accountLockedUntil;
    throw err;
  }

  doc.revokedAt = new Date();
  await doc.save();

  const subject = isPatient ? account.supabase_uid : account.supabaseUid;
  const tokens = await tokenService.issueTokenPair(
    {
      userId: account._id,
      userType: isPatient ? 'Patient' : (isCompanion ? 'Companion' : 'Profile'),
      subject,
      role: isPatient ? 'patient' : account.role,
      email: account.email,
      emailVerified: account.emailVerified,
    },
    req
  );

  return {
    message: 'Token refreshed successfully',
    session: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      expires_at: tokens.expires_at,
      user: buildSessionUser(subject, account.email, account.emailVerified),
    },
    profile: buildLoginProfile(account, isPatient),
  };
}

async function logout(subject, userId, userType, req) {
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    await tokenService.denylistAccessToken(token);
  }
  await tokenService.revokeAllForUser(userId, userType);

  // Clear push token so logged out devices stop receiving notifications
  try {
    if (userType === 'Patient') {
      await Patient.findByIdAndUpdate(userId, { expo_push_token: null });
    } else if (userType === 'Companion') {
      const Companion = require('../models/Companion');
      await Companion.findByIdAndUpdate(userId, { expo_push_token: null });
    } else if (userType === 'Profile') {
      await Profile.findByIdAndUpdate(userId, { expo_push_token: null });
    }
  } catch (err) {
    // ignore errors
  }

  await logEvent(subject, 'logout', userType === 'Patient' ? 'patient' : 'profile', userId, req);
}

async function requestPasswordReset(email, req) {
  const emailNorm = email.toLowerCase().trim();
  const genericResponse = {
    message: 'If an account with this email exists, a password reset code has been sent',
  };

  const profile = await Profile.findOne({ email: emailNorm, isActive: true });
  const patient = await Patient.findOne({ email: emailNorm, is_active: true });
  if (!profile && !patient) return genericResponse;

  const otp = await createOTP(`reset:${emailNorm}`);
  sendPasswordResetEmail(email, otp).catch((err) => console.error('Reset email failed:', err.message));

  const uid = profile ? profile.supabaseUid : patient.supabase_uid;
  const docId = profile ? profile._id : patient._id;
  await logEvent(uid, 'password_reset_requested', profile ? 'profile' : 'patient', docId, req);

  return genericResponse;
}

async function verifyPasswordReset({ email, otp, newPassword }, req) {
  const emailNorm = email.toLowerCase().trim();
  const complexityErrors = passwordService.validatePasswordComplexity(newPassword);
  if (complexityErrors.length) {
    const err = new Error('Password does not meet requirements');
    err.status = 400;
    err.details = complexityErrors;
    throw err;
  }

  const result = await verifyOTP(`reset:${emailNorm}`, otp);
  if (!result.valid) {
    const err = new Error(result.reason || 'Invalid code');
    err.status = 400;
    throw err;
  }

  const profile = await Profile.findOne({ email: emailNorm, isActive: true }).select('+passwordHash');
  const patient = await Patient.findOne({ email: emailNorm, is_active: true }).select('+passwordHash');

  if (!profile && !patient) {
    const err = new Error('Account not found');
    err.status = 404;
    throw err;
  }

  const hash = await passwordService.hashPassword(newPassword);
  if (profile) {
    profile.passwordHash = hash;
    profile.mustChangePassword = false;
    await profile.save();
    await tokenService.revokeAllForUser(profile._id, 'Profile');
    await tokenService.revokeAllSessionsGlobally(profile.supabaseUid);
  }
  if (patient) {
    patient.passwordHash = hash;
    await patient.save();
    await tokenService.revokeAllForUser(patient._id, 'Patient');
    await tokenService.revokeAllSessionsGlobally(patient.supabase_uid);
  }

  const fullName = profile ? profile.fullName : patient.name;
  sendPasswordChangedEmail(email, fullName);

  const uid = profile ? profile.supabaseUid : patient.supabase_uid;
  await logEvent(uid, 'password_reset_completed', profile ? 'profile' : 'patient', profile ? profile._id : patient._id, req);

  return { message: 'Password has been reset successfully. Please log in with your new password.' };
}

async function createStaffUser(body, req, actorProfile) {
  const { email, fullName, role, organizationId } = body;
  const callerRole = actorProfile.role;

  if (!email || !fullName || !role) {
    const err = new Error('Missing required fields: email, fullName, role');
    err.status = 400;
    throw err;
  }

  const allowedTargetRoles = CREATION_HIERARCHY[callerRole];
  if (!allowedTargetRoles || !allowedTargetRoles.includes(role)) {
    const err = new Error(`Role '${callerRole}' cannot create role '${role}'`);
    err.status = 403;
    err.code = 'ROLE_HIERARCHY_VIOLATION';
    throw err;
  }

  const targetOrgId = organizationId || actorProfile.organizationId || null;
  if (['care_manager', 'caller'].includes(role) && !targetOrgId) {
    const err = new Error('organizationId is required for this role');
    err.status = 400;
    throw err;
  }

  if (targetOrgId) {
    const org = await Organization.findById(targetOrgId);
    if (!org || !org.isActive) {
      const err = new Error('Invalid or inactive organization');
      err.status = 400;
      throw err;
    }
    if (!org.canAdd(role)) {
      const err = new Error(`Organisation has reached its ${role} capacity`);
      err.status = 400;
      err.code = 'CAPACITY_LIMIT_REACHED';
      throw err;
    }
  }

  const emailNorm = email.toLowerCase().trim();
  const existingProfile = await Profile.findOne({ email: emailNorm });
  if (existingProfile) {
    const err = new Error(`A user with the email "${email}" already exists.`);
    err.status = 400;
    throw err;
  }

  const tempPassword = generateTempPassword();
  const subject = crypto.randomUUID();
  const passwordHash = await passwordService.hashPassword(tempPassword);
  const hashedForHistory = await passwordService.hashPassword(tempPassword);

  const profile = new Profile({
    supabaseUid: subject,
    email: emailNorm,
    fullName,
    role,
    organizationId: targetOrgId || null,
    mustChangePassword: true,
    passwordHash,
    passwordHistory: [hashedForHistory],
    createdBy: actorProfile._id,
    emailVerified: true,
  });
  await profile.save();

  if (targetOrgId) {
    const incField =
      role === 'caller' ? 'counts.callers' : role === 'care_manager' ? 'counts.managers' : null;
    if (incField) {
      await Organization.findByIdAndUpdate(targetOrgId, { $inc: { [incField]: 1 } });
    }
  }

  await sendTempPasswordEmail(email, fullName, tempPassword, ROLE_LABELS[role] || role);

  await logEvent(actorProfile.supabaseUid, 'create_user', 'profile', profile._id, req, {
    targetEmail: emailNorm,
    targetRole: role,
    createdByRole: callerRole,
  });

  return {
    message: `${ROLE_LABELS[role] || role} account created successfully. Temporary password sent to ${email}.`,
    profile: {
      id: profile._id,
      email: profile.email,
      fullName: profile.fullName,
      role: profile.role,
      organizationId: profile.organizationId,
    },
  };
}

async function changePassword({ currentPassword, newPassword }, req, profile, userSubject) {
  if (!currentPassword || !newPassword) {
    const err = new Error('currentPassword and newPassword are required');
    err.status = 400;
    throw err;
  }

  const complexityErrors = passwordService.validatePasswordComplexity(newPassword);
  if (complexityErrors.length) {
    const err = new Error('Password does not meet requirements');
    err.status = 400;
    err.details = complexityErrors;
    throw err;
  }

  const isPatient = profile.role === 'patient';
  const Model = isPatient ? Patient : Profile;
  const account = await Model.findById(profile._id).select('+passwordHash +passwordHistory');

  let currentOk = false;
  const supabase = getSupabaseFallback();
  if (account.passwordHash) {
    currentOk = await passwordService.verifyPassword(currentPassword, account.passwordHash);
  } else if (supabase) {
    const { error } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: currentPassword,
    });
    currentOk = !error;
  } else {
    currentOk = false;
  }

  if (!currentOk) {
    await logSecurityEvent(
      userSubject,
      'password_change_failed',
      'medium',
      'Incorrect current password during password change',
      req
    );
    const err = new Error('Current password is incorrect');
    err.status = 401;
    err.code = 'INVALID_CURRENT_PASSWORD';
    throw err;
  }

  if (currentPassword === newPassword) {
    const err = new Error('New password must be different from current password');
    err.status = 400;
    throw err;
  }

  if (account.passwordHistory?.length > 0) {
    for (const oldHash of account.passwordHistory) {
      const matches = await passwordService.verifyPassword(newPassword, oldHash);
      if (matches) {
        const err = new Error('Cannot reuse any of your last 3 passwords');
        err.status = 400;
        err.code = 'PASSWORD_REUSE';
        throw err;
      }
    }
  }

  const newHash = await passwordService.hashPassword(newPassword);
  account.passwordHash = newHash;

  const history = [...(account.passwordHistory || []), newHash].slice(-3);
  account.passwordHistory = history;

  if (!isPatient) {
    account.mustChangePassword = false;
    account.passwordChangedAt = new Date();
  }

  await account.save();

  await tokenService.revokeAllForUser(account._id, isPatient ? 'Patient' : 'Profile');
  await tokenService.revokeAllSessionsGlobally(userSubject);

  const fullName = isPatient ? account.name : account.fullName;
  sendPasswordChangedEmail(account.email, fullName);

  await logEvent(userSubject, 'password_changed', isPatient ? 'patient' : 'profile', account._id, req, {
    forced: profile.mustChangePassword,
  });

  return { message: 'Password changed successfully. Please log in again.' };
}

async function setPassword(newPassword, req, profile, userSubject) {
  const complexityErrors = passwordService.validatePasswordComplexity(newPassword);
  if (complexityErrors.length) {
    const err = new Error('Password does not meet requirements');
    err.status = 400;
    err.details = complexityErrors;
    throw err;
  }

  const isPatient = profile.role === 'patient';
  const Model = isPatient ? Patient : Profile;
  const account = await Model.findById(profile._id).select('+passwordHash');

  // Security: prevent overwriting an existing password without current-password verification
  if (account.passwordHash) {
    const err = new Error('A password is already set on this account. Use "Change Password" instead.');
    err.status = 400;
    err.code = 'PASSWORD_ALREADY_SET';
    throw err;
  }

  account.passwordHash = await passwordService.hashPassword(newPassword);
  await account.save();

  const fullName = isPatient ? account.name : account.fullName;
  sendPasswordChangedEmail(account.email, fullName);

  await logEvent(userSubject, 'password_set', isPatient ? 'patient' : 'profile', account._id, req);

  return { message: 'Password set successfully. You can now log in with email and password.' };
}

module.exports = {
  generateTempPassword,
  registerPatient,
  login,
  refreshSession,
  logout,
  requestPasswordReset,
  verifyPasswordReset,
  createStaffUser,
  changePassword,
  setPassword,
  assertGlobalUniqueEmail,
  buildSessionUser,
  getSupabaseFallback,
};
