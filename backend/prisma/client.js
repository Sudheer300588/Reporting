import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client with optimized configuration
 * - Connection pooling configured
 * - Query logging in development
 * - Error logging always enabled
 */
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'info', 'warn', 'error']
    : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Connection pool configuration via environment variables or defaults
// Add to .env:
// DATABASE_URL="mysql://user:password@localhost:3306/db?connection_limit=10&pool_timeout=30"

export default prisma;
