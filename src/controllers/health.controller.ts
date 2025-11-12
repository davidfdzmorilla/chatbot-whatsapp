import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * Health check status for individual components
 */
interface ComponentHealth {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

/**
 * Memory health check with usage statistics
 */
interface MemoryHealth {
  status: 'ok' | 'error';
  heapUsed: number;
  heapTotal: number;
  rss: number;
}

/**
 * Complete health check response
 */
interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
    memory: MemoryHealth;
  };
}

/**
 * Health Controller
 * Provides system health check endpoint for monitoring and load balancers
 *
 * Performs checks on:
 * - PostgreSQL database connection
 * - Redis cache connection
 * - Process memory usage
 * - Process uptime
 */
export class HealthController {
  /**
   * Check system health
   * Returns 200 if all checks pass, 503 if any check fails
   */
  async check(_req: Request, res: Response): Promise<void> {
    const startTime = Date.now();

    try {
      logger.debug('🏥 Starting health check');

      // Run all health checks in parallel
      const [databaseHealth, redisHealth, memoryHealth] = await Promise.all([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkMemory(),
      ]);

      // Determine overall status
      const allHealthy =
        databaseHealth.status === 'ok' &&
        redisHealth.status === 'ok' &&
        memoryHealth.status === 'ok';

      const overallStatus = allHealthy ? 'ok' : 'error';
      const statusCode = allHealthy ? 200 : 503;

      // Build response
      const response: HealthCheckResponse = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        environment: env.NODE_ENV,
        version: '1.0.0', // From package.json
        checks: {
          database: databaseHealth,
          redis: redisHealth,
          memory: memoryHealth,
        },
      };

      const totalLatencyMs = Date.now() - startTime;

      if (allHealthy) {
        logger.info('✅ Health check passed', {
          status: overallStatus,
          totalLatencyMs,
          databaseLatencyMs: databaseHealth.latencyMs,
          redisLatencyMs: redisHealth.latencyMs,
        });
      } else {
        logger.warn('⚠️  Health check failed', {
          status: overallStatus,
          totalLatencyMs,
          database: databaseHealth.status,
          redis: redisHealth.status,
          memory: memoryHealth.status,
        });
      }

      res.status(statusCode).json(response);
    } catch (error) {
      const totalLatencyMs = Date.now() - startTime;

      logger.error('❌ Health check error', {
        error: error instanceof Error ? error.message : error,
        totalLatencyMs,
      });

      // Return error response
      const errorResponse: HealthCheckResponse = {
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        environment: env.NODE_ENV,
        version: '1.0.0',
        checks: {
          database: { status: 'error', error: 'Health check failed' },
          redis: { status: 'error', error: 'Health check failed' },
          memory: { status: 'error', heapUsed: 0, heapTotal: 0, rss: 0 },
        },
      };

      res.status(503).json(errorResponse);
    }
  }

  /**
   * Check PostgreSQL database connection
   */
  private async checkDatabase(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      // Simple query to verify connection
      await prisma.$queryRaw(Prisma.sql`SELECT 1`);

      const latencyMs = Date.now() - startTime;

      logger.debug('✅ Database check passed', { latencyMs });

      return {
        status: 'ok',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      logger.warn('⚠️  Database check failed', {
        error: error instanceof Error ? error.message : error,
        latencyMs,
      });

      return {
        status: 'error',
        latencyMs,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Redis connection
   */
  private async checkRedis(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      // Ping Redis to verify connection
      await redis.ping();

      const latencyMs = Date.now() - startTime;

      logger.debug('✅ Redis check passed', { latencyMs });

      return {
        status: 'ok',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      logger.warn('⚠️  Redis check failed', {
        error: error instanceof Error ? error.message : error,
        latencyMs,
      });

      return {
        status: 'error',
        latencyMs,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check process memory usage
   */
  private checkMemory(): MemoryHealth {
    try {
      const memoryUsage = process.memoryUsage();

      // Convert bytes to MB for readability
      const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
      const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);

      logger.debug('✅ Memory check passed', {
        heapUsedMB,
        heapTotalMB,
        rssMB,
      });

      return {
        status: 'ok',
        heapUsed: heapUsedMB,
        heapTotal: heapTotalMB,
        rss: rssMB,
      };
    } catch (error) {
      logger.warn('⚠️  Memory check failed', {
        error: error instanceof Error ? error.message : error,
      });

      return {
        status: 'error',
        heapUsed: 0,
        heapTotal: 0,
        rss: 0,
      };
    }
  }
}

// Export singleton instance
export const healthController = new HealthController();
