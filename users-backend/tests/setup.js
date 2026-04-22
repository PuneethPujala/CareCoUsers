// Global test bootstrap
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.MONGODB_URI = 'mongodb://localhost:27017/careco-test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.PORT = '0'; // random port for tests

// Reset mocks between tests
afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
    // Teardown the global redis connection to prevent open handles warnings
    const redis = require('../src/lib/redis');
    if (redis.status !== 'end') {
        await redis.quit();
    }
});
