const express = require('express');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const Profile = require('../models/Profile');
const Organization = require('../models/Organization');
const AuditLog = require('../models/AuditLog');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { checkPasswordChange } = require('../middleware/checkPasswordChange');
const { logEvent, logSecurityEvent } = require('../services/auditService');
const { sendTempPasswordEmail, sendPasswordChangedEmail } = require('../services/emailService');

const router = express.Router();

// ─── Helper: generate temp password (4 uppercase + 4 digits) ────
function generateTempPassword() {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  let pwd = '';
  for (let i = 0; i < 4; i++) pwd += upper[Math.floor(Math.random() * upper.length)];
  for (let i = 0; i < 4; i++) pwd += digits[Math.floor(Math.random() * digits.length)];
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
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, role, organizationId, phone } = req.body;

    // Validate required fields
    if (!email || !password || !fullName || !role) {
      return res.status(400).json({
        error: 'Missing required fields: email, password, fullName, role'
      });
    }

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
      if (!organization || !organization.isActive) {
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
 * POST /api/auth/login
 * Authenticate user (handled by Supabase, we just verify and return profile)
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    if (!role) {
      return res.status(400).json({
        error: 'Please select a role'
      });
    }

    // Step 1: Check if a profile with this email AND role exists in MongoDB
    const profile = await Profile.findOne({
      email: email.toLowerCase().trim(),
      role: role,
      isActive: true
    }).populate('organizationId', 'name type');

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
        isActive: profile.isActive,
        emailVerified: profile.emailVerified,
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
router.post('/create-user', authenticate, checkPasswordChange, async (req, res) => {
  try {
    const { email, fullName, role, organizationId } = req.body;
    const callerRole = req.profile.role;

    // Validate required fields
    if (!email || !fullName || !role) {
      return res.status(400).json({ error: 'Missing required fields: email, fullName, role' });
    }

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
      if (!org || !org.isActive) {
        return res.status(400).json({ error: 'Invalid or inactive organization' });
      }
    }

    // Generate temp password
    const tempPassword = generateTempPassword();

    // Create Supabase user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      user_metadata: { full_name: fullName, role },
      email_confirm: true, // Auto-confirm since admin is creating
    });

    if (authError) {
      await logEvent(req.profile.supabaseUid, 'create_user_failed', 'profile', null, req, {
        targetEmail: email, targetRole: role, reason: authError.message,
      });
      return res.status(400).json({ error: 'Failed to create Supabase user', details: authError.message });
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
    res.status(500).json({ error: 'Failed to create user', details: error.message });
  }
});

/**
 * POST /api/auth/change-password
 * Change password (works for both forced temp-password change and voluntary change)
 * No checkPasswordChange middleware — this IS the route that satisfies the requirement
 */
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }

    // Validate new password complexity
    const complexityErrors = validatePasswordComplexity(newPassword);
    if (complexityErrors.length > 0) {
      return res.status(400).json({ error: 'Password does not meet requirements', details: complexityErrors });
    }

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
    if (phone !== undefined) updateData.phone = phone;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

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
      profile: {
        id: profile._id,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
        organizationId: profile.organizationId,
        phone: profile.phone,
        avatarUrl: profile.avatarUrl,
        isActive: profile.isActive,
        emailVerified: profile.emailVerified
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

module.exports = router;
