import { Message, MessageRole } from '@prisma/client';
import { messageRepository, CreateMessageData } from '../repositories/message.repository.js';
import { conversationService } from '../services/conversation.service.js';
import { redis, CacheKeys } from '../config/redis.js';
import { logger } from '../utils/logger.js';

/**
 * Configuration constants for message management
 */
const MAX_CONTEXT_MESSAGES = 10;

/**
 * Message Service
 * Handles message creation, retrieval, and context management
 */
export class MessageService {
  /**
   * Save a user message to the database and update cache
   */
  async saveUserMessage(
    conversationId: string,
    content: string,
    twilioSid?: string
  ): Promise<Message> {
    try {
      logger.info('Saving user message', {
        conversationId,
        contentLength: content.length,
        hasTwilioSid: !!twilioSid,
      });

      // Check for duplicate message if twilioSid provided
      if (twilioSid) {
        const existing = await messageRepository.findByTwilioSid(twilioSid);
        if (existing) {
          logger.warn('Duplicate message detected, returning existing', {
            twilioSid,
            messageId: existing.id,
          });
          return existing;
        }
      }

      // Create message data
      const messageData: CreateMessageData = {
        conversationId,
        role: MessageRole.USER,
        content,
        twilioSid,
      };

      // Save to database
      const message = await messageRepository.create(messageData);

      // Update conversation timestamp
      await conversationService.updateConversationTimestamp(conversationId);

      logger.info('User message saved successfully', {
        messageId: message.id,
        conversationId,
      });

      return message;
    } catch (error) {
      logger.error('Error saving user message', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Save an assistant (AI) message to the database and update cache
   */
  async saveAssistantMessage(
    conversationId: string,
    content: string,
    tokensUsed?: number,
    latencyMs?: number
  ): Promise<Message> {
    try {
      logger.info('Saving assistant message', {
        conversationId,
        contentLength: content.length,
        tokensUsed,
        latencyMs,
      });

      // Create message data
      const messageData: CreateMessageData = {
        conversationId,
        role: MessageRole.ASSISTANT,
        content,
        tokensUsed,
        latencyMs,
      };

      // Save to database
      const message = await messageRepository.create(messageData);

      // Update conversation timestamp
      await conversationService.updateConversationTimestamp(conversationId);

      logger.info('Assistant message saved successfully', {
        messageId: message.id,
        conversationId,
      });

      return message;
    } catch (error) {
      logger.error('Error saving assistant message', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Save a system message to the database
   */
  async saveSystemMessage(conversationId: string, content: string): Promise<Message> {
    try {
      logger.info('Saving system message', {
        conversationId,
        contentLength: content.length,
      });

      // Create message data
      const messageData: CreateMessageData = {
        conversationId,
        role: MessageRole.SYSTEM,
        content,
      };

      // Save to database
      const message = await messageRepository.create(messageData);

      // Update conversation timestamp
      await conversationService.updateConversationTimestamp(conversationId);

      logger.info('System message saved successfully', {
        messageId: message.id,
        conversationId,
      });

      return message;
    } catch (error) {
      logger.error('Error saving system message', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get all messages for a conversation
   */
  async getConversationMessages(
    conversationId: string,
    limit?: number
  ): Promise<Message[]> {
    try {
      logger.debug('Getting conversation messages', {
        conversationId,
        limit,
      });

      const messages = await messageRepository.findByConversationId(conversationId, limit);

      logger.debug('Messages retrieved', {
        conversationId,
        count: messages.length,
      });

      return messages;
    } catch (error) {
      logger.error('Error getting conversation messages', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get recent context messages for AI processing
   * Returns last N messages in chronological order
   */
  async getRecentContext(conversationId: string): Promise<
    Array<{
      role: string;
      content: string;
    }>
  > {
    try {
      logger.debug('Getting recent context for AI', { conversationId });

      // Check cache first
      const cacheKey = CacheKeys.conversationContext(conversationId);
      const cached = await redis.get(cacheKey);

      if (cached) {
        logger.debug('Context cache hit', { conversationId });
        const parsedCache = JSON.parse(cached);
        // Extract messages if it's a conversation object with messages
        const messages = parsedCache.messages || parsedCache;
        return messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
        }));
      }

      // Cache miss - get from database
      logger.debug('Context cache miss, fetching from DB', { conversationId });

      const messages = await messageRepository.findRecentByConversationId(
        conversationId,
        MAX_CONTEXT_MESSAGES
      );

      // Format for AI
      const context = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      logger.debug('Recent context retrieved', {
        conversationId,
        messageCount: context.length,
      });

      return context;
    } catch (error) {
      logger.error('Error getting recent context', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Count messages in a conversation
   */
  async countMessages(conversationId: string): Promise<number> {
    try {
      logger.debug('Counting messages', { conversationId });

      const count = await messageRepository.countByConversationId(conversationId);

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
   * Get token usage statistics for a conversation
   */
  async getTokenStats(conversationId: string): Promise<{
    totalTokens: number;
    messageCount: number;
    avgTokensPerMessage: number;
  }> {
    try {
      logger.debug('Getting token stats', { conversationId });

      const stats = await messageRepository.getTokenStats(conversationId);

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
   * Check if a message already exists by Twilio SID
   * Useful for preventing duplicate processing
   */
  async messageExists(twilioSid: string): Promise<boolean> {
    try {
      const message = await messageRepository.findByTwilioSid(twilioSid);
      return !!message;
    } catch (error) {
      logger.error('Error checking message existence', {
        twilioSid,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Delete old messages from a conversation (keep most recent N)
   * Useful for cleanup and maintaining context size
   */
  async cleanupOldMessages(
    conversationId: string,
    keepMostRecent: number = MAX_CONTEXT_MESSAGES
  ): Promise<number> {
    try {
      logger.info('Cleaning up old messages', {
        conversationId,
        keepMostRecent,
      });

      const deletedCount = await messageRepository.deleteOldMessages(
        conversationId,
        keepMostRecent
      );

      // Invalidate cache
      const cacheKey = CacheKeys.conversationContext(conversationId);
      await redis.del(cacheKey);

      logger.info('Old messages cleaned up', {
        conversationId,
        deletedCount,
      });

      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up old messages', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const messageService = new MessageService();
