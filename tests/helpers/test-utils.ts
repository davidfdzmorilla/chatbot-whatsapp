/**
 * Test Utilities
 * Helper functions and mock factories for tests
 */

import type { User, Conversation, Message } from '@prisma/client';
import { ConversationStatus, MessageRole } from '@prisma/client';

/**
 * Mock Factories
 */

export const createMockUser = (overrides?: Partial<User>): User => ({
  id: 'user-test-id',
  phoneNumber: '+1234567890',
  name: null,
  language: 'es',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockConversation = (overrides?: Partial<Conversation>): Conversation => ({
  id: 'conv-test-id',
  userId: 'user-test-id',
  status: ConversationStatus.ACTIVE,
  contextSummary: null,
  lastMessageAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockMessage = (overrides?: Partial<Message>): Message => ({
  id: 'msg-test-id',
  conversationId: 'conv-test-id',
  role: MessageRole.USER,
  content: 'Test message',
  twilioSid: null,
  metadata: null,
  tokensUsed: null,
  latencyMs: null,
  createdAt: new Date(),
  ...overrides,
});

/**
 * Mock Twilio Webhook Payload
 */
export const createMockTwilioPayload = (overrides?: Record<string, any>) => ({
  From: 'whatsapp:+1234567890',
  To: 'whatsapp:+14155238886',
  Body: 'Test message',
  MessageSid: 'SM1234567890abcdef',
  NumMedia: '0',
  ProfileName: 'Test User',
  ...overrides,
});

/**
 * Mock Anthropic API Response
 */
export const createMockAnthropicResponse = (content: string = 'Mock AI response') => ({
  id: 'msg_mock_' + Date.now(),
  type: 'message' as const,
  role: 'assistant' as const,
  content: [
    {
      type: 'text' as const,
      text: content,
    },
  ],
  model: 'claude-sonnet-4-20250514',
  stop_reason: 'end_turn' as const,
  stop_sequence: null,
  usage: {
    input_tokens: 20,
    output_tokens: Math.ceil(content.length / 4),
  },
});

/**
 * Mock Twilio Message Response
 */
export const createMockTwilioMessage = (overrides?: Record<string, any>) => ({
  sid: 'SM_mock_' + Date.now(),
  accountSid: 'ACtest1234567890',
  from: 'whatsapp:+14155238886',
  to: 'whatsapp:+1234567890',
  body: 'Mock message',
  status: 'sent',
  dateCreated: new Date(),
  dateUpdated: new Date(),
  dateSent: new Date(),
  ...overrides,
});

/**
 * Wait for async operations
 */
export const wait = (ms: number = 100): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Mock Logger (silence logs in tests)
 */
export const createMockLogger = () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
});

/**
 * Create mock Redis client
 */
export const createMockRedis = () => ({
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue('OK'),
  flushdb: jest.fn().mockResolvedValue('OK'),
});

/**
 * Create mock Prisma client
 */
export const createMockPrisma = () => ({
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  conversation: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  message: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $disconnect: jest.fn(),
  $connect: jest.fn(),
});
