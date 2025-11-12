import Redis from 'ioredis';
import { logger } from '../utils/logger.js';
import { env } from './env.js';

/**
 * Redis client configuration
 * Singleton pattern for cache connection
 */

// Redis client instance
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number): number | null {
    // Exponential backoff: 50ms, 100ms, 200ms, then give up
    if (times > 3) {
      logger.error('Redis connection failed after 3 retries');
      return null;
    }
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis connection attempt ${times}, retrying in ${delay}ms`);
    return delay;
  },
  reconnectOnError(err): boolean | 1 | 2 {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Reconnect when Redis is in readonly mode
      return 2; // 2 = reconnect and retry the failed command
    }
    return false;
  },
});

/**
 * Redis connection event handlers
 */
redis.on('connect', () => {
  logger.info('✅ Redis connected successfully');
});

redis.on('ready', () => {
  logger.info('Redis ready to accept commands');
});

redis.on('error', (error: Error) => {
  logger.error('Redis error', {
    error: error.message,
    stack: error.stack,
  });
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', (delay: number) => {
  logger.info(`Redis reconnecting in ${delay}ms`);
});

/**
 * Connect to Redis
 * Connection is automatic, but this provides explicit initialization
 */
export async function connectRedis(): Promise<void> {
  try {
    await redis.ping();
    logger.info('Redis ping successful');
  } catch (error) {
    logger.error('❌ Failed to connect to Redis', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Disconnect from Redis
 * Should be called on graceful shutdown
 */
export async function disconnectRedis(): Promise<void> {
  try {
    await redis.quit();
    logger.info('Redis disconnected');
  } catch (error) {
    logger.error('Error disconnecting from Redis', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Health check for Redis connection
 */
export async function checkRedisHealth(): Promise<{ status: string; latencyMs?: number }> {
  try {
    const startTime = Date.now();
    await redis.ping();
    const latencyMs = Date.now() - startTime;

    return {
      status: 'ok',
      latencyMs,
    };
  } catch (error) {
    logger.error('Redis health check failed', {
      error: error instanceof Error ? error.message : error,
    });

    return {
      status: 'error',
    };
  }
}

/**
 * Cache key naming conventions
 * Provides consistent key naming across the application
 */
export const CacheKeys = {
  /**
   * Conversation context cache key
   * Format: conversation:{conversationId}
   */
  conversationContext: (conversationId: string): string => `conversation:${conversationId}`,

  /**
   * Rate limit key for a phone number
   * Format: ratelimit:{phoneNumber}
   */
  rateLimit: (phoneNumber: string): string => `ratelimit:${phoneNumber}`,

  /**
   * User session key
   * Format: session:{userId}
   */
  session: (userId: string): string => `session:${userId}`,

  /**
   * Message cache key
   * Format: message:{messageId}
   */
  message: (messageId: string): string => `message:${messageId}`,
} as const;

/**
 * Cache TTL (Time To Live) constants in seconds
 */
export const CacheTTL = {
  CONVERSATION_CONTEXT: 3600, // 1 hour
  RATE_LIMIT_WINDOW: 60, // 1 minute
  SESSION: 86400, // 24 hours
  MESSAGE: 1800, // 30 minutes
} as const;

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing Redis connection');
  await disconnectRedis();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing Redis connection');
  await disconnectRedis();
});
