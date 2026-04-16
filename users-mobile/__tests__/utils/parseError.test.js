import { parseError, parseErrorMessage } from '../../src/utils/parseError';

describe('parseError', () => {
    // ── Null / undefined input ─────────────────────────────────────────────
    describe('edge cases', () => {
        it('returns generic message for null error', () => {
            expect(parseError(null).general).toBe('An unknown error occurred.');
        });

        it('returns generic message for undefined error', () => {
            expect(parseError(undefined).general).toBe('An unknown error occurred.');
        });

        it('returns generic message for empty object', () => {
            expect(parseError({}).general).toBe('An unexpected error occurred. Please try again.');
        });
    });

    // ── Timeout errors ─────────────────────────────────────────────────────
    describe('timeout errors', () => {
        it('detects Axios ECONNABORTED code', () => {
            const error = { code: 'ECONNABORTED', message: 'timeout of 40000ms exceeded' };
            const result = parseError(error);
            expect(result.general).toContain('timed out');
        });

        it('detects timeout in message string', () => {
            const error = { message: 'Request timeout after 30s' };
            const result = parseError(error);
            expect(result.general).toContain('timed out');
        });
    });

    // ── Network errors ─────────────────────────────────────────────────────
    describe('network errors', () => {
        it('detects Network Error message', () => {
            const error = { message: 'Network Error', isAxiosError: true };
            const result = parseError(error);
            expect(result.general).toContain('No internet');
        });

        it('detects isAxiosError with no response', () => {
            const error = { message: 'something broke', isAxiosError: true };
            const result = parseError(error);
            expect(result.general).toContain('No internet');
        });
    });

    // ── Supabase AuthError ─────────────────────────────────────────────────
    describe('Supabase auth errors', () => {
        it('maps "Invalid login credentials" to user-friendly message', () => {
            const error = { __isAuthError: true, message: 'Invalid login credentials' };
            const result = parseError(error);
            expect(result.general).toBe('Incorrect email or password. Please try again.');
        });

        it('maps "User already registered" and sets email field error', () => {
            const error = { __isAuthError: true, message: 'User already registered' };
            const result = parseError(error);
            expect(result.general).toContain('already exists');
        });

        it('maps "Too many requests"', () => {
            const error = { __isAuthError: true, message: 'Too many requests' };
            const result = parseError(error);
            expect(result.general).toContain('Too many attempts');
        });

        it('maps password-related errors and sets fields.password', () => {
            const error = { __isAuthError: true, message: 'Password should be at least 6 characters' };
            const result = parseError(error);
            expect(result.fields.password).toBeDefined();
        });

        it('falls back to raw message for unknown Supabase errors', () => {
            const error = { __isAuthError: true, message: 'Some unknown Supabase error' };
            const result = parseError(error);
            expect(result.general).toBe('Some unknown Supabase error');
        });

        it('detects AuthApiError by name', () => {
            const error = { name: 'AuthApiError', message: 'Email not confirmed' };
            const result = parseError(error);
            expect(result.general).toContain('not verified');
        });
    });

    // ── Axios backend errors (error.response) ──────────────────────────────
    describe('Axios backend errors', () => {
        it('extracts error string from response.data.error', () => {
            const error = {
                response: { status: 400, data: { error: 'Invalid phone number format' } },
            };
            const result = parseError(error);
            expect(result.general).toBe('Invalid phone number format');
        });

        it('extracts message from response.data.message', () => {
            const error = {
                response: { status: 422, data: { message: 'Validation failed' } },
            };
            const result = parseError(error);
            expect(result.general).toBe('Validation failed');
        });

        it('extracts details from response.data.details', () => {
            const error = {
                response: { status: 500, data: { details: 'Database connection lost' } },
            };
            const result = parseError(error);
            expect(result.general).toBe('Database connection lost');
        });

        it('handles plain string response body', () => {
            const error = {
                response: { status: 400, data: 'Bad Request Body' },
            };
            const result = parseError(error);
            expect(result.general).toBe('Bad Request Body');
        });

        it('maps EMAIL_ALREADY_EXISTS code to field error', () => {
            const error = {
                response: { status: 409, data: { error: 'Email conflict', code: 'EMAIL_ALREADY_EXISTS' } },
            };
            const result = parseError(error);
            expect(result.general).toContain('already exists');
            expect(result.fields.email).toBeDefined();
        });

        it('maps INVALID_CREDENTIALS code', () => {
            const error = {
                response: { status: 401, data: { error: 'Bad creds', code: 'INVALID_CREDENTIALS' } },
            };
            const result = parseError(error);
            expect(result.general).toContain('Incorrect email or password');
        });

        it('falls back to HTTP status map when body is empty', () => {
            const error = {
                response: { status: 429, data: null },
            };
            const result = parseError(error);
            expect(result.general).toContain('Too many requests');
        });

        it('handles 500 status with empty body', () => {
            const error = {
                response: { status: 500, data: {} },
            };
            const result = parseError(error);
            expect(result.general).toContain('Server error');
        });

        it('handles 503 status (service unavailable)', () => {
            const error = {
                response: { status: 503, data: {} },
            };
            const result = parseError(error);
            expect(result.general).toContain('unavailable');
        });

        it('handles unknown HTTP status gracefully', () => {
            const error = {
                response: { status: 418, data: {} },
            };
            const result = parseError(error);
            expect(result.general).toContain('418');
        });
    });

    // ── Plain Error objects ─────────────────────────────────────────────────
    describe('plain Error objects', () => {
        it('extracts status code from Axios-style message fallback', () => {
            const error = new Error('Request failed with status code 401');
            const result = parseError(error);
            expect(result.general).toContain('Session expired');
        });

        it('matches Supabase messages even in plain errors', () => {
            const error = new Error('User not found');
            const result = parseError(error);
            expect(result.general).toContain('No account found');
        });

        it('passes through unrecognised plain error messages as-is', () => {
            const error = new Error('Something completely unexpected');
            const result = parseError(error);
            expect(result.general).toBe('Something completely unexpected');
        });
    });

    // ── parseErrorMessage shortcut ──────────────────────────────────────────
    describe('parseErrorMessage', () => {
        it('returns just the general string', () => {
            const error = { __isAuthError: true, message: 'Invalid login credentials' };
            expect(parseErrorMessage(error)).toBe('Incorrect email or password. Please try again.');
        });

        it('returns generic for null', () => {
            expect(parseErrorMessage(null)).toBe('An unknown error occurred.');
        });
    });
});
