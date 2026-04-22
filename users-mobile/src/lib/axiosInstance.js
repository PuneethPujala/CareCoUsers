import axios from 'axios';
import { supabase } from './supabase';

// ─── Base Configuration ─────────────────────────────────────────
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

const axiosInstance = axios.create({
    baseURL: BASE_URL,
    timeout: 10000, // 10 seconds — never let requests hang forever
    headers: {
        'Content-Type': 'application/json',
    },
});

// ─── Request Interceptor ────────────────────────────────────────
// Attaches the Supabase JWT on every outgoing request.
axiosInstance.interceptors.request.use(
    async (config) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
                config.headers.Authorization = `Bearer ${session.access_token}`;
            }
        } catch (err) {
            // Silently continue — token attachment is best-effort
        }

        // Dev-mode logging
        if (__DEV__) {
            console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
        }

        // Initialize retry counter
        if (config._retryCount === undefined) {
            config._retryCount = 0;
        }

        return config;
    },
    (error) => Promise.reject(error)
);

// ─── Response Interceptor ───────────────────────────────────────
// Handles 4xx/5xx, timeout, network errors, and auto-retry.
axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const config = error.config;

        // ── Auto-retry mechanism (max 2 retries, exponential backoff) ──────
        if (config && config._retryCount < 2) {
            config._retryCount += 1;
            if (__DEV__) {
                console.log(`[API] Retry ${config._retryCount}/2 for ${config.url}`);
            }
            // Wait with exponential backoff (1s, 2s)
            const delay = Math.pow(2, config._retryCount - 1) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
            return axiosInstance(config);
        }

        // ── Timeout (ECONNABORTED) ──────────────────────────────
        if (error.code === 'ECONNABORTED') {
            error._userMessage = 'Request timed out — the server is taking too long to respond. Try again.';
            return Promise.reject(error);
        }

        // ── Server returned 4xx / 5xx ───────────────────────────
        if (error.response) {
            error._userMessage =
                error.response.data?.message ||
                error.response.data?.error ||
                `Server error (${error.response.status})`;
            return Promise.reject(error);
        }

        // ── Request made but no response (network down) ─────────
        if (error.request) {
            error._userMessage = 'Network error — please check your internet connection.';
            return Promise.reject(error);
        }

        // ── Generic / unknown ───────────────────────────────────
        error._userMessage = 'Something went wrong. Please try again later.';
        return Promise.reject(error);
    }
);

// ─── Error handler utility ──────────────────────────────────────
// Returns a clean, user-facing error string from any Axios error.
export const handleAxiosError = (error) => {
    if (error._userMessage) return error._userMessage;
    if (error.code === 'ECONNABORTED') return 'Request timed out — the server is taking too long to respond. Try again.';
    if (error.response) return error.response.data?.message || error.response.data?.error || `Server error (${error.response.status})`;
    if (error.request) return 'Network error — please check your internet connection.';
    return error.message || 'Something went wrong. Please try again later.';
};

export default axiosInstance;
