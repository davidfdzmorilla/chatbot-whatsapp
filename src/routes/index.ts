import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';
import { webhookController } from '../controllers/webhook.controller.js';
import {
  rateLimitMiddleware,
  validationMiddleware,
} from '../middleware/index.js';

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
 * 1. rateLimitMiddleware - Limits requests to 10/min per phone number
 * 2. validationMiddleware - Validates Twilio webhook payload with Zod
 * 3. webhookController.handleIncoming - Processes message and responds with TwiML
 *
 * Request Body (from Twilio):
 * - From: Phone number with "whatsapp:" prefix
 * - Body: Message content
 * - MessageSid: Unique message identifier
 * - ProfileName: (optional) WhatsApp profile name
 * - NumMedia: (optional) Number of media attachments
 *
 * Response: TwiML XML with assistant's response
 */
router.post(
  '/webhook/whatsapp',
  rateLimitMiddleware,
  validationMiddleware,
  (req, res) => webhookController.handleIncoming(req, res)
);

export default router;
