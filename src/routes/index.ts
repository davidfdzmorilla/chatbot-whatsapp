import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';
import { webhookController } from '../controllers/webhook.controller.js';
import {
  validateWebhookContentType,
  twilioSignatureMiddleware,
  optionalTwilioSignatureMiddleware,
  rateLimitMiddleware,
  validationMiddleware,
} from '../middleware/index.js';
import { env } from '../config/env.js';

/**
 * Main router configuration
 * Registers all application routes with appropriate middleware
 */
const router = Router();

/**
 * Health Check Endpoint
 * GET /health
 *
 * Returns system health status including:
 * - Database connection status
 * - Redis connection status
 * - Memory usage
 * - Uptime
 *
 * No authentication required - used by load balancers and monitoring tools
 */
router.get('/health', (req, res) => healthController.check(req, res));

/**
 * WhatsApp Webhook Endpoint
 * POST /webhook/whatsapp
 *
 * Receives incoming messages from Twilio WhatsApp API
 *
 * Middleware Pipeline:
 * 1. validateWebhookContentType - Validates Content-Type header (blocks JSON injection)
 * 2. twilioSignatureMiddleware - Validates Twilio webhook signature (security)
 * 3. rateLimitMiddleware - Limits requests to 10/min per phone + 30/min per IP
 * 4. validationMiddleware - Validates Twilio webhook payload with Zod
 * 5. webhookController.handleIncoming - Processes message and responds with TwiML
 *
 * Request Body (from Twilio):
 * - From: Phone number with "whatsapp:" prefix
 * - Body: Message content
 * - MessageSid: Unique message identifier
 * - ProfileName: (optional) WhatsApp profile name
 * - NumMedia: (optional) Number of media attachments
 *
 * Response: TwiML XML with assistant's response
 *
 * Security:
 * - Content-Type validation prevents malformed requests
 * - Twilio signature validation prevents webhook spoofing attacks
 * - Dual rate limiting (phone + IP) prevents abuse and DDoS
 */
// Select signature middleware based on environment
// Development: Optional validation (allows ngrok testing)
// Production: Strict validation (security required)
const signatureMiddleware = env.NODE_ENV === 'development'
  ? optionalTwilioSignatureMiddleware
  : twilioSignatureMiddleware;

router.post(
  '/webhook/whatsapp',
  validateWebhookContentType,  // FIRST: Validate Content-Type
  signatureMiddleware,          // SECOND: Validate signature (optional in dev)
  rateLimitMiddleware,           // THIRD: Check rate limits
  validationMiddleware,          // FOURTH: Validate payload
  (req, res) => webhookController.handleIncoming(req, res)
);

export default router;
