const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const Patient = require('../models/Patient');
const VitalsIngestionService = require('../services/vitalsIngestionService');

const router = express.Router();

// ─── Sync-specific rate limiter ─────────────────────────────────
// Max 10 sync requests per hour per patient (IP-based here; can be tightened later)
const syncRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: { error: 'Sync rate limit exceeded. Maximum 10 syncs per hour.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Use patient ID if available (set by auth middleware), fallback to IP
        return req.patientId || req.ip;
    },
});

// ─── Auth middleware for sync endpoint ──────────────────────────
// Extracts patient_id from the Supabase JWT (same pattern as existing user routes)
const { createClient } = require('@supabase/supabase-js');

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
        );
    }
    return _supabase;
}

async function authenticatePatient(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const supabase = getSupabase();
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

        // Find the patient by their Supabase UID
        const patient = await Patient.findOne({ supabase_uid: user.id }).select('_id name');
        if (!patient) {
            return res.status(404).json({ error: 'Patient record not found' });
        }

        req.patientId = patient._id.toString();
        req.patientName = patient.name;
        next();
    } catch (err) {
        console.error('Auth middleware error:', err.message);
        return res.status(500).json({ error: 'Authentication failed' });
    }
}

// ─── Validation ─────────────────────────────────────────────────
const syncValidators = [
    body('readings')
        .isArray({ min: 1, max: 100 })
        .withMessage('readings must be an array of 1–100 items'),
    body('readings.*.timestamp')
        .notEmpty()
        .withMessage('Each reading must have a timestamp'),
    body('readings.*.heart_rate')
        .notEmpty()
        .isFloat({ min: 30, max: 250 })
        .withMessage('heart_rate must be 30–250 bpm'),
    body('source')
        .optional()
        .isIn(['health_connect', 'healthkit'])
        .withMessage('source must be health_connect or healthkit'),
];

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            details: errors.array().map(e => ({ field: e.path, message: e.msg })),
        });
    }
    next();
};

// ─── POST /api/vitals/sync ──────────────────────────────────────
// Accepts a batch of wearable vital readings and processes them.
// Auth: Supabase JWT required (patient only)
// Rate: Max 10 syncs/hour, 100 readings/request
router.post(
    '/sync',
    authenticatePatient,
    syncRateLimiter,
    syncValidators,
    validate,
    async (req, res) => {
        try {
            const { readings, source } = req.body;

            // Determine source from body or default based on platform header
            const effectiveSource = source ||
                (req.headers['x-app-platform'] === 'ios' ? 'healthkit' : 'health_connect');

            console.log(`📡 Vitals sync: ${readings.length} readings from ${req.patientName} (${effectiveSource})`);

            const summary = await VitalsIngestionService.processBatch(
                req.patientId,
                readings,
                effectiveSource
            );

            const statusCode = summary.anomalies.length > 0 ? 200 : 201;

            res.status(statusCode).json({
                message: 'Vitals sync completed',
                summary: {
                    received: summary.received,
                    accepted: summary.accepted,
                    duplicates: summary.duplicates,
                    invalid: summary.invalid,
                    anomalies_detected: summary.anomalies.length,
                },
                ...(summary.anomalies.length > 0 && {
                    anomaly_warning: 'Abnormal readings were detected and alerts have been sent.',
                }),
            });
        } catch (err) {
            console.error('POST /api/vitals/sync error:', err);
            res.status(500).json({ error: 'Failed to process vitals sync' });
        }
    }
);

// ─── GET /api/vitals/sync/status ────────────────────────────────
// Returns the patient's sync status (last sync time, readings count today)
router.get(
    '/sync/status',
    authenticatePatient,
    async (req, res) => {
        try {
            const VitalLog = require('../models/VitalLog');

            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const [todayCount, lastReading] = await Promise.all([
                VitalLog.countDocuments({
                    patient_id: req.patientId,
                    source: { $in: ['health_connect', 'healthkit'] },
                    date: { $gte: todayStart },
                }),
                VitalLog.findOne({
                    patient_id: req.patientId,
                    source: { $in: ['health_connect', 'healthkit'] },
                }).sort({ date: -1 }).select('date source').lean(),
            ]);

            res.json({
                connected: todayCount > 0 || !!lastReading,
                readings_today: todayCount,
                last_sync: lastReading?.date || null,
                source: lastReading?.source || null,
            });
        } catch (err) {
            console.error('GET /api/vitals/sync/status error:', err);
            res.status(500).json({ error: 'Failed to get sync status' });
        }
    }
);

module.exports = router;
