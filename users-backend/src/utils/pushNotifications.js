/**
 * Push Notification Service
 * Handles sending push notifications via Expo Push API (FCM under the hood).
 * 
 * Expo Push API docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

class PushNotificationService {
  /**
   * Send a push notification via Expo's push service.
   * @param {string} expoPushToken - The recipient's Expo push token (e.g. "ExponentPushToken[xxx]")
   * @param {string} title - Notification title
   * @param {string} body - Notification body text
   * @param {object} [data={}] - Optional data payload (e.g. { screen: 'VitalsScreen' })
   * @returns {Promise<object>} - The response from Expo's push API
   */
  static async sendPush(expoPushToken, title, body, data = {}) {
    if (!expoPushToken) {
      console.warn('⚠️ No push token provided, skipping push notification.');
      return { success: false, reason: 'no_token' };
    }

    // Validate Expo push token format
    if (!this.isValidExpoPushToken(expoPushToken)) {
      console.warn(`⚠️ Invalid Expo push token format: ${expoPushToken}`);
      return { success: false, reason: 'invalid_token' };
    }

    const message = {
      to: expoPushToken,
      sound: 'default',
      title,
      body,
      data,
      priority: 'high',
      channelId: 'default', // Android notification channel
    };

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const result = await response.json();

      if (result.data?.status === 'error') {
        console.error(`❌ Push notification failed:`, result.data.message);
        return { success: false, reason: result.data.message, details: result.data.details };
      }

      console.log(`✅ Push notification sent to token: ${expoPushToken.substring(0, 30)}...`);
      return { success: true, ticketId: result.data?.id };
    } catch (error) {
      console.error('❌ Push notification network error:', error.message);
      return { success: false, reason: 'network_error', error: error.message };
    }
  }

  /**
   * Send a critical vital alert push notification to a patient.
   * @param {object} patient - Patient document with expo_push_token
   * @param {object} prediction - The latest prediction data
   * @returns {Promise<object>}
   */
  static async sendCriticalVitalAlert(patient, prediction) {
    if (!patient.push_notifications_enabled) {
      return { success: false, reason: 'notifications_disabled' };
    }

    const title = '⚠️ Critical Vital Trend Detected';
    const body = `Your predicted vitals are trending towards critical levels. Please check your health dashboard for details.`;
    const data = {
      screen: 'VitalsScreen',
      type: 'critical_vital_alert',
      prediction_id: prediction?._id?.toString(),
    };

    return this.sendPush(patient.expo_push_token, title, body, data);
  }

  /**
   * Send a critical alert to the assigned caller/caretaker.
   * @param {object} caller - Caller document 
   * @param {object} patient - Patient document
   * @param {object} prediction - The prediction that triggered the alert
   * @returns {Promise<object>}
   */
  static async sendCallerCriticalAlert(caller, patient, prediction) {
    const title = '🚨 Patient Critical Alert';
    const body = `Patient "${patient.name}" has predicted vitals trending towards critical. Immediate review recommended.`;
    const data = {
      screen: 'PatientDetail',
      type: 'caller_critical_alert',
      patient_id: patient._id?.toString(),
    };

    // Caller model may have a push token field — use it if available
    const callerToken = caller?.expo_push_token;
    return this.sendPush(callerToken, title, body, data);
  }

  /**
   * Validate Expo Push Token format.
   * Valid formats: "ExponentPushToken[xxx]" or "ExpoPushToken[xxx]"
   * @param {string} token
   * @returns {boolean}
   */
  static isValidExpoPushToken(token) {
    if (!token || typeof token !== 'string') return false;
    return /^Expo(nent)?PushToken\[.+\]$/.test(token);
  }
}

module.exports = PushNotificationService;
