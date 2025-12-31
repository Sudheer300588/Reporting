import nodemailer from 'nodemailer';
import prisma from '../prisma/client.js';
import logger from '../utils/logger.js';

class NotificationService {
  // Remove constructor, always use DB credentials

  // Create a notification
  async createNotification(data) {
    try {
      // Check if notification table exists
      if (!prisma.notification) {
        logger.info('Notification table not found, skipping notification creation');
        return null;
      }

      const notification = await prisma.notification.create({
        data: {
          recipientId: data.recipient,
          senderId: data.sender || null,
          type: data.type,
          title: data.title,
          message: data.message,
          relatedProjectId: data.relatedProject || null,
          relatedTaskId: data.relatedTask || null,
          priority: data.priority || 'medium',
          scheduledFor: data.scheduledFor || null,
          metadata: data.metadata || {}
        }
      });
      
      // If email notifications are enabled for the user, send email
      const recipient = await prisma.user.findUnique({
        where: { id: data.recipient }
      });
      
      if (recipient && await this.shouldSendEmail(recipient, data.type)) {
        await this.sendEmail(notification);
      }
      
      return notification;
    } catch (error) {
      logger.error('Error creating notification', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  // Check if email should be sent based on user preferences
  async shouldSendEmail(user, notificationType) {
    try {
      // Get user's notification settings from system settings
      const settings = await prisma.settings.findFirst() || {};

      // Check master email toggle
      if (!settings.notifEmailNotifications) return false;

      // Check specific notification type settings
      switch (notificationType) {
        case 'task_deadline_reminder':
          return settings.notifTaskDeadlineReminder !== false;
        case 'task_overdue':
          return settings.notifOverdueTasks !== false;
        case 'project_status_change':
        case 'project_assignment':
          return settings.notifProjectStatusUpdates !== false;
        case 'weekly_report':
          return settings.notifWeeklyReports !== false;
        case 'task_completion':
          return settings.notifTeamUpdates !== false && user.role === 'manager';
        case 'system_update':
          return settings.notifSystemUpdates !== false;
        default:
          return true;
      }
    } catch (error) {
      logger.error('Error checking email settings', { error: error.message });
      return false;
    }
  }

  // Send email notification
  async sendEmail(notification) {
    try {
      // Fetch latest SMTP credentials from DB
      const smtpCred = await prisma.sMTPCredential.findFirst({
        orderBy: { updatedAt: 'desc' }
      });
      if (!smtpCred) {
        logger.warn('No SMTP credentials found in database');
        return;
      }

      // Create transporter using DB credentials
      const transporter = nodemailer.createTransport({
        host: smtpCred.host,
        port: smtpCred.port,
        secure: smtpCred.port === 465, // true for 465, false for other ports
        auth: {
          user: smtpCred.username,
          pass: smtpCred.password
        }
      });

      // Get recipient details
      const recipient = await prisma.user.findUnique({
        where: { id: notification.recipientId },
        select: { email: true, firstName: true, lastName: true }
      });

      if (!recipient || !recipient.email) {
        logger.warn('No email found for recipient', { recipientId: notification.recipientId });
        return;
      }

      // Get sender details if available
      let senderName = 'System';
      if (notification.senderId) {
        const sender = await prisma.user.findUnique({
          where: { id: notification.senderId },
          select: { firstName: true, lastName: true }
        });
        if (sender) {
          senderName = `${sender.firstName} ${sender.lastName}`;
        }
      }

      // Compose email
      const mailOptions = {
        from: smtpCred.fromAddress,
        to: recipient.email,
        subject: notification.title,
        html: this.generateEmailTemplate(notification, recipient, senderName)
      };

      // Send email
      await transporter.sendMail(mailOptions);
      
      // Update notification as sent
      await prisma.notification.update({
        where: { id: notification.id },
        data: { sent: true }
      });
      
      logger.info('Email sent successfully', { to: recipient.email, notificationId: notification.id });
    } catch (error) {
      logger.error('Error sending email', { error: error.message, recipientEmail: recipient?.email });
    }
  }

  // Get email template based on notification type
  getEmailTemplate(notification) {
    const baseUrl = process.env.FRONTEND_URL || 'https://dev.hcddev.com';
    
    const templates = {
      task_deadline_reminder: {
        subject: `Task Deadline Reminder - ${notification.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Task Deadline Reminder</h2>
            <p>Hi there,</p>
            <p>This is a reminder that your task is approaching its deadline:</p>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1f2937;">${notification.title}</h3>
              <p style="margin: 0; color: #6b7280;">${notification.message}</p>
            </div>
            <p>Please make sure to complete this task on time.</p>
            <a href="${baseUrl}/tasks" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 20px 0;">View Tasks</a>
            <p style="color: #6b7280; font-size: 12px;">Best regards,<br>Digital Bevy Team</p>
          </div>
        `
      },
      project_status_change: {
        subject: `Project Status Update - ${notification.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16a34a;">Project Status Update</h2>
            <p>Hi there,</p>
            <p>A project you're involved with has been updated:</p>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1f2937;">${notification.title}</h3>
              <p style="margin: 0; color: #6b7280;">${notification.message}</p>
            </div>
            <a href="${baseUrl}/projects" style="display: inline-block; background: #16a34a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 20px 0;">View Projects</a>
            <p style="color: #6b7280; font-size: 12px;">Best regards,<br>Digital Bevy Team</p>
          </div>
        `
      },
      weekly_report: {
        subject: `Weekly Progress Report - ${new Date().toLocaleDateString()}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">Weekly Progress Report</h2>
            <p>Hi there,</p>
            <p>Here's your weekly progress summary:</p>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1f2937;">${notification.title}</h3>
              <div style="color: #6b7280;">${notification.message}</div>
            </div>
            <a href="${baseUrl}/dashboard" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 20px 0;">View Dashboard</a>
            <p style="color: #6b7280; font-size: 12px;">Best regards,<br>Digital Bevy Team</p>
          </div>
        `
      }
    };

    return templates[notification.type] || {
      subject: notification.title,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">${notification.title}</h2>
          <p>${notification.message}</p>
          <p style="color: #6b7280; font-size: 12px;">Best regards,<br>Digital Bevy Team</p>
        </div>
      `
    };
  }

  // Schedule deadline reminders for upcoming tasks
  async scheduleDeadlineReminders() {
    try {
      // Check if task table exists
      if (!prisma.task) {
        logger.info('Task table not found, skipping deadline reminders');
        return;
      }

      const now = new Date();
      const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      // Find tasks due within 1 day that haven't been reminded
      const urgentTasks = await prisma.task.findMany({
        where: {
          dueDate: { gte: now, lte: oneDayFromNow },
          status: { not: 'completed' }
        },
        include: {
          assignedTo: true,
          project: true
        }
      });

      // Find tasks due within 3 days
      const upcomingTasks = await prisma.task.findMany({
        where: {
          dueDate: { gt: oneDayFromNow, lte: threeDaysFromNow },
          status: { not: 'completed' }
        },
        include: {
          assignedTo: true,
          project: true
        }
      });

      // Create notifications for urgent tasks
      for (const task of urgentTasks) {
        const hoursLeft = Math.round((task.dueDate - now) / (1000 * 60 * 60));
        
        await this.createNotification({
          recipient: task.assignedTo.id,
          type: 'task_deadline_reminder',
          title: '⚠️ Task Deadline Approaching',
          message: `Task "${task.title}" is due in ${hoursLeft} hours!`,
          relatedTask: task.id,
          relatedProject: task.project?.id,
          priority: 'high'
        });
      }

      // Create notifications for upcoming tasks
      for (const task of upcomingTasks) {
        const daysLeft = Math.round((task.dueDate - now) / (1000 * 60 * 60 * 24));
        
        await this.createNotification({
          recipient: task.assignedTo.id,
          type: 'task_deadline_reminder',
          title: '📅 Upcoming Task Deadline',
          message: `Task "${task.title}" is due in ${daysLeft} days.`,
          relatedTask: task.id,
          relatedProject: task.project?.id,
          priority: 'medium'
        });
      }

      logger.info('Scheduled deadline reminders', { urgent: urgentTasks.length, upcoming: upcomingTasks.length });
    } catch (error) {
      logger.error('Error scheduling deadline reminders', { error: error.message });
    }
  }

  // Generate and send weekly reports
  async generateWeeklyReports() {
    try {
      // Check if task table exists
      if (!prisma.task) {
        logger.info('Task table not found, skipping weekly reports');
        return;
      }

      const settings = await prisma.settings.findFirst() || {};

      if (!settings.notifWeeklyReports) return;

      const users = await prisma.user.findMany({ 
        where: { 
          isActive: true, 
          role: { in: ['user', 'manager'] } 
        } 
      });
      
      for (const user of users) {
        const weeklyData = await this.getWeeklyProgressData(user.id);
        
        await this.createNotification({
          recipient: user.id,
          type: 'weekly_report',
          title: 'Weekly Progress Report',
          message: this.formatWeeklyReportMessage(weeklyData),
          priority: 'medium'
        });
      }
    } catch (error) {
      logger.error('Error generating weekly reports', { error: error.message });
    }
  }

  // Get weekly progress data for a user
  async getWeeklyProgressData(userId) {
    // Check if task table exists
    if (!prisma.task) {
      return { completedTasks: 0, totalTasks: 0, activeProjects: 0 };
    }

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [completedTasks, totalTasks, activeProjects] = await Promise.all([
      prisma.task.count({
        where: {
          assignedToId: userId,
          status: 'completed',
          updatedAt: { gte: weekAgo }
        }
      }),
      prisma.task.count({
        where: {
          assignedToId: userId,
          createdAt: { lte: new Date() }
        }
      }),
      prisma.project.count({
        where: {
          OR: [
            { assignedToId: userId },
            { tasks: { some: { assignedToId: userId } } }
          ],
          status: 'in_progress'
        }
      })
    ]);

    return {
      completedTasks,
      totalTasks,
      activeProjects,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    };
  }

  // Format weekly report message
  formatWeeklyReportMessage(data) {
    return `
      <h4>This Week's Summary:</h4>
      <ul>
        <li><strong>${data.completedTasks}</strong> tasks completed</li>
        <li><strong>${data.activeProjects}</strong> active projects</li>
        <li><strong>${data.completionRate}%</strong> overall completion rate</li>
      </ul>
      <p>Keep up the great work!</p>
    `;
  }
}

export default new NotificationService();