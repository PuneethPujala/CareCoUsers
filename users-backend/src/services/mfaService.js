/**
 * mfaService.js — TOTP-based Multi-Factor Authentication
 *
 * Uses `speakeasy` for TOTP generation/verification and `qrcode` for
 * generating scannable QR codes for authenticator apps.
 *
 * Audit items: 2.1–2.4, 2.8
 */

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const Profile = require('../models/Profile');
const Patient = require('../models/Patient');
const { logEvent, logSecurityEvent } = require('./auditService');
const redis = require('../lib/redis');

const APP_NAME = 'CareCo (CareMyMed)';

/**
 * Generate a new TOTP secret and QR code for enrollment.
 * Does NOT enable MFA yet — user must verify a code first.
 */
async function generateSecret(userId, userType) {
  const Model = userType === 'Patient' ? Patient : Profile;
  const account = await Model.findById(userId);
  if (!account) throw Object.assign(new Error('Account not found'), { status: 404 });

  if (account.mfaEnabled) {
    throw Object.assign(new Error('MFA is already enabled on this account. Disable it first to re-enroll.'), {
      status: 400,
      code: 'MFA_ALREADY_ENABLED',
    });
  }

  const secret = speakeasy.generateSecret({
    name: `${APP_NAME} (${account.email})`,
    issuer: APP_NAME,
    length: 20,
  });

  // Store the secret temporarily (not yet enabled)
  account.mfaSecret = secret.base32;
  account.mfaEnabled = false;
  await account.save();

  // Generate QR code as data URL
  const otpauthUrl = secret.otpauth_url;
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  return {
    secret: secret.base32,
    qrCode: qrDataUrl,
    otpauthUrl,
  };
}

/**
 * Verify a TOTP code and enable MFA if correct.
 * This is the enrollment verification step.
 */
async function verifyAndEnable(userId, userType, code, req) {
  const Model = userType === 'Patient' ? Patient : Profile;
  const account = await Model.findById(userId).select('+mfaSecret');
  if (!account) throw Object.assign(new Error('Account not found'), { status: 404 });

  if (!account.mfaSecret) {
    throw Object.assign(new Error('No MFA enrollment in progress. Please start setup first.'), {
      status: 400,
      code: 'MFA_NOT_ENROLLED',
    });
  }

  if (account.mfaEnabled) {
    throw Object.assign(new Error('MFA is already enabled.'), { status: 400, code: 'MFA_ALREADY_ENABLED' });
  }

  const verified = speakeasy.totp.verify({
    secret: account.mfaSecret,
    encoding: 'base32',
    token: code,
    window: 1, // Allow 1 step drift (30 seconds each side)
  });

  if (!verified) {
    await logSecurityEvent(
      userType === 'Patient' ? account.supabase_uid : account.supabaseUid,
      'mfa_enable_failed',
      'medium',
      'Invalid TOTP code during MFA enrollment',
      req
    );
    throw Object.assign(new Error('Invalid verification code. Please try again.'), {
      status: 400,
      code: 'INVALID_MFA_CODE',
    });
  }

  // Generate recovery codes
  const recoveryCodes = Array.from({ length: 8 }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );

  account.mfaEnabled = true;
  account.mfaRecoveryCodes = recoveryCodes;
  await account.save();

  const subject = userType === 'Patient' ? account.supabase_uid : account.supabaseUid;
  await logEvent(subject, 'mfa_enabled', userType === 'Patient' ? 'patient' : 'profile', account._id, req);

  return {
    message: 'MFA enabled successfully',
    recoveryCodes,
  };
}

/**
 * Verify a TOTP code during login (post-password step).
 */
async function verifyCode(userId, userType, code) {
  const Model = userType === 'Patient' ? Patient : Profile;
  const account = await Model.findById(userId).select('+mfaSecret +mfaRecoveryCodes');
  if (!account) throw Object.assign(new Error('Account not found'), { status: 404 });

  if (!account.mfaEnabled || !account.mfaSecret) {
    throw Object.assign(new Error('MFA is not enabled on this account'), { status: 400 });
  }

  // Check if it's a recovery code
  if (code.length === 8 && account.mfaRecoveryCodes?.includes(code.toUpperCase())) {
    // Consume the recovery code (single-use)
    account.mfaRecoveryCodes = account.mfaRecoveryCodes.filter(c => c !== code.toUpperCase());
    await account.save();
    return { valid: true, method: 'recovery_code' };
  }

  // Check if TOTP code was already used (Replay Protection)
  const replayKey = `totp_used:${userId}:${code}`;
  if (redis.status === 'ready' || redis.status === 'connecting') {
    const used = await redis.get(replayKey);
    if (used) return { valid: false };
  }

  // Standard TOTP verification
  const verified = speakeasy.totp.verify({
    secret: account.mfaSecret,
    encoding: 'base32',
    token: code,
    window: 1,
  });

  if (!verified) {
    return { valid: false };
  }

  // Mark token as used to prevent replay within the valid window (90s)
  if (redis.status === 'ready' || redis.status === 'connecting') {
    await redis.set(replayKey, '1', 'EX', 90);
  }

  return { valid: true, method: 'totp' };
}

/**
 * Disable MFA on an account. Requires password verification (done by caller).
 */
async function disable(userId, userType, req) {
  const Model = userType === 'Patient' ? Patient : Profile;
  const account = await Model.findById(userId);
  if (!account) throw Object.assign(new Error('Account not found'), { status: 404 });

  account.mfaEnabled = false;
  account.mfaSecret = undefined;
  account.mfaRecoveryCodes = undefined;
  await account.save();

  const subject = userType === 'Patient' ? account.supabase_uid : account.supabaseUid;
  await logEvent(subject, 'mfa_disabled', userType === 'Patient' ? 'patient' : 'profile', account._id, req);

  return { message: 'MFA has been disabled' };
}

/**
 * Check if a user has MFA enabled.
 */
async function hasMfa(userId, userType) {
  const Model = userType === 'Patient' ? Patient : Profile;
  const account = await Model.findById(userId).select('mfaEnabled');
  return !!account?.mfaEnabled;
}

module.exports = {
  generateSecret,
  verifyAndEnable,
  verifyCode,
  disable,
  hasMfa,
};
