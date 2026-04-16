const Redis = require('ioredis');

/**
 * ═══════════════════════════════════════════════════════════════
 * REDIS CACHING LAYER
 * Provides caching with TTL for dashboard KPIs, adherence
 * calculations, and analytics. Falls back gracefully if Redis
 * is unavailable — the app runs without cache, just slower.
 * ═══════════════════════════════════════════════════════════════
 */

// ── TTL Configuration (seconds) ─────────────────────────────

const TTL = {
    DASHBOARD: 5 * 60,         // 5 minutes — real-time-ish KPIs
    ADHERENCE: 60 * 60,        // 1 hour   — expensive calculation
    ANALYTICS: 30 * 60,        // 30 minutes — chart data
    USER_PROFILE: 15 * 60,     // 15 minutes — user profile lookups
    PERMISSIONS: 60 * 60,      // 1 hour   — role permissions
    SHORT: 60,                 // 1 minute  — very short-lived
};

// ── Redis Client ────────────────────────────────────────────

let client = null;
let isConnected = false;

/**
 * Initialize Redis connection.
 * Falls back to a no-op cache if REDIS_URL is not configured.
 */
function connectRedis() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
        console.log('⚠️  REDIS_URL not set — running without cache (all calls hit DB directly)');
        return null;
    }

    try {
        client = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy(times) {
                if (times > 5) {
                    console.error('❌ Redis: max retries exceeded, giving up');
                    return null; // Stop retrying
                }
                return Math.min(times * 200, 2000); // Exponential backoff
            },
            lazyConnect: true,
            enableOfflineQueue: false,
        });

        client.on('connect', () => {
            isConnected = true;
            console.log('✅ Redis connected');
        });

        client.on('error', (err) => {
            if (isConnected) {
                console.error('❌ Redis error:', err.message);
            }
        });

        client.on('close', () => {
            isConnected = false;
            console.warn('⚠️  Redis disconnected');
        });

        client.on('reconnecting', () => {
            console.log('🔄 Redis reconnecting...');
        });

        // Connect
        client.connect().catch((err) => {
            console.warn('⚠️  Redis connection failed — running without cache:', err.message);
            client = null;
        });

        return client;
    } catch (err) {
        console.warn('⚠️  Redis init failed:', err.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
// CORE CACHING API
// ═══════════════════════════════════════════════════════════════

/**
 * Get a cached value, or call fetchFn and cache the result.
 * This is the primary caching interface — use it everywhere.
 *
 * @param {string} key — cache key
 * @param {function} fetchFn — async function to get fresh data
 * @param {number} [ttl=300] — time-to-live in seconds
 * @returns {Promise<any>} — cached or fresh data
 *
 * @example
 *   const stats = await getCachedOrFetch(
 *     `dashboard:org:${orgId}`,
 *     () => buildDashboardStats(orgId),
 *     TTL.DASHBOARD
 *   );
 */
async function getCachedOrFetch(key, fetchFn, ttl = TTL.DASHBOARD) {
    // If Redis is not available, just call the fetch function
    if (!client || !isConnected) {
        return fetchFn();
    }

    try {
        // Try cache first
        const cached = await client.get(key);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (err) {
        console.warn('Redis GET error:', err.message);
        // Fall through to fetch
    }

    // Cache miss — call the fetch function
    const data = await fetchFn();

    // Store in cache (fire-and-forget, don't block response)
    if (client && isConnected && data !== undefined && data !== null) {
        client.setex(key, ttl, JSON.stringify(data)).catch((err) => {
            console.warn('Redis SETEX error:', err.message);
        });
    }

    return data;
}

/**
 * Set a value in cache.
 * @param {string} key
 * @param {any} data
 * @param {number} [ttl=300]
 */
async function setCache(key, data, ttl = TTL.DASHBOARD) {
    if (!client || !isConnected) return;

    try {
        await client.setex(key, ttl, JSON.stringify(data));
    } catch (err) {
        console.warn('Redis SET error:', err.message);
    }
}

/**
 * Get a value from cache.
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function getCache(key) {
    if (!client || !isConnected) return null;

    try {
        const cached = await client.get(key);
        return cached ? JSON.parse(cached) : null;
    } catch (err) {
        console.warn('Redis GET error:', err.message);
        return null;
    }
}

/**
 * Invalidate a cache key. Use after mutations that affect cached data.
 * @param {string} key
 */
async function invalidateCache(key) {
    if (!client || !isConnected) return;

    try {
        await client.del(key);
    } catch (err) {
        console.warn('Redis DEL error:', err.message);
    }
}

/**
 * Invalidate all keys matching a pattern.
 * Usage: invalidatePattern('dashboard:org:*') after any org change.
 *
 * @param {string} pattern
 */
async function invalidatePattern(pattern) {
    if (!client || !isConnected) return;

    try {
        const keys = await client.keys(pattern);
        if (keys.length > 0) {
            await client.del(...keys);
        }
    } catch (err) {
        console.warn('Redis pattern invalidation error:', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// CONVENIENCE KEY BUILDERS
// ═══════════════════════════════════════════════════════════════

const CacheKeys = {
    // Dashboard KPIs
    adminDashboard: () => 'dashboard:admin',
    orgDashboard: (orgId) => `dashboard:org:${orgId}`,
    managerDashboard: (managerId) => `dashboard:manager:${managerId}`,
    caretakerDashboard: (caretakerId) => `dashboard:caretaker:${caretakerId}`,

    // Adherence
    patientAdherence: (patientId) => `adherence:patient:${patientId}`,
    orgAdherence: (orgId) => `adherence:org:${orgId}`,

    // Analytics
    weeklyAdherence: (orgId) => `analytics:adherence:weekly:${orgId}`,
    callOutcomes: (orgId) => `analytics:calls:outcomes:${orgId}`,
    performance: (orgId) => `analytics:performance:${orgId}`,
    riskDistribution: (orgId) => `analytics:risk:${orgId}`,
    callVolume: (orgId) => `analytics:callvolume:${orgId}`,
    escalations: (orgId) => `analytics:escalations:${orgId}`,

    // User / permissions
    userProfile: (userId) => `user:profile:${userId}`,
    rolePermissions: (role) => `perms:role:${role}`,
};

// ═══════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════

async function disconnectRedis() {
    if (client) {
        await client.quit();
        console.log('🔒 Redis connection closed');
    }
}

module.exports = {
    connectRedis,
    disconnectRedis,
    getCachedOrFetch,
    setCache,
    getCache,
    invalidateCache,
    invalidatePattern,
    CacheKeys,
    TTL,
};
