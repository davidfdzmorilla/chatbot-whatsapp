import { Conversation, User } from '@prisma/client';
import { redis, CacheKeys } from '../config/redis.js';
import { userRepository } from '../repositories/user.repository.js';
import {
  conversationRepository,
  ConversationWithMessages,
} from '../repositories/conversation.repository.js';
import { messageRepository } from '../repositories/message.repository.js';
import { logger } from '../utils/logger.js';
import { hashPhoneNumber } from '../utils/privacy.js';
import { CachedConversationSchema } from '../types/cache.js';

/**
 * Configuration constants for conversation management
 */
const MAX_CONTEXT_MESSAGES = 10;
const CONTEXT_CACHE_TTL = 3600; // 1 hour in seconds

/**
 * Conversation data with user information
 */
export interface ConversationData {
  conversation: Conversation;
  user: User;
}

/**
 * Conversation Service
 * Orchestrates conversation and user management with caching
 */
export class ConversationService {
  /**
   * Get or create a conversation for a phone number
   * Creates user if doesn't exist, then creates/retrieves active conversation
   */
  async getOrCreateConversation(phoneNumber: string): Promise<ConversationData> {
    try {
      logger.info('Getting or creating conversation', {
        phoneNumberHash: hashPhoneNumber(phoneNumber)
      });

      // 1. Upsert user (create if doesn't exist, return if exists)
      const user = await userRepository.upsert(phoneNumber);

      logger.debug('User retrieved/created', {
        userId: user.id,
        phoneNumber,
      });

      // 2. Look for active conversation
      let conversation = await conversationRepository.findActiveByUserId(user.id);

      // 3. Create conversation if doesn't exist
      if (!conversation) {
        logger.info('Creating new conversation for user', {
          userId: user.id,
          phoneNumberHash: hashPhoneNumber(phoneNumber),
        });

        conversation = await conversationRepository.create(user.id);
      }

      logger.info('Conversation ready', {
        conversationId: conversation.id,
        userId: user.id,
      });

      return {
        conversation,
        user,
      };
    } catch (error) {
      logger.error('Error getting or creating conversation', {
        phoneNumberHash: hashPhoneNumber(phoneNumber),
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get conversation with cached context messages
   * Implements cache-first strategy with Zod validation for cache integrity
   */
  async getConversationWithContext(
    conversationId: string
  ): Promise<ConversationWithMessages> {
    try {
      logger.debug('Getting conversation with context', { conversationId });

      // 1. Try to get from cache
      const cacheKey = CacheKeys.conversationContext(conversationId);
      const cached = await redis.get(cacheKey);

      if (cached) {
        try {
          // Validate cached data with Zod schema to prevent cache poisoning
          const parsed = JSON.parse(cached);
          const validated = CachedConversationSchema.parse(parsed);

          logger.debug('Conversation context cache hit (validated)', { conversationId });
          return validated as ConversationWithMessages;
        } catch (validationError) {
          // Cache data is corrupted or doesn't match schema - invalidate and refetch
          logger.warn('Cache validation failed, invalidating corrupted cache', {
            conversationId,
            error: validationError instanceof Error ? validationError.message : validationError,
          });
          await redis.del(cacheKey);
          // Continue to fetch from database
        }
      }

      // 2. Cache miss or validation failed - fetch from database
      logger.debug('Conversation context cache miss, fetching from DB', {
        conversationId,
      });

      const conversation = await conversationRepository.findById(conversationId, true);

      if (!conversation) {
        throw new Error(`Conversation not found: ${conversationId}`);
      }

      // 3. Limit messages to MAX_CONTEXT_MESSAGES
      const conversationWithLimitedMessages = {
        ...conversation,
        messages: (conversation as ConversationWithMessages).messages.slice(
          -MAX_CONTEXT_MESSAGES
        ),
      };

      // 4. Update cache
      await redis.setex(
        cacheKey,
        CONTEXT_CACHE_TTL,
        JSON.stringify(conversationWithLimitedMessages)
      );

      logger.debug('Conversation context cached', {
        conversationId,
        messageCount: conversationWithLimitedMessages.messages.length,
      });

      return conversationWithLimitedMessages as ConversationWithMessages;
    } catch (error) {
      logger.error('Error getting conversation with context', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Update conversation timestamp and invalidate cache
   */
  async updateConversationTimestamp(conversationId: string): Promise<void> {
    try {
      logger.debug('Updating conversation timestamp', { conversationId });

      // 1. Update in database
      await conversationRepository.updateLastMessageAt(conversationId);

      // 2. Invalidate cache to force refresh on next read
      const cacheKey = CacheKeys.conversationContext(conversationId);
      await redis.del(cacheKey);

      logger.debug('Conversation timestamp updated and cache invalidated', {
        conversationId,
      });
    } catch (error) {
      logger.error('Error updating conversation timestamp', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Close a conversation
   */
  async closeConversation(conversationId: string, userId: string): Promise<Conversation> {
    try {
      logger.info('Closing conversation', { conversationId, userId });

      // 1. Close conversation in database (with access control)
      const conversation = await conversationRepository.closeConversation(conversationId, userId);

      // 2. Invalidate cache
      const cacheKey = CacheKeys.conversationContext(conversationId);
      await redis.del(cacheKey);

      logger.info('Conversation closed and cache invalidated', {
        conversationId,
      });

      return conversation;
    } catch (error) {
      logger.error('Error closing conversation', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Archive a conversation
   */
  async archiveConversation(conversationId: string, userId: string): Promise<Conversation> {
    try {
      logger.info('Archiving conversation', { conversationId, userId });

      // 1. Archive conversation in database (with access control)
      const conversation = await conversationRepository.archiveConversation(conversationId, userId);

      // 2. Invalidate cache
      const cacheKey = CacheKeys.conversationContext(conversationId);
      await redis.del(cacheKey);

      logger.info('Conversation archived and cache invalidated', {
        conversationId,
      });

      return conversation;
    } catch (error) {
      logger.error('Error archiving conversation', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get recent context messages for a conversation
   * Returns the last N messages for AI context
   */
  async getRecentContext(conversationId: string): Promise<
    Array<{
      role: string;
      content: string;
    }>
  > {
    try {
      logger.debug('Getting recent context', { conversationId });

      // Get recent messages from repository
      const messages = await messageRepository.findRecentByConversationId(
        conversationId,
        MAX_CONTEXT_MESSAGES
      );

      // Format for AI consumption
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
   * Update conversation context summary
   * Used for long conversations to maintain context
   */
  async updateContextSummary(conversationId: string, summary: string): Promise<void> {
    try {
      logger.info('Updating conversation context summary', {
        conversationId,
        summaryLength: summary.length,
      });

      await conversationRepository.updateContextSummary(conversationId, summary);

      // Invalidate cache to force refresh
      const cacheKey = CacheKeys.conversationContext(conversationId);
      await redis.del(cacheKey);

      logger.info('Context summary updated', { conversationId });
    } catch (error) {
      logger.error('Error updating context summary', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Invalidate conversation cache
   * Useful after bulk operations or manual cache management
   */
  async invalidateCache(conversationId: string): Promise<void> {
    try {
      const cacheKey = CacheKeys.conversationContext(conversationId);
      await redis.del(cacheKey);

      logger.debug('Conversation cache invalidated', { conversationId });
    } catch (error) {
      logger.error('Error invalidating cache', {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const conversationService = new ConversationService();
