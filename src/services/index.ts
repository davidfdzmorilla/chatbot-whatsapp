/**
 * Service Layer
 * Exports all service instances for business logic orchestration
 *
 * Services contain the application's business logic and orchestrate
 * interactions between controllers, repositories, and external services.
 * They follow the Service pattern from Domain-Driven Design (DDD).
 */

// Export service instances
export {
  conversationService,
  ConversationService,
  type ConversationData,
} from './conversation.service.js';

export { messageService, MessageService } from './message.service.js';

export {
  aiService,
  AIService,
  type MessageContext,
  type AIResponse,
} from './ai.service.js';

// Re-export commonly used types
export type { Message } from '@prisma/client';
export { MessageRole } from '@prisma/client';
