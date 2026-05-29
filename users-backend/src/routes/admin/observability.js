const express = require('express');
const router = express.Router();
const Patient = require('../../models/Patient');
const Notification = require('../../models/Notification');
const logger = require('../../utils/logger');
const { authenticate } = require('../../middleware/authenticate');

// ── GET /api/admin/observability/system-health ──────────────────────
router.get('/system-health', authenticate, async (req, res) => {
    try {
        // 1. Notification Delivery Stats (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        let totalSent, successfullyDelivered, failedDelivery, activeTokens, staleTokens;
        let platformStats = [];

        // Check if the request is from a Patient or has a patient_id query param
        const isPatient = req.auth && req.auth.userType === 'Patient';
        const targetPatientId = isPatient ? req.profile._id : (req.query.patient_id || null);

        if (targetPatientId) {
            // Patient-specific metrics
            [
                totalSent,
                successfullyDelivered,
                failedDelivery,
                activeTokens,
                staleTokens
            ] = await Promise.all([
                Notification.countDocuments({ patient_id: targetPatientId, created_at: { $gte: sevenDaysAgo } }),
                Notification.countDocuments({ patient_id: targetPatientId, created_at: { $gte: sevenDaysAgo }, push_delivered: true }),
                Notification.countDocuments({ patient_id: targetPatientId, created_at: { $gte: sevenDaysAgo }, push_delivered: false }),
                Patient.countDocuments({ 
                    _id: targetPatientId,
                    expo_push_token: { $exists: true, $ne: null },
                    last_token_update: { $gte: thirtyDaysAgo }
                }),
                Patient.countDocuments({ 
                    _id: targetPatientId,
                    expo_push_token: { $exists: true, $ne: null },
                    $or: [
                        { last_token_update: { $lt: thirtyDaysAgo } },
                        { last_token_update: { $exists: false } }
                    ]
                })
            ]);
        } else {
            // Global/System-wide metrics
            [
                totalSent,
                successfullyDelivered,
                failedDelivery,
                activeTokens,
                staleTokens,
                platformStats
            ] = await Promise.all([
                Notification.countDocuments({ created_at: { $gte: sevenDaysAgo } }),
                Notification.countDocuments({ created_at: { $gte: sevenDaysAgo }, push_delivered: true }),
                Notification.countDocuments({ created_at: { $gte: sevenDaysAgo }, push_delivered: false }),
                Patient.countDocuments({ 
                    expo_push_token: { $exists: true, $ne: null },
                    last_token_update: { $gte: thirtyDaysAgo }
                }),
                Patient.countDocuments({ 
                    expo_push_token: { $exists: true, $ne: null },
                    $or: [
                        { last_token_update: { $lt: thirtyDaysAgo } },
                        { last_token_update: { $exists: false } }
                    ]
                }),
                Patient.aggregate([
                    { $match: { device_platform: { $exists: true } } },
                    { $group: { _id: "$device_platform", count: { $sum: 1 } } }
                ])
            ]);
        }

        const response = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            is_patient_scoped: !!targetPatientId,
            notifications_7d: {
                total_attempted: totalSent,
                delivered: successfullyDelivered,
                failed: failedDelivery,
                success_rate: totalSent > 0 ? ((successfullyDelivered / totalSent) * 100).toFixed(1) + '%' : '0%'
            },
            tokens: {
                active: activeTokens,
                stale: staleTokens
            },
            platforms: platformStats.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {})
        };

        res.json(response);
    } catch (error) {
        logger.error('[Observability] Failed to fetch system health:', error);
        res.status(500).json({ error: 'Failed to fetch observability stats', details: error.message });
    }
});

module.exports = router;
