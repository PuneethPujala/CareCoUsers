import { getRegistryEntry } from './errorRegistry';

const SUPABASE_ERROR_MAP = {
    'invalid login credentials': 'INVALID_CREDENTIALS',
    'email not confirmed': 'EMAIL_NOT_VERIFIED',
    'user already registered': 'EMAIL_ALREADY_EXISTS',
    'password should be at least 6 characters': 'PASSWORD_TOO_SHORT',
    'unable to validate email address': 'INVALID_EMAIL',
    'signups not allowed for this instance': 'SIGNUPS_DISABLED',
    'user not found': 'USER_NOT_FOUND',
    'too many requests': 'TOO_MANY_REQUESTS',
    'for security purposes, you can only request this after': 'RATE_LIMIT_COOLDOWN',
    'new password should be different from the old password': 'PASSWORD_SAME_AS_OLD',
};

export function parseSupabaseError(error) {
    const msg = error.message || '';
    const status = error.status || null;

    let code = null;
    const matchedKey = Object.keys(SUPABASE_ERROR_MAP).find(
        (key) => msg.toLowerCase().includes(key)
    );

    if (matchedKey) {
        code = SUPABASE_ERROR_MAP[matchedKey];
    }

    const registryEntry = getRegistryEntry(code);
    const fields = {};
    if (code === 'EMAIL_ALREADY_EXISTS') {
        fields.email = 'Email already registered';
    } else if (code === 'PASSWORD_TOO_SHORT') {
        fields.password = 'Password must be at least 6 characters';
    }

    return {
        general: registryEntry.defaultMessage,
        fields,
        code,
        translationKey: registryEntry.translationKey,
        source: 'supabase',
        kind: 'authentication',
        severity: registryEntry.severity,
        retryable: registryEntry.retryable,
        status,
        raw: error,
    };
}
