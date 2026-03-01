import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Supabase configuration
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce', // Recommended for mobile apps
  },
  // Add custom headers for mobile app identification
  global: {
    headers: {
      'x-app-name': 'CareConnect',
      'x-app-platform': Platform.OS,
      'x-app-version': '1.0.0',
    },
  },
});

// Helper functions for authentication
export const auth = {
  // Sign up with email and password
  signUp: async (email, password, options = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: options.data || {},
        emailRedirectTo: options.emailRedirectTo,
      },
    });

    if (error) throw error;
    return data;
  },

  // Sign in with email and password
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  },

  // Sign in with OAuth (Google, etc.)
  signInWithOAuth: async (provider, options = {}) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: options.redirectTo,
        queryParams: options.queryParams,
      },
    });

    if (error) throw error;
    return data;
  },

  // Sign out
  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Get current session
  getCurrentSession: async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
  },

  // Get current user
  getCurrentUser: async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  },

  // Reset password
  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: process.env.EXPO_PUBLIC_RESET_PASSWORD_URL,
    });

    if (error) throw error;
  },

  // Update password
  updatePassword: async (newPassword) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
  },

  // Update user metadata
  updateMetadata: async (metadata) => {
    const { data, error } = await supabase.auth.updateUser({
      data: metadata,
    });

    if (error) throw error;
    return data;
  },

  // Listen to auth state changes
  onAuthStateChange: (callback) => {
    return supabase.auth.onAuthStateChange(callback);
  },
};

// Session management utilities
export const session = {
  // Check if session is valid
  isValid: (session) => {
    if (!session) return false;

    const now = new Date();
    const expiresAt = new Date(session.expires_at * 1000);
    return now < expiresAt;
  },

  // Get time until session expires (in milliseconds)
  getTimeUntilExpiry: (session) => {
    if (!session) return 0;

    const now = new Date();
    const expiresAt = new Date(session.expires_at * 1000);
    return expiresAt.getTime() - now.getTime();
  },

  // Check if session needs refresh
  needsRefresh: (session) => {
    const timeUntilExpiry = session.getTimeUntilExpiry(session);
    return timeUntilExpiry < 5 * 60 * 1000; // Refresh if less than 5 minutes left
  },
};

// Error handling utilities
export const handleAuthError = (error) => {
  // Only use warn instead of error to avoid Expo's full-screen RedBox for expected auth validation issues
  console.warn('Supabase Auth Info:', error?.message || 'Unknown error');

  // Map common error codes to user-friendly messages
  const errorMessages = {
    'Invalid login credentials': 'Invalid email or password',
    'Email not confirmed': 'Please verify your email address',
    'User already registered': 'An account with this email already exists',
    'Password should be at least 6 characters': 'Password must be at least 6 characters',
    'Invalid email': 'Please enter a valid email address',
    'Too many requests': 'Too many attempts. Please try again later',
    'Network request failed': 'Network error. Please check your connection',
  };

  return {
    message: errorMessages[error.message] || error.message || 'An error occurred',
    code: error.status || 'UNKNOWN_ERROR',
    originalError: error,
  };
};

// Export default client
export default supabase;
