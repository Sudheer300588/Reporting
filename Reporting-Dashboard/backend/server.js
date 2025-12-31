import 'dotenv/config';
import prisma from './prisma/client.js';
import { createApp } from './app.js';
import { initializeSchedulers } from './config/registerSchedulers.js';
import { createDynamicIndexHandler } from './config/loadSiteSettings.js';
import logger from './utils/logger.js';

const PORT = process.env.PORT || 3026;

/**
 * Validate required environment variables
 * Fast-fail on startup if critical configuration is missing
 */
function validateEnvironment() {
  const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'ENCRYPTION_KEY'
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    logger.error('Missing required environment variables', { 
      missing,
      message: 'Please check your .env file'
    });
    console.error('\n❌ FATAL: Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\nPlease set these in your .env file before starting the server.\n');
    process.exit(1);
  }

  // Validate JWT_SECRET length (should be strong)
  if (process.env.JWT_SECRET.length < 32) {
    logger.warn('JWT_SECRET is too short', { 
      length: process.env.JWT_SECRET.length,
      recommended: 64
    });
    console.warn('⚠️  WARNING: JWT_SECRET should be at least 32 characters long for security.');
  }

  // Validate ENCRYPTION_KEY length
  if (process.env.ENCRYPTION_KEY.length < 32) {
    logger.warn('ENCRYPTION_KEY is too short', { 
      length: process.env.ENCRYPTION_KEY.length,
      recommended: 64
    });
    console.warn('⚠️  WARNING: ENCRYPTION_KEY should be at least 32 characters long for security.');
  }

  logger.info('Environment validation passed');
}

/**
 * Connect to database and initialize application resources
 */
async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
    
    // Initialize all schedulers after DB connection
    await initializeSchedulers();
    
  } catch (err) {
    logger.error('Database connection error', { error: err.message });
    process.exit(1);
  }
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown() {
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    
    try {
      await prisma.$disconnect();
      logger.info('Database disconnected');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', { error: err.message });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

/**
 * Start the application server
 */
async function startServer() {
  try {
    // Validate environment variables first
    validateEnvironment();

    // Connect to database first
    await connectDatabase();

    // Create Express app with all routes and middleware
    const app = createApp();

    // Add catch-all route for serving dynamic index.html (production only)
    // In development, frontend runs on Vite dev server (port 5000)
    if (process.env.NODE_ENV === 'production') {
      app.get(/.*/, createDynamicIndexHandler());
    }

    // Start listening
    const server = app.listen(PORT, () => {
      logger.info(`Server running at https://dev.hcddev.com:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info('Application ready');
    });

    // Setup graceful shutdown
    setupGracefulShutdown();

    return server;

  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

// Start the server
startServer();
