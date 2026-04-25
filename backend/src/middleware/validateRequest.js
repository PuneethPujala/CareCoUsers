const Joi = require('joi');

/**
 * Middleware to validate request body, query, or params against a Joi schema
 * @param {Joi.ObjectSchema} schema - The Joi schema to validate against
 * @param {string} source - The request property to validate ('body', 'query', 'params'). Defaults to 'body'.
 */
const validateRequest = (schema, source = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false, // Return all errors
      stripUnknown: true, // Remove unknown keys
    });

    if (error) {
      // Map Joi errors to a cleaner format: { field: "message" }
      const errors = {};
      error.details.forEach((detail) => {
        const key = detail.path.join('.');
        if (!errors[key]) {
          errors[key] = detail.message.replace(/['"]/g, ''); // Clean up quotes in messages
        }
      });

      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    }

    // Replace request property with validated/stripped value
    req[source] = value;
    next();
  };
};

module.exports = { validateRequest };
