const Patient = require('../models/Patient');
const logger = require('../utils/logger');

const requireSubscription = async (req, res, next) => {
  try {
    let profile = req.profile;
    let isPatient = false;

    if (profile) {
      isPatient =
        req.auth?.userType === 'Patient' ||
        profile.constructor.modelName === 'Patient';
    } else if (req.auth && req.auth.subject) {
      const patient = await Patient.findOne({ supabase_uid: req.auth.subject });
      if (patient) {
        profile = patient;
        isPatient = true;
        req.profile = patient;
      }
    }

    if (isPatient && profile) {
      const status = profile.subscription?.status;
      const expiresAt = profile.subscription?.expires_at;
      const isExpired = expiresAt && new Date(expiresAt) < new Date();

      if (status !== 'active' || isExpired) {
        logger.warn('Subscription check failed', {
          patientId: profile._id,
          status,
          expiresAt,
          isExpired,
        });
        return res.status(402).json({
          error: 'Active subscription required to access this feature.',
          code: 'SUBSCRIPTION_REQUIRED',
        });
      }
    }

    next();
  } catch (error) {
    logger.error('requireSubscription middleware error', {
      error: error.message,
    });
    return res
      .status(500)
      .json({ error: 'Internal server error verifying subscription status' });
  }
};

module.exports = requireSubscription;
