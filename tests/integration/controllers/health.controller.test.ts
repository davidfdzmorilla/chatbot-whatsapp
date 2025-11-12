/**
 * Integration Tests: HealthController
 * Tests para el endpoint de health check
 */

import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import type { Application } from 'express';

// Mock database and redis before importing app
const mockPrismaQuery = jest.fn<any>();
const mockRedisPing = jest.fn<any>();

jest.mock('../../../src/config/database', () => ({
  prisma: {
    $queryRaw: mockPrismaQuery,
  },
}));

jest.mock('../../../src/config/redis', () => ({
  redis: {
    ping: mockRedisPing,
  },
}));

describe('HealthController Integration Tests', () => {
  let app: Application;

  beforeAll(async () => {
    // Import app after mocks are set up
    const { createApp } = await import('../../../src/app');
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 OK when all services are healthy', async () => {
      // Mock successful health checks
      mockPrismaQuery.mockResolvedValue([{ result: 1 }]);
      mockRedisPing.mockResolvedValue('PONG');

      const response = await request(app)
        .get('/health')
        .expect(200)
        .expect('Content-Type', /json/);

      // Verify response structure
      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        environment: 'test',
        version: expect.any(String),
        checks: {
          database: {
            status: 'ok',
            latencyMs: expect.any(Number),
          },
          redis: {
            status: 'ok',
            latencyMs: expect.any(Number),
          },
          memory: {
            status: 'ok',
            heapUsed: expect.any(Number),
            heapTotal: expect.any(Number),
            rss: expect.any(Number),
          },
        },
      });

      // Verify all checks passed
      expect(response.body.checks.database.status).toBe('ok');
      expect(response.body.checks.redis.status).toBe('ok');
      expect(response.body.checks.memory.status).toBe('ok');

      // Verify database was queried
      expect(mockPrismaQuery).toHaveBeenCalled();
      // Verify redis was pinged
      expect(mockRedisPing).toHaveBeenCalled();
    });

    it('should return 503 Service Unavailable when database is down', async () => {
      // Mock database failure
      mockPrismaQuery.mockRejectedValue(new Error('Database connection failed'));
      mockRedisPing.mockResolvedValue('PONG');

      const response = await request(app).get('/health').expect(503);

      expect(response.body.status).toBe('error');
      expect(response.body.checks.database.status).toBe('error');
      expect(response.body.checks.database.error).toBeDefined();
      expect(response.body.checks.redis.status).toBe('ok');
    });

    it('should return 503 Service Unavailable when Redis is down', async () => {
      // Mock redis failure
      mockPrismaQuery.mockResolvedValue([{ result: 1 }]);
      mockRedisPing.mockRejectedValue(new Error('Redis connection failed'));

      const response = await request(app).get('/health').expect(503);

      expect(response.body.status).toBe('error');
      expect(response.body.checks.database.status).toBe('ok');
      expect(response.body.checks.redis.status).toBe('error');
      expect(response.body.checks.redis.error).toBeDefined();
    });

    it('should return 503 when both database and Redis are down', async () => {
      // Mock both failures
      mockPrismaQuery.mockRejectedValue(new Error('Database error'));
      mockRedisPing.mockRejectedValue(new Error('Redis error'));

      const response = await request(app).get('/health').expect(503);

      expect(response.body.status).toBe('error');
      expect(response.body.checks.database.status).toBe('error');
      expect(response.body.checks.redis.status).toBe('error');
    });

    it('should include uptime in response', async () => {
      mockPrismaQuery.mockResolvedValue([{ result: 1 }]);
      mockRedisPing.mockResolvedValue('PONG');

      const response = await request(app).get('/health').expect(200);

      expect(response.body.uptime).toBeGreaterThan(0);
      expect(typeof response.body.uptime).toBe('number');
    });

    it('should include memory usage statistics', async () => {
      mockPrismaQuery.mockResolvedValue([{ result: 1 }]);
      mockRedisPing.mockResolvedValue('PONG');

      const response = await request(app).get('/health').expect(200);

      const memory = response.body.checks.memory;
      expect(memory.heapUsed).toBeGreaterThan(0);
      expect(memory.heapTotal).toBeGreaterThan(0);
      expect(memory.rss).toBeGreaterThan(0);
      expect(memory.heapUsed).toBeLessThanOrEqual(memory.heapTotal);
    });

    it('should include latency for database check', async () => {
      mockPrismaQuery.mockResolvedValue([{ result: 1 }]);
      mockRedisPing.mockResolvedValue('PONG');

      const response = await request(app).get('/health').expect(200);

      const dbLatency = response.body.checks.database.latencyMs;
      expect(dbLatency).toBeGreaterThanOrEqual(0);
      expect(dbLatency).toBeLessThan(5000); // Should be fast
    });

    it('should include latency for Redis check', async () => {
      mockPrismaQuery.mockResolvedValue([{ result: 1 }]);
      mockRedisPing.mockResolvedValue('PONG');

      const response = await request(app).get('/health').expect(200);

      const redisLatency = response.body.checks.redis.latencyMs;
      expect(redisLatency).toBeGreaterThanOrEqual(0);
      expect(redisLatency).toBeLessThan(5000); // Should be fast
    });

    it('should include timestamp in ISO format', async () => {
      mockPrismaQuery.mockResolvedValue([{ result: 1 }]);
      mockRedisPing.mockResolvedValue('PONG');

      const response = await request(app).get('/health').expect(200);

      const timestamp = response.body.timestamp;
      expect(timestamp).toBeDefined();

      // Verify it's a valid ISO date
      const date = new Date(timestamp);
      expect(date.toISOString()).toBe(timestamp);
    });

    it('should include environment from config', async () => {
      mockPrismaQuery.mockResolvedValue([{ result: 1 }]);
      mockRedisPing.mockResolvedValue('PONG');

      const response = await request(app).get('/health').expect(200);

      expect(response.body.environment).toBe('test');
    });

    it('should handle slow database response', async () => {
      // Simulate slow database
      mockPrismaQuery.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([{ result: 1 }]), 100))
      );
      mockRedisPing.mockResolvedValue('PONG');

      const response = await request(app).get('/health').expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.checks.database.latencyMs).toBeGreaterThan(50);
    });

    it('should handle slow Redis response', async () => {
      mockPrismaQuery.mockResolvedValue([{ result: 1 }]);
      // Simulate slow redis
      mockRedisPing.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('PONG'), 100))
      );

      const response = await request(app).get('/health').expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.checks.redis.latencyMs).toBeGreaterThan(50);
    });

    it('should return error status but still complete response on partial failure', async () => {
      mockPrismaQuery.mockRejectedValue(new Error('DB error'));
      mockRedisPing.mockResolvedValue('PONG');

      const response = await request(app).get('/health').expect(503);

      // Should still have all fields
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('checks');
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks).toHaveProperty('redis');
      expect(response.body.checks).toHaveProperty('memory');
    });
  });
});
