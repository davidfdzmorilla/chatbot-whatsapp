/**
 * Unit Tests: ConversationService
 * Tests para el servicio de gestión de conversaciones con cache Redis
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConversationStatus } from '@prisma/client';
import { createMockConversation, createMockUser, createMockMessage } from '../../helpers/test-utils';

// Mock repositories
const mockUpsert = jest.fn<any>();
const mockFindActiveByUserId = jest.fn<any>();
const mockCreate = jest.fn<any>();
const mockFindById = jest.fn<any>();
const mockUpdateLastMessageAt = jest.fn<any>();
const mockCloseConversation = jest.fn<any>();
const mockArchiveConversation = jest.fn<any>();
const mockUpdateContextSummary = jest.fn<any>();
const mockFindRecentByConversationId = jest.fn<any>();

jest.mock('../../../src/repositories/user.repository', () => ({
  userRepository: {
    upsert: mockUpsert,
  },
}));

jest.mock('../../../src/repositories/conversation.repository', () => ({
  conversationRepository: {
    findActiveByUserId: mockFindActiveByUserId,
    create: mockCreate,
    findById: mockFindById,
    updateLastMessageAt: mockUpdateLastMessageAt,
    closeConversation: mockCloseConversation,
    archiveConversation: mockArchiveConversation,
    updateContextSummary: mockUpdateContextSummary,
  },
}));

jest.mock('../../../src/repositories/message.repository', () => ({
  messageRepository: {
    findRecentByConversationId: mockFindRecentByConversationId,
  },
}));

// Mock Redis
const mockRedisGet = jest.fn<any>();
const mockRedisSetex = jest.fn<any>();
const mockRedisDel = jest.fn<any>();

jest.mock('../../../src/config/redis', () => ({
  redis: {
    get: mockRedisGet,
    setex: mockRedisSetex,
    del: mockRedisDel,
  },
  CacheKeys: {
    conversationContext: (id: string) => `conversation:${id}:context`,
  },
}));

describe('ConversationService', () => {
  let conversationService: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const { ConversationService } = await import('../../../src/services/conversation.service');
    conversationService = new ConversationService();
  });

  describe('getOrCreateConversation', () => {
    it('should create new user and conversation if user does not exist', async () => {
      const phoneNumber = '+1234567890';
      const mockUser = createMockUser({ phoneNumber });
      const mockConversation = createMockConversation({
        userId: mockUser.id,
        status: ConversationStatus.ACTIVE,
      });

      mockUpsert.mockResolvedValue(mockUser);
      mockFindActiveByUserId.mockResolvedValue(null); // No active conversation
      mockCreate.mockResolvedValue(mockConversation);

      const result = await conversationService.getOrCreateConversation(phoneNumber);

      expect(result).toEqual({
        conversation: mockConversation,
        user: mockUser,
      });

      expect(mockUpsert).toHaveBeenCalledWith(phoneNumber);
      expect(mockFindActiveByUserId).toHaveBeenCalledWith(mockUser.id);
      expect(mockCreate).toHaveBeenCalledWith(mockUser.id);
    });

    it('should return existing active conversation if exists', async () => {
      const phoneNumber = '+1234567890';
      const mockUser = createMockUser({ phoneNumber });
      const mockConversation = createMockConversation({
        userId: mockUser.id,
        status: ConversationStatus.ACTIVE,
      });

      mockUpsert.mockResolvedValue(mockUser);
      mockFindActiveByUserId.mockResolvedValue(mockConversation);

      const result = await conversationService.getOrCreateConversation(phoneNumber);

      expect(result).toEqual({
        conversation: mockConversation,
        user: mockUser,
      });

      expect(mockCreate).not.toHaveBeenCalled(); // Should not create new conversation
    });

    it('should handle errors from user repository', async () => {
      const phoneNumber = '+1234567890';
      const error = new Error('Database error');

      mockUpsert.mockRejectedValue(error);

      await expect(
        conversationService.getOrCreateConversation(phoneNumber)
      ).rejects.toThrow('Database error');
    });

    it('should handle errors from conversation repository', async () => {
      const phoneNumber = '+1234567890';
      const mockUser = createMockUser({ phoneNumber });

      mockUpsert.mockResolvedValue(mockUser);
      mockFindActiveByUserId.mockResolvedValue(null);
      mockCreate.mockRejectedValue(new Error('Failed to create conversation'));

      await expect(
        conversationService.getOrCreateConversation(phoneNumber)
      ).rejects.toThrow('Failed to create conversation');
    });
  });

  describe('getConversationWithContext', () => {
    it('should return cached conversation if cache hit', async () => {
      const conversationId = 'conv-123';
      const mockConversation = {
        ...createMockConversation({ id: conversationId }),
        messages: [
          {
            id: 'msg-1',
            role: 'USER',
            content: 'Hello',
            createdAt: new Date(),
            tokensUsed: 10,
            latencyMs: 100,
          },
        ],
      };

      mockRedisGet.mockResolvedValue(JSON.stringify(mockConversation));

      const result = await conversationService.getConversationWithContext(conversationId);

      expect(result).toMatchObject(mockConversation);
      expect(mockRedisGet).toHaveBeenCalledWith(`conversation:${conversationId}:context`);
      expect(mockFindById).not.toHaveBeenCalled(); // Should not hit database
    });

    it('should fetch from database and cache on cache miss', async () => {
      const conversationId = 'conv-123';
      const mockConversation = {
        ...createMockConversation({ id: conversationId }),
        messages: [
          {
            id: 'msg-1',
            role: 'USER',
            content: 'Hello',
            createdAt: new Date(),
            tokensUsed: 10,
            latencyMs: 100,
          },
        ],
      };

      mockRedisGet.mockResolvedValue(null); // Cache miss
      mockFindById.mockResolvedValue(mockConversation);
      mockRedisSetex.mockResolvedValue('OK');

      const result = await conversationService.getConversationWithContext(conversationId);

      expect(result).toMatchObject(mockConversation);
      expect(mockFindById).toHaveBeenCalledWith(conversationId, true);
      expect(mockRedisSetex).toHaveBeenCalledWith(
        `conversation:${conversationId}:context`,
        3600,
        JSON.stringify(mockConversation)
      );
    });

    it('should limit messages to MAX_CONTEXT_MESSAGES (10)', async () => {
      const conversationId = 'conv-123';
      const messages = Array.from({ length: 15 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'USER' : 'ASSISTANT',
        content: `Message ${i}`,
        createdAt: new Date(Date.now() + i * 1000),
        tokensUsed: 10,
        latencyMs: 100,
      }));

      const mockConversation = {
        ...createMockConversation({ id: conversationId }),
        messages,
      };

      mockRedisGet.mockResolvedValue(null);
      mockFindById.mockResolvedValue(mockConversation);
      mockRedisSetex.mockResolvedValue('OK');

      const result = await conversationService.getConversationWithContext(conversationId);

      expect(result.messages).toHaveLength(10); // Should be limited to 10
      expect(result.messages[0].id).toBe('msg-5'); // Should be last 10 messages
    });

    it('should invalidate corrupted cache and refetch from database', async () => {
      const conversationId = 'conv-123';
      const mockConversation = {
        ...createMockConversation({ id: conversationId }),
        messages: [
          {
            id: 'msg-1',
            role: 'USER',
            content: 'Hello',
            createdAt: new Date(),
            tokensUsed: 10,
            latencyMs: 100,
          },
        ],
      };

      // First return corrupted cache, then null after deletion
      mockRedisGet.mockResolvedValueOnce('{ invalid json ');
      mockRedisDel.mockResolvedValue(1);
      mockFindById.mockResolvedValue(mockConversation);
      mockRedisSetex.mockResolvedValue('OK');

      const result = await conversationService.getConversationWithContext(conversationId);

      expect(result).toMatchObject(mockConversation);
      expect(mockRedisDel).toHaveBeenCalledWith(`conversation:${conversationId}:context`);
      expect(mockFindById).toHaveBeenCalled();
    });

    it('should throw error if conversation not found', async () => {
      const conversationId = 'nonexistent';

      mockRedisGet.mockResolvedValue(null);
      mockFindById.mockResolvedValue(null);

      await expect(
        conversationService.getConversationWithContext(conversationId)
      ).rejects.toThrow(`Conversation not found: ${conversationId}`);
    });

    it('should handle database errors', async () => {
      const conversationId = 'conv-123';

      mockRedisGet.mockResolvedValue(null);
      mockFindById.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        conversationService.getConversationWithContext(conversationId)
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('updateConversationTimestamp', () => {
    it('should update timestamp and invalidate cache', async () => {
      const conversationId = 'conv-123';

      mockUpdateLastMessageAt.mockResolvedValue(undefined);
      mockRedisDel.mockResolvedValue(1);

      await conversationService.updateConversationTimestamp(conversationId);

      expect(mockUpdateLastMessageAt).toHaveBeenCalledWith(conversationId);
      expect(mockRedisDel).toHaveBeenCalledWith(`conversation:${conversationId}:context`);
    });

    it('should handle repository errors', async () => {
      const conversationId = 'conv-123';

      mockUpdateLastMessageAt.mockRejectedValue(new Error('Update failed'));

      await expect(
        conversationService.updateConversationTimestamp(conversationId)
      ).rejects.toThrow('Update failed');
    });
  });

  describe('closeConversation', () => {
    it('should close conversation and invalidate cache', async () => {
      const conversationId = 'conv-123';
      const userId = 'user-123';
      const mockConversation = createMockConversation({
        id: conversationId,
        userId,
        status: ConversationStatus.CLOSED,
      });

      mockCloseConversation.mockResolvedValue(mockConversation);
      mockRedisDel.mockResolvedValue(1);

      const result = await conversationService.closeConversation(conversationId, userId);

      expect(result).toEqual(mockConversation);
      expect(mockCloseConversation).toHaveBeenCalledWith(conversationId, userId);
      expect(mockRedisDel).toHaveBeenCalledWith(`conversation:${conversationId}:context`);
    });

    it('should handle access control errors', async () => {
      const conversationId = 'conv-123';
      const userId = 'user-other';

      mockCloseConversation.mockRejectedValue(
        new Error('Access denied: User does not own conversation')
      );

      await expect(
        conversationService.closeConversation(conversationId, userId)
      ).rejects.toThrow('Access denied: User does not own conversation');
    });
  });

  describe('archiveConversation', () => {
    it('should archive conversation and invalidate cache', async () => {
      const conversationId = 'conv-123';
      const userId = 'user-123';
      const mockConversation = createMockConversation({
        id: conversationId,
        userId,
        status: ConversationStatus.ARCHIVED,
      });

      mockArchiveConversation.mockResolvedValue(mockConversation);
      mockRedisDel.mockResolvedValue(1);

      const result = await conversationService.archiveConversation(conversationId, userId);

      expect(result).toEqual(mockConversation);
      expect(mockArchiveConversation).toHaveBeenCalledWith(conversationId, userId);
      expect(mockRedisDel).toHaveBeenCalledWith(`conversation:${conversationId}:context`);
    });

    it('should handle access control errors', async () => {
      const conversationId = 'conv-123';
      const userId = 'user-other';

      mockArchiveConversation.mockRejectedValue(
        new Error('Access denied: User does not own conversation')
      );

      await expect(
        conversationService.archiveConversation(conversationId, userId)
      ).rejects.toThrow('Access denied: User does not own conversation');
    });
  });

  describe('getRecentContext', () => {
    it('should return recent messages formatted for AI', async () => {
      const conversationId = 'conv-123';
      const mockMessages = [
        createMockMessage({ id: 'msg-1', role: 'USER', content: 'Hello' }),
        createMockMessage({ id: 'msg-2', role: 'ASSISTANT', content: 'Hi there!' }),
        createMockMessage({ id: 'msg-3', role: 'USER', content: 'How are you?' }),
      ];

      mockFindRecentByConversationId.mockResolvedValue(mockMessages);

      const result = await conversationService.getRecentContext(conversationId);

      expect(result).toEqual([
        { role: 'USER', content: 'Hello' },
        { role: 'ASSISTANT', content: 'Hi there!' },
        { role: 'USER', content: 'How are you?' },
      ]);

      expect(mockFindRecentByConversationId).toHaveBeenCalledWith(conversationId, 10);
    });

    it('should return empty array if no messages', async () => {
      const conversationId = 'conv-empty';

      mockFindRecentByConversationId.mockResolvedValue([]);

      const result = await conversationService.getRecentContext(conversationId);

      expect(result).toEqual([]);
    });

    it('should handle repository errors', async () => {
      const conversationId = 'conv-123';

      mockFindRecentByConversationId.mockRejectedValue(new Error('Query failed'));

      await expect(
        conversationService.getRecentContext(conversationId)
      ).rejects.toThrow('Query failed');
    });
  });

  describe('updateContextSummary', () => {
    it('should update context summary and invalidate cache', async () => {
      const conversationId = 'conv-123';
      const summary = 'User is asking about product pricing';

      mockUpdateContextSummary.mockResolvedValue(undefined);
      mockRedisDel.mockResolvedValue(1);

      await conversationService.updateContextSummary(conversationId, summary);

      expect(mockUpdateContextSummary).toHaveBeenCalledWith(conversationId, summary);
      expect(mockRedisDel).toHaveBeenCalledWith(`conversation:${conversationId}:context`);
    });

    it('should handle repository errors', async () => {
      const conversationId = 'conv-123';
      const summary = 'Test summary';

      mockUpdateContextSummary.mockRejectedValue(new Error('Update failed'));

      await expect(
        conversationService.updateContextSummary(conversationId, summary)
      ).rejects.toThrow('Update failed');
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate conversation cache', async () => {
      const conversationId = 'conv-123';

      mockRedisDel.mockResolvedValue(1);

      await conversationService.invalidateCache(conversationId);

      expect(mockRedisDel).toHaveBeenCalledWith(`conversation:${conversationId}:context`);
    });

    it('should handle Redis errors gracefully', async () => {
      const conversationId = 'conv-123';

      mockRedisDel.mockRejectedValue(new Error('Redis connection error'));

      await expect(
        conversationService.invalidateCache(conversationId)
      ).rejects.toThrow('Redis connection error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle conversation with exactly 10 messages', async () => {
      const conversationId = 'conv-123';
      const messages = Array.from({ length: 10 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'USER' : 'ASSISTANT',
        content: `Message ${i}`,
        createdAt: new Date(),
        tokensUsed: 10,
        latencyMs: 100,
      }));

      const mockConversation = {
        ...createMockConversation({ id: conversationId }),
        messages,
      };

      mockRedisGet.mockResolvedValue(null);
      mockFindById.mockResolvedValue(mockConversation);
      mockRedisSetex.mockResolvedValue('OK');

      const result = await conversationService.getConversationWithContext(conversationId);

      expect(result.messages).toHaveLength(10);
    });

    it('should handle conversation with fewer than 10 messages', async () => {
      const conversationId = 'conv-123';
      const messages = Array.from({ length: 3 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'USER' : 'ASSISTANT',
        content: `Message ${i}`,
        createdAt: new Date(),
        tokensUsed: 10,
        latencyMs: 100,
      }));

      const mockConversation = {
        ...createMockConversation({ id: conversationId }),
        messages,
      };

      mockRedisGet.mockResolvedValue(null);
      mockFindById.mockResolvedValue(mockConversation);
      mockRedisSetex.mockResolvedValue('OK');

      const result = await conversationService.getConversationWithContext(conversationId);

      expect(result.messages).toHaveLength(3); // All messages returned
    });
  });
});
