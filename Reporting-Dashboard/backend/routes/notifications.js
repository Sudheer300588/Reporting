import express from 'express';
import prisma from '../prisma/client.js';
import { authenticate as authenticateToken, requireSuperadmin } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import emailService from '../services/emailNotificationService.js';

const router = express.Router();

// All notification routes require superadmin access
router.use(authenticateToken, requireSuperadmin);

// GET /api/superadmin/notifications - Get all notification templates
router.get('/', async (req, res) => {
  try {
    const templates = await prisma.notificationTemplate.findMany({
      orderBy: { action: 'asc' }
    });
    res.json({ success: true, data: templates });
  } catch (error) {
    logger.error('Error fetching notification templates', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to fetch notification templates', error: error.message });
  }
});

// GET /api/superadmin/notifications/:id - Get single notification template
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid notification template ID' 
      });
    }
    
    const template = await prisma.notificationTemplate.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!template) {
      return res.status(404).json({ success: false, message: 'Notification template not found' });
    }
    
    res.json({ success: true, data: template });
  } catch (error) {
    logger.error('Error fetching notification template', { error: error.message, stack: error.stack, id: req.params.id });
    res.status(500).json({ success: false, message: 'Failed to fetch notification template', error: error.message });
  }
});

// POST /api/superadmin/notifications - Create notification template
router.post('/', async (req, res) => {
  try {
    const { action, template, subject, active } = req.body;
    
    if (!action || !template) {
      return res.status(400).json({ success: false, message: 'Action and template are required' });
    }
    
    const newTemplate = await prisma.notificationTemplate.create({
      data: {
        action: action.trim(),
        template: template.trim(),
        subject: subject ? subject.trim() : null,
        active: active !== undefined ? active : true
      }
    });
    
    res.json({ success: true, data: newTemplate, message: 'Notification template created successfully' });
  } catch (error) {
    logger.error('Error creating notification template', { error: error.message, stack: error.stack, action: req.body?.action });
    
    // Check for unique constraint violation
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'A template for this action already exists' });
    }
    
    res.status(500).json({ success: false, message: 'Failed to create notification template', error: error.message });
  }
});

// PUT /api/superadmin/notifications/:id - Update notification template
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, template, subject, active } = req.body;
    
    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid notification template ID' 
      });
    }
    
    const updateData = {};
    if (action !== undefined) updateData.action = action.trim();
    if (template !== undefined) updateData.template = template.trim();
    if (subject !== undefined) updateData.subject = subject ? subject.trim() : null;
    if (active !== undefined) updateData.active = active;
    
    const updatedTemplate = await prisma.notificationTemplate.update({
      where: { id: parseInt(id) },
      data: updateData
    });
    
    res.json({ success: true, data: updatedTemplate, message: 'Notification template updated successfully' });
  } catch (error) {
    logger.error('Error updating notification template', { error: error.message, stack: error.stack, id: req.params.id });
    
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Notification template not found' });
    }
    
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'A template for this action already exists' });
    }
    
    res.status(500).json({ success: false, message: 'Failed to update notification template', error: error.message });
  }
});

// DELETE /api/superadmin/notifications/:id - Delete notification template
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid notification template ID' 
      });
    }
    
    await prisma.notificationTemplate.delete({
      where: { id: parseInt(id) }
    });
    
    res.json({ success: true, message: 'Notification template deleted successfully' });
  } catch (error) {
    logger.error('Error deleting notification template', { error: error.message, stack: error.stack, id: req.params.id });
    
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Notification template not found' });
    }
    
    res.status(500).json({ success: false, message: 'Failed to delete notification template', error: error.message });
  }
});

// ============================================
// EMAIL LOGS - View sent emails
// ============================================

// GET /api/superadmin/notifications/logs - Get email logs
router.get('/logs', async (req, res) => {
  try {
    const { action, success, limit = 50, offset = 0 } = req.query;
    
    const where = {};
    if (action) where.action = action;
    if (success !== undefined) where.success = success === 'true';
    
    const [logs, total] = await Promise.all([
      prisma.emailLog.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset)
      }),
      prisma.emailLog.count({ where })
    ]);
    
    res.json({ success: true, data: logs, total });
  } catch (error) {
    logger.error('Error fetching email logs', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to fetch email logs', error: error.message });
  }
});

// GET /api/superadmin/notifications/stats - Get email statistics
router.get('/stats', async (req, res) => {
  try {
    const [totalSent, totalFailed, recentLogs, topActions] = await Promise.all([
      prisma.emailLog.count({ where: { success: true } }),
      prisma.emailLog.count({ where: { success: false } }),
      prisma.emailLog.findMany({
        orderBy: { sentAt: 'desc' },
        take: 10,
        select: {
          id: true,
          action: true,
          recipientEmail: true,
          success: true,
          sentAt: true,
          errorMessage: true
        }
      }),
      prisma.emailLog.groupBy({
        by: ['action'],
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 5
      })
    ]);
    
    res.json({
      success: true,
      data: {
        totalSent,
        totalFailed,
        totalEmails: totalSent + totalFailed,
        successRate: totalSent + totalFailed > 0 
          ? ((totalSent / (totalSent + totalFailed)) * 100).toFixed(2) 
          : 0,
        recentLogs,
        topActions
      }
    });
  } catch (error) {
    logger.error('Error fetching email stats', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to fetch email stats', error: error.message });
  }
});

// POST /api/superadmin/notifications/test - Send test notification
router.post('/test', async (req, res) => {
  try {
    const { action, recipientEmail, recipientName } = req.body;
    
    if (!action || !recipientEmail) {
      return res.status(400).json({ 
        success: false, 
        message: 'Action and recipient email are required' 
      });
    }
    
    // Get template to determine required variables
    const template = await prisma.notificationTemplate.findUnique({
      where: { action }
    });
    
    if (!template) {
      return res.status(404).json({ 
        success: false, 
        message: `No template found for action: ${action}` 
      });
    }
    
    // Generate sample variables with US timezone
    const usTimestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    
    const sampleVariables = {
      recipient_name: recipientName || recipientEmail,
      user_name: 'John Doe',
      user_email: 'john.doe@example.com',
      user_role: 'Manager',
      client_name: 'Jane Smith',
      client_email: 'jane@acmecorp.com',
      client_company: 'Acme Corporation',
      campaign_name: 'Summer Campaign 2025',
      report_date: new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }),
      report_url: 'https://example.com/reports/123',
      files_count: '5',
      total_records: '1,234',
      sync_type: 'Manual',
      total_clients: '10',
      successful_clients: '9',
      failed_clients: '1',
      duration_seconds: '45.2',
      error_message: 'Sample error message',
      action_by: req.user?.name || 'System Admin',
      timestamp: usTimestamp,
      company: 'Digital Bevy',
      bounce_rate: '15.5',
      open_rate: '42.3',
      quota_limit: '10,000',
      quota_used: '9,500'
    };
    
    // Send test email
    const result = await emailService.sendActionEmail(action, {
      recipientEmail,
      recipientName: recipientName || recipientEmail,
      variables: sampleVariables
    });
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: `Test email sent successfully to ${recipientEmail}`,
        messageId: result.messageId
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: result.message 
      });
    }
  } catch (error) {
    logger.error('Error sending test notification', { error: error.message, stack: error.stack, action: req.body?.action });
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send test notification', 
      error: error.message 
    });
  }
});

export default router;