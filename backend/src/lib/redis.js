const Redis = require('ioredis');

// Connect to Redis (defaults to localhost:6379 if REDIS_URL is not provided)
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => {
    console.log('⚡ Connected to Redis');
});

redis.on('error', (err) => {
    console.error('❌ Redis Connection Error:', err);
});

module.exports = redis;
