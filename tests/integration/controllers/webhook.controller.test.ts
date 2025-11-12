/**
 * Integration Tests: WebhookController
 * Tests para el controlador principal de webhooks de WhatsApp
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import type { Application } from 'express';

// Mock services BEFORE importing app
const mockGetOrCreateConversation = jest.fn<any>();
const mockSaveUserMessage = jest.fn<any>();
const mockSaveAssistantMessage = jest.fn<any>();
const mockGetRecentContext = jest.fn<any>();
const mockGenerateResponseWithMetrics = jest.fn<any>();

jest.mock('../../../src/services/conversation.service', () => ({
  conversationService: {
    getOrCreateConversation: mockGetOrCreateConversation,
  },
}));

jest.mock('../../../src/services/message.service', () => ({
  messageService: {
    saveUserMessage: mockSaveUserMessage,
    saveAssistantMessage: mockSaveAssistantMessage,
    getRecentContext: mockGetRecentContext,
  },
}));

// Mock Twilio client and signature validation
const mockValidateRequest = jest.fn<any>();
const mockTwilioClient = {
  messages: {
    create: jest.fn(),
  },
};

jest.mock('twilio', () => {
  const actualTwilio = jest.fn(() => mockTwilioClient) as any;
  actualTwilio.validateRequest = mockValidateRequest;
  return actualTwilio;
});

// Mock the twilioSignature middleware to always pass
jest.mock('../../../src/middleware/twilioSignature.middleware', () => ({
  twilioSignatureMiddleware: (_req: any, _res: any, next: any) => next(),
  optionalTwilioSignatureMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// Mock the rateLimit middleware to always pass
jest.mock('../../../src/middleware/rateLimit.middleware', () => ({
  rateLimitMiddleware: (_req: any, _res: any, next: any) => next(),
  getRateLimitStatus: jest.fn(),
  resetRateLimit: jest.fn(),
}));

// Mock env for signature validation and Twilio client
jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: '3001',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    TWILIO_ACCOUNT_SID: 'AC' + '0'.repeat(32),
    TWILIO_AUTH_TOKEN: 'test-auth-token-' + '0'.repeat(16),
    TWILIO_PHONE_NUMBER: 'whatsapp:+15555555555',
    ANTHROPIC_API_KEY: 'sk-ant-test-key-' + '0'.repeat(24),
    LOG_LEVEL: 'error',
    PRIVACY_HASH_SALT: 'test-salt-' + '0'.repeat(22),
  },
}));

jest.mock('../../../src/services/ai.service', () => ({
  aiService: {
    generateResponseWithMetrics: mockGenerateResponseWithMetrics,
  },
}));

describe('WebhookController Integration Tests', () => {
  let app: Application;

  beforeAll(async () => {
    // Import app after mocks are set up
    const { createApp } = await import('../../../src/app');
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Twilio signature validation to always return true
    mockValidateRequest.mockReturnValue(true);

    // Setup default successful responses
    mockGetOrCreateConversation.mockResolvedValue({
      conversation: {
        id: 'conv-123',
        userId: 'user-123',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      user: {
        id: 'user-123',
        phoneNumber: '+1234567890',
        name: null,
        language: 'es',
      },
    });

    mockSaveUserMessage.mockResolvedValue({
      id: 'msg-user-123',
      conversationId: 'conv-123',
      role: 'user',
      content: 'Test message',
      twilioSid: 'SM1234567890abcdef1234567890abcdef',
    });

    mockGetRecentContext.mockResolvedValue([
      { role: 'user', content: 'Test message' },
    ]);

    mockGenerateResponseWithMetrics.mockResolvedValue({
      content: 'Hello! How can I help you today?',
      tokensUsed: 50,
      inputTokens: 20,
      outputTokens: 30,
      latencyMs: 500,
      model: 'claude-sonnet-4-20250514',
      stopReason: 'end_turn',
      cost: 0.005,
    });

    mockSaveAssistantMessage.mockResolvedValue({
      id: 'msg-assistant-123',
      conversationId: 'conv-123',
      role: 'assistant',
      content: 'Hello! How can I help you today?',
    });
  });

  describe('POST /webhook/whatsapp - Success Flow', () => {
    it('should process incoming message and return TwiML response', async () => {
      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Hello',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
        ProfileName: 'Test User',
        NumMedia: '0',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200)
        .expect('Content-Type', /xml/);

      // Verify TwiML response
      expect(response.text).toContain('<Response>');
      expect(response.text).toContain('<Message>');
      expect(response.text).toContain('Hello! How can I help you today?');

      // Verify all services were called
      expect(mockGetOrCreateConversation).toHaveBeenCalledWith('+1234567890');
      expect(mockSaveUserMessage).toHaveBeenCalledWith('conv-123', 'Hello', webhookPayload.MessageSid);
      expect(mockGetRecentContext).toHaveBeenCalledWith('conv-123');
      expect(mockGenerateResponseWithMetrics).toHaveBeenCalledWith([
        { role: 'user', content: 'Test message' },
      ]);
      expect(mockSaveAssistantMessage).toHaveBeenCalledWith(
        'conv-123',
        'Hello! How can I help you today?',
        50,
        500
      );
    });

    it('should handle message without ProfileName', async () => {
      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Test',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
        NumMedia: '0',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(response.text).toContain('<Response>');
      expect(mockGetOrCreateConversation).toHaveBeenCalled();
    });

    it('should extract phone number correctly (remove whatsapp: prefix)', async () => {
      const webhookPayload = {
        From: 'whatsapp:+5215512345678',
        Body: 'Hola',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(mockGetOrCreateConversation).toHaveBeenCalledWith('+5215512345678');
    });

    it('should handle empty Body correctly', async () => {
      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: '',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      // Should return error TwiML for empty body
      expect(response.text).toContain('Lo siento');
    });

    it('should pass conversation context to AI service', async () => {
      const conversationContext = [
        { role: 'user', content: 'Previous message 1' },
        { role: 'assistant', content: 'Previous response 1' },
        { role: 'user', content: 'Current message' },
      ];

      mockGetRecentContext.mockResolvedValue(conversationContext);

      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Current message',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(mockGenerateResponseWithMetrics).toHaveBeenCalledWith(conversationContext);
    });

    it('should save metrics from AI response', async () => {
      const aiResponse = {
        content: 'AI response',
        tokensUsed: 100,
        inputTokens: 60,
        outputTokens: 40,
        latencyMs: 1500,
        model: 'claude-sonnet-4-20250514',
        stopReason: 'end_turn',
        cost: 0.01,
      };

      mockGenerateResponseWithMetrics.mockResolvedValue(aiResponse);

      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Test',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(mockSaveAssistantMessage).toHaveBeenCalledWith(
        'conv-123',
        'AI response',
        100,
        1500
      );
    });
  });

  describe('POST /webhook/whatsapp - Validation Errors', () => {
    it('should reject request when From field is missing (validation middleware)', async () => {
      const invalidPayload = {
        Body: 'Hello',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(invalidPayload)
        .expect(400)
        .expect('Content-Type', /xml/);

      expect(response.text).toContain('<Response>');
      // Services should not be called
      expect(mockGetOrCreateConversation).not.toHaveBeenCalled();
    });

    it('should reject request when Body field is missing (validation middleware)', async () => {
      const invalidPayload = {
        From: 'whatsapp:+1234567890',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(invalidPayload)
        .expect(400)
        .expect('Content-Type', /xml/);

      expect(response.text).toContain('<Response>');
      expect(mockGetOrCreateConversation).not.toHaveBeenCalled();
    });

    it('should reject request when both From and Body are missing (validation middleware)', async () => {
      const invalidPayload = {
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(invalidPayload)
        .expect(400)
        .expect('Content-Type', /xml/);

      expect(response.text).toContain('<Response>');
      expect(mockGetOrCreateConversation).not.toHaveBeenCalled();
    });
  });

  describe('POST /webhook/whatsapp - Service Errors', () => {
    it('should handle conversation service error gracefully', async () => {
      mockGetOrCreateConversation.mockRejectedValue(new Error('Database connection failed'));

      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Test',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200)
        .expect('Content-Type', /xml/);

      expect(response.text).toContain('Lo siento');
      expect(response.text).toContain('dificultades técnicas');

      // Should not call subsequent services
      expect(mockSaveUserMessage).not.toHaveBeenCalled();
    });

    it('should handle message save error gracefully', async () => {
      mockSaveUserMessage.mockRejectedValue(new Error('Failed to save message'));

      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Test',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(response.text).toContain('Lo siento');
      expect(mockGenerateResponseWithMetrics).not.toHaveBeenCalled();
    });

    it('should handle AI service error gracefully', async () => {
      mockGenerateResponseWithMetrics.mockRejectedValue(new Error('AI service unavailable'));

      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Test',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(response.text).toContain('Lo siento');
      expect(response.text).toContain('dificultades técnicas');
    });

    it('should handle context retrieval error gracefully', async () => {
      mockGetRecentContext.mockRejectedValue(new Error('Redis connection failed'));

      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Test',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(response.text).toContain('Lo siento');
    });

    it('should handle assistant message save error gracefully', async () => {
      mockSaveAssistantMessage.mockRejectedValue(new Error('Failed to save assistant message'));

      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Test',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(response.text).toContain('Lo siento');
    });
  });

  describe('POST /webhook/whatsapp - Edge Cases', () => {
    it('should handle very long message body', async () => {
      const longMessage = 'a'.repeat(5000);
      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: longMessage,
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(response.text).toContain('<Response>');
      expect(mockSaveUserMessage).toHaveBeenCalledWith('conv-123', longMessage, webhookPayload.MessageSid);
    });

    it('should handle special characters in message', async () => {
      const specialMessage = '¡Hola! ¿Cómo estás? 😊 <>"`&';
      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: specialMessage,
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(response.text).toContain('<Response>');
      expect(mockSaveUserMessage).toHaveBeenCalledWith('conv-123', specialMessage, expect.any(String));
    });

    it('should handle message with media attachments info', async () => {
      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Check this image',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
        NumMedia: '1',
        MediaUrl0: 'https://example.com/image.jpg',
        MediaContentType0: 'image/jpeg',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(response.text).toContain('<Response>');
    });

    it('should handle international phone numbers', async () => {
      const webhookPayload = {
        From: 'whatsapp:+442071234567', // UK number
        Body: 'Test',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(mockGetOrCreateConversation).toHaveBeenCalledWith('+442071234567');
    });

    it('should handle new conversation (user not exists)', async () => {
      mockGetOrCreateConversation.mockResolvedValue({
        conversation: {
          id: 'new-conv-123',
          userId: 'new-user-123',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        user: {
          id: 'new-user-123',
          phoneNumber: '+9999999999',
          name: null,
          language: 'es',
        },
      });

      const webhookPayload = {
        From: 'whatsapp:+9999999999',
        Body: 'First message',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(response.text).toContain('<Response>');
      expect(mockGetOrCreateConversation).toHaveBeenCalledWith('+9999999999');
    });

    it('should handle AI response with stop_reason max_tokens', async () => {
      mockGenerateResponseWithMetrics.mockResolvedValue({
        content: 'Truncated response...',
        tokensUsed: 4096,
        inputTokens: 3000,
        outputTokens: 1096,
        latencyMs: 2000,
        model: 'claude-sonnet-4-20250514',
        stopReason: 'max_tokens',
        cost: 0.02,
      });

      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Tell me a very long story',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(response.text).toContain('Truncated response...');
    });

    it('should handle very fast AI response', async () => {
      mockGenerateResponseWithMetrics.mockResolvedValue({
        content: 'Quick response',
        tokensUsed: 10,
        inputTokens: 5,
        outputTokens: 5,
        latencyMs: 50,
        model: 'claude-sonnet-4-20250514',
        stopReason: 'end_turn',
        cost: 0.001,
      });

      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Hi',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(response.text).toContain('Quick response');
    });
  });

  describe('POST /webhook/whatsapp - Complete Flow Verification', () => {
    it('should execute complete flow in correct order', async () => {
      const callOrder: string[] = [];

      mockGetOrCreateConversation.mockImplementation(async () => {
        callOrder.push('getOrCreateConversation');
        return {
          conversation: { id: 'conv-123', userId: 'user-123', status: 'active', createdAt: new Date(), updatedAt: new Date() },
          user: { id: 'user-123', phoneNumber: '+1234567890', name: null, language: 'es' },
        };
      });

      mockSaveUserMessage.mockImplementation(async () => {
        callOrder.push('saveUserMessage');
        return { id: 'msg-123' };
      });

      mockGetRecentContext.mockImplementation(async () => {
        callOrder.push('getRecentContext');
        return [{ role: 'user', content: 'Test' }];
      });

      mockGenerateResponseWithMetrics.mockImplementation(async () => {
        callOrder.push('generateResponseWithMetrics');
        return {
          content: 'Response',
          tokensUsed: 50,
          inputTokens: 20,
          outputTokens: 30,
          latencyMs: 500,
          model: 'claude-sonnet-4-20250514',
          stopReason: 'end_turn',
          cost: 0.005,
        };
      });

      mockSaveAssistantMessage.mockImplementation(async () => {
        callOrder.push('saveAssistantMessage');
        return { id: 'msg-assistant-123' };
      });

      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Test',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      // Verify correct order
      expect(callOrder).toEqual([
        'getOrCreateConversation',
        'saveUserMessage',
        'getRecentContext',
        'generateResponseWithMetrics',
        'saveAssistantMessage',
      ]);
    });

    it('should not call AI service if user message save fails', async () => {
      mockSaveUserMessage.mockRejectedValue(new Error('Save failed'));

      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Test',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(mockGetOrCreateConversation).toHaveBeenCalled();
      expect(mockSaveUserMessage).toHaveBeenCalled();
      // Should stop here
      expect(mockGetRecentContext).not.toHaveBeenCalled();
      expect(mockGenerateResponseWithMetrics).not.toHaveBeenCalled();
      expect(mockSaveAssistantMessage).not.toHaveBeenCalled();
    });
  });

  describe('TwiML Response Format', () => {
    it('should return properly formatted TwiML', async () => {
      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Test',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200)
        .expect('Content-Type', /xml/);

      // Verify XML structure
      expect(response.text).toMatch(/<\?xml version="1.0" encoding="UTF-8"\?>/);
      expect(response.text).toContain('<Response>');
      expect(response.text).toContain('<Message>');
      expect(response.text).toContain('</Message>');
      expect(response.text).toContain('</Response>');
    });

    it('should return TwiML with AI response content', async () => {
      const aiResponseContent = 'This is a test AI response with multiple words!';
      mockGenerateResponseWithMetrics.mockResolvedValue({
        content: aiResponseContent,
        tokensUsed: 50,
        inputTokens: 20,
        outputTokens: 30,
        latencyMs: 500,
        model: 'claude-sonnet-4-20250514',
        stopReason: 'end_turn',
        cost: 0.005,
      });

      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Test',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200);

      expect(response.text).toContain(aiResponseContent);
    });

    it('should return TwiML error format on service failure', async () => {
      mockGetOrCreateConversation.mockRejectedValue(new Error('Service error'));

      const webhookPayload = {
        From: 'whatsapp:+1234567890',
        Body: 'Test',
        MessageSid: 'SM1234567890abcdef1234567890abcdef',
      };

      const response = await request(app)
        .post('/webhook/whatsapp').type('form')
        .send(webhookPayload)
        .expect(200)
        .expect('Content-Type', /xml/);

      expect(response.text).toContain('<Response>');
      expect(response.text).toContain('<Message>');
      expect(response.text).toContain('Lo siento');
      expect(response.text).not.toContain('Service error'); // Should not leak internal error
    });
  });
});
