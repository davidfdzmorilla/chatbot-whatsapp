/**
 * Custom error classes for the application
 * Following Clean Code principles with meaningful error types
 */

/**
 * Base application error class
 * All custom errors extend from this
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error (400)
 * Used when input validation fails
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR');
    if (details) {
      this.details = details;
    }
  }

  details?: unknown;
}

/**
 * Not found error (404)
 * Used when a resource is not found
 */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

/**
 * Unauthorized error (401)
 * Used for authentication failures
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * Forbidden error (403)
 * Used when access is denied
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Rate limit error (429)
 * Used when rate limit is exceeded
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * External service error (502)
 * Used when external API calls fail (Twilio, Claude, etc.)
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message?: string) {
    super(message || `External service error: ${service}`, 502, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
  }

  service: string;
}

/**
 * Check if error is an operational error
 * Operational errors are expected and should be handled gracefully
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}
