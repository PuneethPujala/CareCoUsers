import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';

/**
 * Configure how notifications appear when the app is in the foreground.
 */
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

/**
 * Request permission and retrieve the Expo Push Token.
 * Returns an object: { token: string|null, granted: boolean, isNewGrant: boolean }
 *   - token: the push token string, or null if unavailable
 *   - granted: whether notification permission is currently granted
 *   - isNewGrant: true if the user just granted permission for the first time in this call
 */
export async function registerForPushNotificationsAsync() {
    // Push notifications only work on physical devices
    if (!Device.isDevice) {
        console.log('Push notifications require a physical device.');
        return { token: null, granted: false, isNewGrant: false };
    }

    // Check existing permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    let isNewGrant = false;

    // Ask for permission if not already granted
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
        if (finalStatus === 'granted') {
            isNewGrant = true; // User just tapped "Allow"
        }
    }

    if (finalStatus !== 'granted') {
        Alert.alert(
            'Notifications Disabled',
            'Please enable notifications in your device settings to receive health reminders and updates.',
        );
        return { token: null, granted: false, isNewGrant: false };
    }

    // Android requires a notification channel
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'Samvaya Notifications',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#6366F1',
            sound: 'default',
        });
    }

    // Retrieve the token — try multiple sources for projectId
    try {
        const projectId =
            Constants.expoConfig?.extra?.eas?.projectId ??
            Constants.easConfig?.projectId ??
            '0577bab0-242a-4d43-a66c-4e0ee3e9bcff'; // fallback from app.json

        console.log('Using projectId for push token:', projectId);

        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        console.log('Expo Push Token:', tokenData.data);
        return { token: tokenData.data, granted: true, isNewGrant };
    } catch (error) {
        console.error('Failed to get Expo push token, trying device token:', error);
        // Fallback: get the native device push token (FCM token on Android)
        try {
            const deviceToken = await Notifications.getDevicePushTokenAsync();
            console.log('Device Push Token:', deviceToken.data);
            return { token: deviceToken.data, granted: true, isNewGrant };
        } catch (deviceError) {
            console.error('Failed to get device push token:', deviceError);
            return { token: null, granted: true, isNewGrant };
        }
    }
}

/**
 * Send the first-time onboarding notification right after the user grants permission.
 */
export async function sendSeamlessExperienceNotification() {
    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Welcome to Samvaya! 🎉',
                body: 'Enjoy the seamless experience with our app. We\'re here to take care of your health!',
                data: { screen: 'PatientHome' },
                sound: 'default',
            },
            trigger: { type: 'timeInterval', seconds: 1 },
        });
        console.log('✅ Seamless experience notification scheduled');
    } catch (error) {
        console.warn('Seamless experience notification error:', error.message);
    }
}

const WELCOME_KEY = '@samvaya_last_welcome_date';

/**
 * Send a local "welcome back" notification.
 * @param {string} userName - The user's display name for personalization.
 * @param {boolean} force - If true, bypass the once-per-day throttle (e.g. on every login).
 */
export async function sendDailyWelcomeNotification(userName = 'there', force = false) {
    try {
        // Check if we already greeted today (skip check when force is true)
        if (!force) {
            const today = new Date().toDateString();
            const lastWelcome = await AsyncStorage.getItem(WELCOME_KEY);
            if (lastWelcome === today) return; // Already greeted
        }

        // Check notification permission first
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;

        // Build a time-of-day greeting
        const hour = new Date().getHours();
        let greeting = 'Good morning';
        if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
        else if (hour >= 17) greeting = 'Good evening';

        const firstName = userName.split(' ')[0];

        // Send local notification after a short delay
        await Notifications.scheduleNotificationAsync({
            content: {
                title: `${greeting}, ${firstName}! 👋`,
                body: 'Welcome back to Samvaya. Stay on top of your health today!',
                data: { screen: 'PatientHome' },
                sound: 'default',
            },
            trigger: { type: 'timeInterval', seconds: 2 },
        });

        // Mark today as greeted
        await AsyncStorage.setItem(WELCOME_KEY, new Date().toDateString());
        console.log('✅ Welcome notification scheduled');
    } catch (error) {
        console.warn('Welcome notification error:', error.message);
    }
}

const MED_SCHEDULE_KEY = '@samvaya_med_notifs_date';

/**
 * Schedule local push notifications for today's medications.
 * Should be called once per day (e.g. on login or app foreground).
 * 
 * @param {Array} medicines - Array of { medicine_name, scheduled_time, taken }
 * @param {object} prefs - Medication call preferences { morning: '09:00', afternoon: '14:00', night: '20:00' }
 */
export async function scheduleMedicationReminders(medicines, prefs = {}) {
    try {
        // Only schedule once per day
        const today = new Date().toDateString();
        const lastScheduled = await AsyncStorage.getItem(MED_SCHEDULE_KEY);
        if (lastScheduled === today) return;

        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;

        // Cancel previous medication notifications
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        for (const notif of scheduled) {
            if (notif.content?.data?.type === 'medication_reminder') {
                await Notifications.cancelScheduledNotificationAsync(notif.identifier);
            }
        }

        const now = new Date();
        const defaultTimes = { morning: '09:00', afternoon: '14:00', night: '20:00' };

        // 1. Group medications by their scheduled time
        const slotsMap = {}; // { "09:00": { names: [], slotKey: "morning" } }

        for (const med of medicines) {
            if (med.taken) continue;

            const timeKey = med.scheduled_time || 'morning';
            const timePref = prefs[timeKey] || defaultTimes[timeKey] || '09:00';
            
            if (!slotsMap[timePref]) {
                slotsMap[timePref] = { 
                    names: [], 
                    slotKey: timeKey 
                };
            }
            slotsMap[timePref].names.push(med.medicine_name);
        }

        // 2. Schedule one notification per unique time slot
        for (const [timePref, data] of Object.entries(slotsMap)) {
            const [h, m] = timePref.split(':').map(Number);
            const medTime = new Date();
            medTime.setHours(h, m, 0, 0);

            const secondsUntil = Math.round((medTime - now) / 1000);
            if (secondsUntil > 0) {
                const { names, slotKey } = data;
                let body = '';
                
                if (names.length === 1) {
                    body = `Time to take your ${names[0]}`;
                } else if (names.length === 2) {
                    body = `Time to take your ${names[0]} and ${names[1]}`;
                } else {
                    body = `Time to take your ${names[0]}, ${names[1]} and ${names.length - 2} others`;
                }

                const capitalizedSlot = slotKey.charAt(0).toUpperCase() + slotKey.slice(1);
                
                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: `💊 ${capitalizedSlot} Medication`,
                        body,
                        data: { screen: 'Medications', type: 'medication_reminder' },
                        sound: 'default',
                    },
                    trigger: { type: 'timeInterval', seconds: secondsUntil },
                });
                console.log(`✅ Grouped medication reminder scheduled: ${names.join(', ')} at ${timePref}`);
            }
        }

        await AsyncStorage.setItem(MED_SCHEDULE_KEY, today);
    } catch (error) {
        console.warn('Medication reminder scheduling failed:', error.message);
    }
}

const VITALS_REMINDER_KEY = '@samvaya_vitals_reminder_date';

/**
 * Schedule a daily vitals logging reminder at 10:00 AM if vitals haven't been logged yet.
 * @param {boolean} vitalsLoggedToday - Whether the user has already logged vitals today
 */
export async function scheduleVitalsReminder(vitalsLoggedToday = false) {
    try {
        if (vitalsLoggedToday) return; // No need to remind

        const today = new Date().toDateString();
        const lastScheduled = await AsyncStorage.getItem(VITALS_REMINDER_KEY);
        if (lastScheduled === today) return;

        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;

        const now = new Date();
        const reminderTime = new Date();
        reminderTime.setHours(10, 0, 0, 0);

        const secondsUntil = Math.round((reminderTime - now) / 1000);
        if (secondsUntil > 0) {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '❤️ Daily Vitals Reminder',
                    body: "Don't forget to log your heart rate and blood pressure today!",
                    data: { screen: 'PatientHome', type: 'vitals_reminder' },
                    sound: 'default',
                },
                trigger: { type: 'timeInterval', seconds: secondsUntil },
            });
            console.log('✅ Vitals reminder scheduled for 10:00 AM');
        }

        await AsyncStorage.setItem(VITALS_REMINDER_KEY, today);
    } catch (error) {
        console.warn('Vitals reminder scheduling failed:', error.message);
    }
}

/**
 * Schedule a subscription expiry warning push notification.
 * @param {number} daysLeft - Days remaining on subscription
 */
export async function scheduleSubscriptionAlert(daysLeft) {
    try {
        if (daysLeft > 7 || daysLeft < 0) return;

        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;

        await Notifications.scheduleNotificationAsync({
            content: {
                title: '⚠️ Subscription Expiring Soon',
                body: `Your premium subscription expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Renew to maintain uninterrupted care.`,
                data: { screen: 'SubscribePlans', type: 'subscription_alert' },
                sound: 'default',
            },
            trigger: { type: 'timeInterval', seconds: 5 },
        });
        console.log(`✅ Subscription alert sent (${daysLeft} days left)`);
    } catch (error) {
        console.warn('Subscription alert failed:', error.message);
    }
}
