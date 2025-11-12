# 🚀 Plan Técnico Completo: Chatbot WhatsApp con IA

## 📋 Stack Tecnológico (Recomendado)

### Backend
- **Runtime**: Node.js 20+ (LTS)
- **Framework**: Express.js
- **Lenguaje**: TypeScript (type safety + mejor DX)
- **IA**: Claude Sonnet 4 (Anthropic API)
- **WhatsApp**: Twilio API

### Base de Datos
- **Principal**: PostgreSQL 15+
  - Conversaciones
  - Usuarios
  - Mensajes
  - Analytics
- **Cache/Sessions**: Redis
  - Contexto de conversaciones
  - Rate limiting
  - Sessions temporales

### Infraestructura
- **Hosting**: Railway / Render / DigitalOcean
- **Logs**: Winston + Better Stack
- **Monitoring**: Sentry (errores)
- **Environment**: Docker + Docker Compose

### Desarrollo
- **Package Manager**: pnpm
- **Linting**: ESLint + Prettier
- **Testing**: Jest + Supertest
- **Git**: Conventional Commits

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────┐
│                   USUARIO WHATSAPP                  │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                  TWILIO WHATSAPP API                │
│            (Recibe/Envía mensajes)                  │
└──────────────────────┬──────────────────────────────┘
                       │ Webhook HTTP POST
                       ▼
┌─────────────────────────────────────────────────────┐
│              API GATEWAY / LOAD BALANCER            │
│                    (Nginx/Caddy)                    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              BACKEND SERVICE (Express)              │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │        Controllers Layer                     │  │
│  │  - WebhookController                         │  │
│  │  - HealthController                          │  │
│  └──────────────────┬───────────────────────────┘  │
│                     │                               │
│  ┌──────────────────▼───────────────────────────┐  │
│  │        Services Layer                        │  │
│  │  - MessageService                            │  │
│  │  - ConversationService                       │  │
│  │  - AIService (Claude)                        │  │
│  │  - TwilioService                             │  │
│  └──────────────────┬───────────────────────────┘  │
│                     │                               │
│  ┌──────────────────▼───────────────────────────┐  │
│  │        Repository Layer                      │  │
│  │  - ConversationRepository                    │  │
│  │  - MessageRepository                         │  │
│  │  - UserRepository                            │  │
│  └──────────────────┬───────────────────────────┘  │
└────────────────────┬┴───────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │PostgreSQL│ │  Redis   │ │ Claude   │
  │          │ │  Cache   │ │   API    │
  └──────────┘ └──────────┘ └──────────┘
```

---

## 📁 Estructura de Carpetas

```
whatsapp-ai-bot/
├── src/
│   ├── config/
│   │   ├── database.ts          # Config PostgreSQL
│   │   ├── redis.ts             # Config Redis
│   │   ├── twilio.ts            # Config Twilio
│   │   ├── anthropic.ts         # Config Claude
│   │   └── env.ts               # Variables de entorno
│   │
│   ├── controllers/
│   │   ├── webhook.controller.ts    # Recibe mensajes de Twilio
│   │   └── health.controller.ts     # Health checks
│   │
│   ├── services/
│   │   ├── ai.service.ts            # Lógica de Claude
│   │   ├── conversation.service.ts  # Gestión de conversaciones
│   │   ├── message.service.ts       # Procesamiento de mensajes
│   │   └── twilio.service.ts        # Envío de mensajes
│   │
│   ├── repositories/
│   │   ├── conversation.repository.ts
│   │   ├── message.repository.ts
│   │   └── user.repository.ts
│   │
│   ├── models/
│   │   ├── Conversation.ts
│   │   ├── Message.ts
│   │   └── User.ts
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts       # Validar webhooks Twilio
│   │   ├── rateLimit.middleware.ts  # Rate limiting
│   │   └── error.middleware.ts      # Error handling
│   │
│   ├── utils/
│   │   ├── logger.ts                # Winston logger
│   │   ├── validators.ts            # Validaciones
│   │   └── helpers.ts               # Funciones auxiliares
│   │
│   ├── types/
│   │   └── index.ts                 # TypeScript types
│   │
│   ├── routes/
│   │   └── index.ts                 # Definición de rutas
│   │
│   ├── app.ts                       # Express app setup
│   └── server.ts                    # Entry point
│
├── prisma/
│   ├── schema.prisma                # Schema de base de datos
│   └── migrations/                  # Migraciones
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

---

## 🗄️ Schema de Base de Datos

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String         @id @default(uuid())
  phoneNumber   String         @unique
  name          String?
  language      String         @default("es")
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  conversations Conversation[]
  
  @@map("users")
}

model Conversation {
  id              String    @id @default(uuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  status          String    @default("active") // active, closed, archived
  contextSummary  String?   @db.Text
  lastMessageAt   DateTime  @default(now())
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  messages        Message[]
  
  @@index([userId])
  @@index([lastMessageAt])
  @@map("conversations")
}

model Message {
  id             String       @id @default(uuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  role           String       // user, assistant, system
  content        String       @db.Text
  twilioSid      String?      @unique
  metadata       Json?        // Datos extra (media, location, etc)
  tokensUsed     Int?
  latencyMs      Int?
  createdAt      DateTime     @default(now())
  
  @@index([conversationId])
  @@index([createdAt])
  @@map("messages")
}

model Analytics {
  id                String   @id @default(uuid())
  date              DateTime @db.Date
  totalMessages     Int      @default(0)
  totalConversations Int     @default(0)
  totalUsers        Int      @default(0)
  totalTokens       Int      @default(0)
  avgLatencyMs      Float?
  createdAt         DateTime @default(now())
  
  @@unique([date])
  @@map("analytics")
}
```

---

## 💻 Código Base Principal

### 1. Configuración inicial

#### src/config/env.ts
```typescript
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  
  // Database
  DATABASE_URL: z.string(),
  
  // Redis
  REDIS_URL: z.string(),
  
  // Twilio
  TWILIO_ACCOUNT_SID: z.string(),
  TWILIO_AUTH_TOKEN: z.string(),
  TWILIO_PHONE_NUMBER: z.string(),
  
  // Anthropic
  ANTHROPIC_API_KEY: z.string(),
  
  // Security
  WEBHOOK_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

### 2. Configuración de Servicios

#### src/config/anthropic.ts
```typescript
import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';

export const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

export const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
export const MAX_TOKENS = 1024;
```

#### src/config/twilio.ts
```typescript
import twilio from 'twilio';
import { env } from './env';

export const twilioClient = twilio(
  env.TWILIO_ACCOUNT_SID,
  env.TWILIO_AUTH_TOKEN
);
```

#### src/config/redis.ts
```typescript
import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    return Math.min(times * 50, 2000);
  },
});
```

#### src/config/database.ts
```typescript
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
});
```

### 3. AI Service (Core)

#### src/services/ai.service.ts
```typescript
import { anthropic, CLAUDE_MODEL, MAX_TOKENS } from '../config/anthropic';
import { logger } from '../utils/logger';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

interface AIResponse {
  content: string;
  tokensUsed: number;
  latencyMs: number;
}

export class AIService {
  
  async generateResponse(
    messages: MessageParam[],
    systemPrompt?: string
  ): Promise<AIResponse> {
    const startTime = Date.now();
    
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt || this.getDefaultSystemPrompt(),
        messages,
      });
      
      const latencyMs = Date.now() - startTime;
      const content = response.content[0].type === 'text' 
        ? response.content[0].text 
        : '';
      
      logger.info('AI response generated', {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        latencyMs,
      });
      
      return {
        content,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        latencyMs,
      };
      
    } catch (error) {
      logger.error('Error generating AI response', { error });
      throw new Error('Failed to generate AI response');
    }
  }
  
  private getDefaultSystemPrompt(): string {
    return `Eres un asistente virtual útil y amigable por WhatsApp.

Características de tus respuestas:
- Concisas y directas (WhatsApp es para mensajes cortos)
- Amigables y conversacionales
- En español (a menos que el usuario hable otro idioma)
- Usa emojis ocasionalmente para ser más cercano
- Si no sabes algo, admítelo honestamente
- Mantén el contexto de la conversación

Recuerda: Estás en WhatsApp, no escribas respuestas muy largas.`;
  }
}
```

### 4. Conversation Service

#### src/services/conversation.service.ts
```typescript
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

export class ConversationService {
  
  private readonly CONTEXT_KEY_PREFIX = 'conversation:';
  private readonly MAX_CONTEXT_MESSAGES = 10;
  private readonly CONTEXT_TTL = 3600; // 1 hora
  
  async getOrCreateConversation(phoneNumber: string): Promise<string> {
    let user = await prisma.user.findUnique({
      where: { phoneNumber },
    });
    
    if (!user) {
      user = await prisma.user.create({
        data: { phoneNumber },
      });
    }
    
    let conversation = await prisma.conversation.findFirst({
      where: {
        userId: user.id,
        status: 'active',
      },
      orderBy: {
        lastMessageAt: 'desc',
      },
    });
    
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          userId: user.id,
        },
      });
    }
    
    return conversation.id;
  }
  
  async addMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: any
  ): Promise<void> {
    await prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        metadata,
      },
    });
    
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
    
    // Actualizar contexto en Redis
    await this.updateContext(conversationId, role, content);
  }
  
  async getContext(conversationId: string): Promise<MessageParam[]> {
    const cacheKey = `${this.CONTEXT_KEY_PREFIX}${conversationId}`;
    
    // Intentar obtener de cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Si no está en cache, obtener de DB
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: this.MAX_CONTEXT_MESSAGES,
    });
    
    const context: MessageParam[] = messages
      .reverse()
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
    
    // Guardar en cache
    await redis.setex(cacheKey, this.CONTEXT_TTL, JSON.stringify(context));
    
    return context;
  }
  
  private async updateContext(
    conversationId: string,
    role: string,
    content: string
  ): Promise<void> {
    const cacheKey = `${this.CONTEXT_KEY_PREFIX}${conversationId}`;
    const context = await this.getContext(conversationId);
    
    context.push({
      role: role as 'user' | 'assistant',
      content,
    });
    
    // Mantener solo los últimos N mensajes
    const trimmedContext = context.slice(-this.MAX_CONTEXT_MESSAGES);
    
    await redis.setex(
      cacheKey,
      this.CONTEXT_TTL,
      JSON.stringify(trimmedContext)
    );
  }
}
```

### 5. Webhook Controller

#### src/controllers/webhook.controller.ts
```typescript
import { Request, Response } from 'express';
import { MessagingResponse } from 'twilio/lib/twiml/MessagingResponse';
import { ConversationService } from '../services/conversation.service';
import { AIService } from '../services/ai.service';
import { logger } from '../utils/logger';

export class WebhookController {
  
  private conversationService = new ConversationService();
  private aiService = new AIService();
  
  async handleIncoming(req: Request, res: Response): Promise<void> {
    try {
      const { From, Body, MessageSid } = req.body;
      
      logger.info('Incoming message', { from: From, body: Body });
      
      // Obtener o crear conversación
      const conversationId = await this.conversationService.getOrCreateConversation(From);
      
      // Guardar mensaje del usuario
      await this.conversationService.addMessage(
        conversationId,
        'user',
        Body,
        { twilioSid: MessageSid }
      );
      
      // Obtener contexto de la conversación
      const context = await this.conversationService.getContext(conversationId);
      
      // Generar respuesta con IA
      const aiResponse = await this.aiService.generateResponse(context);
      
      // Guardar respuesta del asistente
      await this.conversationService.addMessage(
        conversationId,
        'assistant',
        aiResponse.content,
        {
          tokensUsed: aiResponse.tokensUsed,
          latencyMs: aiResponse.latencyMs,
        }
      );
      
      // Responder por WhatsApp
      const twiml = new MessagingResponse();
      twiml.message(aiResponse.content);
      
      res.type('text/xml').send(twiml.toString());
      
    } catch (error) {
      logger.error('Error handling webhook', { error });
      
      const twiml = new MessagingResponse();
      twiml.message('Lo siento, hubo un error. Por favor intenta de nuevo.');
      
      res.type('text/xml').send(twiml.toString());
    }
  }
}
```

### 6. Middleware

#### src/middleware/rateLimit.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';

const RATE_LIMIT = 10; // mensajes por minuto
const WINDOW = 60; // segundos

export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const phoneNumber = req.body.From;
  
  if (!phoneNumber) {
    return next();
  }
  
  const key = `ratelimit:${phoneNumber}`;
  const current = await redis.incr(key);
  
  if (current === 1) {
    await redis.expire(key, WINDOW);
  }
  
  if (current > RATE_LIMIT) {
    const twiml = new (require('twilio').twiml.MessagingResponse)();
    twiml.message('Has enviado demasiados mensajes. Por favor espera un momento.');
    res.type('text/xml').send(twiml.toString());
    return;
  }
  
  next();
}
```

#### src/middleware/error.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function errorMiddleware(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
  });
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
}
```

### 7. Utils

#### src/utils/logger.ts
```typescript
import winston from 'winston';
import { env } from '../config/env';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});
```

### 8. Server Setup

#### src/app.ts
```typescript
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { WebhookController } from './controllers/webhook.controller';
import { errorMiddleware } from './middleware/error.middleware';
import { rateLimitMiddleware } from './middleware/rateLimit.middleware';

const app = express();

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Routes
const webhookController = new WebhookController();

app.post('/webhook/whatsapp', 
  rateLimitMiddleware,
  (req, res) => webhookController.handleIncoming(req, res)
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorMiddleware);

export default app;
```

#### src/server.ts
```typescript
import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './config/database';
import { redis } from './config/redis';

const PORT = env.PORT;

async function bootstrap() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('✅ Database connected');
    
    // Test Redis connection
    await redis.ping();
    logger.info('✅ Redis connected');
    
    // Start server
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`Environment: ${env.NODE_ENV}`);
    });
    
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

bootstrap();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing server...');
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});
```

---

## 📦 Archivos de Configuración

### package.json
```json
{
  "name": "whatsapp-ai-bot",
  "version": "1.0.0",
  "description": "WhatsApp AI Chatbot with Claude",
  "main": "dist/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio",
    "prisma:deploy": "prisma migrate deploy",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix",
    "format": "prettier --write \"src/**/*.ts\""
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0",
    "@prisma/client": "^5.22.0",
    "express": "^4.19.2",
    "twilio": "^5.3.5",
    "ioredis": "^5.4.1",
    "winston": "^3.15.0",
    "helmet": "^8.0.0",
    "cors": "^2.8.5",
    "zod": "^3.23.8",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.9.0",
    "@types/cors": "^2.8.17",
    "typescript": "^5.6.3",
    "tsx": "^4.19.2",
    "prisma": "^5.22.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.14",
    "ts-jest": "^29.2.5",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2",
    "eslint": "^9.14.0",
    "@typescript-eslint/eslint-plugin": "^8.13.0",
    "@typescript-eslint/parser": "^8.13.0",
    "prettier": "^3.3.3"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### .eslintrc.json
```json
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-function-return-type": "off",
    "no-console": "warn"
  }
}
```

### .prettierrc
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

### .env.example
```env
# Environment
NODE_ENV=development
PORT=3001

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/whatsapp_bot?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# Twilio
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=whatsapp:+14155238886

# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# Security (opcional)
WEBHOOK_SECRET=your_webhook_secret_here
```

### .gitignore
```
# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/
*.log

# Production
dist/
build/

# Misc
.DS_Store
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Database
*.db
*.sqlite

# Prisma
prisma/.env
```

---

## 🐳 Docker Setup

### docker/Dockerfile
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma Client
RUN npm run prisma:generate

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["npm", "start"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: docker/Dockerfile
    container_name: whatsapp-bot
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/whatsapp_bot
      - REDIS_URL=redis://redis:6379
      - TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
      - TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
      - TWILIO_PHONE_NUMBER=${TWILIO_PHONE_NUMBER}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - bot-network

  postgres:
    image: postgres:15-alpine
    container_name: whatsapp-bot-db
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=whatsapp_bot
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - bot-network

  redis:
    image: redis:7-alpine
    container_name: whatsapp-bot-redis
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - bot-network

volumes:
  postgres_data:
  redis_data:

networks:
  bot-network:
    driver: bridge
```

---

## 🚀 Guía de Instalación y Deployment

### Instalación Local

```bash
# 1. Clonar o crear el proyecto
mkdir whatsapp-ai-bot
cd whatsapp-ai-bot

# 2. Inicializar proyecto
pnpm init

# 3. Copiar archivos de configuración
# (copiar todos los archivos mencionados arriba)

# 4. Instalar dependencias
pnpm install

# 5. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 6. Iniciar base de datos (con Docker)
docker-compose up -d postgres redis

# 7. Ejecutar migraciones de Prisma
pnpm prisma:migrate

# 8. Generar Prisma Client
pnpm prisma:generate

# 9. Iniciar en modo desarrollo
pnpm dev
```

### Setup de Twilio Sandbox

```bash
# 1. Crear cuenta en Twilio (https://www.twilio.com/try-twilio)

# 2. Ir a Console → Messaging → Try it out → Send a WhatsApp message

# 3. Unirse al sandbox enviando mensaje:
#    "join <tu-palabra-clave>" al número de Twilio

# 4. Exponer tu localhost con ngrok:
ngrok http 3001

# 5. Copiar la URL de ngrok (ej: https://abc123.ngrok.io)

# 6. En Twilio Console → Messaging → Settings → WhatsApp Sandbox
#    Configurar webhook:
#    WHEN A MESSAGE COMES IN: https://abc123.ngrok.io/webhook/whatsapp

# 7. Enviar mensaje de prueba por WhatsApp
```

### Deployment a Producción

#### Opción 1: Railway

```bash
# 1. Instalar Railway CLI
npm i -g @railway/cli

# 2. Login
railway login

# 3. Crear proyecto
railway init

# 4. Agregar PostgreSQL
railway add postgresql

# 5. Agregar Redis
railway add redis

# 6. Configurar variables de entorno en Railway Dashboard

# 7. Deploy
railway up
```

#### Opción 2: Render

```bash
# 1. Conectar repositorio de GitHub a Render

# 2. Crear Web Service:
#    - Build Command: npm run build && npm run prisma:deploy
#    - Start Command: npm start

# 3. Agregar PostgreSQL desde Render Dashboard

# 4. Agregar Redis desde Render Dashboard

# 5. Configurar variables de entorno

# 6. Deploy automático con cada push a main
```

#### Opción 3: Docker en VPS

```bash
# 1. SSH a tu servidor
ssh user@your-server.com

# 2. Clonar repositorio
git clone https://github.com/tu-usuario/whatsapp-bot.git
cd whatsapp-bot

# 3. Crear archivo .env con credenciales de producción

# 4. Iniciar con Docker Compose
docker-compose up -d

# 5. Ver logs
docker-compose logs -f app

# 6. Configurar Nginx como reverse proxy (opcional)
```

---

## 🚦 Plan de Implementación por Fases

### Fase 1: Setup Inicial (Semana 1)
**Objetivo**: Tener el entorno de desarrollo listo y funcionando

- [ ] Crear estructura de carpetas del proyecto
- [ ] Configurar TypeScript, ESLint, Prettier
- [ ] Instalar todas las dependencias
- [ ] Configurar Twilio Sandbox y obtener credenciales
- [ ] Obtener API key de Claude (Anthropic)
- [ ] Setup PostgreSQL local (Docker)
- [ ] Setup Redis local (Docker)
- [ ] Configurar Prisma y crear schema inicial
- [ ] Ejecutar primera migración
- [ ] Crear archivo .env con todas las variables

**Entregable**: Proyecto base que compila y conecta a DB

### Fase 2: Core Functionality (Semana 2)
**Objetivo**: Bot básico funcional que puede responder mensajes

- [ ] Implementar webhook de Twilio (WebhookController)
- [ ] Integrar Claude API (AIService)
- [ ] Sistema de gestión de conversaciones (ConversationService)
- [ ] Persistencia de mensajes en PostgreSQL
- [ ] Sistema de contexto con Redis
- [ ] Logger con Winston
- [ ] Health check endpoint
- [ ] Probar envío/recepción de mensajes básicos

**Entregable**: Bot funcional que responde mensajes simples

### Fase 3: Mejoras y Features (Semana 3)
**Objetivo**: Agregar funcionalidades avanzadas

- [ ] Rate limiting por usuario
- [ ] Manejo robusto de errores
- [ ] Comandos especiales (/reset, /help, /status)
- [ ] Detección de idioma automática
- [ ] Sistema de analytics básico
- [ ] Métricas de uso (tokens, latencia, etc.)
- [ ] Optimización de prompts
- [ ] Caché inteligente de respuestas comunes
- [ ] Manejo de multimedia (imágenes, documentos)

**Entregable**: Bot con features completas

### Fase 4: Testing & Quality (Semana 4)
**Objetivo**: Asegurar calidad y estabilidad

- [ ] Tests unitarios de services
- [ ] Tests de integración de controllers
- [ ] Tests E2E del flujo completo
- [ ] Documentación de código (JSDoc)
- [ ] README completo con instrucciones
- [ ] Configurar CI/CD (GitHub Actions)
- [ ] Análisis de cobertura de código
- [ ] Load testing básico
- [ ] Security audit de dependencias

**Entregable**: Código testeado y documentado

### Fase 5: Deployment & Monitoring (Semana 5)
**Objetivo**: Llevar a producción con monitoreo

- [ ] Configurar Docker y Docker Compose para producción
- [ ] Setup en plataforma cloud (Railway/Render/VPS)
- [ ] Configurar dominio y certificado SSL
- [ ] Migrar de Sandbox a número real de WhatsApp
- [ ] Configurar Sentry para error tracking
- [ ] Setup de logs centralizados
- [ ] Configurar alertas (downtime, errores, etc.)
- [ ] Dashboard de métricas básicas
- [ ] Documentación de operaciones (runbook)
- [ ] Plan de backup de base de datos

**Entregable**: Sistema en producción con monitoreo

### Fase 6: Optimización & Escalado (Ongoing)
**Objetivo**: Mejorar performance y escalar

- [ ] Optimización de consultas a DB
- [ ] Implementar connection pooling
- [ ] Caché avanzado con Redis
- [ ] CDN para assets estáticos
- [ ] Load balancer si es necesario
- [ ] Auto-scaling configuration
- [ ] Optimización de costos de Claude
- [ ] A/B testing de prompts
- [ ] Analytics avanzados
- [ ] Dashboard de administración

**Entregable**: Sistema optimizado y escalable

---

## 💰 Estimación de Costos

### Desarrollo/Testing
```
├─ Twilio Sandbox: $0
├─ Claude API (pruebas, ~500 msgs): $5-10
├─ PostgreSQL (local/Docker): $0
├─ Redis (local/Docker): $0
├─ Herramientas desarrollo: $0
└─ TOTAL: ~$10/mes
```

### Producción Pequeña (500 usuarios/mes)
```
├─ Hosting (Railway Hobby): $5
├─ PostgreSQL (Railway): $5
├─ Redis (Railway): $5
├─ Twilio WhatsApp (~1000 conversaciones): $25-50
├─ Claude API (~5000 mensajes): $50-75
├─ Dominio: $1/mes
├─ SSL Certificate: $0 (Let's Encrypt)
└─ TOTAL: ~$90-140/mes
```

### Producción Mediana (5000 usuarios/mes)
```
├─ Hosting (Railway Pro): $20
├─ PostgreSQL (Railway Pro): $15
├─ Redis (Railway Pro): $10
├─ Twilio WhatsApp (~10000 conversaciones): $250-500
├─ Claude API (~50000 mensajes): $500-750
├─ Monitoring (Sentry): $26
├─ CDN/Backups: $10
└─ TOTAL: ~$830-1330/mes
```

### Producción Grande (50000+ usuarios/mes)
```
├─ Hosting (Dedicated VPS): $100-200
├─ PostgreSQL (Managed): $50-100
├─ Redis (Managed): $30-50
├─ Twilio WhatsApp: $2500-5000
├─ Claude API: $5000-7500
├─ Monitoring & Logs: $100
├─ CDN/Backups: $50
└─ TOTAL: ~$7830-13000/mes
```

---

## 🎯 Checklist de Lanzamiento

### Pre-Launch
- [ ] Todos los tests pasan
- [ ] Documentación completa
- [ ] Variables de entorno de producción configuradas
- [ ] Base de datos con backups configurados
- [ ] Monitoreo y alertas funcionando
- [ ] Rate limiting probado
- [ ] Manejo de errores validado
- [ ] Load testing completado
- [ ] Security audit realizado
- [ ] Plan de rollback definido

### Launch Day
- [ ] Deploy a producción
- [ ] Verificar health checks
- [ ] Probar flujo completo end-to-end
- [ ] Monitorear logs en tiempo real
- [ ] Verificar métricas iniciales
- [ ] Tener equipo disponible para incidencias

### Post-Launch (Primera semana)
- [ ] Monitoreo diario de métricas
- [ ] Revisar logs de errores
- [ ] Analizar feedback de usuarios
- [ ] Optimizar prompts según uso real
- [ ] Ajustar rate limits si es necesario
- [ ] Documentar problemas y soluciones

---

## 📊 Métricas Clave a Monitorear

### Técnicas
- Uptime del servicio (objetivo: 99.9%)
- Latencia de respuesta (objetivo: <2s)
- Tasa de error (objetivo: <1%)
- Uso de CPU y memoria
- Conexiones activas a DB
- Tamaño de caché en Redis

### De Negocio
- Usuarios activos diarios/mensuales
- Mensajes enviados/recibidos
- Conversaciones iniciadas
- Tiempo promedio de conversación
- Satisfacción de usuario (si se implementa)
- Tasa de retención

### De Costos
- Tokens consumidos de Claude
- Mensajes de Twilio enviados
- Costo por usuario
- Costo por conversación
- ROI del servicio

---

## 🔐 Consideraciones de Seguridad

### Implementadas en el código
- ✅ Validación de webhooks de Twilio
- ✅ Rate limiting por usuario
- ✅ Variables de entorno seguras
- ✅ Helmet.js para headers HTTP seguros
- ✅ Input validation con Zod
- ✅ Error handling que no expone detalles internos

### Recomendaciones adicionales
- [ ] Implementar autenticación para endpoints administrativos
- [ ] Encriptar datos sensibles en DB
- [ ] Auditoría de accesos
- [ ] Rotación de secrets
- [ ] 2FA para cuentas críticas
- [ ] Backup encriptado
- [ ] GDPR compliance si aplica
- [ ] Política de privacidad clara

---

## 📚 Recursos Útiles

### Documentación Oficial
- [Twilio WhatsApp API](https://www.twilio.com/docs/whatsapp)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [Prisma ORM](https://www.prisma.io/docs)
- [Express.js](https://expressjs.com/)
- [TypeScript](https://www.typescriptlang.org/docs/)

### Comunidades
- [Twilio Community](https://www.twilio.com/community)
- [Anthropic Discord](https://discord.gg/anthropic)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/whatsapp-business-api)

### Herramientas
- [ngrok](https://ngrok.com/) - Para exponer localhost
- [Postman](https://www.postman.com/) - Para testing de APIs
- [Prisma Studio](https://www.prisma.io/studio) - GUI para base de datos
- [RedisInsight](https://redis.com/redis-enterprise/redis-insight/) - GUI para Redis

---

## 🤝 Contribución y Mantenimiento

### Flujo de desarrollo
1. Crear branch desde `main`
2. Hacer cambios y commits (Conventional Commits)
3. Ejecutar tests y linting
4. Crear Pull Request
5. Code review
6. Merge a `main`
7. Deploy automático

### Conventional Commits
```bash
feat: agregar comando /status
fix: corregir memory leak en Redis
docs: actualizar README con nuevos endpoints
refactor: simplificar ConversationService
test: agregar tests para AIService
chore: actualizar dependencias
```

---

## 🎉 ¡Listo para Comenzar!

Este plan técnico te proporciona todo lo necesario para desarrollar un chatbot de WhatsApp profesional con IA. El stack elegido (TypeScript + Express + PostgreSQL + Redis + Claude) es robusto, escalable y ampliamente usado en producción.

### Próximos pasos inmediatos:
1. ✅ Crear el directorio del proyecto
2. ✅ Copiar todos los archivos de configuración
3. ✅ Instalar dependencias con `pnpm install`
4. ✅ Configurar `.env` con tus credenciales
5. ✅ Levantar DB con `docker-compose up -d`
6. ✅ Ejecutar `pnpm prisma:migrate`
7. ✅ Iniciar desarrollo con `pnpm dev`
8. ✅ Configurar Twilio Sandbox
9. ✅ Enviar tu primer mensaje de prueba

**¡Éxito con tu proyecto!** 🚀
