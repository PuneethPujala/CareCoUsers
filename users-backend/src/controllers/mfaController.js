/**
 * mfaController.js — MFA enrollment, verification, and management endpoints
 *
 * Audit items: 2.1–2.4, 2.8, 2.9
 */

const mfaService = require('../services/mfaService');
const passwordService = require('../services/passwordService');
const tokenService = require('../services/tokenService');
const { logSecurityEvent } = require('../services/auditService');

function sendError(res, err) {
  const status = err.status || 500;
  const payload = {
    error: err.message || 'Request failed',
    ...(err.code && { code: err.code }),
  };
  return res.status(status).json(payload);
}

/**
 * POST /api/auth/mfa/setup
 * Generate TOTP secret + QR code for enrollment.
 * Requires authenticated user.
 */
async function setupMfa(req, res) {
  try {
    const isPatient = req.profile.role === 'patient';
    const userId = req.profile._id;
    const userType = isPatient ? 'Patient' : 'Profile';

    const result = await mfaService.generateSecret(userId, userType);
    res.json(result);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error('MFA setup error:', err);
    res.status(500).json({ error: 'Failed to set up MFA' });
  }
}

/**
 * POST /api/auth/mfa/verify-setup
 * Verify the first TOTP code to activate MFA.
 * Body: { code: "123456" }
 */
async function verifySetup(req, res) {
  try {
    const { code } = req.body;
    if (!code || code.length !== 6) {
      return res.status(400).json({ error: 'A 6-digit verification code is required' });
    }

    const isPatient = req.profile.role === 'patient';
    const userId = req.profile._id;
    const userType = isPatient ? 'Patient' : 'Profile';

    const result = await mfaService.verifyAndEnable(userId, userType, code, req);
    res.json(result);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error('MFA verify-setup error:', err);
    res.status(500).json({ error: 'Failed to verify MFA setup' });
  }
}

/**
 * POST /api/auth/mfa/verify
 * Verify a TOTP code during login (second factor).
 * Body: { mfa_token: "...", code: "123456" }
 *
 * The mfa_token is a short-lived JWT issued during the login step
 * when MFA is required.
 */
async function verifyLogin(req, res) {
  try {
    const { mfa_token, code } = req.body;
    if (!mfa_token || !code) {
      return res.status(400).json({ error: 'mfa_token and code are required' });
    }

    // Decode the MFA token to get user info
    const jwt = require('jsonwebtoken');
    const jwtConfig = require('../config/jwt');
    let decoded;
    try {
      decoded = jwt.verify(mfa_token, jwtConfig.secret);
    } catch {
      return res.status(401).json({ error: 'MFA token expired or invalid. Please log in again.', code: 'MFA_TOKEN_EXPIRED' });
    }

    if (decoded.purpose !== 'mfa_challenge') {
      return res.status(401).json({ error: 'Invalid MFA token', code: 'INVALID_MFA_TOKEN' });
    }

    const { userId, userType } = decoded;
    const result = await mfaService.verifyCode(userId, userType, code);

    if (!result.valid) {
      await logSecurityEvent(decoded.subject, 'mfa_verify_failed', 'medium', 'Invalid TOTP code during login', req);
      return res.status(401).json({ error: 'Invalid verification code', code: 'INVALID_MFA_CODE' });
    }

    // MFA passed — issue full token pair
    const tokens = await tokenService.issueTokenPair(
      {
        userId: decoded.userId,
        userType: decoded.userType,
        subject: decoded.subject,
        role: decoded.role,
        email: decoded.email,
        emailVerified: decoded.emailVerified,
      },
      req
    );

    const { logEvent } = require('../services/auditService');
    await logEvent(decoded.subject, 'mfa_login_success', decoded.userType === 'Patient' ? 'patient' : 'profile', decoded.userId, req, {
      method: result.method,
    });

    res.json({
      message: 'MFA verification successful',
      session: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        expires_at: tokens.expires_at,
        user: {
          id: decoded.subject,
          email: decoded.email,
          email_verified: decoded.emailVerified,
        },
      },
      profile: decoded.profileSnapshot,
    });
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error('MFA verify-login error:', err);
    res.status(500).json({ error: 'MFA verification failed' });
  }
}

/**
 * POST /api/auth/mfa/disable
 * Disable MFA. Requires current password.
 * Body: { password: "..." }
 */
async function disableMfa(req, res) {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Current password is required to disable MFA' });
    }

    const isPatient = req.profile.role === 'patient';
    const userId = req.profile._id;
    const userType = isPatient ? 'Patient' : 'Profile';
    const Model = isPatient ? require('../models/Patient') : require('../models/Profile');

    // Verify password first (2.9: MFA changes require password re-entry)
    const account = await Model.findById(userId).select('+passwordHash');
    if (!account?.passwordHash) {
      return res.status(400).json({ error: 'No password set. Cannot disable MFA without password verification.' });
    }

    const valid = await passwordService.verifyPassword(password, account.passwordHash);
    if (!valid) {
      await logSecurityEvent(
        isPatient ? account.supabase_uid : account.supabaseUid,
        'mfa_disable_failed',
        'high',
        'Incorrect password during MFA disable',
        req
      );
      return res.status(401).json({ error: 'Incorrect password', code: 'INVALID_PASSWORD' });
    }

    const result = await mfaService.disable(userId, userType, req);
    res.json(result);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error('MFA disable error:', err);
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
}

/**
 * GET /api/auth/mfa/status
 * Check if MFA is enabled for the current user.
 */
async function mfaStatus(req, res) {
  try {
    const isPatient = req.profile.role === 'patient';
    const userId = req.profile._id;
    const userType = isPatient ? 'Patient' : 'Profile';

    const enabled = await mfaService.hasMfa(userId, userType);
    res.json({ mfaEnabled: enabled });
  } catch (err) {
    console.error('MFA status error:', err);
    res.status(500).json({ error: 'Failed to get MFA status' });
  }
}

module.exports = {
  setupMfa,
  verifySetup,
  verifyLogin,
  disableMfa,
  mfaStatus,
};
