const crypto = require('crypto');
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
  const { email, password, fullName, city, organizationId, phone, supabaseUid } = body;
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

  // ── Cross-collection email uniqueness ─────────────────────────────────────
  // Prevent a patient from registering with an email already used by staff
  const existingStaff = await Profile.findOne({ email: emailNorm, isActive: true });
  if (existingStaff) {
    const err = new Error('This email is already associated with a staff account. Please contact your administrator.');
    err.status = 400;
    err.code = 'EMAIL_ALREADY_EXISTS';
    throw err;
  }

  // ── Merge into existing patient for OAuth ─────────────────────────────────
  // If a Google user is re-registering (e.g. profile fetch failed previously),
  // link the Supabase UID to the existing Patient record instead of creating a duplicate.
  const existingPatient = await Patient.findOne({ email: emailNorm, is_active: true });
  if (existingPatient) {
    if (isOAuth) {
      // Link the new Supabase UID to the existing record
      existingPatient.supabase_uid = supabaseUid;
      if (fullName && !existingPatient.name) existingPatient.name = fullName;
      await existingPatient.save();

      await logEvent(supabaseUid, 'patient_oauth_linked', 'patient', existingPatient._id, req, {
        email: emailNorm,
      });

      return {
        message: 'Account linked successfully',
        user: { id: supabaseUid, email: emailNorm },
        profile: {
          id: existingPatient._id,
          email: existingPatient.email,
          fullName: existingPatient.name,
          role: existingPatient.role,
          organizationId: existingPatient.organization_id,
          isActive: existingPatient.is_active,
        },
      };
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
  if (!org.canAdd('patient')) {
    const err = new Error('This organisation has reached its patient capacity');
    err.status = 400;
    throw err;
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

  return {
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
}

async function login({ email, password, role }, req) {
  if (!email || !password) {
    const err = new Error('Email and password are required');
    err.status = 400;
    err.code = 'VALIDATION';
    throw err;
  }
  if (!role) {
    const err = new Error('Please select a role');
    err.status = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  const emailNorm = email.toLowerCase().trim();
  const isPatient = role === 'patient';

  let account;
  if (isPatient) {
    account = await Patient.findOne({ email: emailNorm, is_active: true }).select('+passwordHash');
    if (!account) {
      const err = new Error('No account found with this email. Please sign up first.');
      err.status = 403;
      err.code = 'PROFILE_NOT_FOUND';
      throw err;
    }
  } else {
    const chain = Profile.findOne({
      email: emailNorm,
      role,
      isActive: true,
    }).select('+passwordHash');
    account = await chain.populate('organizationId', 'name city');

    if (!account) {
      const existingProfile = await Profile.findOne({ email: emailNorm, isActive: true });
      if (existingProfile) {
        const err = new Error(
          `No account found for role "${ROLE_LABELS[role] || role}". Please select the correct role.`
        );
        err.status = 403;
        err.code = 'ROLE_MISMATCH';
        err.hint = 'Please select the role that was assigned to your account.';
        throw err;
      }
      const err = new Error('No account found with this email. Please contact your administrator.');
      err.status = 403;
      err.code = 'PROFILE_NOT_FOUND';
      throw err;
    }
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
    const { error } = await supabase.auth.signInWithPassword({ email: emailNorm, password });
    passwordValid = !error;
    if (passwordValid) {
      account.passwordHash = await passwordService.hashPassword(password);
      await account.save();
    }
  } else {
    // Account exists but has no password (Google-only user who never set one)
    passwordValid = false;
  }

  if (!passwordValid) {
    // Give a more helpful error for Google-only accounts
    if (!account.passwordHash) {
      const err = new Error(
        'This account was created with Google Sign-In and does not have a password yet. ' +
        'Please log in with Google and set a password in your profile settings.'
      );
      err.status = 401;
      err.code = 'NO_PASSWORD_SET';
      throw err;
    }
    await account.incrementFailedLogin();
    await logSecurityEvent('anonymous', 'login_failed', 'medium', `Failed login attempt for ${emailNorm}`, req);
    const err = new Error('Invalid credentials. Please check your password.');
    err.status = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  if (account.failedLoginAttempts > 0) {
    await account.resetFailedLogin();
  }

  const subject = isPatient ? account.supabase_uid : account.supabaseUid;
  const tokens = await tokenService.issueTokenPair(
    {
      userId: account._id,
      userType: isPatient ? 'Patient' : 'Profile',
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
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!doc) {
    const err = new Error('Invalid or expired refresh token');
    err.status = 401;
    err.code = 'INVALID_REFRESH_TOKEN';
    throw err;
  }

  let account;
  let isPatient = doc.userType === 'Patient';
  if (isPatient) {
    account = await Patient.findById(doc.userId);
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
      userType: isPatient ? 'Patient' : 'Profile',
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
  await tokenService.revokeAllForUser(userId, userType);
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
  } else {
    patient.passwordHash = hash;
    await patient.save();
    await tokenService.revokeAllForUser(patient._id, 'Patient');
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

  // Cross-collection uniqueness: also check Patient collection
  const existingPatient = await Patient.findOne({ email: emailNorm, is_active: true });
  if (existingPatient) {
    const err = new Error('This email is already associated with a patient account.');
    err.status = 400;
    err.code = 'EMAIL_ALREADY_EXISTS';
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

  sendTempPasswordEmail(email, fullName, tempPassword, ROLE_LABELS[role] || role);

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

  if (!isPatient && account.passwordHistory?.length > 0) {
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

  if (!isPatient) {
    const history = [...(account.passwordHistory || []), newHash].slice(-3);
    account.passwordHistory = history;
    account.mustChangePassword = false;
    account.passwordChangedAt = new Date();
  }

  await account.save();

  await tokenService.revokeAllForUser(account._id, isPatient ? 'Patient' : 'Profile');

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
  buildSessionUser,
  getSupabaseFallback,
};
