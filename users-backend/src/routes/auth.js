const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { checkPasswordChange } = require('../middleware/checkPasswordChange');
const { validateRequest } = require('../middleware/validateRequest');
const authValidators = require('../validators/authValidators');

const router = express.Router();

const authWindowMs = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10);
const authMax = parseInt(process.env.AUTH_RATE_LIMIT_MAX || '60', 10);
const loginMax = parseInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX || '25', 10);

const authLimiter = rateLimit({
  windowMs: authWindowMs,
  max: authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.', code: 'RATE_LIMIT' },
});

const loginLimiter = rateLimit({
  windowMs: authWindowMs,
  max: loginMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.', code: 'RATE_LIMIT' },
});

router.use(authLimiter);

router.post(
  '/register',
  authValidators.register,
  validateRequest,
  authController.register
);

router.post('/login', loginLimiter, authValidators.login, validateRequest, authController.login);

router.post('/logout', authenticate, authController.logout);

router.post('/refresh', authValidators.refresh, validateRequest, authController.refresh);

router.post('/reset-password', authValidators.resetPassword, validateRequest, authController.resetPassword);

router.post(
  '/reset-password/verify',
  authValidators.resetPasswordVerify,
  validateRequest,
  authController.resetPasswordVerify
);

router.get('/me', authenticate, authController.me);

// SEC-FIX-9: Account deletion (GDPR/DPDPA compliance)
router.delete('/me', authenticate, authController.deleteMe);

router.post(
  '/create-user',
  authenticate,
  checkPasswordChange,
  authValidators.createUser,
  validateRequest,
  authController.createUser
);

router.post(
  '/change-password',
  authenticate,
  authValidators.changePassword,
  validateRequest,
  authController.changePassword
);

router.put(
  '/patient-city',
  authenticate,
  authValidators.patientCity,
  validateRequest,
  authController.patientCity
);

router.put(
  '/me',
  authenticate,
  checkPasswordChange,
  authValidators.updateMe,
  validateRequest,
  authorize('profile', 'update'),
  authController.updateMe
);

// BUG-7 FIX: Dedicated OTP rate limiters to prevent flooding
const otpSendLimiter = rateLimit({
  windowMs: authWindowMs,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests. Please try again later.', code: 'RATE_LIMIT' },
});

const otpVerifyLimiter = rateLimit({
  windowMs: authWindowMs,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please try again later.', code: 'RATE_LIMIT' },
});

router.post('/send-otp', otpSendLimiter, authController.sendOtp);

router.post('/verify-otp', otpVerifyLimiter, authController.verifyOtp);

router.post(
  '/set-password',
  authenticate,
  authValidators.setPassword,
  validateRequest,
  authController.setPassword
);

module.exports = router;
