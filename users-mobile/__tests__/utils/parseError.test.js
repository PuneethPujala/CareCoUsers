import { parseError, parseErrorMessage } from '../../src/utils/parseError';

describe('parseError Contract Tests', () => {
    // ── Safe Parser Invocation (Never Throws) ─────────────────────────────────
    describe('safe boundary check (never throws)', () => {
        const testInputs = [
            { label: 'null', input: null },
            { label: 'undefined', input: undefined },
            { label: 'empty object', input: {} },
            { label: 'number', input: 123 },
            { label: 'empty array', input: [] },
            { label: 'string', input: 'abc' },
            { label: 'generic Error object', input: new Error('Some standard error') },
            { label: 'nested empty data', input: { response: { data: {} } } },
        ];

        testInputs.forEach(({ label, input }) => {
            it(`safely handles ${label} without throwing`, () => {
                let result;
                expect(() => {
                    result = parseError(input);
                }).not.toThrow();

                // Every single result must be normalized
                expect(result).toBeDefined();
                expect(result).toHaveProperty('general');
                expect(result).toHaveProperty('fields');
                expect(result).toHaveProperty('code');
                expect(result).toHaveProperty('translationKey');
                expect(result).toHaveProperty('source');
                expect(result).toHaveProperty('kind');
                expect(result).toHaveProperty('severity');
                expect(result).toHaveProperty('retryable');
                expect(result).toHaveProperty('status');
                expect(result).toHaveProperty('raw');
            });
        });
    });

    // ── Timeout Errors ─────────────────────────────────────────────────────
    describe('timeout and network transport errors', () => {
        it('detects Axios ECONNABORTED code as TIMEOUT', () => {
            const error = { code: 'ECONNABORTED', message: 'timeout of 40000ms exceeded', isAxiosError: true };
            const result = parseError(error);
            expect(result.code).toBe('TIMEOUT');
            expect(result.source).toBe('network');
            expect(result.kind).toBe('network');
            expect(result.severity).toBe('error');
            expect(result.retryable).toBe(true);
            expect(result.status).toBe(408);
            expect(result.translationKey).toBe('errors.timeout');
        });

        it('detects timeout in message string', () => {
            const error = new Error('Request timeout after 30s');
            const result = parseError(error);
            expect(result.code).toBe('TIMEOUT');
            expect(result.source).toBe('network');
            expect(result.kind).toBe('network');
            expect(result.retryable).toBe(true);
            expect(result.translationKey).toBe('errors.timeout');
        });

        it('detects Network Error message as OFFLINE', () => {
            const error = { message: 'Network Error', isAxiosError: true };
            const result = parseError(error);
            expect(result.code).toBe('OFFLINE');
            expect(result.source).toBe('network');
            expect(result.kind).toBe('network');
            expect(result.severity).toBe('error');
            expect(result.retryable).toBe(true);
            expect(result.translationKey).toBe('errors.offline');
        });

        it('detects isAxiosError with no response as OFFLINE', () => {
            const error = { message: 'something broke', isAxiosError: true };
            const result = parseError(error);
            expect(result.code).toBe('OFFLINE');
            expect(result.source).toBe('network');
            expect(result.kind).toBe('network');
            expect(result.retryable).toBe(true);
            expect(result.translationKey).toBe('errors.offline');
        });
    });

    // ── Supabase AuthError ─────────────────────────────────────────────────
    describe('Supabase auth errors', () => {
        it('maps "Invalid login credentials" to normalized structure', () => {
            const error = { __isAuthError: true, message: 'Invalid login credentials', status: 400 };
            const result = parseError(error);
            expect(result.code).toBe('INVALID_CREDENTIALS');
            expect(result.source).toBe('supabase');
            expect(result.kind).toBe('authentication');
            expect(result.severity).toBe('warning');
            expect(result.retryable).toBe(true);
            expect(result.status).toBe(400);
            expect(result.translationKey).toBe('errors.invalid_credentials');
        });

        it('maps "User already registered" and sets email field error', () => {
            const error = { name: 'AuthApiError', message: 'User already registered', status: 400 };
            const result = parseError(error);
            expect(result.code).toBe('EMAIL_ALREADY_EXISTS');
            expect(result.source).toBe('supabase');
            expect(result.kind).toBe('authentication');
            expect(result.fields.email).toBe('Email already registered');
            expect(result.translationKey).toBe('errors.email_already_exists');
        });

        it('maps password-related errors and sets fields.password', () => {
            const error = { __isAuthError: true, message: 'Password should be at least 6 characters' };
            const result = parseError(error);
            expect(result.code).toBe('PASSWORD_TOO_SHORT');
            expect(result.fields.password).toBe('Password must be at least 6 characters');
            expect(result.translationKey).toBe('errors.password_too_short');
        });

        it('falls back to default fallback metadata for unknown Supabase errors', () => {
            const error = { __isAuthError: true, message: 'Some unknown Supabase error' };
            const result = parseError(error);
            expect(result.code).toBeNull();
            expect(result.source).toBe('supabase');
            expect(result.kind).toBe('authentication');
            expect(result.translationKey).toBe('errors.generic');
        });
    });

    // ── Axios Backend Errors (error.response) ──────────────────────────────
    describe('Axios backend errors', () => {
        it('extracts error string from response.data.error', () => {
            const error = {
                isAxiosError: true,
                response: { status: 400, data: { error: 'Invalid phone number format' } },
            };
            const result = parseError(error);
            expect(result.general).toBe('Invalid phone number format');
            expect(result.source).toBe('axios');
        });

        it('handles plain string response body', () => {
            const error = {
                isAxiosError: true,
                response: { status: 400, data: 'Bad Request Body' },
            };
            const result = parseError(error);
            expect(result.general).toBe('Bad Request Body');
            expect(result.source).toBe('axios');
        });

        it('maps EMAIL_ALREADY_EXISTS code and sets fields.email', () => {
            const error = {
                isAxiosError: true,
                response: { status: 409, data: { error: 'Email conflict', code: 'EMAIL_ALREADY_EXISTS' } },
            };
            const result = parseError(error);
            expect(result.code).toBe('EMAIL_ALREADY_EXISTS');
            expect(result.fields.email).toBe('Email already registered');
            expect(result.kind).toBe('validation');
            expect(result.severity).toBe('warning');
            expect(result.retryable).toBe(false);
            expect(result.translationKey).toBe('errors.email_already_exists');
        });

        it('maps SERVICE_UNAVAILABLE 503 code', () => {
            const error = {
                isAxiosError: true,
                response: { status: 503, data: { error: 'Busy', code: 'SERVICE_UNAVAILABLE' } },
            };
            const result = parseError(error);
            expect(result.code).toBe('SERVICE_UNAVAILABLE');
            expect(result.kind).toBe('server');
            expect(result.severity).toBe('error');
            expect(result.retryable).toBe(true);
            expect(result.translationKey).toBe('errors.service_unavailable');
        });

        it('maps unknown backend code to registry defaults safely', () => {
            const error = {
                isAxiosError: true,
                response: { status: 400, data: { error: 'New policy check failed', code: 'NEW_POLICY_VIOLATION' } },
            };
            const result = parseError(error);
            expect(result.code).toBe('NEW_POLICY_VIOLATION');
            expect(result.translationKey).toBe('errors.generic'); // default fallback key
            expect(result.severity).toBe('error');
            expect(result.retryable).toBe(false);
        });

        it('falls back to HTTP status map when response body is completely empty', () => {
            const error = {
                isAxiosError: true,
                response: { status: 429, data: null },
            };
            const result = parseError(error);
            expect(result.code).toBe('TOO_MANY_REQUESTS');
            expect(result.translationKey).toBe('errors.too_many_requests');
            expect(result.retryable).toBe(true);
        });

        it('handles malformed empty object response safely', () => {
            const error = {
                isAxiosError: true,
                response: { status: 500, data: {} },
            };
            const result = parseError(error);
            expect(result.code).toBe('SERVER_ERROR');
            expect(result.translationKey).toBe('errors.server_error');
            expect(result.retryable).toBe(false);
        });
    });

    // ── Plain Error Objects and Strings ─────────────────────────────────────
    describe('plain error objects and status strings', () => {
        it('extracts status code from Axios-style message fallback string', () => {
            const error = new Error('Request failed with status code 401');
            const result = parseError(error);
            expect(result.code).toBe('INVALID_CREDENTIALS');
            expect(result.source).toBe('axios');
            expect(result.translationKey).toBe('errors.invalid_credentials');
        });

        it('passes through unrecognized plain error messages as-is', () => {
            const error = new Error('Something completely unexpected');
            const result = parseError(error);
            expect(result.general).toBe('Something completely unexpected');
            expect(result.source).toBe('unknown');
            expect(result.code).toBeNull();
            expect(result.translationKey).toBe('errors.generic');
        });
    });

    // ── parseErrorMessage Helper ─────────────────────────────────────────────
    describe('parseErrorMessage helper', () => {
        it('returns just the general message string', () => {
            const error = { __isAuthError: true, message: 'Invalid login credentials' };
            expect(parseErrorMessage(error)).toBe('Incorrect email or password.');
        });
    });
});
