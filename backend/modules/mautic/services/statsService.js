import prisma from '../../../prisma/client.js';
import logger from '../../../utils/logger.js';

class StatsService {
  static normalizeRate(value) {
    const num = parseFloat(value || 0);
    return isNaN(num) ? 0 : parseFloat(num.toFixed(2));
  }

  static calculateRate(numerator, denominator) {
    if (!denominator || denominator === 0) return 0;
    return parseFloat(((numerator / denominator) * 100).toFixed(2));
  }

  static buildDateFilter(fromDate, toDate) {
    const filter = {};
    if (fromDate || toDate) {
      filter.dateAdded = {};
      if (fromDate) {
        const from = new Date(fromDate);
        from.setHours(0, 0, 0, 0);
        filter.dateAdded.gte = from;
      }
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        filter.dateAdded.lte = to;
      }
    }
    return filter;
  }

  static formatStats(aggregateResult) {
    const sum = aggregateResult._sum || {};
    const avg = aggregateResult._avg || {};

    const sent = sum.sentCount || 0;
    const read = sum.readCount || 0;
    const clicked = sum.clickedCount || 0;
    const bounced = sum.bounced || 0;
    const unsubscribed = sum.unsubscribed || 0;

    return {
      sent,
      read,
      clicked,
      bounced,
      unsubscribed,
      openRate: this.calculateRate(read, sent),
      clickRate: this.calculateRate(clicked, sent),
      bounceRate: this.calculateRate(bounced, sent),
      unsubscribeRate: this.calculateRate(unsubscribed, sent),
      avgOpenRate: this.normalizeRate(avg.readRate),
      avgClickRate: this.normalizeRate(avg.clickRate),
      avgUnsubscribeRate: this.normalizeRate(avg.unsubscribeRate)
    };
  }

  async getApplicationStats(options = {}) {
    try {
      const { fromDate, toDate } = options;
      const dateFilter = StatsService.buildDateFilter(fromDate, toDate);

      const [
        emailAggregate,
        totalEmails,
        totalCampaigns,
        totalSegments,
        activeClients,
        allClients,
        topEmails
      ] = await Promise.all([
        prisma.mauticEmail.aggregate({
          where: dateFilter,
          _sum: {
            sentCount: true,
            readCount: true,
            clickedCount: true,
            bounced: true,
            unsubscribed: true
          },
          _avg: {
            readRate: true,
            clickRate: true,
            unsubscribeRate: true
          }
        }),
        prisma.mauticEmail.count({ where: dateFilter }),
        prisma.mauticCampaign.count(),
        prisma.mauticSegment.count(),
        prisma.mauticClient.count({ where: { isActive: true } }),
        prisma.mauticClient.findMany({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            lastSyncAt: true,
            totalEmails: true,
            totalCampaigns: true
          }
        }),
        prisma.mauticEmail.findMany({
          where: {
            ...dateFilter,
            sentCount: { gt: 0 }
          },
          orderBy: [
            { sentCount: 'desc' },
            { readRate: 'desc' }
          ],
          take: 10,
          select: {
            id: true,
            name: true,
            subject: true,
            sentCount: true,
            readCount: true,
            clickedCount: true,
            bounced: true,
            unsubscribed: true,
            readRate: true,
            clickRate: true,
            unsubscribeRate: true,
            client: {
              select: { id: true, name: true }
            }
          }
        })
      ]);

      const stats = StatsService.formatStats(emailAggregate);

      return {
        success: true,
        data: {
          overview: {
            totalClients: activeClients,
            totalCampaigns,
            totalEmails,
            totalSegments
          },
          stats,
          clients: allClients.map(c => ({
            id: c.id,
            name: c.name,
            lastSyncAt: c.lastSyncAt,
            emailCount: c.totalEmails || 0,
            campaignCount: c.totalCampaigns || 0
          })),
          topEmails: topEmails.map(e => ({
            id: e.id,
            name: e.name,
            subject: e.subject,
            clientId: e.client?.id,
            clientName: e.client?.name,
            sent: e.sentCount,
            read: e.readCount,
            clicked: e.clickedCount,
            bounced: e.bounced,
            unsubscribed: e.unsubscribed,
            openRate: StatsService.normalizeRate(e.readRate),
            clickRate: StatsService.normalizeRate(e.clickRate),
            unsubscribeRate: StatsService.normalizeRate(e.unsubscribeRate)
          }))
        }
      };
    } catch (error) {
      logger.error('Error fetching application stats:', error);
      throw new Error(`Failed to fetch application stats: ${error.message}`);
    }
  }

  async getClientStats(clientId, options = {}) {
    try {
      const { fromDate, toDate, includeCampaigns = true, page = 1, limit = 20 } = options;
      const dateFilter = StatsService.buildDateFilter(fromDate, toDate);
      const skip = (page - 1) * limit;

      const client = await prisma.mauticClient.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          name: true,
          mauticUrl: true,
          isActive: true,
          lastSyncAt: true,
          totalContacts: true,
          activeContacts30d: true
        }
      });

      if (!client) {
        return { success: false, message: 'Client not found' };
      }

      const emailAggregate = await prisma.mauticEmail.aggregate({
        where: { clientId, ...dateFilter },
        _sum: {
          sentCount: true,
          readCount: true,
          clickedCount: true,
          bounced: true,
          unsubscribed: true
        },
        _avg: {
          readRate: true,
          clickRate: true,
          unsubscribeRate: true
        }
      });

      const stats = StatsService.formatStats(emailAggregate);

      const [totalCampaigns, totalEmails, campaigns, topEmails] = await Promise.all([
        prisma.mauticCampaign.count({ where: { clientId } }),
        prisma.mauticEmail.count({ where: { clientId, ...dateFilter } }),
        includeCampaigns
          ? prisma.mauticCampaign.findMany({
              where: { clientId },
              skip,
              take: limit,
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                mauticCampaignId: true,
                name: true,
                isPublished: true,
                createdAt: true,
                description: true
              }
            })
          : [],
        prisma.mauticEmail.findMany({
          where: { clientId, ...dateFilter, sentCount: { gt: 0 } },
          orderBy: { sentCount: 'desc' },
          take: 10,
          select: {
            id: true,
            name: true,
            subject: true,
            sentCount: true,
            readCount: true,
            clickedCount: true,
            bounced: true,
            unsubscribed: true,
            readRate: true,
            clickRate: true,
            unsubscribeRate: true
          }
        })
      ]);

      const campaignStats = campaigns.map(c => ({
        id: c.id,
        mauticCampaignId: c.mauticCampaignId,
        name: c.name,
        description: c.description,
        isPublished: c.isPublished,
        createdAt: c.createdAt
      }));

      const emailStats = topEmails.map(e => ({
        id: e.id,
        name: e.name,
        subject: e.subject,
        stats: {
          sent: e.sentCount,
          read: e.readCount,
          clicked: e.clickedCount,
          bounced: e.bounced,
          unsubscribed: e.unsubscribed,
          openRate: StatsService.normalizeRate(e.readRate),
          clickRate: StatsService.normalizeRate(e.clickRate),
          unsubscribeRate: StatsService.normalizeRate(e.unsubscribeRate)
        }
      }));

      return {
        success: true,
        data: {
          client: {
            ...client,
            totalCampaigns,
            totalEmails
          },
          stats,
          campaigns: campaignStats,
          topEmails: emailStats,
          pagination: {
            page,
            limit,
            total: totalCampaigns,
            totalPages: Math.ceil(totalCampaigns / limit)
          }
        }
      };
    } catch (error) {
      logger.error('Error fetching client stats:', error);
      throw new Error(`Failed to fetch client stats: ${error.message}`);
    }
  }

  async getCampaignStats(campaignId, options = {}) {
    try {
      const { fromDate, toDate } = options;
      const dateFilter = StatsService.buildDateFilter(fromDate, toDate);

      const campaign = await prisma.mauticCampaign.findUnique({
        where: { id: campaignId },
        select: {
          id: true,
          mauticCampaignId: true,
          name: true,
          description: true,
          isPublished: true,
          publishUp: true,
          publishDown: true,
          createdAt: true,
          clientId: true,
          client: {
            select: { id: true, name: true }
          }
        }
      });

      if (!campaign) {
        return { success: false, message: 'Campaign not found' };
      }

      const emailAggregate = await prisma.mauticEmail.aggregate({
        where: { clientId: campaign.clientId, ...dateFilter },
        _sum: {
          sentCount: true,
          readCount: true,
          clickedCount: true,
          bounced: true,
          unsubscribed: true
        },
        _avg: {
          readRate: true,
          clickRate: true,
          unsubscribeRate: true
        }
      });

      const clientStats = StatsService.formatStats(emailAggregate);

      const totalEmailsForClient = await prisma.mauticEmail.count({
        where: { clientId: campaign.clientId }
      });

      return {
        success: true,
        data: {
          campaign: {
            id: campaign.id,
            mauticCampaignId: campaign.mauticCampaignId,
            name: campaign.name,
            description: campaign.description,
            isPublished: campaign.isPublished,
            publishUp: campaign.publishUp,
            publishDown: campaign.publishDown,
            createdAt: campaign.createdAt,
            clientId: campaign.client?.id,
            clientName: campaign.client?.name
          },
          clientStats,
          totalEmailsForClient,
          note: 'Stats shown are aggregated for all emails belonging to this campaign\'s client, as campaigns and emails are not directly linked in the current schema.'
        }
      };
    } catch (error) {
      logger.error('Error fetching campaign stats:', error);
      throw new Error(`Failed to fetch campaign stats: ${error.message}`);
    }
  }

  async getEmailStats(emailId, options = {}) {
    try {
      const { includeHistory = false, fromDate, toDate } = options;

      const email = await prisma.mauticEmail.findUnique({
        where: { id: emailId },
        include: {
          client: {
            select: { id: true, name: true }
          }
        }
      });

      if (!email) {
        return { success: false, message: 'Email not found' };
      }

      const stats = {
        sent: email.sentCount,
        read: email.readCount,
        clicked: email.clickedCount,
        bounced: email.bounced,
        unsubscribed: email.unsubscribed,
        openRate: StatsService.normalizeRate(email.readRate),
        clickRate: StatsService.normalizeRate(email.clickRate),
        bounceRate: StatsService.calculateRate(email.bounced, email.sentCount),
        unsubscribeRate: StatsService.normalizeRate(email.unsubscribeRate)
      };

      let history = [];
      if (includeHistory) {
        const dateFilter = StatsService.buildDateFilter(fromDate, toDate);
        const mauticEmailIdInt = parseInt(email.mauticEmailId);
        
        if (!isNaN(mauticEmailIdInt)) {
          const reportWhere = { 
            eId: mauticEmailIdInt,
            clientId: email.clientId
          };
          
          if (dateFilter.dateAdded) {
            reportWhere.dateSent = dateFilter.dateAdded;
          }

          const dailyStats = await prisma.mauticEmailReport.groupBy({
            by: ['dateSent'],
            where: reportWhere,
            _count: { id: true },
            orderBy: { dateSent: 'desc' },
            take: 30
          });

          const readStats = await prisma.mauticEmailReport.groupBy({
            by: ['dateSent'],
            where: {
              ...reportWhere,
              dateRead: { not: null }
            },
            _count: { id: true }
          });

          const readMap = new Map(readStats.map(r => [
            r.dateSent?.toISOString().split('T')[0],
            r._count.id
          ]));

          history = dailyStats.map(d => {
            const dateKey = d.dateSent?.toISOString().split('T')[0];
            const sent = d._count.id;
            const read = readMap.get(dateKey) || 0;
            return {
              date: dateKey,
              sent,
              read,
              openRate: StatsService.calculateRate(read, sent)
            };
          });
        }
      }

      return {
        success: true,
        data: {
          email: {
            id: email.id,
            mauticEmailId: email.mauticEmailId,
            name: email.name,
            subject: email.subject,
            emailType: email.emailType,
            isPublished: email.isPublished,
            dateAdded: email.dateAdded,
            publishUp: email.publishUp,
            publishDown: email.publishDown,
            clientId: email.client?.id,
            clientName: email.client?.name
          },
          stats,
          history
        }
      };
    } catch (error) {
      logger.error('Error fetching email stats:', error);
      throw new Error(`Failed to fetch email stats: ${error.message}`);
    }
  }
}

export default new StatsService();
