/**
 * Integration Tests: validation.middleware
 * Tests para el middleware de validación de payloads de Twilio
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import type { Application } from 'express';
import express from 'express';
import { validationMiddleware, validateMessageLength, validateMedia } from '../../../src/middleware/validation.middleware';

describe('Validation Middleware Integration Tests', () => {
  let app: Application;

  beforeAll(() => {
    // Create minimal Express app for testing
    app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    // Test route with validation middleware
    app.post('/test/validation', validationMiddleware, (req, res) => {
      res.status(200).json({ success: true, body: req.body });
    });

    // Test route with message length validation
    app.post('/test/length', validateMessageLength(100), (_req, res) => {
      res.status(200).json({ success: true });
    });

    // Test route with media validation
    app.post('/test/media', validateMedia(2, ['image/jpeg', 'image/png']), (_req, res) => {
      res.status(200).json({ success: true });
    });
  });

  describe('validationMiddleware', () => {
    it('should accept valid Twilio webhook payload', async () => {
      const validPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Hello, this is a test message',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/test/validation')
        .send(validPayload)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body.success).toBe(true);
      expect(response.body.body.From).toBe(validPayload.From);
      expect(response.body.body.Body).toBe(validPayload.Body);
    });

    it('should accept payload with optional fields', async () => {
      const payloadWithOptionals = {
        From: 'whatsapp:+1234567890',
        Body: 'Test',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
        ProfileName: 'John Doe',
        NumMedia: '1',
        MediaUrl0: 'https://example.com/image.jpg',
        MediaContentType0: 'image/jpeg',
        AccountSid: 'AC1234567890',
        To: 'whatsapp:+14155238886',
      };

      const response = await request(app)
        .post('/test/validation')
        .send(payloadWithOptionals)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.body.ProfileName).toBe('John Doe');
      expect(response.body.body.NumMedia).toBe(1); // Transformed to number
    });

    it('should accept empty Body for media-only messages', async () => {
      const mediaOnlyPayload = {
        From: 'whatsapp:+1234567890',
        Body: '',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
        NumMedia: '1',
        MediaUrl0: 'https://example.com/image.jpg',
      };

      const response = await request(app)
        .post('/test/validation')
        .send(mediaOnlyPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject payload missing From field', async () => {
      const invalidPayload = {
        Body: 'Hello',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/test/validation')
        .send(invalidPayload)
        .expect(400)
        .expect('Content-Type', /xml/);

      expect(response.text).toContain('Lo siento');
      expect(response.text).toContain('<Response>');
    });

    it('should reject payload with invalid From format', async () => {
      const invalidPayload = {
        From: '+1234567890', // Missing "whatsapp:" prefix
        Body: 'Hello',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/test/validation')
        .send(invalidPayload)
        .expect(400)
        .expect('Content-Type', /xml/);

      expect(response.text).toContain('Lo siento');
    });

    it('should reject payload missing Body field', async () => {
      const invalidPayload = {
        From: 'whatsapp:+1234567890',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/test/validation')
        .send(invalidPayload)
        .expect(400);

      expect(response.text).toContain('Lo siento');
    });

    it('should reject payload missing MessageSid field', async () => {
      const invalidPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Hello',
      };

      const response = await request(app)
        .post('/test/validation')
        .send(invalidPayload)
        .expect(400);

      expect(response.text).toContain('Lo siento');
    });

    it('should reject payload with invalid MessageSid format', async () => {
      const invalidPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Hello',
        MessageSid: 'invalid-sid', // Invalid format
      };

      const response = await request(app)
        .post('/test/validation')
        .send(invalidPayload)
        .expect(400);

      expect(response.text).toContain('Lo siento');
    });

    it('should reject payload with invalid NumMedia format', async () => {
      const invalidPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Hello',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
        NumMedia: 'abc', // Should be numeric
      };

      const response = await request(app)
        .post('/test/validation')
        .send(invalidPayload)
        .expect(400);

      expect(response.text).toContain('Lo siento');
    });

    it('should reject payload with invalid MediaUrl format', async () => {
      const invalidPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Hello',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
        NumMedia: '1',
        MediaUrl0: 'not-a-valid-url', // Invalid URL
      };

      const response = await request(app)
        .post('/test/validation')
        .send(invalidPayload)
        .expect(400);

      expect(response.text).toContain('Lo siento');
    });

    it('should handle multiple validation errors', async () => {
      const invalidPayload = {
        From: 'invalid-phone', // Invalid format
        Body: 'Hello',
        MessageSid: 'short', // Invalid format
      };

      const response = await request(app)
        .post('/test/validation')
        .send(invalidPayload)
        .expect(400);

      expect(response.text).toContain('Lo siento');
    });
  });

  describe('validateMessageLength', () => {
    it('should accept message within length limit', async () => {
      const validPayload = {
        Body: 'Short message',
      };

      const response = await request(app)
        .post('/test/length')
        .send(validPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject message exceeding length limit', async () => {
      const longMessage = 'a'.repeat(150); // Exceeds 100 char limit
      const invalidPayload = {
        From: 'whatsapp:+1234567890',
        Body: longMessage,
      };

      const response = await request(app)
        .post('/test/length')
        .send(invalidPayload)
        .expect(400)
        .expect('Content-Type', /xml/);

      expect(response.text).toContain('Lo siento');
    });

    it('should accept message exactly at length limit', async () => {
      const exactLengthMessage = 'a'.repeat(100);
      const validPayload = {
        Body: exactLengthMessage,
      };

      const response = await request(app)
        .post('/test/length')
        .send(validPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should handle missing Body field gracefully', async () => {
      const response = await request(app)
        .post('/test/length')
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('validateMedia', () => {
    it('should accept payload with valid media count', async () => {
      const validPayload = {
        NumMedia: 1,
        MediaContentType0: 'image/jpeg',
      };

      const response = await request(app)
        .post('/test/media')
        .send(validPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should accept payload with multiple media within limit', async () => {
      const validPayload = {
        NumMedia: 2,
        MediaContentType0: 'image/jpeg',
        MediaContentType1: 'image/png',
      };

      const response = await request(app)
        .post('/test/media')
        .send(validPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject payload with too many media attachments', async () => {
      const invalidPayload = {
        From: 'whatsapp:+1234567890',
        NumMedia: 5, // Exceeds limit of 2
        MediaContentType0: 'image/jpeg',
      };

      const response = await request(app)
        .post('/test/media')
        .send(invalidPayload)
        .expect(400)
        .expect('Content-Type', /xml/);

      expect(response.text).toContain('Lo siento');
    });

    it('should reject payload with unsupported media type', async () => {
      const invalidPayload = {
        From: 'whatsapp:+1234567890',
        NumMedia: 1,
        MediaContentType0: 'application/pdf', // Not in allowed types
      };

      const response = await request(app)
        .post('/test/media')
        .send(invalidPayload)
        .expect(400);

      expect(response.text).toContain('Lo siento');
    });

    it('should accept payload with allowed media types', async () => {
      const validPayload = {
        NumMedia: 1,
        MediaContentType0: 'image/png',
      };

      const response = await request(app)
        .post('/test/media')
        .send(validPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should handle payload with no media', async () => {
      const validPayload = {
        NumMedia: 0,
      };

      const response = await request(app)
        .post('/test/media')
        .send(validPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should handle missing NumMedia field', async () => {
      const response = await request(app)
        .post('/test/media')
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});
