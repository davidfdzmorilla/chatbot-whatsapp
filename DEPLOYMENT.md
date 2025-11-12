# Deployment Guide

This guide covers deploying the WhatsApp AI Chatbot to production environments.

## Table of Contents

- [Docker Deployment](#docker-deployment)
- [Railway Deployment](#railway-deployment)
- [Render Deployment](#render-deployment)
- [GitHub Actions CI/CD](#github-actions-cicd)
- [Environment Variables](#environment-variables)
- [Database Migrations](#database-migrations)
- [Health Checks](#health-checks)
- [Monitoring](#monitoring)

---

## Docker Deployment

### Development Environment

Start all services (PostgreSQL, Redis, App) locally:

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down

# Rebuild after code changes
docker-compose up -d --build
```

### Production Environment

```bash
# Start production stack
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Stop services
docker-compose -f docker-compose.prod.yml down
```

### Environment Variables for Docker

Create `.env` file in project root:

```bash
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=chatbot_prod
DATABASE_URL=postgresql://postgres:your_secure_password@postgres:5432/chatbot_prod?schema=public

# Redis
REDIS_PASSWORD=your_redis_password
REDIS_URL=redis://:your_redis_password@redis:6379

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=whatsapp:+14155238886

# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# Security
ALLOWED_ORIGINS=https://yourdomain.com
TRUST_PROXY=true
```

---

## Railway Deployment

### Prerequisites

1. Install Railway CLI:
```bash
npm i -g @railway/cli
```

2. Login to Railway:
```bash
railway login
```

### Initial Setup

1. Create new project:
```bash
railway init
```

2. Add PostgreSQL database:
```bash
railway add -d postgresql
```

3. Add Redis:
```bash
railway add -d redis
```

4. Set environment variables:
```bash
railway variables set NODE_ENV=production
railway variables set PORT=3001
railway variables set ANTHROPIC_API_KEY=sk-ant-your-key-here
railway variables set TWILIO_ACCOUNT_SID=ACxxxx
railway variables set TWILIO_AUTH_TOKEN=your-token
railway variables set TWILIO_PHONE_NUMBER=whatsapp:+1234567890
railway variables set ALLOWED_ORIGINS=https://yourdomain.com
railway variables set TRUST_PROXY=true
```

5. Deploy:
```bash
railway up
```

6. Run database migrations:
```bash
railway run pnpm prisma:deploy
```

### Automatic Deployment with GitHub Actions

1. Get Railway token:
```bash
railway login --browserless
```

2. Add `RAILWAY_TOKEN` to GitHub Secrets:
   - Go to GitHub repo → Settings → Secrets and variables → Actions
   - Add new secret: `RAILWAY_TOKEN`

3. Push to `main` branch triggers automatic deployment

---

## Render Deployment

### Prerequisites

1. Create account at [render.com](https://render.com)
2. Connect your GitHub repository

### Setup via Dashboard

1. **Create PostgreSQL Database**:
   - Click "New +" → "PostgreSQL"
   - Name: `chatbot-db`
   - Region: Oregon (or closest to you)
   - Plan: Starter ($7/month)

2. **Create Redis Instance**:
   - Click "New +" → "Redis"
   - Name: `chatbot-redis`
   - Region: Oregon
   - Plan: Starter ($10/month)

3. **Create Web Service**:
   - Click "New +" → "Web Service"
   - Connect GitHub repository
   - Name: `chatbot-whatsapp`
   - Environment: Docker
   - Region: Oregon
   - Plan: Starter ($7/month)
   - Build Command: (leave empty - uses Dockerfile)
   - Health Check Path: `/health`

4. **Add Environment Variables**:
   - `NODE_ENV`: `production`
   - `PORT`: `3001`
   - `DATABASE_URL`: (link to chatbot-db)
   - `REDIS_URL`: (link to chatbot-redis)
   - `ANTHROPIC_API_KEY`: `sk-ant-your-key`
   - `TWILIO_ACCOUNT_SID`: `ACxxxx`
   - `TWILIO_AUTH_TOKEN`: `your-token`
   - `TWILIO_PHONE_NUMBER`: `whatsapp:+1234567890`
   - `ALLOWED_ORIGINS`: `https://yourdomain.com`
   - `TRUST_PROXY`: `true`

### Setup via render.yaml

Alternatively, use the `render.yaml` blueprint:

1. Push `render.yaml` to your repository
2. In Render dashboard, click "New +" → "Blueprint"
3. Connect your repository
4. Add secret environment variables manually

---

## GitHub Actions CI/CD

### CI Pipeline

Runs on every push and pull request to `main` or `develop`:

1. **Lint & Type Check**: ESLint + TypeScript compilation
2. **Run Tests**: Full test suite with coverage
3. **Build Docker Image**: Verify Docker build works

### Deploy Pipeline

Runs only on push to `main`:

1. **Deploy to Railway**: Automatic deployment
2. **Health Check**: Verify deployment succeeded

### Required GitHub Secrets

Add these to your repository secrets (Settings → Secrets and variables → Actions):

- `RAILWAY_TOKEN`: Railway authentication token
- `RENDER_SERVICE_ID`: (if using Render) Service ID
- `RENDER_API_KEY`: (if using Render) API key

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `3001` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Redis connection string | `redis://host:6379` |
| `ANTHROPIC_API_KEY` | Claude API key | `sk-ant-xxx` |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | `ACxxxx` |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | `xxx` |
| `TWILIO_PHONE_NUMBER` | Twilio WhatsApp number | `whatsapp:+14155238886` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) | `*` |
| `TRUST_PROXY` | Trust proxy headers | `false` |
| `LOG_LEVEL` | Winston log level | `info` |

---

## Database Migrations

### Development

```bash
# Create new migration
pnpm prisma:migrate

# Apply migrations
pnpm prisma:migrate
```

### Production

```bash
# Railway
railway run pnpm prisma:deploy

# Render (runs automatically on deploy)
# Docker
docker-compose exec app pnpm prisma:deploy
```

### Rollback Strategy

Prisma doesn't support automatic rollbacks. To rollback:

1. Revert migration files in `prisma/migrations/`
2. Manually execute SQL to undo changes
3. Redeploy application

---

## Health Checks

The `/health` endpoint provides system status:

```bash
curl https://your-app.com/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-12T10:30:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "version": "1.0.0",
  "checks": {
    "database": {
      "status": "ok",
      "latencyMs": 15
    },
    "redis": {
      "status": "ok",
      "latencyMs": 5
    },
    "memory": {
      "status": "ok",
      "heapUsed": 85,
      "heapTotal": 120,
      "rss": 150
    }
  }
}
```

Returns:
- **200 OK**: All checks passed
- **503 Service Unavailable**: One or more checks failed

---

## Monitoring

### Logging

Logs are structured JSON format:

```json
{
  "level": "info",
  "message": "Server started",
  "timestamp": "2025-01-12T10:30:00.000Z",
  "service": "chatbot-whatsapp",
  "environment": "production"
}
```

### Metrics to Monitor

- **Request Rate**: Messages per minute
- **Response Time**: P50, P95, P99 latency
- **Error Rate**: Failed requests / total requests
- **Database Latency**: Query performance
- **Redis Latency**: Cache performance
- **Memory Usage**: Heap size and RSS
- **CPU Usage**: Process CPU utilization

### Recommended Tools

- **Railway**: Built-in logs and metrics
- **Render**: Built-in logs and metrics
- **Sentry**: Error tracking
- **New Relic**: APM monitoring
- **Datadog**: Infrastructure monitoring

---

## Troubleshooting

### Container won't start

1. Check logs: `docker-compose logs app`
2. Verify environment variables are set
3. Ensure database and Redis are healthy
4. Check health endpoint: `curl http://localhost:3001/health`

### Database connection errors

1. Verify `DATABASE_URL` is correct
2. Ensure PostgreSQL is running
3. Check network connectivity
4. Run migrations: `pnpm prisma:deploy`

### Redis connection errors

1. Verify `REDIS_URL` is correct
2. Ensure Redis is running
3. Check password (if required)
4. Test connection: `redis-cli ping`

### Twilio webhook not receiving messages

1. Verify webhook URL is public (use ngrok for local dev)
2. Check Twilio webhook configuration
3. Verify signature validation is working
4. Check rate limiting settings

---

## Security Checklist

Before deploying to production:

- [ ] All secrets in environment variables (not in code)
- [ ] `NODE_ENV=production`
- [ ] HTTPS enabled (enforced by platform)
- [ ] CORS configured with `ALLOWED_ORIGINS`
- [ ] Trust proxy enabled (`TRUST_PROXY=true`)
- [ ] Rate limiting active
- [ ] Twilio signature validation enabled
- [ ] Database backups configured
- [ ] Health checks configured
- [ ] Monitoring and alerts setup

---

## Support

For issues or questions:

1. Check logs for error messages
2. Verify environment variables are correct
3. Test health endpoint
4. Review this documentation
5. Check GitHub Issues

---

**Last Updated**: 2025-01-12
