import axios from 'axios';
import { supabase } from './supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

// Public endpoints that don't need auth headers
const PUBLIC_ENDPOINTS = [
    '/users/patients/cities',
    '/users/patients/location/reverse',
];

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
        'x-app-name': 'Samvaya',
        'x-app-platform': 'mobile',
    },
});

// ─── §9 FIX: Token refresh queue to prevent parallel refreshes ─────────────
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach((prom) => {
        if (error) prom.reject(error);
        else prom.resolve(token);
    });
    failedQueue = [];
};

// ─── Request Interceptor: Attach JWT (skip for public endpoints) ───────────
api.interceptors.request.use(async (config) => {
    try {
        const isPublic = PUBLIC_ENDPOINTS.some((ep) => config.url?.includes(ep));
        if (!isPublic) {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (session?.access_token) {
                config.headers.Authorization = `Bearer ${session.access_token}`;
            }
        }
        config.metadata = { startTime: new Date() };
        return config;
    } catch {
        return config;
    }
});

// ─── Response Interceptor: 401 queue, 429, 500+, timeout, network ──────────
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const req = error.config;
        const url = req?.url || '';
        const isAuth = url.includes('/auth/');

        // ── 401: Token refresh with queue ───────────────────────────
        if (error.response?.status === 401 && !req._retry && !isAuth) {
            if (isRefreshing) {
                // Queue this request until refresh completes
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                })
                    .then((token) => {
                        req.headers.Authorization = `Bearer ${token}`;
                        return api(req);
                    })
                    .catch((err) => Promise.reject(err));
            }

            req._retry = true;
            isRefreshing = true;

            try {
                const {
                    data: { session },
                } = await supabase.auth.refreshSession();
                if (session?.access_token) {
                    processQueue(null, session.access_token);
                    req.headers.Authorization = `Bearer ${session.access_token}`;
                    return api(req);
                }
            } catch (refreshError) {
                processQueue(refreshError, null);
                await supabase.auth.signOut();
            } finally {
                isRefreshing = false;
            }
        }

        // ── 429: Too Many Requests ──────────────────────────────────
        if (error.response?.status === 429) {
            const retryAfter = error.response.headers?.['retry-after'] || 60;
            error.message = `Too many requests. Please wait ${retryAfter} seconds.`;
            return Promise.reject(error);
        }

        // ── 500+: Server errors ─────────────────────────────────────
        if (error.response?.status >= 500) {
            error.message = 'Server error. Please try again later.';
            return Promise.reject(error);
        }

        // ── Timeout ─────────────────────────────────────────────────
        if (error.code === 'ECONNABORTED') {
            error.message = 'Request timed out. Please check your connection and try again.';
            return Promise.reject(error);
        }

        // ── Network error (no response) ─────────────────────────────
        if (!error.response) {
            error.message = 'No internet connection. Please check your network.';
        }

        return Promise.reject(error);
    }
);

// ─── Users App API Service ──────────────────────────
export const apiService = {
    auth: {
        login: (creds) => api.post('/auth/login', creds),
        register: (data) => api.post('/auth/register', data),
        getProfile: (config) => api.get('/auth/me', config),
        updateProfile: (data) => api.put('/auth/me', data),
        updatePatientCity: (data) => api.put('/auth/patient-city', data),
        changePassword: (data) => api.post('/auth/change-password', data),
        resetPassword: (email) => api.post('/auth/reset-password', { email }),
        resetPasswordVerify: (data) => api.post('/auth/reset-password/verify', data),
        sendOtp: (identifier, type) => api.post('/auth/send-otp', { identifier, type }),
        verifyOtp: (identifier, otp, type) => api.post('/auth/verify-otp', { identifier, otp, type }),
        setPassword: (newPassword) => api.post('/auth/set-password', { newPassword }),
    },

    // Patient-specific endpoints
    patients: {
        getCities: () => api.get('/users/patients/cities'),
        searchLocation: (query) => api.get(`/users/patients/location/search?q=${encodeURIComponent(query)}`),
        reverseGeocode: (lat, lon) => api.get(`/users/patients/location/reverse?lat=${lat}&lon=${lon}`),
        getSavedAddresses: () => api.get('/users/patients/me/addresses'),
        addSavedAddress: (data) => api.post('/users/patients/me/addresses', data),
        updateSavedAddress: (id, data) => api.put(`/users/patients/me/addresses/${id}`, data),
        deleteSavedAddress: (id) => api.delete(`/users/patients/me/addresses/${id}`),
        getMe: () => api.get('/users/patients/me'),
        getProfile: () => api.get('/users/patients/me/profile'),
        updateConditions: (data) => api.put('/users/patients/me/conditions', data),
        updateAllergies: (data) => api.put('/users/patients/me/allergies', data),
        updateLifestyle: (data) => api.put('/users/patients/me/lifestyle', data),
        updateVaccinations: (data) => api.put('/users/patients/me/vaccinations', data),
        updateAppointments: (data) => api.put('/users/patients/me/appointments', data),
        updateMedications: (data) => api.put('/users/patients/me/medications', data),
        updateMedicalHistory: (data) => api.put('/users/patients/me/medical-history', data),
        updatePrimaryDoctor: (data) => api.put('/users/patients/me/primary-doctor', data),
        deleteHealthItem: (collection, id) => api.delete(`/users/patients/me/${collection}/${id}`),
        updateCallPreferences: (data) => api.put('/users/patients/me/call-preferences', data),
        updateMe: (data) => api.put('/users/patients/me', data),
        subscribe: (data) => api.post('/users/patients/subscribe', data),
        updateEmergencyContact: (data) => api.put('/users/patients/me/emergency-contact', data),
        getMyCaller: () => api.get('/users/patients/me/caller'),
        getMyCalls: (params) => api.get('/users/patients/me/calls', { params }),
        getMyMedications: () => api.get('/users/patients/me/medications'),
        flagIssue: (data) => api.post('/users/patients/me/flag-issue', data),
        requestMedicationModification: (data) => api.post('/users/patients/me/flag-issue', { type: 'medication_modification', description: data?.description || 'Patient requests medication review/modification on next call.' }),
        getPreviousCallers: () => api.get('/users/patients/me/previous-callers'),
        getVitals: (params) => api.get('/users/patients/me/vitals', { params }),
        logVitals: (data) => api.post('/users/patients/me/vitals', data),
        getTrustedContacts: () => api.get('/users/patients/me/trusted-contacts'),
        addTrustedContact: (data) => api.post('/users/patients/me/trusted-contacts', data),
        updateTrustedContact: (id, data) => api.put(`/users/patients/me/trusted-contacts/${id}`, data),
        deleteTrustedContact: (id) => api.delete(`/users/patients/me/trusted-contacts/${id}`),
        getNotifications: () => api.get('/users/patients/me/notifications'),
        markNotificationRead: (id) => api.put(`/users/patients/me/notifications/${id}/read`),
        getAIPrediction: () => api.get('/users/patients/me/ai-prediction'),
    },

    // Caller-specific endpoints
    callers: {
        getMe: () => api.get('/users/callers/me'),
        getTodayPatients: () => api.get('/users/callers/me/patients/today'),
        logCall: (data) => api.post('/users/callers/me/calls', data),
        getPatientProfile: (id) => api.get(`/users/callers/me/patients/${id}`),
        getStats: () => api.get('/users/callers/me/stats'),
    },

    // Medicine tracking
    medicines: {
        getToday: () => api.get('/users/medicines/today'),
        markMedicine: (data) => api.put('/users/medicines/mark', data),
        getWeeklyAdherence: () => api.get('/users/medicines/adherence/weekly'),
        getMonthlyAdherence: () => api.get('/users/medicines/adherence/monthly'),
    },
};

export const handleApiError = (error) => {
    if (error.response) {
        return {
            message: error.response.data?.error || 'An error occurred',
            status: error.response.status,
        };
    }
    return {
        message: error.message || 'An unexpected error occurred',
        status: null,
    };
};

export default api;
