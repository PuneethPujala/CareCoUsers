import { useState, useEffect, useCallback, useRef } from 'react';
import { getCache, setCache } from '../lib/CacheService';

// Global map for in-flight request deduplication
const inFlightPromises = new Map();

/**
 * Custom hook for resilient, section-level data fetching.
 *
 * Provides:
 * - Instant mount from local SWR cache (0ms delay)
 * - In-flight API request deduplication across concurrent hooks
 * - Exponential backoff retry logic (1s -> 2s -> 4s, max 3 attempts)
 * - Background revalidation without layout shifting or full-screen loading
 * - "Last Updated" timestamp for clinical safety
 *
 * @param {Object} options
 * @param {string} options.key - Unique cache key (e.g. 'vitals_summary')
 * @param {Function} options.fetcher - Async function returning fresh data
 * @param {number} [options.ttlMinutes] - Time-to-live in minutes (optional)
 * @param {boolean} [options.enabled=true] - Whether query should execute
 * @returns {{ data: any, lastUpdated: number|null, isLoading: boolean, isRevalidating: boolean, isError: boolean, error: Error|null, refetch: Function, retry: Function }}
 */
export function useSectionQuery({ key, fetcher, ttlMinutes = null, enabled = true, maxRetries = 3 }) {
    const [data, setData] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRevalidating, setIsRevalidating] = useState(false);
    const [isError, setIsError] = useState(false);
    const [error, setError] = useState(null);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // ── Execute Fetch with In-Flight Deduplication & Exponential Backoff ─────
    const executeFetch = useCallback(async (attempt = 1) => {
        const MAX_RETRIES = 3;
        try {
            // 1. Deduplicate identical concurrent requests
            let promise = inFlightPromises.get(key);
            if (!promise) {
                promise = fetcher();
                inFlightPromises.set(key, promise);
            }

            const freshData = await promise;
            inFlightPromises.delete(key);

            if (!isMountedRef.current) return freshData;

            const now = Date.now();
            // Cache fresh data
            await setCache(key, freshData, ttlMinutes);

            setData(freshData);
            setLastUpdated(now);
            setIsLoading(false);
            setIsRevalidating(false);
            setIsError(false);
            setError(null);
            return freshData;
        } catch (err) {
            inFlightPromises.delete(key);

            // 2. Exponential backoff retry logic: 1s -> 2s -> 4s
            if (attempt < maxRetries) {
                const backoffDelay = Math.pow(2, attempt - 1) * 1000;
                await new Promise((res) => setTimeout(res, backoffDelay));
                if (isMountedRef.current) {
                    return executeFetch(attempt + 1);
                }
            }

            if (!isMountedRef.current) return;

            // If we have cached data, keep displaying it with an error indicator
            setIsLoading(false);
            setIsRevalidating(false);
            setIsError(true);
            setError(err);
        }
    }, [key, fetcher, ttlMinutes]);

    // ── Primary SWR Loading Flow ─────────────────────────────────────────────
    const loadQuery = useCallback(async () => {
        if (!enabled || !key) return;

        // Step A: Instant read from local cache
        const cached = await getCache(key);
        if (cached && isMountedRef.current) {
            setData(cached.data);
            setLastUpdated(cached.cachedAt || Date.now());
            setIsLoading(false);
            setIsRevalidating(true); // Background revalidation
        } else if (isMountedRef.current) {
            setIsLoading(true);
        }

        // Step B: Fetch fresh data from network in background
        executeFetch(1);
    }, [key, enabled, executeFetch]);

    useEffect(() => {
        loadQuery();
    }, [loadQuery]);

    const refetch = useCallback(() => {
        setIsRevalidating(true);
        setIsError(false);
        setError(null);
        return executeFetch(1);
    }, [executeFetch]);

    return {
        data,
        lastUpdated,
        isLoading,
        isRevalidating,
        isError,
        error,
        refetch,
        retry: refetch,
    };
}
