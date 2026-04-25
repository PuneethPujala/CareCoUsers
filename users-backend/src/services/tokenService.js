const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const RefreshToken = require('../models/RefreshToken');
const redis = require('../lib/redis');

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

async function revokeAllSessionsGlobally(userId) {
  const key = `user_invalidated_before:${userId}`;
  const nowUnix = Math.floor(Date.now() / 1000);
  const ttl = parseExpiresInSeconds(jwtConfig.accessExpiresIn);
  try {
    await redis.set(key, nowUnix, 'EX', ttl);
  } catch (err) {
    console.warn(`Failed to set global invalidation for ${userId}:`, err.message);
  }
}

async function denylistAccessToken(token) {
  if (!token) return;
  const ttl = parseExpiresInSeconds(jwtConfig.accessExpiresIn);
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const key = `denylist:jwt:${hash}`;
  try {
    await redis.set(key, '1', 'EX', ttl);
  } catch (err) {
    console.warn('Failed to denylist JWT:', err.message);
  }
}

async function checkRedisSessionValidity(token, payload) {
  if (redis.status !== 'ready' && redis.status !== 'connecting') return true;
  
  // Check global user invalidation (all sessions prior to X)
  const userId = payload.sub || ''; 
  const globalKey = `user_invalidated_before:${userId}`;
  const globalTimestamp = await redis.get(globalKey);
  if (globalTimestamp && payload.iat && payload.iat < parseInt(globalTimestamp, 10)) {
    return false;
  }
  
  // Check specific token denylist
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const denylistKey = `denylist:jwt:${hash}`;
  const isDenylisted = await redis.get(denylistKey);
  if (isDenylisted) {
    return false;
  }
  
  return true;
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRawRefreshToken,
  issueTokenPair,
  revokeAllForUser,
  revokeAllSessionsGlobally,
  denylistAccessToken,
  checkRedisSessionValidity,
  revokeRefreshToken,
  getRefreshExpiryDate,
  parseExpiresInSeconds,
};
