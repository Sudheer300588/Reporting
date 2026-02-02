import prisma from '../../../prisma/client.js';
import logger from '../../../utils/logger.js';

class SmsService {
  // ─────────────────────────────────────────────
  // FETCHING FROM MAUTIC
  // ─────────────────────────────────────────────

  async fetchSmsCampaigns(apiClient) {
    try {
      logger.info('Fetching SMS campaigns from Mautic API');
      const response = await apiClient.get('/smses', {
        params: { limit: 999, orderBy: 'name', orderByDir: 'asc' }
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
          limit,
          orderBy: 'date_sent',
          orderByDir: 'desc'
        }
      });

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
      return { stats: [], totalRecords: 0, page: options.page || 1, limit: options.limit || 100 };
    }
  }

  // ─────────────────────────────────────────────
  // DATABASE PERSISTENCE (CAMPAIGNS + STATS)
  // ─────────────────────────────────────────────

  async storeSmsCampaigns(clientId, smsCampaigns) {
    try {
      logger.info(`Storing ${smsCampaigns.length} SMS campaigns for client ${clientId}`);
      let created = 0, updated = 0;

      for (const campaign of smsCampaigns) {
        const existing = await prisma.mauticSms.findUnique({
          where: { clientId_mauticId: { clientId, mauticId: String(campaign.id) } }
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

  async storeSmsStats(clientId, smsId, stats) {
    try {
      logger.info(`Storing ${stats.length} SMS stats for SMS ${smsId}, client ${clientId}`);
      let created = 0, skipped = 0;

      for (const stat of stats) {
        try {
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
                isFailed: stat.is_failed === '1'
              }
            });
            created++;
          } else skipped++;
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

  // ─────────────────────────────────────────────
  // ON-DEMAND ACTIVITY FETCH (NO DATABASE)
  // ─────────────────────────────────────────────

  /**
   * Fetch SMS messages & replies for a contact (without storing)
   * Optionally filters messages for a specific campaign (smsId)
   */
  async fetchContactSmsActivity(apiClient, contactId, smsId = null) {
    try {
      logger.info(`Fetching on-demand SMS activity for contact ${contactId}`);
      const res = await apiClient.get(`/contacts/${contactId}/activity`);
      const events = res.data?.events || [];
      if (!events.length) return [];

      const smsEvents = events.filter(
        e =>
          e.event === 'sms.sent' ||
          e.event === 'sms_reply'
      );

      // Optional: filter by campaign smsId (using Mautic’s sms_id field)
      const filtered = smsId
        ? smsEvents.filter(e => String(e.details?.stat?.sms_id || '') === String(smsId))
        : smsEvents;

      logger.info(`Found ${filtered.length} SMS events for contact ${contactId}${smsId ? ` (campaign ${smsId})` : ''}`);
      return filtered;
    } catch (error) {
      logger.error(`Failed to fetch SMS activity for contact ${contactId}:`, { error: error.message });
      return [];
    }
  }

  // ─────────────────────────────────────────────
  // UTILITY QUERIES
  // ─────────────────────────────────────────────

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

  async getCampaignStats(smsId, options = {}) {
    try {
      const { page = 1, limit = 100 } = options;
      const skip = (page - 1) * limit;

      const smsCampaign = await prisma.mauticSms.findUnique({
        where: { id: smsId },
        select: { id: true, name: true, mauticId: true, sentCount: true }
      });
      if (!smsCampaign) return { success: false, message: 'SMS campaign not found' };

      const stats = await prisma.mauticSmsStat.findMany({
        where: { mauticSmsId: smsId },
        select: { id: true, leadId: true, dateSent: true, isFailed: true },
        orderBy: { dateSent: 'desc' },
        skip,
        take: limit
      });

      const totalRecords = await prisma.mauticSmsStat.count({ where: { mauticSmsId: smsId } });
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
}

export default new SmsService();
