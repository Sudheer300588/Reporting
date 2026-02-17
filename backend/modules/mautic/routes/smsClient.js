import express from 'express';
import prisma from '../../../prisma/client.js';
import encryptionService from '../services/encryption.js';
import mauticAPIService from '../services/mauticAPI.js';
import smsService from '../services/smsService.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

// ============================================
// SMS CLIENT MANAGEMENT ROUTES
// ============================================

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
router.post('/sms-clients', async (req, res) => {
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

    // Create SMS client
    const smsClient = await prisma.smsClient.create({
      data: {
        name,
        mauticUrl,
        username,
        password: encryptedPassword,
        isActive: true
      }
    });

    // ⚡ FAST INITIAL FETCH - Trigger lightweight sync in background
    // This makes SMS campaigns visible instantly without blocking the response
    setImmediate(async () => {
      try {
        logger.info(`⚡ Starting fast SMS fetch for client ${smsClient.id}...`);
        const syncResult = await syncSmsClientData(smsClient.id);
        logger.info(`   ✅ SMS fetch complete: ${syncResult.smsCampaigns || 0} campaigns fetched`);
      } catch (syncError) {
        logger.error(`   ❌ SMS fetch failed for client ${smsClient.id}:`, syncError.message);
      }
    });

    logger.info(`✅ SMS client created. Data fetch running in background.`);

    res.status(201).json({
      success: true,
      message: 'SMS client created successfully. SMS campaigns are being fetched in background.',
      data: {
        id: smsClient.id,
        name: smsClient.name,
        mauticUrl: smsClient.mauticUrl,
        username: smsClient.username,
        isActive: smsClient.isActive,
        createdAt: smsClient.createdAt
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
router.put('/sms-clients/:id', async (req, res) => {
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

      updateData.password = encryptionService.encrypt(password);
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
router.delete('/sms-clients/:id', async (req, res) => {
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
router.post('/sms-clients/:id/sync', async (req, res) => {
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
 * GET /api/mautic/sms-clients/sync-status
 * Get current SMS sync status
 */
router.get('/sms-clients/sync-status', async (req, res) => {
  try {
    // Get last successful sync from SMS clients
    const lastSyncClient = await prisma.smsClient.findFirst({
      where: { lastSyncAt: { not: null } },
      orderBy: { lastSyncAt: 'desc' },
      select: { lastSyncAt: true }
    });

    const lastSyncAt = lastSyncClient?.lastSyncAt || null;

    res.json({
      success: true,
      data: {
        lastSyncAt: lastSyncAt,
        lastUpdated: lastSyncAt, // Alias for frontend compatibility
        lastSync: lastSyncAt, // Additional alias
      },
    });
  } catch (error) {
    logger.error('Error fetching SMS sync status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SMS sync status',
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
 * GET /api/mautic/sms-campaigns/:smsId/messages
 * Get SMS messages/stats for a specific SMS campaign with pagination
 * Includes reply data cross-referenced from lead event log
 */
router.get('/sms-campaigns/:smsId/messages', async (req, res) => {
  try {
    const { smsId } = req.params;
    const { page = 1, limit = 100 } = req.query;

    // Find the SMS campaign in database
    const smsCampaign = await prisma.mauticSms.findFirst({
      where: { mauticId: parseInt(smsId, 10) }
    });

    if (!smsCampaign) {
      return res.status(404).json({
        success: false,
        message: 'SMS campaign not found in database. Please sync the client first.'
      });
    }

    // Fetch stats from database with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [stats, total, deliveredCount, failedCount] = await Promise.all([
      // Get paginated stats
      prisma.mauticSmsStat.findMany({
        where: { smsId: smsCampaign.id },
        orderBy: { dateSent: 'desc' },
        skip: skip,
        take: parseInt(limit)
      }),
      // Get total count
      prisma.mauticSmsStat.count({
        where: { smsId: smsCampaign.id }
      }),
      // Get delivered count
      prisma.mauticSmsStat.count({
        where: { 
          smsId: smsCampaign.id,
          isFailed: '0'
        }
      }),
      // Get failed count
      prisma.mauticSmsStat.count({
        where: { 
          smsId: smsCampaign.id,
          isFailed: '1'
        }
      })
    ]);

    // Transform stats to messages array
    const messages = stats.map(stat => ({
      leadId: stat.leadId,
      dateSent: stat.dateSent ? stat.dateSent.toISOString() : null,
      isFailed: stat.isFailed
    }));

    res.json({
      success: true,
      data: messages,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
      delivered: deliveredCount,
      failed: failedCount
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

    // ⚡ OPTIMIZATION: Skip stats fetch during initial creation for speed
    // Stats will be fetched during scheduled sync or manual sync
    // This makes SMS campaigns visible instantly in the UI
    logger.info(`⚡ SMS campaigns stored. Stats will be fetched during scheduled sync.`);

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
        errorMessage: errorMsg.substring(0, 255),
        completedAt: new Date(),
        durationSeconds: Math.floor((endTime - startTime) / 1000)
      }
    });

    throw error;
  }
}

export default router;
