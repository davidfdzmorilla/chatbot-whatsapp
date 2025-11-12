import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Environment variables schema with Zod validation
 * Ensures all required configuration is present and valid
 */
const envSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),

  // Database
  DATABASE_URL: z.string().url().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_URL: z.string().url().min(1, 'REDIS_URL is required'),

  // Twilio
  TWILIO_ACCOUNT_SID: z
    .string()
    .min(34)
    .startsWith('AC', 'TWILIO_ACCOUNT_SID must start with AC'),
  TWILIO_AUTH_TOKEN: z.string().min(32, 'TWILIO_AUTH_TOKEN must be at least 32 characters'),
  TWILIO_PHONE_NUMBER: z
    .string()
    .startsWith('whatsapp:', 'TWILIO_PHONE_NUMBER must start with whatsapp:'),

  // Anthropic (Claude API)
  ANTHROPIC_API_KEY: z
    .string()
    .min(40)
    .startsWith('sk-ant-', 'ANTHROPIC_API_KEY must start with sk-ant-'),

  // Optional
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Privacy & Security
  PRIVACY_HASH_SALT: z
    .string()
    .min(32, 'PRIVACY_HASH_SALT must be at least 32 characters')
    .default('default-salt-CHANGE-IN-PRODUCTION'),

  // CORS Configuration
  // Comma-separated list of allowed origins for browser requests
  // Example: "https://yourdomain.com,https://admin.yourdomain.com"
  // Leave empty in development to allow all localhost
  ALLOWED_ORIGINS: z.string().optional().default(''),

  // Trust Proxy Configuration
  // Set to 'true' when using ngrok or reverse proxy in development
  // Automatically enabled in production
  TRUST_PROXY: z.string().optional().default('false'),
});

/**
 * Parsed and validated environment variables
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Validate and export environment variables
 * Throws an error if validation fails
 */
function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map(
        (err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`
      );

      console.error('❌ Invalid environment variables:');
      errorMessages.forEach((msg: string) => console.error(`  - ${msg}`));

      throw new Error('Environment validation failed');
    }

    throw error;
  }
}

// Export validated environment variables
export const env = validateEnv();

// Log successful validation in development
if (env.NODE_ENV === 'development') {
  console.log('✅ Environment variables validated successfully');
}
