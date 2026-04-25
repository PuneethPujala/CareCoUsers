const express = require('express');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const Profile = require('../models/Profile');
const Organization = require('../models/Organization');
const AuditLog = require('../models/AuditLog');
const PasswordResetOtp = require('../models/PasswordResetOtp');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { checkPasswordChange } = require('../middleware/checkPasswordChange');
const { logEvent, logSecurityEvent } = require('../services/auditService');
const { sendTempPasswordEmail, sendPasswordChangedEmail, sendOtpEmail } = require('../services/emailService');
const { sendOtp: sendSmsOtp, verifyOtp: verifySmsOtp } = require('../services/smsService');
const { validateRequest } = require('../middleware/validateRequest');
const { registerSchema, loginSchema, changePasswordSchema, createUserSchema } = require('../validations/authSchemas');

const router = express.Router();

// ─── Helper: generate temp password (3 uppercase + 3 lowercase + 2 digits) ────
function generateTempPassword() {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  let pwd = '';
  for (let i = 0; i < 3; i++) pwd += upper[Math.floor(Math.random() * upper.length)];
  for (let i = 0; i < 3; i++) pwd += lower[Math.floor(Math.random() * lower.length)];
  for (let i = 0; i < 2; i++) pwd += digits[Math.floor(Math.random() * digits.length)];
  // Shuffle
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

// ─── Helper: validate password complexity ────
function validatePasswordComplexity(password) {
  const errors = [];
  if (!password || password.length < 8) errors.push('Password must be at least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
  return errors;
}

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  org_admin: 'Org Admin',
  care_manager: 'Care Manager',
  caretaker: 'Caretaker',
  caller: 'Caller',
  mentor: 'Patient Mentor',
  patient_mentor: 'Patient Mentor',
  patient: 'Patient',
};

// ─── Role creation hierarchy ────
const CREATION_HIERARCHY = {
  super_admin: ['org_admin', 'care_manager', 'caretaker', 'caller', 'mentor', 'patient'],
  org_admin: ['care_manager', 'caretaker', 'caller', 'mentor'],
  care_manager: ['caretaker', 'caller'],
};

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * POST /api/auth/register
 * Register a new user (creates Supabase user and MongoDB profile)
 */
router.post('/register', validateRequest(registerSchema), async (req, res) => {
  try {
    const { email, password, fullName, role, organizationId, phone } = req.body;

    // Validate role
    const validRoles = ['patient', 'patient_mentor', 'caretaker', 'care_manager', 'org_admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: 'Invalid role. Must be one of: ' + validRoles.join(', ')
      });
    }

    // For org_admin and care_manager roles, organizationId is required
    if ((role === 'org_admin' || role === 'care_manager') && !organizationId) {
      return res.status(400).json({
        error: 'Organization ID is required for org_admin and care_manager roles'
      });
    }

    // Verify organization exists if provided
    if (organizationId) {
      const organization = await Organization.findById(organizationId);
      if (!organization || organization.isActive === false) {
        return res.status(400).json({
          error: 'Invalid or inactive organization'
        });
      }
    }

    // Create user in Supabase
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: {
        full_name: fullName,
        role: role
      },
      email_confirm: true // Set to false in production to require email verification
    });

    if (authError) {
      await logEvent('anonymous', 'registration_failed', 'profile', null, req, {
        email,
        role,
        reason: authError.message
      });

      return res.status(400).json({
        error: 'Failed to create user in Supabase',
        details: authError.message
      });
    }

    // Create profile in MongoDB
    const profile = new Profile({
      supabaseUid: authData.user.id,
      email,
      fullName,
      role,
      organizationId: organizationId || null,
      phone: phone || null,
      emailVerified: true // Set based on Supabase email verification status
    });

    await profile.save();

    // Update organization user counts if applicable
    if (organizationId) {
      await Organization.findByIdAndUpdate(organizationId, {
        $inc: {
          ...(role === 'patient' && { currentPatientCount: 1 }),
          ...(role === 'caretaker' && { currentCaretakerCount: 1 })
        }
      });
    }

    // Log successful registration
    await logEvent(authData.user.id, 'profile_created', 'profile', profile._id, req, {
      email,
      role,
      organizationId
    });

    // Invalidate dashboard caches so new stats reflect immediately
    const { invalidateCache, CacheKeys } = require('../config/redis');
    await invalidateCache(CacheKeys.adminDashboard());
    if (organizationId) {
      await invalidateCache(CacheKeys.orgDashboard(organizationId));
    }

    // Return user data without sensitive information
    const { password: _, ...userResponse } = authData.user;
    res.status(201).json({
      message: 'User registered successfully',
      user: userResponse,
      profile: {
        id: profile._id,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
        organizationId: profile.organizationId,
        isActive: profile.isActive
      }
    });

  } catch (error) {
    console.error('Registration error:', error);

    await logEvent('anonymous', 'registration_failed', 'profile', null, req, {
      error: error.message
    });

    res.status(500).json({
      error: 'Registration failed',
      details: error.message
    });
  }
});

/**
 * POST /api/auth/detect-role
 * Detect user's role from MongoDB by email — used by Admin Portal for auto-login
 */
router.post('/detect-role', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const profile = await Profile.findOne({
      email: email.toLowerCase().trim(),
      isActive: true
    });

    if (!profile) {
      return res.status(404).json({ error: 'No account found with this email.', code: 'PROFILE_NOT_FOUND' });
    }

    res.json({ role: profile.role, email: profile.email });
  } catch (error) {
    console.error('Detect role error:', error);
    res.status(500).json({ error: 'Failed to detect role' });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user (handled by Supabase, we just verify and return profile)
 */
router.post('/login', validateRequest(loginSchema), async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Step 1: Check if a profile with this email AND role exists in MongoDB
    const profile = await Profile.findOne({
      email: email.toLowerCase().trim(),
      role: role,
      isActive: true
    }).populate('organizationId', 'name type isActive');

    if (!profile) {
      // Check if the email exists at all with a different role
      const existingProfile = await Profile.findOne({
        email: email.toLowerCase().trim(),
        isActive: true
      });

      if (existingProfile) {
        return res.status(403).json({
          error: `No account found for role "${ROLE_LABELS[role] || role}". Please select the correct role.`,
          code: 'ROLE_MISMATCH',
          hint: 'Please select the role that was assigned to your account.'
        });
      }

      return res.status(403).json({
        error: 'No account found with this email. Please contact your administrator.',
        code: 'PROFILE_NOT_FOUND'
      });
    }

    // Check if organization is suspended
    if (profile.organizationId && profile.organizationId.isActive === false && role !== 'super_admin') {
      return res.status(403).json({
        error: 'Your organization is deactivated. It will be activated soon.',
        code: 'ORGANIZATION_SUSPENDED'
      });
    }

    // Step 2: Authenticate with Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      await logSecurityEvent('anonymous', 'login_failed', 'medium',
        `Failed login attempt for ${email}: ${authError.message}`, req);

      return res.status(401).json({
        error: 'Invalid credentials. Please check your password.',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check if account is locked
    if (profile.isLocked) {
      await logSecurityEvent(authData.user.id, 'login_failed', 'high',
        'Account is locked', req);

      return res.status(423).json({
        error: 'Account is temporarily locked',
        code: 'ACCOUNT_LOCKED',
        lockedUntil: profile.accountLockedUntil
      });
    }

    // Reset failed login attempts on successful login
    if (profile.failedLoginAttempts > 0) {
      await profile.resetFailedLogin();
    }

    // Log successful login
    await logEvent(authData.user.id, 'login', 'profile', profile._id, req, {
      role: profile.role,
      organizationId: profile.organizationId?._id
    });

    res.json({
      message: 'Login successful',
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_in: authData.session.expires_in,
        user: {
          id: authData.user.id,
          email: authData.user.email,
          email_verified: authData.user.email_confirmed_at !== null
        }
      },
      profile: {
        id: profile._id,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
        organizationId: profile.organizationId,
        phone: profile.phone || null,
        isActive: profile.isActive,
        emailVerified: profile.emailVerified,
        phoneVerified: profile.phoneVerified || false,
        mustChangePassword: profile.mustChangePassword || false
      }
    });

  } catch (error) {
    console.warn('Login error:', error?.message);

    res.status(500).json({
      error: 'Login failed',
      details: error.message
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout user (invalidate Supabase session)
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { error } = await supabase.auth.admin.signOut(req.user.id, 'global');

    if (error) {
      console.error('Supabase logout error:', error);
    }

    // Log logout
    await logEvent(req.profile.supabaseUid, 'logout', 'profile', req.profile._id, req);

    res.json({ message: 'Logout successful' });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      details: error.message
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        error: 'Refresh token is required'
      });
    }

    // Refresh token with Supabase
    const { data: authData, error: authError } = await supabase.auth.refreshSession({ refresh_token });

    if (authError) {
      return res.status(401).json({
        error: 'Invalid or expired refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }

    // Get updated profile
    const profile = await Profile.findOne({
      supabaseUid: authData.user.id,
      isActive: true
    });

    if (!profile) {
      return res.status(403).json({
        error: 'Profile not found or account deactivated',
        code: 'PROFILE_NOT_FOUND'
      });
    }

    res.json({
      message: 'Token refreshed successfully',
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_in: authData.session.expires_in
      },
      profile: {
        id: profile._id,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
        organizationId: profile.organizationId,
        isActive: profile.isActive
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Token refresh failed',
      details: error.message
    });
  }
});

/**
 * POST /api/auth/reset-password
 * Request password reset (sends email via Supabase)
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Email is required'
      });
    }

    // Check if user exists in our system
    const profile = await Profile.findOne({ email, isActive: true });
    if (!profile) {
      // Don't reveal that user doesn't exist
      return res.json({
        message: 'If an account with this email exists, a password reset link has been sent'
      });
    }

    // Send password reset email via Supabase
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password`
    });

    if (error) {
      console.error('Password reset error:', error);
      return res.status(500).json({
        error: 'Failed to send password reset email',
        details: error.message
      });
    }

    // Log password reset request
    await logEvent(profile.supabaseUid, 'password_reset', 'profile', profile._id, req);

    res.json({
      message: 'If an account with this email exists, a password reset link has been sent'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      error: 'Password reset failed',
      details: error.message
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile (authenticated endpoint)
 * Note: No checkPasswordChange — users must always be able to fetch their profile
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const profile = await Profile.findById(req.profile._id)
      .populate('organizationId', 'name type subscriptionPlan');

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        email_verified: req.user.email_confirmed_at !== null,
        created_at: req.user.created_at
      },
      profile: {
        id: profile._id,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
        organizationId: profile.organizationId,
        phone: profile.phone,
        avatarUrl: profile.avatarUrl,
        isActive: profile.isActive,
        emailVerified: profile.emailVerified,
        phoneVerified: profile.phoneVerified || false,
        lastLoginAt: profile.lastLoginAt,
        twoFactorEnabled: profile.twoFactorEnabled,
        metadata: profile.metadata,
        mustChangePassword: profile.mustChangePassword || false,
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile', details: error.message });
  }
});

/**
 * POST /api/auth/create-user
 * Admin creates a user with a temporary password
 * Hierarchy: super_admin → org_admin, org_admin → care_manager, care_manager → caretaker
 */
router.post('/create-user', authenticate, checkPasswordChange, validateRequest(createUserSchema), async (req, res) => {
  try {
    const { email, fullName, role, organizationId } = req.body;
    const callerRole = req.profile.role;

    // Validate creation hierarchy
    const allowedTargetRoles = CREATION_HIERARCHY[callerRole];
    if (!allowedTargetRoles || !allowedTargetRoles.includes(role)) {
      return res.status(403).json({
        error: `Role '${callerRole}' cannot create role '${role}'`,
        code: 'ROLE_HIERARCHY_VIOLATION',
      });
    }

    // For org_admin and care_manager targets, use caller's org if not provided
    const targetOrgId = organizationId || req.profile.organizationId || null;
    // Org is required for care_manager/caretaker but optional for org_admin (can be assigned later)
    if (['care_manager', 'caretaker'].includes(role) && !targetOrgId) {
      return res.status(400).json({ error: 'Organization ID is required for this role' });
    }

    // Verify organization exists if needed
    if (targetOrgId) {
      const Organization = require('../models/Organization');
      const org = await Organization.findById(targetOrgId);
      if (!org || org.isActive === false) {
        return res.status(400).json({ error: 'Invalid or inactive organization' });
      }
    }

    // Check if a profile with this email already exists in MongoDB
    const existingProfile = await Profile.findOne({ email: email.toLowerCase().trim() });
    if (existingProfile) {
      // If existing profile is soft-deleted (isActive: false), purge it completely so email can be reused
      if (existingProfile.isActive === false) {
        // Hard delete from Supabase first
        if (existingProfile.supabaseUid) {
          await supabase.auth.admin.deleteUser(existingProfile.supabaseUid).catch(() => {});
        }
        // Hard delete from MongoDB
        await existingProfile.deleteOne();
        console.log(`Purged soft-deleted profile for ${email} to allow recreation`);
      } else {
        return res.status(400).json({ error: `A user with the email "${email}" already exists and is active.` });
      }
    }

    // Generate temp password
    const tempPassword = generateTempPassword();

    // Try to create the Supabase user. If it fails due to duplicate, clean up orphan and retry once.
    let authData, authError;
    const createPayload = {
      email,
      password: tempPassword,
      user_metadata: { full_name: fullName, role },
      email_confirm: true,
    };

    ({ data: authData, error: authError } = await supabase.auth.admin.createUser(createPayload));

    // If duplicate in Supabase (orphaned user), delete it and retry once
    if (authError && (authError.message || '').toLowerCase().includes('already')) {
      // Look up the orphaned Supabase user by listing with a small page
      const { data: listData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });
      const orphan = listData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase().trim());
      if (orphan) {
        await supabase.auth.admin.deleteUser(orphan.id).catch(() => {});
        console.log(`Purged orphaned Supabase user for ${email}`);
        // Retry creation
        ({ data: authData, error: authError } = await supabase.auth.admin.createUser(createPayload));
      }
    }

    if (authError) {
      await logEvent(req.profile.supabaseUid, 'create_user_failed', 'profile', null, req, {
        targetEmail: email, targetRole: role, reason: authError.message,
      });

      let userMessage = 'Failed to create user account';
      const msg = (authError.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('duplicate') || msg.includes('exists') || msg.includes('unique')) {
        userMessage = 'A user with this email address already exists in the authentication system. Please contact support.';
      } else if (msg.includes('invalid email') || msg.includes('email')) {
        userMessage = 'The email address provided is invalid.';
      } else if (msg.includes('password')) {
        userMessage = 'The password does not meet the minimum requirements.';
      }

      console.warn('Create user Supabase error:', authError.message);
      return res.status(400).json({ error: userMessage });
    }

    // Hash temp password for history
    const hashedTemp = await bcrypt.hash(tempPassword, 12);

    // Create MongoDB profile
    const profile = new Profile({
      supabaseUid: authData.user.id,
      email,
      fullName,
      role,
      organizationId: targetOrgId || null,
      mustChangePassword: true,
      passwordHistory: [hashedTemp],
      createdBy: req.profile._id,
      emailVerified: true,
    });
    await profile.save();

    // Send temp password email (non-blocking)
    sendTempPasswordEmail(email, fullName, tempPassword, ROLE_LABELS[role] || role);

    // Audit log
    await logEvent(req.profile.supabaseUid, 'create_user', 'profile', profile._id, req, {
      targetEmail: email, targetRole: role, createdByRole: callerRole,
    });

    // --- [START] ROUND-ROBIN RECONCILIATION for new callers ---
    // When a new caller joins, auto-assign any unassigned patients in their org
    if (['caller', 'caretaker'].includes(role) && targetOrgId) {
      try {
        const Patient = require('../models/Patient');
        const CaretakerPatient = require('../models/CaretakerPatient');

        // Find all patients in this org that have NO active caretaker assignment
        const assignedPatientIds = await CaretakerPatient.find({ status: 'active' }).distinct('patientId');
        const unassignedPatients = await Patient.find({
          organization_id: targetOrgId,
          is_active: true,
          _id: { $nin: assignedPatientIds }
        });

        if (unassignedPatients.length > 0) {
          // Get all active callers in this org (including the newly created one)
          const allCallers = await Profile.find({
            organizationId: targetOrgId,
            role: { $in: ['caller', 'caretaker'] },
            isActive: { $ne: false }
          });

          if (allCallers.length > 0) {
            // Get current assignment counts per caller
            const callerIds = allCallers.map(c => c._id);
            const counts = await CaretakerPatient.aggregate([
              { $match: { caretakerId: { $in: callerIds }, status: 'active' } },
              { $group: { _id: '$caretakerId', count: { $sum: 1 } } }
            ]);
            const countMap = {};
            counts.forEach(d => { countMap[d._id.toString()] = d.count; });

            // Assign each unassigned patient to the least-loaded caller
            for (const patient of unassignedPatients) {
              let bestCaller = allCallers[0];
              let bestCount = countMap[bestCaller._id.toString()] || 0;
              for (const c of allCallers) {
                const cc = countMap[c._id.toString()] || 0;
                if (cc < bestCount) { bestCount = cc; bestCaller = c; }
              }

              if (bestCount < 30) {
                await CaretakerPatient.findOneAndUpdate(
                  { caretakerId: bestCaller._id, patientId: patient._id },
                  {
                    caretakerId: bestCaller._id,
                    patientId: patient._id,
                    assignedBy: req.profile._id,
                    status: 'active',
                    notes: [{ content: 'System Auto-Assigned (Reconciliation) on new caller creation', addedBy: req.profile._id }],
                    schedule: { startDate: new Date() }
                  },
                  { upsert: true, new: true, setDefaultsOnInsert: true }
                );
                
                // Sync with Patient model for users app visibility
                patient.assigned_caller_id = bestCaller._id;
                patient.caller_id = bestCaller._id;
                await patient.save();

                countMap[bestCaller._id.toString()] = (countMap[bestCaller._id.toString()] || 0) + 1;
                console.log(`[Reconciliation] Patient ${patient.name} → Caller ${bestCaller.fullName}`);
              }
            }
          }
        }
      } catch (reconErr) {
        console.error('[Reconciliation] Failed silently:', reconErr.message);
      }
    }
    // --- [END] ROUND-ROBIN RECONCILIATION ---

    // Invalidate dashboard caches to reflect new user count immediately
    const { invalidateCache, CacheKeys } = require('../config/redis');
    await invalidateCache(CacheKeys.adminDashboard());
    if (targetOrgId) {
      await invalidateCache(CacheKeys.orgDashboard(targetOrgId));
    }

    res.status(201).json({
      message: `${ROLE_LABELS[role] || role} account created successfully. Temporary password sent to ${email}.`,
      profile: {
        id: profile._id,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
        organizationId: profile.organizationId,
      },
    });
  } catch (error) {
    console.warn('Create user error:', error?.message);

    // Handle MongoDB duplicate key error
    if (error.code === 11000 || error.message?.includes('E11000')) {
      return res.status(400).json({ error: 'A user with this email address already exists.' });
    }

    res.status(500).json({ error: 'Failed to create user. Please try again.' });
  }
});

/**
 * POST /api/auth/change-password
 * Change password (works for both forced temp-password change and voluntary change)
 * No checkPasswordChange middleware — this IS the route that satisfies the requirement
 */
router.post('/change-password', authenticate, validateRequest(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Verify current password by attempting Supabase sign-in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: req.profile.email,
      password: currentPassword,
    });
    if (signInError) {
      await logSecurityEvent(req.profile.supabaseUid, 'password_change_failed', 'medium',
        'Incorrect current password during password change', req);
      return res.status(401).json({ error: 'Current password is incorrect', code: 'INVALID_CURRENT_PASSWORD' });
    }

    // Check new password is not same as current
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    // Check new password not in last 3 password history
    const profile = await Profile.findById(req.profile._id).select('+passwordHistory');
    if (profile.passwordHistory && profile.passwordHistory.length > 0) {
      for (const oldHash of profile.passwordHistory) {
        const matches = await bcrypt.compare(newPassword, oldHash);
        if (matches) {
          return res.status(400).json({
            error: 'Cannot reuse any of your last 3 passwords',
            code: 'PASSWORD_REUSE',
          });
        }
      }
    }

    // Update Supabase password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      req.user.id,
      { password: newPassword }
    );
    if (updateError) {
      return res.status(500).json({ error: 'Failed to update password', details: updateError.message });
    }

    // Hash new password and update MongoDB
    const newHash = await bcrypt.hash(newPassword, 12);
    const history = [...(profile.passwordHistory || []), newHash].slice(-3);

    await Profile.findByIdAndUpdate(req.profile._id, {
      passwordHistory: history,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    });

    // Sign out all Supabase sessions
    await supabase.auth.admin.signOut(req.user.id, 'global');

    // Send confirmation email (non-blocking)
    sendPasswordChangedEmail(req.profile.email, req.profile.fullName);

    // Audit log
    await logEvent(req.profile.supabaseUid, 'password_changed', 'profile', req.profile._id, req, {
      forced: req.profile.mustChangePassword,
    });

    res.json({ message: 'Password changed successfully. Please log in again.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password', details: error.message });
  }
});

/**
 * PUT /api/auth/me
 * Update current user profile
 */
router.put('/me', authenticate, checkPasswordChange, authorize('profile', 'update'), async (req, res) => {
  try {
    const { fullName, phone, avatarUrl } = req.body;
    const updateData = {};

    if (fullName !== undefined) updateData.fullName = fullName;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

    // If phone number changed, reset phoneVerified so user must re-verify
    if (phone !== undefined) {
      const currentProfile = await Profile.findById(req.profile._id).select('phone phoneVerified');
      updateData.phone = phone;
      if (phone !== currentProfile.phone) {
        updateData.phoneVerified = false;
        console.log(`📱 Phone changed for ${req.profile.email}: re-verification required`);
      }
    }

    const profile = await Profile.findByIdAndUpdate(
      req.profile._id,
      updateData,
      { new: true, runValidators: true }
    ).populate('organizationId', 'name type');

    // Log profile update
    await logEvent(req.profile.supabaseUid, 'profile_updated', 'profile', profile._id, req, {
      updatedFields: Object.keys(updateData)
    });

    res.json({
      message: 'Profile updated successfully',
      phoneChanged: updateData.phoneVerified === false,
      profile: {
        id: profile._id,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
        organizationId: profile.organizationId,
        phone: profile.phone,
        avatarUrl: profile.avatarUrl,
        isActive: profile.isActive,
        emailVerified: profile.emailVerified,
        phoneVerified: profile.phoneVerified || false,
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      details: error.message
    });
  }
});

/**
 * POST /api/auth/google-login
 * Handle login after Google OAuth — verify Supabase token, look up MongoDB profile
 * The frontend performs Google OAuth → exchanges id_token with Supabase → sends access_token here
 */
router.post('/google-login', async (req, res) => {
  try {
    const { access_token, refresh_token } = req.body;

    if (!access_token) {
      return res.status(400).json({ error: 'access_token is required' });
    }

    // Step 1: Verify the token with Supabase and get the user
    const { data: { user }, error: userError } = await supabase.auth.getUser(access_token);

    if (userError || !user) {
      console.warn('Google login token verification failed:', userError?.message);
      return res.status(401).json({
        error: 'Invalid or expired token. Please try signing in again.',
        code: 'INVALID_TOKEN'
      });
    }

    const email = user.email;
    if (!email) {
      return res.status(400).json({ error: 'No email associated with this Google account.' });
    }

    console.log(`[API] Google login: ${email}`);

    // Step 2: Look up MongoDB profile by supabaseUid or email
    let profile = await Profile.findOne({
      supabaseUid: user.id,
      isActive: true
    }).populate('organizationId', 'name type');

    // Fallback: match by email if supabaseUid doesn't match
    // (handles case where admin was created before Google was linked)
    if (!profile) {
      profile = await Profile.findOne({
        email: email.toLowerCase().trim(),
        isActive: true
      }).populate('organizationId', 'name type');

      // Link the supabaseUid if we found by email
      if (profile) {
        profile.supabaseUid = user.id;
        await profile.save();
      }
    }

    if (!profile) {
      return res.status(403).json({
        error: 'No admin account found for this Google account. Please contact your administrator.',
        code: 'PROFILE_NOT_FOUND'
      });
    }

    // Step 3: Verify it's an admin role
    const ADMIN_ROLES = ['super_admin', 'org_admin', 'care_manager', 'caretaker', 'caller'];
    if (!ADMIN_ROLES.includes(profile.role)) {
      return res.status(403).json({
        error: `Access denied. The role "${ROLE_LABELS[profile.role] || profile.role}" is not permitted on the Admin Portal.`,
        code: 'ROLE_NOT_ALLOWED'
      });
    }

    // Step 4: Log successful login
    await logEvent(user.id, 'login', 'profile', profile._id, req, {
      method: 'google_oauth',
      role: profile.role,
      organizationId: profile.organizationId?._id
    });

    // Step 5: Return session + profile (same format as /api/auth/login)
    res.json({
      message: 'Login successful',
      session: {
        access_token,
        refresh_token: refresh_token || null,
        user: {
          id: user.id,
          email: user.email,
          email_verified: user.email_confirmed_at !== null
        }
      },
      profile: {
        id: profile._id,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
        organizationId: profile.organizationId,
        isActive: profile.isActive,
        emailVerified: profile.emailVerified,
        mustChangePassword: false // Google auth bypasses password change requirement
      }
    });

  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({
      error: 'Google login failed. Please try again.',
      details: error.message
    });
  }
});

// ─── Forgot Password: Send OTP ────
const ADMIN_ROLES_FORGOT = ['super_admin', 'org_admin', 'care_manager', 'caretaker', 'caller'];
const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

/**
 * POST /api/auth/forgot-password/send-otp
 * Generate a 6-digit OTP, store it hashed, and email it to the admin.
 */
router.post('/forgot-password/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Please enter your email address.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find admin profile by email
    const profile = await Profile.findOne({
      email: normalizedEmail,
      isActive: true,
    });

    if (!profile) {
      return res.status(404).json({
        error: 'No admin account found with this email address. Please check and try again.',
      });
    }

    if (!ADMIN_ROLES_FORGOT.includes(profile.role)) {
      return res.status(403).json({
        error: 'Password reset is only available for admin accounts. Please contact your administrator.',
      });
    }

    // Rate limit: don't send more than 1 OTP per minute to the same email
    const recentOtp = await PasswordResetOtp.findOne({
      email: normalizedEmail,
      used: false,
      createdAt: { $gte: new Date(Date.now() - 60 * 1000) }, // last 60 seconds
    });

    if (recentOtp) {
      return res.status(429).json({
        error: 'An OTP was already sent recently. Please wait a moment before requesting a new one.',
      });
    }

    // Invalidate any existing unused OTPs for this email
    await PasswordResetOtp.updateMany(
      { email: normalizedEmail, used: false },
      { $set: { used: true } }
    );

    // Generate 6-digit OTP
    const otpPlain = String(Math.floor(100000 + Math.random() * 900000));
    const otpHashed = await bcrypt.hash(otpPlain, 10);

    // Store in MongoDB with expiry
    await PasswordResetOtp.create({
      email: normalizedEmail,
      otp: otpHashed,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
    });

    // Send email
    await sendOtpEmail(normalizedEmail, profile.fullName, otpPlain);

    console.log(`[Forgot Password] OTP sent to ${normalizedEmail}`);

    res.json({
      message: `A 6-digit OTP has been sent to ${normalizedEmail}. It is valid for ${OTP_EXPIRY_MINUTES} minutes.`,
    });

  } catch (error) {
    console.error('Forgot password send-otp error:', error);
    res.status(500).json({
      error: 'Failed to send OTP. Please try again later.',
    });
  }
});

/**
 * POST /api/auth/forgot-password/verify-otp
 * Verify the OTP without consuming it — called in step 2 before showing the password form.
 */
router.post('/forgot-password/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required.' });
    }

    if (otp.length !== 6) {
      return res.status(400).json({ error: 'Please enter a valid 6-digit OTP.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find the latest unused, non-expired OTP
    const otpRecord = await PasswordResetOtp.findOne({
      email: normalizedEmail,
      used: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(400).json({
        error: 'OTP has expired or was already used. Please request a new one.',
        code: 'OTP_EXPIRED',
      });
    }

    // Check max attempts
    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      otpRecord.used = true;
      await otpRecord.save();
      return res.status(400).json({
        error: 'Too many incorrect attempts. Please request a new OTP.',
        code: 'OTP_MAX_ATTEMPTS',
      });
    }

    // Verify OTP hash
    const isMatch = await bcrypt.compare(otp, otpRecord.otp);

    if (!isMatch) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      const remaining = MAX_OTP_ATTEMPTS - otpRecord.attempts;
      return res.status(400).json({
        error: `Invalid OTP. Please check and try again. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        code: 'OTP_INVALID',
      });
    }

    // OTP is valid — don't mark as used yet (reset endpoint will do that)
    res.json({ message: 'OTP verified successfully.', verified: true });

  } catch (error) {
    console.error('Forgot password verify-otp error:', error);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

/**
 * POST /api/auth/forgot-password/reset
 * Verify OTP and reset the password in Supabase + MongoDB.
 */
router.post('/forgot-password/reset', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP, and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find the profile
    const profile = await Profile.findOne({
      email: normalizedEmail,
      isActive: true,
    });

    if (!profile) {
      return res.status(404).json({
        error: 'No admin account found with this email address.',
      });
    }

    // Find the latest unused OTP for this email
    const otpRecord = await PasswordResetOtp.findOne({
      email: normalizedEmail,
      used: false,
      expiresAt: { $gt: new Date() }, // not expired
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(400).json({
        error: 'OTP has expired or was already used. Please request a new one.',
        code: 'OTP_EXPIRED',
      });
    }

    // Check max attempts
    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      otpRecord.used = true;
      await otpRecord.save();
      return res.status(400).json({
        error: 'Too many incorrect attempts. Please request a new OTP.',
        code: 'OTP_MAX_ATTEMPTS',
      });
    }

    // Verify OTP
    const isMatch = await bcrypt.compare(otp, otpRecord.otp);

    if (!isMatch) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      const remaining = MAX_OTP_ATTEMPTS - otpRecord.attempts;
      return res.status(400).json({
        error: `Invalid OTP. Please check and try again. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        code: 'OTP_INVALID',
      });
    }

    // OTP is valid — mark as used
    otpRecord.used = true;
    await otpRecord.save();

    // Update password in Supabase
    const { error: supaError } = await supabase.auth.admin.updateUserById(
      profile.supabaseUid,
      { password: newPassword }
    );

    if (supaError) {
      console.error('Supabase password update error:', supaError);
      return res.status(500).json({
        error: 'Failed to update password. Please try again.',
      });
    }

    // Update MongoDB profile
    profile.mustChangePassword = false;
    profile.passwordChangedAt = new Date();
    await profile.save();

    // Send confirmation email
    await sendPasswordChangedEmail(normalizedEmail, profile.fullName);

    // Audit log
    await logEvent(profile.supabaseUid, 'password_reset', 'profile', profile._id, req, {
      method: 'email_otp',
    });

    console.log(`[Forgot Password] Password reset successful for ${normalizedEmail}`);

    res.json({
      message: 'Password has been reset successfully. You can now sign in with your new password.',
    });

  } catch (error) {
    console.error('Forgot password reset error:', error);
    res.status(500).json({
      error: 'Failed to reset password. Please try again later.',
    });
  }
});

/**
 * GET /api/auth/google-callback
 * OAuth trampoline — Supabase redirects here after Google sign-in.
 * This page reads the token hash fragment and redirects to the Expo app deep link.
 * The app redirect URL is computed from the request IP + EXPO_DEV_PORT env var.
 */
router.get('/google-callback', (req, res) => {
  // Compute the app deep link URL from the request's host IP
  // req.hostname gets the host from the Host header (dynamic, no hardcoded IP)
  const host = req.hostname || req.socket?.remoteAddress || 'localhost';
  const expoPort = process.env.EXPO_DEV_PORT || '8081';
  const appRedirect = `exp://${host}:${expoPort}/--/auth/callback`;

  console.log(`[OAuth Trampoline] Redirecting to app: ${appRedirect}`);

  res.send(`<!DOCTYPE html>
<html>
<head><title>Redirecting...</title></head>
<body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:system-ui;color:#333;">
  <div style="text-align:center">
    <p style="font-size:18px">✅ Signed in! Redirecting to app...</p>
    <p style="font-size:13px;color:#888">If nothing happens, close this window and reopen the app.</p>
  </div>
  <script>
    var hash = window.location.hash;
    var appUrl = "${appRedirect}";
    if (hash) {
      window.location.href = appUrl + hash;
    } else {
      var query = window.location.search;
      if (query) {
        window.location.href = appUrl + query;
      } else {
        document.body.innerHTML = '<div style="text-align:center;padding:40px"><p>Authentication complete.</p><p>Please return to the app.</p></div>';
      }
    }
  </script>
</body>
</html>`);
});

// ── Phone Verification Routes ──────────────────────────────────────────

// Roles that require mandatory phone verification
const PHONE_REQUIRED_ROLES = ['org_admin', 'care_manager', 'caller'];

/**
 * POST /api/auth/phone/send-otp
 * Send OTP to user's phone number via Twilio Verify
 */
router.post('/phone/send-otp', authenticate, async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }

    // Normalize phone to E.164 format: +91XXXXXXXXXX
    let digits = phone.replace(/[^0-9]/g, '');
    if (digits.startsWith('0')) digits = digits.substring(1);
    if (digits.startsWith('91') && digits.length === 12) digits = digits.substring(2);
    
    if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits)) {
      return res.status(400).json({ 
        error: 'Invalid phone number. Please enter a valid 10-digit Indian mobile number.' 
      });
    }
    const cleaned = `+91${digits}`;

    // Check if phone is already verified by another user
    const existingUser = await Profile.findOne({ 
      phone: cleaned, 
      phoneVerified: true, 
      _id: { $ne: req.profile._id } 
    });
    if (existingUser) {
      return res.status(400).json({ 
        error: 'This phone number is already verified by another account.' 
      });
    }

    // Send OTP via Twilio Verify
    const result = await sendSmsOtp(cleaned);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Save phone to profile (unverified yet)
    await Profile.findByIdAndUpdate(req.profile._id, { phone: cleaned });

    res.json({ 
      message: 'Verification code sent successfully.', 
      status: result.status 
    });

  } catch (error) {
    console.error('Phone OTP send error:', error);
    res.status(500).json({ error: 'Failed to send verification code.' });
  }
});

/**
 * POST /api/auth/phone/verify-otp
 * Verify the OTP and mark phone as verified
 */
router.post('/phone/verify-otp', authenticate, async (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone number and verification code are required.' });
    }

    // Normalize phone to E.164
    let digits = phone.replace(/[^0-9]/g, '');
    if (digits.startsWith('0')) digits = digits.substring(1);
    if (digits.startsWith('91') && digits.length === 12) digits = digits.substring(2);
    const cleaned = `+91${digits}`;

    // Verify OTP via Twilio Verify
    const result = await verifySmsOtp(cleaned, code);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Mark phone as verified in profile
    const updatedProfile = await Profile.findByIdAndUpdate(
      req.profile._id,
      { phone: cleaned, phoneVerified: true },
      { new: true }
    );

    // Log the verification event
    await logEvent(req.profile.supabaseUid, 'phone_verified', 'profile', req.profile._id, req, {
      phone: cleaned,
    });

    res.json({ 
      message: 'Phone number verified successfully!',
      profile: updatedProfile
    });

  } catch (error) {
    console.error('Phone OTP verify error:', error);
    res.status(500).json({ error: 'Failed to verify phone number.' });
  }
});

module.exports = router;
