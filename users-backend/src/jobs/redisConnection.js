/**
 * Shared Redis connection config for BullMQ queues and workers.
 * 
 * Uses REDIS_URL (connection string) when available (production),
 * falls back to host/port/password env vars (dev), then localhost.
 * 
 * BullMQ requires a plain options object, not an ioredis instance,
 * so this is separate from lib/redis.js.
 */

function getRedisConnection() {
    if (process.env.REDIS_URL) {
        const url = new URL(process.env.REDIS_URL);
        return {
            host: url.hostname,
            port: parseInt(url.port) || 6379,
            password: url.password || undefined,
            // Render/Upstash/Railway use rediss:// for TLS
            tls: process.env.REDIS_URL.startsWith('rediss://')
                ? { rejectUnauthorized: false }
                : undefined,
            maxRetriesPerRequest: null, // Required by BullMQ
        };
    }

    return {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
    };
}

module.exports = { getRedisConnection };
