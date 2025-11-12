import type { Request, Response, NextFunction } from 'express';
import { validateRequest } from 'twilio';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * Twilio Signature Validation Middleware
 *
 * Validates that incoming webhook requests are actually from Twilio by verifying
 * the X-Twilio-Signature header using HMAC-SHA1 validation.
 *
 * Security Features:
 * - Validates HMAC-SHA1 signature from Twilio
 * - Prevents webhook spoofing attacks
 * - Rejects unauthorized requests with 403 Forbidden
 * - Logs security violations for monitoring
 * - Fail-secure: rejects requests with missing/invalid signatures
 *
 * How it works:
 * 1. Extract X-Twilio-Signature header from request
 * 2. Construct full webhook URL (protocol + host + path)
 * 3. Use Twilio's validateRequest() to verify signature against:
 *    - Auth token (from environment)
 *    - Full webhook URL
 *    - Request body parameters
 * 4. Allow request if valid, reject if invalid
 *
 * Reference:
 * https://www.twilio.com/docs/usage/security#validating-requests
 *
 * @example
 * // In routes
 * router.post(
 *   '/webhook/whatsapp',
 *   twilioSignatureMiddleware,  // Validate signature first
 *   rateLimitMiddleware,
 *   validationMiddleware,
 *   webhookController.handleIncoming
 * );
 */
export function twilioSignatureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Extract Twilio signature from headers
    const twilioSignature = req.headers['x-twilio-signature'] as string | undefined;

    // Check if signature header exists
    if (!twilioSignature) {
      logger.warn('Missing Twilio signature header', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      return respondWithForbidden(res, 'Missing signature');
    }

    // Construct full webhook URL
    // Important: Must match exactly what Twilio used to generate signature
    const protocol = req.protocol; // 'http' or 'https'
    const host = req.get('host'); // 'example.com' or 'localhost:3001'
    const url = `${protocol}://${host}${req.originalUrl}`;

    logger.debug('Validating Twilio signature', {
      url,
      method: req.method,
      hasSignature: true,
    });

    // Validate signature using Twilio SDK
    // This compares the signature against HMAC-SHA1 of (url + sorted params)
    const isValidSignature = validateRequest(
      env.TWILIO_AUTH_TOKEN,
      twilioSignature,
      url,
      req.body
    );

    if (!isValidSignature) {
      logger.warn('Invalid Twilio signature detected', {
        url,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        body: req.body,
      });

      return respondWithForbidden(res, 'Invalid signature');
    }

    // Signature is valid - log success and proceed
    logger.info('Twilio signature validated successfully', {
      from: req.body?.From,
      messageId: req.body?.MessageSid,
      url,
    });

    next();
  } catch (error) {
    // Unexpected error during validation - fail secure (reject request)
    logger.error('Error during Twilio signature validation', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      path: req.path,
      ip: req.ip,
    });

    return respondWithForbidden(res, 'Signature validation failed');
  }
}

/**
 * Respond with 403 Forbidden
 * Used when signature validation fails
 *
 * Important: Don't expose internal details to prevent information leakage
 */
function respondWithForbidden(res: Response, reason: string): void {
  logger.debug('Sending 403 Forbidden response', { reason });

  res.status(403).json({
    error: 'Forbidden',
    message: 'Access denied',
  });
}

/**
 * Optional: Skip signature validation in development
 *
 * WARNING: Only use this in local development with ngrok.
 * NEVER skip validation in production.
 *
 * @example
 * const middleware = env.NODE_ENV === 'development'
 *   ? twilioSignatureMiddleware.optional
 *   : twilioSignatureMiddleware;
 */
export function optionalTwilioSignatureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (env.NODE_ENV === 'development') {
    logger.warn('Skipping Twilio signature validation (development mode)', {
      path: req.path,
    });
    return next();
  }

  return twilioSignatureMiddleware(req, res, next);
}
