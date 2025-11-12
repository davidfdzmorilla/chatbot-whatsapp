import {
  twilioClient,
  TWILIO_PHONE_NUMBER,
  WHATSAPP_LIMITS,
  formatWhatsAppNumber as formatNumber,
  isValidWhatsAppNumber,
} from '../config/twilio.js';
import { logger } from '../utils/logger.js';

/**
 * Result of sending a WhatsApp message
 */
export interface SendMessageResult {
  messageSid: string;
  status: string;
  to: string;
  from: string;
}

/**
 * Message status information
 */
export interface MessageStatus {
  sid: string;
  status: string;
  errorCode?: number;
  errorMessage?: string;
}

/**
 * Configuration constants for Twilio service
 */
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * Twilio Service
 * Handles all interactions with Twilio WhatsApp API
 */
export class TwilioService {
  /**
   * Send a WhatsApp message
   * Simple interface for sending text messages
   */
  async sendMessage(
    to: string,
    body: string,
    mediaUrl?: string
  ): Promise<SendMessageResult> {
    return this.sendMessageWithRetry(to, body, mediaUrl);
  }

  /**
   * Get the status of a sent message
   */
  async getMessageStatus(messageSid: string): Promise<MessageStatus> {
    try {
      logger.debug('Fetching message status', { messageSid });

      const message = await twilioClient.messages(messageSid).fetch();

      const result: MessageStatus = {
        sid: message.sid,
        status: message.status,
      };

      // Include error information if present
      if (message.errorCode) {
        result.errorCode = message.errorCode;
        result.errorMessage = message.errorMessage || undefined;
      }

      logger.debug('Message status retrieved', {
        messageSid,
        status: message.status,
        errorCode: message.errorCode,
      });

      return result;
    } catch (error) {
      logger.error('Failed to fetch message status', {
        messageSid,
        error: error instanceof Error ? error.message : error,
      });
      throw new Error('Failed to fetch message status');
    }
  }

  /**
   * Format phone number to WhatsApp format (whatsapp:+XXXXXXXXXXX)
   */
  formatWhatsAppNumber(phoneNumber: string): string {
    return formatNumber(phoneNumber);
  }

  /**
   * Send message with retry logic and exponential backoff
   */
  private async sendMessageWithRetry(
    to: string,
    body: string,
    mediaUrl?: string,
    attempt: number = 1
  ): Promise<SendMessageResult> {
    try {
      return await this.sendMessageToTwilio(to, body, mediaUrl);
    } catch (error) {
      // Check if we should retry
      if (attempt < MAX_RETRIES && this.isRetryableError(error)) {
        const delay = this.calculateRetryDelay(attempt);

        logger.warn('Retrying Twilio API call', {
          attempt,
          maxRetries: MAX_RETRIES,
          delayMs: delay,
          error: error instanceof Error ? error.message : error,
        });

        // Wait before retry (exponential backoff)
        await this.sleep(delay);

        // Retry
        return this.sendMessageWithRetry(to, body, mediaUrl, attempt + 1);
      }

      // Max retries exceeded or non-retryable error
      logger.error('Twilio API call failed after retries', {
        attempt,
        error: error instanceof Error ? error.message : error,
      });

      // Convert error to user-friendly message before throwing
      if (this.isTwilioError(error)) {
        throw this.handleTwilioError(error);
      }

      throw error;
    }
  }

  /**
   * Make the actual API call to Twilio
   */
  private async sendMessageToTwilio(
    to: string,
    body: string,
    mediaUrl?: string
  ): Promise<SendMessageResult> {
    const startTime = Date.now();

    try {
      // Format and validate phone number
      const toNumber = formatNumber(to);

      if (!isValidWhatsAppNumber(toNumber)) {
        throw new Error(`Invalid WhatsApp number format: ${toNumber}`);
      }

      // Validate and truncate message if needed
      let messageBody = body;
      if (body.length > WHATSAPP_LIMITS.MAX_BODY_LENGTH) {
        logger.warn('Message body exceeds WhatsApp limit, truncating', {
          length: body.length,
          limit: WHATSAPP_LIMITS.MAX_BODY_LENGTH,
        });
        messageBody = body.substring(0, WHATSAPP_LIMITS.MAX_BODY_LENGTH - 3) + '...';
      }

      // Validate media URL if provided
      if (mediaUrl && !this.isValidMediaUrl(mediaUrl)) {
        throw new Error(`Invalid media URL: ${mediaUrl}`);
      }

      logger.info('Sending WhatsApp message via Twilio', {
        to: toNumber,
        bodyLength: messageBody.length,
        hasMedia: !!mediaUrl,
      });

      // Prepare message data
      const messageData: any = {
        from: TWILIO_PHONE_NUMBER,
        to: toNumber,
        body: messageBody,
      };

      if (mediaUrl) {
        messageData.mediaUrl = [mediaUrl];
      }

      // Send message via Twilio API
      const message = await twilioClient.messages.create(messageData);

      const latencyMs = Date.now() - startTime;

      const result: SendMessageResult = {
        messageSid: message.sid,
        status: message.status,
        to: message.to,
        from: message.from,
      };

      logger.info('WhatsApp message sent successfully', {
        messageSid: result.messageSid,
        status: result.status,
        to: result.to,
        latencyMs,
      });

      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      logger.error('Twilio API error', {
        error: error instanceof Error ? error.message : error,
        to,
        latencyMs,
      });

      // Re-throw original error to preserve retry information
      // handleTwilioError is called at a higher level for user-friendly messages
      throw error;
    }
  }

  /**
   * Check if error is a Twilio API error
   */
  private isTwilioError(error: unknown): error is { status?: number; code?: number; message: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      ('status' in error || 'code' in error) &&
      'message' in error
    );
  }

  /**
   * Handle Twilio API errors
   */
  private handleTwilioError(error: { status?: number; code?: number; message: string }): Error {
    const errorInfo = {
      status: error.status,
      code: error.code,
      message: error.message,
    };

    logger.error('Twilio API error details', errorInfo);

    // Rate limit error (429 or code 20429)
    if (error.status === 429 || error.code === 20429) {
      logger.warn('Twilio rate limit hit, should retry');
      return new Error(
        'Message service is currently experiencing high demand. Please try again in a moment.'
      );
    }

    // Bad request (400)
    if (error.status === 400) {
      logger.error('Invalid request to Twilio API', errorInfo);
      return new Error('Invalid message format');
    }

    // Authentication error (401 or code 20003)
    if (error.status === 401 || error.code === 20003) {
      logger.error('Authentication failed with Twilio API', errorInfo);
      return new Error('Authentication error with messaging service');
    }

    // Insufficient funds (code 21614)
    if (error.code === 21614) {
      logger.error('Twilio account has insufficient funds', errorInfo);
      return new Error('Messaging service account requires funding');
    }

    // Invalid phone number (codes 21211, 21612, 21614)
    if ([21211, 21612, 21614].includes(error.code || 0)) {
      logger.error('Invalid phone number', errorInfo);
      return new Error('Invalid phone number format');
    }

    // Server errors (5xx)
    if (error.status && error.status >= 500) {
      logger.error('Twilio API server error', errorInfo);
      return new Error('Messaging service temporarily unavailable');
    }

    return new Error(`Twilio API error: ${error.message}`);
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (this.isTwilioError(error)) {
      // Retry on rate limits (429) and server errors (5xx)
      if (error.status === 429 || error.code === 20429) {
        return true;
      }
      if (error.status && error.status >= 500) {
        return true;
      }
    }

    // Retry on network errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('econnreset')
      );
    }

    return false;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s
    return INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Validate media URL format
   */
  private isValidMediaUrl(url: string): boolean {
    return url.startsWith('http://') || url.startsWith('https://');
  }

  /**
   * Get a fallback message when Twilio is unavailable
   */
  getFallbackMessage(): string {
    return 'Lo siento, estoy experimentando dificultades para enviar mensajes en este momento. Por favor intenta de nuevo en unos minutos. 🙏';
  }

  /**
   * Validate phone number format
   */
  isValidPhoneNumber(phoneNumber: string): boolean {
    const formatted = formatNumber(phoneNumber);
    return isValidWhatsAppNumber(formatted);
  }
}

// Export singleton instance
export const twilioService = new TwilioService();
