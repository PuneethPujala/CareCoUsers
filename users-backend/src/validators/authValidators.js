const { body } = require('express-validator');

const register = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('fullName').trim().notEmpty().withMessage('fullName is required'),
  body('supabaseUid').optional({ nullable: true }).isString().trim(),
  body('city').optional().isString().trim(),
  body('organizationId').optional({ checkFalsy: true }).isMongoId(),
  body('phone').optional().isString().trim(),
];

const login = [
  body('email').isEmail().normalizeEmail(),
  body('password').isString().notEmpty(),
  body('role').isString().notEmpty().withMessage('Please select a role'),
];

const refresh = [body('refresh_token').isString().notEmpty()];

const resetPassword = [body('email').isEmail().normalizeEmail()];

const resetPasswordVerify = [
  body('email').isEmail().normalizeEmail(),
  body('otp').isString().notEmpty(),
  body('newPassword').isString().isLength({ min: 8 }),
];

const createUser = [
  body('email').isEmail().normalizeEmail(),
  body('fullName').trim().notEmpty(),
  body('role').isString().notEmpty(),
  body('organizationId').optional({ checkFalsy: true }).isMongoId(),
];

const changePassword = [
  body('currentPassword').isString().notEmpty(),
  body('newPassword').isString().isLength({ min: 8 }),
];

const patientCity = [body('city').trim().notEmpty()];

const updateMe = [
  body('fullName').optional().isString().trim(),
  body('phone').optional().isString().trim(),
  body('avatarUrl').optional().isString().trim(),
];

const setPassword = [body('newPassword').isString().isLength({ min: 8 })];

module.exports = {
  register,
  login,
  refresh,
  resetPassword,
  resetPasswordVerify,
  createUser,
  changePassword,
  patientCity,
  updateMe,
  setPassword,
};
