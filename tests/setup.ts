/**
 * Jest Global Setup
 * Configures test environment, mocks, and test utilities
 */

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/chatbot_test';
process.env.REDIS_URL = 'redis://localhost:6379/15';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-mock-1234567890abcdefghijklmnopqrstuvwxyz';  // >= 40 chars
process.env.TWILIO_ACCOUNT_SID = 'AC1234567890abcdefghijklmnopqrstuvwx'; // >= 34 chars
process.env.TWILIO_AUTH_TOKEN = 'test-auth-token-mock-abcdefghijklmnopqrstuvwxyz123456'; // >= 32 chars
process.env.TWILIO_PHONE_NUMBER = 'whatsapp:+14155238886';
process.env.LOG_LEVEL = 'error'; // Reduce noise in tests
process.env.PRIVACY_HASH_SALT = 'test-salt-for-hashing-abcdefghijklmnopqrstuvwxyz123456'; // >= 32 chars

// Suppress console logs during tests (except errors)
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging test failures
};

// Global test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  // Give time for async operations to complete
  await new Promise((resolve) => setTimeout(resolve, 500));
});
