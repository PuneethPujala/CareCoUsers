const Joi = require('joi');

const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

const registerSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.empty': 'Email is required',
    'string.email': 'Please enter a valid email address'
  }),
  password: Joi.string().min(8).pattern(passwordPattern).required().messages({
    'string.empty': 'Password is required',
    'string.min': 'Password must be at least 8 characters long',
    'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
  }),
  fullName: Joi.string().trim().required().messages({
    'string.empty': 'Full name is required'
  }),
  role: Joi.string().valid('patient', 'patient_mentor', 'caretaker', 'care_manager', 'org_admin').required().messages({
    'any.only': 'Invalid role selected',
    'string.empty': 'Role is required'
  }),
  organizationId: Joi.string().allow(null, '').optional(),
  phone: Joi.string().allow(null, '').optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.empty': 'Email is required',
    'string.email': 'Please enter a valid email address'
  }),
  password: Joi.string().required().messages({
    'string.empty': 'Password is required'
  }),
  role: Joi.string().required().messages({
    'string.empty': 'Please select a role'
  })
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    'string.empty': 'Current password is required'
  }),
  newPassword: Joi.string().min(8).pattern(passwordPattern).required().messages({
    'string.empty': 'New password is required',
    'string.min': 'New password must be at least 8 characters long',
    'string.pattern.base': 'New password must contain at least one uppercase letter, one lowercase letter, and one number'
  })
});

const createUserSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.empty': 'Email is required',
    'string.email': 'Please enter a valid email address'
  }),
  fullName: Joi.string().trim().required().messages({
    'string.empty': 'Full name is required'
  }),
  role: Joi.string().required().messages({
    'string.empty': 'Role is required'
  }),
  organizationId: Joi.string().allow(null, '').optional()
});

module.exports = {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  createUserSchema
};
