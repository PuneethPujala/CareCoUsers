const redis = require("../lib/redis");
const crypto = require("crypto");

const OTP_PREFIX = "otp:";
const OTP_TTL_SECONDS = 300; // 5 minutes

/**
 * Generate a cryptographically secure 6-digit OTP
 */
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Acquire a cooldown lock for a given key to prevent spamming
 */
async function acquireCooldown(key, seconds = 60) {
  const cooldownKey = `cooldown:${key.toLowerCase().trim()}`;
  const acquired = await redis.set(cooldownKey, "1", "EX", seconds, "NX");
  return !!acquired;
}

/**
 * Store an OTP for the given identifier (email or phone)
 * - Deletes any previous OTP for the same identifier
 * - Stores the new OTP with a 5-minute TTL
 */
async function createOTP(identifier) {
  const key = `${OTP_PREFIX}${identifier.toLowerCase().trim()}`;
  const acquired = await acquireCooldown(key, 60);

  if (!acquired) {
    const err = new Error(
      "Please wait 1 minute before requesting a new code.",
    );
    err.status = 429;
    throw err;
  }

  const otp = generateOTP();

  // Overwrite any existing OTP with the new one
  await redis.set(key, otp, "EX", OTP_TTL_SECONDS);

  console.log(`🔐 OTP created securely (expires in ${OTP_TTL_SECONDS}s)`);
  return otp;
}

/**
 * Verify the OTP for a given identifier
 * - Returns true if valid, false otherwise
 * - Deletes the OTP after successful verification (one-time use)
 */
async function verifyOTP(identifier, code) {
  const key = `${OTP_PREFIX}${identifier.toLowerCase().trim()}`;
  const stored = await redis.get(key);

  if (!stored) {
    return {
      valid: false,
      reason: "OTP expired or not found. Please request a new one.",
    };
  }

  if (stored !== code.toString()) {
    return { valid: false, reason: "Invalid OTP. Please check and try again." };
  }

  // Delete after successful verification
  await redis.del(key);
  console.log(`✅ OTP verified successfully`);
  return { valid: true };
}

/**
 * Delete any existing OTP for the identifier (used on resend)
 */
async function deleteOTP(identifier) {
  const key = `${OTP_PREFIX}${identifier.toLowerCase().trim()}`;
  await redis.del(key);
}

module.exports = {
  generateOTP,
  createOTP,
  verifyOTP,
  deleteOTP,
  acquireCooldown,
};
