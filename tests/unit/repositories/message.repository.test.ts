/**
 * Unit Tests: MessageRepository
 * Tests para el repositorio de mensajes
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MessageRole } from '@prisma/client';
import { createMockMessage } from '../../helpers/test-utils';

// Mock Prisma
const mockCreate = jest.fn<any>();
const mockFindMany = jest.fn<any>();
const mockFindUnique = jest.fn<any>();
const mockUpdate = jest.fn<any>();
const mockCount = jest.fn<any>();
const mockAggregate = jest.fn<any>();
const mockDeleteMany = jest.fn<any>();

jest.mock('../../../src/config/database', () => ({
  prisma: {
    message: {
      create: mockCreate,
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      update: mockUpdate,
      count: mockCount,
      aggregate: mockAggregate,
      deleteMany: mockDeleteMany,
    },
  },
}));

describe('MessageRepository', () => {
  let messageRepository: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const { MessageRepository } = await import('../../../src/repositories/message.repository');
    messageRepository = new MessageRepository();
  });

  describe('create', () => {
    it('should create a new message successfully', async () => {
      const messageData = {
        conversationId: 'conv-123',
        role: MessageRole.USER,
        content: 'Test message',
        twilioSid: 'SM1234567890',
      };

      const mockMessage = createMockMessage(messageData);
      mockCreate.mockResolvedValue(mockMessage);

      const result = await messageRepository.create(messageData);

      expect(result).toEqual(mockMessage);
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          conversationId: messageData.conversationId,
          role: messageData.role,
          content: messageData.content,
          twilioSid: messageData.twilioSid,
          metadata: undefined,
          tokensUsed: undefined,
          latencyMs: undefined,
        },
      });
    });

    it('should create message with metrics', async () => {
      const messageData = {
        conversationId: 'conv-123',
        role: MessageRole.ASSISTANT,
        content: 'AI response',
        tokensUsed: 150,
        latencyMs: 250,
      };

      const mockMessage = createMockMessage(messageData);
      mockCreate.mockResolvedValue(mockMessage);

      const result = await messageRepository.create(messageData);

      expect(result.tokensUsed).toBe(150);
      expect(result.latencyMs).toBe(250);
    });

    it('should create message with metadata', async () => {
      const metadata = { source: 'whatsapp', priority: 'high' };
      const messageData = {
        conversationId: 'conv-123',
        role: MessageRole.SYSTEM,
        content: 'System notification',
        metadata,
      };

      const mockMessage = createMockMessage({ ...messageData, metadata });
      mockCreate.mockResolvedValue(mockMessage);

      const result = await messageRepository.create(messageData);

      expect(result.metadata).toEqual(metadata);
    });
  });

  describe('findByConversationId', () => {
    it('should find all messages in conversation', async () => {
      const conversationId = 'conv-123';
      const mockMessages = [
        createMockMessage({ id: 'msg-1', conversationId, content: 'Message 1' }),
        createMockMessage({ id: 'msg-2', conversationId, content: 'Message 2' }),
        createMockMessage({ id: 'msg-3', conversationId, content: 'Message 3' }),
      ];

      mockFindMany.mockResolvedValue(mockMessages);

      const result = await messageRepository.findByConversationId(conversationId);

      expect(result).toHaveLength(3);
      expect(result).toEqual(mockMessages);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should find messages with limit', async () => {
      const conversationId = 'conv-123';
      const limit = 5;
      const mockMessages = Array.from({ length: 5 }, (_, i) =>
        createMockMessage({ id: `msg-${i}`, conversationId })
      );

      mockFindMany.mockResolvedValue(mockMessages);

      const result = await messageRepository.findByConversationId(conversationId, limit);

      expect(result).toHaveLength(5);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
    });

    it('should return empty array if no messages', async () => {
      const conversationId = 'conv-empty';
      mockFindMany.mockResolvedValue([]);

      const result = await messageRepository.findByConversationId(conversationId);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('findRecentByConversationId', () => {
    it('should find recent messages in chronological order', async () => {
      const conversationId = 'conv-123';
      const limit = 3;

      // Mock returns in DESC order (newest first)
      const mockMessagesDesc = [
        createMockMessage({ id: 'msg-3', content: 'Message 3' }),
        createMockMessage({ id: 'msg-2', content: 'Message 2' }),
        createMockMessage({ id: 'msg-1', content: 'Message 1' }),
      ];

      mockFindMany.mockResolvedValue(mockMessagesDesc);

      const result = await messageRepository.findRecentByConversationId(conversationId, limit);

      // Should be reversed to ASC order (oldest first)
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('msg-1');
      expect(result[1].id).toBe('msg-2');
      expect(result[2].id).toBe('msg-3');

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    });

    it('should return empty array if no messages', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await messageRepository.findRecentByConversationId('conv-123', 10);

      expect(result).toEqual([]);
    });
  });

  describe('findByTwilioSid', () => {
    it('should find message by Twilio SID', async () => {
      const twilioSid = 'SM1234567890';
      const mockMessage = createMockMessage({ twilioSid });

      mockFindUnique.mockResolvedValue(mockMessage);

      const result = await messageRepository.findByTwilioSid(twilioSid);

      expect(result).toEqual(mockMessage);
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { twilioSid },
      });
    });

    it('should return null if message not found', async () => {
      const twilioSid = 'SM_NONEXISTENT';
      mockFindUnique.mockResolvedValue(null);

      const result = await messageRepository.findByTwilioSid(twilioSid);

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find message by ID', async () => {
      const messageId = 'msg-123';
      const mockMessage = createMockMessage({ id: messageId });

      mockFindUnique.mockResolvedValue(mockMessage);

      const result = await messageRepository.findById(messageId);

      expect(result).toEqual(mockMessage);
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: messageId },
      });
    });

    it('should return null if message not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await messageRepository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('countByConversationId', () => {
    it('should count messages in conversation', async () => {
      const conversationId = 'conv-123';
      const expectedCount = 15;

      mockCount.mockResolvedValue(expectedCount);

      const result = await messageRepository.countByConversationId(conversationId);

      expect(result).toBe(expectedCount);
      expect(mockCount).toHaveBeenCalledWith({
        where: { conversationId },
      });
    });

    it('should return 0 for empty conversation', async () => {
      mockCount.mockResolvedValue(0);

      const result = await messageRepository.countByConversationId('conv-empty');

      expect(result).toBe(0);
    });
  });

  describe('updateMetadata', () => {
    it('should update message metadata', async () => {
      const messageId = 'msg-123';
      const metadata = { processed: true, sentiment: 'positive' };

      const mockMessage = createMockMessage({ id: messageId, metadata });
      mockUpdate.mockResolvedValue(mockMessage);

      const result = await messageRepository.updateMetadata(messageId, metadata);

      expect(result.metadata).toEqual(metadata);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: messageId },
        data: { metadata },
      });
    });
  });

  describe('getTokenStats', () => {
    it('should return token statistics for conversation', async () => {
      const conversationId = 'conv-123';
      const mockAggregateResult = {
        _sum: { tokensUsed: 1500 },
        _count: 10,
        _avg: { tokensUsed: 150 },
      };

      mockAggregate.mockResolvedValue(mockAggregateResult);

      const result = await messageRepository.getTokenStats(conversationId);

      expect(result).toEqual({
        totalTokens: 1500,
        messageCount: 10,
        avgTokensPerMessage: 150,
      });

      expect(mockAggregate).toHaveBeenCalledWith({
        where: {
          conversationId,
          tokensUsed: { not: null },
        },
        _sum: { tokensUsed: true },
        _count: true,
        _avg: { tokensUsed: true },
      });
    });

    it('should return zeros if no messages with tokens', async () => {
      const mockAggregateResult = {
        _sum: { tokensUsed: null },
        _count: 0,
        _avg: { tokensUsed: null },
      };

      mockAggregate.mockResolvedValue(mockAggregateResult);

      const result = await messageRepository.getTokenStats('conv-empty');

      expect(result).toEqual({
        totalTokens: 0,
        messageCount: 0,
        avgTokensPerMessage: 0,
      });
    });
  });

  describe('count', () => {
    it('should return total message count', async () => {
      const expectedCount = 1000;
      mockCount.mockResolvedValue(expectedCount);

      const result = await messageRepository.count();

      expect(result).toBe(expectedCount);
      expect(mockCount).toHaveBeenCalled();
    });
  });

  describe('deleteOldMessages', () => {
    it('should delete old messages and keep recent ones', async () => {
      const conversationId = 'conv-123';
      const keepMostRecent = 10;

      // Mock messages to keep (most recent 10)
      const messagesToKeep = Array.from({ length: 10 }, (_, i) => ({
        id: `msg-recent-${i}`,
      }));

      mockFindMany.mockResolvedValue(messagesToKeep);
      mockDeleteMany.mockResolvedValue({ count: 5 }); // 5 old messages deleted

      const result = await messageRepository.deleteOldMessages(conversationId, keepMostRecent);

      expect(result).toBe(5);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: keepMostRecent,
        select: { id: true },
      });

      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: {
          conversationId,
          id: { notIn: messagesToKeep.map((m) => m.id) },
        },
      });
    });

    it('should return 0 if no messages to delete', async () => {
      const conversationId = 'conv-123';
      const keepMostRecent = 10;

      mockFindMany.mockResolvedValue([{ id: 'msg-1' }, { id: 'msg-2' }]);
      mockDeleteMany.mockResolvedValue({ count: 0 });

      const result = await messageRepository.deleteOldMessages(conversationId, keepMostRecent);

      expect(result).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when create fails', async () => {
      const messageData = {
        conversationId: 'conv-123',
        role: MessageRole.USER,
        content: 'Test',
      };

      const error = new Error('Database error');
      mockCreate.mockRejectedValue(error);

      await expect(messageRepository.create(messageData)).rejects.toThrow('Database error');
    });

    it('should throw error when findByConversationId fails', async () => {
      const error = new Error('Query failed');
      mockFindMany.mockRejectedValue(error);

      await expect(messageRepository.findByConversationId('conv-123')).rejects.toThrow(
        'Query failed'
      );
    });

    it('should throw error when getTokenStats fails', async () => {
      const error = new Error('Aggregate error');
      mockAggregate.mockRejectedValue(error);

      await expect(messageRepository.getTokenStats('conv-123')).rejects.toThrow('Aggregate error');
    });
  });
});
