import prisma from '../prisma/client.js';
import logger from '../utils/logger.js';
import { hasFullAccess, getAccessibleClientIds, userHasPermission } from '../middleware/auth.js';
import MauticSchedulerService from '../modules/mautic/schedulerService.js';
import DropCowboyScheduler from '../modules/dropCowboy/services/schedulerService.js';

/**
 * Dashboard Service
 * Centralized service for all dashboard data operations
 * Consolidates data from multiple services into optimized endpoints
 */
class DashboardService {
  constructor() {
    this.mauticScheduler = new MauticSchedulerService();
    this.dropCowboyScheduler = new DropCowboyScheduler();
  }

  /**
   * Get complete dashboard overview
   * Consolidates data from: users, clients, mautic stats, dropcowboy metrics, sync status
   */
  async getDashboardOverview(user) {
    try {
      const startTime = Date.now();
      logger.debug(`[Dashboard] Fetching overview for user ${user.id}`);

      // Fetch all data in parallel for maximum performance
      const [
        userStats,
        clientStats,
        emailMetrics,
        voicemailMetrics,
        smsMetrics,
        syncStatus
      ] = await Promise.all([
        this._getUserStats(user),
        this._getClientStats(user),
        this._getEmailMetrics(user),
        this._getVoicemailMetrics(user),
        this._getSmsMetrics(user),
        this._getSyncStatus()
      ]);

      const duration = Date.now() - startTime;
      logger.debug(`[Dashboard] Overview fetched in ${duration}ms`);

      return {
        success: true,
        data: {
          stats: {
            totalEmployees: userStats.totalEmployees,
            totalManagers: userStats.totalManagers,
            totalAdmins: userStats.totalAdmins,
            totalClients: clientStats.totalClients,
            activeClients: clientStats.activeClients,
            inactiveClients: clientStats.inactiveClients
          },
          emailMetrics,
          voicemailMetrics,
          smsMetrics,
          syncStatus,
          fetchedAt: new Date().toISOString(),
          performanceMs: duration
        }
      };
    } catch (error) {
      logger.error('[Dashboard] Error fetching overview:', error);
      throw error;
    }
  }

  /**
   * Async function to get the user's role, to check the user's isTeamManager field
   * Only to be called from _getUserStats function
   */
  async getUserRole(customRoleId) {
    try {
      if (!customRoleId) {
        console.log("No customRoleId found");
        return null;
      }
      const role = await prisma.role.findFirst({
        where: { id: customRoleId }
      });

      return role;
    } catch (error) {
      logger.error('Error fetching user role:', error);
      return null;
    }
  }

  /**
   * Get user statistics (employees, managers, admins)
   * Optimized with groupBy aggregation - no full user data fetched
   */
  async _getUserStats(currentUser) {
    try {
      let where = {};

      // Users with full access see all users
      if (hasFullAccess(currentUser)) {
        // No filter - see all users
      } else if (userHasPermission(currentUser, 'Users', 'Read')) {
        // Check if user is a team manager
        const isTeamManager = currentUser.customRole?.isTeamManager === true;

        if (isTeamManager) {
          // Team managers see employees assigned to their clients
          // First, get all clients assigned to this manager
          const managerClientAssignments = await prisma.clientAssignment.findMany({
            where: { userId: currentUser.id },
            select: { clientId: true }
          });
          const managerClientIds = managerClientAssignments.map(a => a.clientId);

          // Find all users assigned to those clients (excluding the manager themselves)
          where = {
            OR: [
              { createdById: currentUser.id },
              {
                userAssignments: {
                  some: {
                    clientId: { in: managerClientIds }
                  }
                }
              }
            ],
            id: { not: currentUser.id } // Exclude self
          };
        } else {
          // Non-manager users with Users.Read see users they created
          where = {
            createdById: currentUser.id
          };
        }
      } else {
        // Users without Users.Read can only see themselves
        where = { id: currentUser.id };
      }

      where = { ...where, isActive: true };

      // Query users with their role information
      const userStats = await prisma.user.groupBy({
        by: ['customRoleId'], // group by customRoleId instead of role, it will be more specific
        where,
        _count: true
      });

      const stats = {
        totalEmployees: 0,
        totalManagers: 0,
        totalAdmins: 0
      };

      // For each custom role group, fetch the role details to determine type
      for (const group of userStats) {
        const userRole = await this.getUserRole(group.customRoleId);

        if (userRole) {
          // Count as employees
          stats.totalEmployees += group._count;

          // Check if this role is manager as well
          if (userRole.isTeamManager === 1 || userRole.isTeamManager === true) {
            stats.totalManagers += group._count;
          }

          // Check if this is an admin role
          if (userRole.fullAccess === true) {
            stats.totalAdmins += group._count;
          }
        }
      }

      console.log("Final stats:", stats);
      return stats;
    } catch (error) {
      logger.error('[Dashboard] Error fetching user stats:', error);
      return {
        totalEmployees: 0,
        totalManagers: 0,
        totalAdmins: 0
      };
    }
  }

  /**
   * Get client statistics
   * Filtered by user permissions
   * Counts from MauticClient table (excluding SMS-only clients)
   */
  async _getClientStats(currentUser) {
    try {
      let activeClients = 0;
      let inactiveClients = 0;

      if (hasFullAccess(currentUser)) {
        // Full access users see all Mautic clients (excluding SMS-only)
        [activeClients, inactiveClients] = await Promise.all([
          prisma.mauticClient.count({
            where: {
              isActive: true,
              reportId: { not: 'sms-only' }
            }
          }),
          prisma.mauticClient.count({
            where: {
              isActive: false,
              reportId: { not: 'sms-only' }
            }
          })
        ]);
      } else {
        // Limited users see only clients they have access to
        // Get accessible Client.ids first
        const accessibleClientIds = await getAccessibleClientIds(currentUser.id, currentUser);

        // Find MauticClients linked to these Client.ids OR get all if user has broad access
        const mauticClientsWhere = {
          reportId: { not: 'sms-only' },
          OR: [
            { clientId: { in: accessibleClientIds } },
            { clientId: null } // Include unlinked mautic clients for now
          ]
        };

        [activeClients, inactiveClients] = await Promise.all([
          prisma.mauticClient.count({
            where: { ...mauticClientsWhere, isActive: true }
          }),
          prisma.mauticClient.count({
            where: { ...mauticClientsWhere, isActive: false }
          })
        ]);
      }

      return {
        totalClients: activeClients + inactiveClients,
        activeClients,
        inactiveClients
      };
    } catch (error) {
      logger.error('[Dashboard] Error fetching client stats:', error);
      return {
        totalClients: 0,
        activeClients: 0,
        inactiveClients: 0
      };
    }
  }

  /**
   * Get email performance metrics (Mautic)
   * Filtered by user's accessible clients
   */
  async _getEmailMetrics(currentUser) {
    try {
      // Get accessible client IDs
      let clientIds = null;
      if (!hasFullAccess(currentUser)) {
        const accessibleClientIds = await getAccessibleClientIds(currentUser.id, currentUser);
        clientIds = accessibleClientIds;
      }

      // Filter out SMS-only clients
      let validClientIds = null;
      if (clientIds) {
        const validClients = await prisma.mauticClient.findMany({
          where: {
            clientId: { in: clientIds },
            isActive: true
          },
          select: { id: true }
        });
        validClientIds = validClients.map(c => c.id);
      } else {
        const allClients = await prisma.mauticClient.findMany({
          where: { isActive: true },
          select: { id: true }
        });
        validClientIds = allClients.map(c => c.id);
      }

      if (validClientIds.length === 0) {
        return this._getEmptyEmailMetrics();
      }

      // Aggregate email stats
      const emailStats = await prisma.mauticEmail.aggregate({
        where: { clientId: { in: validClientIds } },
        _sum: {
          sentCount: true,
          readCount: true,
          clickedCount: true,
          unsubscribed: true,
          bounced: true,
          uniqueClicks: true
        },
        _count: { id: true }
      });

      // Get click summary
      const clickSummary = await prisma.mauticClickTrackable.aggregate({
        where: { clientId: { in: validClientIds } },
        _sum: {
          uniqueHits: true,
          hits: true
        }
      });

      // Get top performing emails (limit to 6 for dashboard chart)
      const topEmails = await prisma.mauticEmail.findMany({
        where: {
          clientId: { in: validClientIds },
          sentCount: { gt: 0 }
        },
        include: {
          client: {
            select: { name: true }
          }
        },
        orderBy: { readCount: 'desc' },
        take: 6
      });

      // Calculate rates
      const totalSent = emailStats._sum.sentCount || 0;
      const totalRead = emailStats._sum.readCount || 0;
      const totalClicked = emailStats._sum.clickedCount || 0;
      const totalUniqueClicks = clickSummary._sum.uniqueHits || 0;
      const totalBounced = emailStats._sum.bounced || 0;
      const totalUnsubscribed = emailStats._sum.unsubscribed || 0;

      const openRate = totalSent > 0 ? (totalRead / totalSent) * 100 : 0;
      const clickRate = totalSent > 0 ? (totalClicked / totalSent) * 100 : 0;
      const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0;
      const unsubscribeRate = totalSent > 0 ? (totalUnsubscribed / totalSent) * 100 : 0;

      return {
        totalSent,
        totalRead,
        totalClicked,
        totalUniqueClicks,
        totalBounced,
        totalUnsubscribed,
        openRate: parseFloat(openRate.toFixed(2)),
        clickRate: parseFloat(clickRate.toFixed(2)),
        bounceRate: parseFloat(bounceRate.toFixed(2)),
        unsubscribeRate: parseFloat(unsubscribeRate.toFixed(2)),
        avgReadRate: openRate,
        avgClickRate: clickRate,
        avgUnsubscribeRate: unsubscribeRate,
        topEmails: topEmails.map(email => ({
          id: email.id,
          name: email.name,
          clientName: email.client?.name || 'Unknown',
          sentCount: email.sentCount,
          readCount: email.readCount,
          clickedCount: email.clickedCount,
          uniqueClicks: email.uniqueClicks || 0,
          bounced: email.bounced,
          unsubscribed: email.unsubscribed,
          readRate: parseFloat(email.readRate?.toFixed(2) || 0),
          clickRate: parseFloat(email.clickRate?.toFixed(2) || 0),
          unsubscribeRate: parseFloat(email.unsubscribeRate?.toFixed(2) || 0)
        }))
      };
    } catch (error) {
      logger.error('[Dashboard] Error fetching email metrics:', error);
      return this._getEmptyEmailMetrics();
    }
  }

  /**
   * Get voicemail metrics (DropCowboy)
   * Optimized direct queries - bypasses slow dataService for dashboard performance
   * Filtered by user's accessible clients
   */
  async _getVoicemailMetrics(currentUser) {
    try {
      // Build campaign filter
      let campaignIds = [];

      if (!hasFullAccess(currentUser)) {
        // Get accessible client IDs
        const accessibleClientIds = await getAccessibleClientIds(currentUser.id, currentUser);

        // Get campaigns for accessible clients
        const campaigns = await prisma.dropCowboyCampaign.findMany({
          where: { clientId: { in: accessibleClientIds } },
          select: { campaignId: true }
        });
        campaignIds = campaigns.map(c => c.campaignId);

        if (campaignIds.length === 0) {
          return this._getEmptyVoicemailMetrics();
        }
      } else {
        // Get all Mautic client campaigns
        const mauticClients = await prisma.client.findMany({
          where: { clientType: "mautic" },
          select: { id: true }
        });

        const campaigns = await prisma.dropCowboyCampaign.findMany({
          where: { clientId: { in: mauticClients.map(c => c.id) } },
          select: { campaignId: true }
        });
        campaignIds = campaigns.map(c => c.campaignId);
      }

      if (campaignIds.length === 0) {
        return this._getEmptyVoicemailMetrics();
      }

      // Get overall metrics with single aggregate query
      const [overallAgg, successCount, failureCount] = await Promise.all([
        prisma.dropCowboyCampaignRecord.aggregate({
          where: { campaignId: { in: campaignIds } },
          _count: true,
          _sum: { cost: true, complianceFee: true, ttsFee: true }
        }),
        prisma.dropCowboyCampaignRecord.count({
          where: {
            campaignId: { in: campaignIds },
            status: { in: ["sent", "success", "delivered", "SENT", "SUCCESS", "DELIVERED"] }
          }
        }),
        prisma.dropCowboyCampaignRecord.count({
          where: {
            campaignId: { in: campaignIds },
            status: { in: ["failed", "failure", "error", "FAILED", "FAILURE", "ERROR"] }
          }
        })
      ]);

      const totalSent = overallAgg._count || 0;
      const successfulDeliveries = successCount;
      const failedSends = failureCount;
      const otherStatus = totalSent - successfulDeliveries - failedSends;
      const totalCost = parseFloat(overallAgg._sum.cost || 0) +
        parseFloat(overallAgg._sum.complianceFee || 0) +
        parseFloat(overallAgg._sum.ttsFee || 0);
      const averageSuccessRate = totalSent > 0 ? parseFloat(((successfulDeliveries / totalSent) * 100).toFixed(2)) : 0;

      // Get top 6 campaigns by volume (optimized - no record fetching)
      const topCampaigns = await prisma.dropCowboyCampaign.findMany({
        where: { campaignId: { in: campaignIds } },
        take: 6,
        orderBy: { createdAt: 'desc' }
      });

      // Get metrics for each top campaign with parallel queries
      const campaignMetrics = await Promise.all(
        topCampaigns.map(async (campaign) => {
          const [totalRecords, successRecords] = await Promise.all([
            prisma.dropCowboyCampaignRecord.count({
              where: { campaignId: campaign.campaignId }
            }),
            prisma.dropCowboyCampaignRecord.count({
              where: {
                campaignId: campaign.campaignId,
                status: { in: ["sent", "success", "delivered", "SENT", "SUCCESS", "DELIVERED"] }
              }
            })
          ]);

          const successRate = totalRecords > 0 ? parseFloat(((successRecords / totalRecords) * 100).toFixed(2)) : 0;

          return {
            campaignName: campaign.campaignName,
            totalSent: totalRecords,
            successfulDeliveries: successRecords,
            successRate
          };
        })
      );

      return {
        overall: {
          totalSent,
          successfulDeliveries,
          failedSends,
          otherStatus,
          averageSuccessRate,
          totalCost: parseFloat(totalCost.toFixed(4))
        },
        campaigns: campaignMetrics,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      logger.error('[Dashboard] Error fetching voicemail metrics:', error);
      return this._getEmptyVoicemailMetrics();
    }
  }

  /**
   * Get sync status for all services
   * (Mautic, DropCowboy, SMS)
   */
  async _getSyncStatus() {
    try {
      const [mauticStatus, dropCowboyStatus, smsStatus] = await Promise.all([
        this._getMauticSyncStatus(),
        this._getDropCowboySyncStatus(),
        this._getSmsSyncStatus()
      ]);

      return {
        mautic: mauticStatus,
        dropCowboy: dropCowboyStatus,
        sms: smsStatus
      };
    } catch (error) {
      logger.error('[Dashboard] Error fetching sync status:', error);
      return {
        mautic: null,
        dropCowboy: null,
        sms: null
      };
    }
  }

  /**
   * Get Mautic sync status
   */
  async _getMauticSyncStatus() {
    try {
      const lastSync = await prisma.mauticSyncLog.findFirst({
        where: { status: 'success' },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true }
      });

      const activeClientsCount = await prisma.mauticClient.count({
        where: { isActive: true }
      });

      const lastSyncAt = lastSync?.completedAt || null;

      return {
        hasCredentials: activeClientsCount > 0,
        lastSync: lastSyncAt,
        lastSyncAt: lastSyncAt,
        lastUpdated: lastSyncAt,
        activeClientsCount
      };
    } catch (error) {
      logger.error('[Dashboard] Error fetching Mautic sync status:', error);
      return {
        hasCredentials: false,
        lastSync: null,
        lastSyncAt: null,
        lastUpdated: null
      };
    }
  }

  /**
   * Get DropCowboy sync status
   */
  async _getDropCowboySyncStatus() {
    try {
      const lastSync = await prisma.syncLog.findFirst({
        where: {
          source: 'dropcowboy',
          status: 'success'
        },
        orderBy: { syncCompletedAt: 'desc' },
        select: { syncCompletedAt: true }
      });

      // Check for SFTP credentials
      const sftpCredential = await prisma.sFTPCredential.findFirst({
        orderBy: { updatedAt: 'desc' }
      });

      const hasCredentials = !!sftpCredential;
      const lastSyncAt = lastSync?.syncCompletedAt || null;

      return {
        hasCredentials,
        lastSyncAt: lastSyncAt,
        lastUpdated: lastSyncAt
      };
    } catch (error) {
      logger.error('[Dashboard] Error fetching DropCowboy sync status:', error);
      return {
        hasCredentials: false,
        lastSyncAt: null,
        lastUpdated: null
      };
    }
  }

  /**
   * Get SMS sync status
   */
  async _getSmsSyncStatus() {
    try {
      const mostRecentSync = await prisma.smsClient.findFirst({
        where: {
          lastSyncAt: { not: null },
          isActive: true
        },
        orderBy: { lastSyncAt: 'desc' },
        select: { lastSyncAt: true }
      });

      const activeClientsCount = await prisma.smsClient.count({
        where: { isActive: true }
      });

      const lastSyncAt = mostRecentSync?.lastSyncAt || null;

      return {
        hasCredentials: activeClientsCount > 0,
        lastSync: lastSyncAt,
        lastSyncAt: lastSyncAt,
        lastUpdated: lastSyncAt,
        activeClientsCount
      };
    } catch (error) {
      logger.error('[Dashboard] Error fetching SMS sync status:', error);
      return {
        hasCredentials: false,
        lastSync: null,
        lastSyncAt: null,
        lastUpdated: null
      };
    }
  }

  /**
   * Get sync progress for all active syncs
   * Reads from global.syncProgress for real-time tracking
   */
  async getSyncProgress() {
    try {
      // Check for global sync progress first (real-time tracking)
      const progress = global.syncProgress || null;

      if (!progress) {
        // No active sync - return default structure
        return {
          success: true,
          data: {
            isActive: false,
            totalClients: 0,
            completedClients: 0,
            elapsedSeconds: 0,
            currentBatch: 0,
            totalBatches: 0,
            clientList: []
          }
        };
      }

      return {
        success: true,
        data: progress
      };
    } catch (error) {
      logger.error('[Dashboard] Error fetching sync progress:', error);
      return {
        success: false,
        error: error.message,
        data: {
          isActive: false,
          totalClients: 0,
          completedClients: 0,
          elapsedSeconds: 0,
          currentBatch: 0,
          totalBatches: 0,
          clientList: []
        }
      };
    }
  }

  /**
   * Trigger sync for all services
   */
  async triggerSyncAll(options = {}) {
    try {
      const { forceFull = false, syncDropCowboy = false } = options;

      logger.info('[Dashboard] Triggering sync for all services', { forceFull, syncDropCowboy });

      // Start Mautic sync (this is async and returns immediately)
      const mauticResult = await this._triggerMauticSync(forceFull);

      // Optionally trigger DropCowboy sync
      let dropCowboyResult = { success: true, message: 'Skipped' };
      if (syncDropCowboy) {
        dropCowboyResult = await this._triggerDropCowboySync();
      }

      return {
        success: true,
        message: 'Sync started for all services',
        data: {
          mautic: mauticResult,
          dropCowboy: dropCowboyResult
        }
      };
    } catch (error) {
      logger.error('[Dashboard] Error triggering sync:', error);
      throw error;
    }
  }

  /**
   * Trigger Mautic sync
   * Syncs all active Mautic automation clients
   */
  async _triggerMauticSync(forceFull = false) {
    try {
      logger.info('[Dashboard] Starting Mautic automation clients sync...', { forceFull });
      const result = await this.mauticScheduler.syncAllClients({ forceFull });

      if (result.success) {
        logger.info(`[Dashboard] Mautic sync completed: ${result.successful}/${result.totalClients} clients synced`);
        return {
          success: true,
          message: `Synced ${result.successful}/${result.totalClients} Mautic automation clients`,
          isSyncing: false,
          details: result
        };
      } else {
        logger.warn(`[Dashboard] Mautic sync issue: ${result.message}`);
        return {
          success: false,
          message: result.message || 'Mautic sync failed',
          error: result.error
        };
      }
    } catch (error) {
      logger.error('[Dashboard] Error triggering Mautic sync:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Trigger DropCowboy sync
   */
  async _triggerDropCowboySync() {
    try {
      // Check if SFTP credentials exist
      const sftpCred = await prisma.sFTPCredential.findFirst({
        orderBy: { updatedAt: 'desc' }
      });

      if (!sftpCred) {
        return {
          success: false,
          message: 'No SFTP credentials configured'
        };
      }

      await this.dropCowboyScheduler.fetchAndProcessData();

      return {
        success: true,
        message: 'DropCowboy sync started'
      };
    } catch (error) {
      logger.error('[Dashboard] Error triggering DropCowboy sync:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Get SMS performance metrics
   * Filtered by user's accessible clients
   */
  async _getSmsMetrics(currentUser) {
    try {
      let where = {};

      if (!hasFullAccess(currentUser)) {
        const accessibleClientIds = await getAccessibleClientIds(currentUser.id, currentUser);

        const mauticClients = await prisma.mauticClient.findMany({
          where: { clientId: { in: accessibleClientIds }, isActive: true },
          select: { id: true }
        });
        const mauticClientIds = mauticClients.map(c => c.id);

        if (mauticClientIds.length === 0) return this._getEmptySmsMetrics();
        where = { clientId: { in: mauticClientIds } };
      } else {
        // find existing mautic clients first
        const mauticClients = await prisma.mauticClient.findMany({
          where: { reportId: { not: 'sms-only' } },
          select: { id: true }
        });

        const mauticClientsIds = mauticClients.map(mc => mc.id);

        where = { clientId: { in: mauticClientsIds } };
      }

      const campaigns = await prisma.mauticSms.findMany({
        where,
        select: { id: true, sentCount: true },
        orderBy: { sentCount: 'desc' }
      });

      const totalCampaigns = campaigns.length;
      const activeCampaigns = campaigns.filter(s => s.sentCount > 0).length;
      const campaignIds = campaigns.map(c => c.id);

      // Use MauticSmsStat counts for consistency with the per-client widget
      // totalSent = all stat records, delivered = isFailed:'0', failed = isFailed:'1'
      const [totalSent, delivered, failed] = campaignIds.length > 0
        ? await Promise.all([
          prisma.mauticSmsStat.count({ where: { smsId: { in: campaignIds } } }),
          prisma.mauticSmsStat.count({ where: { smsId: { in: campaignIds }, isFailed: '0' } }),
          prisma.mauticSmsStat.count({ where: { smsId: { in: campaignIds }, isFailed: '1' } })
        ])
        : [0, 0, 0];

      return {
        totalCampaigns,
        totalSent,
        activeCampaigns,
        delivered,
        failed
      };
    } catch (error) {
      logger.error('[Dashboard] Error fetching SMS metrics:', error);
      return this._getEmptySmsMetrics();
    }
  }

  // Helper method for empty email metrics
  _getEmptyEmailMetrics() {
    return {
      totalSent: 0,
      totalRead: 0,
      totalClicked: 0,
      totalUniqueClicks: 0,
      totalBounced: 0,
      totalUnsubscribed: 0,
      openRate: 0,
      clickRate: 0,
      bounceRate: 0,
      unsubscribeRate: 0,
      avgReadRate: 0,
      avgClickRate: 0,
      avgUnsubscribeRate: 0,
      topEmails: []
    };
  }

  // Helper method for empty voicemail metrics
  _getEmptyVoicemailMetrics() {
    return {
      overall: {
        totalSent: 0,
        successfulDeliveries: 0,
        failedSends: 0,
        otherStatus: 0,
        averageSuccessRate: 0,
        totalCost: 0
      },
      campaigns: [],
      lastUpdated: null
    };
  }

  // Helper method for empty SMS metrics
  _getEmptySmsMetrics() {
    return {
      totalCampaigns: 0,
      totalSent: 0,
      activeCampaigns: 0,
      delivered: 0,
      failed: 0
    };
  }
}

export default new DashboardService();
