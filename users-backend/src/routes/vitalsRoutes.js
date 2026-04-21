const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const VitalLog = require('../models/VitalLog');

const router = express.Router();

// ─── Validation middleware ──────────────────────────────────────
// Extracts express-validator errors and returns 400 with details.
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

// ─── Shared field validators ────────────────────────────────────
const vitalsValidators = [
    body('patient_id')
        .notEmpty().withMessage('patient_id is required')
        .isMongoId().withMessage('patient_id must be a valid ObjectId'),
    body('heart_rate')
        .notEmpty().withMessage('heart_rate is required')
        .isFloat({ min: 30, max: 250 }).withMessage('heart_rate must be 30–250 bpm'),
    body('blood_pressure.systolic')
        .notEmpty().withMessage('blood_pressure.systolic is required')
        .isFloat({ min: 60, max: 250 }).withMessage('systolic must be 60–250 mmHg'),
    body('blood_pressure.diastolic')
        .notEmpty().withMessage('blood_pressure.diastolic is required')
        .isFloat({ min: 40, max: 150 }).withMessage('diastolic must be 40–150 mmHg'),
    body('oxygen_saturation')
        .notEmpty().withMessage('oxygen_saturation is required')
        .isFloat({ min: 0, max: 100 }).withMessage('oxygen_saturation must be 0–100%'),
    body('hydration')
        .notEmpty().withMessage('hydration is required')
        .isFloat({ min: 0, max: 100 }).withMessage('hydration must be 0–100%'),
    body('date')
        .optional()
        .isISO8601().withMessage('date must be a valid ISO 8601 string'),
];


// ─── POST /api/vitals ───────────────────────────────────────────
// Save a new vitals entry. All fields are validated.
router.post('/', vitalsValidators, validate, async (req, res) => {
    try {
        const { patient_id, date, heart_rate, blood_pressure, oxygen_saturation, hydration } = req.body;

        const vitalLog = new VitalLog({
            patient_id,
            date: date ? new Date(date) : new Date(),
            heart_rate,
            blood_pressure,
            oxygen_saturation,
            hydration,
        });

        await vitalLog.save();
        
        // ── Gamification: Increment Care Streak ──
        const streakService = require('../services/streakService');
        await streakService.evaluateAndUpdateStreak(patient_id);

        res.status(201).json({ message: 'Vitals saved successfully', vitals: vitalLog });
    } catch (error) {
        console.error('POST /api/vitals error:', error);

        // Mongoose validation error (backup to express-validator)
        if (error.name === 'ValidationError') {
            const details = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ error: 'Validation failed', details });
        }

        res.status(500).json({ error: 'Failed to save vitals' });
    }
});


// ─── GET /api/vitals/:patient_id ────────────────────────────────
// Get all vitals for a patient, sorted newest-first.
router.get(
    '/:patient_id',
    param('patient_id').isMongoId().withMessage('Invalid patient_id'),
    validate,
    async (req, res) => {
        try {
            const vitals = await VitalLog.find({ patient_id: req.params.patient_id })
                .sort({ date: -1 });

            if (!vitals.length) {
                return res.status(200).json({ message: 'No vitals found', vitals: [] });
            }

            res.json({ vitals });
        } catch (error) {
            console.error('GET /api/vitals/:patient_id error:', error);
            res.status(500).json({ error: 'Failed to fetch vitals' });
        }
    }
);


// ─── GET /api/vitals/:patient_id/range?start=&end= ─────────────
// Get vitals filtered by date range, sorted ascending for charts.
router.get(
    '/:patient_id/range',
    [
        param('patient_id').isMongoId().withMessage('Invalid patient_id'),
        query('start').notEmpty().isISO8601().withMessage('start must be a valid ISO 8601 date'),
        query('end').notEmpty().isISO8601().withMessage('end must be a valid ISO 8601 date'),
    ],
    validate,
    async (req, res) => {
        try {
            const { start, end } = req.query;

            const vitals = await VitalLog.find({
                patient_id: req.params.patient_id,
                date: {
                    $gte: new Date(start),
                    $lte: new Date(end),
                },
            }).sort({ date: 1 }); // Ascending for chart rendering

            res.json({ vitals });
        } catch (error) {
            console.error('GET /api/vitals/:patient_id/range error:', error);
            res.status(500).json({ error: 'Failed to fetch vitals range' });
        }
    }
);


// ─── DELETE /api/vitals/:id ─────────────────────────────────────
// Delete a specific vitals record by its ObjectId.
router.delete(
    '/:id',
    param('id').isMongoId().withMessage('Invalid vitals record id'),
    validate,
    async (req, res) => {
        try {
            const deleted = await VitalLog.findByIdAndDelete(req.params.id);

            if (!deleted) {
                return res.status(404).json({ error: 'Vitals record not found' });
            }

            res.json({ message: 'Vitals record deleted', vitals: deleted });
        } catch (error) {
            console.error('DELETE /api/vitals/:id error:', error);
            res.status(500).json({ error: 'Failed to delete vitals record' });
        }
    }
);


module.exports = router;
