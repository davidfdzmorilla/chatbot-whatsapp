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
  // VULN-012 FIX: Hardened CSP without 'unsafe-inline'
  // Webhook-only application doesn't serve HTML/CSS, so strict CSP is safe
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"], // Removed 'unsafe-inline' for stricter CSP
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          // Prevent loading any external resources
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      // Additional security headers
      noSniff: true,              // X-Content-Type-Options: nosniff
      frameguard: {               // X-Frame-Options: DENY
        action: 'deny',
      },
      xssFilter: true,            // X-XSS-Protection: 1; mode=block
      referrerPolicy: {           // Referrer-Policy: no-referrer
        policy: 'no-referrer',
      },
    })
  );

  // CORS configuration with whitelist
  // Twilio webhooks are server-to-server and don't need CORS
  const ALLOWED_ORIGINS = env.NODE_ENV === 'production'
    ? [] // Production: No browser origins allowed (webhooks only)
    : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'];

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, mobile apps, Postman, curl)
      if (!origin) {
        return callback(null, true);
      }

      // In production, reject all browser requests (webhooks don't have origin)
      if (env.NODE_ENV === 'production') {
        logger.warn('CORS: Rejecting request with origin in production', { origin });
        return callback(new Error('Not allowed by CORS'));
      }

      // In development, allow whitelisted origins
      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      logger.warn('CORS: Origin not in whitelist', { origin });
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    optionsSuccessStatus: 200,
  };

  app.use(cors(corsOptions));

  // Body parsing middleware
  // WhatsApp webhook payloads are typically < 10KB
  // Reduced limit protects against DoS attacks
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // HTTP request logging
  const morganFormat = env.NODE_ENV === 'development' ? 'dev' : 'combined';
  app.use(morgan(morganFormat, { stream: logStream }));

  // Disable x-powered-by header
  app.disable('x-powered-by');

  // VULN-010 FIX: Trust proxy with validation
  // Configure trust proxy for production deployment behind reverse proxies
  if (env.NODE_ENV === 'production') {
    // Trust first proxy only (common for Railway, Render, Fly.io)
    // This prevents IP spoofing via X-Forwarded-For header manipulation
    // Only the first proxy in the chain is trusted
    app.set('trust proxy', 1);

    // Alternative: Trust specific IP ranges (uncomment if needed)
    // For Railway: trust loopback + private networks
    // app.set('trust proxy', 'loopback, linklocal, uniquelocal');

    // Alternative: Trust proxy by hop count function (most secure)
    // app.set('trust proxy', (ip: string) => {
    //   // List of known trusted proxy IPs (from your cloud provider)
    //   const trustedProxies = [
    //     '10.0.0.0/8',      // Private network
    //     '172.16.0.0/12',   // Private network
    //     '192.168.0.0/16',  // Private network
    //   ];
    //   return trustedProxies.some(range => ipInRange(ip, range));
    // });

    logger.info('Trust proxy enabled for production', {
      trustProxy: 1,
      note: 'Only first proxy in chain is trusted',
    });
  } else {
    // Development: do not trust any proxies
    app.set('trust proxy', false);
    logger.info('Trust proxy disabled for development');
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
