import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Content-Type Validation Middleware
 *
 * Validates that webhook requests have the correct Content-Type header.
 * Twilio sends webhooks with application/x-www-form-urlencoded.
 *
 * Security Benefits:
 * - Prevents attacks using unexpected content types
 * - Blocks JSON injection attempts on form-data endpoints
 * - Ensures proper body parsing
 * - Early rejection of malformed requests
 *
 * This middleware should be placed FIRST in the webhook pipeline,
 * before signature validation and rate limiting.
 *
 * @example
 * router.post(
 *   '/webhook/whatsapp',
 *   validateWebhookContentType,  // FIRST: Validate Content-Type
 *   twilioSignatureMiddleware,   // THEN: Validate signature
 *   rateLimitMiddleware,
 *   validationMiddleware,
 *   webhookController.handleIncoming
 * );
 */
export function validateWebhookContentType(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const contentType = req.get('content-type');

  // Twilio webhooks use application/x-www-form-urlencoded
  // Example: "application/x-www-form-urlencoded; charset=utf-8"
  if (!contentType || !contentType.includes('application/x-www-form-urlencoded')) {
    logger.warn('Invalid Content-Type for webhook', {
      contentType: contentType || 'missing',
      ip: req.ip,
      userAgent: req.get('user-agent'),
      path: req.path,
      method: req.method,
    });

    // Respond with 415 Unsupported Media Type
    return void res.status(415).json({
      error: 'Unsupported Media Type',
      message: 'Expected application/x-www-form-urlencoded',
    });
  }

  // Content-Type is valid, proceed to next middleware
  next();
}
