import AsyncStorage from '@react-native-async-storage/async-storage';

let EncryptedStorage = null;
try {
    EncryptedStorage = require('react-native-encrypted-storage').default;
} catch {
    console.warn('[CacheService] react-native-encrypted-storage not available, using AsyncStorage fallback');
}

const CACHE_PREFIX = '@CareMyMed_cache';

// Keys containing sensitive health data that must be encrypted at rest (Audit 6.14)
const SENSITIVE_KEYS = ['medications_today', 'health_profile', 'patient_data'];

/**
 * CacheService — User-scoped, offline-first data caching.
 *
 * Every key is prefixed with the user's UID so data never leaks between accounts.
 * Supports optional TTL (time-to-live) for automatic expiration.
 * Sensitive health data keys use EncryptedStorage when available (Audit 6.14).
 */

let _currentUserId = null;

/**
 * Set the current user ID for scoping all cache keys.
 * Must be called after login / auth init.
 */
export function setCacheUserId(userId) {
    _currentUserId = userId;
}

function scopedKey(key) {
    if (!_currentUserId) {
        console.warn('[CacheService] No user ID set — using global scope');
        return `${CACHE_PREFIX}:global:${key}`;
    }
    return `${CACHE_PREFIX}:${_currentUserId}:${key}`;
}

/** Choose storage backend based on key sensitivity */
function getStorage(key) {
    if (EncryptedStorage && SENSITIVE_KEYS.includes(key)) {
        return EncryptedStorage;
    }
    return AsyncStorage;
}

/**
 * Save data to cache with an optional TTL (in minutes).
 * @param {string} key - Cache key (e.g. 'home_dashboard')
 * @param {any} data - JSON-serializable data
 * @param {number} [ttlMinutes] - Optional expiration in minutes
 */
export async function setCache(key, data, ttlMinutes = null) {
    try {
        const entry = {
            data,
            cachedAt: Date.now(),
            expiresAt: ttlMinutes ? Date.now() + ttlMinutes * 60 * 1000 : null,
        };
        const storage = getStorage(key);
        await storage.setItem(scopedKey(key), JSON.stringify(entry));
    } catch (err) {
        console.warn('[CacheService] Failed to write cache:', err.message);
    }
}

/**
 * Read data from cache. Returns null if expired or missing.
 * @param {string} key - Cache key
 * @returns {{ data: any, cachedAt: number } | null}
 */
export async function getCache(key) {
    try {
        const storage = getStorage(key);
        const raw = await storage.getItem(scopedKey(key));
        if (!raw) return null;

        const entry = JSON.parse(raw);

        // Check TTL expiration
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            await storage.removeItem(scopedKey(key));
            return null;
        }

        return { data: entry.data, cachedAt: entry.cachedAt };
    } catch (err) {
        console.warn('[CacheService] Failed to read cache:', err.message);
        return null;
    }
}

/**
 * Remove a specific cache entry.
 */
export async function removeCache(key) {
    try {
        const storage = getStorage(key);
        await storage.removeItem(scopedKey(key));
    } catch (err) {
        console.warn('[CacheService] Failed to remove cache:', err.message);
    }
}

/**
 * Clear ALL cache entries for the current user.
 * Should be called on logout.
 */
export async function clearUserCache() {
    try {
        const allKeys = await AsyncStorage.getAllKeys();
        const prefix = _currentUserId
            ? `${CACHE_PREFIX}:${_currentUserId}:`
            : `${CACHE_PREFIX}:global:`;
        const userKeys = allKeys.filter((k) => k.startsWith(prefix));
        if (userKeys.length > 0) {
            await AsyncStorage.multiRemove(userKeys);
            console.log(`[CacheService] Cleared ${userKeys.length} cached entries`);
        }
    } catch (err) {
        console.warn('[CacheService] Failed to clear cache:', err.message);
    }
}

// ── Well-known cache keys ────────────────────────────────────────────────────
export const CACHE_KEYS = {
    HOME_DASHBOARD: 'home_dashboard',
    MY_CALLER: 'my_caller',
    MEDICATIONS: 'medications_today',
    HEALTH_PROFILE: 'health_profile',
    NOTIFICATIONS: 'notifications',
    CALLER_DASHBOARD: 'caller_dashboard',
    CALLER_PATIENTS: 'caller_patients_today',
};
