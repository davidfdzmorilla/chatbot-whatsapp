/**
 * Type definitions for the chatbot application
 */

/**
 * Message role types following Claude API format
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Conversation status types
 */
export type ConversationStatus = 'active' | 'closed' | 'archived';

/**
 * Message metadata structure
 */
export interface MessageMetadata {
  twilioSid?: string;
  tokensUsed?: number;
  latencyMs?: number;
  [key: string]: unknown;
}

/**
 * AI response structure
 */
export interface AIResponse {
  content: string;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model: string;
  stopReason: string;
}

/**
 * Twilio webhook payload structure
 */
export interface TwilioWebhookPayload {
  From: string; // whatsapp:+1234567890
  To: string; // whatsapp:+14155238886
  Body: string;
  MessageSid: string; // SM...
  NumMedia?: string;
  ProfileName?: string;
  [key: string]: string | undefined;
}

/**
 * Create message DTO
 */
export interface CreateMessageDTO {
  conversationId: string;
  role: MessageRole;
  content: string;
  twilioSid?: string;
  metadata?: MessageMetadata;
}

/**
 * Error response structure
 */
export interface ErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}
