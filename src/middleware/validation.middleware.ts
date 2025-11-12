import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import MessagingResponse from 'twilio/lib/twiml/MessagingResponse';
import { logger } from '../utils/logger.js';

/**
 * Twilio Webhook Payload Schema
 * Validates incoming webhook requests from Twilio WhatsApp API
 *
 * Reference: https://www.twilio.com/docs/sms/twiml#twilios-request-to-your-application
 *
 * Required fields:
 * - From: Sender's phone number (format: whatsapp:+1234567890)
 * - Body: Message content (text)
 * - MessageSid: Unique message identifier from Twilio
 *
 * Optional fields:
 * - ProfileName: WhatsApp profile name of sender
 * - NumMedia: Number of media attachments (0-10)
 * - MediaUrl0-9: URLs of media attachments
 * - MediaContentType0-9: MIME types of media attachments
 */
const twilioWebhookSchema = z.object({
  // Required fields
  From: z
    .string()
    .min(1, 'From field is required')
    .regex(/^whatsapp:\+\d+$/, 'From must be in format: whatsapp:+1234567890'),

  Body: z.string().min(0, 'Body field is required'), // Can be empty for media-only messages

  MessageSid: z
    .string()
    .min(1, 'MessageSid is required')
    .regex(/^[A-Z]{2}[a-z0-9]{32}$/, 'Invalid MessageSid format'),

  // Optional fields
  ProfileName: z.string().optional(),

  NumMedia: z
    .string()
    .regex(/^\d+$/, 'NumMedia must be a number')
    .transform((val) => parseInt(val, 10))
    .optional(),

  // Media URLs (0-9)
  MediaUrl0: z.string().url().optional(),
  MediaUrl1: z.string().url().optional(),
  MediaUrl2: z.string().url().optional(),
  MediaUrl3: z.string().url().optional(),
  MediaUrl4: z.string().url().optional(),
  MediaUrl5: z.string().url().optional(),
  MediaUrl6: z.string().url().optional(),
  MediaUrl7: z.string().url().optional(),
  MediaUrl8: z.string().url().optional(),
  MediaUrl9: z.string().url().optional(),

  // Media Content Types (0-9)
  MediaContentType0: z.string().optional(),
  MediaContentType1: z.string().optional(),
  MediaContentType2: z.string().optional(),
  MediaContentType3: z.string().optional(),
  MediaContentType4: z.string().optional(),
  MediaContentType5: z.string().optional(),
  MediaContentType6: z.string().optional(),
  MediaContentType7: z.string().optional(),
  MediaContentType8: z.string().optional(),
  MediaContentType9: z.string().optional(),

  // Additional Twilio fields (optional, for context)
  AccountSid: z.string().optional(),
  MessagingServiceSid: z.string().optional(),
  To: z.string().optional(),
  SmsStatus: z.string().optional(),
  ApiVersion: z.string().optional(),
});

/**
 * Type definition for validated Twilio webhook payload
 */
export type TwilioWebhookPayload = z.infer<typeof twilioWebhookSchema>;

/**
 * Validation Middleware
 * Validates incoming webhook requests from Twilio using Zod schema
 *
 * Features:
 * - Validates required fields (From, Body, MessageSid)
 * - Validates optional fields if present
 * - Rejects invalid requests with 400 Bad Request
 * - Returns user-friendly TwiML error message
 * - Logs validation failures for debugging
 * - Type-safe: Adds validated payload to req.body
 *
 * Usage:
 * app.post('/webhook/whatsapp', validationMiddleware, webhookController.handleIncoming);
 *
 * @example
 * // Valid request
 * {
 *   From: "whatsapp:+1234567890",
 *   Body: "Hello",
 *   MessageSid: "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 * }
 *
 * // Invalid request
 * {
 *   From: "+1234567890",  // Missing "whatsapp:" prefix
 *   Body: "Hello"
 *   // Missing MessageSid
 * }
 */
export async function validationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Log incoming request for debugging
    logger.debug('Validating webhook payload', {
      body: req.body,
      headers: {
        'content-type': req.get('content-type'),
        'user-agent': req.get('user-agent'),
      },
    });

    // Validate payload against schema
    const validatedPayload = twilioWebhookSchema.parse(req.body);

    // Attach validated payload to request
    req.body = validatedPayload;

    logger.info('Webhook payload validation passed', {
      from: validatedPayload.From,
      messageId: validatedPayload.MessageSid,
      hasMedia: (validatedPayload.NumMedia || 0) > 0,
      bodyLength: validatedPayload.Body.length,
    });

    // Proceed to next middleware
    next();
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      handleValidationError(error, req, res);
    } else {
      // Unexpected error during validation
      logger.error('Unexpected error during validation', {
        error: error instanceof Error ? error.message : error,
        body: req.body,
      });

      respondWithValidationError(
        res,
        'Invalid webhook payload format',
        400
      );
    }
  }
}

/**
 * Handle Zod validation errors
 * Extracts validation issues and responds with descriptive error
 */
function handleValidationError(
  error: z.ZodError,
  req: Request,
  res: Response
): void {
  // Extract validation issues
  const issues = error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));

  logger.warn('Webhook validation failed', {
    issues,
    body: req.body,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Create user-friendly error message
  const errorMessage = issues
    .map((issue) => `${issue.field}: ${issue.message}`)
    .join(', ');

  logger.debug('Validation error details', {
    errorMessage,
    issueCount: issues.length,
  });

  respondWithValidationError(res, errorMessage, 400);
}

/**
 * Respond with TwiML validation error
 * Returns 400 Bad Request with TwiML error message
 */
function respondWithValidationError(
  res: Response,
  errorMessage: string,
  statusCode: number = 400
): void {
  const twiml = new MessagingResponse();

  // User-friendly error message (in Spanish)
  twiml.message(
    'Lo siento, no pude procesar tu mensaje correctamente. Por favor intenta de nuevo.'
  );

  res.status(statusCode);
  res.type('text/xml');
  res.send(twiml.toString());

  logger.debug('Validation error response sent', {
    statusCode,
    errorMessage,
  });
}

/**
 * Validate Message Body Length
 * Optional middleware to enforce message length limits
 *
 * WhatsApp message limits:
 * - Maximum length: 4096 characters (WhatsApp limit)
 * - Recommended length: 1000 characters (for better UX)
 */
export function validateMessageLength(maxLength: number = 4096) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const body = req.body?.Body || '';

    if (body.length > maxLength) {
      logger.warn('Message body exceeds maximum length', {
        length: body.length,
        maxLength,
        from: req.body?.From,
      });

      respondWithValidationError(
        res,
        `Message too long (max ${maxLength} characters)`,
        400
      );
      return;
    }

    next();
  };
}

/**
 * Validate Media Attachments
 * Optional middleware to validate media count and types
 *
 * @param maxMedia Maximum number of media attachments allowed
 * @param allowedTypes Array of allowed MIME types (e.g., ['image/jpeg', 'image/png'])
 */
export function validateMedia(
  maxMedia: number = 10,
  allowedTypes?: string[]
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const numMedia = req.body?.NumMedia || 0;

    // Check media count
    if (numMedia > maxMedia) {
      logger.warn('Too many media attachments', {
        numMedia,
        maxMedia,
        from: req.body?.From,
      });

      respondWithValidationError(
        res,
        `Too many media attachments (max ${maxMedia})`,
        400
      );
      return;
    }

    // Check media types if specified
    if (allowedTypes && numMedia > 0) {
      for (let i = 0; i < numMedia; i++) {
        const contentType = req.body[`MediaContentType${i}`];

        if (contentType && !allowedTypes.includes(contentType)) {
          logger.warn('Unsupported media type', {
            contentType,
            allowedTypes,
            from: req.body?.From,
          });

          respondWithValidationError(
            res,
            `Unsupported media type: ${contentType}`,
            400
          );
          return;
        }
      }
    }

    next();
  };
}
