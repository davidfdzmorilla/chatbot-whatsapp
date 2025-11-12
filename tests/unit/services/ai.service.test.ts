/**
 * Unit Tests: AIService
 * Tests para el servicio de integración con Claude API (Anthropic)
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Anthropic from '@anthropic-ai/sdk';

// Mock Anthropic SDK and config
const mockMessagesCreate = jest.fn<any>();
const mockEstimateTokens = jest.fn<any>();
const mockCalculateCost = jest.fn<any>();

jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: class MockAnthropic {
      messages = {
        create: mockMessagesCreate,
      };
      static APIError = class APIError extends Error {
        status?: number;
        error?: any;
        constructor(message: string, status?: number, error?: any) {
          super(message);
          this.status = status;
          this.error = error;
          this.name = 'APIError';
        }
      };
    },
  };
});

jest.mock('../../../src/config/anthropic', () => ({
  anthropic: {
    messages: {
      create: mockMessagesCreate,
    },
  },
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
  MAX_TOKENS: 4096,
  TEMPERATURE: 1,
  DEFAULT_SYSTEM_PROMPT:
    'Eres un asistente útil que responde en español de forma concisa y amigable.',
  estimateTokens: mockEstimateTokens,
  calculateCost: mockCalculateCost,
}));

describe('AIService', () => {
  let aiService: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup default mocks
    mockEstimateTokens.mockImplementation((text: string) => Math.ceil(text.length / 4));
    mockCalculateCost.mockReturnValue(0.005);

    const { AIService } = await import('../../../src/services/ai.service');
    aiService = new AIService();
  });

  describe('generateResponse', () => {
    it('should generate response successfully', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hola, ¿cómo puedo ayudarte?' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 20,
          output_tokens: 15,
        },
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const messages = [{ role: 'user', content: 'Hola' }];
      const result = await aiService.generateResponse(messages);

      expect(result).toBe('Hola, ¿cómo puedo ayudarte?');
      expect(mockMessagesCreate).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        temperature: 1,
        system: 'Eres un asistente útil que responde en español de forma concisa y amigable.',
        messages: [{ role: 'user', content: 'Hola' }],
      });
    });

    it('should use custom system prompt when provided', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const customPrompt = 'You are a helpful assistant.';
      await aiService.generateResponse([{ role: 'user', content: 'Hi' }], customPrompt);

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: customPrompt,
        })
      );
    });

    it('should throw error when API call fails', async () => {
      mockMessagesCreate.mockRejectedValue(new Error('API error'));

      await expect(
        aiService.generateResponse([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow();
    });
  });

  describe('generateResponseWithMetrics', () => {
    it('should return full response with metrics', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Response text' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const result = await aiService.generateResponseWithMetrics([
        { role: 'user', content: 'Test' },
      ]);

      expect(result).toMatchObject({
        content: 'Response text',
        tokensUsed: 150,
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: expect.any(Number),
        model: 'claude-sonnet-4-20250514',
        stopReason: 'end_turn',
        cost: 0.005,
      });

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple text blocks in response', async () => {
      const mockResponse = {
        content: [
          { type: 'text', text: 'First part' },
          { type: 'text', text: 'Second part' },
        ],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const result = await aiService.generateResponseWithMetrics([
        { role: 'user', content: 'Test' },
      ]);

      expect(result.content).toBe('First part\nSecond part');
    });

    it('should filter out non-text content blocks', async () => {
      const mockResponse = {
        content: [
          { type: 'text', text: 'Text content' },
          { type: 'image', source: 'image-data' },
        ],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const result = await aiService.generateResponseWithMetrics([
        { role: 'user', content: 'Test' },
      ]);

      expect(result.content).toBe('Text content');
    });

    it('should calculate latency correctly', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockMessagesCreate.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockResponse), 100))
      );

      const result = await aiService.generateResponseWithMetrics([
        { role: 'user', content: 'Test' },
      ]);

      expect(result.latencyMs).toBeGreaterThan(50);
    });
  });

  describe('Retry Logic', () => {
    it.skip('should retry on rate limit error (429)', async () => {
      const APIError = (Anthropic as any).APIError;
      const rateLimitError = new APIError('Rate limit', 429);

      const mockResponse = {
        content: [{ type: 'text', text: 'Success after retry' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockMessagesCreate.mockRejectedValueOnce(rateLimitError).mockResolvedValue(mockResponse);

      const result = await aiService.generateResponse([{ role: 'user', content: 'Test' }]);

      expect(result).toBe('Success after retry');
      expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
    });

    it.skip('should retry on server error (500)', async () => {
      const APIError = (Anthropic as any).APIError;
      const serverError = new APIError('Server error', 500);

      const mockResponse = {
        content: [{ type: 'text', text: 'Success' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockMessagesCreate.mockRejectedValueOnce(serverError).mockResolvedValue(mockResponse);

      const result = await aiService.generateResponse([{ role: 'user', content: 'Test' }]);

      expect(result).toBe('Success');
      expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
    });

    it.skip('should retry on network timeout error', async () => {
      const timeoutError = new Error('Request timeout');

      const mockResponse = {
        content: [{ type: 'text', text: 'Success' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockMessagesCreate.mockRejectedValueOnce(timeoutError).mockResolvedValue(mockResponse);

      const result = await aiService.generateResponse([{ role: 'user', content: 'Test' }]);

      expect(result).toBe('Success');
      expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
    });

    it.skip('should fail after max retries (3 attempts)', async () => {
      const APIError = (Anthropic as any).APIError;
      const serverError = new APIError('Server error', 500);

      mockMessagesCreate.mockRejectedValue(serverError);

      await expect(
        aiService.generateResponse([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow();

      expect(mockMessagesCreate).toHaveBeenCalledTimes(3);
    });

    it('should not retry on authentication error (401)', async () => {
      const APIError = (Anthropic as any).APIError;
      const authError = new APIError('Auth failed', 401);

      mockMessagesCreate.mockRejectedValue(authError);

      await expect(
        aiService.generateResponse([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow('Authentication error');

      expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    });

    it('should not retry on bad request error (400)', async () => {
      const APIError = (Anthropic as any).APIError;
      const badRequestError = new APIError('Bad request', 400);

      mockMessagesCreate.mockRejectedValue(badRequestError);

      await expect(
        aiService.generateResponse([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow('Invalid request');

      expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle rate limit error with friendly message', async () => {
      const APIError = (Anthropic as any).APIError;
      const rateLimitError = new APIError('Rate limit', 429);

      mockMessagesCreate.mockRejectedValue(rateLimitError);

      await expect(
        aiService.generateResponse([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow('high demand');
    });

    it('should handle authentication error', async () => {
      const APIError = (Anthropic as any).APIError;
      const authError = new APIError('Unauthorized', 401);

      mockMessagesCreate.mockRejectedValue(authError);

      await expect(
        aiService.generateResponse([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow('Authentication error');
    });

    it('should handle bad request error', async () => {
      const APIError = (Anthropic as any).APIError;
      const badRequestError = new APIError('Invalid params', 400);

      mockMessagesCreate.mockRejectedValue(badRequestError);

      await expect(
        aiService.generateResponse([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow('Invalid request');
    });

    it('should handle server error (5xx)', async () => {
      const APIError = (Anthropic as any).APIError;
      const serverError = new APIError('Internal server error', 503);

      mockMessagesCreate.mockRejectedValue(serverError);

      await expect(
        aiService.generateResponse([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow('temporarily unavailable');
    });

    it('should handle generic API error', async () => {
      const APIError = (Anthropic as any).APIError;
      const genericError = new APIError('Unknown error', 418);

      mockMessagesCreate.mockRejectedValue(genericError);

      await expect(
        aiService.generateResponse([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow('LLM API error');
    });

    it('should handle non-API errors', async () => {
      mockMessagesCreate.mockRejectedValue(new Error('Network error'));

      await expect(
        aiService.generateResponse([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow();
    });
  });

  describe('validateMessages', () => {
    it('should validate correct messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'How are you?' },
      ];

      const result = aiService.validateMessages(messages);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty messages array', () => {
      const result = aiService.validateMessages([]);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Messages array is empty');
    });

    it('should reject invalid role', () => {
      const messages = [{ role: 'invalid', content: 'Test' }];

      const result = aiService.validateMessages(messages);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid role');
    });

    it('should reject empty content', () => {
      const messages = [{ role: 'user', content: '' }];

      const result = aiService.validateMessages(messages);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message content cannot be empty');
    });

    it('should reject whitespace-only content', () => {
      const messages = [{ role: 'user', content: '   ' }];

      const result = aiService.validateMessages(messages);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message content cannot be empty');
    });

    it('should reject if last message is not from user', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ];

      const result = aiService.validateMessages(messages);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Last message must be from user');
    });
  });

  describe('truncateMessages', () => {
    beforeEach(() => {
      // Mock estimateTokens to return 100 tokens per message
      mockEstimateTokens.mockReturnValue(100);
    });

    it('should keep all messages if under token limit', () => {
      const messages = [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
        { role: 'user', content: 'Message 2' },
      ];

      const result = aiService.truncateMessages(messages, 500);

      expect(result).toHaveLength(3);
      expect(result).toEqual(messages);
    });

    it('should truncate old messages when exceeding token limit', () => {
      const messages = [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
        { role: 'user', content: 'Message 2' },
        { role: 'assistant', content: 'Response 2' },
        { role: 'user', content: 'Message 3' },
      ];

      const result = aiService.truncateMessages(messages, 250);

      expect(result.length).toBeLessThan(messages.length);
      expect(result[result.length - 1]).toEqual(messages[messages.length - 1]);
    });

    it('should keep most recent messages', () => {
      const messages = [
        { role: 'user', content: 'Old message' },
        { role: 'assistant', content: 'Old response' },
        { role: 'user', content: 'Recent message' },
      ];

      const result = aiService.truncateMessages(messages, 150);

      expect(result).toContain(messages[2]);
    });

    it('should handle empty messages array', () => {
      const result = aiService.truncateMessages([], 1000);

      expect(result).toHaveLength(0);
    });

    it('should use default token limit if not specified', () => {
      const messages = [
        { role: 'user', content: 'Test' },
        { role: 'assistant', content: 'Response' },
      ];

      const result = aiService.truncateMessages(messages);

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for text', () => {
      mockEstimateTokens.mockReturnValue(25);

      const result = aiService.estimateTokens('This is a test message');

      expect(result).toBe(25);
      expect(mockEstimateTokens).toHaveBeenCalledWith('This is a test message');
    });

    it('should handle empty string', () => {
      mockEstimateTokens.mockReturnValue(0);

      const result = aiService.estimateTokens('');

      expect(result).toBe(0);
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for tokens', () => {
      mockCalculateCost.mockReturnValue(0.015);

      const result = aiService.calculateCost(1000, 500);

      expect(result).toBe(0.015);
      expect(mockCalculateCost).toHaveBeenCalledWith(1000, 500);
    });

    it('should handle zero tokens', () => {
      mockCalculateCost.mockReturnValue(0);

      const result = aiService.calculateCost(0, 0);

      expect(result).toBe(0);
    });
  });

  describe('getFallbackResponse', () => {
    it('should return friendly fallback message', () => {
      const message = aiService.getFallbackResponse();

      expect(message).toContain('Lo siento');
      expect(message).toContain('dificultades técnicas');
    });
  });

  describe('Message Conversion', () => {
    it('should convert messages to Anthropic format', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'How are you?' },
      ];

      await aiService.generateResponse(messages);

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
            { role: 'user', content: 'How are you?' },
          ],
        })
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle response with unknown stop_reason', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const result = await aiService.generateResponseWithMetrics([
        { role: 'user', content: 'Test' },
      ]);

      expect(result.stopReason).toBe('unknown');
    });

    it('should handle response with no content blocks', async () => {
      const mockResponse = {
        content: [],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 0 },
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const result = await aiService.generateResponseWithMetrics([
        { role: 'user', content: 'Test' },
      ]);

      expect(result.content).toBe('');
    });

    it('should handle very long messages', async () => {
      const longMessage = 'a'.repeat(10000);
      const mockResponse = {
        content: [{ type: 'text', text: 'Response to long message' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 2500, output_tokens: 10 },
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const result = await aiService.generateResponse([{ role: 'user', content: longMessage }]);

      expect(result).toBe('Response to long message');
    });

    it('should handle special characters in messages', async () => {
      const specialMessage = '¡Hola! ¿Cómo estás? 😊 <>"`&';
      const mockResponse = {
        content: [{ type: 'text', text: '¡Bien! ¿Y tú?' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 20, output_tokens: 10 },
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const result = await aiService.generateResponse([{ role: 'user', content: specialMessage }]);

      expect(result).toBe('¡Bien! ¿Y tú?');
    });
  });
});
