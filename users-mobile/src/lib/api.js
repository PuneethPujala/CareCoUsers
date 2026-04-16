import axios from 'axios';
import { supabase } from './supabase';
import { getApiTokens, saveApiTokens, clearApiTokens } from './tokenStorage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

/** Plain client for refresh calls — avoids interceptor recursion */
const rawApi = axios.create({
    baseURL: API_BASE_URL,
    timeout: 20000,
    headers: { 'Content-Type': 'application/json' },
});

// Public endpoints that don't need auth headers
const PUBLIC_ENDPOINTS = ['/users/patients/cities', '/users/patients/location/reverse'];

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 40000,
    headers: {
        'Content-Type': 'application/json',
        'x-app-name': 'Samvaya',
        'x-app-platform': 'mobile',
    },
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach((prom) => {
        if (error) prom.reject(error);
        else prom.resolve(token);
    });
    failedQueue = [];
};

/**
 * Prefer CareConnect JWTs; fall back to Supabase (e.g. Google sign-in).
 */
async function getAccessTokenForRequest() {
    const apiTok = await getApiTokens();
    if (apiTok?.access_token) {
        const exp = apiTok.expires_at;
        const nowSec = Math.floor(Date.now() / 1000);
        const timeLeft = exp ? exp - nowSec : Infinity;
        if (timeLeft < 90 && apiTok.refresh_token) {
            try {
                const { data } = await rawApi.post('/auth/refresh', {
                    refresh_token: apiTok.refresh_token,
                });
                const s = data.session;
                await saveApiTokens({
                    access_token: s.access_token,
                    refresh_token: s.refresh_token,
                    expires_at: s.expires_at,
                });
                return s.access_token;
            } catch (e) {
                console.warn('[API] CareConnect proactive refresh failed:', e.message);
            }
        }
        return apiTok.access_token;
    }

    const {
        data: { session },
    } = await supabase.auth.getSession();
    if (session) {
        const expiresAt = session.expires_at;
        const timeRemaining = expiresAt ? expiresAt - Math.floor(Date.now() / 1000) : Infinity;
        if (timeRemaining < 60) {
            try {
                const { data } = await supabase.auth.refreshSession();
                return data?.session?.access_token || session.access_token;
            } catch (e) {
                console.warn('[API] Supabase proactive refresh failed:', e.message);
            }
        }
        return session.access_token;
    }
    return null;
}

api.interceptors.request.use(async (config) => {
    try {
        const isPublic = PUBLIC_ENDPOINTS.some((ep) => config.url?.includes(ep));
        if (!isPublic) {
            const token = await getAccessTokenForRequest();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        }
        config.metadata = { startTime: new Date() };
        return config;
    } catch {
        return config;
    }
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const req = error.config;
        const url = req?.url || '';
        const isAuth = url.includes('/auth/');

        if (error.response?.status === 401 && !req._retry && !isAuth) {
            if (isRefreshing) {
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
                const apiTok = await getApiTokens();
                if (apiTok?.refresh_token) {
                    try {
                        const { data } = await rawApi.post('/auth/refresh', {
                            refresh_token: apiTok.refresh_token,
                        });
                        const s = data.session;
                        await saveApiTokens({
                            access_token: s.access_token,
                            refresh_token: s.refresh_token,
                            expires_at: s.expires_at,
                        });
                        processQueue(null, s.access_token);
                        req.headers.Authorization = `Bearer ${s.access_token}`;
                        return api(req);
                    } catch {
                        await clearApiTokens();
                    }
                }

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
                await clearApiTokens();
                await supabase.auth.signOut();
            } finally {
                isRefreshing = false;
            }
        }

        if (error.response?.status === 429) {
            error.retryAfter = error.response.headers?.['retry-after'] || 60;
            return Promise.reject(error);
        }

        return Promise.reject(error);
    }
);

export const apiService = {
    auth: {
        login: (creds) => api.post('/auth/login', creds),
        register: (data) => api.post('/auth/register', data),
        refresh: (refreshToken) => api.post('/auth/refresh', { refresh_token: refreshToken }),
        getProfile: (config) => api.get('/auth/me', config),
        updateProfile: (data) => api.put('/auth/me', data),
        updatePatientCity: (data) => api.put('/auth/patient-city', data),
        changePassword: (data) => api.post('/auth/change-password', data),
        resetPassword: (email) => api.post('/auth/reset-password', { email }),
        resetPasswordVerify: (data) => api.post('/auth/reset-password/verify', data),
        sendOtp: (identifier, type) => api.post('/auth/send-otp', { identifier, type }),
        verifyOtp: (identifier, otp, type) => api.post('/auth/verify-otp', { identifier, otp, type }),
        setPassword: (newPassword) => api.post('/auth/set-password', { newPassword }),
        deleteAccount: () => api.delete('/auth/me'),
    },

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
        updateMedicalHistory: (data) => api.put('/users/patients/me/medical-history', data),
        uploadPrescription: (data) => api.post('/users/patients/me/prescriptions', data),
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
        requestMedicationModification: (data) =>
            api.post('/users/patients/me/flag-issue', {
                type: 'medication_modification',
                description: data?.description || 'Patient requests medication review/modification on next call.',
            }),
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
        syncVitals: (data) => api.post('/vitals/sync', data),
        getSyncStatus: () => api.get('/vitals/sync/status'),
    },

    callers: {
        getMe: () => api.get('/users/callers/me'),
        getTodayPatients: () => api.get('/users/callers/me/patients/today'),
        logCall: (data) => api.post('/users/callers/me/calls', data),
        getPatientProfile: (id) => api.get(`/users/callers/me/patients/${id}`),
        updatePatientMedications: (id, medications) => api.patch(`/users/callers/me/patients/${id}/medications`, { medications }),
        getStats: () => api.get('/users/callers/me/stats'),
    },

    medicines: {
        getToday: () => api.get('/users/medicines/today'),
        markMedicine: (data) => api.put('/users/medicines/mark', data),
        getWeeklyAdherence: () => api.get('/users/medicines/adherence/weekly'),
        getMonthlyAdherence: () => api.get('/users/medicines/adherence/monthly'),
    },
};

import { parseError } from '../utils/parseError';

export const handleApiError = (error) => {
    const parsed = parseError(error);
    return {
        message: parsed.general || 'An unexpected error occurred',
        status: error.response?.status || null,
        fields: parsed.fields || {},
    };
};

export { clearApiTokens, saveApiTokens, getApiTokens };
export default api;
