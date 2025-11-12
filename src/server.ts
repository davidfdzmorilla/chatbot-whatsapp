import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { prisma } from './config/database.js';
import { redis } from './config/redis.js';

/**
 * Server entry point
 * Initializes and starts the Express server
 *
 * Startup sequence:
 * 1. Verify database connection
 * 2. Verify Redis connection
 * 3. Start Express server
 * 4. Register graceful shutdown handlers
 */

const PORT = parseInt(env.PORT, 10);

/**
 * Verify Database Connection
 * Attempts to ping PostgreSQL database via Prisma
 */
async function verifyDatabaseConnection(): Promise<void> {
  try {
    logger.info('Verifying database connection...');

    // Ping database with a simple query
    await prisma.$queryRaw`SELECT 1`;

    logger.info('✅ Database connection verified', {
      database: 'PostgreSQL',
    });
  } catch (error) {
    logger.error('❌ Database connection failed', {
      error: error instanceof Error ? error.message : error,
      database: 'PostgreSQL',
    });

    throw new Error('Failed to connect to database');
  }
}

/**
 * Verify Redis Connection
 * Attempts to ping Redis server
 */
async function verifyRedisConnection(): Promise<void> {
  try {
    logger.info('Verifying Redis connection...');

    // Ping Redis
    await redis.ping();

    logger.info('✅ Redis connection verified');
  } catch (error) {
    logger.error('❌ Redis connection failed', {
      error: error instanceof Error ? error.message : error,
    });

    throw new Error('Failed to connect to Redis');
  }
}

/**
 * Initialize Server
 * Verifies connections and starts the Express server
 */
async function initializeServer(): Promise<void> {
  try {
    logger.info('Starting server initialization...', {
      environment: env.NODE_ENV,
      nodeVersion: process.version,
      port: PORT,
    });

    // Verify all connections before starting server
    await verifyDatabaseConnection();
    await verifyRedisConnection();

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(PORT, () => {
      logger.info('🚀 Server started successfully', {
        port: PORT,
        environment: env.NODE_ENV,
        nodeVersion: process.version,
      });

      logger.info('📋 Available endpoints:', {
        health: `http://localhost:${PORT}/health`,
        webhook: `http://localhost:${PORT}/webhook/whatsapp`,
      });

      logger.info('✨ Server ready to accept requests');
    });

    // VULN-011 FIX: Configure HTTP timeouts to prevent slowloris and hung connections
    // These timeouts protect against:
    // - Slowloris attacks (slow request/response)
    // - Connection exhaustion
    // - Resource leaks from hung connections

    // Timeout for receiving the entire request (headers + body)
    // Twilio webhooks should complete quickly (< 5 seconds)
    server.requestTimeout = 10000; // 10 seconds

    // Timeout for inactivity on the socket
    // Close connections that have no activity
    server.timeout = 30000; // 30 seconds

    // Timeout for HTTP headers to be received
    // Protects against slow header attacks
    server.headersTimeout = 10000; // 10 seconds (must be > requestTimeout)

    // Keep-Alive timeout (time to keep idle connections open)
    // Shorter timeout reduces resource usage
    server.keepAliveTimeout = 5000; // 5 seconds

    logger.info('HTTP timeouts configured', {
      requestTimeout: '10s',
      socketTimeout: '30s',
      headersTimeout: '10s',
      keepAliveTimeout: '5s',
    });

    // Register graceful shutdown handlers
    setupGracefulShutdown(server);
  } catch (error) {
    logger.error('❌ Server initialization failed', {
      error: error instanceof Error ? error.message : error,
    });

    // Exit process with error code
    process.exit(1);
  }
}

/**
 * Setup Graceful Shutdown Handlers
 * Registers handlers for shutdown signals and uncaught errors
 */
function setupGracefulShutdown(server: any): void {
  /**
   * Graceful shutdown handler
   */
  function gracefulShutdown(signal: string): void {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    // Close HTTP server (stop accepting new connections)
    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        // Close database connection
        await prisma.$disconnect();
        logger.info('Database connection closed');

        // Close Redis connection
        await redis.quit();
        logger.info('Redis connection closed');

        logger.info('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', {
          error: error instanceof Error ? error.message : error,
        });
        process.exit(1);
      }
    });

    // Force shutdown after 10 seconds if graceful shutdown hangs
    setTimeout(() => {
      logger.error('⚠️  Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  }

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('❌ Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });

    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('❌ Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
    });

    process.exit(1);
  });
}

// Start the server
initializeServer();
