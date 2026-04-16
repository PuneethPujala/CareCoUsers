const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const RefreshToken = require('../models/RefreshToken');

function assertSecrets() {
  if (!jwtConfig.accessSecret) {
    throw new Error('JWT_ACCESS_SECRET (or JWT_SECRET) must be set');
  }
}

function signAccessToken(payload) {
  assertSecrets();
  return jwt.sign(payload, jwtConfig.accessSecret, {
    expiresIn: jwtConfig.accessExpiresIn,
    issuer: 'careconnect-api',
    audience: 'careconnect-clients',
  });
}

function verifyAccessToken(token) {
  assertSecrets();
  return jwt.verify(token, jwtConfig.accessSecret, {
    issuer: 'careconnect-api',
    audience: 'careconnect-clients',
  });
}

function generateRawRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function getRefreshExpiryDate() {
  return new Date(Date.now() + jwtConfig.refreshExpiresMs);
}

/**
 * Issue access JWT + opaque refresh token (stored hashed).
 */
async function issueTokenPair({ userId, userType, subject, role, email, emailVerified }, req) {
  const accessPayload = {
    sub: subject,
    typ: userType === 'Patient' ? 'patient' : 'profile',
    role: role || undefined,
    email,
    ev: !!emailVerified,
  };

  const accessToken = signAccessToken(accessPayload);
  const rawRefresh = generateRawRefreshToken();
  const expiresAt = getRefreshExpiryDate();

  await RefreshToken.createForUser({
    rawToken: rawRefresh,
    userId,
    userType,
    subject,
    expiresAt,
    req,
  });

  return {
    access_token: accessToken,
    refresh_token: rawRefresh,
    expires_in: parseExpiresInSeconds(jwtConfig.accessExpiresIn),
    expires_at: Math.floor(Date.now() / 1000) + parseExpiresInSeconds(jwtConfig.accessExpiresIn),
  };
}

function parseExpiresInSeconds(expr) {
  if (typeof expr === 'number' && !Number.isNaN(expr)) return expr;
  const s = String(expr).trim();
  const m = /^(\d+)([smhd])$/i.exec(s);
  if (!m) return 900;
  const n = parseInt(m[1], 10);
  const u = m[2].toLowerCase();
  const mult = u === 's' ? 1 : u === 'm' ? 60 : u === 'h' ? 3600 : 86400;
  return n * mult;
}

async function revokeAllForUser(userId, userType) {
  await RefreshToken.updateMany(
    { userId, userType, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

async function revokeRefreshToken(rawToken) {
  const tokenHash = RefreshToken.hashToken(rawToken);
  await RefreshToken.updateOne(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRawRefreshToken,
  issueTokenPair,
  revokeAllForUser,
  revokeRefreshToken,
  getRefreshExpiryDate,
  parseExpiresInSeconds,
};
