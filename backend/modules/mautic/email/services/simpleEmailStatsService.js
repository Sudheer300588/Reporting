import prisma from '../../../../prisma/client.js';
import logger from '../../../../utils/logger.js';
import mauticAPI from '../../mauticAPI.js';

class SimpleEmailStatsService {
  static toInt(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  static toRate(numerator, denominator) {
    if (!denominator) return 0;
    return Number(((numerator / denominator) * 100).toFixed(2));
  }

  static normalizeEmailsPayload(payload) {
    if (!payload) return [];

    const emails = payload.emails;
    if (Array.isArray(emails)) return emails;
    if (emails && typeof emails === 'object') return Object.values(emails);

    return [];
  }

  async fetchStats(apiClient, url) {
    try {
      const response = await apiClient.get(url);
      return response?.data || {};
    } catch (error) {
      logger.warn(`[SimpleEmailStats] Failed fetch: ${url} -> ${error.message}`);
      return {};
    }
  }

  async getActiveClients(clientIds = null) {
    return prisma.mauticClient.findMany({
      where: {
        isActive: true,
        reportId: { not: 'sms-only' },
        ...(clientIds ? { id: { in: clientIds } } : {})
      },
      select: {
        id: true,
        name: true,
        mauticUrl: true,
        username: true,
        password: true,
        totalContacts: true,
        totalCampaigns: true,
        totalSegments: true,
        totalEmails: true
      },
      orderBy: { name: 'asc' }
    });
  }

  async getEmailStatsForClient(client) {
    const apiClient = mauticAPI.createClient(client);

    const emailListResponse = await this.fetchStats(apiClient, '/emails?limit=500');
    const emails = SimpleEmailStatsService.normalizeEmailsPayload(emailListResponse);

    const processedEmails = [];

    for (const emailItem of emails) {
      const emailId = SimpleEmailStatsService.toInt(emailItem?.id);
      if (!emailId) continue;

      const emailInfo = await this.fetchStats(apiClient, `/emails/${emailId}`);
      const bounceRes = await this.fetchStats(
        apiClient,
        `/stats/email_stats?where[0][col]=email_id&where[0][expr]=eq&where[0][val]=${emailId}&where[1][col]=is_failed&where[1][expr]=eq&where[1][val]=1`
      );
      const unsubRes = await this.fetchStats(
        apiClient,
        `/stats/lead_event_log?where[0][col]=bundle&where[0][expr]=eq&where[0][val]=email&where[1][col]=object_id&where[1][expr]=eq&where[1][val]=${emailId}&where[2][col]=action&where[2][expr]=eq&where[2][val]=unsubscribed`
      );
      const clicksRes = await this.fetchStats(
        apiClient,
        `/stats/channel_url_trackables?where[0][col]=channel_id&where[0][expr]=eq&where[0][val]=${emailId}`
      );

      let totalClicks = 0;
      let totalUniqueClicks = 0;
      const clickBreakdown = [];

      if (Array.isArray(clicksRes?.stats)) {
        for (const link of clicksRes.stats) {
          const hits = SimpleEmailStatsService.toInt(link?.hits);
          const uniqueHits = SimpleEmailStatsService.toInt(link?.unique_hits);

          totalClicks += hits;
          totalUniqueClicks += uniqueHits;

          clickBreakdown.push({
            redirectId: String(link?.redirect_id || ''),
            url: link?.url || null,
            hits,
            uniqueHits
          });
        }
      }

      const info = emailInfo?.email || {};
      const sent = SimpleEmailStatsService.toInt(info?.sentCount);
      const opens = SimpleEmailStatsService.toInt(info?.readCount);
      const bounces = SimpleEmailStatsService.toInt(bounceRes?.total);
      const unsubscribes = SimpleEmailStatsService.toInt(unsubRes?.total);

      processedEmails.push({
        mauticEmailId: String(emailId),
        emailId,
        name: info?.name || emailItem?.name || 'Unknown',
        subject: info?.subject || emailItem?.subject || null,
        emailType: info?.emailType || emailItem?.emailType || null,
        dateAdded: info?.dateAdded || emailItem?.dateAdded || null,
        isPublished: Boolean(info?.isPublished ?? emailItem?.isPublished ?? false),
        publishUp: info?.publishUp || emailItem?.publishUp || null,
        publishDown: info?.publishDown || emailItem?.publishDown || null,
        sent,
        opens,
        totalClicks,
        uniqueClicks: totalUniqueClicks,
        bounces,
        unsubscribes,
        clickBreakdown
      });
    }

    return processedEmails;
  }

  async persistClientEmailStats(client, emails) {
    let totalSent = 0;
    let totalRead = 0;
    let totalClicked = 0;
    let totalUniqueClicks = 0;
    let totalBounced = 0;
    let totalUnsubscribed = 0;

    for (const email of emails) {
      totalSent += email.sent;
      totalRead += email.opens;
      totalClicked += email.totalClicks;
      totalUniqueClicks += email.uniqueClicks;
      totalBounced += email.bounces;
      totalUnsubscribed += email.unsubscribes;

      await prisma.$transaction(async (tx) => {
        await tx.mauticEmail.upsert({
          where: {
            clientId_mauticEmailId: {
              clientId: client.id,
              mauticEmailId: email.mauticEmailId
            }
          },
          update: {
            name: email.name,
            subject: email.subject,
            emailType: email.emailType,
            dateAdded: email.dateAdded ? new Date(email.dateAdded) : null,
            sentCount: email.sent,
            readCount: email.opens,
            clickedCount: email.totalClicks,
            uniqueClicks: email.uniqueClicks,
            unsubscribed: email.unsubscribes,
            bounced: email.bounces,
            readRate: SimpleEmailStatsService.toRate(email.opens, email.sent),
            clickRate: SimpleEmailStatsService.toRate(email.totalClicks, email.sent),
            unsubscribeRate: SimpleEmailStatsService.toRate(email.unsubscribes, email.sent),
            isPublished: email.isPublished,
            publishUp: email.publishUp ? new Date(email.publishUp) : null,
            publishDown: email.publishDown ? new Date(email.publishDown) : null
          },
          create: {
            clientId: client.id,
            mauticEmailId: email.mauticEmailId,
            name: email.name,
            subject: email.subject,
            emailType: email.emailType,
            dateAdded: email.dateAdded ? new Date(email.dateAdded) : null,
            sentCount: email.sent,
            readCount: email.opens,
            clickedCount: email.totalClicks,
            uniqueClicks: email.uniqueClicks,
            unsubscribed: email.unsubscribes,
            bounced: email.bounces,
            readRate: SimpleEmailStatsService.toRate(email.opens, email.sent),
            clickRate: SimpleEmailStatsService.toRate(email.totalClicks, email.sent),
            unsubscribeRate: SimpleEmailStatsService.toRate(email.unsubscribes, email.sent),
            isPublished: email.isPublished,
            publishUp: email.publishUp ? new Date(email.publishUp) : null,
            publishDown: email.publishDown ? new Date(email.publishDown) : null
          }
        });

        await tx.mauticClickTrackable.deleteMany({
          where: {
            clientId: client.id,
            channelId: email.emailId
          }
        });

        if (email.clickBreakdown.length > 0) {
          await tx.mauticClickTrackable.createMany({
            data: email.clickBreakdown.map((click, index) => ({
              clientId: client.id,
              channelId: email.emailId,
              redirectId: click.redirectId || `${email.emailId}-fallback-${index + 1}`,
              hits: click.hits,
              uniqueHits: click.uniqueHits,
              url: click.url
            })),
            skipDuplicates: true
          });
        }
      });
    }

    await prisma.mauticClient.update({
      where: { id: client.id },
      data: {
        totalEmails: emails.length,
        lastSyncAt: new Date()
      }
    });

    return {
      clientId: client.id,
      clientName: client.name,
      totalEmails: emails.length,
      totalSent,
      totalRead,
      totalClicked,
      totalUniqueClicks,
      totalBounced,
      totalUnsubscribed
    };
  }

  async refreshAndStoreStats({ clientIds = null } = {}) {
    const clients = await this.getActiveClients(clientIds);
    const clientSummaries = [];

    for (const client of clients) {
      try {
        logger.info(`[SimpleEmailStats] Sync start for client ${client.name} (${client.id})`);
        const emails = await this.getEmailStatsForClient(client);
        const summary = await this.persistClientEmailStats(client, emails);
        clientSummaries.push(summary);
      } catch (error) {
        logger.error(`[SimpleEmailStats] Sync failed for client ${client.name} (${client.id}):`, error);
      }
    }

    const stored = await this.getStoredStats({ clientIds: clients.map((c) => c.id) });

    return {
      ...stored,
      syncSummary: {
        syncedClients: clientSummaries.length,
        clientSummaries
      }
    };
  }

  async getStoredStats({ clientIds = null } = {}) {
    const clients = await this.getActiveClients(clientIds);
    const activeClientIds = clients.map((c) => c.id);

    if (activeClientIds.length === 0) {
      return {
        overview: {
          totalClients: 0,
          totalEmails: 0,
          totalCampaigns: 0,
          totalSegments: 0,
          totalContacts: 0,
          clientsData: []
        },
        emailStats: {
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
        },
        fetchedAt: new Date().toISOString()
      };
    }

    const [emailAggregate, topEmails] = await Promise.all([
      prisma.mauticEmail.aggregate({
        where: { clientId: { in: activeClientIds } },
        _sum: {
          sentCount: true,
          readCount: true,
          clickedCount: true,
          uniqueClicks: true,
          bounced: true,
          unsubscribed: true
        }
      }),
      prisma.mauticEmail.findMany({
        where: {
          clientId: { in: activeClientIds },
          sentCount: { gt: 0 }
        },
        include: {
          client: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: {
          sentCount: 'desc'
        },
        take: 12
      })
    ]);

    const totalSent = emailAggregate?._sum?.sentCount || 0;
    const totalRead = emailAggregate?._sum?.readCount || 0;
    const totalClicked = emailAggregate?._sum?.clickedCount || 0;
    const totalUniqueClicks = emailAggregate?._sum?.uniqueClicks || 0;
    const totalBounced = emailAggregate?._sum?.bounced || 0;
    const totalUnsubscribed = emailAggregate?._sum?.unsubscribed || 0;

    return {
      overview: {
        totalClients: clients.length,
        totalEmails: clients.reduce((sum, c) => sum + (c.totalEmails || 0), 0),
        totalCampaigns: clients.reduce((sum, c) => sum + (c.totalCampaigns || 0), 0),
        totalSegments: clients.reduce((sum, c) => sum + (c.totalSegments || 0), 0),
        totalContacts: clients.reduce((sum, c) => sum + (c.totalContacts || 0), 0),
        clientsData: clients.map((c) => ({
          id: c.id,
          name: c.name,
          totalContacts: c.totalContacts || 0,
          totalEmails: c.totalEmails || 0,
          totalCampaigns: c.totalCampaigns || 0,
          totalSegments: c.totalSegments || 0
        }))
      },
      emailStats: {
        totalSent,
        totalRead,
        totalClicked,
        totalUniqueClicks,
        totalBounced,
        totalUnsubscribed,
        openRate: SimpleEmailStatsService.toRate(totalRead, totalSent),
        clickRate: SimpleEmailStatsService.toRate(totalClicked, totalSent),
        bounceRate: SimpleEmailStatsService.toRate(totalBounced, totalSent),
        unsubscribeRate: SimpleEmailStatsService.toRate(totalUnsubscribed, totalSent),
        avgReadRate: SimpleEmailStatsService.toRate(totalRead, totalSent),
        avgClickRate: SimpleEmailStatsService.toRate(totalClicked, totalSent),
        avgUnsubscribeRate: SimpleEmailStatsService.toRate(totalUnsubscribed, totalSent),
        topEmails: topEmails.map((email) => ({
          id: email.id,
          emailId: email.mauticEmailId,
          name: email.name,
          clientId: email.client?.id,
          clientName: email.client?.name || 'Unknown',
          sent: email.sentCount || 0,
          read: email.readCount || 0,
          clicked: email.clickedCount || 0,
          uniqueClicks: email.uniqueClicks || 0,
          bounced: email.bounced || 0,
          unsubscribed: email.unsubscribed || 0,
          openRate: SimpleEmailStatsService.toRate(email.readCount || 0, email.sentCount || 0),
          clickRate: SimpleEmailStatsService.toRate(email.clickedCount || 0, email.sentCount || 0),
          unsubscribeRate: SimpleEmailStatsService.toRate(email.unsubscribed || 0, email.sentCount || 0)
        }))
      },
      fetchedAt: new Date().toISOString()
    };
  }
}

export default new SimpleEmailStatsService();
