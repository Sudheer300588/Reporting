import prisma from '../../../prisma/client.js';
import { Prisma } from '@prisma/client';

class MauticDataService {
  /**
   * Get cached email stats for multiple emails
   * @param {number} clientId - Client ID
   * @param {Array<number>} emailIds - Array of Mautic email IDs
   * @returns {Promise<Object>} Object mapping emailId to stats
   */
  async getCachedEmailStats(clientId, emailIds) {
    try {
      const cached = await prisma.mauticEmailStatsCache.findMany({
        where: {
          clientId: clientId,
          mauticEmailId: { in: emailIds }
        }
      });

      const result = {};
      cached.forEach(stat => {
        result[stat.mauticEmailId] = {
          EmailID: stat.mauticEmailId,
          TotalSent: stat.totalSent,
          TotalOpened: stat.totalOpened,
          TotalBounced: stat.totalBounced,
          TotalUnsubscribed: stat.totalUnsubscribed,
          TotalClicks: stat.totalClicks,
          OpenRate: parseFloat(stat.openRate).toFixed(2),
          ClickRate: parseFloat(stat.clickRate).toFixed(2),
          BounceRate: parseFloat(stat.bounceRate).toFixed(2)
        };
      });

      return result;
    } catch (error) {
      console.error('Error getting cached email stats:', error);
      return {};
    }
  }

  /**
   * Cache email stats for multiple emails
   * @param {number} clientId - Client ID
   * @param {Object} statsData - Object mapping emailId to stats object
   * @returns {Promise<number>} Number of cached records
   */
  async cacheEmailStats(clientId, statsData) {
    try {
      const records = Object.entries(statsData).map(([emailId, stats]) => ({
        clientId: clientId,
        mauticEmailId: parseInt(emailId),
        totalSent: stats.TotalSent || 0,
        totalOpened: stats.TotalOpened || 0,
        totalBounced: stats.TotalBounced || 0,
        totalUnsubscribed: stats.TotalUnsubscribed || 0,
        totalClicks: stats.TotalClicks || 0,
        openRate: new Prisma.Decimal(stats.OpenRate || 0),
        clickRate: new Prisma.Decimal(stats.ClickRate || 0),
        bounceRate: new Prisma.Decimal(stats.BounceRate || 0),
        cachedAt: new Date()
      }));

      const result = await prisma.mauticEmailStatsCache.createMany({
        data: records,
        skipDuplicates: true
      });

      return result.count;
    } catch (error) {
      console.error('Error caching email stats:', error);
      return 0;
    }
  }

  /**
   * Save emails to database using BULK INSERT (1000x faster!)
   * @param {number} clientId - Client ID
   * @param {Array} emails - Array of email objects from Mautic API
   * @returns {Promise<Object>} Save results
   */
  async saveEmails(clientId, emails) {
    try {
      console.log(`💾 BULK SAVING ${emails.length} emails for client ${clientId}...`);

      if (emails.length === 0) {
        console.log(`✅ No emails to save`);
        return { success: true, created: 0, updated: 0, total: 0 };
      }

      let totalCreated = 0;
      let totalUpdated = 0;
      const now = new Date();

      // Process emails using upsert to update existing records
      // NOTE: clickCount is NOT available in Mautic /api/emails response
      // It must be calculated from MauticClickTrackable and updated separately
      for (const email of emails) {
        const sentCount = parseInt(email.sentCount || 0, 10);
        const readCount = parseInt(email.readCount || 0, 10);
        const unsubscribeCount = parseInt(email.unsubscribeCount || 0, 10);
        const bounceCount = parseInt(email.bounceCount || 0, 10);

        const emailData = {
          mauticEmailId: String(email.id),
          name: email.name || '',
          subject: email.subject || null,
          emailType: email.emailType || null,
          isPublished: email.isPublished || false,
          publishUp: email.publishUp ? new Date(email.publishUp) : null,
          publishDown: email.publishDown ? new Date(email.publishDown) : null,
          sentCount: sentCount,
          readCount: readCount,
          // clickedCount and uniqueClicks will be updated later from MauticClickTrackable aggregation
          unsubscribed: unsubscribeCount,
          bounced: bounceCount,
          readRate: sentCount > 0 ? new Prisma.Decimal((readCount / sentCount * 100).toFixed(2)) : new Prisma.Decimal(0),
          // clickRate will be calculated after clickedCount is updated from click trackables
          unsubscribeRate: sentCount > 0 ? new Prisma.Decimal((unsubscribeCount / sentCount * 100).toFixed(2)) : new Prisma.Decimal(0),
          clientId: clientId,
          dateAdded: email.dateAdded ? new Date(email.dateAdded) : now,
          createdAt: now,
          updatedAt: now
        };

        try {
          await prisma.mauticEmail.upsert({
            where: {
              clientId_mauticEmailId: {
                clientId: clientId,
                mauticEmailId: String(email.id)
              }
            },
            update: {
              ...emailData,
              updatedAt: now
            },
            create: emailData
          });
          totalCreated++;
        } catch (error) {
          console.error(`Failed to upsert email ${email.id}:`, error.message);
        }
      }

      totalUpdated = emails.length;

      // Update client email count
      await prisma.mauticClient.update({
        where: { id: clientId },
        data: { totalEmails: emails.length }
      });

      console.log(`✅ UPSERT DONE: ${emails.length} emails processed`);

      return {
        success: true,
        created: totalCreated,
        updated: totalUpdated,
        total: emails.length
      };
    } catch (error) {
      console.error('Error saving emails:', error);
      throw new Error(`Failed to save emails: ${error.message}`);
    }
  }

  /**
   * Save campaigns to database using BULK INSERT (1000x faster!)
   * @param {number} clientId - Client ID
   * @param {Array} campaigns - Array of campaign objects from Mautic API
   * @returns {Promise<Object>} Save results
   */
  async saveCampaigns(clientId, campaigns) {
    try {
      console.log(`\n💾 BULK SAVING ${campaigns.length} campaigns for client ${clientId}...`);
      console.log(`   Campaign IDs: ${campaigns.map(c => c.id).join(', ')}`);

      if (campaigns.length === 0) {
        console.log(`✅ No campaigns to save`);
        return { success: true, created: 0, updated: 0, total: 0 };
      }

      let totalCreated = 0;
      const BATCH_SIZE = 5000; // ⚡ ULTRA MASSIVE batches for 1000x speed!
      const now = new Date();

      // Process in ULTRA HUGE batches using createMany with skipDuplicates
      for (let i = 0; i < campaigns.length; i += BATCH_SIZE) {
        const batch = campaigns.slice(i, i + BATCH_SIZE);

        const campaignData = batch.map(campaign => {
          // Extract category - handle both object and string formats
          let categoryValue = null;
          if (campaign.category) {
            if (typeof campaign.category === 'string') {
              categoryValue = campaign.category;
            } else if (typeof campaign.category === 'object') {
              categoryValue = campaign.category.title || campaign.category.alias || campaign.category.name || null;
            }
          }

          return {
            mauticCampaignId: String(campaign.id),
            name: campaign.name || '',
            description: campaign.description || null,
            isPublished: campaign.isPublished || false,
            publishUp: campaign.publishUp ? new Date(campaign.publishUp) : null,
            publishDown: campaign.publishDown ? new Date(campaign.publishDown) : null,
            dateAdded: campaign.dateAdded ? new Date(campaign.dateAdded) : null,
            createdBy: campaign.createdBy ? String(campaign.createdBy) : null,
            category: categoryValue,
            allowRestart: campaign.allowRestart || false,
            clientId: clientId,
            createdAt: now,
            updatedAt: now
          };
        });

        const result = await prisma.mauticCampaign.createMany({
          data: campaignData,
          skipDuplicates: true
        });

        totalCreated += result.count;
        console.log(`   Processed ${Math.min(i + BATCH_SIZE, campaigns.length)}/${campaigns.length} campaigns (${totalCreated} new)...`);
      }

      // Update client campaign count
      await prisma.mauticClient.update({
        where: { id: clientId },
        data: { totalCampaigns: campaigns.length }
      });

      console.log(`✅ BULK INSERT DONE: ${totalCreated} new campaigns (${campaigns.length - totalCreated} duplicates skipped)`);

      return {
        success: true,
        created: totalCreated,
        updated: 0,
        failed: 0,
        total: campaigns.length
      };
    } catch (error) {
      console.error('Error saving campaigns:', error);
      throw new Error(`Failed to save campaigns: ${error.message}`);
    }
  }

  /**
   * Save segments to database using BULK INSERT (1000x faster!)
   * @param {number} clientId - Client ID
   * @param {Array} segments - Array of segment objects from Mautic API
   * @returns {Promise<Object>} Save results
   */
  async saveSegments(clientId, segments) {
    try {
      console.log(`💾 BULK SAVING ${segments.length} segments for client ${clientId}...`);

      if (segments.length === 0) {
        console.log(`✅ No segments to save`);
        return { success: true, created: 0, updated: 0, total: 0 };
      }

      let totalCreated = 0;
      const BATCH_SIZE = 5000; // ⚡ ULTRA MASSIVE batches for 1000x speed!
      const now = new Date();

      // Process in ULTRA HUGE batches using createMany with skipDuplicates
      for (let i = 0; i < segments.length; i += BATCH_SIZE) {
        const batch = segments.slice(i, i + BATCH_SIZE);

        const segmentData = batch.map(segment => ({
          mauticSegmentId: String(segment.id),
          name: segment.name || '',
          alias: segment.alias || null,
          description: segment.description || null,
          isPublished: segment.isPublished || false,
          filters: segment.filters || null,
          contactCount: segment.leadCount || 0,
          clientId: clientId,
          importedAt: now,
          createdAt: now,
          updatedAt: now
        }));

        const result = await prisma.mauticSegment.createMany({
          data: segmentData,
          skipDuplicates: true
        });

        totalCreated += result.count;
        console.log(`   Processed ${Math.min(i + BATCH_SIZE, segments.length)}/${segments.length} segments (${totalCreated} new)...`);
      }

      // Update client segment count
      await prisma.mauticClient.update({
        where: { id: clientId },
        data: { totalSegments: segments.length }
      });

      console.log(`✅ BULK INSERT DONE: ${totalCreated} new segments (${segments.length - totalCreated} duplicates skipped)`);

      return {
        success: true,
        created: totalCreated,
        updated: 0,
        total: segments.length
      };
    } catch (error) {
      console.error('Error saving segments:', error);
      throw new Error(`Failed to save segments: ${error.message}`);
    }
  }

  /**
   * Save email reports to database
   * @param {number} clientId - Client ID
   * @param {Array} reportRows - Array of email report rows from Mautic report API
   * @returns {Promise<Object>} Save results
   */
  async saveEmailReports(clientId, reportRows) {
    try {
      console.log(`📊 Saving ${reportRows.length} email report records for client ${clientId}...`);

      if (reportRows.length === 0) {
        console.log(`✅ No email reports to save`);
        return { success: true, created: 0, updated: 0, total: 0 };
      }

      let created = 0;
      let skipped = 0;
      const BATCH_SIZE = 10000; // ⚡ ULTRA MASSIVE batches - 100x bigger!

      // Process in batches for better performance
      for (let i = 0; i < reportRows.length; i += BATCH_SIZE) {
        const batch = reportRows.slice(i, i + BATCH_SIZE);

        // Prepare valid records for batch insert
        const validRecords = [];
        
        for (const row of batch) {
          // Skip invalid rows
          if (!row.e_id || !row.date_sent || !row.email_address || !row.subject1) {
            skipped++;
            continue;
          }

          // Normalize dates to UTC consistently. Mautic returns date strings like
          // 'YYYY-MM-DD HH:mm:ss' (no timezone). Interpret that value as UTC
          // to avoid platform-local timezone shifts which cause inconsistent
          // uniqueness comparisons on (eId,emailAddress,dateSent).
          const toUtcDate = (s) => {
            try {
              if (!s) return null;
              // Replace space with T and append Z to treat as UTC
              const iso = String(s).trim().replace(' ', 'T') + 'Z';
              const d = new Date(iso);
              return Number.isNaN(d.getTime()) ? null : d;
            } catch (e) { return null; }
          };

          validRecords.push({
            eId: parseInt(row.e_id), // Store Mautic email ID directly
            dateSent: toUtcDate(row.date_sent),
            dateRead: row.date_read ? toUtcDate(row.date_read) : null,
            subject: row.subject1,
            emailAddress: row.email_address,
            clientId: clientId
          });
        }

        // Batch insert all valid records, skip duplicates automatically
        if (validRecords.length > 0) {
          try {
            const result = await prisma.mauticEmailReport.createMany({
              data: validRecords,
              skipDuplicates: true  // Skip records that already exist
            });
            created += result.count;
            skipped += (validRecords.length - result.count);
          } catch (error) {
            console.error(`Batch insert error:`, error.message);
            skipped += validRecords.length;
          }
        }

        console.log(`   Processed ${Math.min(i + BATCH_SIZE, reportRows.length)}/${reportRows.length} email reports (${created} new, ${skipped} skipped)...`);
      }

      console.log(`✅ Email reports saved: ${created} created, ${skipped} skipped`);

      return {
        success: true,
        created,
        skipped,
        total: reportRows.length
      };
    } catch (error) {
      console.error('Error saving email reports:', error);
      throw new Error(`Failed to save email reports: ${error.message}`);
    }
  }

  /**
   * Save click/redirect trackables for emails using createMany
   * @param {number} clientId
   * @param {Array} clickRows - Array of { redirect_id, hits, unique_hits, channel_id, url }
   */
  async saveClickTrackables(clientId, clickRows) {
    try {
      if (!clickRows || clickRows.length === 0) {
        return { success: true, created: 0, total: 0 };
      }

      const BATCH_SIZE = 1000;
      let totalCreated = 0;
      const now = new Date();

      for (let i = 0; i < clickRows.length; i += BATCH_SIZE) {
        const batch = clickRows.slice(i, i + BATCH_SIZE);
        const data = batch.map(r => ({
          redirectId: String(r.redirect_id || r.redirectId || ''),
          hits: parseInt(r.hits || r.hits === 0 ? r.hits : 0, 10) || 0,
          uniqueHits: parseInt(r.unique_hits || r.uniqueHits || 0, 10) || 0,
          channelId: parseInt(r.channel_id || r.channelId || 0, 10) || 0,
          url: r.url || null,
          clientId: clientId,
          createdAt: now,
          updatedAt: now
        }));

        try {
          const res = await prisma.mauticClickTrackable.createMany({ data, skipDuplicates: true });
          totalCreated += res.count;
        } catch (err) {
          console.error('Error saving click trackables batch:', err.message || err);
        }
      }

      return { success: true, created: totalCreated, total: clickRows.length };
    } catch (error) {
      console.error('Error saving click trackables:', error);
      throw new Error(`Failed to save click trackables: ${error.message}`);
    }
  }

  /**
   * Get dashboard metrics for a client
   * @param {number} clientId - Client ID (optional, null for all clients)
   * @returns {Promise<Object>} Dashboard metrics
   */
  async getDashboardMetrics(clientId = null) {
    try {
      const where = clientId ? { clientId } : {};

      // Fetch counts
      const [totalEmails, totalCampaigns, totalSegments, clients] = await Promise.all([
        prisma.mauticEmail.count({ where }),
        prisma.mauticCampaign.count({ where }),
        prisma.mauticSegment.count({ where }),
        clientId
          ? prisma.mauticClient.findUnique({ where: { id: clientId } })
          : prisma.mauticClient.findMany({ where: { isActive: true } })
      ]);

      // Prefer using stored unique contact totals from MauticClient when available
      // Summing segment.contactCount can double-count leads (a lead can be in multiple segments).
      let totalContacts = 0;
      if (clientId) {
        const client = await prisma.mauticClient.findUnique({ where: { id: clientId } });
        totalContacts = client?.totalContacts || 0;
      } else {
        // Sum unique contact totals per client (stored during sync) to avoid double-counting
        const clients = await prisma.mauticClient.findMany({ select: { totalContacts: true } });
        totalContacts = clients.reduce((sum, c) => sum + (c.totalContacts || 0), 0);
      }

      // Email statistics
      const emailStats = await prisma.mauticEmail.aggregate({
        where,
        _sum: {
          sentCount: true,
          readCount: true,
          clickedCount: true,
          unsubscribed: true,
          bounced: true
        },
        _avg: {
          readRate: true,
          clickRate: true,
          unsubscribeRate: true
        }
      });

      // Aggregate click trackables (hits + unique hits) for overview
      let clickAgg = { _sum: { hits: 0, uniqueHits: 0 } };
      try {
        clickAgg = await prisma.mauticClickTrackable.aggregate({
          where: clientId ? { clientId } : {},
          _sum: { hits: true, uniqueHits: true }
        });
      } catch (e) {
        // Non-fatal if model/table not present yet
        console.warn('mauticClickTrackable aggregation failed (non-fatal):', e.message || e);
      }

      // Top performing emails
      const topEmails = await prisma.mauticEmail.findMany({
        where: {
          ...where,
          sentCount: { gt: 0 }
        },
        orderBy: { readRate: 'desc' },
        take: 5,
        include: {
          client: {
            select: { name: true }
          }
        }
      });

      // Attach click aggregates (hits + uniqueHits) to topEmails using mauticEmailId mapping
      try {
        const mauticIds = topEmails.map(e => parseInt(e.mauticEmailId || '0')).filter(Boolean);
        if (mauticIds.length > 0) {
          const clickSums = await prisma.mauticClickTrackable.groupBy({
            by: ['channelId'],
            where: { channelId: { in: mauticIds }, ...(clientId ? { clientId } : {}) },
            _sum: { hits: true, uniqueHits: true }
          });
          const clickMap = new Map(clickSums.map(c => [c.channelId, c._sum]));
          topEmails.forEach(email => {
            const mid = parseInt(email.mauticEmailId || '0');
            const sums = clickMap.get(mid) || { hits: 0, uniqueHits: 0 };
            email._clicks = { hits: sums.hits || 0, uniqueHits: sums.uniqueHits || 0 };
          });
        }
      } catch (e) {
        // continue without unique clicks if grouping fails
        console.warn('Failed to attach click aggregates to topEmails (non-fatal):', e.message || e);
      }

      return {
        success: true,
        data: {
          overview: {
            totalContacts,
            totalEmails,
            totalCampaigns,
            totalSegments,
            clients: Array.isArray(clients) ? clients.length : 1
          },
          emailStats: {
            totalSent: emailStats._sum.sentCount || 0,
            totalRead: emailStats._sum.readCount || 0,
            totalClicked: emailStats._sum.clickedCount || 0,
            totalUnsubscribed: emailStats._sum.unsubscribed || 0,
            totalBounced: emailStats._sum.bounced || 0,
            avgReadRate: parseFloat(emailStats._avg.readRate || 0).toFixed(2),
            avgClickRate: parseFloat(emailStats._avg.clickRate || 0).toFixed(2),
            avgUnsubscribeRate: parseFloat(emailStats._avg.unsubscribeRate || 0).toFixed(2),
            // Click aggregates from trackables (more accurate unique clicks)
            totalClickHits: (clickAgg._sum && clickAgg._sum.hits) || 0,
            totalUniqueClicks: (clickAgg._sum && clickAgg._sum.uniqueHits) || 0
          },
          topEmails: topEmails.map(email => ({
            id: email.id,
            name: email.name,
            subject: email.subject,
            client: email.client.name,
            sentCount: email.sentCount,
            readRate: parseFloat(email.readRate).toFixed(2),
            clickRate: parseFloat(email.clickRate).toFixed(2),
            clicks: email._clicks ? email._clicks.hits : email.clickedCount || 0,
            uniqueClicks: email._clicks ? email._clicks.uniqueHits : 0
          }))
        }
      };
    } catch (error) {
      console.error('Error getting dashboard metrics:', error);
      throw new Error(`Failed to get dashboard metrics: ${error.message}`);
    }
  }

  /**
   * Get all clients (including inactive)
   * @returns {Promise<Array>} Array of clients
   */
  async getClients() {
    try {
      const clients = await prisma.mauticClient.findMany({
        orderBy: [
          { isActive: 'desc' }, // Active clients first
          { name: 'asc' }
        ],
        include: {
          _count: {
            select: {
              emails: true,
              segments: true,
              campaigns: true
            }
          },
          client: {
            include: {
              assignments: {
                include: {
                  user: true
                }
              }
            }
          }
        }
      });

      // Map clients to include an `assignedUsers` array for easier UI consumption
      const mapped = clients.map(c => {
        const assigned = (c.client && Array.isArray(c.client.assignments))
          ? c.client.assignments.map(a => ({ id: a.user.id, name: a.user.name, email: a.user.email, role: a.user.role }))
          : [];

        return {
          ...c,
          assignedUsers: assigned
        };
      });

      return mapped;
    } catch (error) {
      console.error('Error fetching clients:', error);
      throw new Error(`Failed to fetch clients: ${error.message}`);
    }
  }

  /**
   * Update client last sync time
   * @param {number} clientId - Client ID
   * @returns {Promise<Object>} Updated client
   */
  async updateClientSyncTime(clientId) {
    try {
      return await prisma.mauticClient.update({
        where: { id: clientId },
        data: { lastSyncAt: new Date() }
      });
    } catch (error) {
      console.error('Error updating client sync time:', error);
      throw error;
    }
  }
}

export default new MauticDataService();