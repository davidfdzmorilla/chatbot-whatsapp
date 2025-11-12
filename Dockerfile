# ============================================
# Build Stage
# ============================================
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies (including dev dependencies for building)
RUN pnpm install --frozen-lockfile

# Copy source code and configuration
COPY . .

# Generate Prisma Client
RUN pnpm prisma:generate

# Build TypeScript to JavaScript
RUN pnpm build

# ============================================
# Production Stage
# ============================================
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# Create logs directory and set permissions
RUN mkdir -p logs && chown -R node:node logs

# Use non-root user for security
USER node

# Expose application port
EXPOSE 3001

# Health check - verify app responds on /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "dist/server.js"]
