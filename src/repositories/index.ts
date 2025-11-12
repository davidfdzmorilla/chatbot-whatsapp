/**
 * Repository Layer
 * Exports all repository instances for data access
 *
 * Repositories encapsulate all database operations and follow the Repository pattern
 * from Domain-Driven Design (DDD). They provide a clean abstraction over Prisma Client.
 */

// Export repository instances
export { userRepository, UserRepository } from './user.repository.js';
export {
  conversationRepository,
  ConversationRepository,
  type ConversationWithMessages,
} from './conversation.repository.js';
export {
  messageRepository,
  MessageRepository,
  type CreateMessageData,
} from './message.repository.js';

// Re-export commonly used types from Prisma
export type { User, Conversation, Message } from '@prisma/client';
export { MessageRole, ConversationStatus } from '@prisma/client';
