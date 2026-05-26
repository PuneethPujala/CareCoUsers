const rateLimit = require('express-rate-limit');

// General strict rate limiter for OTP endpoints (IP-based)
const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Limit each IP to 5 OTP requests per `windowMs`
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

module.exports = {
  otpRateLimiter,
};
