import prisma from '../prisma/client.js';
import emailService from '../services/emailNotificationService.js';

/**
 * Email Helper Utility
 * Centralizes email notification logic for different actions and user roles
 */

/**
 * Get all superadmins with emails
 * @returns {Promise<Array>} Array of superadmin users
 */
export async function getSuperadmins() {
  return await prisma.user.findMany({
    where: { 
      role: 'superadmin',
      isActive: true
    },
    select: { id: true, name: true, email: true }
  });
}

/**
 * Get users assigned to a client
 * @param {number} clientId - Client ID
 * @returns {Promise<Array>} Array of users assigned to the client
 */
export async function getClientAssignedUsers(clientId) {
  const assignments = await prisma.clientAssignment.findMany({
    where: { 
      clientId: parseInt(clientId),
      user: { isActive: true }
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true }
      }
    }
  });
  
  return assignments.map(a => a.user).filter(u => u);
}

/**
 * Get manager(s) of an employee
 * @param {number} employeeId - Employee ID
 * @returns {Promise<Array>} Array of manager users
 */
export async function getEmployeeManagers(employeeId) {
  const employee = await prisma.user.findUnique({
    where: { id: parseInt(employeeId) },
    include: {
      managers: {
        where: { isActive: true },
        select: { id: true, name: true, email: true }
      }
    }
  });
  
  return employee?.managers || [];
}

/**
 * Send email notification with action-based recipient logic
 * 
 * @param {string} action - Action key (e.g., 'user_created', 'client_assigned')
 * @param {Object} data - Notification data
 * @param {Object} data.variables - Template variables
 * @param {Array<Object>} data.recipients - Optional explicit recipients [{name, email}]
 * @param {boolean} data.notifySuperadmins - Whether to notify all superadmins (default: false)
 * @param {number} data.clientId - Client ID for client-related actions
 * @param {number} data.userId - User ID for user-related actions
 * @param {number} data.creatorId - Creator user ID
 * @returns {Promise<Object>} Result object
 */
export async function sendActionNotification(action, data = {}) {
  try {
    const {
      variables = {},
      recipients = [],
      notifySuperadmins = false,
      clientId = null,
      userId = null,
      creatorId = null
    } = data;
    
    let recipientList = [...recipients];
    
    // Add superadmins if requested
    if (notifySuperadmins) {
      const superadmins = await getSuperadmins();
      recipientList.push(...superadmins);
    }
    
    // Add client-assigned users for client-related actions
    if (clientId) {
      const clientUsers = await getClientAssignedUsers(clientId);
      recipientList.push(...clientUsers);
    }
    
    // Add employee managers for employee-related actions
    if (userId && action.includes('user')) {
      const managers = await getEmployeeManagers(userId);
      recipientList.push(...managers);
    }
    
    // Add creator if specified
    if (creatorId) {
      const creator = await prisma.user.findUnique({
        where: { id: parseInt(creatorId), isActive: true },
        select: { id: true, name: true, email: true }
      });
      if (creator) {
        recipientList.push(creator);
      }
    }
    
    // Remove duplicates by email
    const uniqueRecipients = Array.from(
      new Map(recipientList.map(r => [r.email, r])).values()
    );
    
    if (uniqueRecipients.length === 0) {
      console.log(`No recipients found for action: ${action}`);
      return { success: false, message: 'No recipients' };
    }
    
    // Send email to all recipients
    const results = await Promise.allSettled(
      uniqueRecipients.map(recipient =>
        emailService.sendActionEmail(action, {
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          variables
        })
      )
    );
    
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failCount = results.length - successCount;
    
    console.log(`📧 Sent '${action}' notifications: ${successCount} successful, ${failCount} failed`);
    
    return {
      success: true,
      sent: successCount,
      failed: failCount,
      total: results.length
    };
    
  } catch (error) {
    console.error(`Error sending action notification for '${action}':`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Convenience wrapper for user creation notification
 * Sends welcome email with credentials to the newly created user
 */
export async function notifyUserCreated(user, creator, temporaryPassword) {
  console.log('📧 Attempting to send welcome email:', { 
    userEmail: user.email, 
    userName: user.name,
    hasPassword: !!temporaryPassword 
  });
  
  const result = await sendActionNotification('user_welcome', {
    variables: {
      user_name: user.name,
      user_email: user.email,
      user_role: user.role,
      temporary_password: temporaryPassword,
      created_by: creator.name,
      timestamp: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    },
    recipients: [
      { name: user.name, email: user.email }
    ]
  });
  
  console.log('📧 Welcome email result:', result);
  return result;
}

/**
 * Convenience wrapper for user profile update notification
 */
export async function notifyUserUpdated(user, updater, updatedFields = []) {
  const action = updatedFields.length > 0 ? 'user_profile_updated' : 'user_updated';
  
  return await sendActionNotification(action, {
    variables: {
      user_name: user.name,
      user_email: user.email,
      user_role: user.role,
      action_by: updater.name,
      updated_by: updater.name,
      updated_fields: updatedFields.length > 0 ? updatedFields.join(', ') : 'profile information',
      timestamp: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    },
    recipients: [
      { name: user.name, email: user.email }
    ],
    notifySuperadmins: updatedFields.length === 0,
    userId: user.id
  });
}

/**
 * Convenience wrapper for client creation notification
 */
export async function notifyClientCreated(client, creator) {
  return await sendActionNotification('client_created', {
    variables: {
      client_company: client.name,
      client_name: client.name,
      client_email: client.email || 'N/A',
      action_by: creator.name,
      timestamp: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    },
    recipients: [
      { name: creator.name, email: creator.email }
    ],
    notifySuperadmins: true
  });
}

/**
 * Convenience wrapper for client assignment notification
 */
export async function notifyClientAssigned(client, assignedUser, assignedBy) {
  return await sendActionNotification('client_assigned', {
    variables: {
      client_company: client.name,
      user_name: assignedUser.name,
      action_by: assignedBy.name,
      timestamp: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    },
    recipients: [
      { name: assignedUser.name, email: assignedUser.email }
    ],
    clientId: client.id
  });
}

/**
 * Convenience wrapper for client unassignment notification
 */
export async function notifyClientUnassigned(client, unassignedUser, unassignedBy) {
  return await sendActionNotification('client_unassigned', {
    variables: {
      client_company: client.name,
      user_name: unassignedUser.name,
      action_by: unassignedBy.name,
      timestamp: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    },
    recipients: [
      { name: unassignedUser.name, email: unassignedUser.email }
    ],
    notifySuperadmins: false
  });
}

/**
 * Convenience wrapper for Mautic sync completed notification
 */
export async function notifyMauticSyncCompleted(syncResult) {
  return await sendActionNotification('mautic_sync_completed', {
    variables: {
      sync_type: syncResult.type || 'manual',
      total_clients: syncResult.totalClients || 0,
      successful_clients: syncResult.successful || 0,
      failed_clients: syncResult.failed || 0,
      duration_seconds: syncResult.durationSeconds || 0,
      timestamp: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    },
    notifySuperadmins: true
  });
}

/**
 * Convenience wrapper for Mautic sync failed notification
 */
export async function notifyMauticSyncFailed(syncResult) {
  return await sendActionNotification('mautic_sync_failed', {
    variables: {
      sync_type: syncResult.type || 'manual',
      error_message: syncResult.error || 'Unknown error',
      timestamp: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    },
    notifySuperadmins: true
  });
}

/**
 * Convenience wrapper for SFTP fetch completed notification
 */
export async function notifySftpFetchCompleted(fetchResult) {
  return await sendActionNotification('sftp_fetch_completed', {
    variables: {
      files_count: fetchResult.filesDownloaded || 0,
      campaigns_processed: fetchResult.campaignsProcessed || 0,
      total_records: fetchResult.totalRecords || 0,
      timestamp: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    },
    notifySuperadmins: true
  });
}

/**
 * Convenience wrapper for SFTP fetch failed notification
 */
export async function notifySftpFetchFailed(error) {
  return await sendActionNotification('sftp_fetch_failed', {
    variables: {
      error_message: error.message || String(error),
      timestamp: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    },
    notifySuperadmins: true
  });
}

/**
 * Convenience wrapper for user activation notification
 */
export async function notifyUserActivated(user, activatedBy) {
  return await sendActionNotification('user_activated', {
    variables: {
      user_name: user.name,
      user_email: user.email,
      user_role: user.role,
      activated_by: activatedBy.name,
      timestamp: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    },
    recipients: [
      { name: user.name, email: user.email }
    ]
  });
}

/**
 * Convenience wrapper for user deactivation notification
 */
export async function notifyUserDeactivated(user, deactivatedBy) {
  return await sendActionNotification('user_deactivated', {
    variables: {
      user_name: user.name,
      user_email: user.email,
      user_role: user.role,
      deactivated_by: deactivatedBy.name,
      timestamp: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    },
    recipients: [
      { name: user.name, email: user.email }
    ]
  });
}

/**
 * Convenience wrapper for user deleted notification
 */
/**
 * Convenience wrapper for user deletion notification
 * Sends different templates to user (user_account_deleted) vs admins (user_deleted)
 */
export async function notifyUserDeleted(user, deletedBy) {
  const variables = {
    user_name: user.name,
    user_email: user.email,
    user_role: user.role,
    deleted_by: deletedBy.name,
    timestamp: new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      dateStyle: 'medium',
      timeStyle: 'short'
    })
  };

  // Send account deletion notice to the user
  await sendActionNotification('user_account_deleted', {
    variables,
    recipients: [{ id: user.id, name: user.name, email: user.email }]
  });

  // Send admin notification to superadmins
  return await sendActionNotification('user_deleted', {
    variables,
    notifySuperadmins: true
  });
}

/**
 * Convenience wrapper for password changed notification
 */
export async function notifyPasswordChanged(user) {
  return await sendActionNotification('password_changed', {
    variables: {
      user_name: user.name,
      timestamp: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    },
    recipients: [
      { name: user.name, email: user.email }
    ]
  });
}

