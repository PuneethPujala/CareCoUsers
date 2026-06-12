let analytics = null;
try {
    const firebaseAnalytics = require('@react-native-firebase/analytics').default;
    analytics = firebaseAnalytics();
} catch (e) {
    if (__DEV__) {
        console.warn('[Firebase Analytics] Native module not loaded (skipping in development/expo go):', e.message);
    }
}

const firebaseWrapper = {
    async logEvent(name, params = {}) {
        if (__DEV__) {
            console.log(`[Firebase Analytics Event] ${name}`, params);
        }
        if (analytics) {
            try {
                await analytics.logEvent(name, params);
            } catch (err) {
                console.warn('[Firebase Analytics] logEvent failed:', err.message);
            }
        }
    },

    async setUserId(userId) {
        if (__DEV__) {
            console.log(`[Firebase Analytics UserID] ${userId}`);
        }
        if (analytics) {
            try {
                await analytics.setUserId(userId);
            } catch (err) {
                console.warn('[Firebase Analytics] setUserId failed:', err.message);
            }
        }
    },

    async setUserProperties(properties = {}) {
        if (__DEV__) {
            console.log(`[Firebase Analytics UserProperties]`, properties);
        }
        if (analytics) {
            try {
                await analytics.setUserProperties(properties);
            } catch (err) {
                console.warn('[Firebase Analytics] setUserProperties failed:', err.message);
            }
        }
    }
};

export default firebaseWrapper;
