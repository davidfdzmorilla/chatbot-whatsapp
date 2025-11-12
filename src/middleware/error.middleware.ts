import type { Request, Response, NextFunction } from 'express';
import MessagingResponse from 'twilio/lib/twiml/MessagingResponse';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { sanitizeForLogging } from '../utils/privacy.js';

/**
 * Error object structure for consistent error handling
 */
interface ErrorResponse {
  status: 'error';
  message: string;
  statusCode: number;
  stack?: string;
  timestamp: string;
  path?: string;
}

/**
 * Error Middleware
 * Global error handler for Express application
 *
 * Features:
 * - Catches all unhandled errors in the request pipeline
 * - Logs errors with full context using Winston
 * - Returns appropriate responses based on NODE_ENV:
 *   - Development: Includes stack trace and detailed error info
 *   - Production: Returns generic message without internal details
 * - Attempts to respond with TwiML for webhook requests
 * - Provides consistent error response format
 *
 * Usage:
 * This middleware should be registered LAST in the Express middleware chain,
 * after all routes and other middleware.
 *
 * @example
 * app.use('/webhook', webhookRoutes);
 * app.use('/health', healthRoutes);
 * app.use(errorMiddleware); // Register last
 */
export function errorMiddleware(
  error: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // Extract error details
  const statusCode = (error as any).statusCode || 500;
  const message = error.message || 'Internal server error';
  const stack = error.stack;

  // Log error with full context (sanitized and environment-aware)
  logger.error('❌ Unhandled error in request', {
    error: message,
    statusCode,
    stack: env.NODE_ENV === 'development' ? stack : undefined,  // Only in development
    path: req.path,
    method: req.method,
    body: env.NODE_ENV === 'development' ? sanitizeForLogging(req.body) : undefined,  // Sanitized and only in development
    query: env.NODE_ENV === 'development' ? sanitizeForLogging(req.query) : undefined,  // Sanitized and only in development
    params: env.NODE_ENV === 'development' ? req.params : undefined,  // Only in development
    ip: req.ip,
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString(),
  });

  // Determine if this is a webhook request (should respond with TwiML)
  const isWebhookRequest = req.path.includes('/webhook');

  if (isWebhookRequest) {
    // Respond with TwiML error message
    respondWithTwiMLError(res, statusCode);
  } else {
    // Respond with JSON error
    respondWithJSONError(res, error, statusCode, req.path);
  }
}

/**
 * Respond with TwiML error message
 * Used for webhook endpoints to ensure Twilio receives valid TwiML
 */
function respondWithTwiMLError(res: Response, statusCode: number): void {
  const twiml = new MessagingResponse();

  // User-friendly error message (in Spanish for WhatsApp users)
  twiml.message(
    'Lo siento, ha ocurrido un error al procesar tu mensaje. Por favor intenta de nuevo en unos momentos. 🔧'
  );

  res.status(statusCode);
  res.type('text/xml');
  res.send(twiml.toString());

  logger.debug('📤 TwiML error response sent', { statusCode });
}

/**
 * Respond with JSON error
 * Used for non-webhook endpoints (e.g., health check, admin endpoints)
 */
function respondWithJSONError(
  res: Response,
  error: Error,
  statusCode: number,
  path: string
): void {
  const isDevelopment = env.NODE_ENV === 'development';

  // Build error response
  const errorResponse: ErrorResponse = {
    status: 'error',
    message: isDevelopment ? error.message : 'Internal server error',
    statusCode,
    timestamp: new Date().toISOString(),
    path,
  };

  // Include stack trace only in development
  if (isDevelopment && error.stack) {
    errorResponse.stack = error.stack;
  }

  res.status(statusCode).json(errorResponse);

  logger.debug('📤 JSON error response sent', { statusCode, path });
}

/**
 * Custom Application Error
 * Extends Error to include HTTP status code
 *
 * Usage:
 * throw new AppError('User not found', 404);
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);

    // Set the prototype explicitly (TypeScript requirement)
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Not Found Error Handler
 * Handles 404 errors for undefined routes
 *
 * Usage:
 * app.use(notFoundHandler); // Before error middleware
 */
export function notFoundHandler(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const error = new AppError(`Route not found: ${req.method} ${req.path}`, 404);

  logger.warn('⚠️  Route not found', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  next(error);
}

/**
 * Async Handler Wrapper
 * Wraps async route handlers to catch promise rejections
 *
 * Usage:
 * router.post('/webhook', asyncHandler(async (req, res) => {
 *   await someAsyncOperation();
 *   res.send('OK');
 * }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
