import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import {
  anthropic,
  CLAUDE_MODEL,
  MAX_TOKENS,
  TEMPERATURE,
  DEFAULT_SYSTEM_PROMPT,
  estimateTokens as estimateTokensUtil,
  calculateCost as calculateCostUtil,
} from '../config/anthropic.js';
import { logger } from '../utils/logger.js';

/**
 * Message context for AI processing
 */
export interface MessageContext {
  role: string;
  content: string;
}

/**
 * AI response with complete metrics
 */
export interface AIResponse {
  content: string;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model: string;
  stopReason: string;
  cost?: number;
}

/**
 * Configuration constants for AI service
 */
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * AI Service
 * Handles all interactions with the LLM API
 */
export class AIService {
  /**
   * Generate a response from the LLM
   * Simple interface for getting a response
   */
  async generateResponse(
    messages: MessageContext[],
    systemPrompt?: string
  ): Promise<string> {
    try {
      const response = await this.generateResponseWithMetrics(messages, systemPrompt);
      return response.content;
    } catch (error) {
      logger.error('Error generating response', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Generate a response with complete metrics
   * Returns full response object with token usage, latency, and cost
   */
  async generateResponseWithMetrics(
    messages: MessageContext[],
    systemPrompt?: string
  ): Promise<AIResponse> {
    return this.generateWithRetry(messages, systemPrompt);
  }

  /**
   * Generate response with retry logic and exponential backoff
   */
  private async generateWithRetry(
    messages: MessageContext[],
    systemPrompt?: string,
    attempt: number = 1
  ): Promise<AIResponse> {
    try {
      return await this.callLLMAPI(messages, systemPrompt);
    } catch (error) {
      // Check if we should retry
      if (attempt < MAX_RETRIES && this.isRetryableError(error)) {
        const delay = this.calculateRetryDelay(attempt);

        logger.warn('Retrying LLM API call', {
          attempt,
          maxRetries: MAX_RETRIES,
          delayMs: delay,
          error: error instanceof Error ? error.message : error,
        });

        // Wait before retry (exponential backoff)
        await this.sleep(delay);

        // Retry
        return this.generateWithRetry(messages, systemPrompt, attempt + 1);
      }

      // Max retries exceeded or non-retryable error
      logger.error('LLM API call failed after retries', {
        attempt,
        error: error instanceof Error ? error.message : error,
      });

      throw error;
    }
  }

  /**
   * Make the actual API call to the LLM
   */
  private async callLLMAPI(
    messages: MessageContext[],
    systemPrompt?: string
  ): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      // Convert messages to Anthropic format
      const anthropicMessages = this.convertToAnthropicMessages(messages);

      logger.info('Calling LLM API', {
        messageCount: anthropicMessages.length,
        model: CLAUDE_MODEL,
        maxTokens: MAX_TOKENS,
      });

      // Call Anthropic API
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: systemPrompt || DEFAULT_SYSTEM_PROMPT,
        messages: anthropicMessages,
      });

      const latencyMs = Date.now() - startTime;

      // Extract text content from response
      const content = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('\n');

      // Calculate metrics
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const tokensUsed = inputTokens + outputTokens;
      const cost = this.calculateCost(inputTokens, outputTokens);

      const result: AIResponse = {
        content,
        tokensUsed,
        inputTokens,
        outputTokens,
        latencyMs,
        model: response.model,
        stopReason: response.stop_reason || 'unknown',
        cost,
      };

      logger.info('LLM API response received', {
        tokensUsed: result.tokensUsed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
        stopReason: result.stopReason,
        cost: result.cost,
      });

      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      logger.error('LLM API error', {
        error: error instanceof Error ? error.message : error,
        latencyMs,
      });

      // Handle specific API errors
      if (error instanceof Anthropic.APIError) {
        throw this.handleAPIError(error);
      }

      throw new Error('Failed to generate response from LLM');
    }
  }

  /**
   * Convert message context to Anthropic MessageParam format
   */
  private convertToAnthropicMessages(messages: MessageContext[]): MessageParam[] {
    return messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
  }

  /**
   * Handle Anthropic API errors
   */
  private handleAPIError(error: InstanceType<typeof Anthropic.APIError>): Error {
    const errorInfo = {
      status: error.status,
      message: error.message,
      type: (error.error as any)?.type,
    };

    logger.error('Anthropic API error details', errorInfo);

    // Rate limit error (429)
    if (error.status === 429) {
      logger.warn('Rate limit hit, should retry');
      return new Error(
        'Service is currently experiencing high demand. Please try again in a moment.'
      );
    }

    // Bad request (400)
    if (error.status === 400) {
      logger.error('Invalid request to LLM API', errorInfo);
      return new Error('Invalid request format');
    }

    // Authentication error (401)
    if (error.status === 401) {
      logger.error('Authentication failed with LLM API', errorInfo);
      return new Error('Authentication error with LLM service');
    }

    // Server errors (5xx)
    if (error.status && error.status >= 500) {
      logger.error('LLM API server error', errorInfo);
      return new Error('LLM service temporarily unavailable');
    }

    return new Error(`LLM API error: ${error.message}`);
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Anthropic.APIError) {
      // Retry on rate limits (429) and server errors (5xx)
      return error.status === 429 || (error.status !== undefined && error.status >= 500);
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
   * Estimate tokens for a given text
   */
  estimateTokens(text: string): number {
    return estimateTokensUtil(text);
  }

  /**
   * Calculate cost of API call
   */
  calculateCost(inputTokens: number, outputTokens: number): number {
    return calculateCostUtil(inputTokens, outputTokens);
  }

  /**
   * Get a fallback response when LLM is unavailable
   */
  getFallbackResponse(): string {
    return 'Lo siento, estoy experimentando dificultades técnicas en este momento. Por favor intenta de nuevo en unos minutos. 🙏';
  }

  /**
   * Validate message context before sending to API
   */
  validateMessages(messages: MessageContext[]): { valid: boolean; error?: string } {
    if (!messages || messages.length === 0) {
      return { valid: false, error: 'Messages array is empty' };
    }

    // Check for valid roles
    const validRoles = ['user', 'assistant', 'system'];
    for (const msg of messages) {
      if (!validRoles.includes(msg.role)) {
        return { valid: false, error: `Invalid role: ${msg.role}` };
      }

      if (!msg.content || msg.content.trim().length === 0) {
        return { valid: false, error: 'Message content cannot be empty' };
      }
    }

    // Ensure messages alternate between user and assistant
    // Last message should be from user
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return { valid: false, error: 'Last message must be from user' };
    }

    return { valid: true };
  }

  /**
   * Truncate message history if needed to fit within token limits
   */
  truncateMessages(messages: MessageContext[], maxTokens: number = 8000): MessageContext[] {
    let totalTokens = 0;
    const result: MessageContext[] = [];

    // Process from most recent to oldest
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!msg) continue;

      const tokens = this.estimateTokens(msg.content);

      if (totalTokens + tokens > maxTokens) {
        logger.warn('Truncating message history', {
          originalCount: messages.length,
          truncatedCount: result.length,
          totalTokens,
        });
        break;
      }

      result.unshift(msg);
      totalTokens += tokens;
    }

    return result;
  }
}

// Export singleton instance
export const aiService = new AIService();
