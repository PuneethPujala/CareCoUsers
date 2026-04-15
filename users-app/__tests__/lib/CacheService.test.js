/**
 * CacheService.test.js — Tests for user-scoped cache with TTL support
 *
 * AsyncStorage is globally mocked as simple jest.fn() stubs in jest.setup.js,
 * so these tests verify call signatures and behavior by controlling mock returns.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    setCacheUserId,
    setCache,
    getCache,
    removeCache,
    clearUserCache,
    CACHE_KEYS,
} from '../../src/lib/CacheService';

beforeEach(() => {
    jest.clearAllMocks();
    setCacheUserId(null);
});

describe('CacheService', () => {
    // ── User scoping ─────────────────────────────────────────────────────────
    describe('user-scoped keys', () => {
        it('includes user ID in the storage key', async () => {
            setCacheUserId('user-123');
            await setCache('test_key', { hello: 'world' });

            expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
            const calledKey = AsyncStorage.setItem.mock.calls[0][0];
            expect(calledKey).toContain('user-123');
            expect(calledKey).toContain('test_key');
        });

        it('uses global scope when no user ID is set', async () => {
            setCacheUserId(null);
            await setCache('test_key', { hello: 'world' });

            const calledKey = AsyncStorage.setItem.mock.calls[0][0];
            expect(calledKey).toContain('global');
            expect(calledKey).toContain('test_key');
        });

        it('generates different keys for different users', async () => {
            setCacheUserId('user-A');
            await setCache('shared_key', { owner: 'A' });
            const keyA = AsyncStorage.setItem.mock.calls[0][0];

            setCacheUserId('user-B');
            await setCache('shared_key', { owner: 'B' });
            const keyB = AsyncStorage.setItem.mock.calls[1][0];

            expect(keyA).not.toBe(keyB);
            expect(keyA).toContain('user-A');
            expect(keyB).toContain('user-B');
        });
    });

    // ── setCache ─────────────────────────────────────────────────────────────
    describe('setCache', () => {
        beforeEach(() => setCacheUserId('test-user'));

        it('writes JSON-serialized data with cachedAt timestamp', async () => {
            const payload = { medications: ['aspirin'], count: 1 };
            await setCache('meds', payload);

            expect(AsyncStorage.setItem).toHaveBeenCalledWith(
                expect.stringContaining('meds'),
                expect.any(String)
            );

            const storedValue = JSON.parse(AsyncStorage.setItem.mock.calls[0][1]);
            expect(storedValue.data).toEqual(payload);
            expect(storedValue.cachedAt).toEqual(expect.any(Number));
            expect(storedValue.expiresAt).toBeNull(); // No TTL
        });

        it('sets expiresAt when TTL is provided', async () => {
            const now = Date.now();
            jest.spyOn(Date, 'now').mockReturnValue(now);

            await setCache('expiring', { value: 42 }, 10); // 10 min

            const stored = JSON.parse(AsyncStorage.setItem.mock.calls[0][1]);
            expect(stored.expiresAt).toBe(now + 10 * 60 * 1000);

            Date.now.mockRestore();
        });

        it('handles null data without crashing', async () => {
            await expect(setCache('nullable', null)).resolves.not.toThrow();
            expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
        });

        it('handles array data', async () => {
            await setCache('list', [1, 2, 3]);
            const stored = JSON.parse(AsyncStorage.setItem.mock.calls[0][1]);
            expect(stored.data).toEqual([1, 2, 3]);
        });
    });

    // ── getCache ─────────────────────────────────────────────────────────────
    describe('getCache', () => {
        beforeEach(() => setCacheUserId('test-user'));

        it('returns null for a key that was never set', async () => {
            AsyncStorage.getItem.mockResolvedValue(null);
            const result = await getCache('nonexistent');
            expect(result).toBeNull();
        });

        it('parses and returns cached data with cachedAt', async () => {
            const entry = { data: { hello: 'world' }, cachedAt: 1000, expiresAt: null };
            AsyncStorage.getItem.mockResolvedValue(JSON.stringify(entry));

            const result = await getCache('some_key');
            expect(result).toEqual({ data: { hello: 'world' }, cachedAt: 1000 });
        });

        it('returns null and removes entry if TTL has expired', async () => {
            const entry = {
                data: { stale: true },
                cachedAt: 1000,
                expiresAt: Date.now() - 60000, // Already expired 1 min ago
            };
            AsyncStorage.getItem.mockResolvedValue(JSON.stringify(entry));

            const result = await getCache('expired_key');
            expect(result).toBeNull();
            expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
                expect.stringContaining('expired_key')
            );
        });

        it('returns data if TTL has not yet expired', async () => {
            const entry = {
                data: { fresh: true },
                cachedAt: 1000,
                expiresAt: Date.now() + 60000, // Expires in 1 min
            };
            AsyncStorage.getItem.mockResolvedValue(JSON.stringify(entry));

            const result = await getCache('fresh_key');
            expect(result).not.toBeNull();
            expect(result.data.fresh).toBe(true);
        });

        it('returns null gracefully on JSON parse error', async () => {
            AsyncStorage.getItem.mockResolvedValue('not-json{{{');

            const result = await getCache('corrupt');
            expect(result).toBeNull();
        });
    });

    // ── removeCache ──────────────────────────────────────────────────────────
    describe('removeCache', () => {
        beforeEach(() => setCacheUserId('test-user'));

        it('calls AsyncStorage.removeItem with the scoped key', async () => {
            await removeCache('to_delete');
            expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
                expect.stringContaining('to_delete')
            );
        });

        it('does not throw on failure', async () => {
            AsyncStorage.removeItem.mockRejectedValueOnce(new Error('Disk full'));
            await expect(removeCache('key')).resolves.not.toThrow();
        });
    });

    // ── clearUserCache ───────────────────────────────────────────────────────
    describe('clearUserCache', () => {
        it('removes only keys belonging to the current user', async () => {
            setCacheUserId('user-CLEAR');
            AsyncStorage.getAllKeys.mockResolvedValue([
                '@careco_cache:user-CLEAR:data1',
                '@careco_cache:user-CLEAR:data2',
                '@careco_cache:user-KEEP:safe_data',
            ]);

            await clearUserCache();

            expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
                '@careco_cache:user-CLEAR:data1',
                '@careco_cache:user-CLEAR:data2',
            ]);
        });

        it('does nothing when no keys match', async () => {
            setCacheUserId('user-LONELY');
            AsyncStorage.getAllKeys.mockResolvedValue([
                '@careco_cache:user-OTHER:data1',
            ]);

            await clearUserCache();
            expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
        });

        it('uses global prefix when no user ID set', async () => {
            setCacheUserId(null);
            AsyncStorage.getAllKeys.mockResolvedValue([
                '@careco_cache:global:temp_data',
                '@careco_cache:user-123:user_data',
            ]);

            await clearUserCache();
            expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
                '@careco_cache:global:temp_data',
            ]);
        });
    });

    // ── CACHE_KEYS constants ─────────────────────────────────────────────────
    describe('CACHE_KEYS', () => {
        it('exports expected well-known keys', () => {
            expect(CACHE_KEYS.HOME_DASHBOARD).toBe('home_dashboard');
            expect(CACHE_KEYS.MY_CALLER).toBe('my_caller');
            expect(CACHE_KEYS.MEDICATIONS).toBe('medications_today');
            expect(CACHE_KEYS.HEALTH_PROFILE).toBe('health_profile');
            expect(CACHE_KEYS.NOTIFICATIONS).toBe('notifications');
            expect(CACHE_KEYS.CALLER_DASHBOARD).toBe('caller_dashboard');
            expect(CACHE_KEYS.CALLER_PATIENTS).toBe('caller_patients_today');
        });
    });
});
