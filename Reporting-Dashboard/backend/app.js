import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import prisma from './prisma/client.js';
import logger from './utils/logger.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

// Route imports
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/employees.js';
import activitiesRoutes from './routes/activities.js';
import clientsRoutes from './routes/clients.js';
import superadminRouter from './routes/superadmin.js';
import notificationsRoutes from './routes/notifications.js';
import settingsRoutes from './routes/settings.js';
import vicidialAgentRoutes from './modules/vicidialer/routes/vicidialAgents.js';
import "./modules/vicidialer/cron/sync.cron.js"; // Initialize Vicidial sync cron

// Module routes
import dropCowboyRoutes from './modules/dropCowboy/routes/api.js';
import mauticRoutes from './modules/mautic/routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create and configure Express application
 * @returns {express.Application} Configured Express app
 */
export function createApp() {
  const app = express();

  // ============================================
  // SECURITY MIDDLEWARE
  // ============================================
  
  // Security headers
  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false, // Handled separately for SPAs
    crossOriginEmbedderPolicy: false
  }));

  // CORS
  app.use(cors());
  


  // Body parsing
  app.use(express.json({ limit: '50mb' }));

  // Rate limiting for all API routes
  app.use('/api/', apiLimiter);

  // Request logging
  app.use((req, res, next) => {
    logger.http(`${req.method} ${req.path}`, { 
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    next();
  });

  // ============================================
  // STATIC FILE SERVING
  // ============================================
  
  // Serve frontend build
  app.use(express.static(path.join(__dirname, 'dist')));

  // Serve uploaded assets (dev + runtime)
  app.use('/assets', express.static(path.join(__dirname, '..', 'frontend', 'public', 'assets')));

  // ============================================
  // PUBLIC API ROUTES
  // ============================================
  
  /**
   * Public endpoint for site config (no auth required)
   * Used by frontend to load branding before authentication
   */
  app.get('/api/site-config', async (req, res) => {
    try {
      const site = await prisma.siteSettings.findFirst({ 
        orderBy: { updatedAt: 'desc' } 
      });
      res.json({ success: true, data: site });
    } catch (err) {
      logger.error('Failed to fetch site config', { error: err.message });
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch site config'
      });
    }
  });

  // Health check endpoint
  app.get('/api/health', async (req, res) => {
    const health = {
      uptime: process.uptime(),
      timestamp: Date.now(),
      status: 'OK',
      checks: {},
      system: {}
    };

    // Database check
    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      health.checks.database = {
        status: 'OK',
        responseTime: `${Date.now() - start}ms`
      };
    } catch (error) {
      health.checks.database = {
        status: 'ERROR',
        error: error.message
      };
      health.status = 'DEGRADED';
    }

    // Memory check
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
    const rssMB = Math.round(used.rss / 1024 / 1024);
    
    health.checks.memory = {
      rss: `${rssMB}MB`,
      heapUsed: `${heapUsedMB}MB`,
      heapTotal: `${heapTotalMB}MB`,
      heapPercent: `${Math.round((used.heapUsed / used.heapTotal) * 100)}%`,
      status: used.heapUsed < 500 * 1024 * 1024 ? 'OK' : 'WARNING'
    };

    // System info
    health.system = {
      platform: process.platform,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      pid: process.pid
    };

    // Set status code
    const statusCode = health.status === 'OK' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  // ============================================
  // AUTHENTICATED API ROUTES
  // ============================================
  
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/activities', activitiesRoutes);
  app.use('/api/clients', clientsRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/superadmin', superadminRouter);
  app.use('/api/superadmin/notifications', notificationsRoutes);
  
  
  // ============================================
  // MODULE ROUTES (Embedded Services)
  // ============================================
  
  // DropCowboy (Ringless Voicemail) - no auth required for embedded service
  app.use('/api/dropcowboy', dropCowboyRoutes);
  
  // Mautic (Email Marketing) - no auth required for embedded service
  app.use('/api/mautic', mauticRoutes);
  
  // Vicidial Agents Management
  app.use("/api/agents", vicidialAgentRoutes);
  // ============================================
  // ERROR HANDLING (Must be last)
  // ============================================
  
  // Centralized error handler
  app.use(errorHandler);

  return app;
}

export default createApp;
