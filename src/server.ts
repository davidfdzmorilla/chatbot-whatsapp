import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

/**
 * Server entry point
 * Initializes and starts the Express server
 */

const PORT = parseInt(env.PORT, 10);
const app = createApp();

/**
 * Start server
 */
const server = app.listen(PORT, () => {
  logger.info('🚀 Server started successfully', {
    port: PORT,
    environment: env.NODE_ENV,
    nodeVersion: process.version,
  });

  logger.info('📋 Available endpoints:', {
    health: `http://localhost:${PORT}/health`,
  });
});

/**
 * Graceful shutdown handler
 */
function gracefulShutdown(signal: string): void {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  server.close(() => {
    logger.info('Server closed. Exiting process.');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });

  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection', {
    reason,
  });

  process.exit(1);
});

export default server;
