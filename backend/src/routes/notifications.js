const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const Notification = require('../models/Notification');

// All routes require authentication
router.use(authenticate);

// ── GET / — Fetch notifications for the authenticated user ─────
router.get('/', async (req, res) => {
    try {
        const profileId = req.profile._id;
        const { limit = 50, skip = 0, unreadOnly } = req.query;

        const filter = {
            recipientId: profileId,
            $or: [
                { expiresAt: { $gt: new Date() } },
                { expiresAt: null },
            ],
        };

        if (unreadOnly === 'true') {
            filter.status = { $in: ['pending', 'sent', 'delivered'] };
        }

        const [data, total, unreadCount] = await Promise.all([
            Notification.find(filter)
                .sort({ createdAt: -1 })
                .skip(parseInt(skip))
                .limit(parseInt(limit))
                .lean({ virtuals: true }),
            Notification.countDocuments(filter),
            Notification.countDocuments({
                recipientId: profileId,
                status: { $in: ['pending', 'sent', 'delivered'] },
                $or: [
                    { expiresAt: { $gt: new Date() } },
                    { expiresAt: null },
                ],
            }),
        ]);

        res.json({
            data,
            total,
            unreadCount,
            limit: parseInt(limit),
            skip: parseInt(skip),
        });
    } catch (err) {
        console.error('Failed to fetch notifications:', err);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// ── PATCH /read-all — Mark all notifications as read ───────────
// NOTE: This route MUST be defined BEFORE /:id/read to avoid
// Express matching "read-all" as an :id parameter.
router.patch('/read-all', async (req, res) => {
    try {
        const profileId = req.profile._id;
        const result = await Notification.markAllAsRead(profileId);

        res.json({
            success: true,
            modifiedCount: result.modifiedCount || 0,
        });
    } catch (err) {
        console.error('Failed to mark all as read:', err);
        res.status(500).json({ error: 'Failed to mark all as read' });
    }
});

// ── PATCH /:id/read — Mark a single notification as read ───────
router.patch('/:id/read', async (req, res) => {
    try {
        const notification = await Notification.findOne({
            _id: req.params.id,
            recipientId: req.profile._id,
        });

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        if (notification.status === 'read') {
            return res.json({ success: true, message: 'Already read' });
        }

        await notification.markAsRead();

        res.json({ success: true });
    } catch (err) {
        console.error('Failed to mark notification as read:', err);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

module.exports = router;
