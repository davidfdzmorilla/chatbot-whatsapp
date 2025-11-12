import { Request, Response, NextFunction } from 'express';
import { AppError, isOperationalError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * Global error handling middleware
 * Catches all errors and returns appropriate responses
 */
export function errorMiddleware(
  error: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // Log the error
  logger.error('Error occurred', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  // Handle operational errors (expected errors)
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      ...(env.NODE_ENV === 'development' && { stack: error.stack }),
    });
    return;
  }

  // Handle programming errors (unexpected errors)
  // Don't expose internal errors in production
  const statusCode = 500;
  const message =
    env.NODE_ENV === 'production' ? 'Internal server error' : error.message || 'Unknown error';

  res.status(statusCode).json({
    error: message,
    code: 'INTERNAL_ERROR',
    ...(env.NODE_ENV === 'development' && { stack: error.stack }),
  });

  // Exit process for non-operational errors in production
  if (!isOperationalError(error) && env.NODE_ENV === 'production') {
    logger.error('Non-operational error occurred. Shutting down gracefully...', {
      error: error.message,
      stack: error.stack,
    });

    // Give time for response to be sent
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  }
}

/**
 * Handle 404 errors (route not found)
 */
export function notFoundMiddleware(req: Request, res: Response): void {
  logger.warn('Route not found', {
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  res.status(404).json({
    error: 'Route not found',
    code: 'NOT_FOUND',
    path: req.path,
  });
}
