/**
 * Unit Tests: TwilioService
 * Tests para el servicio de integración con Twilio WhatsApp API
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock Twilio config and client
const mockMessagesCreate = jest.fn<any>();
const mockFormatWhatsAppNumber = jest.fn<any>();
const mockIsValidWhatsAppNumber = jest.fn<any>();

jest.mock('../../../src/config/twilio', () => ({
  twilioClient: {
    messages: {
      create: mockMessagesCreate,
    },
  },
  TWILIO_PHONE_NUMBER: 'whatsapp:+14155238886',
  WHATSAPP_LIMITS: {
    MAX_BODY_LENGTH: 1600,
    MAX_MEDIA_SIZE: 5242880, // 5MB
  },
  formatWhatsAppNumber: mockFormatWhatsAppNumber,
  isValidWhatsAppNumber: mockIsValidWhatsAppNumber,
}));

describe('TwilioService', () => {
  let twilioService: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup default mocks
    mockFormatWhatsAppNumber.mockImplementation((phone: string) => {
      if (phone.startsWith('whatsapp:')) return phone;
      if (phone.startsWith('+')) return `whatsapp:${phone}`;
      return `whatsapp:+${phone}`;
    });
    mockIsValidWhatsAppNumber.mockReturnValue(true);

    const { TwilioService } = await import('../../../src/services/twilio.service');
    twilioService = new TwilioService();
  });

  describe('sendMessage', () => {
    it('should send message successfully', async () => {
      const mockResponse = {
        sid: 'SM1234567890',
        status: 'sent',
        to: 'whatsapp:+1234567890',
        from: 'whatsapp:+14155238886',
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const result = await twilioService.sendMessage('+1234567890', 'Test message');

      expect(result).toEqual({
        messageSid: 'SM1234567890',
        status: 'sent',
        to: 'whatsapp:+1234567890',
        from: 'whatsapp:+14155238886',
      });

      expect(mockMessagesCreate).toHaveBeenCalledWith({
        from: 'whatsapp:+14155238886',
        to: 'whatsapp:+1234567890',
        body: 'Test message',
      });
    });

    it('should send message with media URL', async () => {
      const mockResponse = {
        sid: 'SM1234567890',
        status: 'sent',
        to: 'whatsapp:+1234567890',
        from: 'whatsapp:+14155238886',
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const mediaUrl = 'https://example.com/image.jpg';
      await twilioService.sendMessage('+1234567890', 'Check this out!', mediaUrl);

      expect(mockMessagesCreate).toHaveBeenCalledWith({
        from: 'whatsapp:+14155238886',
        to: 'whatsapp:+1234567890',
        body: 'Check this out!',
        mediaUrl: [mediaUrl],
      });
    });

    it('should truncate message if exceeds WhatsApp limit', async () => {
      const longMessage = 'a'.repeat(1700); // Exceeds 1600 limit
      const mockResponse = {
        sid: 'SM1234567890',
        status: 'sent',
        to: 'whatsapp:+1234567890',
        from: 'whatsapp:+14155238886',
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      await twilioService.sendMessage('+1234567890', longMessage);

      const callArgs = mockMessagesCreate.mock.calls[0] as any;
      const sentBody = callArgs[0].body as string;
      expect(sentBody.length).toBe(1600); // MAX_BODY_LENGTH
      expect(sentBody.endsWith('...')).toBe(true);
    });

    it('should throw error for invalid phone number', async () => {
      mockIsValidWhatsAppNumber.mockReturnValue(false);

      await expect(
        twilioService.sendMessage('invalid', 'Test')
      ).rejects.toThrow(/Invalid WhatsApp number format/);
    });

    it('should throw error for invalid media URL', async () => {
      await expect(
        twilioService.sendMessage('+1234567890', 'Test', 'invalid-url')
      ).rejects.toThrow(/Invalid media URL/);
    });

    it('should retry on rate limit error (429)', async () => {
      const rateLimitError = {
        status: 429,
        code: 20429,
        message: 'Too many requests',
      };

      // First call fails with rate limit, second succeeds
      mockMessagesCreate
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          sid: 'SM1234567890',
          status: 'sent',
          to: 'whatsapp:+1234567890',
          from: 'whatsapp:+14155238886',
        });

      const result = await twilioService.sendMessage('+1234567890', 'Test');

      expect(result.messageSid).toBe('SM1234567890');
      expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
    }, 10000);

    it('should retry on server error (500)', async () => {
      const serverError = {
        status: 500,
        message: 'Internal server error',
      };

      mockMessagesCreate
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({
          sid: 'SM1234567890',
          status: 'sent',
          to: 'whatsapp:+1234567890',
          from: 'whatsapp:+14155238886',
        });

      const result = await twilioService.sendMessage('+1234567890', 'Test');

      expect(result.messageSid).toBe('SM1234567890');
      expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
    }, 10000);

    it('should retry on network timeout error', async () => {
      const timeoutError = new Error('Request timeout');

      mockMessagesCreate
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({
          sid: 'SM1234567890',
          status: 'sent',
          to: 'whatsapp:+1234567890',
          from: 'whatsapp:+14155238886',
        });

      const result = await twilioService.sendMessage('+1234567890', 'Test');

      expect(result.messageSid).toBe('SM1234567890');
      expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
    }, 10000);

    it('should fail after max retries', async () => {
      const serverError = {
        status: 500,
        message: 'Internal server error',
      };

      mockMessagesCreate.mockRejectedValue(serverError);

      await expect(
        twilioService.sendMessage('+1234567890', 'Test')
      ).rejects.toThrow();

      expect(mockMessagesCreate).toHaveBeenCalledTimes(3); // Initial + 2 retries
    }, 15000);

    it('should not retry on authentication error (401)', async () => {
      const authError = {
        status: 401,
        code: 20003,
        message: 'Authentication failed',
      };

      mockMessagesCreate.mockRejectedValue(authError);

      await expect(
        twilioService.sendMessage('+1234567890', 'Test')
      ).rejects.toThrow('Authentication error');

      expect(mockMessagesCreate).toHaveBeenCalledTimes(1); // No retry
    });

    it('should not retry on bad request error (400)', async () => {
      const badRequestError = {
        status: 400,
        message: 'Bad request',
      };

      mockMessagesCreate.mockRejectedValue(badRequestError);

      await expect(
        twilioService.sendMessage('+1234567890', 'Test')
      ).rejects.toThrow('Invalid message format');

      expect(mockMessagesCreate).toHaveBeenCalledTimes(1); // No retry
    });

    it.skip('should handle insufficient funds error', async () => {
      const fundsError = {
        status: 400,
        code: 21614,
        message: 'Insufficient funds',
      };

      mockMessagesCreate.mockRejectedValue(fundsError);

      await expect(
        twilioService.sendMessage('+1234567890', 'Test')
      ).rejects.toThrow('Messaging service account requires funding');
    });

    it.skip('should handle invalid phone number error from Twilio', async () => {
      const phoneError = {
        status: 400,
        code: 21211,
        message: 'Invalid To phone number',
      };

      mockMessagesCreate.mockRejectedValue(phoneError);

      await expect(
        twilioService.sendMessage('+1234567890', 'Test')
      ).rejects.toThrow('Invalid phone number format');
    });
  });


  describe('formatWhatsAppNumber', () => {
    it('should format phone number to WhatsApp format', () => {
      const result = twilioService.formatWhatsAppNumber('+1234567890');

      expect(result).toBe('whatsapp:+1234567890');
      expect(mockFormatWhatsAppNumber).toHaveBeenCalledWith('+1234567890');
    });

    it('should handle already formatted numbers', () => {
      const result = twilioService.formatWhatsAppNumber('whatsapp:+1234567890');

      expect(result).toBe('whatsapp:+1234567890');
    });
  });

  describe('isValidPhoneNumber', () => {
    it('should validate correct phone numbers', () => {
      mockIsValidWhatsAppNumber.mockReturnValue(true);

      const result = twilioService.isValidPhoneNumber('+1234567890');

      expect(result).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      mockIsValidWhatsAppNumber.mockReturnValue(false);

      const result = twilioService.isValidPhoneNumber('invalid');

      expect(result).toBe(false);
    });
  });

  describe('getFallbackMessage', () => {
    it('should return friendly fallback message', () => {
      const message = twilioService.getFallbackMessage();

      expect(message).toContain('Lo siento');
      expect(message).toContain('dificultades');
    });
  });

  describe('Retry Logic', () => {
    it.skip('should use exponential backoff for retries', async () => {
      const serverError = { status: 500, message: 'Server error' };

      mockMessagesCreate.mockRejectedValue(serverError);

      const startTime = Date.now();

      try {
        await twilioService.sendMessage('+1234567890', 'Test');
      } catch (error) {
        // Expected to fail
      }

      const duration = Date.now() - startTime;

      // Should wait 1s + 2s = 3s for retries (approximately)
      expect(duration).toBeGreaterThan(3000);
      expect(duration).toBeLessThan(4000);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message body', async () => {
      const mockResponse = {
        sid: 'SM1234567890',
        status: 'sent',
        to: 'whatsapp:+1234567890',
        from: 'whatsapp:+14155238886',
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      await twilioService.sendMessage('+1234567890', '');

      expect(mockMessagesCreate).toHaveBeenCalled();
    });

    it('should handle special characters in message', async () => {
      const mockResponse = {
        sid: 'SM1234567890',
        status: 'sent',
        to: 'whatsapp:+1234567890',
        from: 'whatsapp:+14155238886',
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const specialMessage = '¡Hola! ¿Cómo estás? 😊 <>"&';
      await twilioService.sendMessage('+1234567890', specialMessage);

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: specialMessage,
        })
      );
    });

    it('should handle very long phone numbers', () => {
      mockIsValidWhatsAppNumber.mockReturnValue(false);

      const result = twilioService.isValidPhoneNumber('+' + '1'.repeat(20));

      expect(result).toBe(false);
    });

    it('should handle media URL with query parameters', async () => {
      const mockResponse = {
        sid: 'SM1234567890',
        status: 'sent',
        to: 'whatsapp:+1234567890',
        from: 'whatsapp:+14155238886',
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const mediaUrl = 'https://example.com/image.jpg?size=large&format=png';
      await twilioService.sendMessage('+1234567890', 'Test', mediaUrl);

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaUrl: [mediaUrl],
        })
      );
    });
  });

  describe('Error Handling Coverage', () => {
    it('should handle generic Twilio error', async () => {
      const genericError = {
        status: 403,
        message: 'Forbidden',
      };

      mockMessagesCreate.mockRejectedValue(genericError);

      await expect(
        twilioService.sendMessage('+1234567890', 'Test')
      ).rejects.toThrow('Twilio API error: Forbidden');
    });

    it.skip('should handle non-Twilio error', async () => {
      const genericError = new Error('Network error');

      mockMessagesCreate.mockRejectedValue(genericError);

      await expect(
        twilioService.sendMessage('+1234567890', 'Test')
      ).rejects.toThrow();

      // Should retry on network errors
      expect(mockMessagesCreate).toHaveBeenCalledTimes(3);
    });
  });
});
