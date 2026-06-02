/**
 * Push Notification Service for Expo
 * Handles registration, permissions, foreground display, and tap navigation.
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { useNotificationStore } from '../store/useNotificationStore';

// ── Configure how notifications appear when app is in foreground ──
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: false, // We use custom toast instead
        shouldPlaySound: false, // Handled manually
        shouldSetBadge: true,
    }),
});

// ── Define Actionable Categories ──
async function setupCategories() {
    await Notifications.setNotificationCategoryAsync('shift_alert', [
        {
            identifier: 'start_shift',
            buttonTitle: 'Start Shift Now',
            options: { opensAppToForeground: true }
        },
        {
            identifier: 'dismiss',
            buttonTitle: 'Dismiss',
            options: { isDestructive: true }
        }
    ]);
}

// ── Create Android notification channel ──
async function setupNotificationChannel() {
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('caller-notifications', {
            name: 'Caller Notifications',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#6366F1',
            sound: 'default',
            enableVibrate: true,
            showBadge: true,
        });
    }
}

// ── Request permissions and get Expo push token ──
async function registerForPushNotifications() {
    try {
        // Must be a physical device
        if (!Device.isDevice) {
            console.log('[Push] Must use physical device for push notifications');
            return null;
        }

        await setupNotificationChannel();
        await setupCategories();

        // Check existing permissions
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        // Request if not already granted
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.log('[Push] Permission not granted');
            return null;
        }

        // Get the Expo push token
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId: projectId,
        });

        console.log('[Push] Token:', tokenData.data);
        return tokenData.data;
    } catch (err) {
        console.error('[Push] Registration error:', err);
        return null;
    }
}

// ── Set up notification tap listener ──
let notificationResponseListener = null;
let notificationReceivedListener = null;

function setupNotificationListeners(navigationRef) {
    // When user taps a notification
    notificationResponseListener = Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data;
        console.log('[Push] Notification tapped:', data);

        if (navigationRef?.current && data?.screen) {
            // Small delay to ensure navigation is ready
            setTimeout(() => {
                try {
                    navigationRef.current.navigate(data.screen, data.params || {});
                } catch (e) {
                    console.warn('[Push] Navigation failed:', e.message);
                }
            }, 500);
        }
    });

    // When notification received while app is open
    notificationReceivedListener = Notifications.addNotificationReceivedListener(notification => {
        const { title, body, data } = notification.request.content;
        
        // Add to local notification hub history
        useNotificationStore.getState().addNotification({ title, body, data });

        const urgency = data?.urgency || 'normal';
        
        // Trigger specific haptics
        if (urgency === 'high' || urgency === 'critical') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        // Show our beautiful custom dynamic banner
        Toast.show({
            type: urgency === 'high' ? 'error' : (urgency === 'critical' ? 'error' : 'info'),
            text1: title || 'New Notification',
            text2: body || '',
            position: 'top',
            topOffset: 50,
            visibilityTime: 4000,
            autoHide: true,
            onPress: () => {
                Toast.hide();
                if (navigationRef?.current && data?.screen) {
                    navigationRef.current.navigate(data.screen, data.params || {});
                }
            }
        });
    });
}

function removeNotificationListeners() {
    if (notificationResponseListener) {
        notificationResponseListener.remove();
        notificationResponseListener = null;
    }
    if (notificationReceivedListener) {
        notificationReceivedListener.remove();
        notificationReceivedListener = null;
    }
}

// ── Get badge count ──
async function getBadgeCount() {
    return Notifications.getBadgeCountAsync();
}

async function setBadgeCount(count) {
    return Notifications.setBadgeCountAsync(count);
}

export {
    registerForPushNotifications,
    setupNotificationListeners,
    removeNotificationListeners,
    getBadgeCount,
    setBadgeCount,
};
