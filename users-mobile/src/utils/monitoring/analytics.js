import AsyncStorage from '@react-native-async-storage/async-storage';
import sentry from './sentry';
import firebase from './firebase';

function sanitize(data) {
    if (!data || typeof data !== 'object') return {};
    const clean = {};
    for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        if (
            lowerKey.includes('token') ||
            lowerKey.includes('password') ||
            lowerKey.includes('secret') ||
            lowerKey.includes('key') ||
            lowerKey.includes('ssn') ||
            lowerKey.includes('credit')
        ) {
            clean[key] = '[REDACTED]';
        } else {
            clean[key] = value;
        }
    }
    return clean;
}

const analytics = {
    consentGranted: false,

    async init() {
        try {
            const consent = await AsyncStorage.getItem('CareMyMed_tracking_consent');
            if (consent === 'granted') this.consentGranted = true;
        } catch {}

        sentry.init();
    },

    async setConsent(granted) {
        this.consentGranted = granted;
        try {
            await AsyncStorage.setItem('CareMyMed_tracking_consent', granted ? 'granted' : 'denied');
        } catch {}
    },

    track(event, data = {}) {
        if (!this.consentGranted) return;

        const safeData = sanitize(data);
        firebase.logEvent(event, safeData);
        sentry.addBreadcrumb('action', event, safeData);
    },

    identify(userId, traits = {}) {
        if (!this.consentGranted) return;

        const safeTraits = sanitize(traits);
        firebase.setUserId(userId);
        firebase.setUserProperties(safeTraits);
        sentry.setUser({ id: userId, ...safeTraits });
    },

    reset() {
        firebase.setUserId(null);
        sentry.setUser(null);
    },

    screen(screenName) {
        if (__DEV__) {
            console.log(`[Screen View] ${screenName}`);
        }
        if (this.consentGranted) {
            firebase.logEvent('screen_view', { screen: screenName });
            sentry.addBreadcrumb('navigation', screenName);
        }
    },

    // ─── Pre-defined events ───────────────────────────────────────
    loginSuccess(userId) {
        this.track('login_success', { userId });
    },
    loginFailure(errorCode) {
        this.track('login_failure', { errorCode });
    },
    signupSuccess(userId) {
        this.track('signup_success', { userId });
    },
    signupFailure(errorCode) {
        this.track('signup_failure', { errorCode });
    },
    emailConfirmationSent(userId) {
        this.track('email_confirmation_sent', { userId });
    },
    tokenRefreshed(userId) {
        this.track('token_refreshed', { userId });
    },
    tokenRefreshFailed(errorCode) {
        this.track('token_refresh_failed', { errorCode });
    },
    logout(userId) {
        this.track('logout', { userId });
        this.reset();
    },
    mongodbProfileCreateFailed(errorCode) {
        this.track('mongodb_profile_create_failed', { errorCode });
    },
};

export default analytics;
