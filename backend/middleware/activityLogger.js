import prisma from '../prisma/client.js';
import logger from '../utils/logger.js';
import emailNotificationService from '../services/emailNotificationService.js';

/**
 * Actions that should notify superadmins
 */
const CRITICAL_ACTIONS = [
  'user_created',
  'user_deleted', 
  'user_activated',
  'user_deactivated',
  'client_created',
  'client_assigned',
  'client_unassigned',
  'client_deleted',
  'client_updated'
];

/**
 * Log user activity with simplified structure and notify superadmins
 * @param {number|object} user - User ID or user object
 * @param {string} action - ActivityAction enum value
 * @param {string} entityType - Type of entity (e.g., 'user', 'client', 'campaign')
 * @param {number} entityId - ID of the entity
 * @param {string} description - Human-readable description
 * @param {object} metadata - Additional metadata (optional)
 * @param {object} req - Express request object (optional)
 */
const logActivity = async (user, action, entityType, entityId, description, metadata = {}, req = null) => {
  try {
    logger.debug('📝 logActivity called:', { action, entityType, entityId, userId: user.id || user });
    
    const logData = {
      userId: user.id || user,
      action,
      description,
      entityType,
      entityId
    };

    const activity = await prisma.activityLog.create({ data: logData });
    logger.debug('✅ Activity logged to database, ID:', activity.id);

    // Notify all superadmins about the activity
    logger.debug('🔔 Calling notifySuperadminsOfActivity...');
    await notifySuperadminsOfActivity(activity, user, description);
    logger.debug('✅ notifySuperadminsOfActivity completed');

  } catch (error) {
    // Log error but don't throw to avoid breaking main functionality
    logger.error('❌ Activity logging failed:', error.message);
    logger.error('Activity logging failed', {
      error: error.message,
      userId: user.id || user,
      action,
      entityType,
      entityId
    });
  }
};

/**
 * Notify all superadmins about an activity (in-app + email)
 */
async function notifySuperadminsOfActivity(activity, user, description) {
  try {
    logger.debug('👥 notifySuperadminsOfActivity called for action:', activity.action);
    
    // Get all active superadmins
    const superadmins = await prisma.user.findMany({
      where: {
        role: 'superadmin',
        isActive: true
      },
      select: { id: true, name: true, email: true }
    });

    logger.debug('👥 Found', superadmins.length, 'active superadmins');
    
    if (superadmins.length === 0) {
      logger.debug('⚠️  No superadmins found, skipping notifications');
      return;
    }

    // Get user details if only ID was passed
    let actorUser = user;
    if (typeof user === 'number') {
      actorUser = await prisma.user.findUnique({
        where: { id: user },
        select: { id: true, name: true, email: true, role: true }
      });
    }

    // Check if notification table exists for in-app notifications
    const hasNotificationTable = await prisma.$queryRaw`
      SHOW TABLES LIKE 'Notification'
    `.then(result => result.length > 0).catch(() => false);

    if (hasNotificationTable) {
      logger.debug('✅ Notification table exists, creating in-app notifications');
      
      // Create notification title based on action
      const notificationTitle = getNotificationTitle(activity.action, activity.entityType);
      
      // Create in-app notifications for each superadmin
      const notifications = superadmins.map(admin => ({
        recipientId: admin.id,
        senderId: actorUser?.id || activity.userId,
        type: 'activity',
        title: notificationTitle,
        message: description,
        priority: CRITICAL_ACTIONS.includes(activity.action) ? 'high' : 'medium',
        metadata: {
          activityId: activity.id,
          action: activity.action,
          entityType: activity.entityType,
          entityId: activity.entityId,
          actorName: actorUser?.name || 'System',
          actorRole: actorUser?.role || 'system'
        }
      }));

      await prisma.notification.createMany({
        data: notifications
      });

      logger.debug('✅ In-app notifications created for superadmins');
    } else {
      logger.debug('⚠️  Notification table not found, skipping in-app notifications (will still send emails)');
      logger.debug('Notification table not found, skipping in-app notifications');
    }
    
    logger.debug('Notified superadmins of activity', {
      action: activity.action,
      superadminCount: superadmins.length
    });

    // Send email notifications to all superadmins
    logger.debug('📧 About to call sendActivityEmailToSuperadmins...');
    await sendActivityEmailToSuperadmins(superadmins, activity, actorUser, description);
    logger.debug('✅ sendActivityEmailToSuperadmins returned');

  } catch (error) {
    // Don't throw - notification failure shouldn't break activity logging
    logger.error('❌ Error in notifySuperadminsOfActivity:', error.message);
    logger.error('Failed to notify superadmins of activity', {
      error: error.message,
      activityId: activity.id
    });
  }
}

/**
 * Generate notification title based on action and entity type
 */
function getNotificationTitle(action, entityType) {
  const actionMap = {
    user_created: '👤 New User Created',
    user_updated: '✏️ User Updated',
    user_deleted: '🗑️ User Deleted',
    user_activated: '✅ User Activated',
    user_deactivated: '⛔ User Deactivated',
    client_created: '🏢 New Client Created',
    client_updated: '✏️ Client Updated',
    client_deleted: '🗑️ Client Deleted',
    client_assigned: '📌 Client Assigned',
    client_unassigned: '📌 Client Unassigned',
    campaign_created: '📧 Campaign Created',
    campaign_updated: '✏️ Campaign Updated',
    password_changed: '🔐 Password Changed'
  };

  return actionMap[action] || `${entityType} ${action}`.replace(/_/g, ' ');
}

/**
 * Send activity email notifications to superadmins
 */
async function sendActivityEmailToSuperadmins(superadmins, activity, actorUser, description) {
  try {
    logger.debug('🔔 sendActivityEmailToSuperadmins called for activity:', activity.action);
    logger.debug('👥 Superadmins to notify:', superadmins.length);
    
    // Check if activity email notifications are enabled
    logger.debug('🔍 Fetching settings from database...');
    const settings = await prisma.settings.findFirst() || {};
    logger.debug('⚙️  Settings fetched:', settings);
    logger.debug('⚙️  Activity email setting (notifActivityEmails):', settings.notifActivityEmails);
    
    if (!settings.notifActivityEmails) {
      logger.debug('❌ Activity email notifications are disabled');
      logger.debug('Activity email notifications are disabled');
      return;
    }

    logger.debug('✅ Activity email notifications are enabled, preparing to send...');

    // Prepare email variables
    const actionLabel = getNotificationTitle(activity.action, activity.entityType);
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const variables = {
      action_label: actionLabel,
      action: activity.action,
      description: description,
      actor_name: actorUser?.name || 'System',
      actor_email: actorUser?.email || 'N/A',
      actor_role: actorUser?.role ? actorUser.role.charAt(0).toUpperCase() + actorUser.role.slice(1) : 'System',
      entity_type: activity.entityType,
      entity_id: activity.entityId,
      timestamp: timestamp
    };

    // Send email to each superadmin
    logger.debug('📧 Sending activity emails to', superadmins.length, 'superadmins...');
    const emailPromises = superadmins.map(admin => {
      logger.debug('  → Sending to:', admin.email);
      return emailNotificationService.sendActionEmail('activity_logged', {
        recipientEmail: admin.email,
        recipientName: admin.name,
        variables
      }).catch(err => {
        logger.error('❌ Failed to send activity email to', admin.email, ':', err.message);
        logger.error('Failed to send activity email to superadmin', {
          superadminEmail: admin.email,
          error: err.message
        });
      });
    });

    await Promise.allSettled(emailPromises);
    
    logger.debug('✅ Activity emails processing completed');
    logger.debug('Activity emails sent to superadmins', {
      action: activity.action,
      emailsSent: superadmins.length
    });

  } catch (error) {
    // Don't throw - email failure shouldn't break activity logging
    logger.error('❌ Failed to send activity emails to superadmins:', error);
    logger.error('Error stack:', error.stack);
    logger.error('Failed to send activity emails to superadmins', {
      error: error.message,
      activityId: activity.id,
      stack: error.stack
    });
  }
}

export { logActivity };