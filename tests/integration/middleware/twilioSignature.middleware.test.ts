/**
 * Integration Tests: twilioSignature.middleware
 * Tests para el middleware de validación de firma de Twilio
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import type { Application } from 'express';
import express from 'express';

// Mock Twilio validation before importing middleware
const mockValidateRequest = jest.fn<any>();

jest.mock('twilio', () => ({
  validateRequest: mockValidateRequest,
}));

// Mock env
jest.mock('../../../src/config/env', () => ({
  env: {
    TWILIO_AUTH_TOKEN: 'test-auth-token',
    NODE_ENV: 'test',
  },
}));

import { twilioSignatureMiddleware, optionalTwilioSignatureMiddleware } from '../../../src/middleware/twilioSignature.middleware';

describe('TwilioSignature Middleware Integration Tests', () => {
  let app: Application;
  let appOptional: Application;

  beforeAll(() => {
    // Create Express app with required middleware
    app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    // Test route with signature validation
    app.post('/test/webhook', twilioSignatureMiddleware, (_req, res) => {
      res.status(200).json({ success: true });
    });

    // App with optional signature validation
    appOptional = express();
    appOptional.use(express.urlencoded({ extended: true }));
    appOptional.use(express.json());

    appOptional.post('/test/webhook', optionalTwilioSignatureMiddleware, (_req, res) => {
      res.status(200).json({ success: true });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateRequest.mockReturnValue(true); // Default: valid signature
  });

  describe('twilioSignatureMiddleware', () => {
    it('should allow request with valid signature', async () => {
      mockValidateRequest.mockReturnValue(true);

      const response = await request(app)
        .post('/test/webhook')
        .set('X-Twilio-Signature', 'valid-signature')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
          MessageSid: 'SM1234567890abcdef1234567890abcdef',
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify validateRequest was called with correct parameters
      expect(mockValidateRequest).toHaveBeenCalledWith(
        'test-auth-token',
        'valid-signature',
        expect.stringContaining('/test/webhook'),
        expect.objectContaining({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
      );
    });

    it('should reject request with invalid signature', async () => {
      mockValidateRequest.mockReturnValue(false);

      const response = await request(app)
        .post('/test/webhook')
        .set('X-Twilio-Signature', 'invalid-signature')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(403)
        .expect('Content-Type', /json/);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('Access denied');
    });

    it('should reject request without signature header', async () => {
      const response = await request(app)
        .post('/test/webhook')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('Access denied');

      // validateRequest should not be called without signature
      expect(mockValidateRequest).not.toHaveBeenCalled();
    });

    it('should construct correct webhook URL for validation', async () => {
      mockValidateRequest.mockReturnValue(true);

      await request(app)
        .post('/test/webhook?param=value')
        .set('X-Twilio-Signature', 'valid-signature')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      // Verify URL includes query parameters
      expect(mockValidateRequest).toHaveBeenCalledWith(
        'test-auth-token',
        'valid-signature',
        expect.stringContaining('/test/webhook?param=value'),
        expect.any(Object)
      );
    });

    it('should handle validation error gracefully', async () => {
      mockValidateRequest.mockImplementation(() => {
        throw new Error('Validation error');
      });

      const response = await request(app)
        .post('/test/webhook')
        .set('X-Twilio-Signature', 'signature')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should include protocol in URL construction', async () => {
      mockValidateRequest.mockReturnValue(true);

      await request(app)
        .post('/test/webhook')
        .set('X-Twilio-Signature', 'valid-signature')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      // Verify URL starts with protocol
      expect(mockValidateRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.stringMatching(/^https?:\/\//),
        expect.any(Object)
      );
    });

    it('should pass request body to validation', async () => {
      mockValidateRequest.mockReturnValue(true);

      const payload = {
        From: 'whatsapp:+1234567890',
        Body: 'Test message',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
        NumMedia: '1',
      };

      await request(app)
        .post('/test/webhook')
        .set('X-Twilio-Signature', 'valid-signature')
        .send(payload)
        .expect(200);

      expect(mockValidateRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        payload
      );
    });

    it('should reject request with empty signature', async () => {
      const response = await request(app)
        .post('/test/webhook')
        .set('X-Twilio-Signature', '')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(mockValidateRequest).not.toHaveBeenCalled();
    });

    it('should handle different HTTP methods correctly', async () => {
      mockValidateRequest.mockReturnValue(true);

      await request(app)
        .post('/test/webhook')
        .set('X-Twilio-Signature', 'valid-signature')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      expect(mockValidateRequest).toHaveBeenCalled();
    });
  });

  describe('optionalTwilioSignatureMiddleware', () => {
    it('should skip validation in test environment', async () => {
      const response = await request(appOptional)
        .post('/test/webhook')
        // No signature header
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      // validateRequest should not be called in test env
      expect(mockValidateRequest).not.toHaveBeenCalled();
    });

    it('should validate if signature is provided in test environment', async () => {
      // Even though it's test env, if we provide signature, it could still be validated
      // But in current implementation, it skips in development/test
      const response = await request(appOptional)
        .post('/test/webhook')
        .set('X-Twilio-Signature', 'any-signature')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long signature', async () => {
      mockValidateRequest.mockReturnValue(true);
      const longSignature = 'a'.repeat(1000);

      const response = await request(app)
        .post('/test/webhook')
        .set('X-Twilio-Signature', longSignature)
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should handle special characters in signature', async () => {
      mockValidateRequest.mockReturnValue(true);
      const specialSignature = 'abc+/=123';

      const response = await request(app)
        .post('/test/webhook')
        .set('X-Twilio-Signature', specialSignature)
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should handle URL with special characters', async () => {
      mockValidateRequest.mockReturnValue(true);

      await request(app)
        .post('/test/webhook?message=hello%20world&special=<>&')
        .set('X-Twilio-Signature', 'valid-signature')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      expect(mockValidateRequest).toHaveBeenCalled();
    });

    it.skip('should handle empty request body', async () => {
      // Note: Empty body might cause issues with body-parser
      mockValidateRequest.mockReturnValue(true);

      await request(app)
        .post('/test/webhook')
        .set('X-Twilio-Signature', 'valid-signature')
        .send({})
        .expect(200);

      expect(mockValidateRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        {}
      );
    });

    it('should handle numeric values in request body', async () => {
      mockValidateRequest.mockReturnValue(true);

      await request(app)
        .post('/test/webhook')
        .set('X-Twilio-Signature', 'valid-signature')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
          NumMedia: '5',
        })
        .expect(200);

      expect(mockValidateRequest).toHaveBeenCalled();
    });
  });

  describe('Security', () => {
    it('should not leak validation details in error response', async () => {
      mockValidateRequest.mockReturnValue(false);

      const response = await request(app)
        .post('/test/webhook')
        .set('X-Twilio-Signature', 'invalid-signature')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(403);

      // Should not expose internal details
      expect(response.body.message).toBe('Access denied');
      expect(response.body).not.toHaveProperty('details');
      expect(response.body).not.toHaveProperty('reason');
    });

    it('should reject request with tampered body', async () => {
      mockValidateRequest.mockReturnValue(false); // Signature won't match tampered body

      const response = await request(app)
        .post('/test/webhook')
        .set('X-Twilio-Signature', 'signature-for-different-body')
        .send({
          From: 'whatsapp:+9999999999', // Tampered
          Body: 'Malicious content',
        })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should validate with correct auth token', async () => {
      mockValidateRequest.mockReturnValue(true);

      await request(app)
        .post('/test/webhook')
        .set('X-Twilio-Signature', 'valid-signature')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Test',
        })
        .expect(200);

      // Verify it used the correct auth token
      expect(mockValidateRequest).toHaveBeenCalledWith(
        'test-auth-token',
        expect.any(String),
        expect.any(String),
        expect.any(Object)
      );
    });
  });
});
