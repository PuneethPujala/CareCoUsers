/**
 * analytics.js — Observability & event logging
 *
 * §15 FIX: Structured event logging for auth flows.
 * Replace the console-based implementation with Sentry/Amplitude/Mixpanel
 * for production. Never logs tokens, passwords, or PII.
 */

const isDev = process.env.EXPO_PUBLIC_ENVIRONMENT === 'development';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Allowed fields (whitelist — no tokens/passwords ever)
const SAFE_FIELDS = ['userId', 'role', 'errorCode', 'status', 'event', 'screen', 'method'];

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

    /**
     * Initialize analytics (call once in App.js)
     */
    async init() {
        try {
            const consent = await AsyncStorage.getItem('samvaya_tracking_consent');
            if (consent === 'granted') this.consentGranted = true;
        } catch {}

        if (isDev) {
            // Dev init
        }
    },

    async setConsent(granted) {
        this.consentGranted = granted;
        try {
            await AsyncStorage.setItem('samvaya_tracking_consent', granted ? 'granted' : 'denied');
        } catch {}
    },

    /**
     * Track an auth event
     * @param {string} event - Event name (e.g. 'login_success', 'signup_failure')
     * @param {object} data - Event data (userId, errorCode — never tokens/passwords)
     */
    track(event, data = {}) {
        // SEC-FIX-14: No tracking without explicit user consent (GDPR/DPDPA)
        if (!this.consentGranted) return;

        const safeData = sanitize(data);
        if (isDev) {
            // Dev-only: silent structured log (no sensitive data)
        }
        // Production: Sentry.addBreadcrumb({ category: 'auth', message: event, data: safeData });
        // Production: Amplitude.track(event, safeData);
    },

    /**
     * Set user identity for session tracking
     * @param {string} userId
     * @param {object} traits - { role, email (hashed) }
     */
    identify(userId, traits = {}) {
        if (!this.consentGranted) return;
        const safeTraits = sanitize(traits);
        // Production: Sentry.setUser({ id: userId, ...safeTraits });
        // Production: Amplitude.setUserId(userId);
    },

    /**
     * Clear user identity on logout
     */
    reset() {
        // Production: Sentry.setUser(null);
        // Production: Amplitude.reset();
    },

    /**
     * Log a navigation breadcrumb
     * @param {string} screen
     */
    screen(screen) {
        // Production: Sentry.addBreadcrumb({ category: 'navigation', message: screen });
    },

    // ─── Pre-defined auth events ─────────────────────────────────
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
