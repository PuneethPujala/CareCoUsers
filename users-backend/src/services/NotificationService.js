const axios = require('axios');
const Patient = require('../models/Patient');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Retry config: up to 3 attempts with exponential backoff (1s, 2s, 4s)
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

/**
 * Master Notification Service (Expo Bridge Version)
 *
 * Handles sending push notifications via Expo Push API.
 * Expo's API bridges to FCM (Android) and APNS (iOS) so we don't need to
 * hold Firebase Service Account credentials in the notification hot path.
 *
 * FIX 1: Added retry logic with exponential backoff. Previously a transient
 *         network error or a 429 from Expo would silently drop the notification.
 *
 * FIX 2: broadcast() now uses Promise.allSettled instead of Promise.all.
 *         Promise.all rejects the entire batch the moment any sendPush throws.
 *         allSettled lets every send attempt complete regardless of individual failures.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class NotificationService {
    /**
     * Send a push notification to a specific patient.
     *
     * @param {string} patientId - MongoDB _id of the patient
     * @param {{ title: string, body: string, data?: object }} payload
     * @returns {Promise<boolean>} true if delivered to Expo, false otherwise
     */
    static async sendPush(patientId, { title, body, data = {} }) {
        try {
            const patient = await Patient
                .findById(patientId)
                .select('expo_push_token push_notifications_enabled');

            if (!patient?.expo_push_token || !patient.push_notifications_enabled) {
                return { success: false, reason: 'disabled_or_no_token' };
            }

            // Expo tokens: ExponentPushToken[...] or ExpoPushToken[...]
            if (!/^Expo(nent)?PushToken\[.+\]$/.test(patient.expo_push_token)) {
                console.warn(`[NotificationService] Invalid token for ${patientId}: ${patient.expo_push_token}`);
                return { success: false, reason: 'invalid_token' };
            }

            const message = {
                to: patient.expo_push_token,
                sound: 'default',
                title,
                body,
                data: {
                    ...data,
                    patientId: patientId.toString(),
                },
                priority: 'high',
                channelId: 'meds',
            };

            // Retry loop with exponential backoff
            let lastError;
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    const response = await axios.post(EXPO_PUSH_URL, message, {
                        headers: {
                            Accept: 'application/json',
                            'Accept-encoding': 'gzip, deflate',
                            'Content-Type': 'application/json',
                        },
                        timeout: 8000, // 8s — Expo is fast
                    });

                    const rawResult = response.data?.data;
                    const ticket = Array.isArray(rawResult) ? rawResult[0] : rawResult;

                    if (ticket?.status === 'error') {
                        console.error(`❌ Push rejected for ${patientId}:`, ticket.message);

                        if (ticket.details?.error === 'DeviceNotRegistered') {
                            // Token is permanently invalid — clear it so we stop wasting quota
                            await Patient.findByIdAndUpdate(patientId, { $set: { expo_push_token: null } });
                        }
                        
                        const notificationId = data.notification_id || data.notificationId;
                        if (notificationId) {
                            const Notification = require('../models/Notification');
                            await Notification.findByIdAndUpdate(notificationId, {
                                $set: {
                                    expo_push_token: patient.expo_push_token,
                                    push_delivered: false,
                                    expo_receipt_status: 'error',
                                    expo_receipt_error: ticket.message
                                }
                            });
                        }
                        // Application-level error: don't retry (Expo will give the same answer)
                        return { success: false, reason: ticket.message, details: ticket.details };
                    }

                    const ticketId = ticket?.id;
                    console.log(`✅ Push sent to ${patientId} (ticket: ${ticketId})`);

                    // Update corresponding Notification document with ticket info if it exists
                    const notificationId = data.notification_id || data.notificationId;
                    if (notificationId && ticketId) {
                        const Notification = require('../models/Notification');
                        await Notification.findByIdAndUpdate(notificationId, {
                            $set: {
                                expo_ticket_id: ticketId,
                                expo_push_token: patient.expo_push_token,
                                push_delivered: true
                            }
                        });
                    }

                    return { success: true, ticketId };
                } catch (err) {
                    lastError = err;
                    const isRetryable =
                        err.response?.status === 429 ||  // rate limited
                        err.response?.status >= 500 ||   // Expo server error
                        err.code === 'ECONNRESET' ||
                        err.code === 'ETIMEDOUT' ||
                        err.code === 'ECONNABORTED';

                    if (!isRetryable || attempt === MAX_RETRIES) break;

                    const backoffMs = RETRY_BASE_MS * Math.pow(2, attempt - 1);
                    console.warn(`[NotificationService] Attempt ${attempt} failed (${err.message}), retrying in ${backoffMs}ms…`);
                    await sleep(backoffMs);
                }
            }

            console.error(`❌ Push network error for ${patientId} after ${MAX_RETRIES} attempts:`, lastError?.message);
            
            const notificationId = data.notification_id || data.notificationId;
            if (notificationId) {
                const Notification = require('../models/Notification');
                await Notification.findByIdAndUpdate(notificationId, {
                    $set: {
                        expo_push_token: patient.expo_push_token,
                        push_delivered: false,
                        expo_receipt_status: 'error',
                        expo_receipt_error: lastError?.message || 'max_retries_exceeded'
                    }
                });
            }
            return { success: false, reason: 'network_error', error: lastError?.message };
        } catch (error) {
            // Outer catch: DB lookup failure or unexpected throw
            console.error(`❌ Unexpected error in sendPush for ${patientId}:`, error.message);
            const notificationId = data.notification_id || data.notificationId;
            if (notificationId) {
                try {
                    const Notification = require('../models/Notification');
                    await Notification.findByIdAndUpdate(notificationId, {
                        $set: {
                            push_delivered: false,
                            expo_receipt_status: 'error',
                            expo_receipt_error: error.message
                        }
                    });
                } catch (_) {}
            }
            return { success: false, reason: 'unexpected_error', error: error.message };
        }
    }

    /**
     * Broadcast a notification to multiple patients.
     *
     * FIX 2: Uses Promise.allSettled so a single failed send never aborts the batch.
     *
     * @param {string[]} patientIds
     * @param {{ title: string, body: string, data?: object }} payload
     * @returns {Promise<{ sent: number, failed: number }>}
     */
    static async broadcast(patientIds, payload) {
        const results = await Promise.allSettled(
            patientIds.map((id) => this.sendPush(id, payload))
        );

        let sent = 0;
        let failed = 0;
        for (const r of results) {
            if (r.status === 'fulfilled' && (r.value === true || r.value?.success === true)) sent++;
            else failed++;
        }

        console.log(`[NotificationService] Broadcast: ${sent} sent, ${failed} failed of ${patientIds.length}`);
        return { sent, failed };
    }
}

module.exports = NotificationService;