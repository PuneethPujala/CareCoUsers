let Sentry = null;
try {
    Sentry = require('@sentry/react-native');
} catch (e) {
    console.warn('[Sentry] Could not load module:', e.message);
}

const sentryWrapper = {
    init() {
        const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
        if (!dsn) {
            console.log('[Sentry] No DSN configured, skipping initialization.');
            return;
        }

        if (Sentry) {
            try {
                Sentry.init({
                    dsn,
                    environment: __DEV__ ? 'development' : 'production',
                    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
                    beforeSend(event) {
                        if (event.user) {
                            delete event.user.email;
                            delete event.user.ip_address;
                        }
                        return event;
                    },
                });
                console.log('[Sentry] Initialized successfully.');
            } catch (err) {
                console.error('[Sentry] Initialization error:', err.message);
            }
        }
    },

    captureException(error, context = {}) {
        console.error('[Sentry] Capturing Exception:', error, context);
        if (Sentry) {
            try {
                Sentry.captureException(error, context);
            } catch (err) {
                console.warn('[Sentry] captureException failed:', err.message);
            }
        }
    },

    addBreadcrumb(category, message, data = {}) {
        if (__DEV__) {
            console.log(`[Sentry Breadcrumb] [${category}] ${message}`, data);
        }
        if (Sentry) {
            try {
                Sentry.addBreadcrumb({
                    category,
                    message,
                    data,
                    level: 'info',
                });
            } catch (err) {
                console.warn('[Sentry] addBreadcrumb failed:', err.message);
            }
        }
    },

    setUser(user) {
        if (__DEV__) {
            console.log('[Sentry User Context]', user);
        }
        if (Sentry) {
            try {
                if (user) {
                    const cleanUser = { id: user.id };
                    if (user.role) cleanUser.role = user.role;
                    Sentry.setUser(cleanUser);
                } else {
                    Sentry.setUser(null);
                }
            } catch (err) {
                console.warn('[Sentry] setUser failed:', err.message);
            }
        }
    }
};

export default sentryWrapper;
