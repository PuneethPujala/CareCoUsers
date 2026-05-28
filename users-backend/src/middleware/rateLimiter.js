const rateLimit = require('express-rate-limit');

// General strict rate limiter for OTP endpoints (IP-based)
const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Limit each IP to 5 OTP requests per `windowMs`
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Rate limiter for AI Chatbot endpoint to prevent abuse/spam (User-aware, falls back to IP)
const aiChatRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 15, // Limit each user or IP to 15 chat queries per 10 minutes
  keyGenerator: (req) => {
    return req.auth?.userId || req.ip;
  },
  message: { error: 'Too many chat requests. Please take a break and try again in a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  otpRateLimiter,
  aiChatRateLimiter,
};
