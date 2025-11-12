import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { env } from './env.js';

/**
 * Anthropic Claude API configuration
 * Singleton pattern for AI service connection
 */

/**
 * Claude Model and Configuration Constants
 */
export const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
export const MAX_TOKENS = 1024; // Optimal for WhatsApp short responses
export const TEMPERATURE = 0.7; // Balanced creativity and consistency
export const REQUEST_TIMEOUT = 30000; // 30 seconds
export const MAX_RETRIES = 3;

/**
 * Anthropic client instance
 */
export const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
  maxRetries: MAX_RETRIES,
  timeout: REQUEST_TIMEOUT,
});

/**
 * Default system prompt configuration for WhatsApp chatbot
 */
interface SystemPromptConfig {
  language?: string;
  customInstructions?: string;
}

/**
 * Creates a system prompt optimized for WhatsApp conversations
 */
export function createSystemPrompt(config?: SystemPromptConfig): string {
  const language = config?.language || 'es';

  const basePrompt = `Eres un asistente virtual útil y amigable que responde por WhatsApp.

## Características de tus respuestas:

### Formato
- **Concisas y directas**: WhatsApp es para mensajes cortos. Mantén respuestas en 2-4 párrafos máximo.
- **Usa saltos de línea**: Separa ideas para mejor legibilidad en móvil.
- **Emojis ocasionales**: Usa 1-2 emojis relevantes para ser más cercano, no abuses.

### Tono
- **Amigable y conversacional**: Habla de forma natural y cercana.
- **Profesional pero no rígido**: Mantén profesionalismo sin ser formal en exceso.
- **Empático**: Reconoce emociones del usuario cuando sea relevante.

### Idioma
- **${language === 'es' ? 'Español' : 'English'} por defecto**: A menos que el usuario escriba en otro idioma.
- **Adapta al idioma del usuario**: Si escribe en otro idioma, responde en ese idioma.

### Contenido
- **Sé honesto**: Si no sabes algo, admítelo. No inventes información.
- **Mantén contexto**: Recuerda lo que se ha discutido en la conversación.
- **Pregunta si no está claro**: Si el usuario no es específico, pide clarificación.
- **Proporciona valor**: Sé útil y práctico en tus respuestas.

### Restricciones
- **NO envíes mensajes muy largos**: Si necesitas explicar algo extenso, divide en puntos.
- **NO uses formato markdown complejo**: WhatsApp no lo renderiza bien (evita tablas, código con \`\`\`, etc).
- **NO asumas información**: Solo trabaja con lo que el usuario ha compartido.

## Ejemplo de Buena Respuesta:

Usuario: "¿Cómo puedo mejorar mi productividad?"

Tú: "¡Gran pregunta! 💪 Aquí van 3 técnicas efectivas:

1. **Técnica Pomodoro**: Trabaja 25 min concentrado, descansa 5 min. Repite 4 veces.

2. **Prioriza con matriz Eisenhower**: Separa tareas urgentes vs importantes.

3. **Elimina distracciones**: Silencia notificaciones y define horarios específicos para revisar email.

¿Cuál te gustaría probar primero? 🎯"

---

Ahora, responde al usuario de manera útil y amigable.`;

  if (config?.customInstructions) {
    return `${basePrompt}\n\n## Instrucciones Adicionales:\n${config.customInstructions}`;
  }

  return basePrompt;
}

/**
 * Default system prompt for the chatbot
 */
export const DEFAULT_SYSTEM_PROMPT = createSystemPrompt();

/**
 * Health check for Anthropic API connection
 * Makes a minimal API call to verify connectivity
 */
export async function checkAnthropicHealth(): Promise<{
  status: string;
  latencyMs?: number;
  model?: string;
}> {
  try {
    const startTime = Date.now();

    // Make a minimal API call to test connectivity
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 10,
      messages: [
        {
          role: 'user',
          content: 'Hi',
        },
      ],
    });

    const latencyMs = Date.now() - startTime;

    logger.debug('Anthropic health check successful', {
      latencyMs,
      model: response.model,
    });

    return {
      status: 'ok',
      latencyMs,
      model: response.model,
    };
  } catch (error) {
    logger.error('Anthropic health check failed', {
      error: error instanceof Error ? error.message : error,
    });

    return {
      status: 'error',
    };
  }
}

/**
 * Test the Anthropic connection on module load
 * Only in development mode
 */
if (env.NODE_ENV === 'development') {
  anthropic.messages
    .create({
      model: CLAUDE_MODEL,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'test' }],
    })
    .then(() => {
      logger.info('✅ Anthropic API connected successfully', {
        model: CLAUDE_MODEL,
      });
    })
    .catch((error: Error) => {
      logger.warn('⚠️  Anthropic API connection test failed', {
        error: error.message,
        note: 'This is expected if API key is not configured yet',
      });
    });
}

/**
 * Estimate token count for a given text
 * Approximation: ~4 characters per token
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate cost for token usage
 * Based on Claude Sonnet 4 pricing
 */
export function calculateCost(inputTokens: number, outputTokens: number): number {
  // Claude Sonnet 4 pricing (as of 2024)
  const INPUT_COST_PER_1M = 3.0; // $3 per 1M input tokens
  const OUTPUT_COST_PER_1M = 15.0; // $15 per 1M output tokens

  const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_1M;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_1M;

  return inputCost + outputCost;
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, cleaning up Anthropic resources');
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, cleaning up Anthropic resources');
});
