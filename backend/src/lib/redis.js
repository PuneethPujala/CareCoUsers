const Redis = require('ioredis');

// Connect to Redis (defaults to localhost if REDIS_URL is not provided)
// Configured to fail fast instead of queueing operations endlessly
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    connectTimeout: 5000,
    commandTimeout: 5000,
    tls: process.env.REDIS_URL && process.env.REDIS_URL.startsWith('rediss://') 
        ? { rejectUnauthorized: false } 
        : undefined
});

redis.on('connect', () => {
    console.log('⚡ Connected to Redis');
});

redis.on('error', (err) => {
    console.error('❌ Redis Connection Error:', err);
});

module.exports = redis;
