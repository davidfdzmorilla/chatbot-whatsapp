import type { Request, Response, NextFunction } from 'express';
import MessagingResponse from 'twilio/lib/twiml/MessagingResponse';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

/**
 * Rate limiting configuration
 * Can be overridden by environment variables
 */
const MAX_REQUESTS_PER_WINDOW = parseInt(
  process.env.RATE_LIMIT_MAX_REQUESTS || '10',
  10
);
const WINDOW_SIZE_SECONDS = parseInt(
  process.env.RATE_LIMIT_WINDOW_SECONDS || '60',
  10
);

/**
 * Rate Limit Middleware
 * Implements sliding window rate limiting using Redis
 *
 * Strategy:
 * - Limit: 10 messages per minute per phone number (configurable)
 * - Uses Redis INCR with TTL for atomic operations
 * - Key format: ratelimit:{phoneNumber}
 * - Fail-open: If Redis fails, allows request but logs error
 *
 * Headers:
 * - X-RateLimit-Limit: Maximum requests allowed in window
 * - X-RateLimit-Remaining: Requests remaining in current window
 * - X-RateLimit-Reset: Unix timestamp when the limit resets
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract phone number from Twilio webhook
    const from = req.body?.From;

    if (!from) {
      logger.warn('⚠️  Rate limit: No "From" field in request body');
      // Allow request to proceed if From is missing (validation will catch it later)
      return next();
    }

    // Clean phone number (remove "whatsapp:" prefix)
    const phoneNumber = from.replace(/^whatsapp:/i, '');

    // Generate Redis key
    const redisKey = `ratelimit:${phoneNumber}`;

    try {
      // Get current count (atomic operation)
      const currentCount = await redis.incr(redisKey);

      // If this is the first request, set TTL
      if (currentCount === 1) {
        await redis.expire(redisKey, WINDOW_SIZE_SECONDS);
      }

      // Get TTL for reset time calculation
      const ttl = await redis.ttl(redisKey);
      const resetTime = Math.floor(Date.now() / 1000) + ttl;

      // Calculate remaining requests
      const remaining = Math.max(0, MAX_REQUESTS_PER_WINDOW - currentCount);

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', MAX_REQUESTS_PER_WINDOW.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', resetTime.toString());

      logger.debug('🔢 Rate limit check', {
        phoneNumber,
        currentCount,
        limit: MAX_REQUESTS_PER_WINDOW,
        remaining,
        resetTime,
      });

      // Check if limit exceeded
      if (currentCount > MAX_REQUESTS_PER_WINDOW) {
        logger.warn('🚫 Rate limit exceeded', {
          phoneNumber,
          currentCount,
          limit: MAX_REQUESTS_PER_WINDOW,
          windowSeconds: WINDOW_SIZE_SECONDS,
        });

        // Respond with TwiML error message
        return respondWithRateLimitError(res);
      }

      // Limit not exceeded, allow request
      logger.info('✅ Rate limit check passed', {
        phoneNumber,
        currentCount,
        remaining,
      });

      next();
    } catch (redisError) {
      // Redis operation failed - fail-open (allow request)
      logger.error('❌ Redis error in rate limit check - failing open', {
        error: redisError instanceof Error ? redisError.message : redisError,
        phoneNumber,
      });

      // Allow request to proceed despite Redis failure
      next();
    }
  } catch (error) {
    // Unexpected error - fail-open (allow request)
    logger.error('❌ Unexpected error in rate limit middleware - failing open', {
      error: error instanceof Error ? error.message : error,
    });

    // Allow request to proceed despite error
    next();
  }
}

/**
 * Respond with TwiML error when rate limit is exceeded
 */
function respondWithRateLimitError(res: Response): void {
  const twiml = new MessagingResponse();
  twiml.message(
    'Lo siento, has enviado demasiados mensajes en poco tiempo. Por favor espera un minuto antes de intentar de nuevo. ⏱️'
  );

  res.status(429); // Too Many Requests
  res.type('text/xml');
  res.send(twiml.toString());

  logger.debug('📤 Rate limit error response sent');
}

/**
 * Get current rate limit status for a phone number
 * Useful for monitoring and debugging
 */
export async function getRateLimitStatus(phoneNumber: string): Promise<{
  count: number;
  limit: number;
  remaining: number;
  resetTime: number;
}> {
  const redisKey = `ratelimit:${phoneNumber}`;

  try {
    const count = parseInt((await redis.get(redisKey)) || '0', 10);
    const ttl = await redis.ttl(redisKey);
    const resetTime = ttl > 0 ? Math.floor(Date.now() / 1000) + ttl : 0;
    const remaining = Math.max(0, MAX_REQUESTS_PER_WINDOW - count);

    return {
      count,
      limit: MAX_REQUESTS_PER_WINDOW,
      remaining,
      resetTime,
    };
  } catch (error) {
    logger.error('Error getting rate limit status', {
      error: error instanceof Error ? error.message : error,
      phoneNumber,
    });

    return {
      count: 0,
      limit: MAX_REQUESTS_PER_WINDOW,
      remaining: MAX_REQUESTS_PER_WINDOW,
      resetTime: 0,
    };
  }
}

/**
 * Reset rate limit for a phone number
 * Useful for testing or manual intervention
 */
export async function resetRateLimit(phoneNumber: string): Promise<void> {
  const redisKey = `ratelimit:${phoneNumber}`;

  try {
    await redis.del(redisKey);
    logger.info('Rate limit reset', { phoneNumber });
  } catch (error) {
    logger.error('Error resetting rate limit', {
      error: error instanceof Error ? error.message : error,
      phoneNumber,
    });
    throw error;
  }
}
