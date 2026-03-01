import axios from 'axios';
import { supabase } from './supabase';

// API configuration
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
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
      console.warn(`Slow API request: ${response.config.method?.toUpperCase()} ${response.config.url} took ${duration}ms`);
    }

    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized errors
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Attempt to refresh the session
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError) {
          // Refresh failed, redirect to login
          console.warn('Token refresh failed:', refreshError?.message);
          await supabase.auth.signOut();
          // You might want to navigate to login screen here
          return Promise.reject(refreshError);
        }

        // Update the request with new token
        if (session?.access_token) {
          originalRequest.headers.Authorization = `Bearer ${session.access_token}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        console.warn('Session refresh error:', refreshError?.message);
        return Promise.reject(refreshError);
      }
    }

    // Handle network errors
    if (!error.response) {
      console.warn('Network error:', error.message);
      error.message = 'Network error. Please check your internet connection.';
    }

    // Handle server errors
    if (error.response?.status >= 500) {
      console.warn('Server error:', error.response?.status);
      error.message = 'Server error. Please try again later.';
    }

    return Promise.reject(error);
  }
);

// API service methods
export const apiService = {
  // Authentication endpoints
  auth: {
    login: (credentials) => api.post('/auth/login', credentials),
    register: (userData) => api.post('/auth/register', userData),
    logout: () => api.post('/auth/logout'),
    refreshToken: (refreshToken) => api.post('/auth/refresh', { refresh_token: refreshToken }),
    resetPassword: (email) => api.post('/auth/reset-password', { email }),
    getProfile: () => api.get('/auth/me'),
    updateProfile: (data) => api.put('/auth/me', data),
    changePassword: (data) => api.post('/auth/change-password', data),
    createUser: (data) => api.post('/auth/create-user', data),
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
  },

  // Caretaker endpoints
  caretakers: {
    getAll: (params) => api.get('/caretakers', { params }),
    getById: (id) => api.get(`/caretakers/${id}`),
    getPatients: (id, params) => api.get(`/caretakers/${id}/patients`, { params }),
    addNote: (id, patientId, data) =>
      api.post(`/caretakers/${id}/patients/${patientId}/notes`, data),
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
    delete: (id) => api.delete(`/organizations/${id}`),
    getUsers: (id, params) => api.get(`/organizations/${id}/users`, { params }),
    getStats: (id) => api.get(`/organizations/${id}/stats`),
  },

  // Reports endpoints
  reports: {
    getUserActivity: (params) => api.get('/reports/user-activity', { params }),
    getOrganizationStats: (params) => api.get('/reports/organization-stats', { params }),
    getSecurityIncidents: (params) => api.get('/reports/security-incidents', { params }),
    getAssignmentOverview: (params) => api.get('/reports/assignment-overview', { params }),
    getMentorOverview: (params) => api.get('/reports/mentor-overview', { params }),
  },
};

// Error handling utilities
export const handleApiError = (error) => {
  console.warn('API Error:', error?.message);

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
