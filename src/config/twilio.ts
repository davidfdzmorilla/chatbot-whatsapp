import twilio from 'twilio';
import { logger } from '../utils/logger.js';
import { env } from './env.js';

/**
 * Twilio WhatsApp API configuration
 * Singleton pattern for messaging service connection
 */

/**
 * Twilio Configuration Constants
 */
export const TWILIO_PHONE_NUMBER = env.TWILIO_PHONE_NUMBER;
export const TWILIO_ACCOUNT_SID = env.TWILIO_ACCOUNT_SID;
export const TWILIO_AUTH_TOKEN = env.TWILIO_AUTH_TOKEN;

/**
 * WhatsApp Message Limits
 */
export const WHATSAPP_LIMITS = {
  MAX_BODY_LENGTH: 1600, // Maximum characters per message
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_DOCUMENT_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_VIDEO_SIZE: 16 * 1024 * 1024, // 16MB
} as const;

/**
 * Twilio client instance
 */
export const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, {
  lazyLoading: true,
  logLevel: env.NODE_ENV === 'development' ? 'debug' : 'info',
});

/**
 * Format phone number to WhatsApp format
 * Ensures number starts with "whatsapp:" prefix
 */
export function formatWhatsAppNumber(phoneNumber: string): string {
  // Remove any existing whatsapp: prefix
  const cleanNumber = phoneNumber.replace(/^whatsapp:/i, '');

  // Ensure number starts with +
  const numberWithPlus = cleanNumber.startsWith('+') ? cleanNumber : `+${cleanNumber}`;

  return `whatsapp:${numberWithPlus}`;
}

/**
 * Validate WhatsApp phone number format
 */
export function isValidWhatsAppNumber(phoneNumber: string): boolean {
  // Must start with whatsapp: and have a valid phone number
  const whatsappRegex = /^whatsapp:\+[1-9]\d{1,14}$/;
  return whatsappRegex.test(phoneNumber);
}

/**
 * Send a WhatsApp message
 */
export async function sendWhatsAppMessage(
  to: string,
  body: string
): Promise<{
  messageSid: string;
  status: string;
}> {
  try {
    // Format and validate phone number
    const toNumber = formatWhatsAppNumber(to);

    if (!isValidWhatsAppNumber(toNumber)) {
      throw new Error(`Invalid WhatsApp number format: ${toNumber}`);
    }

    // Validate message length
    if (body.length > WHATSAPP_LIMITS.MAX_BODY_LENGTH) {
      logger.warn('Message body exceeds WhatsApp limit', {
        length: body.length,
        limit: WHATSAPP_LIMITS.MAX_BODY_LENGTH,
      });
      // Truncate message
      body = body.substring(0, WHATSAPP_LIMITS.MAX_BODY_LENGTH - 3) + '...';
    }

    logger.info('Sending WhatsApp message', {
      to: toNumber,
      bodyLength: body.length,
    });

    const message = await twilioClient.messages.create({
      from: TWILIO_PHONE_NUMBER,
      to: toNumber,
      body,
    });

    logger.info('WhatsApp message sent successfully', {
      messageSid: message.sid,
      status: message.status,
      to: toNumber,
    });

    return {
      messageSid: message.sid,
      status: message.status,
    };
  } catch (error) {
    logger.error('Failed to send WhatsApp message', {
      error: error instanceof Error ? error.message : error,
      to,
    });

    throw new Error(
      `Failed to send WhatsApp message: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Send a WhatsApp message with media attachment
 */
export async function sendWhatsAppMessageWithMedia(
  to: string,
  body: string,
  mediaUrl: string
): Promise<{
  messageSid: string;
  status: string;
}> {
  try {
    // Format and validate phone number
    const toNumber = formatWhatsAppNumber(to);

    if (!isValidWhatsAppNumber(toNumber)) {
      throw new Error(`Invalid WhatsApp number format: ${toNumber}`);
    }

    // Validate message length
    if (body.length > WHATSAPP_LIMITS.MAX_BODY_LENGTH) {
      logger.warn('Message body exceeds WhatsApp limit', {
        length: body.length,
        limit: WHATSAPP_LIMITS.MAX_BODY_LENGTH,
      });
      body = body.substring(0, WHATSAPP_LIMITS.MAX_BODY_LENGTH - 3) + '...';
    }

    // Validate media URL
    if (!mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://')) {
      throw new Error(`Invalid media URL: ${mediaUrl}`);
    }

    logger.info('Sending WhatsApp message with media', {
      to: toNumber,
      bodyLength: body.length,
      mediaUrl,
    });

    const message = await twilioClient.messages.create({
      from: TWILIO_PHONE_NUMBER,
      to: toNumber,
      body,
      mediaUrl: [mediaUrl],
    });

    logger.info('WhatsApp message with media sent successfully', {
      messageSid: message.sid,
      status: message.status,
      to: toNumber,
    });

    return {
      messageSid: message.sid,
      status: message.status,
    };
  } catch (error) {
    logger.error('Failed to send WhatsApp message with media', {
      error: error instanceof Error ? error.message : error,
      to,
      mediaUrl,
    });

    throw new Error(
      `Failed to send WhatsApp message with media: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get message status from Twilio
 */
export async function getMessageStatus(messageSid: string): Promise<string> {
  try {
    const message = await twilioClient.messages(messageSid).fetch();
    return message.status;
  } catch (error) {
    logger.error('Failed to fetch message status', {
      messageSid,
      error: error instanceof Error ? error.message : error,
    });
    throw new Error('Failed to fetch message status');
  }
}

/**
 * Health check for Twilio API connection
 * Validates credentials by fetching account information
 */
export async function checkTwilioHealth(): Promise<{
  status: string;
  accountSid?: string;
  accountStatus?: string;
}> {
  try {
    const startTime = Date.now();

    // Fetch account information to verify credentials
    const account = await twilioClient.api.v2010
      .accounts(TWILIO_ACCOUNT_SID)
      .fetch();

    const latencyMs = Date.now() - startTime;

    logger.debug('Twilio health check successful', {
      accountSid: account.sid,
      accountStatus: account.status,
      latencyMs,
    });

    return {
      status: 'ok',
      accountSid: account.sid,
      accountStatus: account.status,
    };
  } catch (error) {
    logger.error('Twilio health check failed', {
      error: error instanceof Error ? error.message : error,
    });

    return {
      status: 'error',
    };
  }
}

/**
 * Validate Twilio configuration on module load
 * Only in development mode
 */
if (env.NODE_ENV === 'development') {
  twilioClient.api.v2010
    .accounts(TWILIO_ACCOUNT_SID)
    .fetch()
    .then((account) => {
      logger.info('✅ Twilio API connected successfully', {
        accountSid: account.sid,
        status: account.status,
        phoneNumber: TWILIO_PHONE_NUMBER,
      });
    })
    .catch((error: Error) => {
      logger.warn('⚠️  Twilio API connection test failed', {
        error: error.message,
        note: 'This is expected if Twilio credentials are not configured yet',
      });
    });
}

/**
 * Parse incoming webhook data from Twilio
 */
export interface IncomingWhatsAppMessage {
  from: string; // whatsapp:+1234567890
  to: string; // whatsapp:+14155238886
  body: string;
  messageSid: string;
  numMedia: number;
  profileName?: string;
  mediaUrls?: string[];
  mediaContentTypes?: string[];
}

/**
 * Parse Twilio webhook request body
 */
export function parseWebhookBody(body: any): IncomingWhatsAppMessage {
  const numMedia = parseInt(body.NumMedia || '0', 10);

  const mediaUrls: string[] = [];
  const mediaContentTypes: string[] = [];

  // Parse media files if present
  for (let i = 0; i < numMedia; i++) {
    const mediaUrl = body[`MediaUrl${i}`];
    const mediaContentType = body[`MediaContentType${i}`];

    if (mediaUrl) mediaUrls.push(mediaUrl);
    if (mediaContentType) mediaContentTypes.push(mediaContentType);
  }

  return {
    from: body.From,
    to: body.To,
    body: body.Body || '',
    messageSid: body.MessageSid,
    numMedia,
    profileName: body.ProfileName,
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
    mediaContentTypes: mediaContentTypes.length > 0 ? mediaContentTypes : undefined,
  };
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, cleaning up Twilio resources');
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, cleaning up Twilio resources');
});
