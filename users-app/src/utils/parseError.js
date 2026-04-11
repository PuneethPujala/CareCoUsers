/**
 * parseError.js — Unified error parsing for all auth and API calls
 * 
 * §12 FIX: Handles Supabase AuthError, Axios error, network, timeout.
 * Returns structured { general, fields: { email, password } }.
 * No sensitive data ever exposed.
 */

const SUPABASE_ERROR_MAP = {
    'Invalid login credentials': 'Incorrect email or password. Please try again.',
    'Email not confirmed': 'Your email is not verified. Please check your inbox.',
    'User already registered': 'An account with this email already exists. Please log in.',
    'Password should be at least 6 characters': 'Password must be at least 6 characters.',
    'Unable to validate email address': 'Please enter a valid email address.',
    'Signups not allowed for this instance': 'Signups are currently disabled.',
    'User not found': 'No account found with this email address.',
    'Too many requests': 'Too many attempts. Please wait a minute and try again.',
    'For security purposes, you can only request this after': 'Please wait before requesting again.',
    'New password should be different from the old password': 'New password must be different from your current password.',
};

const HTTP_STATUS_MAP = {
    400: 'Invalid request. Please check your input.',
    401: 'Session expired. Please log in again.',
    403: 'You don\'t have permission to do this.',
    404: 'The requested resource was not found.',
    409: 'A conflict occurred. Please try again.',
    422: 'Invalid input. Please check your fields.',
    429: 'Too many requests. Please wait and try again.',
    500: 'Server error. Please try again later.',
    502: 'Server is temporarily unavailable. Please try again.',
    503: 'Service unavailable. Please try again later.',
};

/**
 * @param {Error|object} error
 * @returns {{ general: string, fields: { email?: string, password?: string } }}
 */
export function parseError(error) {
    const result = { general: '', fields: {} };

    if (!error) {
        result.general = 'An unknown error occurred.';
        return result;
    }

    // ── Timeout (Axios ECONNABORTED) ────────────────────────────
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        result.general = 'Request timed out. Please check your connection and try again.';
        return result;
    }

    // ── Network error (no response at all) ──────────────────────
    if (error.message === 'Network Error' || !error.response && error.isAxiosError) {
        result.general = 'No internet connection. Please check your network.';
        return result;
    }

    // ── Supabase AuthError ───────────────────────────────────────
    if (error.__isAuthError || error.name === 'AuthApiError' || error.status) {
        const msg = error.message || '';
        const mapped = Object.entries(SUPABASE_ERROR_MAP).find(
            ([key]) => msg.toLowerCase().includes(key.toLowerCase())
        );

        if (mapped) {
            result.general = mapped[1];
            // Set field-level errors for specific messages
            if (msg.includes('email')) result.fields.email = mapped[1];
            if (msg.includes('password') || msg.includes('Password')) result.fields.password = mapped[1];
        } else {
            result.general = msg || 'Authentication error. Please try again.';
        }
        return result;
    }

    // ── Axios error (backend) ────────────────────────────────────
    if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        // Try to extract the best error message from the backend response body
        let backendMsg = '';
        let code = '';

        if (data) {
            // Case 1: Backend returns { error: "message", code?: "CODE" }
            if (data.error && typeof data.error === 'string') {
                backendMsg = data.error;
                code = data.code;
            } 
            // Case 2: Backend returns { message: "msg" }
            else if (data.message && typeof data.message === 'string') {
                backendMsg = data.message;
            } 
            // Case 3: Backend returns { details: "msg" }
            else if (data.details && typeof data.details === 'string') {
                backendMsg = data.details;
            }
            // Case 4: Backend just sends a string message directly
            else if (typeof data === 'string') {
                backendMsg = data;
            }
        }

        if (backendMsg) {
            // Map common backend codes or recognizable messages
            if (code === 'EMAIL_ALREADY_EXISTS' || backendMsg.toLowerCase().includes('already exists')) {
                result.general = 'An account with this email already exists.';
                result.fields.email = 'Email already registered';
                return result;
            }
            if (code === 'INVALID_CREDENTIALS') {
                result.general = 'Incorrect email or password.';
                return result;
            }

            result.general = backendMsg;
        } else {
            // Fallback to HTTP status mapping if body is completely empty/unhelpful
            result.general = HTTP_STATUS_MAP[status] || `Request failed (${status}). Please try again.`;
        }
        return result;
    }

    // ── Plain Error object ───────────────────────────────────────
    if (error.message) {
        // Check against Supabase map even for plain errors
        const mapped = Object.entries(SUPABASE_ERROR_MAP).find(
            ([key]) => error.message.toLowerCase().includes(key.toLowerCase())
        );
        if (mapped) {
            result.general = mapped[1];
            return result;
        }
        result.general = error.message;
        return result;
    }

    result.general = 'An unexpected error occurred. Please try again.';
    return result;
}

/**
 * Quick helper — returns just the general message string
 */
export function parseErrorMessage(error) {
    return parseError(error).general;
}

export default parseError;
