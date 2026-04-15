/**
 * JWT and password hashing configuration (env-driven).
 */
module.exports = {
  accessSecret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || '',
  refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || '',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  /** bcrypt cost factor */
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  /** Express duration string parsed for refresh token document expiry */
  refreshExpiresMs: parseInt(process.env.JWT_REFRESH_EXPIRES_MS || String(7 * 24 * 60 * 60 * 1000), 10),
};
