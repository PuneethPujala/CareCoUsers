const Caller = require('../models/Caller');
const Profile = require('../models/Profile');
const authService = require('../services/authService');
const { logEvent } = require('../services/auditService');

function sendError(res, err) {
  const status = err.status || 500;
  const payload = {
    error: err.message || 'Request failed',
    ...(err.code && { code: err.code }),
    ...(err.details && { details: err.details }),
    ...(err.hint && { hint: err.hint }),
    ...(err.lockedUntil && { lockedUntil: err.lockedUntil }),
  };
  if (status >= 500 && process.env.NODE_ENV !== 'development') {
    payload.error = 'An unexpected error occurred';
    delete payload.details;
  }
  return res.status(status).json(payload);
}

async function register(req, res) {
  try {
    const data = await authService.registerPatient(req.body, req);
    res.status(201).json(data);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
}

async function login(req, res) {
  try {
    const data = await authService.login(req.body, req);
    res.json(data);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
}

async function logout(req, res) {
  try {
    const subject = req.auth?.subject || req.profile?.supabaseUid || req.profile?.supabase_uid;
    const userId = req.profile._id;
    const userType = req.profile.role === 'patient' ? 'Patient' : 'Profile';
    await authService.logout(subject, userId, userType, req);
    res.json({ message: 'Logout successful' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
}

async function deleteMe(req, res) {
  try {
    const isPatient = req.profile.role === 'patient';
    const userId = req.profile._id;
    const { logEvent } = require('../services/auditService');

    // SEC-FIX-9: Account Deletion (DPDPA/GDPR)
    // We soft-delete to preserve referring medical records but remove all PII and access.
    if (isPatient) {
      const Patient = require('../models/Patient');
      await Patient.findByIdAndUpdate(userId, { 
        name: 'Deleted User', email: `deleted_${userId}@samvaya.com`, 
        phone: '', is_active: false 
      });
      await logEvent(req.user.id, 'account_deleted', 'patient', userId, req, { softDelete: true });
    } else {
      const Profile = require('../models/Profile');
      await Profile.findByIdAndUpdate(userId, { 
        fullName: 'Deleted User', email: `deleted_${userId}@samvaya.com`, 
        phone: '', isActive: false 
      });
      await logEvent(req.user.id, 'account_deleted', 'profile', userId, req, { softDelete: true });
    }

    // Revoke all sessions
    const subject = req.auth?.subject || req.profile?.supabaseUid || req.profile?.supabase_uid;
    await authService.logout(subject, userId, isPatient ? 'Patient' : 'Profile', req);

    res.json({ message: 'Account securely deleted' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
}

async function refresh(req, res) {
  try {
    const raw = req.body.refresh_token;
    const data = await authService.refreshSession(raw, req);
    res.json(data);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error('Token refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
}

async function resetPassword(req, res) {
  try {
    const data = await authService.requestPasswordReset(req.body.email, req);
    res.json(data);
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error: 'Password reset failed' });
  }
}

async function resetPasswordVerify(req, res) {
  try {
    const data = await authService.verifyPasswordReset(req.body, req);
    res.json(data);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error('Reset password verify error:', err);
    res.status(500).json({ error: 'Password reset failed' });
  }
}

async function me(req, res) {
  try {
    const isPatient = req.profile.role === 'patient';

    if (isPatient) {
      const patient = req.profile;
      // BUG-6 FIX: Load passwordHash to expose hasPassword flag (never expose the hash itself)
      const patientWithHash = await Patient.findById(patient._id).select('+passwordHash');
      res.json({
        user: {
          id: req.user.id,
          email: req.user.email,
          email_verified: !!req.user.email_confirmed_at,
          created_at: req.user.created_at || patient.created_at,
        },
        profile: {
          id: patient._id,
          email: patient.email,
          fullName: patient.name,
          role: 'patient',
          organizationId: patient.organization_id,
          phone: patient.phone,
          avatarUrl: patient.avatar_url,
          isActive: patient.is_active,
          emailVerified: patient.emailVerified,
          lastLoginAt: patient.lastLoginAt,
          subscription_status: patient.subscription?.status || 'pending_payment',
          hasPassword: !!patientWithHash?.passwordHash,
        },
      });
      return;
    }

    const profile = await Profile.findById(req.profile._id)
      .select('+passwordHash')
      .populate('organizationId', 'name city subscriptionPlan');

    let subscriptionStatus = null;
    if (profile.role === 'caller') {
      let caller = await Caller.findOne({ supabase_uid: req.user.id });

      if (!caller && req.user.email) {
        caller = await Caller.findOne({ email: req.user.email.toLowerCase().trim() });
      }

      if (caller && caller.supabase_uid !== req.user.id) {
        caller.supabase_uid = req.user.id;
        await caller.save();
      }
    }

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        email_verified: !!req.user.email_confirmed_at,
        created_at: req.user.created_at,
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
        subscription_status: subscriptionStatus,
        hasPassword: !!profile.passwordHash,
      },
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
}

async function createUser(req, res) {
  try {
    const data = await authService.createStaffUser(req.body, req, req.profile);
    res.status(201).json(data);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.warn('Create user error:', err?.message);
    if (err.code === 11000 || err.message?.includes('E11000')) {
      return res.status(400).json({ error: 'A user with this email address already exists.' });
    }
    res.status(500).json({ error: 'Failed to create user. Please try again.' });
  }
}

async function changePassword(req, res) {
  try {
    const subject = req.auth?.subject || req.profile.supabaseUid || req.profile.supabase_uid;
    const data = await authService.changePassword(req.body, req, req.profile, subject);
    res.json(data);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
}

async function patientCity(req, res) {
  try {
    const { city } = req.body;
    if (!city) {
      return res.status(400).json({ error: 'City is required' });
    }

    const Patient = require('../models/Patient');
    const Organization = require('../models/Organization');

    const patient = await Patient.findOneAndUpdate(
      { supabase_uid: req.user.id },
      { city },
      { new: true }
    );

    if (!patient) {
      return res.status(404).json({ error: 'Patient record not found' });
    }

    const org = await Organization.findOne({ city, isActive: true });
    if (org && org._id.toString() !== patient.organization_id?.toString()) {
      patient.organization_id = org._id;
      await patient.save();
    }

    await logEvent(req.user.id, 'patient_city_updated', 'patient', patient._id, req, { city });

    res.json({
      message: 'City updated successfully',
      city: patient.city,
      organizationId: patient.organization_id,
    });
  } catch (err) {
    console.error('Update patient city error:', err);
    res.status(500).json({ error: 'Failed to update city' });
  }
}

async function updateMe(req, res) {
  try {
    const { fullName, phone, avatarUrl } = req.body;
    const updateData = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (phone !== undefined) updateData.phone = phone;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

    const profile = await Profile.findByIdAndUpdate(req.profile._id, updateData, {
      new: true,
      runValidators: true,
    }).populate('organizationId', 'name city');

    await logEvent(req.profile.supabaseUid, 'profile_updated', 'profile', profile._id, req, {
      updatedFields: Object.keys(updateData),
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
        emailVerified: profile.emailVerified,
      },
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

async function sendOtp(req, res) {
  try {
    const { identifier, type } = req.body;
    if (!identifier || !type) {
      return res.status(400).json({ error: 'identifier and type (email/phone) are required' });
    }

    if (type === 'email') {
      const { createOTP } = require('../services/otpService');
      const { sendOTPEmail } = require('../services/emailService');
      const otp = await createOTP(identifier.toLowerCase().trim());
      sendOTPEmail(identifier, otp).catch((err) => console.error('OTP email failed:', err.message));
      res.json({ message: 'Verification code sent to your email.' });
    } else if (type === 'phone') {
      const redis = require('../lib/redis');
      const key = `otp:${identifier.trim()}`;
      await redis.del(key);
      
      if (process.env.NODE_ENV === 'production') {
        // SEC-FIX-7: Hardcoded OTP disabled in production for security.
        // TODO: Integrate actual SMS provider (Twilio/MSG91) here.
        return res.status(501).json({ error: 'SMS verification is not configured for production yet.' });
      }

      await redis.set(key, '123456', 'EX', 600);
      res.json({ message: 'Verification code sent to your phone.' });
    } else {
      return res.status(400).json({ error: 'type must be "email" or "phone"' });
    }
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
}

async function verifyOtp(req, res) {
  try {
    const { identifier, otp, type } = req.body;
    if (!identifier || !otp) {
      return res.status(400).json({ error: 'identifier and otp are required' });
    }

    const { verifyOTP } = require('../services/otpService');
    const key = type === 'phone' ? identifier.trim() : identifier.toLowerCase().trim();
    const result = await verifyOTP(key, otp);

    if (!result.valid) {
      return res.status(400).json({ error: result.reason });
    }

    res.json({ message: 'Verification successful', verified: true });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
}

async function setPassword(req, res) {
  try {
    const subject = req.auth?.subject || req.profile.supabaseUid || req.profile.supabase_uid;
    const data = await authService.setPassword(req.body.newPassword, req, req.profile, subject);
    res.json(data);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error('Set password error:', err);
    res.status(500).json({ error: 'Failed to set password' });
  }
}

module.exports = {
  register,
  login,
  logout,
  refresh,
  resetPassword,
  resetPasswordVerify,
  me,
  createUser,
  changePassword,
  patientCity,
  updateMe,
  sendOtp,
  verifyOtp,
  setPassword,
  deleteMe,
};
