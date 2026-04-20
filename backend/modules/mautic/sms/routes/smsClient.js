import express from 'express';
import axios from 'axios';
import prisma from '../../../../prisma/client.js';
import encryptionService from '../../encryption.js';
import mauticAPIService from '../../mauticAPI.js';
import smsService from '../services/smsService.js';
import smsSyncService from '../services/smsSyncService.js';
import logger from '../../../../utils/logger.js';
import { authenticate, requirePermission } from '../../../../middleware/auth.js';

const router = express.Router();

// Track ongoing SMS sync operations per client
// Structure: Map<clientId, Set<smsId>>
const activeSyncsByClient = new Map();

/**
 * Check if any SMS campaign for a client is currently syncing
 */
function isClientSyncing(clientId) {
  const syncs = activeSyncsByClient.get(clientId);
  return syncs && syncs.size > 0;
}

/**
 * Mark an SMS campaign as syncing
 */
function markSmsAsSyncing(clientId, smsId) {
  if (!activeSyncsByClient.has(clientId)) {
    activeSyncsByClient.set(clientId, new Set());
  }
  activeSyncsByClient.get(clientId).add(smsId);
  logger.debug(`🔄 Marked SMS ${smsId} as syncing for client ${clientId}`);
}

/**
 * Mark an SMS campaign as sync complete
 */
function markSmsAsSyncComplete(clientId, smsId) {
  const syncs = activeSyncsByClient.get(clientId);
  if (syncs) {
    syncs.delete(smsId);
    if (syncs.size === 0) {
      activeSyncsByClient.delete(clientId);
    }
    logger.debug(`✅ Marked SMS ${smsId} as sync complete for client ${clientId}`);
  }
}

// Export tracking functions for use by other modules
export { markSmsAsSyncing, markSmsAsSyncComplete, isClientSyncing };

// ============================================
// SMS CLIENT MANAGEMENT ROUTES
// ============================================

/**
 * GET /api/mautic/sms-clients/sync-status
 * Get sync status for SMS clients
 */
router.get('/sms-clients/sync-status', async (req, res) => {
  try {
    logger.debug('Fetching SMS clients sync status...');

    // Get most recent lastSyncAt from all active SMS clients
    const mostRecentSync = await prisma.smsClient.findFirst({
      where: { 
        lastSyncAt: { not: null },
        isActive: true 
      },
      orderBy: { lastSyncAt: 'desc' },
      select: { lastSyncAt: true }
    });

    // Count active SMS clients
    const activeClientsCount = await prisma.smsClient.count({
      where: { isActive: true }
    });

    // Count total SMS campaigns linked to SMS clients
    const totalSmsCampaigns = await prisma.mauticSms.count({
      where: { 
        smsClientId: { not: null }
      }
    });

    const lastSyncAt = mostRecentSync?.lastSyncAt || null;
    const hasCredentials = activeClientsCount > 0;

    logger.debug(`SMS sync status: lastSyncAt=${lastSyncAt}, hasCredentials=${hasCredentials}, activeClientsCount=${activeClientsCount}, totalSmsCampaigns=${totalSmsCampaigns}`);

    res.json({
      success: true,
      data: {
        lastSyncAt,
        lastUpdated: lastSyncAt,
        lastSync: lastSyncAt,
        hasCredentials,
        activeClientsCount,
        totalSmsCampaigns
      }
    });
  } catch (error) {
    logger.error('Failed to fetch SMS clients sync status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SMS clients sync status',
      error: error.message
    });
  }
});

/**
 * GET /api/mautic/sms-clients
 * Get all SMS clients
 */
router.get('/sms-clients', async (req, res) => {
  try {
    // Get all SMS clients
    const smsClients = await prisma.smsClient.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { smsCampaigns: true }
        }
      }
    });

    // For each SMS client, also check if there's a corresponding Mautic client with same name
    // to get campaigns from that client too
    const clientsWithCounts = await Promise.all(smsClients.map(async (client) => {
      // Find matching Mautic client by name (exact match)
      const mauticClient = await prisma.mauticClient.findFirst({
        where: {
          name: client.name
        },
        include: {
          _count: {
            select: { smsCampaigns: true }
          }
        }
      });

      const smsCount = client._count.smsCampaigns + (mauticClient?._count.smsCampaigns || 0);

      return {
        id: client.id,
        name: client.name,
        mauticUrl: client.mauticUrl,
        username: client.username,
        isActive: client.isActive,
        lastSyncAt: client.lastSyncAt,
        smsCampaignsCount: client._count.smsCampaigns,
        smsCount: smsCount, // Total count including Mautic client campaigns
        createdAt: client.createdAt,
        updatedAt: client.updatedAt
      };
    }));

    res.json({
      success: true,
      data: clientsWithCounts
    });
  } catch (error) {
    logger.error('Failed to fetch SMS clients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SMS clients',
      error: error.message
    });
  }
});

/**
 * POST /api/mautic/sms-clients
 * Create a new SMS client
 */
router.post('/sms-clients', authenticate, requirePermission("Settings", "SMS Clients"), async (req, res) => {
  try {
    const { name, mauticUrl, username, password } = req.body;

    if (!name || !mauticUrl || !username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, mauticUrl, username, password'
      });
    }

    // Test connection first
    const testResult = await mauticAPIService.testConnection({
      mauticUrl,
      username,
      password
    });

    if (!testResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to connect to Mautic instance',
        error: testResult.message
      });
    }

    // Encrypt password
    const encryptedPassword = encryptionService.encrypt(password);

    // Create SMS client (FAST - no background jobs)
    const smsClient = await prisma.smsClient.create({
      data: {
        name,
        mauticUrl,
        username,
        password: encryptedPassword,
        isActive: true
      }
    });

    logger.info(`✅ SMS client created successfully.`);
    logger.info(`   To sync SMS campaigns and stats, use: POST /api/mautic/sms-clients/${smsClient.id}/sync`);

    res.status(201).json({
      success: true,
      message: 'SMS client created successfully. Use the sync endpoint to fetch campaigns and stats.',
      data: {
        id: smsClient.id,
        name: smsClient.name,
        mauticUrl: smsClient.mauticUrl,
        username: smsClient.username,
        isActive: smsClient.isActive,
        createdAt: smsClient.createdAt,
        syncEndpoint: `/api/mautic/sms-clients/${smsClient.id}/sync`
      }
    });
  } catch (error) {
    logger.error('Failed to create SMS client:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create SMS client',
      error: error.message
    });
  }
});

/**
 * PUT /api/mautic/sms-clients/:id
 * Update an SMS client
 */
router.put('/sms-clients/:id', authenticate, requirePermission("Settings", "SMS Clients"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, mauticUrl, username, password, isActive } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (mauticUrl !== undefined) updateData.mauticUrl = mauticUrl;
    if (username !== undefined) updateData.username = username;
    if (isActive !== undefined) updateData.isActive = isActive;

    if (password) {
      // Test connection with new credentials
      const testResult = await mauticAPIService.testConnection({
        mauticUrl: mauticUrl || (await prisma.smsClient.findUnique({ where: { id: parseInt(id) } })).mauticUrl,
        username: username || (await prisma.smsClient.findUnique({ where: { id: parseInt(id) } })).username,
        password
      });

      if (!testResult.success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to connect with new credentials',
          error: testResult.message
        });
      }

      // Only encrypt and update password if a non-empty password is provided
      if (password.trim()) {
        updateData.password = encryptionService.encrypt(password);
      }
    }

    const smsClient = await prisma.smsClient.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    res.json({
      success: true,
      data: {
        id: smsClient.id,
        name: smsClient.name,
        mauticUrl: smsClient.mauticUrl,
        username: smsClient.username,
        isActive: smsClient.isActive,
        updatedAt: smsClient.updatedAt
      }
    });
  } catch (error) {
    logger.error('Failed to update SMS client:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update SMS client',
      error: error.message
    });
  }
});

/**
 * DELETE /api/mautic/sms-clients/:id
 * Delete an SMS client and ALL related data
 * ✅ ENHANCED: Deletes ALL campaigns originally fetched by these credentials (regardless of current grouping)
 */
router.delete('/sms-clients/:id', authenticate, requirePermission("Settings", "SMS Clients"), async (req, res) => {
  try {
    const { id } = req.params;
    const smsClientId = parseInt(id);

    logger.info(`🗑️  Deleting SMS client ${smsClientId} and ALL campaigns fetched by its credentials...`);

    // Get the SMS client to find credentials
    const smsClient = await prisma.smsClient.findUnique({
      where: { id: smsClientId }
    });

    if (!smsClient) {
      return res.status(404).json({
        success: false,
        message: 'SMS client not found'
      });
    }

    // ✅ Normalize credentials for matching (same logic as storage)
    const normalizedOriginUrl = smsClient.mauticUrl.trim().replace(/\/$/, '').toLowerCase();
    const originUsername = smsClient.username.trim();

    logger.info(`   Looking for campaigns with origin: ${normalizedOriginUrl} / ${originUsername}`);

    // ✅ Find ALL SMS campaigns that were originally fetched by these credentials
    // This includes campaigns currently grouped under Mautic clients AND SMS-only clients
    const campaignsToDelete = await prisma.mauticSms.findMany({
      where: {
        originMauticUrl: normalizedOriginUrl,
        originUsername: originUsername
      },
      select: { 
        id: true, 
        mauticId: true, 
        name: true, 
        clientId: true,
        smsClientId: true,
        _count: {
          select: { stats: true }
        }
      }
    });

    logger.info(`   Found ${campaignsToDelete.length} campaigns to delete (fetched by these credentials)`);

    let deletedStats = 0;
    let deletedCampaigns = 0;

    // Delete each campaign and its stats
    for (const campaign of campaignsToDelete) {
      const statsCount = campaign._count.stats;
      deletedStats += statsCount;

      // Delete the campaign (cascade will delete stats via Prisma schema)
      await prisma.mauticSms.delete({
        where: { id: campaign.id }
      });

      deletedCampaigns++;
      
      const location = campaign.clientId 
        ? `Mautic client ${campaign.clientId}` 
        : `SMS client ${campaign.smsClientId}`;
      logger.info(`   ✅ Deleted "${campaign.name}" (${statsCount} stats) from ${location}`);
    }

    // Find and delete the corresponding Mautic client (reportId='sms-only', same name)
    const mauticClient = await prisma.mauticClient.findFirst({
      where: {
        name: smsClient.name,
        reportId: 'sms-only'
      }
    });

    if (mauticClient) {
      logger.info(`   Deleting corresponding Mautic client: ${mauticClient.id} (${mauticClient.name})`);
      await prisma.mauticClient.delete({
        where: { id: mauticClient.id }
      });
    }

    // Delete the SMS client
    await prisma.smsClient.delete({
      where: { id: smsClientId }
    });

    logger.info(`✅ SMS client ${smsClientId} deleted successfully`);
    logger.info(`   Total deleted: ${deletedCampaigns} campaigns, ${deletedStats} stats`);

    res.json({
      success: true,
      message: 'SMS client and all related campaigns deleted successfully',
      deleted: {
        smsClient: 1,
        mauticClient: mauticClient ? 1 : 0,
        campaigns: deletedCampaigns,
        stats: deletedStats
      },
      details: {
        originUrl: normalizedOriginUrl,
        originUsername: originUsername,
        campaignsDeleted: campaignsToDelete.map(c => ({
          name: c.name,
          mauticId: c.mauticId,
          statsCount: c._count.stats
        }))
      }
    });
  } catch (error) {
    logger.error('Failed to delete SMS client:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete SMS client',
      error: error.message
    });
  }
});

/**
 * POST /api/mautic/sms-clients/:id/sync
 * Trigger manual sync for an SMS client
 */
router.post('/sms-clients/:id/sync', authenticate, requirePermission("Settings", "SMS Clients"), async (req, res) => {
  try {
    const { id } = req.params;
    const syncResult = await syncSmsClientData(parseInt(id));

    res.json({
      success: true,
      data: syncResult
    });
  } catch (error) {
    logger.error('Failed to sync SMS client:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync SMS client',
      error: error.message
    });
  }
});

/**
 * POST /api/mautic/sync-all-sms-stats
 * Manually trigger stats sync for ALL SMS campaigns with sentCount > 0 but missing stats
 * This is useful for backfilling stats after campaign metadata has already been synced
 */
router.post('/sync-all-sms-stats', async (req, res) => {
  try {
    logger.info('🔄 Starting bulk SMS stats sync for all campaigns...');

    // Find campaigns with sentCount > 0
    const campaignsNeedingSync = await prisma.mauticSms.findMany({
      where: {
        sentCount: { gt: 0 }
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            mauticUrl: true,
            username: true,
            password: true
          }
        },
        _count: {
          select: {
            stats: true
          }
        }
      }
    });

    // Filter to campaigns with no stats or very few stats compared to sentCount
    const campaignsWithMissingStats = campaignsNeedingSync.filter(c => 
      c._count.stats === 0 || c._count.stats < (c.sentCount * 0.5) // Less than 50% of expected stats
    );

    logger.info(`   Found ${campaignsWithMissingStats.length} campaigns needing stats sync`);

    if (campaignsWithMissingStats.length === 0) {
      return res.json({
        success: true,
        message: 'All campaigns already have stats',
        data: { synced: 0, errors: 0 }
      });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const campaign of campaignsWithMissingStats) {
      try {
        if (!campaign.client) {
          logger.warn(`   ⚠️  Skipping "${campaign.name}" - no Mautic client`);
          errorCount++;
          errors.push({ campaign: campaign.name, error: 'No Mautic client link' });
          continue;
        }

        logger.info(`   🔄 Syncing "${campaign.name}" (${campaign.sentCount} sent, ${campaign._count.stats} existing stats)...`);

        // Decrypt password
        const password = encryptionService.decrypt(campaign.client.password);

        // Sync stats
        const statsResult = await smsSyncService.syncSmsStats(
          {
            name: campaign.client.name,
            mauticUrl: campaign.client.mauticUrl,
            username: campaign.client.username,
            password: password
          },
          campaign.id,
          campaign.mauticId,
          false // Preserve existing stats
        );

        logger.info(`   ✅ Synced ${statsResult.created} stats for "${campaign.name}"`);
        successCount++;
      } catch (error) {
        logger.error(`   ❌ Failed "${campaign.name}":`, error.message);
        errorCount++;
        errors.push({ campaign: campaign.name, error: error.message });
      }
    }

    logger.info(`\n✅ Bulk stats sync complete: ${successCount} success, ${errorCount} errors`);

    res.json({
      success: true,
      message: `Synced stats for ${successCount} campaigns`,
      data: {
        synced: successCount,
        errors: errorCount,
        errorDetails: errors
      }
    });
  } catch (error) {
    logger.error('Failed to sync all SMS stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync all SMS stats',
      error: error.message
    });
  }
});

/**
 * POST /api/mautic/sms-clients/recategorize
 * Re-categorize all SMS campaigns based on first-word matching
 * This fixes any existing data inconsistencies
 */
router.post('/sms-clients/recategorize', async (req, res) => {
  try {
    logger.info('Starting SMS campaign re-categorization...');

    // Get all active Mautic clients (exclude sms-only to avoid conflicts)
    const mauticClients = await prisma.mauticClient.findMany({
      where: {
        isActive: true,
        NOT: { reportId: 'sms-only' }
      },
      select: { id: true, name: true, reportId: true }
    });

    // Get all SMS campaigns
    const allSmsCampaigns = await prisma.mauticSms.findMany({
      select: { id: true, mauticId: true, name: true, clientId: true, smsClientId: true }
    });

    // Build first-word map for Mautic clients
    const clientFirstWordMap = new Map();
    for (const client of mauticClients) {
      const firstWord = client.name.split(/[\s_\-:]+/)[0].toLowerCase();
      if (!clientFirstWordMap.has(firstWord)) {
        clientFirstWordMap.set(firstWord, { id: client.id, name: client.name });
      }
    }

    let reassigned = 0;
    let unchanged = 0;
    const changes = [];

    // Re-categorize each SMS campaign
    for (const sms of allSmsCampaigns) {
      const smsFirstWord = sms.name.split(/[\s_\-:]+/)[0].toLowerCase();

      // Check if SMS first word matches any Mautic client
      if (clientFirstWordMap.has(smsFirstWord)) {
        const matchedClient = clientFirstWordMap.get(smsFirstWord);

        // Only update if currently assigned differently
        if (sms.clientId !== matchedClient.id) {
          await prisma.mauticSms.update({
            where: { id: sms.id },
            data: {
              clientId: matchedClient.id,
              smsClientId: null,
              updatedAt: new Date()
            }
          });

          reassigned++;
          changes.push({
            campaignName: sms.name,
            from: sms.clientId ? `Mautic Client ${sms.clientId}` : `SMS Client ${sms.smsClientId}`,
            to: `${matchedClient.name} (ID: ${matchedClient.id})`
          });

          logger.info(`✅ Reassigned "${sms.name}" to "${matchedClient.name}"`);
        } else {
          unchanged++;
        }
      } else {
        // No match found - should be assigned to SMS-only client
        // Find or create SMS-only client for unmatched campaigns
        if (sms.smsClientId === null && sms.clientId !== null) {
          // Check if the current clientId is an sms-only client
          const currentClient = await prisma.mauticClient.findUnique({
            where: { id: sms.clientId },
            select: { reportId: true, name: true }
          });

          if (currentClient && currentClient.reportId !== 'sms-only') {
            // This campaign is assigned to a regular Mautic client but doesn't match
            // We should move it to an SMS-only client
            logger.warn(`⚠️ Campaign "${sms.name}" doesn't match any client but is assigned to regular client ${currentClient.name}`);
            // Keep it unchanged for now - manual review needed
            unchanged++;
          } else {
            unchanged++;
          }
        } else {
          unchanged++;
        }
      }
    }

    logger.info(`Re-categorization complete: ${reassigned} reassigned, ${unchanged} unchanged`);

    res.json({
      success: true,
      data: {
        totalCampaigns: allSmsCampaigns.length,
        reassigned,
        unchanged,
        changes
      }
    });
  } catch (error) {
    logger.error('Failed to re-categorize SMS campaigns:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to re-categorize SMS campaigns',
      error: error.message
    });
  }
});

/**
 * GET /api/mautic/sms-clients/:id/campaigns
 * Get SMS campaigns for a specific SMS client
 * This includes campaigns from both the SMS client and any Mautic client with matching name
 */
router.get('/sms-clients/:id/campaigns', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the SMS client
    const smsClient = await prisma.smsClient.findUnique({
      where: { id: parseInt(id) }
    });

    if (!smsClient) {
      return res.status(404).json({
        success: false,
        message: 'SMS client not found'
      });
    }

    // Get campaigns from SMS client
    const smsCampaigns = await smsService.getClientSmsCampaigns(parseInt(id), 'sms');

    // Also get campaigns from Mautic client with same name (if exists)
    const mauticClient = await prisma.mauticClient.findFirst({
      where: {
        name: smsClient.name
      }
    });

    let mauticCampaigns = [];
    if (mauticClient) {
      mauticCampaigns = await smsService.getClientSmsCampaigns(mauticClient.id, 'mautic');
    }

    // Combine and deduplicate campaigns by mauticId
    const allCampaigns = [...smsCampaigns, ...mauticCampaigns];
    const uniqueCampaigns = Array.from(
      new Map(allCampaigns.map(c => [c.mauticId, c])).values()
    );

    // Sort by name for consistent display
    uniqueCampaigns.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      data: uniqueCampaigns
    });
  } catch (error) {
    logger.error('Failed to fetch SMS client campaigns:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaigns',
      error: error.message
    });
  }
});

/**
 * GET /api/mautic/sms-campaigns/:smsId/debug
 * Debug endpoint to check SMS campaign linkage
 */
router.get('/sms-campaigns/:smsId/debug', async (req, res) => {
  try {
    const { smsId } = req.params;

    const smsCampaign = await prisma.mauticSms.findFirst({
      where: { mauticId: parseInt(smsId, 10) },
      include: {
        client: {
          select: { id: true, name: true, reportId: true, mauticUrl: true, username: true, isActive: true }
        },
        smsClient: {
          select: { id: true, name: true, mauticUrl: true, username: true, isActive: true }
        }
      }
    });

    if (!smsCampaign) {
      return res.status(404).json({
        success: false,
        message: 'SMS campaign not found'
      });
    }

    res.json({
      success: true,
      data: {
        campaign: {
          id: smsCampaign.id,
          mauticId: smsCampaign.mauticId,
          name: smsCampaign.name,
          sentCount: smsCampaign.sentCount,
          clientId: smsCampaign.clientId,
          smsClientId: smsCampaign.smsClientId
        },
        client: smsCampaign.client,
        smsClient: smsCampaign.smsClient,
        hasCredentials: !!(smsCampaign.client || smsCampaign.smsClient)
      }
    });
  } catch (error) {
    logger.error('Failed to debug SMS campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to debug SMS campaign',
      error: error.message
    });
  }
});

/**
 * GET /api/mautic/sms-clients/:clientId/sync-status
 * Check if any SMS campaign for this client is currently syncing
 */
router.get('/sms-clients/:clientId/sync-status', async (req, res) => {
  try {
    const { clientId } = req.params;
    const isSyncing = isClientSyncing(parseInt(clientId));
    
    res.json({
      success: true,
      syncing: isSyncing
    });
  } catch (error) {
    logger.error('Failed to check SMS sync status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check sync status',
      error: error.message
    });
  }
});

/**
 * GET /api/mautic/sms-campaigns/:smsId/messages
 * Get SMS stats/replies for a specific SMS campaign with pagination
 * Sorts by replied first (those with replies on top), then by date
 * Returns campaign-level totals (not just current page)
 */
router.get('/sms-campaigns/:smsId/messages', async (req, res) => {
  try {
    const { smsId } = req.params;
    const { page = 1, limit = 100, replyFilter = 'all' } = req.query;

    console.log("filter", replyFilter);
    

    // Find the SMS campaign in database
    const smsCampaign = await prisma.mauticSms.findFirst({
      where: { mauticId: parseInt(smsId, 10) }
    });

    if (!smsCampaign) {
      return res.status(404).json({
        success: false,
        message: 'SMS campaign not found. Please sync stats first using: POST /sms-clients/:clientId/campaigns/:smsId/sync-stats'
      });
    }

    // Build where clause based on filter
    // Since replyCategory may be NULL, filter on both category and replyText content
    let whereClause = { smsId: smsCampaign.id };
    
    if (replyFilter !== 'all') {
      if (replyFilter === 'Stop') {
        // Show replies with Stop category OR replies containing 'STOP' text
        whereClause = {
          smsId: smsCampaign.id,
          OR: [
            { replyCategory: 'Stop' },
            { replyText: { contains: 'STOP' } }
          ]
        };
      } else if (replyFilter === 'Other') {
        // Show replies that:
        // 1. Have replyCategory = 'Other', OR
        // 2. Have NULL category AND replyText doesn't contain 'STOP'
        whereClause = {
          smsId: smsCampaign.id,
          replyText: { not: null },  // Must have a reply
          OR: [
            { replyCategory: 'Other' },
            { 
              AND: [
                { replyCategory: null },
                { replyText: { not: { contains: 'STOP' } } }
              ]
            }
          ]
        };
      }
    }

    // Get total count for pagination (filtered)
    const total = await prisma.mauticSmsStat.count({
      where: whereClause
    });

    const totalWithReplies = await prisma.mauticSmsStat.count({
      where: { 
        ...whereClause,
        replyText: { not: null }
      }
    });

    const totalDelivered = await prisma.mauticSmsStat.count({
      where: { 
        ...whereClause,
        isFailed: '0'
      }
    });

    const totalFailed = await prisma.mauticSmsStat.count({
      where: { 
        ...whereClause,
        isFailed: '1'
      }
    });

    // Fetch stats with pagination - sort to put those with replies on top
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const stats = await prisma.mauticSmsStat.findMany({
      where: whereClause,
      orderBy: [
        // First, sort by whether there's a reply (put non-null on top)
        { replyText: 'desc' },
        // Then sort by reply date descending (newest first)
        { repliedAt: 'desc' }
      ],
      skip: skip,
      take: parseInt(limit)
    });

    // Transform stats to response format
    // Auto-categorize replies based on content if category is not set
    const messages = stats.map(stat => {
      let category = stat.replyCategory;
      // Workaround: If no category is set but there's a reply, categorize based on content
      if (!category && stat.replyText) {
        category = stat.replyText.toUpperCase().includes('STOP') ? 'Stop' : 'Other';
      }
      return {
        leadId: stat.leadId,
        mobile: stat.mobile,
        replyText: stat.replyText,
        repliedAt: stat.repliedAt ? stat.repliedAt.toISOString() : null,
        replyCategory: category,
        messageText: stat.messageText,
        lastSyncedAt: stat.lastSyncedAt ? stat.lastSyncedAt.toISOString() : null
      };
    });

    res.json({
      success: true,
      data: messages,
      total: total,
      delivered: totalDelivered,
      failed: totalFailed,
      replied: totalWithReplies,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    logger.error('Failed to fetch SMS messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SMS messages',
      error: error.message
    });
  }
});

/**
 * GET /api/mautic/leads/:leadId/activity
 * Get activity log for a specific lead (including SMS replies)
 */
router.get('/leads/:leadId/activity', async (req, res) => {
  try {
    const { leadId } = req.params;
    const { clientId } = req.query;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: 'clientId query parameter is required'
      });
    }

    // Get client credentials
    const client = await prisma.mauticClient.findUnique({
      where: { id: parseInt(clientId) },
      select: { mauticUrl: true, username: true, password: true }
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Create API client (password is already encrypted in DB)
    // createClient will handle decryption internally
    const apiClient = mauticAPIService.createClient({
      mauticUrl: client.mauticUrl,
      username: client.username,
      password: client.password // Pass encrypted password directly
    });

    // Fetch lead activity
    const response = await apiClient.get(`/contacts/${leadId}/activity`, {
      params: {
        search: 'sms',
        limit: 100
      }
    });

    const events = response.data?.events || [];

    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    logger.error('Failed to fetch lead activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lead activity',
      error: error.message
    });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Sync SMS client data from Mautic
 * @param {number} smsClientId - SMS Client ID
 * @returns {Promise<Object>} Sync results
 */
async function syncSmsClientData(smsClientId) {
  const startTime = Date.now();

  try {
    // Get SMS client
    const smsClient = await prisma.smsClient.findUnique({
      where: { id: smsClientId }
    });

    if (!smsClient) {
      throw new Error('SMS client not found');
    }

    // Get all Mautic clients for prefix matching (exclude sms-only clients to avoid conflicts)
    const mauticClients = await prisma.mauticClient.findMany({
      where: {
        isActive: true,
        NOT: { reportId: 'sms-only' }
      },
      select: { id: true, name: true, reportId: true }
    });

    logger.info(`📱 Syncing SMS client "${smsClient.name}" with ${mauticClients.length} Mautic clients for categorization`);

    // 🧹 CLEANUP: Fix orphaned smsClientId references before sync to prevent foreign key violations
    await smsService.cleanupOrphanedReferences();

    // Fetch SMS campaigns from Mautic
    const smsCampaigns = await mauticAPIService.fetchSmses(smsClient);

    logger.info(`   Fetched ${smsCampaigns.length} SMS campaigns from Mautic`);

    // Store with categorization (auto-creates Mautic client for unmatched SMS)
    const storeResult = await smsService.storeSmsWithAutoClient(
      smsClient,
      smsCampaigns,
      mauticClients
    );

    logger.info(`   Storage result: ${storeResult.created} created, ${storeResult.updated} updated, ${storeResult.matched} matched, ${storeResult.unmatched} unmatched`);

    // ✅ SYNC SMS STATS: Fetch individual message records for campaigns with sentCount > 0
    logger.info(`\n📊 Starting SMS stats sync for campaigns with messages...`);
    
    const campaignsToSync = smsCampaigns.filter(c => (c.sentCount || 0) > 0);
    logger.info(`   Found ${campaignsToSync.length} campaigns with messages to sync`);

    let statsSuccessCount = 0;
    let statsErrorCount = 0;

    for (const campaign of campaignsToSync) {
      try {
        // Find the local SMS ID for this campaign
        const normalizedOriginUrl = smsClient?.mauticUrl
          ? smsClient.mauticUrl.trim().replace(/\/$/, '').toLowerCase()
          : null;

        let localSms = null;
        if (normalizedOriginUrl) {
          localSms = await prisma.mauticSms.findUnique({
            where: {
              mauticId_origin_unique: {
                mauticId: campaign.id,
                originMauticUrl: normalizedOriginUrl
              }
            }
          });
        }

        if (!localSms) {
          // Legacy / fallback
          localSms = await prisma.mauticSms.findFirst({
            where: {
              mauticId: campaign.id,
              OR: [
                { smsClientId: smsClient.id },
                { originMauticUrl: normalizedOriginUrl }
              ]
            },
            orderBy: { updatedAt: 'desc' }
          });
        }

        if (!localSms) {
          logger.warn(`   ⚠️  Skipping stats sync for campaign ${campaign.id} (not found in DB)`);
          continue;
        }

        logger.info(`   🔄 Syncing stats for "${campaign.name}" (${campaign.sentCount} sent)...`);

        // Sync stats using the smsSyncService
        const statsResult = await smsSyncService.syncSmsStats(
          smsClient, // API credentials
          localSms.id, // Local SMS ID
          campaign.id, // Mautic SMS ID
          false // Preserve existing stats
        );

        logger.info(`   ✅ Synced ${statsResult.created} stats for "${campaign.name}"`);
        statsSuccessCount++;
      } catch (statsError) {
        logger.error(`   ❌ Failed to sync stats for "${campaign.name}":`, statsError.message);
        statsErrorCount++;
      }
    }

    logger.info(`\n📊 Stats sync complete: ${statsSuccessCount} success, ${statsErrorCount} errors`);

    // Create sync log after successful completion
    const endTime = Date.now();
    const syncLog = await prisma.mauticSyncLog.create({
      data: {
        smsClientId,
        status: 'success',
        syncType: 'manual',
        triggeredBy: 'api',
        totalFetched: storeResult.total,
        totalInserted: storeResult.created,
        totalUpdated: storeResult.updated,
        completedAt: new Date(),
        durationSeconds: Math.floor((endTime - startTime) / 1000)
      }
    });

    // Update SMS client last sync time
    await prisma.smsClient.update({
      where: { id: smsClientId },
      data: { lastSyncAt: new Date() }
    });

    logger.info(`✅ SMS sync completed for client ${smsClientId}:`, storeResult);

    return {
      ...storeResult,
      syncLogId: syncLog.id
    };
  } catch (error) {
    logger.error(`❌ SMS sync failed for client ${smsClientId}:`, error);

    // Create sync log with error
    const endTime = Date.now();
    const errorMsg = error?.message || error?.toString() || 'Unknown error';
    await prisma.mauticSyncLog.create({
      data: {
        smsClientId,
        status: 'failed',
        syncType: 'manual',
        triggeredBy: 'api',
        errorCount: 1,
        errorMessage: errorMsg.substring(0, 190), // Truncate to 190 chars (DB column is VARCHAR(191))
        completedAt: new Date(),
        durationSeconds: Math.floor((endTime - startTime) / 1000)
      }
    });

    throw error;
  }
}

/**
 * GET /api/mautic/sms-clients/:clientId/test-endpoints
 * TEST endpoint to verify Mautic API responses
 * Shows raw data from /contacts and /lead_event_log endpoints
 */
router.get('/sms-clients/:clientId/test-endpoints', async (req, res) => {
  try {
    const { clientId } = req.params;

    // Get Mautic client for API credentials
    const client = await prisma.mauticClient.findUnique({
      where: { id: parseInt(clientId) }
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Mautic client not found'
      });
    }

    // Decrypt password
    let password;
    try {
      password = encryptionService.decrypt(client.password);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: 'Failed to decrypt credentials'
      });
    }

    // Create API client
    const auth = Buffer.from(`${client.username}:${password}`).toString('base64');
    const apiClient = axios.create({
      baseURL: client.mauticUrl.replace(/\/$/, ''),
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    });

    logger.info('🧪 Testing Mautic API endpoints...');

    // Test 1: Fetch contacts
    logger.info('📞 Testing: GET /api/contacts?limit=2&start=0&search=!is:anonymous');
    const contactsResponse = await apiClient.get('/contacts', {
      params: {
        limit: 2,
        start: 0,
        search: '!is:anonymous'
      }
    });

    const contactsData = contactsResponse.data?.contacts || {};
    const contactIds = Object.keys(contactsData);
    
    logger.info(`✅ Contacts response: ${contactIds.length} contacts returned`);
    
    // Show structure of first contact
    let firstContact = null;
    if (contactIds.length > 0) {
      firstContact = contactsData[contactIds[0]];
      logger.info(`   First contact structure:`, JSON.stringify(firstContact, null, 2));
    }

    // Test 2: Fetch replies
    logger.info('💬 Testing: GET /api/stats/lead_event_log?action=reply&limit=2&start=0');
    const repliesResponse = await apiClient.get('/stats/lead_event_log', {
      params: {
        'where[0][col]': 'action',
        'where[0][expr]': 'eq',
        'where[0][val]': 'reply',
        limit: 2,
        start: 0
      }
    });

    const repliesData = repliesResponse.data?.stats || {};
    const replyIds = Object.keys(repliesData);
    
    logger.info(`✅ Replies response: ${replyIds.length} replies returned`);
    
    // Show structure of first reply
    let firstReply = null;
    if (replyIds.length > 0) {
      firstReply = repliesData[replyIds[0]];
      logger.info(`   First reply structure:`, JSON.stringify(firstReply, null, 2));
    }

    res.json({
      success: true,
      test: {
        contacts: {
          endpoint: 'GET /api/contacts?limit=2&start=0&search=!is:anonymous',
          totalReturned: contactIds.length,
          sample: firstContact
        },
        replies: {
          endpoint: 'GET /api/stats/lead_event_log?action=reply&limit=2&start=0',
          totalReturned: replyIds.length,
          sample: firstReply
        }
      }
    });

  } catch (error) {
    logger.error('Test failed:', error.message);
    res.status(500).json({
      success: false,
      message: 'Test failed',
      error: error.message
    });
  }
});

/**
 * POST /api/mautic/sms-clients/:clientId/campaigns/:smsId/sync-stats
 * Manually sync SMS stats for a specific campaign using bulk parallel fetching
 * Fetches contacts (bulk) + replies (bulk), maps them, clears old data, stores new stats
 * Query params:
 *   - clearExisting=true (default) - Clear old stats before syncing
 *   - clearExisting=false - Keep old stats, append new ones
 */
router.post('/sms-clients/:clientId/campaigns/:smsId/sync-stats', async (req, res) => {
  try {
    const { clientId, smsId } = req.params;
    const { clearExisting } = req.query;
    const clientIdInt = parseInt(clientId);
    const smsIdInt = parseInt(smsId);
    
    // Default to preserving existing stats (only clear if explicitly requested)
    const shouldClear = clearExisting === 'true'; // false unless explicitly set to 'true'

    logger.info(`🔄 Starting sync for campaign ${smsIdInt}, clearExisting=${shouldClear}`);

    // Get Mautic client for API credentials
    const client = await prisma.mauticClient.findUnique({
      where: { id: clientIdInt }
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Mautic client not found'
      });
    }

    // Decrypt password for API access
    let password;
    try {
      password = encryptionService.decrypt(client.password);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: 'Failed to decrypt client credentials'
      });
    }

    // Get SMS campaign details
    const smsCampaign = await prisma.mauticSms.findUnique({
      where: { id: smsIdInt }
    });

    if (!smsCampaign) {
      return res.status(404).json({
        success: false,
        message: 'SMS campaign not found'
      });
    }

    // Run sync with decrypted credentials using efficient parallel bulk fetching
    const syncResult = await smsSyncService.syncSmsStats(
      {
        name: client.name,
        mauticUrl: client.mauticUrl,
        username: client.username,
        password: password
      },
      smsIdInt,
      smsCampaign.mauticId,
      shouldClear  // Pass clearExisting flag
    );

    // Update campaign sync info
    await prisma.mauticSms.update({
      where: { id: smsIdInt },
      data: {
        lastSyncedAt: new Date(),
        isSynced: true
      }
    });

    logger.info(`✅ Manual SMS stats sync completed for campaign ${smsIdInt}`);

    res.json({
      success: true,
      data: syncResult
    });
  } catch (error) {
    logger.error('Failed to sync SMS stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync SMS stats',
      error: error.message
    });
  }
});

// ============================================
export default router;