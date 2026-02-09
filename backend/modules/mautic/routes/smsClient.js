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

    // Trigger initial sync
    try {
      const syncResult = await syncSmsClientData(smsClient.id);
      logger.info(`Initial sync for SMS client ${smsClient.id}:`, syncResult);
    } catch (syncError) {
      logger.error(`Initial sync failed for SMS client ${smsClient.id}:`, syncError);
    }

    res.status(201).json({
      success: true,
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
    const { name, mauticUrl, username, password } = req.body;

    const smsClient = await prisma.smsClient.findUnique({
      where: { id: parseInt(id) }
    });

    if (!smsClient) {
      return res.status(404).json({
        success: false,
        message: 'SMS client not found'
      });
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (mauticUrl) updateData.mauticUrl = mauticUrl;
    if (username) updateData.username = username;
    if (password) {
      updateData.password = encryptionService.encrypt(password);
    }

    // Test connection if credentials changed
    if (mauticUrl || username || password) {
      const testResult = await mauticAPIService.testConnection({
        mauticUrl: mauticUrl || smsClient.mauticUrl,
        username: username || smsClient.username,
        password: password || encryptionService.decrypt(smsClient.password)
      });

      if (!testResult.success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to connect with updated credentials',
          error: testResult.message
        });
      }
    }

    const updatedClient = await prisma.smsClient.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    res.json({
      success: true,
      data: {
        id: updatedClient.id,
        name: updatedClient.name,
        mauticUrl: updatedClient.mauticUrl,
        username: updatedClient.username,
        isActive: updatedClient.isActive,
        updatedAt: updatedClient.updatedAt
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
 * PATCH /api/mautic/sms-clients/:id/toggle
 * Toggle SMS client active status
 */
router.patch('/sms-clients/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;

    const smsClient = await prisma.smsClient.findUnique({
      where: { id: parseInt(id) }
    });

    if (!smsClient) {
      return res.status(404).json({
        success: false,
        message: 'SMS client not found'
      });
    }

    const updatedClient = await prisma.smsClient.update({
      where: { id: parseInt(id) },
      data: { isActive: !smsClient.isActive }
    });

    res.json({
      success: true,
      data: {
        id: updatedClient.id,
        isActive: updatedClient.isActive
      }
    });
  } catch (error) {
    logger.error('Failed to toggle SMS client:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle SMS client',
      error: error.message
    });
  }
});

/**
 * DELETE /api/mautic/sms-clients/:id
 * Delete an SMS client
 */
router.delete('/sms-clients/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const smsClient = await prisma.smsClient.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: {
          select: { smsCampaigns: true }
        }
      }
    });

    if (!smsClient) {
      return res.status(404).json({
        success: false,
        message: 'SMS client not found'
      });
    }

    await prisma.smsClient.delete({
      where: { id: parseInt(id) }
    });

    logger.info(`Deleted SMS client ${id} and ${smsClient._count.smsCampaigns} associated campaigns`);

    res.json({
      success: true,
      message: 'SMS client deleted successfully'
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
 * Trigger SMS data sync for a specific client
 */
router.post('/sms-clients/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;

    const smsClient = await prisma.smsClient.findUnique({
      where: { id: parseInt(id) }
    });

    if (!smsClient) {
      return res.status(404).json({
        success: false,
        message: 'SMS client not found'
      });
    }

    if (!smsClient.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Cannot sync inactive SMS client'
      });
    }

    // Start sync
    const syncResult = await syncSmsClientData(parseInt(id));

    res.json({
      success: true,
      message: 'SMS sync completed',
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
 * GET /api/mautic/sms-campaigns/:smsId/messages
 * Get SMS messages/stats for a specific SMS campaign with pagination
 * Includes reply data cross-referenced from lead event log
 */
router.get('/sms-campaigns/:smsId/messages', async (req, res) => {
  try {
    const { smsId } = req.params;
    const { page = 1, limit = 100 } = req.query;

    // Find the SMS campaign to get client credentials
    // Try both regular client and SMS client
    const smsCampaign = await prisma.mauticSms.findFirst({
      where: { mauticId: parseInt(smsId, 10) },
      include: {
        client: {
          select: { id: true, mauticUrl: true, username: true, password: true }
        },
        smsClient: {
          select: { id: true, mauticUrl: true, username: true, password: true }
        }
      }
    });

    if (!smsCampaign) {
      return res.status(404).json({
        success: false,
        message: 'SMS campaign not found'
      });
    }

    // Use credentials from whichever client exists
    const credentials = smsCampaign.client || smsCampaign.smsClient;
    
    if (!credentials) {
      return res.status(404).json({
        success: false,
        message: 'No client credentials found for this SMS campaign'
      });
    }

    // Decrypt password if needed
    const password = credentials.password.includes(':')
      ? encryptionService.decrypt(credentials.password)
      : credentials.password;

    // Fetch messages from Mautic API - ensure URL has https://
    let mauticUrl = credentials.mauticUrl;
    if (!mauticUrl.startsWith('http://') && !mauticUrl.startsWith('https://')) {
      mauticUrl = `https://${mauticUrl}`;
    }
    mauticUrl = mauticUrl.replace(/\/$/, '');
    
    const auth = Buffer.from(`${credentials.username}:${password}`).toString('base64');

    // Step 1: Fetch ALL outbound SMS stats
    const statsResponse = await fetch(
      `${mauticUrl}/api/stats/sms_message_stats?where[0][col]=sms_id&where[0][expr]=eq&where[0][val]=${smsId}&limit=10000`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!statsResponse.ok) {
      throw new Error(`Mautic API error: ${statsResponse.status}`);
    }

    const statsData = await statsResponse.json();
    const allMessages = statsData.stats || [];
    const total = statsData.total || allMessages.length;

    logger.info(`Fetched ${allMessages.length} SMS messages for campaign ${smsId}`);

    // Step 2: Fetch ALL reply events from lead event log (only once, not per page)
    let replyData = [];
    try {
      const replyResponse = await fetch(
        `${mauticUrl}/api/stats/lead_event_log?where[0][col]=bundle&where[0][expr]=eq&where[0][val]=sms&where[1][col]=action&where[1][expr]=eq&where[1][val]=reply&limit=10000`,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json'
          }
        }
      );
      
      if (replyResponse.ok) {
        const replyJson = await replyResponse.json();
        replyData = replyJson.stats || [];
        logger.info(`Fetched ${replyData.length} SMS reply events`);
      }
    } catch (replyError) {
      logger.warn('Failed to fetch reply data:', replyError);
      // Continue without reply data
    }

    // Create a map of lead_id to reply data for quick lookup
    const replyMap = new Map();
    for (const reply of replyData) {
      const leadId = reply.lead_id;
      if (!replyMap.has(leadId)) {
        replyMap.set(leadId, []);
      }
      replyMap.get(leadId).push({
        replyDate: reply.date_added,
        message: reply.properties?.message || null
      });
    }

    // Apply pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedMessages = allMessages.slice(startIndex, endIndex);

    // Calculate overall stats from all messages
    // Note: is_failed comes as string '0' or '1' from Mautic API
    const overallDelivered = allMessages.filter(msg => msg.is_failed != 1 && msg.is_failed != '1').length;
    const overallFailed = allMessages.filter(msg => msg.is_failed == 1 || msg.is_failed == '1').length;

    // Format messages with reply data
    const formattedMessages = paginatedMessages.map(msg => {
      const leadId = msg.lead_id;
      const replies = replyMap.get(leadId) || [];
      
      return {
        leadId,
        dateSent: msg.date_sent,
        status: (msg.is_failed == 1 || msg.is_failed == '1') ? 'failed' : 'delivered',
        hasReplied: replies.length > 0,
        replyDetails: replies.length > 0 ? replies : null
      };
    });

    res.json({
      success: true,
      data: formattedMessages,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      delivered: overallDelivered,
      failed: overallFailed
    });
  } catch (error) {
    logger.error('Failed to fetch SMS messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
});


// ============================================
// NEW: GET LEAD ACTIVITY
// ============================================

/**
 * GET /api/mautic/leads/:leadId/activity
 * Get activity timeline for a specific lead
 */
router.get('/leads/:leadId/activity', async (req, res) => {
  try {
    const { leadId } = req.params;
    const { smsId } = req.query; // Optional: to find which client to use

    // Find the SMS campaign to get client credentials
    let credentials;
    
    if (smsId) {
      const smsCampaign = await prisma.mauticSms.findFirst({
        where: { mauticId: parseInt(smsId, 10) },
        include: {
          client: {
            select: { id: true, mauticUrl: true, username: true, password: true }
          },
          smsClient: {
            select: { id: true, mauticUrl: true, username: true, password: true }
          }
        }
      });

      if (!smsCampaign) {
        return res.status(404).json({
          success: false,
          message: 'SMS campaign not found'
        });
      }

      credentials = smsCampaign.client || smsCampaign.smsClient;
    } else {
      // If no SMS ID provided, use the first active SMS client
      const smsClient = await prisma.smsClient.findFirst({
        where: { isActive: true },
        select: { id: true, mauticUrl: true, username: true, password: true }
      });

      if (!smsClient) {
        return res.status(404).json({
          success: false,
          message: 'No active SMS client found'
        });
      }

      credentials = smsClient;
    }

    // Decrypt password if needed
    const password = credentials.password.includes(':')
      ? encryptionService.decrypt(credentials.password)
      : credentials.password;

    // Ensure URL has https://
    let mauticUrl = credentials.mauticUrl;
    if (!mauticUrl.startsWith('http://') && !mauticUrl.startsWith('https://')) {
      mauticUrl = `https://${mauticUrl}`;
    }
    mauticUrl = mauticUrl.replace(/\/$/, '');
    
    const auth = Buffer.from(`${credentials.username}:${password}`).toString('base64');

    // Fetch lead activity from Mautic API
    const activityResponse = await fetch(
      `${mauticUrl}/api/contacts/${leadId}/activity`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!activityResponse.ok) {
      throw new Error(`Mautic API error: ${activityResponse.status}`);
    }

    const activityData = await activityResponse.json();
    const events = activityData.events || [];

    // Filter and format relevant events (SMS sent, replies, etc.)
    const formattedEvents = events.map(event => ({
      type: event.event,
      eventType: event.eventType,
      timestamp: event.timestamp,
      details: event.details || {},
      icon: event.icon,
      contactId: event.contactId
    })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Most recent first

    // Separate SMS-specific events
    const smsEvents = formattedEvents.filter(e => 
      e.event === 'sms.sent' || e.event === 'sms.failed' || e.event === 'sms.replied'
    );

    res.json({
      success: true,
      leadId,
      totalEvents: formattedEvents.length,
      smsEventsCount: smsEvents.length,
      events: formattedEvents,
      smsEvents
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
 * Sync SMS data for a specific SMS client
 * @param {Int} smsClientId - SMS Client ID
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

    // Fetch SMS campaigns from Mautic
    const smsCampaigns = await mauticAPIService.fetchSmses(smsClient);

    // Store with categorization (auto-creates Mautic client for unmatched SMS)
    const storeResult = await smsService.storeSmsWithAutoClient(
      smsClient,
      smsCampaigns,
      mauticClients
    );

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

    logger.info(`SMS sync completed for client ${smsClientId}:`, storeResult);

    return {
      ...storeResult,
      syncLogId: syncLog.id
    };
  } catch (error) {
    logger.error(`SMS sync failed for client ${smsClientId}:`, error);

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
        durationSeconds: Math.floor((Date.now() - startTime) / 1000)
      }
    });

    throw error;
  }
}

export default router;
