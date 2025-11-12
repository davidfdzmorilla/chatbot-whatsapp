import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';

/**
 * Main router configuration
 * Registers all application routes
 */
const router = Router();

/**
 * Health check endpoint
 * GET /health
 */
router.get('/health', (req, res) => healthController.check(req, res));

/**
 * Webhook routes will be added here
 * POST /webhook/whatsapp
 */
// router.post('/webhook/whatsapp', webhookController.handleIncoming);

export default router;
