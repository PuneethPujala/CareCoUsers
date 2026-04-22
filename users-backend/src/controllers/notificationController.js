/**
 * notificationController.js
 * 
 * Handles CRUD for In-App Notification Center.
 */

const Notification = require('../models/Notification');

async function getNotifications(req, res) {
    try {
        const patientId = req.profile._id; // Use authenticated patient context
        const { category, page = 1, limit = 20 } = req.query;

        const query = { patient_id: patientId };
        if (category) {
            query.type = category;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const notifications = await Notification.find(query)
            .sort({ is_pinned: -1, created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Notification.countDocuments(query);

        res.json({
            notifications,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        console.error('getNotifications error:', err);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
}

async function getUnreadCount(req, res) {
    try {
        const patientId = req.profile._id;
        const count = await Notification.countDocuments({ patient_id: patientId, is_read: false });
        res.json({ count });
    } catch (err) {
        console.error('getUnreadCount error:', err);
        res.status(500).json({ error: 'Failed to fetch unread count' });
    }
}

async function markAsRead(req, res) {
    try {
        const { id } = req.params;
        const patientId = req.profile._id;

        const notification = await Notification.findOneAndUpdate(
            { _id: id, patient_id: patientId },
            { is_read: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        res.json({ message: 'Marked as read', notification });
    } catch (err) {
        console.error('markAsRead error:', err);
        res.status(500).json({ error: 'Failed to mark as read' });
    }
}

async function markAllAsRead(req, res) {
    try {
        const patientId = req.profile._id;
        
        await Notification.updateMany(
            { patient_id: patientId, is_read: false },
            { is_read: true }
        );

        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        console.error('markAllAsRead error:', err);
        res.status(500).json({ error: 'Failed to mark all as read' });
    }
}

module.exports = {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead
};
