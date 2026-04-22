/**
 * Persists CareConnect API JWT pair (access + refresh) separately from Supabase.
 * Used for email/password auth; Google OAuth continues to use Supabase session only.
 */
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY = 'careco_api_tokens';

export async function saveApiTokens(session) {
    if (!session?.access_token) return;
    const payload = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
    };
    const json = JSON.stringify(payload);
    if (Platform.OS === 'web') {
        await AsyncStorage.setItem(STORAGE_KEY, json);
    } else {
        await SecureStore.setItemAsync(STORAGE_KEY, json);
    }
}

export async function getApiTokens() {
    try {
        let raw;
        if (Platform.OS === 'web') {
            raw = await AsyncStorage.getItem(STORAGE_KEY);
        } else {
            raw = await SecureStore.getItemAsync(STORAGE_KEY);
        }
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export async function clearApiTokens() {
    try {
        if (Platform.OS === 'web') {
            await AsyncStorage.removeItem(STORAGE_KEY);
        } else {
            await SecureStore.deleteItemAsync(STORAGE_KEY);
        }
    } catch {
        /* ignore */
    }
}
