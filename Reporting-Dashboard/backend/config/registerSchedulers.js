import schedulerService from '../services/schedulerService.js';
import DropCowboyScheduler from '../modules/dropCowboy/services/schedulerService.js';
import MauticScheduler from '../modules/mautic/services/schedulerService.js';
import logger from '../utils/logger.js';

/**
 * Initialize all application schedulers
 * Called after database connection is established
 */
export async function initializeSchedulers() {
  logger.info('Initializing schedulers...');

  // ============================================
  // NOTIFICATION SCHEDULER
  // ============================================
  try {
    schedulerService.init();
    logger.info('Notification scheduler initialized');
  } catch (err) {
    logger.error('Failed to initialize notification scheduler', { error: err.message, stack: err.stack });
  }

  // ============================================
  // DROPCOWBOY SCHEDULER (Ringless Voicemail)
  // ============================================
  const dropCowboyScheduler = new DropCowboyScheduler();
  
  if (process.env.NODE_ENV !== 'development' || process.env.ENABLE_SCHEDULER === 'true') {
    try {
      dropCowboyScheduler.start();
      logger.info('DropCowboy scheduler: ENABLED');
    } catch (err) {
      logger.error('Failed to start DropCowboy scheduler', { error: err.message, stack: err.stack });
    }
  } else {
    logger.info('DropCowboy scheduler: DISABLED (development mode)');
  }

  // ============================================
  // MAUTIC SCHEDULER (Email Marketing)
  // ============================================
  const mauticScheduler = new MauticScheduler();
  
  if (process.env.NODE_ENV !== 'development' || process.env.ENABLE_MAUTIC_SCHEDULER === 'true') {
    try {
      mauticScheduler.start();
      logger.info('Mautic scheduler: ENABLED');
    } catch (err) {
      logger.error('Failed to start Mautic scheduler', { error: err.message, stack: err.stack });
    }
  } else {
    logger.info('Mautic scheduler: DISABLED (development mode)');
  }

  logger.info('All schedulers initialized');
}

export default initializeSchedulers;
