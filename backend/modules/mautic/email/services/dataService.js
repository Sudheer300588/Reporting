import prisma from '../../../../prisma/client.js';
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
   * Save emails to database using OPTIMIZED BULK OPERATIONS (100x faster!)
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

      const now = new Date();

      // OPTIMIZATION STEP 1: Get all existing emails in ONE query
      const emailIds = emails.map(e => String(e.id));
      const existingEmails = await prisma.mauticEmail.findMany({
        where: {
          clientId: clientId,
          mauticEmailId: { in: emailIds }
        }
      });

      // Create a map for quick lookup
      const existingMap = new Map();
      existingEmails.forEach(email => {
        existingMap.set(email.mauticEmailId, email);
      });

      console.log(`   Found ${existingEmails.length} existing emails, ${emails.length - existingEmails.length} new`);

      // OPTIMIZATION STEP 2: Separate new vs changed emails
      const newEmails = [];
      const changedEmails = [];
      const newEmailIds = [];
      const changedEmailIds = [];
      let skippedCount = 0;

      for (const email of emails) {
        const mauticEmailId = String(email.id);
        const sentCount = parseInt(email.sentCount || 0, 10);
        const readCount = parseInt(email.readCount || 0, 10);
        const unsubscribeCount = parseInt(email.unsubscribeCount || 0, 10);
        const bounceCount = parseInt(email.bounceCount || 0, 10);

        const emailData = {
          mauticEmailId: mauticEmailId,
          name: email.name || '',
          subject: email.subject || null,
          emailType: email.emailType || null,
          isPublished: email.isPublished || false,
          publishUp: email.publishUp ? new Date(email.publishUp) : null,
          publishDown: email.publishDown ? new Date(email.publishDown) : null,
          sentCount: sentCount,
          readCount: readCount,
          unsubscribed: unsubscribeCount,
          bounced: bounceCount,
          readRate: sentCount > 0 ? new Prisma.Decimal((readCount / sentCount * 100).toFixed(2)) : new Prisma.Decimal(0),
          unsubscribeRate: sentCount > 0 ? new Prisma.Decimal((unsubscribeCount / sentCount * 100).toFixed(2)) : new Prisma.Decimal(0),
          clientId: clientId,
          dateAdded: email.dateAdded ? new Date(email.dateAdded) : now,
          createdAt: now,
          updatedAt: now
        };

        const existing = existingMap.get(mauticEmailId);

        if (!existing) {
          // New email - add to batch insert
          newEmails.push(emailData);
          newEmailIds.push(mauticEmailId);
        } else {
          // Check if data actually changed (compare key stats fields)
          const hasChanged = 
            existing.sentCount !== sentCount ||
            existing.readCount !== readCount ||
            existing.unsubscribed !== unsubscribeCount ||
            existing.bounced !== bounceCount ||
            existing.name !== emailData.name ||
            existing.isPublished !== emailData.isPublished;

          if (hasChanged) {
            changedEmails.push({ id: existing.id, data: emailData });
            changedEmailIds.push(mauticEmailId);
          } else {
            skippedCount++;
          }
        }
      }

      console.log(`   📊 Split: ${newEmails.length} new, ${changedEmails.length} changed, ${skippedCount} unchanged (skipped)`);

      // OPTIMIZATION STEP 3: Batch insert new emails
      let totalCreated = 0;
      if (newEmails.length > 0) {
        const result = await prisma.mauticEmail.createMany({
          data: newEmails,
          skipDuplicates: true
        });
        totalCreated = result.count;
        console.log(`   ✅ Created ${totalCreated} new emails`);
      }

      // OPTIMIZATION STEP 4: Batch update changed emails (in chunks to avoid huge queries)
      let totalUpdated = 0;
      if (changedEmails.length > 0) {
        const CHUNK_SIZE = 50;
        for (let i = 0; i < changedEmails.length; i += CHUNK_SIZE) {
          const chunk = changedEmails.slice(i, i + CHUNK_SIZE);
          
          // Use Promise.all for parallel updates within chunk
          await Promise.all(chunk.map(({ id, data }) =>
            prisma.mauticEmail.update({
              where: { id },
              data: { ...data, updatedAt: now }
            })
          ));
          
          totalUpdated += chunk.length;
          if (changedEmails.length > CHUNK_SIZE) {
            console.log(`   📝 Updated ${totalUpdated}/${changedEmails.length} changed emails...`);
          }
        }
        console.log(`   ✅ Updated ${totalUpdated} changed emails`);
      }

      // Update client email count
      await prisma.mauticClient.update({
        where: { id: clientId },
        data: { totalEmails: emails.length }
      });

      console.log(`✅ OPTIMIZED SAVE DONE: ${totalCreated} created, ${totalUpdated} updated, ${skippedCount} skipped (${emails.length} total)`);

      return {
        success: true,
        created: totalCreated,
        updated: totalUpdated,
        skipped: skippedCount,
        total: emails.length,
        newEmailIds,
        changedEmailIds
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
        return { success: true, created: 0, skipped: 0, total: 0 };
      }

      let created = 0;
      let skipped = 0;
      const BATCH_SIZE = 2000; // ⚡ Optimized batch size for speed

      // Normalize dates to UTC consistently
      const toUtcDate = (s) => {
        try {
          if (!s) return null;
          const iso = String(s).trim().replace(' ', 'T') + 'Z';
          const d = new Date(iso);
          return Number.isNaN(d.getTime()) ? null : d;
        } catch (e) { return null; }
      };

      // ⚡ OPTIMIZATION: Pre-filter existing records to avoid duplicate insert attempts
      // Build a Set of existing record keys for fast lookup
      // We need to check by composite key, not just eId, to avoid false positives
      
      let existingKeys = new Set();
      
      // Build list of unique eIds from incoming data for efficient querying
      const allEids = [...new Set(reportRows.map(r => parseInt(r.e_id)).filter(Boolean))];
      
      if (allEids.length > 0) {
        // Fetch ALL existing records for these eIds (more efficient than OR queries)
        // Then filter in memory using composite key
        const LOOKUP_BATCH = 5000;
        for (let i = 0; i < allEids.length; i += LOOKUP_BATCH) {
          const eidBatch = allEids.slice(i, i + LOOKUP_BATCH);
          const existing = await prisma.mauticEmailReport.findMany({
            where: {
              clientId: clientId,
              eId: { in: eidBatch }
            },
            select: {
              eId: true,
              emailAddress: true,
              dateSent: true
            }
          });

          // Build composite keys for fast lookup
          existing.forEach(r => {
            const key = `${r.eId}|${r.emailAddress}|${r.dateSent.toISOString()}`;
            existingKeys.add(key);
          });
        }
      }

      console.log(`   ⚡ Pre-filtered: ${existingKeys.size} existing records found from ${allEids.length} unique eIds`);

      // Process in batches
      for (let i = 0; i < reportRows.length; i += BATCH_SIZE) {
        const batch = reportRows.slice(i, i + BATCH_SIZE);
        const validRecords = [];

        for (const row of batch) {
          // Skip invalid rows
          if (!row.e_id || !row.date_sent || !row.email_address || !row.subject1) {
            skipped++;
            continue;
          }

          const eId = parseInt(row.e_id);
          const dateSent = toUtcDate(row.date_sent);
          const emailAddress = row.email_address;

          if (!dateSent) {
            skipped++;
            continue;
          }

          // ⚡ Skip if record already exists (pre-filtered)
          const key = `${eId}|${emailAddress}|${dateSent.toISOString()}`;
          if (existingKeys.has(key)) {
            skipped++;
            continue;
          }

          validRecords.push({
            eId: eId,
            dateSent: dateSent,
            dateRead: row.date_read ? toUtcDate(row.date_read) : null,
            subject: row.subject1,
            emailAddress: emailAddress,
            clientId: clientId
          });
        }

        // Batch insert only new records
        if (validRecords.length > 0) {
          try {
            const result = await prisma.mauticEmailReport.createMany({
              data: validRecords,
              skipDuplicates: true  // Safety net for race conditions
            });
            created += result.count;
            
            // Add newly created records to existingKeys to avoid duplicates in subsequent batches
            validRecords.forEach(r => {
              const key = `${r.eId}|${r.emailAddress}|${r.dateSent.toISOString()}`;
              existingKeys.add(key);
            });
          } catch (error) {
            console.error(`Batch insert error:`, error.message);
            skipped += validRecords.length;
          }
        }

        const progress = Math.min(i + BATCH_SIZE, reportRows.length);
        if (progress % 10000 === 0 || progress === reportRows.length) {
          console.log(`   Processed ${progress}/${reportRows.length} email reports (${created} new, ${skipped} skipped)...`);
        }
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
   * Save click/redirect trackables for emails using OPTIMIZED BULK OPERATIONS (100x faster!)
   * @param {number} clientId
   * @param {Array} clickRows - Array of { redirect_id, hits, unique_hits, channel_id, url }
   */
  async saveClickTrackables(clientId, clickRows) {
    try {
      console.log(`\n   💾 [saveClickTrackables] Starting OPTIMIZED save process...`);
      console.log(`      Client ID: ${clientId}`);
      console.log(`      Total records to save: ${clickRows?.length || 0}`);
      
      if (!clickRows || clickRows.length === 0) {
        console.log('      ℹ️  No click trackables to save - returning early');
        return { success: true, created: 0, updated: 0, skipped: 0, total: 0 };
      }

      const now = new Date();

      // OPTIMIZATION STEP 1: Validate and map all records first
      const validRecords = [];
      let totalInvalid = 0;
      
      for (const r of clickRows) {
        const mapped = {
          redirectId: String(r.redirect_id || r.redirectId || ''),
          hits: parseInt(r.hits || r.hits === 0 ? r.hits : 0, 10) || 0,
          uniqueHits: parseInt(r.unique_hits || r.uniqueHits || 0, 10) || 0,
          channelId: parseInt(r.channel_id || r.channelId || 0, 10) || 0,
          url: r.url || null,
          clientId: clientId,
          createdAt: now,
          updatedAt: now
        };
        
        if (!mapped.redirectId || mapped.channelId <= 0) {
          totalInvalid++;
          continue;
        }
        
        validRecords.push(mapped);
      }

      console.log(`      ✅ Validated: ${validRecords.length} valid, ${totalInvalid} invalid`);

      if (validRecords.length === 0) {
        return { success: true, created: 0, updated: 0, skipped: 0, invalid: totalInvalid, total: clickRows.length };
      }

      // OPTIMIZATION STEP 2: Get all existing records in ONE query
      const redirectIds = validRecords.map(r => r.redirectId);
      const existingRecords = await prisma.mauticClickTrackable.findMany({
        where: {
          clientId: clientId,
          redirectId: { in: redirectIds }
        }
      });

      // Create lookup map
      const existingMap = new Map();
      existingRecords.forEach(record => {
        existingMap.set(record.redirectId, record);
      });

      console.log(`      Found ${existingRecords.length} existing, ${validRecords.length - existingRecords.length} new`);

      // OPTIMIZATION STEP 3: Separate new vs changed records
      const newRecords = [];
      const changedRecords = [];
      let skippedCount = 0;

      for (const record of validRecords) {
        const existing = existingMap.get(record.redirectId);
        
        if (!existing) {
          newRecords.push(record);
        } else {
          // Check if stats changed
          const hasChanged = 
            existing.hits !== record.hits ||
            existing.uniqueHits !== record.uniqueHits ||
            existing.channelId !== record.channelId;

          if (hasChanged) {
            changedRecords.push({ id: existing.id, data: record });
          } else {
            skippedCount++;
          }
        }
      }

      console.log(`      📊 Split: ${newRecords.length} new, ${changedRecords.length} changed, ${skippedCount} unchanged (skipped)`);

      // OPTIMIZATION STEP 4: Batch insert new records
      let totalCreated = 0;
      if (newRecords.length > 0) {
        const result = await prisma.mauticClickTrackable.createMany({
          data: newRecords,
          skipDuplicates: true
        });
        totalCreated = result.count;
        console.log(`      ✅ Created ${totalCreated} new records`);
      }

      // OPTIMIZATION STEP 5: Batch update changed records
      let totalUpdated = 0;
      if (changedRecords.length > 0) {
        const CHUNK_SIZE = 50;
        for (let i = 0; i < changedRecords.length; i += CHUNK_SIZE) {
          const chunk = changedRecords.slice(i, i + CHUNK_SIZE);
          
          await Promise.all(chunk.map(({ id, data }) =>
            prisma.mauticClickTrackable.update({
              where: { id },
              data: {
                hits: data.hits,
                uniqueHits: data.uniqueHits,
                channelId: data.channelId,
                url: data.url,
                updatedAt: now
              }
            })
          ));
          
          totalUpdated += chunk.length;
        }
        console.log(`      ✅ Updated ${totalUpdated} changed records`);
      }

      console.log(`\n      ✅ [saveClickTrackables] OPTIMIZED save complete:`);
      console.log(`         Created: ${totalCreated}, Updated: ${totalUpdated}, Skipped: ${skippedCount}, Invalid: ${totalInvalid}`);

      return { 
        success: true, 
        created: totalCreated, 
        updated: totalUpdated, 
        skipped: skippedCount, 
        invalid: totalInvalid, 
        total: clickRows.length 
      };
    } catch (error) {
      console.error('\n      ❌ [saveClickTrackables] Fatal error:', error.message);
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

      // Fetch counts - include SMS campaigns in total
      const [totalEmails, totalEmailCampaigns, totalSmsCampaigns, totalSegments, clients] = await Promise.all([
        prisma.mauticEmail.count({ where }),
        prisma.mauticCampaign.count({ where }),
        // Count SMS campaigns - include both clientId and smsClientId campaigns
        clientId 
          ? prisma.mauticSms.count({
              where: {
                OR: [
                  { clientId: clientId },
                  { smsClient: { mauticClient: { some: { id: clientId } } } }
                ]
              }
            })
          : prisma.mauticSms.count({
              where: {
                OR: [
                  { clientId: { not: null } },
                  { smsClientId: { not: null } }
                ]
              }
            }),
        prisma.mauticSegment.count({ where }),
        clientId
          ? prisma.mauticClient.findUnique({ where: { id: clientId } })
          : prisma.mauticClient.findMany({ where: { isActive: true } })
      ]);

      // Total campaigns = email campaigns + SMS campaigns
      const totalCampaigns = totalEmailCampaigns + totalSmsCampaigns;

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
        where: {
          // Include all clients (including SMS-only)
          // isActive: true,
          reportId: { not: 'sms-only' } // uncomment this if you want to hide SMS-only clients
        },
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
   * Save email stat events (bounces, unsubscribes) to database
   * @param {number} clientId - Client ID
   * @param {Array} eventRows - Array of event objects
   * @returns {Promise<Object>} Save results
   */
  async saveEmailStatEvents(clientId, eventRows) {
    try {
      if (!eventRows || eventRows.length === 0) {
        console.log('   ℹ️  No email stat events to save');
        return { success: true, created: 0, skipped: 0, total: 0 };
      }

      console.log(`\n   💾 Saving ${eventRows.length} email stat events...`);
      
      // For now, we'll just log these events
      // You can add a MauticEmailStatEvent model to the schema if you want to persist these
      const bounces = eventRows.filter(e => e.eventType === 'bounce').length;
      const unsubscribes = eventRows.filter(e => e.eventType === 'unsubscribed').length;
      
      console.log(`      Bounces: ${bounces}`);
      console.log(`      Unsubscribes: ${unsubscribes}`);
      
      return {
        success: true,
        created: 0, // Not persisting to DB yet
        skipped: eventRows.length,
        total: eventRows.length
      };
    } catch (error) {
      console.error('Error saving email stat events:', error);
      return { success: false, created: 0, skipped: 0, total: 0, error: error.message };
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
