process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../src/server');

describe('Health Check API', () => {
    it('GET /health - should return 200 OK', async () => {
        const response = await request(app).get('/health');
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status', 'OK');
    });
});
