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
        shouldShowAlert: true,
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
            name: 'CareCo Notifications',
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
                title: 'Welcome to CareCo! 🎉',
                body: 'Enjoy the seamless experience with our app. We\'re here to take care of your health!',
                data: { screen: 'PatientHome' },
                sound: 'default',
            },
            trigger: { seconds: 1 },
        });
        console.log('✅ Seamless experience notification scheduled');
    } catch (error) {
        console.warn('Seamless experience notification error:', error.message);
    }
}

const WELCOME_KEY = '@careco_last_welcome_date';

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
                body: 'Welcome back to CareCo. Stay on top of your health today!',
                data: { screen: 'PatientHome' },
                sound: 'default',
            },
            trigger: { seconds: 2 },
        });

        // Mark today as greeted
        await AsyncStorage.setItem(WELCOME_KEY, new Date().toDateString());
        console.log('✅ Welcome notification scheduled');
    } catch (error) {
        console.warn('Welcome notification error:', error.message);
    }
}
