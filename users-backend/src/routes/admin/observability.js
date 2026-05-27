const express = require('express');
const router = express.Router();
const Patient = require('../../models/Patient');
const Notification = require('../../models/Notification');
const logger = require('../../utils/logger');
// Optional: import an admin authentication middleware if you have one. 
// For this developer observability endpoint, we can use a basic secret key check for now or just allow it if it's hitting /api/admin/observability

// ── GET /api/admin/observability/system-health ──────────────────────
router.get('/system-health', async (req, res) => {
    try {
        // 1. Notification Delivery Stats (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const totalSent = await Notification.countDocuments({ created_at: { $gte: sevenDaysAgo } });
        const successfullyDelivered = await Notification.countDocuments({ created_at: { $gte: sevenDaysAgo }, push_delivered: true });
        const failedDelivery = await Notification.countDocuments({ created_at: { $gte: sevenDaysAgo }, push_delivered: false });

        // 2. Token Health
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const activeTokens = await Patient.countDocuments({ 
            expo_push_token: { $exists: true, $ne: null },
            last_token_update: { $gte: thirtyDaysAgo }
        });

        const staleTokens = await Patient.countDocuments({ 
            expo_push_token: { $exists: true, $ne: null },
            $or: [
                { last_token_update: { $lt: thirtyDaysAgo } },
                { last_token_update: { $exists: false } }
            ]
        });

        // 3. Platform Breakdown
        const platformStats = await Patient.aggregate([
            { $match: { device_platform: { $exists: true } } },
            { $group: { _id: "$device_platform", count: { $sum: 1 } } }
        ]);

        const response = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
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
