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
    const smsClients = await prisma.smsClient.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { smsCampaigns: true }
        }
      }
    });

    res.json({
      success: true,
      data: smsClients.map(client => ({
        id: client.id,
        name: client.name,
        mauticUrl: client.mauticUrl,
        username: client.username,
        isActive: client.isActive,
        lastSyncAt: client.lastSyncAt,
        smsCampaignsCount: client._count.smsCampaigns,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt
      }))
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
 */
router.get('/sms-clients/:id/campaigns', async (req, res) => {
  try {
    const { id } = req.params;

    const campaigns = await smsService.getClientSmsCampaigns(parseInt(id), 'sms');

    res.json({
      success: true,
      data: campaigns
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

    // Get all Mautic clients for prefix matching
    const mauticClients = await prisma.mauticClient.findMany({
      where: { isActive: true },
      select: { id: true, name: true }
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
