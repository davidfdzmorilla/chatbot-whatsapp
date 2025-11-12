import crypto from 'crypto';
import { env } from '../config/env.js';

/**
 * Privacy utilities for sanitizing sensitive data in logs
 *
 * This module provides functions to:
 * - Hash PII (Personally Identifiable Information) for secure logging
 * - Sanitize objects by removing sensitive fields
 * - Comply with GDPR and privacy regulations
 */

/**
 * Hash salt for privacy (configured via environment variable)
 * IMPORTANT: Change this in production via PRIVACY_HASH_SALT env var
 */
const HASH_SALT = env.PRIVACY_HASH_SALT || 'default-salt-CHANGE-IN-PRODUCTION';

/**
 * Hash phone number for logging (one-way hash)
 *
 * Uses SHA-256 with salt to create irreversible hash.
 * Returns first 16 characters for compact logging.
 *
 * @param phoneNumber - Phone number to hash (with or without whatsapp: prefix)
 * @returns Hashed phone number (16 chars) or 'unknown' if empty
 *
 * @example
 * hashPhoneNumber('whatsapp:+1234567890') // Returns: 'a3f5e8d9c2b1f4e7'
 */
export function hashPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return 'unknown';

  // Remove whatsapp: prefix if present
  const cleanNumber = phoneNumber.replace(/^whatsapp:/i, '');

  return crypto
    .createHash('sha256')
    .update(cleanNumber + HASH_SALT)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Hash any PII data for logging
 *
 * Generic function to hash any personally identifiable information.
 * Used for names, profile names, or any other PII.
 *
 * @param data - PII data to hash
 * @returns Hashed data (16 chars) or 'unknown' if empty
 *
 * @example
 * hashPII('John Doe') // Returns: 'b7d8e1f2c3a4d5e6'
 */
export function hashPII(data: string): string {
  if (!data) return 'unknown';

  return crypto
    .createHash('sha256')
    .update(data + HASH_SALT)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Sanitize object for logging by removing or redacting sensitive fields
 *
 * Recursively scans object and replaces sensitive values with '[REDACTED]'.
 * Prevents accidental logging of passwords, tokens, API keys, etc.
 *
 * @param obj - Object to sanitize (can be nested)
 * @returns Sanitized copy of the object
 *
 * @example
 * const sensitive = { user: 'john', password: '123', nested: { token: 'abc' } };
 * sanitizeForLogging(sensitive);
 * // Returns: { user: 'john', password: '[REDACTED]', nested: { token: '[REDACTED]' } }
 */
export function sanitizeForLogging(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  // List of sensitive field names (case-insensitive)
  const sensitiveKeys = [
    'password',
    'token',
    'apiKey',
    'api_key',
    'secret',
    'auth',
    'authorization',
    'MessageSid',
    'From',
    'To',
    'twilioSignature',
    'x-twilio-signature',
    'bearer',
    'credentials',
    'private',
    'key',
  ];

  // Create shallow copy (array or object)
  const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };

  // Iterate over all keys
  for (const key in sanitized) {
    const lowerKey = key.toLowerCase();

    // Check if key name contains any sensitive keyword
    const isSensitive = sensitiveKeys.some(sk =>
      lowerKey.includes(sk.toLowerCase())
    );

    if (isSensitive) {
      // Redact sensitive value
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      // Recursively sanitize nested objects/arrays
      sanitized[key] = sanitizeForLogging(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * Check if environment is configured with a custom hash salt
 *
 * @returns true if custom salt is configured, false if using default
 */
export function isCustomSaltConfigured(): boolean {
  return HASH_SALT !== 'default-salt-CHANGE-IN-PRODUCTION';
}
