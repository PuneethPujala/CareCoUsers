const bcrypt = require('bcryptjs');
const jwtConfig = require('../config/jwt');

async function hashPassword(plain) {
  return bcrypt.hash(plain, jwtConfig.bcryptRounds);
}

async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}

/**
 * Password policy aligned with existing validatePasswordComplexity in auth routes.
 */
function validatePasswordComplexity(password) {
  const errors = [];
  if (!password || password.length < 8) errors.push('Password must be at least 8 characters');
  if (!/[A-Z]/.test(password || '')) errors.push('Password must contain at least one uppercase letter');
  if (!/[a-z]/.test(password || '')) errors.push('Password must contain at least one lowercase letter');
  if (!/[0-9]/.test(password || '')) errors.push('Password must contain at least one number');
  return errors;
}

/** Dummy hash for timing-safe path when user is missing */
const DUMMY_HASH = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYqYqYqYqYqY';

async function safeComparePassword(plain, hash) {
  const compareAgainst = hash || DUMMY_HASH;
  return verifyPassword(plain, compareAgainst);
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordComplexity,
  safeComparePassword,
  DUMMY_HASH,
};
