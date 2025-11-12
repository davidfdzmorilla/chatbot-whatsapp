/**
 * Controller Layer
 * Exports all controller instances for handling HTTP requests
 *
 * Controllers are thin layers that handle HTTP requests/responses
 * and delegate business logic to services. They follow the
 * Controller pattern from MVC architecture.
 */

// Export controller instances
export {
  webhookController,
  WebhookController,
} from './webhook.controller.js';
