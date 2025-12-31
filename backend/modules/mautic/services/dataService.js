import logger from '../../../utils/logger.js';
import prisma from '../../../prisma/client.js';
import { Prisma } from '@prisma/client';

class MauticDataService {
  /**
   * Save emails to database
   */
  async saveEmails(clientId, emails) {
    try {
      logger.debug(`💾 Saving ${emails.length} emails for client ${clientId}...`);

      if (emails.length === 0) {
        logger.debug(`✅ No emails to save`);
        return { success: true, created: 0, updated: 0, total: 0 };
      }

      let created = 0;
      let updated = 0;
      const BATCH_SIZE = 50;

      // Process in batches for better performance
      for (let i = 0; i < emails.length; i += BATCH_SIZE) {
        const batch = emails.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (email) => {
          try {
            const sentCount = email.sentCount || 0;
            const readCount = email.readCount || 0;
            const clickCount = email.clickCount || 0;
            const unsubscribeCount = email.unsubscribeCount || 0;
            const bounceCount = email.bounceCount || 0;

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
              clickedCount: clickCount,
              unsubscribed: unsubscribeCount,
              bounced: bounceCount,
              readRate: sentCount > 0 ? new Prisma.Decimal((readCount / sentCount * 100).toFixed(2)) : new Prisma.Decimal(0),
              clickRate: sentCount > 0 ? new Prisma.Decimal((clickCount / sentCount * 100).toFixed(2)) : new Prisma.Decimal(0),
              unsubscribeRate: sentCount > 0 ? new Prisma.Decimal((unsubscribeCount / sentCount * 100).toFixed(2)) : new Prisma.Decimal(0),
              clientId: clientId,
              dateAdded: email.dateAdded ? new Date(email.dateAdded) : new Date()
            };

            const result = await prisma.mauticEmail.upsert({
              where: {
                clientId_mauticEmailId: {
                  clientId: clientId,
                  mauticEmailId: String(email.id)
                }
              },
              update: {
                ...emailData,
                updatedAt: new Date()
              },
              create: emailData
            });

            if (result.createdAt.getTime() === result.updatedAt.getTime()) {
              created++;
            } else {
              updated++;
            }
          } catch (error) {
            logger.error(`Failed to save email ${email.id}:`, error.message);
          }
        }));

        logger.debug(`   Saved ${Math.min(i + BATCH_SIZE, emails.length)}/${emails.length} emails...`);
      }

      // Update client email count
      await prisma.mauticClient.update({
        where: { id: clientId },
        data: { totalEmails: emails.length }
      });

      logger.debug(`✅ Emails saved: ${created} created, ${updated} updated`);

      return {
        success: true,
        created,
        updated,
        total: emails.length
      };
    } catch (error) {
      logger.error('Error saving emails:', error);
      throw new Error(`Failed to save emails: ${error.message}`);
    }
  }

  /**
   * Save campaigns to database
   * @param {number} clientId - Client ID
   * @param {Array} campaigns - Array of campaign objects from Mautic API
   * @returns {Promise<Object>} Save results
   */
  async saveCampaigns(clientId, campaigns) {
    try {
      logger.debug(`\n💾 Saving ${campaigns.length} campaigns for client ${clientId}...`);
      logger.debug(`   Campaign IDs: ${campaigns.map(c => c.id).join(', ')}`);

      if (campaigns.length === 0) {
        logger.debug(`✅ No campaigns to save`);
        return { success: true, created: 0, updated: 0, total: 0 };
      }

      let created = 0;
      let updated = 0;
      let failed = 0;
      const BATCH_SIZE = 50;

      // Process in batches for better performance
      for (let i = 0; i < campaigns.length; i += BATCH_SIZE) {
        const batch = campaigns.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (campaign) => {
          try {
            logger.debug(`   Processing campaign ID ${campaign.id}: ${campaign.name}`);

            // Extract category - handle both object and string formats
            let categoryValue = null;
            if (campaign.category) {
              if (typeof campaign.category === 'string') {
                categoryValue = campaign.category;
              } else if (typeof campaign.category === 'object') {
                // Extract title or alias from category object
                categoryValue = campaign.category.title || campaign.category.alias || campaign.category.name || null;
              }
            }

            const campaignData = {
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
              clientId: clientId
            };

            const result = await prisma.mauticCampaign.upsert({
              where: {
                clientId_mauticCampaignId: {
                  clientId: clientId,
                  mauticCampaignId: String(campaign.id)
                }
              },
              update: {
                ...campaignData,
                updatedAt: new Date()
              },
              create: campaignData
            });

            if (result.createdAt.getTime() === result.updatedAt.getTime()) {
              created++;
              logger.debug(`   ✅ Campaign ${campaign.id} created`);
            } else {
              updated++;
              logger.debug(`   ✅ Campaign ${campaign.id} updated`);
            }
          } catch (error) {
            logger.error(`❌ Failed to save campaign ${campaign.id} (${campaign.name}):`, error.message);
            if (error.stack) {
              logger.error(`   Stack trace:`, error.stack);
            }
            // Log the actual data we're trying to save, not the full campaign object
            logger.error(`   Attempted to save:`, {
              mauticCampaignId: campaign.id,
              name: campaign.name,
              isPublished: campaign.isPublished,
              dateAdded: campaign.dateAdded,
              createdBy: campaign.createdBy,
              category: campaign.category
            });
            failed++;
          }
        }));

        logger.debug(`   Saved ${Math.min(i + BATCH_SIZE, campaigns.length)}/${campaigns.length} campaigns...`);
      }

      // Update client campaign count
      await prisma.mauticClient.update({
        where: { id: clientId },
        data: { totalCampaigns: campaigns.length }
      });

      logger.debug(`✅ Campaigns saved: ${created} created, ${updated} updated, ${failed} failed`);

      return {
        success: true,
        created,
        updated,
        failed,
        total: campaigns.length
      };
    } catch (error) {
      logger.error('Error saving campaigns:', error);
      throw new Error(`Failed to save campaigns: ${error.message}`);
    }
  }

  /**
   * Save segments to database
   * @param {number} clientId - Client ID
   * @param {Array} segments - Array of segment objects from Mautic API
   * @returns {Promise<Object>} Save results
   */
  async saveSegments(clientId, segments) {
    try {
      logger.debug(`💾 Saving ${segments.length} segments for client ${clientId}...`);

      if (segments.length === 0) {
        logger.debug(`✅ No segments to save`);
        return { success: true, created: 0, updated: 0, total: 0 };
      }

      let created = 0;
      let updated = 0;
      const BATCH_SIZE = 50;

      // Process in batches for better performance
      for (let i = 0; i < segments.length; i += BATCH_SIZE) {
        const batch = segments.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (segment) => {
          try {
            const segmentData = {
              mauticSegmentId: String(segment.id),
              name: segment.name || '',
              alias: segment.alias || null,
              description: segment.description || null,
              isPublished: segment.isPublished || false,
              filters: segment.filters || null,
              contactCount: segment.leadCount || 0,
              clientId: clientId,
              dateAdded: segment.dateAdded ? new Date(segment.dateAdded) : new Date()
            };

            const result = await prisma.mauticSegment.upsert({
              where: {
                clientId_mauticSegmentId: {
                  clientId: clientId,
                  mauticSegmentId: String(segment.id)
                }
              },
              update: {
                ...segmentData,
                updatedAt: new Date()
              },
              create: segmentData
            });

            if (result.createdAt.getTime() === result.updatedAt.getTime()) {
              created++;
            } else {
              updated++;
            }
          } catch (error) {
            logger.error(`Failed to save segment ${segment.id}:`, error.message);
          }
        }));

        logger.debug(`   Saved ${Math.min(i + BATCH_SIZE, segments.length)}/${segments.length} segments...`);
      }

      // Update client segment count
      await prisma.mauticClient.update({
        where: { id: clientId },
        data: { totalSegments: segments.length }
      });

      logger.debug(`✅ Segments saved: ${created} created, ${updated} updated`);

      return {
        success: true,
        created,
        updated,
        total: segments.length
      };
    } catch (error) {
      logger.error('Error saving segments:', error);
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
      logger.debug(`📊 Saving ${reportRows.length} email report records for client ${clientId}...`);

      if (reportRows.length === 0) {
        logger.debug(`✅ No email reports to save`);
        return { success: true, created: 0, updated: 0, total: 0 };
      }

      let created = 0;
      let skipped = 0;
      const BATCH_SIZE = 100;

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
            logger.error(`Batch insert error:`, error.message);
            skipped += validRecords.length;
          }
        }

        logger.debug(`   Processed ${Math.min(i + BATCH_SIZE, reportRows.length)}/${reportRows.length} email reports (${created} new, ${skipped} skipped)...`);
      }

      logger.debug(`✅ Email reports saved: ${created} created, ${skipped} skipped`);

      return {
        success: true,
        created,
        skipped,
        total: reportRows.length
      };
    } catch (error) {
      logger.error('Error saving email reports:', error);
      throw new Error(`Failed to save email reports: ${error.message}`);
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

      // Top performing emails - sorted by sent count to show most impactful emails
      const topEmails = await prisma.mauticEmail.findMany({
        where: {
          ...where,
          sentCount: { gt: 100 } // Only show emails with meaningful volume
        },
        orderBy: [
          { sentCount: 'desc' }, // Primary: highest volume
          { readRate: 'desc' }   // Secondary: best performance
        ],
        take: 7,
        select: {
          id: true,
          name: true,
          subject: true,
          sentCount: true,
          readCount: true,
          clickedCount: true,
          unsubscribed: true,
          bounced: true,
          readRate: true,
          clickRate: true,
          unsubscribeRate: true,
          client: {
            select: { name: true }
          }
        }
      });

      return {
        success: true,
        data: {
          overview: {
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
            avgUnsubscribeRate: parseFloat(emailStats._avg.unsubscribeRate || 0).toFixed(2)
          },
          topEmails: topEmails.map(email => ({
            id: email.id,
            name: email.name,
            subject: email.subject,
            client: email.client.name,
            sentCount: email.sentCount,
            readCount: email.readCount || 0,
            clickedCount: email.clickedCount || 0,
            unsubscribed: email.unsubscribed || 0,
            bounced: email.bounced || 0,
            readRate: parseFloat(email.readRate || 0).toFixed(2),
            clickRate: parseFloat(email.clickRate || 0).toFixed(2),
            unsubscribeRate: parseFloat(email.unsubscribeRate || 0).toFixed(2)
          }))
        }
      };
    } catch (error) {
      logger.error('Error getting dashboard metrics:', error);
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
      logger.error('Error fetching clients:', error);
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
      logger.error('Error updating client sync time:', error);
      throw error;
    }
  }
}

export default new MauticDataService();
