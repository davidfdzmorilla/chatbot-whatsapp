import { Message, MessageRole, Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * Data required to create a message
 */
export interface CreateMessageData {
  conversationId: string;
  role: MessageRole;
  content: string;
  twilioSid?: string;
  metadata?: Prisma.InputJsonValue;
  tokensUsed?: number;
  latencyMs?: number;
}

/**
 * Message Repository
 * Handles all database operations related to messages
 */
export class MessageRepository {
  /**
   * Create a new message
   */
  async create(data: CreateMessageData): Promise<Message> {
    try {
      logger.debug('Creating new message', {
        conversationId: data.conversationId,
        role: data.role,
        contentLength: data.content.length,
        hasTwilioSid: !!data.twilioSid,
      });

      const message = await prisma.message.create({
        data: {
          conversationId: data.conversationId,
          role: data.role,
          content: data.content,
          twilioSid: data.twilioSid,
          metadata: data.metadata,
          tokensUsed: data.tokensUsed,
          latencyMs: data.latencyMs,
        },
      });

      logger.info('Message created successfully', {
        messageId: message.id,
        conversationId: message.conversationId,
        role: message.role,
      });

      return message;
    } catch (error) {
      logger.error('Error creating message', {
        conversationId: data.conversationId,
        role: data.role,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Find messages by conversation ID
   * Returns all messages ordered by creation date (ascending)
   */
  async findByConversationId(
    conversationId: string,
    limit?: number
  ): Promise<Message[]> {
    try {
      logger.debug('Finding messages by conversation ID', {
        conversationId,
        limit,
      });

      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        ...(limit && { take: limit }),
      });

      logger.debug('Messages found', {
        conversationId,
        count: messages.length,
      });

      return messages;
    } catch (error) {
      logger.error('Error finding messages by conversation ID', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Find recent messages by conversation ID
   * Returns the N most recent messages ordered by creation date (descending)
   */
  async findRecentByConversationId(
    conversationId: string,
    limit: number
  ): Promise<Message[]> {
    try {
      logger.debug('Finding recent messages by conversation ID', {
        conversationId,
        limit,
      });

      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      // Reverse to get chronological order (oldest to newest)
      const chronologicalMessages = messages.reverse();

      logger.debug('Recent messages found', {
        conversationId,
        count: chronologicalMessages.length,
      });

      return chronologicalMessages;
    } catch (error) {
      logger.error('Error finding recent messages', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Count messages in a conversation
   */
  async countByConversationId(conversationId: string): Promise<number> {
    try {
      logger.debug('Counting messages in conversation', { conversationId });

      const count = await prisma.message.count({
        where: { conversationId },
      });

      logger.debug('Message count retrieved', {
        conversationId,
        count,
      });

      return count;
    } catch (error) {
      logger.error('Error counting messages', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Find message by Twilio SID
   * Useful for checking if a message from Twilio has already been processed
   */
  async findByTwilioSid(twilioSid: string): Promise<Message | null> {
    try {
      logger.debug('Finding message by Twilio SID', { twilioSid });

      const message = await prisma.message.findUnique({
        where: { twilioSid },
      });

      if (message) {
        logger.debug('Message found by Twilio SID', {
          messageId: message.id,
          twilioSid,
        });
      } else {
        logger.debug('Message not found by Twilio SID', { twilioSid });
      }

      return message;
    } catch (error) {
      logger.error('Error finding message by Twilio SID', {
        twilioSid,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Find message by ID
   */
  async findById(id: string): Promise<Message | null> {
    try {
      logger.debug('Finding message by ID', { messageId: id });

      const message = await prisma.message.findUnique({
        where: { id },
      });

      if (message) {
        logger.debug('Message found', { messageId: id });
      } else {
        logger.debug('Message not found', { messageId: id });
      }

      return message;
    } catch (error) {
      logger.error('Error finding message by ID', {
        messageId: id,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Update message metadata
   */
  async updateMetadata(id: string, metadata: Prisma.InputJsonValue): Promise<Message> {
    try {
      logger.debug('Updating message metadata', { messageId: id });

      const message = await prisma.message.update({
        where: { id },
        data: { metadata },
      });

      logger.debug('Message metadata updated', { messageId: id });

      return message;
    } catch (error) {
      logger.error('Error updating message metadata', {
        messageId: id,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get messages with token usage stats for a conversation
   */
  async getTokenStats(conversationId: string): Promise<{
    totalTokens: number;
    messageCount: number;
    avgTokensPerMessage: number;
  }> {
    try {
      logger.debug('Getting token stats for conversation', { conversationId });

      const result = await prisma.message.aggregate({
        where: {
          conversationId,
          tokensUsed: { not: null },
        },
        _sum: {
          tokensUsed: true,
        },
        _count: true,
        _avg: {
          tokensUsed: true,
        },
      });

      const stats = {
        totalTokens: result._sum.tokensUsed || 0,
        messageCount: result._count,
        avgTokensPerMessage: Math.round(result._avg.tokensUsed || 0),
      };

      logger.debug('Token stats retrieved', {
        conversationId,
        ...stats,
      });

      return stats;
    } catch (error) {
      logger.error('Error getting token stats', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get total message count
   */
  async count(): Promise<number> {
    try {
      return await prisma.message.count();
    } catch (error) {
      logger.error('Error counting messages', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Delete old messages from a conversation (keep most recent N)
   * Useful for cleanup and maintaining conversation context size
   */
  async deleteOldMessages(conversationId: string, keepMostRecent: number): Promise<number> {
    try {
      logger.info('Deleting old messages from conversation', {
        conversationId,
        keepMostRecent,
      });

      // Get IDs of messages to keep
      const messagesToKeep = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: keepMostRecent,
        select: { id: true },
      });

      const keepIds = messagesToKeep.map((m) => m.id);

      // Delete messages not in the keep list
      const result = await prisma.message.deleteMany({
        where: {
          conversationId,
          id: { notIn: keepIds },
        },
      });

      logger.info('Old messages deleted', {
        conversationId,
        deletedCount: result.count,
      });

      return result.count;
    } catch (error) {
      logger.error('Error deleting old messages', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const messageRepository = new MessageRepository();
