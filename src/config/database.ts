import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { env } from './env.js';

/**
 * Prisma Client configuration
 * Singleton pattern for database connection
 */

// Prisma Client instance
export const prisma = new PrismaClient({
  log:
    env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
  errorFormat: env.NODE_ENV === 'development' ? 'pretty' : 'minimal',
});

/**
 * Connect to database
 * Should be called on application startup
 */
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected successfully', {
      provider: 'PostgreSQL',
    });
  } catch (error) {
    logger.error('❌ Failed to connect to database', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Disconnect from database
 * Should be called on graceful shutdown
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch (error) {
    logger.error('Error disconnecting from database', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Health check for database connection
 */
export async function checkDatabaseHealth(): Promise<{ status: string; latencyMs?: number }> {
  try {
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - startTime;

    return {
      status: 'ok',
      latencyMs,
    };
  } catch (error) {
    logger.error('Database health check failed', {
      error: error instanceof Error ? error.message : error,
    });

    return {
      status: 'error',
    };
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing database connection');
  await disconnectDatabase();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing database connection');
  await disconnectDatabase();
});
