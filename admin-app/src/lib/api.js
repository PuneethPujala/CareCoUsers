import axios from 'axios';
import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Dynamically resolve the API base URL so it works on emulators,
// simulators, and physical devices without manual configuration.
const getApiBaseUrl = () => {
  // 1. Explicit env var always wins
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  const BACKEND_PORT = 5000;

  // 2. On Android emulator, localhost maps to 10.0.2.2
  if (Platform.OS === 'android') {
    // Try to get the dev machine's IP from Expo's debugger host
    const debuggerHost =
      Constants.expoConfig?.hostUri ||         // SDK 49+
      Constants.manifest?.debuggerHost ||      // older SDKs
      Constants.manifest2?.extra?.expoGo?.debuggerHost;

    if (debuggerHost) {
      const host = debuggerHost.split(':')[0]; // strip the Expo port
      return `http://${host}:${BACKEND_PORT}/api`;
    }
    // Fallback for plain Android emulator (AVD)
    return `http://10.0.2.2:${BACKEND_PORT}/api`;
  }

  // 3. On iOS / Web — try the debugger host first, then fall back to localhost
  const debuggerHost =
    Constants.expoConfig?.hostUri ||
    Constants.manifest?.debuggerHost ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost;

  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return `http://${host}:${BACKEND_PORT}/api`;
  }

  return `http://localhost:${BACKEND_PORT}/api`;
};

const API_BASE_URL = getApiBaseUrl();
console.log('[API] Base URL resolved to:', API_BASE_URL);

// Export for use in useGoogleAuth hook
export { getApiBaseUrl };

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'x-app-name': 'CareConnect',
    'x-app-platform': 'mobile',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    try {
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }

      // Add request timestamp for performance tracking
      config.metadata = { startTime: new Date() };

      return config;
    } catch (error) {
      console.warn('Request interceptor error:', error?.message);
      return config;
    }
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors and token refresh
api.interceptors.response.use(
  (response) => {
    // Calculate response time for monitoring
    const endTime = new Date();
    const duration = endTime - response.config.metadata.startTime;

    // Log slow requests
    if (duration > 2000) {
      console.log(`Slow API request: ${response.config.method?.toUpperCase()} ${response.config.url} took ${duration}ms`);
    }

    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized errors
    // Skip token refresh for auth endpoints — their 401s mean invalid credentials, not expired tokens
    const requestUrl = originalRequest?.url || '';
    const isAuthEndpoint = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register') || requestUrl.includes('/auth/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        // Attempt to refresh the session
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError) {
          // Refresh failed — expected if no session exists (e.g. app startup)
          console.log('Token refresh skipped:', refreshError?.message);
          await supabase.auth.signOut();
          return Promise.reject(error); // reject with ORIGINAL error, not refresh error
        }

        // Update the request with new token
        if (session?.access_token) {
          originalRequest.headers.Authorization = `Bearer ${session.access_token}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        console.log('Session refresh skipped:', refreshError?.message);
        return Promise.reject(error); // reject with ORIGINAL error
      }
    }

    // Handle 403 Organization Suspended
    if (error.response?.status === 403 && error.response?.data?.code === 'ORGANIZATION_SUSPENDED') {
      console.log('Organization suspended, logging out.');
      Alert.alert('Access Revoked', 'Your organization is deactivated. It will be activated soon.');
      supabase.auth.signOut().catch(() => { });
      return Promise.reject(error);
    }

    // Handle network errors
    if (!error.response) {
      console.log('Network error:', error.message);
      error.message = 'Network error. Please check your internet connection.';
    }

    // Handle server errors
    if (error.response?.status >= 500) {
      console.log('Server error:', error.response?.status, error.response?.data?.details);
      error.message = error.response?.data?.details || error.response?.data?.error || 'Server error. Please try again later.';
    }

    return Promise.reject(error);
  }
);

// API service methods
export const apiService = {
  // Authentication endpoints
  auth: {
    login: (credentials) => api.post('/auth/login', credentials),
    detectRole: (data) => api.post('/auth/detect-role', data),
    register: (userData) => api.post('/auth/register', userData),
    logout: () => api.post('/auth/logout'),
    refreshToken: (refreshToken) => api.post('/auth/refresh', { refresh_token: refreshToken }),
    resetPassword: (email) => api.post('/auth/reset-password', { email }),
    getProfile: () => api.get('/auth/me'),
    updateProfile: (data) => api.put('/auth/me', data),
    changePassword: (data) => api.post('/auth/change-password', data),
    createUser: (data) => api.post('/auth/create-user', data),
    googleLogin: (data) => api.post('/auth/google-login', data),
    sendResetOtp: (data) => api.post('/auth/forgot-password/send-otp', data),
    verifyResetOtp: (data) => api.post('/auth/forgot-password/verify-otp', data),
    resetPasswordWithOtp: (data) => api.post('/auth/forgot-password/reset', data),
  },

  // Dashboard endpoints
  dashboard: {
    getSuperAdminStats: () => api.get('/dashboard/super-admin-stats'),
    getOrgAdminStats: () => api.get('/dashboard/org-admin-stats'),
    getCareManagerStats: () => api.get('/dashboard/care-manager-stats'),
  },

  // Profile endpoints
  profiles: {
    getMe: () => api.get('/profile/me'),
    getById: (id) => api.get(`/profile/${id}`),
    getAll: (params) => api.get('/profile', { params }),
    create: (data) => api.post('/profile', data),
    update: (id, data) => api.put(`/profile/${id}`, data),
    delete: (id) => api.delete(`/profile/${id}`),
    getByOrganization: (orgId, params) => api.get(`/profile/organization/${orgId}`, { params }),
  },

  // Patient endpoints
  patients: {
    getAll: (params) => api.get('/patients', { params }),
    getById: (id) => api.get(`/patients/${id}`),
    create: (data) => api.post('/patients', data),
    update: (id, data) => api.put(`/patients/${id}`, data),
    assignCaretaker: (caretakerId, patientId, data) =>
      api.post(`/patients/${caretakerId}/assign/${patientId}`, data),
    unassignCaretaker: (caretakerId, patientId, reason) =>
      api.delete(`/patients/${caretakerId}/unassign/${patientId}`, { data: { reason } }),
    getCaretakers: (id, params) => api.get(`/patients/${id}/caretakers`, { params }),
    authorizeMentor: (id, data) => api.post(`/patients/${id}/mentors/authorize`, data),
    revokeMentor: (id, mentorId, reason) =>
      api.delete(`/patients/${id}/mentors/${mentorId}/revoke`, { data: { reason } }),
    getMentors: (id, params) => api.get(`/patients/${id}/mentors`, { params }),
    toggleMedication: (patientId, medId, dateString, timeString) => api.post(`/patients/${patientId}/medications/${medId}/toggle`, { date: dateString, time: timeString }),
  },

  // Manager endpoints (Care Manager)
  manager: {
    getDashboard: () => api.get('/manager/dashboard'),
    reconcile: () => api.post('/manager/reconcile'),
  },

  // Org Admin endpoints
  org: {
    getDashboard: () => api.get('/org/dashboard'),
    reconcile: () => api.post('/org/reconcile'),
  },

  // Caretaker endpoints (Admin managing caretakers)
  caretakers: {
    getAll: (params) => api.get('/caretakers', { params }),
    getById: (id) => api.get(`/caretakers/${id}`),
    getPatients: (id, params) => api.get(`/caretakers/${id}/patients`, { params }),
    addNote: (id, patientId, data) =>
      api.post(`/caretakers/${id}/patients/${patientId}/notes`, data),
  },

  // Caretaker endpoints (Logged-in caretaker)
  caretaker: {
    getDashboard: () => api.get('/caretaker/dashboard'),
    getCallQueue: (params) => api.get('/caretaker/call-queue', { params }),
    getMyPatients: (params) => api.get('/caretaker/patients', { params }),
    getPerformance: (params) => api.get('/caretaker/performance', { params }),
    getPatientMeds: (patientId, params) => api.get(`/caretaker/patients/${patientId}/meds`, { params }),
    logCall: (data) => api.post('/caretaker/calls', data),
    addMedication: (patientId, data) => api.post(`/caretaker/patients/${patientId}/medications`, data),
    updateMedication: (patientId, medId, data) => api.put(`/caretaker/patients/${patientId}/medications/${medId}`, data),
    deleteMedication: (patientId, medId) => api.delete(`/caretaker/patients/${patientId}/medications/${medId}`),
  },

  // Mentor endpoints
  mentors: {
    getAll: (params) => api.get('/mentors', { params }),
    getById: (id) => api.get(`/mentors/${id}`),
    getPatients: (id, params) => api.get(`/mentors/${id}/patients`, { params }),
    updatePermissions: (id, patientId, permissions) =>
      api.put(`/mentors/${id}/patients/${patientId}/permissions`, { permissions }),
    checkPermission: (id, patientId, permission) =>
      api.get(`/mentors/${id}/patients/${patientId}/permissions/check`, {
        params: { permission }
      }),
    logAccess: (id, patientId, action) =>
      api.post(`/mentors/${id}/patients/${patientId}/access-log`, { action }),
  },

  // Organization endpoints
  organizations: {
    getAll: (params) => api.get('/organizations', { params }),
    getById: (id) => api.get(`/organizations/${id}`),
    create: (data) => api.post('/organizations', data),
    update: (id, data) => api.put(`/organizations/${id}`, data),
    toggleStatus: (id, isActive) => api.patch(`/organizations/${id}/toggle-status`, { isActive }),
    getUsers: (id, params) => api.get(`/organizations/${id}/users`, { params }),
    getStats: (id) => api.get(`/organizations/${id}/stats`),
    addCollaboration: (id, data) => api.post(`/organizations/${id}/collaborations`, data),
  },

  // Reports endpoints
  reports: {
    getUserActivity: (params) => api.get('/reports/user-activity', { params }),
    getSystemActivity: (params) => api.get('/reports/system-activity', { params }),
    getOrganizationStats: (params) => api.get('/reports/organization-stats', { params }),
    getSecurityIncidents: (params) => api.get('/reports/security-incidents', { params }),
    getAssignmentOverview: (params) => api.get('/reports/assignment-overview', { params }),
    getMentorOverview: (params) => api.get('/reports/mentor-overview', { params }),
  },

  // Calls endpoints (Caretaker)
  calls: {
    getHistory: (params) => api.get('/caretaker/call-history', { params }),
  },
};

// Error handling utilities
export const handleApiError = (error) => {
  console.log('API Error:', error?.message);

  if (error.response) {
    // Server responded with error status
    const { status, data } = error.response;

    return {
      message: data?.error || data?.message || 'An error occurred',
      code: data?.code || status,
      status,
      details: data?.details || null,
      isNetworkError: false,
    };
  } else if (error.request) {
    // Request was made but no response received
    return {
      message: 'Network error. Please check your internet connection.',
      code: 'NETWORK_ERROR',
      status: 0,
      details: null,
      isNetworkError: true,
    };
  } else {
    // Something else happened
    return {
      message: error.message || 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
      status: null,
      details: null,
      isNetworkError: false,
    };
  }
};

// Utility function to check if user is online
export const isOnline = () => {
  // This is a basic check - you might want to use NetInfo for more robust checking
  return navigator?.onLine ?? true;
};

// Utility function to retry failed requests
export const retryRequest = async (requestFn, maxRetries = 3, delay = 1000) => {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;

      // Don't retry on authentication errors or client errors
      if (error.response?.status < 500) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }

  throw lastError;
};

export default api;
