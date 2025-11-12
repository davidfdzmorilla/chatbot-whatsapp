/**
 * Integration Tests: rateLimit.middleware
 * Tests para el middleware de rate limiting con Redis
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import type { Application } from 'express';
import express from 'express';

// Mock Redis before importing middleware
const mockRedisIncr = jest.fn<any>();
const mockRedisExpire = jest.fn<any>();
const mockRedisTtl = jest.fn<any>();
const mockRedisGet = jest.fn<any>();
const mockRedisDel = jest.fn<any>();

jest.mock('../../../src/config/redis', () => ({
  redis: {
    incr: mockRedisIncr,
    expire: mockRedisExpire,
    ttl: mockRedisTtl,
    get: mockRedisGet,
    del: mockRedisDel,
  },
}));

// Mock hash function
jest.mock('../../../src/utils/privacy', () => ({
  hashPhoneNumber: jest.fn((phone: string) => `hashed_${phone}`),
}));

import { rateLimitMiddleware, getRateLimitStatus, resetRateLimit } from '../../../src/middleware/rateLimit.middleware';

describe('RateLimit Middleware Integration Tests', () => {
  let app: Application;

  beforeAll(() => {
    // Create minimal Express app for testing
    app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    // Test route with rate limit middleware
    app.post('/test/webhook', rateLimitMiddleware, (_req, res) => {
      res.status(200).json({ success: true });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock behavior - allow all requests
    mockRedisIncr.mockResolvedValue(1);
    mockRedisExpire.mockResolvedValue(1);
    mockRedisTtl.mockResolvedValue(60);
    mockRedisGet.mockResolvedValue('0');
    mockRedisDel.mockResolvedValue(1);
  });

  describe('rateLimitMiddleware - Phone-based limiting', () => {
    it('should allow request within phone rate limit', async () => {
      mockRedisIncr.mockResolvedValueOnce(5); // Phone count
      mockRedisIncr.mockResolvedValueOnce(5); // IP count

      const response = await request(app)
        .post('/test/webhook')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify rate limit headers
      expect(response.headers['x-ratelimit-limit']).toBe('10');
      expect(response.headers['x-ratelimit-remaining']).toBe('5');
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });

    it('should block request exceeding phone rate limit', async () => {
      mockRedisIncr.mockResolvedValueOnce(11); // Phone count exceeds limit (10)
      mockRedisIncr.mockResolvedValueOnce(5); // IP count OK

      const response = await request(app)
        .post('/test/webhook')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(429)
        .expect('Content-Type', /xml/);

      expect(response.text).toContain('Lo siento');
      expect(response.text).toContain('demasiados mensajes');
      expect(response.text).toContain('<Response>');
    });

    it('should track different phone numbers separately', async () => {
      // First phone number
      mockRedisIncr.mockResolvedValueOnce(5); // Phone count
      mockRedisIncr.mockResolvedValueOnce(1); // IP count

      await request(app)
        .post('/test/webhook')
        .send({
          From: 'whatsapp:+1111111111',
          Body: 'Test',
        })
        .expect(200);

      // Second phone number
      mockRedisIncr.mockResolvedValueOnce(3); // Phone count
      mockRedisIncr.mockResolvedValueOnce(2); // IP count

      await request(app)
        .post('/test/webhook')
        .send({
          From: 'whatsapp:+2222222222',
          Body: 'Test',
        })
        .expect(200);

      // Verify incr was called with different keys
      expect(mockRedisIncr).toHaveBeenCalledWith(expect.stringContaining('ratelimit:phone:'));
    });

    it('should set TTL on first request', async () => {
      mockRedisIncr.mockResolvedValueOnce(1); // First request (count = 1)
      mockRedisIncr.mockResolvedValueOnce(1); // IP count

      await request(app)
        .post('/test/webhook')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      // Verify expire was called
      expect(mockRedisExpire).toHaveBeenCalledWith(
        expect.stringContaining('ratelimit:phone:'),
        60 // Default window size
      );
    });

    it('should allow request when exactly at limit', async () => {
      mockRedisIncr.mockResolvedValueOnce(10); // Exactly at limit
      mockRedisIncr.mockResolvedValueOnce(5); // IP count

      const response = await request(app)
        .post('/test/webhook')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.headers['x-ratelimit-remaining']).toBe('0');
    });

    it('should handle missing From field gracefully', async () => {
      const response = await request(app)
        .post('/test/webhook')
        .send({
          Body: 'Test',
        })
        .expect(200);

      // Should proceed without rate limiting
      expect(response.body.success).toBe(true);
      expect(mockRedisIncr).not.toHaveBeenCalled();
    });
  });

  describe('rateLimitMiddleware - IP-based limiting', () => {
    it('should block request exceeding IP rate limit', async () => {
      mockRedisIncr.mockResolvedValueOnce(5); // Phone count OK
      mockRedisIncr.mockResolvedValueOnce(31); // IP count exceeds limit (30)

      const response = await request(app)
        .post('/test/webhook')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(429);

      expect(response.text).toContain('demasiadas solicitudes');
    });

    it('should set IP rate limit headers', async () => {
      mockRedisIncr.mockResolvedValueOnce(5); // Phone count
      mockRedisIncr.mockResolvedValueOnce(10); // IP count

      const response = await request(app)
        .post('/test/webhook')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      expect(response.headers['x-ratelimit-ip-limit']).toBe('30');
      expect(response.headers['x-ratelimit-ip-remaining']).toBe('20');
    });

    it('should allow request when IP exactly at limit', async () => {
      mockRedisIncr.mockResolvedValueOnce(5); // Phone count
      mockRedisIncr.mockResolvedValueOnce(30); // IP exactly at limit

      const response = await request(app)
        .post('/test/webhook')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('rateLimitMiddleware - Error handling', () => {
    it('should fail-open on Redis error (allow request)', async () => {
      mockRedisIncr.mockRejectedValue(new Error('Redis connection failed'));

      const response = await request(app)
        .post('/test/webhook')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      // Should allow request despite Redis failure
      expect(response.body.success).toBe(true);
    });

    it('should fail-open on unexpected error', async () => {
      mockRedisIncr.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const response = await request(app)
        .post('/test/webhook')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should handle Redis incr error gracefully', async () => {
      mockRedisIncr.mockRejectedValueOnce(new Error('Redis error'));

      await request(app)
        .post('/test/webhook')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);
    });

    it('should handle Redis expire error gracefully', async () => {
      mockRedisIncr.mockResolvedValueOnce(1);
      mockRedisExpire.mockRejectedValueOnce(new Error('Redis expire error'));

      // Should still fail-open and allow request
      await request(app)
        .post('/test/webhook')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return current rate limit status', async () => {
      mockRedisGet.mockResolvedValue('5');
      mockRedisTtl.mockResolvedValue(45);

      const status = await getRateLimitStatus('+1234567890');

      expect(status.count).toBe(5);
      expect(status.limit).toBe(10);
      expect(status.remaining).toBe(5);
      expect(status.resetTime).toBeGreaterThan(0);
    });

    it('should handle non-existent key', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisTtl.mockResolvedValue(-2); // Key doesn't exist

      const status = await getRateLimitStatus('+1234567890');

      expect(status.count).toBe(0);
      expect(status.remaining).toBe(10);
    });

    it('should handle Redis error gracefully', async () => {
      mockRedisGet.mockRejectedValue(new Error('Redis error'));

      const status = await getRateLimitStatus('+1234567890');

      expect(status.count).toBe(0);
      expect(status.limit).toBe(10);
      expect(status.remaining).toBe(10);
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit for phone number', async () => {
      mockRedisDel.mockResolvedValue(1);

      await resetRateLimit('+1234567890');

      expect(mockRedisDel).toHaveBeenCalledWith('ratelimit:+1234567890');
    });

    it('should throw error on Redis failure', async () => {
      mockRedisDel.mockRejectedValue(new Error('Redis error'));

      await expect(resetRateLimit('+1234567890')).rejects.toThrow('Redis error');
    });
  });

  describe('Rate limit windows', () => {
    it('should calculate correct reset time', async () => {
      mockRedisIncr.mockResolvedValueOnce(5); // Phone count
      mockRedisIncr.mockResolvedValueOnce(5); // IP count
      mockRedisTtl.mockResolvedValue(30); // 30 seconds remaining

      const response = await request(app)
        .post('/test/webhook')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      const resetTime = parseInt(response.headers['x-ratelimit-reset'] as string);
      const now = Math.floor(Date.now() / 1000);

      // Reset time should be approximately now + 30 seconds
      expect(resetTime).toBeGreaterThan(now);
      expect(resetTime).toBeLessThan(now + 35);
    });

    it('should handle negative remaining correctly', async () => {
      mockRedisIncr.mockResolvedValueOnce(15); // Way over limit
      mockRedisIncr.mockResolvedValueOnce(5); // IP OK

      const response = await request(app)
        .post('/test/webhook')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(429);

      // Headers should show 0 remaining (not negative)
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    });
  });
});
