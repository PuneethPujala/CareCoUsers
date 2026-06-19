import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { getApiTokens, saveApiTokens, clearApiTokens } from './tokenStorage';
import usePatientStore from '../store/usePatientStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

/** Plain client for refresh calls — avoids interceptor recursion */
const rawApi = axios.create({
    baseURL: API_BASE_URL,
    timeout: 20000,
    headers: { 'Content-Type': 'application/json' },
});

// Public endpoints that don't need auth headers
const PUBLIC_ENDPOINTS = ['/users/patients/cities', '/users/patients/location/reverse', '/health'];

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 40000,
    headers: {
        'Content-Type': 'application/json',
        'x-app-name': 'CareMyMed',
        'x-app-platform': 'mobile',
        'X-Requested-Role': 'patient',
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
 * Prefer CareMyMednnect JWTs; fall back to Supabase (e.g. Google sign-in).
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
                console.warn('[API] CareMyMednnect proactive refresh failed:', e.message);
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

        // Read cached profile from SecureStore to set the correct role header.
        // This prevents identity leaks for dual-role users (e.g. same email as Patient + Companion).
        try {
            if (Platform.OS !== 'web') {
                const profileStr = await SecureStore.getItemAsync('CareMyMed_user_profile');
                if (profileStr) {
                    const profile = JSON.parse(profileStr);
                    if (profile?.role) {
                        config.headers['X-Requested-Role'] = profile.role;
                    }
                }
            }
        } catch { }

        // Apply chaos network simulation if configured (excluding critical authentication flows)
        const isAuthRoute = config.url && (
            config.url.includes('/auth/refresh') ||
            config.url.includes('/auth/login') ||
            config.url.includes('/auth/register') ||
            config.url.includes('/auth/send-otp') ||
            config.url.includes('/auth/verify-otp') ||
            config.url.includes('/auth/logout')
        );

        if (!isAuthRoute) {
            const simulationMode = usePatientStore.getState().networkSimulationMode;
            if (simulationMode === 'offline') {
                const error = new Error('Network Error');
                error.isAxiosError = true;
                error.config = config;
                throw error;
            } else if (simulationMode === 'flaky') {
                // 50% random failure
                if (Math.random() < 0.5) {
                    console.warn(`[Chaos Interceptor] Simulated 50% flaky drop for ${config.url}`);
                    const error = new Error('Network Error');
                    error.isAxiosError = true;
                    error.config = config;
                    throw error;
                }
            } else if (simulationMode === 'slow') {
                console.log(`[Chaos Interceptor] Simulated 3000ms delay for ${config.url}`);
                await new Promise((resolve) => setTimeout(resolve, 3000));
            }
        }

        config.metadata = { startTime: new Date() };
        return config;
    } catch (err) {
        // If it's a simulated network error, rethrow it so Axios cancels the request
        if (err.message === 'Network Error') {
            throw err;
        }
        return config;
    }
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const req = error.config;
        const url = req?.url || '';
        const isSkipRefreshEndpoint = 
            url.includes('/auth/login') || 
            url.includes('/auth/register') || 
            url.includes('/auth/refresh') || 
            url.includes('/auth/send-otp') || 
            url.includes('/auth/verify-otp');

        if (error.response?.status === 401 && !req._retry && !isSkipRefreshEndpoint) {
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
        logout: () => api.post('/auth/logout'),
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
        deactivateAccount: () => api.post('/auth/me/deactivate'),
        exportMyData: () => api.get('/auth/me/export'),
        // MFA endpoints (Audit 2.1-2.4, 2.8)
        mfaSetup: () => api.post('/auth/mfa/setup'),
        mfaVerifySetup: (code) => api.post('/auth/mfa/verify-setup', { code }),
        mfaVerify: (mfa_token, code) => api.post('/auth/mfa/verify', { mfa_token, code }),
        mfaDisable: (password) => api.post('/auth/mfa/disable', { password }),
        mfaStatus: () => api.get('/auth/mfa/status'),
        uploadAvatar: (data) => api.post('/auth/me/avatar', data),
        switchRole: (targetRole) => api.post('/auth/switch-role', { targetRole }),
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
        getDashboard: () => api.get('/users/patients/me/dashboard'),
        getProfile: () => api.get('/users/patients/me/profile'),
        updateConditions: (data) => api.put('/users/patients/me/conditions', data),
        updateAllergies: (data) => api.put('/users/patients/me/allergies', data),
        updateLifestyle: (data) => api.put('/users/patients/me/lifestyle', data),
        updateVaccinations: (data) => api.put('/users/patients/me/vaccinations', data),
        updateAppointments: (data) => api.put('/users/patients/me/appointments', data),
        updateMedicalHistory: (data) => api.put('/users/patients/me/medical-history', data),
        updateMedications: (data) => api.put('/users/patients/me/medications', data),
        uploadPrescription: (data) => api.post('/users/patients/me/prescriptions', data),
        updatePrimaryDoctor: (data) => api.put('/users/patients/me/primary-doctor', data),
        deleteHealthItem: (collection, id) => api.delete(`/users/patients/me/${collection}/${id}`),
        updateCallPreferences: (data) => api.put('/users/patients/me/call-preferences', data),
        extractOCR: (imageBase64) => api.post('/ocr/extract', { imageBase64 }),
        updateMe: (data) => api.put('/users/patients/me', data),
        uploadAvatar: (data) => api.post('/users/patients/me/avatar', data),
        initiatePayment: (data) => api.post('/users/patients/initiate-payment', data),
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
                file_url: data?.file_url,
                extracted_medicines: data?.extracted_medicines,
            }),
        getPreviousCallers: () => api.get('/users/patients/me/previous-callers'),
        getVitals: (params) => api.get('/users/patients/me/vitals', { params }),
        logVitals: (data) => api.post('/users/patients/me/vitals', data),
        logMood: (value) => api.post('/users/patients/me/mood', { value }),
        getHealthHistory: () => api.get('/users/patients/me/health-history'),
        getHealthTimeline: () => api.get('/users/patients/me/health-timeline'),
        getSleep: (params) => api.get('/users/patients/me/sleep', { params }),
        logSleep: (data) => api.post('/users/patients/me/sleep', data),
        getTrustedContacts: () => api.get('/users/patients/me/trusted-contacts'),
        addTrustedContact: (data) => api.post('/users/patients/me/trusted-contacts', data),
        updateTrustedContact: (id, data) => api.put(`/users/patients/me/trusted-contacts/${id}`, data),
        deleteTrustedContact: (id) => api.delete(`/users/patients/me/trusted-contacts/${id}`),
        getNotifications: (params) => api.get('/users/patients/notifications', { params }),
        getNotificationsUnreadCount: () => api.get('/users/patients/notifications/unread-count'),
        markNotificationRead: (id) => api.patch(`/users/patients/notifications/${id}/read`),
        markAllNotificationsRead: () => api.patch('/users/patients/notifications/read-all'),
        getAIPrediction: () => api.get('/users/patients/me/ai-prediction'),
        syncVitals: (data) => api.post('/vitals/sync', data),
        getSyncStatus: () => api.get('/vitals/sync/status'),

        requestScreenshotOTP: () => api.post('/users/patients/me/security/screenshots/request-otp'),
        verifyScreenshotOTP: (otp) => api.post('/users/patients/me/security/screenshots/verify-otp', { otp }),

        // Family Companion
        generateInviteCode: () => api.post('/users/patients/me/invite-code'),
        revokeCompanionAccess: (id) => api.delete(`/users/patients/me/companions/${id}`),

        requestEcOTP: () => api.post('/users/patients/me/security/emergency-contact/request-otp'),
        verifyEcOTP: (data) => api.post('/users/patients/me/security/emergency-contact/verify', data),

        // Telehealth Calling & Sessions
        getAgoraToken: () => api.get('/users/patients/me/agora-token'),
        initiateCall: () => api.post('/users/patients/me/calls/initiate'),
        getCallSessionStatus: (sid) => api.get(`/users/patients/me/calls/${sid}/status`),
        acceptCallSim: (sid) => api.post(`/users/patients/me/calls/${sid}/accept`),
        rejectCallSim: (sid) => api.post(`/users/patients/me/calls/${sid}/reject`),
        endCall: (sid) => api.post(`/users/patients/me/calls/${sid}/end`),
        requestCallback: (sid) => api.post(`/users/patients/me/calls/${sid}/callback-request`),
        sendSecureMessageFallback: (sid, text, priority) => api.post(`/users/patients/me/calls/${sid}/secure-message`, { text, priority }),
        submitFeedback: (sid, rating, notes) => api.post(`/users/patients/me/calls/${sid}/feedback`, { rating, notes }),
        getCopilotContext: () => api.get('/users/patients/copilot/context'),
    },

    companion: {
        join: (data) => api.post('/companion/join', data),
        updateProfile: (data) => api.put('/companion/profile', data),
        checkEmail: (data) => api.post('/companion/check-email', data),
        joinOtp: (data) => api.post('/companion/join-otp', data),
        linkPatient: (data) => api.post('/companion/link-patient', data),
        getPatientStatus: (params) => api.get('/companion/patient-status', { params }),
        acknowledgeAlert: (id) => api.post(`/companion/alerts/${id}/acknowledge`),
        nudge: (data) => api.post('/companion/nudge', data),
        requestBP: (data) => api.post('/companion/request-bp', data),
        generateInviteCode: (patientId) => api.post(`/companion/patients/${patientId}/invite-code`),
        refreshInsights: (data) => api.post('/companion/patient-status/refresh-insights', data),
        getInterventions: (params) => api.get('/companion/interventions', { params }),
        completeIntervention: (data) => api.post('/companion/interventions', data),
        getExtendedAnalytics: (params) => api.get('/companion/analytics-extended', { params }),
    },

    callers: {
        getMe: () => api.get('/users/callers/me'),
        getTodayPatients: () => api.get('/users/callers/me/patients/today'),
        logCall: (data) => api.post('/users/callers/me/calls', data),
        getPatientProfile: (id) => api.get(`/users/callers/me/patients/${id}`),
        updatePatientMedications: (id, medications) => api.patch(`/users/callers/me/patients/${id}/medications`, { medications }),
        getStats: () => api.get('/users/callers/me/stats'),
        getActivityFeed: () => api.get('/users/callers/me/feed'),
        resolveAlert: (alertId, data) => api.post(`/users/callers/me/alerts/${alertId}/resolve`, data),
    },

    medicines: {
        getToday: () => api.get('/users/medicines/today'),
        markMedicine: (data) => api.put('/users/medicines/mark', data),
        markSlotTaken: (data) => api.put('/users/medicines/mark-slot', data),
        getWeeklyAdherence: () => api.get('/users/medicines/adherence/weekly'),
        getMonthlyAdherence: () => api.get('/users/medicines/adherence/monthly'),
        getAdherenceDetails: () => api.get('/users/medicines/adherence/details'),
        getAdherenceRecap: (period) => api.get('/users/medicines/adherence/recap', { params: { period } }),
        refill: (name, newTotal) => api.post(`/users/medicines/${encodeURIComponent(name)}/refill`, { newTotal }),
        getWeeklySummary: () => api.get('/users/medicines/adherence/weekly-summary'),
        getTempMeds: () => api.get('/users/medicines/temp-meds'),
        addTempMed: (data) => api.post('/users/medicines/temp-meds', data),
        deleteTempMed: (medId) => api.delete(`/users/medicines/temp-meds/${medId}`),
    },
    chatbot: {
        getSessions: (params) => api.get('/chatbot/sessions', { params }),
        createSession: (data) => api.post('/chatbot/sessions', data),
        getSession: (id, params, config) => api.get(`/chatbot/sessions/${id}`, { params, ...config }),
        deleteSession: (id, params) => api.delete(`/chatbot/sessions/${id}`, { params }),
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
