import prisma from '../../../prisma/client.js';
import logger from '../../../utils/logger.js';

class SmsService {
  /**
   * Fetch SMS campaigns from Mautic API
   * @param {Object} apiClient - Axios client configured for Mautic API
   * @returns {Promise<Array>} Array of SMS campaigns
   */
  async fetchSmsCampaigns(apiClient) {
    try {
      logger.info('Fetching SMS campaigns from Mautic API');
      
      const response = await apiClient.get('/smses', {
        params: {
          limit: 999,
          orderBy: 'name',
          orderByDir: 'asc'
        }
      });

      const smses = response.data?.smses || [];
      logger.info(`Fetched ${smses.length} SMS campaigns`);
      
      return Object.values(smses).map(sms => ({
        id: sms.id,
        name: sms.name,
        category: sms.category || null,
        sentCount: sms.sentCount || 0
      }));
    } catch (error) {
      logger.error('Failed to fetch SMS campaigns:', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch SMS delivery statistics
   * @param {Object} apiClient - Axios client configured for Mautic API
   * @param {number} smsId - Mautic SMS campaign ID
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} SMS statistics data
   */
  async fetchSmsStats(apiClient, smsId, options = {}) {
    try {
      const { page = 1, limit = 100 } = options;
      
      logger.info(`Fetching SMS stats for campaign ${smsId}`, { page, limit });

      const response = await apiClient.get('/stats/sms_message_stats', {
        params: {
          'where[0][col]': 'sms_id',
          'where[0][expr]': 'eq',
          'where[0][val]': smsId,
          start: (page - 1) * limit,
          limit: limit,
          orderBy: 'date_sent',
          orderByDir: 'desc'
        }
      });

      // Mautic SMS stats endpoint returns 'stats' or 'results'
      const stats = response.data?.stats || response.data?.results || response.data?.data || [];
      const totalRecords = response.data?.total || stats.length || 0;

      return {
        stats: stats.map(stat => ({
          id: stat.id,
          lead_id: stat.lead_id,
          date_sent: stat.date_sent,
          is_failed: stat.is_failed || '0'
        })),
        totalRecords,
        page,
        limit
      };
    } catch (error) {
      logger.error(`Failed to fetch SMS stats for campaign ${smsId}:`, { error: error.message });
      // Return empty stats (non-fatal)
      return {
        stats: [],
        totalRecords: 0,
        page: options.page || 1,
        limit: options.limit || 100
      };
    }
  }

  /**
   * Store SMS campaigns in database
   * @param {number} clientId - Client ID
   * @param {Array} smsCampaigns - Array of SMS campaigns from Mautic
   * @returns {Promise<Object>} Save result statistics
   */
  async storeSmsCampaigns(clientId, smsCampaigns) {
    try {
      logger.info(`Storing ${smsCampaigns.length} SMS campaigns for client ${clientId}`);

      let created = 0;
      let updated = 0;

      for (const campaign of smsCampaigns) {
        const existing = await prisma.mauticSms.findUnique({
          where: {
            clientId_mauticId: {
              clientId,
              mauticId: String(campaign.id)
            }
          }
        });

        if (existing) {
          await prisma.mauticSms.update({
            where: { id: existing.id },
            data: {
              name: campaign.name,
              category: campaign.category ? JSON.stringify(campaign.category) : null,
              sentCount: campaign.sentCount || 0,
              updatedAt: new Date()
            }
          });
          updated++;
        } else {
          await prisma.mauticSms.create({
            data: {
              clientId,
              mauticId: String(campaign.id),
              name: campaign.name,
              category: campaign.category ? JSON.stringify(campaign.category) : null,
              sentCount: campaign.sentCount || 0
            }
          });
          created++;
        }
      }

      logger.info(`SMS campaigns stored: ${created} created, ${updated} updated`);
      return { created, updated, total: created + updated };
    } catch (error) {
      logger.error('Failed to store SMS campaigns:', { error: error.message });
      throw error;
    }
  }

  /**
   * Store SMS delivery statistics in database
   * @param {number} clientId - Client ID
   * @param {number} smsId - Database ID of the MauticSms record
   * @param {Array} stats - Array of delivery stats
   * @returns {Promise<Object>} Save result statistics
   */
  async storeSmsStats(clientId, smsId, stats) {
    try {
      logger.info(`Storing ${stats.length} SMS stats for SMS ${smsId}, client ${clientId}`);

      let created = 0;
      let skipped = 0;

      for (const stat of stats) {
        try {
          // Check if this stat already exists
          const existing = await prisma.mauticSmsStat.findFirst({
            where: {
              mauticSmsId: smsId,
              leadId: parseInt(stat.lead_id),
              dateSent: new Date(stat.date_sent)
            }
          });

          if (!existing) {
            await prisma.mauticSmsStat.create({
              data: {
                mauticSmsId: smsId,
                leadId: parseInt(stat.lead_id),
                dateSent: new Date(stat.date_sent),
                isFailed: stat.is_failed === '1' ? true : false
              }
            });
            created++;
          } else {
            skipped++;
          }
        } catch (err) {
          logger.warn(`Failed to store individual SMS stat:`, { error: err.message });
          skipped++;
        }
      }

      logger.info(`SMS stats stored: ${created} created, ${skipped} skipped`);
      return { created, skipped, total: created + skipped };
    } catch (error) {
      logger.error('Failed to store SMS stats:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get SMS campaign statistics with pagination
   * @param {number} smsId - Database ID of the MauticSms record
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Campaign stats with pagination
   */
  async getCampaignStats(smsId, options = {}) {
    try {
      const { page = 1, limit = 100 } = options;
      const skip = (page - 1) * limit;

      // Get the SMS campaign details
      const smsCampaign = await prisma.mauticSms.findUnique({
        where: { id: smsId },
        select: {
          id: true,
          name: true,
          mauticId: true,
          sentCount: true
        }
      });

      if (!smsCampaign) {
        return { success: false, message: 'SMS campaign not found' };
      }

      // Get paginated stats
      const stats = await prisma.mauticSmsStat.findMany({
        where: { mauticSmsId: smsId },
        select: {
          id: true,
          leadId: true,
          dateSent: true,
          isFailed: true
        },
        orderBy: { dateSent: 'desc' },
        skip,
        take: limit
      });

      // Get totals
      const totalRecords = await prisma.mauticSmsStat.count({
        where: { mauticSmsId: smsId }
      });

      const totalFailed = await prisma.mauticSmsStat.count({
        where: { mauticSmsId: smsId, isFailed: true }
      });

      const totalSuccessful = totalRecords - totalFailed;

      return {
        success: true,
        campaignName: smsCampaign.name,
        campaignId: smsCampaign.mauticId,
        stats: stats.map(s => ({
          id: s.id,
          lead_id: s.leadId,
          date_sent: s.dateSent.toISOString(),
          is_failed: s.isFailed ? '1' : '0'
        })),
        totalRecords,
        totalSuccessful,
        totalFailed,
        page,
        limit
      };
    } catch (error) {
      logger.error('Failed to get campaign stats:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get all SMS campaigns for a client
   * @param {number} clientId - Client ID
   * @returns {Promise<Array>} Array of SMS campaigns
   */
  async getClientSmsCampaigns(clientId) {
    try {
      const campaigns = await prisma.mauticSms.findMany({
        where: { clientId },
        select: {
          id: true,
          mauticId: true,
          name: true,
          category: true,
          sentCount: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return campaigns.map(c => ({
        ...c,
        category: c.category ? JSON.parse(c.category) : null
      }));
    } catch (error) {
      logger.error('Failed to get client SMS campaigns:', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch SMS messages and replies for a specific contact from Mautic API
   * @param {Object} apiClient - Mautic API client
   * @param {number} contactId - Contact/Lead ID
   * @returns {Promise<Array>} Array of message events with full details
   */
  async fetchContactActivity(apiClient, contactId) {
    try {
      logger.info(`Fetching contact activity for contact ${contactId}`);

      // Fetch contact details and activity timeline
      const [contactResponse, activityResponse] = await Promise.all([
        apiClient.get(`/contacts/${contactId}`).catch(() => null),
        apiClient.get(`/contacts/${contactId}/activity`)
      ]);

      if (!activityResponse?.data?.events) {
        logger.warn(`No activity found for contact ${contactId}`);
        return [];
      }

      const events = activityResponse.data.events || [];
      
      // Filter for SMS events (sms.sent, sms_reply)
      const smsEvents = events.filter(event => 
        event.event === 'sms.sent' || event.event === 'sms_reply'
      );

      return smsEvents;
    } catch (error) {
      logger.error(`Failed to fetch contact activity for contact ${contactId}:`, { error: error.message });
      return [];
    }
  }

  /**
   * Store SMS messages and replies from activity events
   * @param {number} clientId - Client ID
   * @param {number} contactId - Contact/Lead ID
   * @param {Array} events - Activity events from Mautic
   * @returns {Promise<Object>} Storage result statistics
   */
  async storeSmsMessages(clientId, contactId, events) {
    try {
      logger.info(`Storing ${events.length} SMS messages for contact ${contactId}, client ${clientId}`);

      let created = 0;
      let skipped = 0;

      for (const event of events) {
        try {
          const type = event.event === 'sms.sent' ? 'sent' : 'reply';
          const message = event.details?.stat?.message || event.details?.message || '';
          
          if (!message) {
            logger.warn(`Skipping event with no message: ${event.event}`);
            skipped++;
            continue;
          }

          // Extract SMS campaign ID if available
          const mauticSmsId = event.details?.stat?.sms_id ? parseInt(event.details.stat.sms_id) : null;

          // Find the database record for this SMS campaign if mauticSmsId provided
          let smsId = null;
          if (mauticSmsId) {
            const smsCampaign = await prisma.mauticSms.findFirst({
              where: {
                clientId,
                mauticId: mauticSmsId.toString()
              },
              select: { id: true }
            });
            smsId = smsCampaign?.id;
          }

          // Upsert the message to avoid duplicates
          const existing = await prisma.mauticSmsMessage.findFirst({
            where: {
              contactId,
              mauticSmsId: smsId,
              type,
              dateSent: new Date(event.timestamp)
            }
          });

          if (!existing) {
            await prisma.mauticSmsMessage.create({
              data: {
                contactId,
                mauticSmsId: smsId,
                type,
                message,
                dateSent: new Date(event.timestamp),
                isFailed: event.details?.stat?.is_failed === 1 || event.details?.stat?.is_failed === true ? true : false
              }
            });
            created++;
          } else {
            skipped++;
          }
        } catch (err) {
          logger.warn(`Failed to store individual SMS message:`, { error: err.message });
          skipped++;
        }
      }

      logger.info(`SMS messages stored: ${created} created, ${skipped} skipped`);
      return { created, skipped, total: created + skipped };
    } catch (error) {
      logger.error('Failed to store SMS messages:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get SMS campaign contact activity from database
   * @param {number} contactId - Contact/Lead ID
   * @param {number} smsId - SMS campaign ID (optional, for filtering)
   * @returns {Promise<Object>} Contact activity data
   */
  async getContactActivity(contactId, smsId = null) {
    try {
      // Fetch messages and replies from the database
      const where = { contactId };
      if (smsId) {
        where.mauticSmsId = smsId;
      }

      const messages = await prisma.mauticSmsMessage.findMany({
        where,
        include: { mauticSms: true },
        orderBy: { dateSent: 'desc' }
      });

      // Transform to event format expected by frontend
      const events = messages.map(msg => ({
        event: msg.type === 'sent' ? 'sms.sent' : 'sms_reply',
        eventId: msg.id,
        timestamp: msg.dateSent.toISOString(),
        details: {
          message: msg.message
        },
        isFailed: msg.isFailed
      }));

      return {
        success: true,
        contactId,
        events
      };
    } catch (error) {
      logger.error('Failed to get contact activity:', { error: error.message });
      throw error;
    }
  }
}

export default new SmsService();
