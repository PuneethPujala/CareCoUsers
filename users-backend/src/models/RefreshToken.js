const mongoose = require('mongoose');
const crypto = require('crypto');

const RefreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userType: {
      type: String,
      required: true,
      enum: ['Profile', 'Patient'],
    },
    /** Stable auth subject (matches Profile.supabaseUid / Patient.supabase_uid) */
    subject: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    replacedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RefreshToken',
      default: null,
    },
    userAgent: { type: String },
    ipAddress: { type: String },
  },
  { timestamps: true }
);

RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

function hashRefreshToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

RefreshTokenSchema.statics.hashToken = hashRefreshToken;

RefreshTokenSchema.statics.createForUser = async function createForUser({
  rawToken,
  userId,
  userType,
  subject,
  expiresAt,
  req,
}) {
  const tokenHash = hashRefreshToken(rawToken);
  return this.create({
    tokenHash,
    userId,
    userType,
    subject,
    expiresAt,
    userAgent: req?.headers?.['user-agent'],
    ipAddress: req?.ip,
  });
};

module.exports = mongoose.model('RefreshToken', RefreshTokenSchema);
