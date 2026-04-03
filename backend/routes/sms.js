import express from 'express';
import prisma from '../prisma/client.js';
import smsClientSyncService from '../modules/mautic/sms/services/smsClientSyncService.js';
import logger from '../utils/logger.js';
import { authenticate, canViewClients, hasFullAccess, getAccessibleClientIds } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/sms-clients
 * Get all SMS clients with campaign counts
 */
router.get('/sms-clients', async (req, res) => {
  try {
    const smsClients = await prisma.smsClient.findMany({
      orderBy: { name: 'asc' }
    });

    // For each sms client compute campaign count matching either smsClientId OR origin (url+username).
    // originMauticUrl alone is shared by multiple logical clients within the same Mautic instance.
    const clientsWithCounts = await Promise.all(smsClients.map(async (client) => {
      const normalizedUrl = client.mauticUrl ? client.mauticUrl.trim().replace(/\/$/, '').toLowerCase() : null;

      const where = normalizedUrl
        ? {
            OR: [
              { smsClientId: client.id },
              { originMauticUrl: normalizedUrl, originUsername: client.username }
            ]
          }
        : { smsClientId: client.id };

      const count = await prisma.mauticSms.count({ where });

      return {
        id: client.id,
        name: client.name,
        mauticUrl: client.mauticUrl,
        username: client.username,
        isActive: client.isActive,
        lastSyncAt: client.lastSyncAt,
        smsCampaignsCount: count,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt
      };
    }));

    res.json({ success: true, data: clientsWithCounts });
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
 * POST /api/sms-clients/sync-all
 * Sync all active SMS clients
 */
router.post('/sms-clients/sync-all', async (req, res) => {
  try {
    logger.info('🔄 Starting manual sync for all SMS clients...');
    const result = await smsClientSyncService.syncAllSmsClients();
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to sync all SMS clients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync SMS clients',
      error: error.message
    });
  }
});

/**
 * POST /api/sms-clients/:id/sync
 * Sync a specific SMS client
 */
router.post('/sms-clients/:id/sync', async (req, res) => {
  try {
    const smsClientId = parseInt(req.params.id);
    
    const smsClient = await prisma.smsClient.findUnique({
      where: { id: smsClientId }
    });

    if (!smsClient) {
      return res.status(404).json({
        success: false,
        message: 'SMS client not found'
      });
    }

    logger.info(`🔄 Starting manual sync for SMS client: ${smsClient.name}`);
    const result = await smsClientSyncService.syncSmsClient(smsClient);
    
    res.json({
      success: true,
      data: result
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
 * GET /api/clients/:clientId/sms-campaigns
 * Get SMS campaigns for a client (accepts MauticClient.id)
 */
router.get('/clients/:clientId/sms-campaigns', async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Try to find MauticClient by id directly (this is what unified endpoint now sends)
    let mauticClient = await prisma.mauticClient.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, mauticUrl: true }
    });

    // Fallback: If not found, try to find by Client.id (for backward compatibility)
    if (!mauticClient) {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        include: { mauticClient: true }
      });

      if (client?.mauticClient) {
        mauticClient = client.mauticClient;
      }
    }

    if (!mauticClient) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          totalPages: 0
        }
      });
    }

    // IMPORTANT: Match ONLY by clientId.
    // originMauticUrl is a Mautic instance identifier and can include other clients' campaigns.
    const where = { clientId: mauticClient.id };

    const [campaigns, total] = await Promise.all([
      prisma.mauticSms.findMany({
        where,
        include: {
          _count: {
            select: { stats: true }
          }
        },
        orderBy: { sentCount: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.mauticSms.count({ where })
    ]);

    // Add stats count to each campaign
    const campaignsWithStats = campaigns.map(campaign => ({
      ...campaign,
      statsCount: campaign._count.stats
    }));

    res.json({
      success: true,
      data: campaignsWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Failed to fetch SMS campaigns for client:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SMS campaigns',
      error: error.message
    });
  }
});

/**
 * GET /api/sms-clients/:id/campaigns
 * Get all SMS campaigns for a specific SMS client (with pagination)
 */
router.get('/sms-clients/:id/campaigns', async (req, res) => {
  try {
    const smsClientId = parseInt(req.params.id);
    const { page = 1, limit = 50 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get the SMS client to match by URL
    const smsClient = await prisma.smsClient.findUnique({
      where: { id: smsClientId }
    });

    if (!smsClient) {
      return res.status(404).json({
        success: false,
        message: 'SMS client not found'
      });
    }

    // Build filter: match by smsClientId OR by origin (url+username).
    // originMauticUrl alone is too broad (shared instance).
    const where = {
      OR: [
        { smsClientId },
        { 
          originMauticUrl: smsClient.mauticUrl.trim().replace(/\/$/, '').toLowerCase(),
          originUsername: smsClient.username
        }
      ]
    };

    const [campaigns, total] = await Promise.all([
      prisma.mauticSms.findMany({
        where,
        include: {
          _count: {
            select: { stats: true }
          }
        },
        orderBy: { sentCount: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.mauticSms.count({ where })
    ]);

    // Add stats count to each campaign
    const campaignsWithStats = campaigns.map(campaign => ({
      ...campaign,
      statsCount: campaign._count.stats
    }));

    res.json({
      success: true,
      data: campaignsWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Failed to fetch SMS campaigns:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SMS campaigns',
      error: error.message
    });
  }
});

/**
 * GET /api/sms-campaigns/:campaignId/stats
 * Get stats (leads and replies) for a specific SMS campaign
 */
router.get('/sms-campaigns/:campaignId/stats', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId);
    const { page = 1, limit = 100, replyFilter = 'all' } = req.query;

    // Find campaign
    const campaign = await prisma.mauticSms.findUnique({
      where: { id: campaignId },
      include: {
        smsClient: {
          select: { id: true, name: true }
        }
      }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'SMS campaign not found'
      });
    }

    // Build where clause for filtering
    let whereClause = { smsId: campaignId };
    
    if (replyFilter !== 'all') {
      whereClause.replyCategory = replyFilter;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch stats with pagination
    const [stats, total, totalWithReplies, totalFailed] = await Promise.all([
      prisma.mauticSmsStat.findMany({
        where: whereClause,
        orderBy: [
          { replyText: 'desc' }, // Put replies first
          { repliedAt: 'desc' }   // Then by reply date
        ],
        skip,
        take: parseInt(limit)
      }),
      prisma.mauticSmsStat.count({ where: whereClause }),
      prisma.mauticSmsStat.count({
        where: {
          smsId: campaignId,
          replyText: { not: null }
        }
      }),
      prisma.mauticSmsStat.count({
        where: {
          smsId: campaignId,
          isFailed: "1"
        }
      })
    ]);

    // Transform stats
    const messages = stats.map(stat => ({
      leadId: stat.leadId,
      mobile: stat.mobile,
      messageText: stat.messageText,
      replyText: stat.replyText,
      replyCategory: stat.replyCategory,
      repliedAt: stat.repliedAt,
      dateSent: stat.dateSent,
      isFailed: stat.isFailed === '1',
      lastSyncedAt: stat.lastSyncedAt
    }));

    res.json({
      success: true,
      data: {
        campaign: {
          id: campaign.id,
          mauticId: campaign.mauticId,
          name: campaign.name,
          sentCount: campaign.sentCount,
          smsClient: campaign.smsClient
        },
        messages,
        stats: {
          total,
          totalWithReplies,
          totalFailed,
          delivered: campaign.sentCount
        }
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Failed to fetch SMS stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SMS stats',
      error: error.message
    });
  }
});

/**
 * GET /api/sms-campaigns/:campaignId/lead/:leadId/activity
 * Get activity for a specific lead in an SMS campaign
 */
router.get('/sms-campaigns/:campaignId/lead/:leadId/activity', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId);
    const leadId = parseInt(req.params.leadId);

    // Fetch the stat record
    const stat = await prisma.mauticSmsStat.findFirst({
      where: {
        smsId: campaignId,
        leadId: leadId
      },
      include: {
        sms: {
          select: {
            id: true,
            mauticId: true,
            name: true
          }
        }
      }
    });

    if (!stat) {
      return res.status(404).json({
        success: false,
        message: 'Lead activity not found'
      });
    }

    // Format activity response
    const activity = {
      leadId: stat.leadId,
      mobile: stat.mobile,
      campaign: {
        id: stat.sms.id,
        mauticId: stat.sms.mauticId,
        name: stat.sms.name
      },
      message: {
        text: stat.messageText,
        sentAt: stat.dateSent,
        failed: stat.isFailed === '1'
      },
      reply: stat.replyText ? {
        text: stat.replyText,
        category: stat.replyCategory,
        repliedAt: stat.repliedAt
      } : null,
      lastSyncedAt: stat.lastSyncedAt
    };

    res.json({
      success: true,
      data: activity
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

/**
 * GET /api/sms/clients/:clientId/stats
 * Get aggregated SMS stats (sent, delivered, failed) for a MauticClient
 * Role-based: users can only access clients they have permission to view
 */
router.get('/sms/clients/:clientId/stats', authenticate, canViewClients, async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);

    // Resolve MauticClient
    let mauticClient = await prisma.mauticClient.findUnique({
      where: { id: clientId },
      select: { id: true, clientId: true }
    });

    if (!mauticClient) {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        include: { mauticClient: { select: { id: true, clientId: true } } }
      });
      mauticClient = client?.mauticClient || null;
    }

    if (!mauticClient) {
      return res.json({ success: true, data: { totalSent: 0, delivered: 0, failed: 0, activeCampaigns: 0, totalCampaigns: 0 } });
    }

    // Role-based access: non-full-access users can only view their assigned clients
    if (!hasFullAccess(req.user)) {
      const accessibleClientIds = await getAccessibleClientIds(req.user.id, req.user);
      const linkedClientId = mauticClient.clientId;
      if (!linkedClientId || !accessibleClientIds.includes(linkedClientId)) {
        return res.status(403).json({ success: false, message: 'Access denied to this client' });
      }
    }

    const campaigns = await prisma.mauticSms.findMany({
      where: { clientId: mauticClient.id },
      select: { id: true, sentCount: true }
    });

    const campaignIds = campaigns.map(c => c.id);
    const activeCampaigns = campaigns.filter(c => c.sentCount > 0).length;

    const [totalSent, delivered, failed] = campaignIds.length > 0
      ? await Promise.all([
          prisma.mauticSmsStat.count({ where: { smsId: { in: campaignIds } } }),
          prisma.mauticSmsStat.count({ where: { smsId: { in: campaignIds }, isFailed: '0' } }),
          prisma.mauticSmsStat.count({ where: { smsId: { in: campaignIds }, isFailed: '1' } })
        ])
      : [0, 0, 0];

    res.json({
      success: true,
      data: {
        totalCampaigns: campaigns.length,
        activeCampaigns,
        totalSent,
        delivered,
        failed
      }
    });
  } catch (error) {
    logger.error('Failed to fetch SMS client stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch SMS stats', error: error.message });
  }
});

export default router;