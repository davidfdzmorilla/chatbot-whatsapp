import type { Request, Response, NextFunction } from 'express';
import MessagingResponse from 'twilio/lib/twiml/MessagingResponse';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { hashPhoneNumber } from '../utils/privacy.js';

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
 * IP-based rate limiting configuration
 * More permissive than phone-based to allow legitimate traffic
 */
const MAX_IP_REQUESTS_PER_WINDOW = parseInt(
  process.env.RATE_LIMIT_MAX_IP_REQUESTS || '30',
  10
);
const IP_WINDOW_SIZE_SECONDS = parseInt(
  process.env.RATE_LIMIT_IP_WINDOW_SECONDS || '60',
  10
);

/**
 * Rate Limit Middleware
 * Implements dual sliding window rate limiting using Redis:
 * 1. Phone-based: 10 requests/min per phone number (strict)
 * 2. IP-based: 30 requests/min per IP address (lenient, anti-DDoS)
 *
 * Strategy:
 * - Uses Redis INCR with TTL for atomic operations
 * - Key formats:
 *   - ratelimit:phone:{hashedPhoneNumber}
 *   - ratelimit:ip:{ipAddress}
 * - Fail-open: If Redis fails, allows request but logs error
 *
 * Headers:
 * - X-RateLimit-Limit: Maximum requests allowed in window (phone)
 * - X-RateLimit-Remaining: Requests remaining in current window (phone)
 * - X-RateLimit-Reset: Unix timestamp when the limit resets (phone)
 * - X-RateLimit-IP-Limit: Maximum requests allowed per IP
 * - X-RateLimit-IP-Remaining: Requests remaining for IP
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract phone number from Twilio webhook
    const from = req.body?.From;
    const clientIp = req.ip;

    if (!from) {
      logger.warn('⚠️  Rate limit: No "From" field in request body');
      // Allow request to proceed if From is missing (validation will catch it later)
      return next();
    }

    // Clean phone number (remove "whatsapp:" prefix)
    const phoneNumber = from.replace(/^whatsapp:/i, '');
    const phoneNumberHash = hashPhoneNumber(phoneNumber);

    try {
      // ========== PHONE-BASED RATE LIMIT ==========
      const phoneKey = `ratelimit:phone:${phoneNumberHash}`;
      const phoneCount = await redis.incr(phoneKey);

      if (phoneCount === 1) {
        await redis.expire(phoneKey, WINDOW_SIZE_SECONDS);
      }

      const phoneTtl = await redis.ttl(phoneKey);
      const phoneResetTime = Math.floor(Date.now() / 1000) + phoneTtl;
      const phoneRemaining = Math.max(0, MAX_REQUESTS_PER_WINDOW - phoneCount);

      // ========== IP-BASED RATE LIMIT ==========
      const ipKey = `ratelimit:ip:${clientIp}`;
      const ipCount = await redis.incr(ipKey);

      if (ipCount === 1) {
        await redis.expire(ipKey, IP_WINDOW_SIZE_SECONDS);
      }

      const ipRemaining = Math.max(0, MAX_IP_REQUESTS_PER_WINDOW - ipCount);

      // Add rate limit headers (phone + IP)
      res.setHeader('X-RateLimit-Limit', MAX_REQUESTS_PER_WINDOW.toString());
      res.setHeader('X-RateLimit-Remaining', phoneRemaining.toString());
      res.setHeader('X-RateLimit-Reset', phoneResetTime.toString());
      res.setHeader('X-RateLimit-IP-Limit', MAX_IP_REQUESTS_PER_WINDOW.toString());
      res.setHeader('X-RateLimit-IP-Remaining', ipRemaining.toString());

      logger.debug('🔢 Rate limit check (phone + IP)', {
        phoneNumberHash,
        phoneCount,
        phoneLimit: MAX_REQUESTS_PER_WINDOW,
        phoneRemaining,
        ip: clientIp,
        ipCount,
        ipLimit: MAX_IP_REQUESTS_PER_WINDOW,
        ipRemaining,
      });

      // Check if phone limit exceeded
      if (phoneCount > MAX_REQUESTS_PER_WINDOW) {
        logger.warn('🚫 Phone rate limit exceeded', {
          phoneNumberHash,
          phoneCount,
          limit: MAX_REQUESTS_PER_WINDOW,
          windowSeconds: WINDOW_SIZE_SECONDS,
          ip: clientIp,
        });

        return respondWithRateLimitError(res, 'phone');
      }

      // Check if IP limit exceeded
      if (ipCount > MAX_IP_REQUESTS_PER_WINDOW) {
        logger.warn('🚫 IP rate limit exceeded', {
          ip: clientIp,
          ipCount,
          limit: MAX_IP_REQUESTS_PER_WINDOW,
          windowSeconds: IP_WINDOW_SIZE_SECONDS,
          phoneNumberHash,
        });

        return respondWithRateLimitError(res, 'ip');
      }

      // Both limits passed
      logger.info('✅ Rate limit check passed (phone + IP)', {
        phoneNumberHash,
        phoneCount,
        phoneRemaining,
        ip: clientIp,
        ipCount,
        ipRemaining,
      });

      next();
    } catch (redisError) {
      // Redis operation failed - fail-open (allow request)
      logger.error('❌ Redis error in rate limit check - failing open', {
        error: redisError instanceof Error ? redisError.message : redisError,
        phoneNumberHash,
        ip: clientIp,
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
function respondWithRateLimitError(res: Response, limitType: 'phone' | 'ip'): void {
  const twiml = new MessagingResponse();

  const message = limitType === 'phone'
    ? 'Lo siento, has enviado demasiados mensajes en poco tiempo. Por favor espera un minuto antes de intentar de nuevo. ⏱️'
    : 'El servidor está recibiendo demasiadas solicitudes. Por favor intenta de nuevo en un minuto. ⏱️';

  twiml.message(message);

  res.status(429); // Too Many Requests
  res.type('text/xml');
  res.send(twiml.toString());

  logger.debug('📤 Rate limit error response sent', { limitType });
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
    logger.info('Rate limit reset', { phoneNumberHash: hashPhoneNumber(phoneNumber) });
  } catch (error) {
    logger.error('Error resetting rate limit', {
      error: error instanceof Error ? error.message : error,
      phoneNumberHash: hashPhoneNumber(phoneNumber),
    });
    throw error;
  }
}
