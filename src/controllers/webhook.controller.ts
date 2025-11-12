import type { Request, Response } from 'express';
import MessagingResponse from 'twilio/lib/twiml/MessagingResponse';
import {
  conversationService,
  messageService,
  aiService,
} from '../services/index.js';
import { logger } from '../utils/logger.js';
import { hashPhoneNumber, hashPII } from '../utils/privacy.js';

/**
 * Webhook Controller
 * Handles incoming WhatsApp messages from Twilio webhooks
 *
 * Orchestrates the complete message processing flow:
 * 1. Receive webhook from Twilio
 * 2. Get or create conversation
 * 3. Save user message
 * 4. Get conversation context
 * 5. Generate AI response
 * 6. Save assistant response
 * 7. Respond with TwiML
 */
export class WebhookController {
  /**
   * Handle incoming WhatsApp message webhook from Twilio
   */
  async handleIncoming(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();

    try {
      // Step 1: Extract webhook data from Twilio
      const {
        From,
        Body,
        MessageSid,
        NumMedia,
        ProfileName,
      } = req.body;

      logger.info('📱 Incoming WhatsApp message', {
        fromHash: hashPhoneNumber(From),
        messageSid: MessageSid,
        bodyLength: Body?.length || 0,
        numMedia: NumMedia || '0',
        profileNameHash: ProfileName ? hashPII(ProfileName) : undefined,
      });

      // Step 2: Validate required fields
      if (!From || !Body) {
        logger.warn('⚠️  Invalid webhook payload: missing From or Body', {
          hasFrom: !!From,
          hasBody: !!Body,
          body: req.body,
        });
        return this.respondWithError(
          res,
          'Lo siento, no pude procesar tu mensaje. Por favor intenta de nuevo.'
        );
      }

      // Step 3: Extract phone number (remove "whatsapp:" prefix)
      const phoneNumber = From.replace(/^whatsapp:/i, '');

      logger.debug('📞 Extracted phone number', {
        original: From,
        cleaned: phoneNumber,
      });

      // Step 4: Get or create conversation for this user
      logger.debug('🔍 Getting or creating conversation');
      const { conversation, user } = await conversationService.getOrCreateConversation(
        phoneNumber
      );

      logger.info('💬 Conversation ready', {
        conversationId: conversation.id,
        userId: user.id,
        isNewConversation: conversation.createdAt.getTime() === conversation.updatedAt.getTime(),
      });

      // Step 5: Save user message to database
      logger.debug('💾 Saving user message');
      await messageService.saveUserMessage(
        conversation.id,
        Body,
        MessageSid
      );

      logger.info('✅ User message saved', {
        conversationId: conversation.id,
        twilioSid: MessageSid,
      });

      // Step 6: Get recent conversation context for AI
      logger.debug('📚 Retrieving conversation context');
      const context = await messageService.getRecentContext(conversation.id);

      logger.debug('📝 Context retrieved', {
        conversationId: conversation.id,
        contextSize: context.length,
      });

      // Step 7: Generate AI response with metrics
      logger.debug('🤖 Generating AI response');
      const aiResponse = await aiService.generateResponseWithMetrics(context);

      logger.info('✨ AI response generated', {
        conversationId: conversation.id,
        tokensUsed: aiResponse.tokensUsed,
        inputTokens: aiResponse.inputTokens,
        outputTokens: aiResponse.outputTokens,
        latencyMs: aiResponse.latencyMs,
        cost: aiResponse.cost,
        stopReason: aiResponse.stopReason,
      });

      // Step 8: Save assistant response to database
      logger.debug('💾 Saving assistant message');
      await messageService.saveAssistantMessage(
        conversation.id,
        aiResponse.content,
        aiResponse.tokensUsed,
        aiResponse.latencyMs
      );

      logger.info('✅ Assistant message saved', {
        conversationId: conversation.id,
      });

      // Step 9: Respond to Twilio with TwiML
      const totalLatencyMs = Date.now() - startTime;

      logger.info('🎉 Message processing completed successfully', {
        conversationId: conversation.id,
        userId: user.id,
        totalLatencyMs,
        aiLatencyMs: aiResponse.latencyMs,
        tokensUsed: aiResponse.tokensUsed,
        cost: aiResponse.cost,
      });

      this.respondWithTwiML(res, aiResponse.content);
    } catch (error) {
      const totalLatencyMs = Date.now() - startTime;

      logger.error('❌ Error processing webhook', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        totalLatencyMs,
        body: req.body,
      });

      // Respond with friendly error message (don't expose internal details)
      this.respondWithError(
        res,
        'Lo siento, estoy experimentando dificultades técnicas en este momento. Por favor intenta de nuevo en unos minutos. 🙏'
      );
    }
  }

  /**
   * Respond with TwiML success message
   */
  private respondWithTwiML(res: Response, message: string): void {
    const twiml = new MessagingResponse();
    twiml.message(message);

    res.type('text/xml');
    res.send(twiml.toString());

    logger.debug('📤 TwiML response sent', {
      messageLength: message.length,
    });
  }

  /**
   * Respond with TwiML error message
   */
  private respondWithError(res: Response, errorMessage: string): void {
    const twiml = new MessagingResponse();
    twiml.message(errorMessage);

    res.type('text/xml');
    res.send(twiml.toString());

    logger.debug('📤 TwiML error response sent', {
      errorMessage,
    });
  }
}

// Export singleton instance
export const webhookController = new WebhookController();
