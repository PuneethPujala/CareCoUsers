process.env.NODE_ENV = 'test';
const request = require('supertest');
const mongoose = require('mongoose');
const redis = require('../src/lib/redis');

// Globally mock Connection.prototype.readyState safely
let mockConnectionReadyState = 0;
Object.defineProperty(mongoose.Connection.prototype, 'readyState', {
  get: function () {
    return mockConnectionReadyState;
  },
  configurable: true,
});

// Mock Redis status using a stable getter and dummy setter
let mockRedisStatus = 'ready';
Object.defineProperty(redis, 'status', {
  get: () => mockRedisStatus,
  set: (val) => {
    // dummy setter to prevent TypeError: Cannot set property status of #<EventEmitter> which has only a getter
  },
  configurable: true,
});
redis.ping = jest.fn().mockResolvedValue('PONG');

const app = require('../src/server');

describe('Health Check API', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockConnectionReadyState = 0;
    mockRedisStatus = 'ready';
  });

  it('GET /live - should return 200 OK and alive status even when Mongo and Redis are disconnected', async () => {
    mockConnectionReadyState = 0;
    mockRedisStatus = 'disconnected';
    const response = await request(app).get('/live');
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: 'alive' });
  });

  it('should return the correlation ID in the JSON body when an unhandled error is caught by the global error handler', async () => {
    const response = await request(app)
      .get('/debug-sentry')
      .set('x-correlation-id', 'err-corr-id-abcde');
    expect(response.statusCode).toBe(500);
    expect(response.body).toHaveProperty('correlationId', 'err-corr-id-abcde');
    expect(response.body.error).toContain('My first Sentry error!');
  });

  it('GET /ready - should return 200 OK when all services are ready', async () => {
    mockConnectionReadyState = 1;
    mockRedisStatus = 'ready';
    const response = await request(app).get('/ready');
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: 'ready' });
  });

  it('GET /ready - should return 503 when MongoDB is disconnected', async () => {
    mockConnectionReadyState = 0;
    const response = await request(app).get('/ready');
    expect(response.statusCode).toBe(503);
    expect(response.body.error).toContain('MongoDB is not connected');
  });

  it('GET /ready - should return 503 when Redis status is reconnecting', async () => {
    mockConnectionReadyState = 1;
    mockRedisStatus = 'reconnecting';
    const response = await request(app).get('/ready');
    expect(response.statusCode).toBe(503);
    expect(response.body.error).toContain('Redis status is reconnecting');
  });

  it('GET /ready - should return 503 when Redis ping fails', async () => {
    mockConnectionReadyState = 1;
    mockRedisStatus = 'ready';
    redis.ping.mockRejectedValueOnce(new Error('Connection lost'));
    const response = await request(app).get('/ready');
    expect(response.statusCode).toBe(503);
    expect(response.body.error).toContain('Connection lost');
  });

  it('GET /health - should return 200 and healthy metadata', async () => {
    mockConnectionReadyState = 1;
    mockRedisStatus = 'ready';
    const response = await request(app).get('/health');
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('status', 'healthy');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('memoryUsage');
    expect(response.body.services).toEqual({
      mongodb: 'connected',
      redis: 'connected',
      bullmq: 'healthy',
    });
  });
});
