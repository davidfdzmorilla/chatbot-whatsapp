import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env.js';
import { logger, logStream } from './utils/logger.js';
import { errorMiddleware, notFoundHandler } from './middleware/error.middleware.js';
import router from './routes/index.js';

/**
 * Express application setup
 * Configures middleware, routes, and error handling
 */
export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })
  );

  // CORS configuration
  const corsOptions = {
    origin: env.NODE_ENV === 'production' ? [] : '*',
    credentials: true,
  };
  app.use(cors(corsOptions));

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // HTTP request logging
  const morganFormat = env.NODE_ENV === 'development' ? 'dev' : 'combined';
  app.use(morgan(morganFormat, { stream: logStream }));

  // Disable x-powered-by header
  app.disable('x-powered-by');

  // Trust proxy (for Railway, Render, etc.)
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // Routes
  app.use('/', router);

  // 404 handler (must be after all routes)
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorMiddleware);

  logger.info('Express app configured', {
    environment: env.NODE_ENV,
    port: env.PORT,
  });

  return app;
}
