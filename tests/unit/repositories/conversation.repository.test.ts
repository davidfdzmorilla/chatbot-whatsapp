/**
 * Unit Tests: ConversationRepository
 * Tests para el repositorio de conversaciones
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConversationStatus } from '@prisma/client';
import { createMockConversation } from '../../helpers/test-utils';

// Mock Prisma
const mockFindFirst = jest.fn<any>();
const mockFindUnique = jest.fn<any>();
const mockFindMany = jest.fn<any>();
const mockCreate = jest.fn<any>();
const mockUpdate = jest.fn<any>();
const mockCount = jest.fn<any>();

jest.mock('../../../src/config/database', () => ({
  prisma: {
    conversation: {
      findFirst: mockFindFirst,
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      create: mockCreate,
      update: mockUpdate,
      count: mockCount,
    },
  },
}));

describe('ConversationRepository', () => {
  let conversationRepository: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const { ConversationRepository } = await import(
      '../../../src/repositories/conversation.repository'
    );
    conversationRepository = new ConversationRepository();
  });

  describe('findActiveByUserId', () => {
    it('should find active conversation for user', async () => {
      const userId = 'user-123';
      const mockConv = createMockConversation({
        userId,
        status: ConversationStatus.ACTIVE,
      });

      mockFindFirst.mockResolvedValue(mockConv);

      const result = await conversationRepository.findActiveByUserId(userId);

      expect(result).toEqual(mockConv);
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          userId,
          status: ConversationStatus.ACTIVE,
        },
        orderBy: { lastMessageAt: 'desc' },
      });
    });

    it('should return null if no active conversation exists', async () => {
      const userId = 'user-without-conv';
      mockFindFirst.mockResolvedValue(null);

      const result = await conversationRepository.findActiveByUserId(userId);

      expect(result).toBeNull();
    });

    it('should return most recent active conversation', async () => {
      const userId = 'user-123';
      mockFindFirst.mockResolvedValue(
        createMockConversation({
          userId,
          status: ConversationStatus.ACTIVE,
          lastMessageAt: new Date('2025-01-12'),
        })
      );

      const result = await conversationRepository.findActiveByUserId(userId);

      expect(result).toBeDefined();
      expect(mockFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { lastMessageAt: 'desc' },
        })
      );
    });
  });

  describe('findById', () => {
    it('should find conversation by ID without messages', async () => {
      const convId = 'conv-123';
      const mockConv = createMockConversation({ id: convId });

      mockFindUnique.mockResolvedValue(mockConv);

      const result = await conversationRepository.findById(convId);

      expect(result).toEqual(mockConv);
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: convId },
      });
    });

    it('should find conversation with messages when includeMessages=true', async () => {
      const convId = 'conv-123';
      const mockConvWithMessages = {
        ...createMockConversation({ id: convId }),
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

      mockFindUnique.mockResolvedValue(mockConvWithMessages);

      const result = await conversationRepository.findById(convId, true);

      expect(result).toEqual(mockConvWithMessages);
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: convId },
        include: {
          messages: {
            select: {
              id: true,
              role: true,
              content: true,
              createdAt: true,
              tokensUsed: true,
              latencyMs: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    });

    it('should return null if conversation not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await conversationRepository.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('should validate ownership and return null if user does not own conversation', async () => {
      const convId = 'conv-123';
      const ownerId = 'user-owner';
      const requesterId = 'user-other';

      const mockConv = createMockConversation({ id: convId, userId: ownerId });
      mockFindUnique.mockResolvedValue(mockConv);

      const result = await conversationRepository.findById(convId, false, requesterId);

      expect(result).toBeNull(); // Access denied
    });

    it('should return conversation if user owns it', async () => {
      const convId = 'conv-123';
      const userId = 'user-owner';

      const mockConv = createMockConversation({ id: convId, userId });
      mockFindUnique.mockResolvedValue(mockConv);

      const result = await conversationRepository.findById(convId, false, userId);

      expect(result).toEqual(mockConv);
    });
  });

  describe('create', () => {
    it('should create new conversation with ACTIVE status', async () => {
      const userId = 'user-123';
      const mockConv = createMockConversation({
        userId,
        status: ConversationStatus.ACTIVE,
      });

      mockCreate.mockResolvedValue(mockConv);

      const result = await conversationRepository.create(userId);

      expect(result).toEqual(mockConv);
      expect(result.status).toBe(ConversationStatus.ACTIVE);
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          userId,
          status: ConversationStatus.ACTIVE,
        },
      });
    });

    it('should create conversation for valid user', async () => {
      const userId = 'new-user-123';
      const mockConv = createMockConversation({ userId });

      mockCreate.mockResolvedValue(mockConv);

      const result = await conversationRepository.create(userId);

      expect(result.userId).toBe(userId);
    });
  });

  describe('updateLastMessageAt', () => {
    it('should update lastMessageAt to current time', async () => {
      const convId = 'conv-123';
      const updatedConv = createMockConversation({
        id: convId,
        lastMessageAt: new Date(),
      });

      mockUpdate.mockResolvedValue(updatedConv);

      const result = await conversationRepository.updateLastMessageAt(convId);

      expect(result).toEqual(updatedConv);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: convId },
        data: {
          lastMessageAt: expect.any(Date),
        },
      });
    });

    it('should update lastMessageAt to provided date', async () => {
      const convId = 'conv-123';
      const customDate = new Date('2025-01-12');
      const updatedConv = createMockConversation({
        id: convId,
        lastMessageAt: customDate,
      });

      mockUpdate.mockResolvedValue(updatedConv);

      const result = await conversationRepository.updateLastMessageAt(convId, customDate);

      expect(result.lastMessageAt).toEqual(customDate);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: convId },
        data: { lastMessageAt: customDate },
      });
    });
  });

  describe('updateContextSummary', () => {
    it('should update context summary with ownership validation', async () => {
      const convId = 'conv-123';
      const userId = 'user-owner';
      const summary = 'User is asking about product pricing';
      const updatedConv = createMockConversation({
        id: convId,
        contextSummary: summary,
      });

      // Mock ownership check
      mockFindUnique.mockResolvedValueOnce({ userId });

      // Mock update
      mockUpdate.mockResolvedValue(updatedConv);

      const result = await conversationRepository.updateContextSummary(convId, summary, userId);

      expect(result.contextSummary).toBe(summary);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: convId },
        data: { contextSummary: summary },
      });
    });

    it('should throw error if conversation not found', async () => {
      const convId = 'nonexistent';
      const userId = 'user-123';
      const summary = 'Summary';

      mockFindUnique.mockResolvedValueOnce(null);

      await expect(
        conversationRepository.updateContextSummary(convId, summary, userId)
      ).rejects.toThrow('Conversation not found');
    });

    it('should throw error if user does not own conversation', async () => {
      const convId = 'conv-123';
      const userId = 'user-123';
      const summary = 'Summary';

      // Mock ownership check - different user
      mockFindUnique.mockResolvedValueOnce({ userId: 'different-user' });

      await expect(
        conversationRepository.updateContextSummary(convId, summary, userId)
      ).rejects.toThrow('Access denied');
    });
  });

  describe('closeConversation', () => {
    it('should close conversation with ownership validation', async () => {
      const convId = 'conv-123';
      const userId = 'user-owner';

      // Mock ownership check
      mockFindUnique.mockResolvedValueOnce({ userId });

      // Mock update
      const closedConv = createMockConversation({
        id: convId,
        userId,
        status: ConversationStatus.CLOSED,
      });
      mockUpdate.mockResolvedValue(closedConv);

      const result = await conversationRepository.closeConversation(convId, userId);

      expect(result.status).toBe(ConversationStatus.CLOSED);
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: convId },
        select: { userId: true },
      });
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: convId },
        data: { status: ConversationStatus.CLOSED },
      });
    });

    it('should throw error if conversation not found', async () => {
      const convId = 'nonexistent';
      const userId = 'user-123';

      mockFindUnique.mockResolvedValue(null);

      await expect(
        conversationRepository.closeConversation(convId, userId)
      ).rejects.toThrow('Conversation not found');
    });

    it('should throw error if user does not own conversation', async () => {
      const convId = 'conv-123';
      const ownerId = 'user-owner';
      const requesterId = 'user-other';

      mockFindUnique.mockResolvedValue({ userId: ownerId });

      await expect(
        conversationRepository.closeConversation(convId, requesterId)
      ).rejects.toThrow('Access denied: User does not own conversation');

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('archiveConversation', () => {
    it('should archive conversation with ownership validation', async () => {
      const convId = 'conv-123';
      const userId = 'user-owner';

      // Mock ownership check
      mockFindUnique.mockResolvedValueOnce({ userId });

      // Mock update
      const archivedConv = createMockConversation({
        id: convId,
        userId,
        status: ConversationStatus.ARCHIVED,
      });
      mockUpdate.mockResolvedValue(archivedConv);

      const result = await conversationRepository.archiveConversation(convId, userId);

      expect(result.status).toBe(ConversationStatus.ARCHIVED);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: convId },
        data: { status: ConversationStatus.ARCHIVED },
      });
    });

    it('should throw error if conversation not found', async () => {
      const convId = 'nonexistent';
      const userId = 'user-123';

      mockFindUnique.mockResolvedValue(null);

      await expect(
        conversationRepository.archiveConversation(convId, userId)
      ).rejects.toThrow('Conversation not found');
    });

    it('should throw error if user does not own conversation', async () => {
      const convId = 'conv-123';
      const ownerId = 'user-owner';
      const requesterId = 'user-other';

      mockFindUnique.mockResolvedValue({ userId: ownerId });

      await expect(
        conversationRepository.archiveConversation(convId, requesterId)
      ).rejects.toThrow('Access denied: User does not own conversation');
    });
  });

  describe('findByUserId', () => {
    it('should find all conversations for user', async () => {
      const userId = 'user-123';
      const mockConvs = [
        createMockConversation({ id: 'conv-1', userId }),
        createMockConversation({ id: 'conv-2', userId }),
      ];

      mockFindMany.mockResolvedValue(mockConvs);

      const result = await conversationRepository.findByUserId(userId);

      expect(result).toHaveLength(2);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { lastMessageAt: 'desc' },
      });
    });

    it('should filter conversations by status', async () => {
      const userId = 'user-123';
      const status = ConversationStatus.ACTIVE;

      const mockConvs = [
        createMockConversation({ userId, status: ConversationStatus.ACTIVE }),
      ];

      mockFindMany.mockResolvedValue(mockConvs);

      const result = await conversationRepository.findByUserId(userId, status);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(ConversationStatus.ACTIVE);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { userId, status },
        orderBy: { lastMessageAt: 'desc' },
      });
    });

    it('should return empty array if no conversations', async () => {
      const userId = 'user-no-convs';
      mockFindMany.mockResolvedValue([]);

      const result = await conversationRepository.findByUserId(userId);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('countByStatus', () => {
    it('should count active conversations', async () => {
      mockCount.mockResolvedValue(15);

      const result = await conversationRepository.countByStatus(ConversationStatus.ACTIVE);

      expect(result).toBe(15);
      expect(mockCount).toHaveBeenCalledWith({
        where: { status: ConversationStatus.ACTIVE },
      });
    });

    it('should count closed conversations', async () => {
      mockCount.mockResolvedValue(8);

      const result = await conversationRepository.countByStatus(ConversationStatus.CLOSED);

      expect(result).toBe(8);
    });

    it('should return 0 if no conversations with status', async () => {
      mockCount.mockResolvedValue(0);

      const result = await conversationRepository.countByStatus(ConversationStatus.ARCHIVED);

      expect(result).toBe(0);
    });
  });

  describe('count', () => {
    it('should return total conversation count', async () => {
      mockCount.mockResolvedValue(100);

      const result = await conversationRepository.count();

      expect(result).toBe(100);
      expect(mockCount).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when findActiveByUserId fails', async () => {
      const error = new Error('Database error');
      mockFindFirst.mockRejectedValue(error);

      await expect(
        conversationRepository.findActiveByUserId('user-123')
      ).rejects.toThrow('Database error');
    });

    it('should throw error when create fails', async () => {
      const error = new Error('Foreign key constraint');
      mockCreate.mockRejectedValue(error);

      await expect(conversationRepository.create('invalid-user')).rejects.toThrow(
        'Foreign key constraint'
      );
    });

    it('should throw error when update fails', async () => {
      const error = new Error('Conversation not found');
      mockUpdate.mockRejectedValue(error);

      await expect(
        conversationRepository.updateLastMessageAt('nonexistent')
      ).rejects.toThrow('Conversation not found');
    });
  });
});
