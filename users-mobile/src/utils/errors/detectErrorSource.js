/**
 * Detect the error source.
 * @param {any} error 
 * @returns {'axios' | 'supabase' | 'network' | 'unknown'}
 */
export function detectErrorSource(error) {
    if (!error) return 'unknown';

    // 1. Check if it's an Axios error
    if (error.isAxiosError === true || (error.config && error.headers)) {
        // If there's no response from the server, it's a network/timeout issue
        if (!error.response) {
            return 'network';
        }
        return 'axios';
    }

    // 2. Check if it's a Supabase error
    if (
        error.__isAuthError ||
        error.name === 'AuthApiError' ||
        (error.status && !error.response)
    ) {
        return 'supabase';
    }

    // 3. Fallback check for network strings
    if (
        error.code === 'ECONNABORTED' ||
        error.message?.includes('timeout') ||
        error.message === 'Network Error'
    ) {
        return 'network';
    }

    return 'unknown';
}
