const rateLimit = require("express-rate-limit");

// General strict rate limiter for OTP endpoints (IP-based)
const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Limit each IP to 5 OTP requests per `windowMs`
  message: { error: "Too many requests. Please try again later." },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Key generators
const aiChatKeyGenerator = (req) => {
  return req.auth?.userId || req.ip;
};

const aiChatIpKeyGenerator = (req) => {
  return req.ip;
};

const aiChatPatientKeyGenerator = (req) => {
  let targetId = req.auth?.userId || req.ip;
  if (req.auth?.userType === "Companion") {
    const companionSelectedPatientId =
      req.body?.patientId || req.query?.patientId;
    if (companionSelectedPatientId) {
      targetId = companionSelectedPatientId;
    }
  }
  return String(targetId);
};

const aiChatSessionKeyGenerator = (req) => {
  return req.auth?.userId || req.ip;
};

// Rate limiter for AI Chatbot endpoint to prevent abuse/spam (User-aware, falls back to IP)
const aiChatRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 15, // Limit each user or IP to 15 chat queries per 10 minutes
  keyGenerator: aiChatKeyGenerator,
  message: {
    error:
      "Too many chat requests. Please take a break and try again in a few minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter IP-based rate limiter for the chatbot endpoint globally
const aiChatIpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30, // Limit each IP address to 30 requests per 10 minutes globally
  keyGenerator: aiChatIpKeyGenerator,
  message: {
    error:
      "Too many chat requests from this network. Please try again in a few minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Patient-based rate limiter (resolving the target patient ID)
const aiChatPatientRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30, // Limit each patient to 30 requests per 10 minutes
  keyGenerator: aiChatPatientKeyGenerator,
  message: {
    error:
      "Too many chat requests for this patient. Please wait a few minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for chatbot session operations (create, delete)
const aiChatSessionRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 15, // Limit session operations to 15 per 10 minutes
  keyGenerator: aiChatSessionKeyGenerator,
  message: {
    error: "Too many chat session operations. Please wait a few minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  otpRateLimiter,
  aiChatRateLimiter,
  aiChatIpRateLimiter,
  aiChatPatientRateLimiter,
  aiChatSessionRateLimiter,
  _keyGenerators: {
    aiChatKeyGenerator,
    aiChatIpKeyGenerator,
    aiChatPatientKeyGenerator,
    aiChatSessionKeyGenerator,
  },
};
