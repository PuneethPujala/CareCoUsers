export const ErrorRegistry = {
    // Authentication & Identity
    EMAIL_ALREADY_EXISTS: {
        translationKey: 'errors.email_already_exists',
        severity: 'warning',
        retryable: false,
        kind: 'validation',
        defaultMessage: 'An account with this email already exists.',
    },
    INVALID_CREDENTIALS: {
        translationKey: 'errors.invalid_credentials',
        severity: 'warning',
        retryable: true,
        kind: 'authentication',
        defaultMessage: 'Incorrect email or password.',
    },
    NO_PASSWORD_SET: {
        translationKey: 'errors.no_password_set',
        severity: 'warning',
        retryable: false,
        kind: 'authentication',
        defaultMessage: 'This email is linked to Google Sign-In. Please sign in with Google.',
    },
    ACCOUNT_DEACTIVATED: {
        translationKey: 'errors.account_deactivated',
        severity: 'warning',
        retryable: false,
        kind: 'authentication',
        defaultMessage: 'Your account was deactivated. Please log in with your credentials to reactivate it.',
    },
    ACCOUNT_LOCKED: {
        translationKey: 'errors.account_locked',
        severity: 'error',
        retryable: false,
        kind: 'authentication',
        defaultMessage: 'Account is temporarily locked. Please try again later.',
    },
    PROFILE_NOT_FOUND: {
        translationKey: 'errors.profile_not_found',
        severity: 'error',
        retryable: false,
        kind: 'authentication',
        defaultMessage: 'Your user profile could not be found.',
    },
    EMAIL_NOT_VERIFIED: {
        translationKey: 'errors.email_not_verified',
        severity: 'warning',
        retryable: true,
        kind: 'authentication',
        defaultMessage: 'Your email is not verified. Please check your inbox.',
    },
    PASSWORD_TOO_SHORT: {
        translationKey: 'errors.password_too_short',
        severity: 'warning',
        retryable: false,
        kind: 'validation',
        defaultMessage: 'Password must be at least 6 characters.',
    },
    INVALID_EMAIL: {
        translationKey: 'errors.invalid_email',
        severity: 'warning',
        retryable: false,
        kind: 'validation',
        defaultMessage: 'Please enter a valid email address.',
    },
    SIGNUPS_DISABLED: {
        translationKey: 'errors.signups_disabled',
        severity: 'error',
        retryable: false,
        kind: 'authentication',
        defaultMessage: 'Signups are currently disabled.',
    },
    USER_NOT_FOUND: {
        translationKey: 'errors.user_not_found',
        severity: 'warning',
        retryable: false,
        kind: 'authentication',
        defaultMessage: 'No account found with this email address.',
    },
    TOO_MANY_REQUESTS: {
        translationKey: 'errors.too_many_requests',
        severity: 'error',
        retryable: true,
        kind: 'network',
        defaultMessage: 'Too many attempts. Please wait and try again.',
    },
    RATE_LIMIT_COOLDOWN: {
        translationKey: 'errors.rate_limit_cooldown',
        severity: 'warning',
        retryable: false,
        kind: 'network',
        defaultMessage: 'Please wait before requesting again.',
    },
    PASSWORD_SAME_AS_OLD: {
        translationKey: 'errors.password_same_as_old',
        severity: 'warning',
        retryable: false,
        kind: 'validation',
        defaultMessage: 'New password must be different from your current password.',
    },

    // Network & Transport
    TIMEOUT: {
        translationKey: 'errors.timeout',
        severity: 'error',
        retryable: true,
        kind: 'network',
        defaultMessage: 'The request timed out. Please check your connection and try again.',
    },
    OFFLINE: {
        translationKey: 'errors.offline',
        severity: 'error',
        retryable: true,
        kind: 'network',
        defaultMessage: 'No internet connection. Please check your network.',
    },

    // Service / Server Failures
    SERVICE_UNAVAILABLE: {
        translationKey: 'errors.service_unavailable',
        severity: 'error',
        retryable: true,
        kind: 'server',
        defaultMessage: 'Our servers are temporarily busy. Please try again in a moment.',
    },
    SERVER_ERROR: {
        translationKey: 'errors.server_error',
        severity: 'error',
        retryable: false,
        kind: 'server',
        defaultMessage: 'Server error. Please try again later.',
    },
    VALIDATION: {
        translationKey: 'errors.validation',
        severity: 'warning',
        retryable: false,
        kind: 'validation',
        defaultMessage: 'Invalid request. Please check your input.',
    },
};

/**
 * Retrieves the error metadata entry by code. Falls back gracefully to generic defaults.
 * @param {string|null} code 
 * @returns {{ translationKey: string, severity: 'info'|'warning'|'error', retryable: boolean, kind: string, defaultMessage: string }}
 */
export const getRegistryEntry = (code) => {
    return ErrorRegistry[code] || {
        translationKey: 'errors.generic',
        severity: 'error',
        retryable: false,
        kind: 'unknown',
        defaultMessage: 'An unexpected error occurred. Please try again.',
    };
};
