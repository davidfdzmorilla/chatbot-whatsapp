/**
 * Unit Tests: MessageService
 * Tests para el servicio de gestión de mensajes
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MessageRole } from '@prisma/client';
import { createMockMessage } from '../../helpers/test-utils';

// Mock dependencies
const mockCreate = jest.fn<any>();
const mockFindByTwilioSid = jest.fn<any>();
const mockFindByConversationId = jest.fn<any>();
const mockFindRecentByConversationId = jest.fn<any>();
const mockCountByConversationId = jest.fn<any>();
const mockGetTokenStats = jest.fn<any>();
const mockDeleteOldMessages = jest.fn<any>();

jest.mock('../../../src/repositories/message.repository', () => ({
  messageRepository: {
    create: mockCreate,
    findByTwilioSid: mockFindByTwilioSid,
    findByConversationId: mockFindByConversationId,
    findRecentByConversationId: mockFindRecentByConversationId,
    countByConversationId: mockCountByConversationId,
    getTokenStats: mockGetTokenStats,
    deleteOldMessages: mockDeleteOldMessages,
  },
}));

const mockUpdateConversationTimestamp = jest.fn<any>();
jest.mock('../../../src/services/conversation.service', () => ({
  conversationService: {
    updateConversationTimestamp: mockUpdateConversationTimestamp,
  },
}));

const mockRedisGet = jest.fn<any>();
const mockRedisDel = jest.fn<any>();
jest.mock('../../../src/config/redis', () => ({
  redis: {
    get: mockRedisGet,
    del: mockRedisDel,
  },
  CacheKeys: {
    conversationContext: (id: string) => `conversation:${id}`,
  },
}));

describe('MessageService', () => {
  let messageService: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const { MessageService } = await import('../../../src/services/message.service');
    messageService = new MessageService();
  });

  describe('saveUserMessage', () => {
    it('should save a user message successfully', async () => {
      const conversationId = 'conv-123';
      const content = 'Hello, this is a test message';
      const twilioSid = 'SM1234567890';

      const mockMessage = createMockMessage({
        conversationId,
        content,
        twilioSid,
        role: MessageRole.USER,
      });

      mockFindByTwilioSid.mockResolvedValue(null); // No duplicate
      mockCreate.mockResolvedValue(mockMessage);
      mockUpdateConversationTimestamp.mockResolvedValue(undefined);

      const result = await messageService.saveUserMessage(conversationId, content, twilioSid);

      expect(result).toEqual(mockMessage);
      expect(mockFindByTwilioSid).toHaveBeenCalledWith(twilioSid);
      expect(mockCreate).toHaveBeenCalledWith({
        conversationId,
        role: MessageRole.USER,
        content,
        twilioSid,
      });
      expect(mockUpdateConversationTimestamp).toHaveBeenCalledWith(conversationId);
    });

    it('should detect and return duplicate messages by twilioSid', async () => {
      const conversationId = 'conv-123';
      const content = 'Duplicate message';
      const twilioSid = 'SM1234567890';

      const existingMessage = createMockMessage({
        id: 'existing-msg-id',
        conversationId,
        content,
        twilioSid,
      });

      mockFindByTwilioSid.mockResolvedValue(existingMessage);

      const result = await messageService.saveUserMessage(conversationId, content, twilioSid);

      expect(result).toEqual(existingMessage);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockUpdateConversationTimestamp).not.toHaveBeenCalled();
    });

    it('should save message without twilioSid (no duplicate check)', async () => {
      const conversationId = 'conv-123';
      const content = 'Message without Twilio SID';

      const mockMessage = createMockMessage({
        conversationId,
        content,
        role: MessageRole.USER,
        twilioSid: null,
      });

      mockCreate.mockResolvedValue(mockMessage);
      mockUpdateConversationTimestamp.mockResolvedValue(undefined);

      const result = await messageService.saveUserMessage(conversationId, content);

      expect(result).toEqual(mockMessage);
      expect(mockFindByTwilioSid).not.toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalledWith({
        conversationId,
        role: MessageRole.USER,
        content,
        twilioSid: undefined,
      });
    });
  });

  describe('saveAssistantMessage', () => {
    it('should save an assistant message with metrics', async () => {
      const conversationId = 'conv-123';
      const content = 'Hello! How can I help you?';
      const tokensUsed = 150;
      const latencyMs = 250;

      const mockMessage = createMockMessage({
        conversationId,
        content,
        role: MessageRole.ASSISTANT,
        tokensUsed,
        latencyMs,
      });

      mockCreate.mockResolvedValue(mockMessage);
      mockUpdateConversationTimestamp.mockResolvedValue(undefined);

      const result = await messageService.saveAssistantMessage(
        conversationId,
        content,
        tokensUsed,
        latencyMs
      );

      expect(result).toEqual(mockMessage);
      expect(mockCreate).toHaveBeenCalledWith({
        conversationId,
        role: MessageRole.ASSISTANT,
        content,
        tokensUsed,
        latencyMs,
      });
      expect(mockUpdateConversationTimestamp).toHaveBeenCalledWith(conversationId);
    });
  });

  describe('saveSystemMessage', () => {
    it('should save a system message', async () => {
      const conversationId = 'conv-123';
      const content = 'System notification message';

      const mockMessage = createMockMessage({
        conversationId,
        content,
        role: MessageRole.SYSTEM,
      });

      mockCreate.mockResolvedValue(mockMessage);
      mockUpdateConversationTimestamp.mockResolvedValue(undefined);

      const result = await messageService.saveSystemMessage(conversationId, content);

      expect(result).toEqual(mockMessage);
      expect(mockCreate).toHaveBeenCalledWith({
        conversationId,
        role: MessageRole.SYSTEM,
        content,
      });
    });
  });

  describe('getRecentContext', () => {
    it('should return context from cache if available', async () => {
      const conversationId = 'conv-123';
      const cachedMessages = [
        { role: MessageRole.USER, content: 'Hello' },
        { role: MessageRole.ASSISTANT, content: 'Hi there!' },
      ];

      mockRedisGet.mockResolvedValue(JSON.stringify(cachedMessages));

      const result = await messageService.getRecentContext(conversationId);

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('Hello');
      expect(mockRedisGet).toHaveBeenCalledWith(`conversation:${conversationId}`);
      expect(mockFindRecentByConversationId).not.toHaveBeenCalled();
    });

    it('should fetch from database on cache miss', async () => {
      const conversationId = 'conv-123';
      const messages = [
        createMockMessage({ role: MessageRole.USER, content: 'Hello' }),
        createMockMessage({ role: MessageRole.ASSISTANT, content: 'Hi!' }),
      ];

      mockRedisGet.mockResolvedValue(null); // Cache miss
      mockFindRecentByConversationId.mockResolvedValue(messages);

      const result = await messageService.getRecentContext(conversationId);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ role: MessageRole.USER, content: 'Hello' });
      expect(mockFindRecentByConversationId).toHaveBeenCalledWith(conversationId, 10);
    });
  });

  describe('messageExists', () => {
    it('should return true if message exists', async () => {
      const twilioSid = 'SM1234567890';
      const mockMessage = createMockMessage({ twilioSid });

      mockFindByTwilioSid.mockResolvedValue(mockMessage);

      const result = await messageService.messageExists(twilioSid);

      expect(result).toBe(true);
      expect(mockFindByTwilioSid).toHaveBeenCalledWith(twilioSid);
    });

    it('should return false if message does not exist', async () => {
      const twilioSid = 'SM1234567890';

      mockFindByTwilioSid.mockResolvedValue(null);

      const result = await messageService.messageExists(twilioSid);

      expect(result).toBe(false);
    });
  });

  describe('countMessages', () => {
    it('should return message count for conversation', async () => {
      const conversationId = 'conv-123';
      const count = 15;

      mockCountByConversationId.mockResolvedValue(count);

      const result = await messageService.countMessages(conversationId);

      expect(result).toBe(count);
      expect(mockCountByConversationId).toHaveBeenCalledWith(conversationId);
    });
  });

  describe('getTokenStats', () => {
    it('should return token statistics for conversation', async () => {
      const conversationId = 'conv-123';
      const stats = {
        totalTokens: 1500,
        messageCount: 10,
        avgTokensPerMessage: 150,
      };

      mockGetTokenStats.mockResolvedValue(stats);

      const result = await messageService.getTokenStats(conversationId);

      expect(result).toEqual(stats);
      expect(mockGetTokenStats).toHaveBeenCalledWith(conversationId);
    });
  });

  describe('cleanupOldMessages', () => {
    it('should delete old messages and invalidate cache', async () => {
      const conversationId = 'conv-123';
      const keepMostRecent = 10;
      const deletedCount = 5;

      mockDeleteOldMessages.mockResolvedValue(deletedCount);
      mockRedisDel.mockResolvedValue(1);

      const result = await messageService.cleanupOldMessages(conversationId, keepMostRecent);

      expect(result).toBe(deletedCount);
      expect(mockDeleteOldMessages).toHaveBeenCalledWith(conversationId, keepMostRecent);
      expect(mockRedisDel).toHaveBeenCalledWith(`conversation:${conversationId}`);
    });
  });
});
