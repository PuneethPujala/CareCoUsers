const Caller = require('../models/Caller');
const Profile = require('../models/Profile');
const Patient = require('../models/Patient');
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
    // Surface a more specific message for common infra errors
    if (err.name === 'MongooseServerSelectionError' || err.name === 'MongoServerError') {
      return res.status(503).json({ error: 'Our servers are temporarily busy. Please try again in a moment.', code: 'SERVICE_UNAVAILABLE' });
    }
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return res.status(504).json({ error: 'The request timed out. Please try again.', code: 'TIMEOUT' });
    }
    res.status(500).json({ error: 'Registration failed. Please try again or contact support.', code: 'REGISTRATION_FAILED' });
  }
}

async function login(req, res) {
  try {
    const data = await authService.login(req.body, req);
    res.json(data);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error('Login error:', err);
    // Surface a more specific message for common infra errors
    if (err.name === 'MongooseServerSelectionError' || err.name === 'MongoServerError') {
      return res.status(503).json({ error: 'Our servers are temporarily busy. Please try again in a moment.', code: 'SERVICE_UNAVAILABLE' });
    }
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return res.status(504).json({ error: 'The request timed out. Please try again.', code: 'TIMEOUT' });
    }
    res.status(500).json({ error: 'Login failed. Please try again or contact support.', code: 'LOGIN_FAILED' });
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
    const subject = req.auth?.subject || req.profile?.supabaseUid || req.profile?.supabase_uid;

    if (isPatient) {
      // Hard-delete: permanently remove ALL patient data
      const CallLog = require('../models/CallLog');
      const MedicineLog = require('../models/MedicineLog');
      const VitalLog = require('../models/VitalLog');
      const Notification = require('../models/Notification');
      const RefreshToken = require('../models/RefreshToken');
      const AIVitalPrediction = require('../models/AIVitalPrediction');
      const Medication = require('../models/Medication');

      // Delete all associated records
      await Promise.all([
        CallLog.deleteMany({ patient_id: userId }),
        MedicineLog.deleteMany({ patient_id: userId }),
        VitalLog.deleteMany({ patient_id: userId }),
        Notification.deleteMany({ patient_id: userId }),
        RefreshToken.deleteMany({ userId, userType: 'Patient' }),
        AIVitalPrediction.deleteMany({ patient_id: userId }),
        Medication.deleteMany({ patientId: userId }),
      ]);

      // Delete the patient record itself — frees email & phone for re-registration
      await Patient.findByIdAndDelete(userId);

      await logEvent(subject, 'account_hard_deleted', 'patient', userId, req, {
        permanent: true,
        purgedCollections: ['CallLog', 'MedicineLog', 'VitalLog', 'Notification', 'RefreshToken', 'AIVitalPrediction', 'Patient'],
      });
    } else {
      await Profile.findByIdAndDelete(userId);
      const RefreshToken = require('../models/RefreshToken');
      await RefreshToken.deleteMany({ userId, userType: 'Profile' });
      await logEvent(subject, 'account_hard_deleted', 'profile', userId, req, { permanent: true });
    }

    // Revoke all sessions LAST (so the auth validation for the above operations succeeds)
    await authService.logout(subject, userId, isPatient ? 'Patient' : 'Profile', req);

    res.json({ message: 'Account permanently deleted. You may register again with the same email.' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
}

async function deactivateMe(req, res) {
  try {
    const isPatient = req.profile.role === 'patient';
    const userId = req.profile._id;
    const subject = req.auth?.subject || req.profile?.supabaseUid || req.profile?.supabase_uid;

    if (isPatient) {
      await Patient.findByIdAndUpdate(userId, {
        is_active: false,
        deactivated_at: new Date(),
        deactivated_reason: 'user_requested',
      });
      await logEvent(subject, 'account_deactivated', 'patient', userId, req);
    } else {
      await Profile.findByIdAndUpdate(userId, {
        isActive: false,
      });
      await logEvent(subject, 'account_deactivated', 'profile', userId, req);
    }

    // Revoke all sessions so user is logged out
    await authService.logout(subject, userId, isPatient ? 'Patient' : 'Profile', req);

    res.json({ message: 'Account deactivated. Your data is preserved — log in anytime to reactivate.' });
  } catch (err) {
    console.error('Deactivate account error:', err);
    res.status(500).json({ error: 'Failed to deactivate account' });
  }
}

// SEC-FIX-16: GDPR/DPDPA Data Portability
async function exportMyData(req, res) {
  try {
    const isPatient = req.profile.role === 'patient';
    const exported = { exportedAt: new Date().toISOString(), format: 'JSON' };

    if (isPatient) {
      const Patient = require('../models/Patient');
      const CallLog = require('../models/CallLog');
      const MedicineLog = require('../models/MedicineLog');
      const VitalLog = require('../models/VitalLog');

      const patient = await Patient.findById(req.profile._id).lean();
      // Strip internal fields
      delete patient.passwordHash;
      delete patient.__v;

      const calls = await CallLog.find({ patient_id: patient._id }).select('-__v').lean();
      const medicines = await MedicineLog.find({ patient_id: patient._id }).select('-__v').lean();
      const vitals = await VitalLog.find({ patient_id: patient._id }).select('-__v').lean();

      exported.profile = patient;
      exported.callLogs = calls;
      exported.medicineLogs = medicines;
      exported.vitalLogs = vitals;
    } else {
      const profile = await Profile.findById(req.profile._id).select('-passwordHash -__v -passwordHistory').lean();
      exported.profile = profile;
    }

    await logEvent(req.user.id, 'data_exported', isPatient ? 'patient' : 'profile', req.profile._id, req);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="careco-export-${Date.now()}.json"`);
    res.json(exported);
  } catch (err) {
    console.error('Export data error:', err);
    res.status(500).json({ error: 'Failed to export data' });
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

    if (req.auth?.userType === 'Patient') {
      const patientUpdate = {};
      if (updateData.fullName !== undefined) patientUpdate.name = updateData.fullName;
      if (updateData.phone !== undefined) patientUpdate.phone = updateData.phone;
      await Patient.findByIdAndUpdate(req.profile._id, patientUpdate, { new: true, runValidators: true });
      return res.json({ message: 'Profile updated successfully' });
    }

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
      const emailNorm = identifier.toLowerCase().trim();
      // NOTE: We intentionally do NOT block "already registered" emails here.
      // The registerPatient() endpoint has its own robust duplicate handling
      // (OAuth linking, deactivation detection, E11000 dedup). Blocking here
      // was preventing users with partial/incomplete signups from retrying.

      const { createOTP } = require('../services/otpService');
      const { sendOTPEmail } = require('../services/emailService');
      const otp = await createOTP(emailNorm);
      sendOTPEmail(identifier, otp).catch((err) => console.error('OTP email failed:', err.message));
      res.json({ message: 'Verification code sent to your email.' });
    } else if (type === 'phone') {
      const phoneNorm = identifier.trim();
      // Remove +91 or + if present for DB count just in case, but let's stick to strict match first
      // Assuming DB stores +91... format
      let searchPhone = phoneNorm;
      if (!searchPhone.startsWith('+')) searchPhone = `+91${searchPhone.replace(/^91/, '')}`;
      
      const phoneCount = await Patient.countDocuments({ phone: phoneNorm, is_active: true });
      if (phoneCount >= 5) {
        return res.status(400).json({ 
          error: '5 accounts already exist with this number. Please delete an old account to use this number.',
          code: 'PHONE_LIMIT_REACHED'
        });
      }

      const smsService = require('../services/smsService');
      
      // Use Twilio Verify - no need to generate or store our own OTP
      await smsService.sendVerification(phoneNorm);
      
      res.json({ 
        message: 'Verification code sent to your phone.',
        remainingSlots: 5 - phoneCount
      });
    } else {
      return res.status(400).json({ error: 'type must be "email" or "phone"' });
    }
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(400).json({ error: err.message || 'Failed to send verification code' });
  }
}

async function verifyOtp(req, res) {
  try {
    const { identifier, otp, type } = req.body;
    if (!identifier || !otp) {
      return res.status(400).json({ error: 'identifier and otp are required' });
    }

    let result;
    if (type === 'phone') {
      const smsService = require('../services/smsService');
      result = await smsService.checkVerification(identifier.trim(), otp);
    } else {
      const { verifyOTP } = require('../services/otpService');
      const key = identifier.toLowerCase().trim();
      result = await verifyOTP(key, otp);
    }

    if (!result.valid) {
      return res.status(400).json({ error: result.reason });
    }

    // For phone login: look up the patient and issue a session
    if (type === 'phone') {
      const phoneNorm = identifier.trim();
      // Phone may be stored with or without +91 country code — support both
      const phoneVariants = [phoneNorm];
      if (phoneNorm.startsWith('+91')) phoneVariants.push(phoneNorm.slice(3));
      else phoneVariants.push(`+91${phoneNorm}`);

      const patient = await Patient.findOne({ phone: { $in: phoneVariants }, is_active: true });

      // If deactivated by user request, reactivate on login
      let reactivated = false;
      let activePatient = patient;
      if (!patient) {
        const deactivated = await Patient.findOne({ phone: { $in: phoneVariants }, is_active: false, deactivated_reason: 'user_requested' });
        if (deactivated) {
          deactivated.is_active = true;
          deactivated.deactivated_at = undefined;
          deactivated.deactivated_reason = undefined;
          await deactivated.save();
          activePatient = deactivated;
          reactivated = true;
        }
      }

      if (!activePatient) {
        // Phone not registered — OTP was valid but no account exists
        return res.json({ message: 'Verification successful', verified: true });
      }

      const tokenService = require('../services/tokenService');
      const subject = activePatient.supabase_uid || activePatient._id.toString();
      const tokens = await tokenService.issueTokenPair(
        {
          userId: activePatient._id,
          userType: 'Patient',
          subject,
          role: 'patient',
          email: activePatient.email,
          emailVerified: activePatient.emailVerified,
        },
        req
      );

      if (reactivated) {
        await logEvent(subject, 'account_reactivated', 'patient', activePatient._id, req, { method: 'phone_otp' });
      }
      await logEvent(subject, 'login', 'patient', activePatient._id, req, { method: 'phone_otp' });

      return res.json({
        message: 'Login successful',
        verified: true,
        session: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          expires_at: tokens.expires_at,
          user: { id: subject, email: activePatient.email },
        },
        profile: {
          id: activePatient._id,
          email: activePatient.email,
          fullName: activePatient.name,
          role: 'patient',
          organizationId: activePatient.organization_id,
          isActive: activePatient.is_active,
          emailVerified: activePatient.emailVerified,
          subscription_status: activePatient.subscription?.status || 'pending_payment',
        },
      });
    }

    res.json({ message: 'Verification successful', verified: true });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(400).json({ error: err.message || 'Verification failed' });
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
  deactivateMe,
  exportMyData,
};
