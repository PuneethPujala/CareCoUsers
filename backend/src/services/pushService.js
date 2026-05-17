/**
 * Expo Push Notification Service
 * Sends real push notifications via Expo Push API.
 */
const PushToken = require('../models/PushToken');
const Notification = require('../models/Notification');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a push notification to a specific user.
 * Also creates a Notification record in the DB for the in-app feed.
 */
async function sendPush(recipientId, { title, body, type, priority, data }) {
    try {
        // 1. Create in-app notification record
        const notification = await Notification.create({
            recipientId,
            type: type || 'system_announcement',
            title,
            body,
            priority: priority || 'normal',
            status: 'sent',
            data: data || {},
        });

        // 2. Find user's push tokens
        const tokens = await PushToken.find({ profileId: recipientId, isActive: true }).lean();
        if (tokens.length === 0) {
            console.log(`[PushService] No push tokens for user ${recipientId}`);
            return notification;
        }

        // 3. Build Expo push messages
        const messages = tokens.map(t => ({
            to: t.token,
            sound: 'default',
            title,
            body,
            data: {
                notificationId: notification._id.toString(),
                type: type || 'system_announcement',
                ...(data || {}),
            },
            priority: priority === 'urgent' ? 'high' : 'default',
            channelId: 'caller-notifications',
        }));

        // 4. Send via Expo Push API
        const response = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messages),
        });

        const result = await response.json();

        // 5. Handle invalid tokens (uninstalled app, etc.)
        if (result.data) {
            for (let i = 0; i < result.data.length; i++) {
                const ticket = result.data[i];
                if (ticket.status === 'error') {
                    if (ticket.details?.error === 'DeviceNotRegistered') {
                        // Deactivate this token
                        await PushToken.updateOne({ token: tokens[i].token }, { isActive: false });
                        console.log(`[PushService] Deactivated stale token for user ${recipientId}`);
                    }
                }
            }
        }

        return notification;
    } catch (err) {
        console.error('[PushService] Error sending push:', err.message);
        return null;
    }
}

/**
 * Send push to multiple users at once (batch).
 */
async function sendPushBatch(recipientIds, { title, body, type, priority, data }) {
    const results = [];
    for (const id of recipientIds) {
        const r = await sendPush(id, { title, body, type, priority, data });
        if (r) results.push(r);
    }
    return results;
}

module.exports = { sendPush, sendPushBatch };
