# 🤖 WhatsApp AI Chatbot

WhatsApp AI chatbot powered by Claude Sonnet 4 (Anthropic API) and Twilio WhatsApp API. Built with Node.js, TypeScript, Express.js, PostgreSQL, and Redis.

## 📋 Features

- 🤖 AI-powered conversations using Claude Sonnet 4
- 💬 WhatsApp integration via Twilio
- 🗄️ PostgreSQL for data persistence
- ⚡ Redis for conversation context caching
- 🏗️ Clean Architecture & Domain-Driven Design (DDD)
- 🔒 Security-first approach (Helmet, CORS, rate limiting)
- 📊 Structured logging with Winston
- 🧪 Comprehensive testing (Jest, Supertest)
- 🐳 Docker support for development and production

## 🏛️ Architecture

This project follows **Clean Code** and **Domain-Driven Design (DDD)** principles:

```
┌─────────────────────────────┐
│   Presentation Layer        │  ← Controllers (HTTP handling)
└─────────────┬───────────────┘
              ▼
┌─────────────────────────────┐
│   Application Layer         │  ← Services (use cases, orchestration)
└─────────────┬───────────────┘
              ▼
┌─────────────────────────────┐
│   Domain Layer              │  ← Entities, Value Objects (business logic)
└─────────────┬───────────────┘
              ▼
┌─────────────────────────────┐
│   Infrastructure Layer      │  ← Repositories, External APIs
└─────────────────────────────┘
```

### 📁 Project Structure

```
src/
├── config/           # Configuration (env validation, DB, Redis)
├── controllers/      # HTTP request handlers (thin)
├── services/         # Business logic orchestration
├── repositories/     # Data access layer
├── middleware/       # Express middleware (error, validation, rate limit)
├── utils/            # Utilities (logger, errors, helpers)
├── types/            # TypeScript type definitions
├── routes/           # Route definitions
├── app.ts            # Express app setup
└── server.ts         # Server entry point
```

## 🚀 Getting Started

### Prerequisites

- **Node.js**: 20+ (LTS)
- **pnpm**: 8+
- **PostgreSQL**: 15+
- **Redis**: 7+
- **Docker** (optional, for development)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd chatbot-whatsapp
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Setup environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and fill in your credentials:
   - Database URL (PostgreSQL)
   - Redis URL
   - Twilio credentials (Account SID, Auth Token, Phone Number)
   - Anthropic API key

4. **Start Docker services** (PostgreSQL + Redis)
   ```bash
   docker-compose up -d postgres redis
   ```

5. **Run database migrations**
   ```bash
   pnpm prisma:migrate
   pnpm prisma:generate
   ```

6. **Start development server**
   ```bash
   pnpm dev
   ```

The server will start on `http://localhost:3001`

## 📝 Available Scripts

### Development
```bash
pnpm dev                # Start development server with hot reload
pnpm build              # Build TypeScript to JavaScript
pnpm start              # Start production server
```

### Code Quality
```bash
pnpm lint               # Run ESLint
pnpm lint:fix           # Fix ESLint errors
pnpm format             # Format code with Prettier
pnpm format:check       # Check code formatting
```

### Database
```bash
pnpm prisma:generate    # Generate Prisma Client
pnpm prisma:migrate     # Run migrations (development)
pnpm prisma:studio      # Open Prisma Studio GUI
pnpm prisma:deploy      # Deploy migrations (production)
```

### Testing
```bash
pnpm test               # Run all tests
pnpm test:watch         # Run tests in watch mode
pnpm test:coverage      # Run tests with coverage report
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `NODE_ENV` | Environment mode | No | `development` |
| `PORT` | Server port | No | `3001` |
| `DATABASE_URL` | PostgreSQL connection string | Yes | `postgresql://user:pass@localhost:5432/db` |
| `REDIS_URL` | Redis connection string | Yes | `redis://localhost:6379` |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | Yes | `ACxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | Yes | `your_auth_token` |
| `TWILIO_PHONE_NUMBER` | Twilio WhatsApp number | Yes | `whatsapp:+14155238886` |
| `ANTHROPIC_API_KEY` | Claude API key | Yes | `sk-ant-xxxxx` |
| `LOG_LEVEL` | Logging level | No | `info` |

## 🐳 Docker

### Development
```bash
# Start all services (app, postgres, redis)
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

### Production
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## 📊 API Endpoints

### Health Check
```
GET /health
```

Returns application health status:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "environment": "development",
  "version": "1.0.0",
  "checks": {
    "server": { "status": "ok" },
    "memory": {
      "status": "ok",
      "usage": {
        "rss": "50MB",
        "heapTotal": "25MB",
        "heapUsed": "20MB"
      }
    }
  }
}
```

### WhatsApp Webhook
```
POST /webhook/whatsapp
```

Receives incoming WhatsApp messages from Twilio (to be implemented).

## 🧪 Testing

Run tests with:
```bash
pnpm test
```

Coverage goals:
- **Global**: 70%
- **Services**: 80%
- **Controllers**: 70%

## 🔒 Security

- ✅ Helmet.js for secure HTTP headers
- ✅ CORS configuration
- ✅ Rate limiting (Redis-based)
- ✅ Input validation (Zod)
- ✅ Twilio webhook signature validation
- ✅ Environment variable validation
- ✅ No secrets in code

## 📚 Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5+
- **Framework**: Express.js 4
- **AI**: Claude Sonnet 4 (Anthropic API)
- **Messaging**: Twilio WhatsApp API
- **Database**: PostgreSQL 15+ (Prisma ORM)
- **Cache**: Redis 7
- **Logging**: Winston
- **Testing**: Jest, Supertest
- **Linting**: ESLint + Prettier
- **Package Manager**: pnpm

## 🤝 Contributing

This project follows strict **Clean Code** and **DDD** principles:

1. Read `.claude/PRINCIPLES.md` before contributing
2. Functions must be < 30 lines
3. No magic numbers - use constants
4. TypeScript strict mode (no `any`)
5. Comprehensive error handling
6. Structured logging
7. Tests required (70%+ coverage)

## 📄 License

MIT

## 👥 Authors

- Backend Development Team
- AI Integration Team
- DevOps Team

---

Built with ❤️ using Claude Code
