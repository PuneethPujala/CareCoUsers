import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables. Check your .env file.');
}

// §1 FIX: ExpoSecureStoreAdapter replaces AsyncStorage for token security
const ExpoSecureStoreAdapter = {
    getItem: (key) => {
        return SecureStore.getItemAsync(key);
    },
    setItem: (key, value) => {
        return SecureStore.setItemAsync(key, value);
    },
    removeItem: (key) => {
        return SecureStore.deleteItemAsync(key);
    },
};

// Use AsyncStorage on web, SecureStore on native
const storageAdapter = Platform.OS === 'web' ? AsyncStorage : ExpoSecureStoreAdapter;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: storageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
    },
    global: {
        headers: {
            'x-app-name': 'CareMyMed',
            'x-app-platform': Platform.OS,
            'x-app-version': '1.0.0',
        },
    },
});

export const auth = {
    signUp: async (email, password, options = {}) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: options.data || {} },
        });
        if (error) throw error;
        return data;
    },

    signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    },

    signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    },

    getCurrentSession: async () => {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        return session;
    },

    resetPassword: async (email, redirectTo) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: redirectTo || undefined,
        });
        if (error) throw error;
    },

    updatePassword: async (newPassword) => {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
    },

    onAuthStateChange: (callback) => {
        return supabase.auth.onAuthStateChange(callback);
    },
};

export const handleAuthError = (error) => {
    const messages = {
        'Invalid login credentials': 'Invalid email or password',
        'Email not confirmed': 'Please verify your email address',
        'User already registered': 'An account with this email already exists',
        'Password should be at least 6 characters': 'Password must be at least 6 characters',
    };
    return {
        message: messages[error.message] || error.message || 'An error occurred',
        code: error.status || 'UNKNOWN_ERROR',
    };
};

export default supabase;
