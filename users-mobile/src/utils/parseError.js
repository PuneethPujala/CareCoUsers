import i18n from '../i18n';
import { detectErrorSource } from './errors/detectErrorSource';
import { parseAxiosError } from './errors/parseAxiosError';
import { parseSupabaseError } from './errors/parseSupabaseError';
import { parseNetworkError } from './errors/parseNetworkError';
import { getRegistryEntry } from './errors/errorRegistry';

const HTTP_STATUS_MAP = {
    400: 'Invalid request. Please check your input.',
    401: 'Session expired. Please log in again.',
    403: "You don't have permission to do this.",
    404: 'The requested resource was not found.',
    409: 'A conflict occurred. Please try again.',
    422: 'Invalid input. Please check your fields.',
    429: 'Too many requests. Please wait and try again.',
    500: 'Server error. Please try again later.',
    502: 'Server is temporarily unavailable. Please try again.',
    503: 'Our servers are temporarily busy. Please try again in a moment.',
    504: 'The request timed out. Please check your connection and try again.',
};

/**
 * Normalized parseError entrypoint.
 * Guaranteed to never throw and always return a fully formatted error object.
 * @param {any} error
 * @returns {{
 *   general: string,
 *   fields: Record<string, string>,
 *   code: string | null,
 *   translationKey: string,
 *   source: 'axios' | 'supabase' | 'network' | 'unknown',
 *   kind: 'validation' | 'authentication' | 'authorization' | 'network' | 'server' | 'unknown',
 *   severity: 'info' | 'warning' | 'error',
 *   retryable: boolean,
 *   status: number | null,
 *   raw: any
 * }}
 */
export function parseError(error) {
    // 1. Fallback for completely null/undefined/empty input
    if (!error) {
        const registryEntry = getRegistryEntry(null);
        return {
            general: registryEntry.defaultMessage,
            fields: {},
            code: null,
            translationKey: registryEntry.translationKey,
            source: 'unknown',
            kind: 'unknown',
            severity: registryEntry.severity,
            retryable: registryEntry.retryable,
            status: null,
            raw: error,
        };
    }

    try {
        const source = detectErrorSource(error);
        let parsed;

        switch (source) {
            case 'axios':
                parsed = parseAxiosError(error);
                break;
            case 'supabase':
                parsed = parseSupabaseError(error);
                break;
            case 'network':
                parsed = parseNetworkError(error);
                break;
            default: {
                // Handle unknown errors, plain Error objects, custom string messages
                const msg = error.message || (typeof error === 'string' ? error : '');
                // Check if the message contains Axios-style code mapping
                const match = msg.match(/Request failed with status code (\d+)/);
                if (match) {
                    const status = parseInt(match[1], 10);
                    const axiosFake = { response: { status, data: null } };
                    parsed = parseAxiosError(axiosFake);
                } else {
                    const registryEntry = getRegistryEntry(null);
                    parsed = {
                        general: msg || registryEntry.defaultMessage,
                        fields: {},
                        code: null,
                        translationKey: registryEntry.translationKey,
                        source: 'unknown',
                        kind: 'unknown',
                        severity: registryEntry.severity,
                        retryable: registryEntry.retryable,
                        status: null,
                        raw: error,
                    };
                }
                break;
            }
        }

        // Apply localization hook on general message if i18n translation key exists
        if (parsed.translationKey && i18n && typeof i18n.t === 'function') {
            parsed.general = i18n.t(parsed.translationKey, { defaultValue: parsed.general });
        }

        return parsed;
    } catch (e) {
        console.error('[parseError] Critical error parser crash:', e);
        // Guaranteed fallback structure
        return {
            general: 'An unexpected error occurred. Please try again.',
            fields: {},
            code: 'PARSER_CRASH',
            translationKey: 'errors.generic',
            source: 'unknown',
            kind: 'unknown',
            severity: 'error',
            retryable: false,
            status: null,
            raw: error,
        };
    }
}

/**
 * Quick helper — returns just the general message string
 * @param {any} error
 * @returns {string}
 */
export function parseErrorMessage(error) {
    return parseError(error).general;
}

export default parseError;
