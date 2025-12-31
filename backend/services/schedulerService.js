import cron from 'node-cron';
import notificationService from './notificationService.js';
import prisma from '../prisma/client.js';
import logger from '../utils/logger.js';

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
  }

  // Initialize the scheduler with default jobs
  async init() {
    if (this.isInitialized) return;

    logger.info('Initializing notification scheduler...');

    // Schedule deadline reminders - runs every hour during business hours
    this.scheduleDeadlineReminders();
    
    // Schedule weekly reports - runs daily to check if it's time
    this.scheduleWeeklyReports();
    
    // Schedule overdue task notifications - runs every 6 hours
    this.scheduleOverdueNotifications();

    this.isInitialized = true;
    logger.info('Notification scheduler initialized successfully');
  }

  // Schedule deadline reminders
  scheduleDeadlineReminders() {
    // Run every hour from 8 AM to 6 PM
    const job = cron.schedule('0 8-18 * * *', async () => {
      try {
        logger.info('Running deadline reminder check...');
        await notificationService.scheduleDeadlineReminders();
      } catch (error) {
        logger.error('Error in deadline reminder job', { error: error.message });
      }
    }, {
      scheduled: false,
      timezone: "America/Los_Angeles"
    });

    job.start();
    this.jobs.set('deadline-reminders', job);
    logger.info('Deadline reminder job scheduled (hourly 8AM-6PM)');
  }

  // Schedule weekly reports
  scheduleWeeklyReports() {
    // Run every day at 9 AM to check if weekly reports should be sent
    const job = cron.schedule('0 9 * * *', async () => {
      try {
        const settings = await prisma.settings.findFirst();
        const today = new Date().toLocaleDateString('en-US', { weekday: 'lowercase' });
        
        if (settings?.notifWeeklyReports && 
            today === (settings?.notifWeeklyReportDay || 'friday')) {
          logger.info('Generating weekly reports...');
          await notificationService.generateWeeklyReports();
        }
      } catch (error) {
        logger.error('Error in weekly report job', { error: error.message });
      }
    }, {
      scheduled: false,
      timezone: "America/Los_Angeles"
    });

    job.start();
    this.jobs.set('weekly-reports', job);
    logger.info('Weekly report job scheduled (daily check at 9AM)');
  }

  // Schedule overdue task notifications
  scheduleOverdueNotifications() {
    // Run every 6 hours
    const job = cron.schedule('0 */6 * * *', async () => {
      try {
        logger.info('Checking for overdue tasks...');
        await this.sendOverdueNotifications();
      } catch (error) {
        logger.error('Error in overdue notification job', { error: error.message });
      }
    }, {
      scheduled: false,
      timezone: "America/Los_Angeles"
    });

    job.start();
    this.jobs.set('overdue-notifications', job);
    logger.info('Overdue notification job scheduled (every 6 hours)');
  }

  // Send notifications for overdue tasks
  async sendOverdueNotifications() {
    try {
      const settings = await prisma.settings.findFirst();
      
      if (!settings?.notifOverdueTasks) return;

      // Find overdue tasks
      const overdueTasks = await prisma.task.findMany({
        where: {
          dueDate: { lt: new Date() },
          status: { not: 'completed' }
        },
        include: {
          assignedTo: true,
          project: true
        }
      });

      for (const task of overdueTasks) {
        if (task.assignedTo) {
          // Check if overdue notification was already sent today
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          const existingNotification = await prisma.notification.findFirst({
            where: {
              recipientId: task.assignedTo.id,
              type: 'task_overdue',
              relatedTaskId: task.id,
              createdAt: { gte: today }
            }
          });

          if (!existingNotification) {
            await notificationService.createNotification({
              recipient: task.assignedTo.id,
              type: 'task_overdue',
              title: `Overdue Task: ${task.title}`,
              message: `Your task "${task.title}" was due on ${task.dueDate.toLocaleDateString()}. Please update the status or deadline. Project: ${task.project?.title || 'Unknown'}`,
              relatedTask: task.id,
              relatedProject: task.project?.id,
              priority: 'urgent'
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error sending overdue notifications', { error: error.message });
    }
  }

  // Stop all scheduled jobs
  stopAll() {
    logger.info('Stopping all scheduled jobs...');
    for (const [name, job] of this.jobs.entries()) {
      job.stop();
      logger.info('Stopped job', { jobName: name });
    }
    this.jobs.clear();
    this.isInitialized = false;
  }

  // Get status of all jobs
  getStatus() {
    const status = {};
    for (const [name, job] of this.jobs.entries()) {
      status[name] = {
        running: job.running,
        scheduled: job.scheduled
      };
    }
    return status;
  }

  // Manually trigger a specific job (for testing)
  async trigger(jobName) {
    switch (jobName) {
      case 'deadline-reminders':
        await notificationService.scheduleDeadlineReminders();
        break;
      case 'weekly-reports':
        await notificationService.generateWeeklyReports();
        break;
      case 'overdue-notifications':
        await this.sendOverdueNotifications();
        break;
      default:
        throw new Error(`Unknown job: ${jobName}`);
    }
  }
}

export default new SchedulerService();