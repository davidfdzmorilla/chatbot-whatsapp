import { z } from 'zod';
import { ConversationStatus } from '@prisma/client';

/**
 * Zod schemas for cached data validation
 * Ensures data integrity when reading from Redis cache
 *
 * These schemas validate cached conversation and message data to prevent:
 * - Cache poisoning attacks
 * - Data corruption issues
 * - Schema evolution problems
 * - Type safety violations
 *
 * If cache data doesn't match the schema, it's invalidated and refetched from DB.
 */

/**
 * Schema for cached message objects
 *
 * Validates individual message structure stored in conversation context cache.
 * Handles date serialization/deserialization automatically.
 */
export const CachedMessageSchema = z.object({
  id: z.string(),
  role: z.string(),
  content: z.string(),
  createdAt: z
    .union([z.string(), z.date()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
  tokensUsed: z.number().nullable(),
  latencyMs: z.number().nullable(),
});

/**
 * Schema for cached conversation with messages
 *
 * Validates complete conversation structure including:
 * - Conversation metadata
 * - Array of messages
 * - All status enums
 * - Date fields with automatic transformation
 */
export const CachedConversationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  status: z.nativeEnum(ConversationStatus),
  contextSummary: z.string().nullable(),
  lastMessageAt: z
    .union([z.string(), z.date()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
  createdAt: z
    .union([z.string(), z.date()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
  updatedAt: z
    .union([z.string(), z.date()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
  messages: z.array(CachedMessageSchema),
});

/**
 * TypeScript types inferred from Zod schemas
 * Use these for type safety when working with cached data
 */
export type CachedConversation = z.infer<typeof CachedConversationSchema>;
export type CachedMessage = z.infer<typeof CachedMessageSchema>;
