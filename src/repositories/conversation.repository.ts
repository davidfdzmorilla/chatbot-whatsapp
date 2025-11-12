import { Conversation, ConversationStatus } from '@prisma/client';
import { prisma } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * Conversation with messages included
 */
export type ConversationWithMessages = Conversation & {
  messages: Array<{
    id: string;
    role: string;
    content: string;
    createdAt: Date;
    tokensUsed: number | null;
    latencyMs: number | null;
  }>;
};

/**
 * Conversation Repository
 * Handles all database operations related to conversations
 */
export class ConversationRepository {
  /**
   * Find active conversation by user ID
   * Returns the most recent active conversation
   */
  async findActiveByUserId(userId: string): Promise<Conversation | null> {
    try {
      logger.debug('Finding active conversation for user', { userId });

      const conversation = await prisma.conversation.findFirst({
        where: {
          userId,
          status: ConversationStatus.ACTIVE,
        },
        orderBy: { lastMessageAt: 'desc' },
      });

      if (conversation) {
        logger.debug('Active conversation found', {
          conversationId: conversation.id,
          userId,
        });
      } else {
        logger.debug('No active conversation found', { userId });
      }

      return conversation;
    } catch (error) {
      logger.error('Error finding active conversation', {
        userId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Find conversation by ID
   * Optionally includes messages
   */
  async findById(
    id: string,
    includeMessages = false
  ): Promise<Conversation | ConversationWithMessages | null> {
    try {
      logger.debug('Finding conversation by ID', {
        conversationId: id,
        includeMessages,
      });

      const conversation = await prisma.conversation.findUnique({
        where: { id },
        ...(includeMessages && {
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
        }),
      });

      if (conversation) {
        logger.debug('Conversation found', {
          conversationId: id,
          messageCount: includeMessages ? (conversation as any).messages?.length : undefined,
        });
      } else {
        logger.debug('Conversation not found', { conversationId: id });
      }

      return conversation;
    } catch (error) {
      logger.error('Error finding conversation by ID', {
        conversationId: id,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Create a new conversation
   */
  async create(userId: string): Promise<Conversation> {
    try {
      logger.info('Creating new conversation', { userId });

      const conversation = await prisma.conversation.create({
        data: {
          userId,
          status: ConversationStatus.ACTIVE,
        },
      });

      logger.info('Conversation created successfully', {
        conversationId: conversation.id,
        userId,
      });

      return conversation;
    } catch (error) {
      logger.error('Error creating conversation', {
        userId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Update last message timestamp
   */
  async updateLastMessageAt(id: string, date?: Date): Promise<Conversation> {
    try {
      logger.debug('Updating conversation last message time', {
        conversationId: id,
      });

      const conversation = await prisma.conversation.update({
        where: { id },
        data: {
          lastMessageAt: date || new Date(),
        },
      });

      logger.debug('Conversation last message time updated', {
        conversationId: id,
      });

      return conversation;
    } catch (error) {
      logger.error('Error updating conversation last message time', {
        conversationId: id,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Update conversation context summary
   */
  async updateContextSummary(id: string, summary: string): Promise<Conversation> {
    try {
      logger.debug('Updating conversation context summary', {
        conversationId: id,
        summaryLength: summary.length,
      });

      const conversation = await prisma.conversation.update({
        where: { id },
        data: {
          contextSummary: summary,
        },
      });

      logger.info('Conversation context summary updated', {
        conversationId: id,
      });

      return conversation;
    } catch (error) {
      logger.error('Error updating conversation context summary', {
        conversationId: id,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Close a conversation
   * Sets status to CLOSED
   */
  async closeConversation(id: string): Promise<Conversation> {
    try {
      logger.info('Closing conversation', { conversationId: id });

      const conversation = await prisma.conversation.update({
        where: { id },
        data: {
          status: ConversationStatus.CLOSED,
        },
      });

      logger.info('Conversation closed successfully', {
        conversationId: id,
      });

      return conversation;
    } catch (error) {
      logger.error('Error closing conversation', {
        conversationId: id,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Archive a conversation
   * Sets status to ARCHIVED
   */
  async archiveConversation(id: string): Promise<Conversation> {
    try {
      logger.info('Archiving conversation', { conversationId: id });

      const conversation = await prisma.conversation.update({
        where: { id },
        data: {
          status: ConversationStatus.ARCHIVED,
        },
      });

      logger.info('Conversation archived successfully', {
        conversationId: id,
      });

      return conversation;
    } catch (error) {
      logger.error('Error archiving conversation', {
        conversationId: id,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Find all conversations for a user
   */
  async findByUserId(
    userId: string,
    status?: ConversationStatus
  ): Promise<Conversation[]> {
    try {
      logger.debug('Finding conversations for user', { userId, status });

      const conversations = await prisma.conversation.findMany({
        where: {
          userId,
          ...(status && { status }),
        },
        orderBy: { lastMessageAt: 'desc' },
      });

      logger.debug('Conversations found', {
        userId,
        count: conversations.length,
      });

      return conversations;
    } catch (error) {
      logger.error('Error finding conversations for user', {
        userId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Count conversations by status
   */
  async countByStatus(status: ConversationStatus): Promise<number> {
    try {
      return await prisma.conversation.count({
        where: { status },
      });
    } catch (error) {
      logger.error('Error counting conversations by status', {
        status,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Count total conversations
   */
  async count(): Promise<number> {
    try {
      return await prisma.conversation.count();
    } catch (error) {
      logger.error('Error counting conversations', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const conversationRepository = new ConversationRepository();
