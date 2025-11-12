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

  // CORS configuration with environment-aware origin validation
  // Twilio webhooks are server-to-server and don't need CORS
  // In production, uses ALLOWED_ORIGINS env var for configurable whitelist
  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, mobile apps, Postman, curl)
      // Twilio webhooks don't send Origin header
      if (!origin) {
        return callback(null, true);
      }

      // Get allowed origins from environment or use defaults
      const allowedOrigins = env.ALLOWED_ORIGINS
        ? env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : [];

      // Development: allow localhost patterns if no origins configured
      if (env.NODE_ENV === 'development') {
        const localhostPattern = /^https?:\/\/localhost(:\d+)?$/;
        if (localhostPattern.test(origin)) {
          return callback(null, true);
        }
      }

      // If no origins configured in development, allow all
      if (allowedOrigins.length === 0 && env.NODE_ENV === 'development') {
        return callback(null, true);
      }

      // Check if origin is in whitelist
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn('🚫 CORS request blocked', {
          origin,
          allowedOrigins: env.NODE_ENV === 'development' ? allowedOrigins : '[REDACTED]',
        });
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'X-Twilio-Signature'],
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 200,
  };

  app.use(cors(corsOptions));

  logger.info('✅ CORS configured', {
    mode: env.ALLOWED_ORIGINS ? 'whitelist' : 'default',
    development: env.NODE_ENV === 'development',
  });

  // Body parsing middleware with strict size limits
  // WhatsApp webhook payloads are typically < 5KB
  // 10KB limit protects against DoS attacks while allowing legitimate requests
  const BODY_SIZE_LIMIT = '10kb';
  const BODY_SIZE_LIMIT_BYTES = 10240; // 10KB in bytes

  app.use(express.json({
    limit: BODY_SIZE_LIMIT,
    strict: true, // Only accept arrays and objects
  }));

  app.use(express.urlencoded({
    extended: true,
    limit: BODY_SIZE_LIMIT,
  }));

  // Additional body size validation middleware
  // Rejects requests exceeding limit before parsing
  app.use((req, res, next): void => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);

    if (contentLength > BODY_SIZE_LIMIT_BYTES) {
      logger.warn('⚠️  Request body exceeds size limit', {
        size: contentLength,
        sizeKB: (contentLength / 1024).toFixed(2),
        limit: BODY_SIZE_LIMIT,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(413).json({
        error: 'Payload Too Large',
        message: `Request body exceeds ${BODY_SIZE_LIMIT} limit`,
      });
      return;
    }

    next();
  });

  logger.info('✅ Body size limits configured', {
    limit: BODY_SIZE_LIMIT,
    limitBytes: BODY_SIZE_LIMIT_BYTES,
  });

  // HTTP request logging
  const morganFormat = env.NODE_ENV === 'development' ? 'dev' : 'combined';
  app.use(morgan(morganFormat, { stream: logStream }));

  // Disable x-powered-by header
  app.disable('x-powered-by');

  // Trust proxy configuration for accurate IP detection
  // Required when behind reverse proxies (Railway, Render, Fly.io) or ngrok
  // Prevents IP spoofing via X-Forwarded-For header manipulation
  if (env.NODE_ENV === 'production') {
    // Production: Trust first proxy only
    // Common for cloud providers (Railway, Render, Fly.io)
    app.set('trust proxy', 1);

    logger.info('✅ Trust proxy enabled for production', {
      trustProxy: 1,
      note: 'Only first proxy in chain is trusted',
    });
  } else if (env.NODE_ENV === 'development' && env.TRUST_PROXY === 'true') {
    // Development: Enable when using ngrok or local reverse proxy
    app.set('trust proxy', 1);

    logger.info('✅ Trust proxy enabled for development', {
      trustProxy: 1,
      note: 'Enabled for ngrok or local reverse proxy',
    });
  } else {
    // Development: Do not trust any proxies by default
    app.set('trust proxy', false);

    logger.info('ℹ️  Trust proxy disabled', {
      environment: env.NODE_ENV,
      note: 'Set TRUST_PROXY=true if using ngrok',
    });
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
