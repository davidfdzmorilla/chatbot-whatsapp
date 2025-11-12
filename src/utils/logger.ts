import winston from 'winston';
import { env } from '../config/env.js';

/**
 * Winston logger configuration
 * Provides structured logging with different transports for development and production
 */

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

/**
 * Custom format for console output in development
 */
const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;

  // Add metadata if present
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata, null, 2)}`;
  }

  return msg;
});

/**
 * Create logger instance with appropriate configuration
 */
export const logger = winston.createLogger({
  level: env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    env.NODE_ENV === 'development' ? consoleFormat : json()
  ),
  defaultMeta: {
    service: 'chatbot-whatsapp',
    environment: env.NODE_ENV,
  },
  transports: [
    // Console transport (always)
    new winston.transports.Console({
      format:
        env.NODE_ENV === 'development'
          ? combine(colorize(), timestamp({ format: 'HH:mm:ss' }), consoleFormat)
          : json(),
    }),
  ],
});

/**
 * Add file transports in production
 */
if (env.NODE_ENV === 'production') {
  // Error log file
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  // Combined log file
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

/**
 * Log stream for Morgan (HTTP request logging)
 */
export const logStream = {
  write: (message: string): void => {
    logger.info(message.trim());
  },
};

// Log initialization
logger.info('Logger initialized', {
  level: env.LOG_LEVEL,
  environment: env.NODE_ENV,
});
