/**
 * notifications.js
 * 
 * Routes for the In-App Notification Center
 */

const express = require('express');
const router = express.Router();
const notificationController = require('../../controllers/notificationController');
const { authenticate } = require('../../middleware/authenticate');

// All routes are protected by authenticate middleware
router.use(authenticate);

// GET /api/users/patients/notifications -> List notifications
router.get('/', notificationController.getNotifications);

// GET /api/users/patients/notifications/unread-count -> Get badge count
router.get('/unread-count', notificationController.getUnreadCount);

// PATCH /api/users/patients/notifications/read-all -> Mark all as read
router.patch('/read-all', notificationController.markAllAsRead);

// PATCH /api/users/patients/notifications/:id/read -> Mark single as read
router.patch('/:id/read', notificationController.markAsRead);

module.exports = router;
