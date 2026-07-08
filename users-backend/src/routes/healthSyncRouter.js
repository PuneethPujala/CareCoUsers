const express = require("express");
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const HealthSyncOrchestrator = require("../services/HealthSyncOrchestrator");
const HealthSyncState = require("../models/HealthSyncState");
const { authenticate } = require("../middleware/authenticate");

const router = express.Router();

// Rate limiter for health sync requests
const healthSyncRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // max 30 requests per 15 minutes
  message: { error: "Too many sync requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.profile ? req.profile._id.toString() : req.ip;
  },
});

// Validators
const syncValidators = [
  body("vitals")
    .optional()
    .isArray()
    .withMessage("vitals must be an array of readings"),
  body("vitals.*.timestamp")
    .optional()
    .notEmpty()
    .withMessage("Each vital reading must have a timestamp"),
  body("activity")
    .optional()
    .isObject()
    .withMessage("activity must be a daily summary object"),
  body("activity.date")
    .optional()
    .notEmpty()
    .withMessage("Activity data must specify a date"),
  body("body")
    .optional()
    .isObject()
    .withMessage("body composition must be an object"),
  body("body.date")
    .optional()
    .notEmpty()
    .withMessage("Body composition must specify a date"),
  body("source").optional().isString(),
  body("platform").optional().isIn(["android", "ios"]),
];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// POST /api/health/sync
// Body format: { vitals: [], activity: {}, body: {}, metadata: {}, source: 'health_connect', platform: 'android' }
router.post(
  "/sync",
  authenticate,
  healthSyncRateLimiter,
  syncValidators,
  validate,
  async (req, res) => {
    try {
      const patientId = req.profile._id.toString();

      const payload = {
        vitals: req.body.vitals,
        activity: req.body.activity,
        body: req.body.body,
        metadata: req.body.metadata,
        source: req.body.source,
        platform: req.body.platform,
      };

      const result = await HealthSyncOrchestrator.processSync(
        patientId,
        payload
      );
      res.json(result);
    } catch (err) {
      console.error("POST /api/health/sync error:", err);
      res.status(500).json({ error: "Failed to process health sync" });
    }
  }
);

// GET /api/health/sync/state
router.get("/sync/state", authenticate, async (req, res) => {
  try {
    const patientId = req.profile._id.toString();
    const state = await HealthSyncState.findOne({ patient_id: patientId });
    if (!state) {
      return res
        .status(404)
        .json({ error: "Sync state not found for this patient" });
    }
    res.json(state);
  } catch (err) {
    console.error("GET /api/health/sync/state error:", err);
    res.status(500).json({ error: "Failed to fetch sync state" });
  }
});

module.exports = router;
