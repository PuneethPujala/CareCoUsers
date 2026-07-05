/**
 * mfaService.js — TOTP-based Multi-Factor Authentication
 *
 * Built on native Node.js crypto module and custom base32 encoding/decoding.
 * This completely avoids external library dependencies (like speakeasy or otplib)
 * and resolves any potential ESM vs CommonJS testing environment conflicts in Jest.
 *
 * Audit items: 2.1–2.4, 2.8
 */

const QRCode = require("qrcode");
const crypto = require("crypto");
const Profile = require("../models/Profile");
const Patient = require("../models/Patient");
const { logEvent, logSecurityEvent } = require("./auditService");
const redis = require("../lib/redis");

const APP_NAME = "CareMyMed (CareMyMed)";

// ── Base32 Encoding / Decoding Helpers ──────────────────────────────────────

function base32Encode(buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(str) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = str.toUpperCase().replace(/\s/g, "").replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = alphabet.indexOf(cleaned[i]);
    if (idx === -1) throw new Error("Invalid base32 character: " + cleaned[i]);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ── TOTP Algorithm (RFC 6238) ────────────────────────────────────────────────

function hotp(key, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, "0");
}

function verifyTOTP(secret, token, window = 1) {
  try {
    const key = base32Decode(secret);
    const counter = Math.floor(Date.now() / 30000);
    for (let i = -window; i <= window; i++) {
      const calculated = hotp(key, counter + i);
      if (calculated === token.toString().trim()) {
        return true;
      }
    }
  } catch (err) {
    console.error("[verifyTOTP] Error:", err.message);
  }
  return false;
}

// ── Service Endpoints ────────────────────────────────────────────────────────

/**
 * Generate a new TOTP secret and QR code for enrollment.
 * Does NOT enable MFA yet — user must verify a code first.
 */
async function generateSecret(userId, userType) {
  const Model = userType === "Patient" ? Patient : Profile;
  const account = await Model.findById(userId);
  if (!account)
    throw Object.assign(new Error("Account not found"), { status: 404 });

  if (account.mfaEnabled) {
    throw Object.assign(
      new Error(
        "MFA is already enabled on this account. Disable it first to re-enroll.",
      ),
      {
        status: 400,
        code: "MFA_ALREADY_ENABLED",
      },
    );
  }

  // Generate a random 20-byte secret and base32 encode it
  const randBytes = crypto.randomBytes(20);
  const secret = base32Encode(randBytes);

  const otpauthUrl = `otpauth://totp/${encodeURIComponent(
    APP_NAME,
  )}:${encodeURIComponent(account.email)}?secret=${secret}&issuer=${encodeURIComponent(
    APP_NAME,
  )}`;

  // Store the secret temporarily (not yet enabled)
  account.mfaSecret = secret;
  account.mfaEnabled = false;
  await account.save();

  // Generate QR code as data URL
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  return {
    secret,
    qrCode: qrDataUrl,
    otpauthUrl,
  };
}

/**
 * Verify a TOTP code and enable MFA if correct.
 * This is the enrollment verification step.
 */
async function verifyAndEnable(userId, userType, code, req) {
  const Model = userType === "Patient" ? Patient : Profile;
  const account = await Model.findById(userId).select("+mfaSecret");
  if (!account)
    throw Object.assign(new Error("Account not found"), { status: 404 });

  if (!account.mfaSecret) {
    throw Object.assign(
      new Error("No MFA enrollment in progress. Please start setup first."),
      {
        status: 400,
        code: "MFA_NOT_ENROLLED",
      },
    );
  }

  if (account.mfaEnabled) {
    throw Object.assign(new Error("MFA is already enabled."), {
      status: 400,
      code: "MFA_ALREADY_ENABLED",
    });
  }

  const verified = verifyTOTP(account.mfaSecret, code, 1);

  if (!verified) {
    await logSecurityEvent(
      userType === "Patient" ? account.supabase_uid : account.supabaseUid,
      "mfa_enable_failed",
      "medium",
      "Invalid TOTP code during MFA enrollment",
      req,
    );
    throw Object.assign(
      new Error("Invalid verification code. Please try again."),
      {
        status: 400,
        code: "INVALID_MFA_CODE",
      },
    );
  }

  // Generate recovery codes
  const recoveryCodes = Array.from({ length: 8 }, () =>
    crypto.randomBytes(4).toString("hex").toUpperCase(),
  );

  account.mfaEnabled = true;
  account.mfaRecoveryCodes = recoveryCodes;
  await account.save();

  const subject =
    userType === "Patient" ? account.supabase_uid : account.supabaseUid;
  await logEvent(
    subject,
    "mfa_enabled",
    userType === "Patient" ? "patient" : "profile",
    account._id,
    req,
  );

  return {
    message: "MFA enabled successfully",
    recoveryCodes,
  };
}

/**
 * Verify a TOTP code during login (post-password step).
 */
async function verifyCode(userId, userType, code) {
  const Model = userType === "Patient" ? Patient : Profile;
  const account = await Model.findById(userId).select(
    "+mfaSecret +mfaRecoveryCodes",
  );
  if (!account)
    throw Object.assign(new Error("Account not found"), { status: 404 });

  if (!account.mfaEnabled || !account.mfaSecret) {
    throw Object.assign(new Error("MFA is not enabled on this account"), {
      status: 400,
    });
  }

  // Check if it's a recovery code
  if (
    code.length === 8 &&
    account.mfaRecoveryCodes?.includes(code.toUpperCase())
  ) {
    // Consume the recovery code (single-use)
    account.mfaRecoveryCodes = account.mfaRecoveryCodes.filter(
      (c) => c !== code.toUpperCase(),
    );
    await account.save();
    return { valid: true, method: "recovery_code" };
  }

  // Check if TOTP code was already used (Replay Protection)
  const replayKey = `totp_used:${userId}:${code}`;
  if (redis.status === "ready" || redis.status === "connecting") {
    const used = await redis.get(replayKey);
    if (used) return { valid: false };
  }

  // Standard TOTP verification
  const verified = verifyTOTP(account.mfaSecret, code, 1);

  if (!verified) {
    return { valid: false };
  }

  // Mark token as used to prevent replay within the valid window (90s)
  if (redis.status === "ready" || redis.status === "connecting") {
    await redis.set(replayKey, "1", "EX", 90);
  }

  return { valid: true, method: "totp" };
}

/**
 * Disable MFA on an account. Requires password verification (done by caller).
 */
async function disable(userId, userType, req) {
  const Model = userType === "Patient" ? Patient : Profile;
  const account = await Model.findById(userId);
  if (!account)
    throw Object.assign(new Error("Account not found"), { status: 404 });

  account.mfaEnabled = false;
  account.mfaSecret = undefined;
  account.mfaRecoveryCodes = undefined;
  await account.save();

  const subject =
    userType === "Patient" ? account.supabase_uid : account.supabaseUid;
  await logEvent(
    subject,
    "mfa_disabled",
    userType === "Patient" ? "patient" : "profile",
    account._id,
    req,
  );

  return { message: "MFA has been disabled" };
}

/**
 * Check if a user has MFA enabled.
 */
async function hasMfa(userId, userType) {
  const Model = userType === "Patient" ? Patient : Profile;
  const account = await Model.findById(userId).select("mfaEnabled");
  return !!account?.mfaEnabled;
}

module.exports = {
  generateSecret,
  verifyAndEnable,
  verifyCode,
  disable,
  hasMfa,
};
