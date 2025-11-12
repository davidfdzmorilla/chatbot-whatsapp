/**
 * Middleware Layer
 * Exports all middleware functions for request processing
 *
 * Middleware functions intercept requests before they reach controllers.
 * They handle cross-cutting concerns like rate limiting, error handling,
 * validation, and authentication.
 */

// Export Content-Type validation middleware
export { validateWebhookContentType } from './contentType.middleware.js';

// Export rate limiting middleware
export {
  rateLimitMiddleware,
  getRateLimitStatus,
  resetRateLimit,
} from './rateLimit.middleware.js';

// Export error handling middleware
export {
  errorMiddleware,
  notFoundHandler,
  asyncHandler,
  AppError,
} from './error.middleware.js';

// Export validation middleware
export {
  validationMiddleware,
  validateMessageLength,
  validateMedia,
  type TwilioWebhookPayload,
} from './validation.middleware.js';

// Export Twilio signature validation middleware
export {
  twilioSignatureMiddleware,
  optionalTwilioSignatureMiddleware,
} from './twilioSignature.middleware.js';
