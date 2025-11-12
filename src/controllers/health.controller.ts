import { Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * Health check controller
 * Provides application health status and diagnostics
 */
export class HealthController {
  /**
   * GET /health
   * Returns health status of the application
   */
  async check(_req: Request, res: Response): Promise<void> {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
      version: '1.0.0',
      checks: {
        server: this.checkServer(),
        memory: this.checkMemory(),
      },
    };

    // Determine overall health status
    const isHealthy = Object.values(health.checks).every(
      (check) => check.status === 'ok'
    );

    const statusCode = isHealthy ? 200 : 503;

    logger.debug('Health check performed', { status: health.status });

    res.status(statusCode).json(health);
  }

  /**
   * Check server status
   */
  private checkServer(): { status: string } {
    return {
      status: 'ok',
    };
  }

  /**
   * Check memory usage
   */
  private checkMemory(): { status: string; usage: Record<string, string> } {
    const usage = process.memoryUsage();

    return {
      status: 'ok',
      usage: {
        rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(usage.external / 1024 / 1024)}MB`,
      },
    };
  }
}

// Export singleton instance
export const healthController = new HealthController();
