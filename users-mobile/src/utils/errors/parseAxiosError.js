import { getRegistryEntry } from './errorRegistry';

const HTTP_STATUS_MAP = {
    400: 'VALIDATION',
    401: 'INVALID_CREDENTIALS',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION',
    429: 'TOO_MANY_REQUESTS',
    500: 'SERVER_ERROR',
    502: 'SERVICE_UNAVAILABLE',
    503: 'SERVICE_UNAVAILABLE',
    504: 'TIMEOUT',
};

export function parseAxiosError(error) {
    const status = error.response?.status || null;
    const data = error.response?.data;

    let code = null;
    let backendMsg = '';
    let fields = {};

    if (data) {
        // Case 1: Backend returns { error: "message", code?: "CODE", details?: [...] }
        if (data.error && typeof data.error === 'string') {
            backendMsg = data.error;
            code = data.code || null;
            if (data.details) {
                // If it's validation error details
                fields = Array.isArray(data.details)
                    ? data.details.reduce((acc, curr) => {
                          if (curr.field) acc[curr.field] = curr.message;
                          return acc;
                      }, {})
                    : data.details;
            }
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

    // Determine the error registry code if not provided by backend
    if (!code) {
        if (backendMsg.toLowerCase().includes('already exists')) {
            code = 'EMAIL_ALREADY_EXISTS';
        } else if (backendMsg.toLowerCase().includes('deactivated')) {
            code = 'ACCOUNT_DEACTIVATED';
        } else if (status) {
            code = HTTP_STATUS_MAP[status] || null;
        }
    }

    const registryEntry = getRegistryEntry(code);

    // If email already exists, set field validation error
    if (code === 'EMAIL_ALREADY_EXISTS') {
        fields.email = 'Email already registered';
    }

    return {
        general: backendMsg || registryEntry.defaultMessage,
        fields,
        code,
        translationKey: registryEntry.translationKey,
        source: 'axios',
        kind: code === 'VALIDATION' || code === 'EMAIL_ALREADY_EXISTS' ? 'validation' : 'server',
        severity: registryEntry.severity,
        retryable: registryEntry.retryable,
        status,
        raw: error,
    };
}
