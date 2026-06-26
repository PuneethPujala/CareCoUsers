// Global test bootstrap
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.MONGODB_URI = "mongodb://localhost:27017/caremymed-test";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.PORT = "0"; // random port for tests

// Mock Redis connection globally to prevent actual network socket allocation during tests
jest.mock("../src/lib/redis", () => {
  const EventEmitter = require("events");
  class MockRedis extends EventEmitter {
    constructor() {
      super();
      this.status = "ready";
    }
    ping() {
      return Promise.resolve("PONG");
    }
    quit() {
      this.status = "end";
      return Promise.resolve();
    }
    get() {
      return Promise.resolve(null);
    }
    set() {
      return Promise.resolve("OK");
    }
    del() {
      return Promise.resolve(0);
    }
    sadd() {
      return Promise.resolve(0);
    }
    sismember() {
      return Promise.resolve(0);
    }
  }
  return new MockRedis();
});

// Reset mocks between tests
afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  // Teardown the global mock redis connection
  const redis = require("../src/lib/redis");
  if (redis.status !== "end") {
    await redis.quit();
  }
});
