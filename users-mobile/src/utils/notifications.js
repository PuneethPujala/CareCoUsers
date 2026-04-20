import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';
import { getRandomTemplate, personalize } from './notificationTemplates';

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
        // Establish Priority Notification Channel for Medications
        await Notifications.setNotificationChannelAsync('meds', {
            name: 'Medication Alerts',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            sound: 'default',
        });
    }

    // Register OS-level Interactivity (Actionable Notifications)
    await Notifications.setNotificationCategoryAsync('medication_reminder', [
        {
            identifier: 'TAKEN',
            buttonTitle: '✅ I took it',
            options: { opensAppToForeground: false },
        },
        {
            identifier: 'SNOOZE',
            buttonTitle: '⏳ Snooze 10m',
            options: { opensAppToForeground: false },
        },
    ]);

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
        const randomBody = getRandomTemplate('welcome');

        // Send local notification after a short delay
        await Notifications.scheduleNotificationAsync({
            content: {
                title: `${greeting}, ${firstName}! 👋`,
                body: randomBody,
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

/**
 * Master sync function to reliably configure all repeating schedules natively.
 * Should be called immediately whenever the user opens the dashboard.
 */
export async function syncAllSchedules(medicines = [], prefs = {}, subscriptionDaysLeft = null, vitalsLoggedToday = false) {
    try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;

        // 1. Cancel + reschedule logic (prevent any duplicates, stale alarms)
        await Notifications.cancelAllScheduledNotificationsAsync();
        
        // --- 2. Vitals Reminder (Daily exactly at 10 AM) ---
        if (!vitalsLoggedToday) {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '❤️ Daily Vitals Reminder',
                    body: getRandomTemplate('vitals', 'reminders') || 'Time to log your daily vitals!',
                    data: { screen: 'PatientHome', type: 'vitals_reminder' },
                    sound: 'default',
                },
                // Native repeating exact alarm
                trigger: { hour: 10, minute: 0, repeats: true },
            });
            console.log('✅ Daily repeating Vitals reminder synced');
        }

        // --- 3. Medication Reminders (Daily) ---
        const defaultTimes = { morning: '09:00', afternoon: '14:00', night: '20:00' };
        const slotsMap = {};

        // Parse what medications they actually have from the real backend result
        for (const med of medicines) {
            // We ignore med.taken because the alarm repeats every day natively! 
            // Only skip if explicitly deactivated
            if (med.status !== 'active' && med.is_active !== true && !med.medicine_name) continue;

            const timeKey = med.scheduled_time || 'morning';
            const timePref = prefs[timeKey] || defaultTimes[timeKey] || '09:00';
            
            if (!slotsMap[timePref]) {
                slotsMap[timePref] = { names: [], slotKey: timeKey };
            }
            const name = med.medicine_name || med.name;
            if (name) slotsMap[timePref].names.push(name);
        }

        for (const [timePref, data] of Object.entries(slotsMap)) {
            const [h, m] = timePref.split(':').map(Number);
            const { names, slotKey } = data;
            if (!names.length) continue;

            let joinedNames = names.length === 1 ? names[0] : 
                (names.length === 2 ? `${names[0]} and ${names[1]}` : 
                `${names[0]}, ${names[1]} and ${names.length - 2} others`);

            const body = personalize(getRandomTemplate('medications', 'reminders'), { medicineName: joinedNames });
            const capitalizedSlot = slotKey.charAt(0).toUpperCase() + slotKey.slice(1);
            
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: `💊 ${capitalizedSlot} Medication`,
                    body: body || `Time to take your medication: ${joinedNames}`,
                    data: { screen: 'Medications', type: 'medication_reminder' },
                    sound: 'default',
                    categoryIdentifier: 'medication_reminder',
                },
                // Native repeating exact alarm
                trigger: { hour: h, minute: m, repeats: true, channelId: 'meds' },
            });
            console.log(`✅ Daily repeating medication reminder synced for ${timePref} (${names.length} meds)`);
        }

        // --- 4. Subscription Alert (One-off) ---
        if (subscriptionDaysLeft !== null && subscriptionDaysLeft >= 0 && subscriptionDaysLeft <= 7) {
            const triggerDate = new Date();
            triggerDate.setHours(9, 30, 0, 0); 
            // If it's already past 9:30 AM today, schedule it for 5 seconds from now
            // so we don't accidentally schedule it in the past (which fires instantly anyway, but 5s is cleaner)
            const resolvedTrigger = triggerDate > new Date() ? triggerDate : { seconds: 5 };
            
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '⚠️ Subscription Expiring Soon',
                    body: `Your premium subscription expires in ${subscriptionDaysLeft} day${subscriptionDaysLeft !== 1 ? 's' : ''}. Renew to maintain uninterrupted care.`,
                    data: { screen: 'SubscribePlans', type: 'subscription_alert' },
                    sound: 'default',
                },
                trigger: resolvedTrigger,
            });
            console.log('✅ Subscription warning synced');
        }

    } catch (error) {
        console.warn('Sync All Schedules failed:', error.message);
    }
}
