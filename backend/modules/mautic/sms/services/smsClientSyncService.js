import prisma from '../../../../prisma/client.js';
import mauticAPIService from '../../mauticAPI.js';
import encryptionService from '../../encryption.js';
import logger from '../../../../utils/logger.js';
import axios from 'axios';
import campaignGrouping from './campaignGrouping.js';

/**
 * Comprehensive SMS Client Sync Service
 * Handles syncing SMS campaigns and their stats from multiple Mautic clients (IPS and BPC)
 */
class SmsClientSyncService {
  /**
   * Sync all SMS campaigns from all active SMS clients
   * This is the main entry point for SMS data synchronization
   */
  async syncAllSmsClients() {
    try {
      logger.info('🔄 Starting sync for all SMS clients...');
      
      // Get all active SMS clients
      const smsClients = await prisma.smsClient.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' }
      });

      if (smsClients.length === 0) {
        logger.info('No active SMS clients found');
        return { success: true, clients: [] };
      }

      logger.info(`Found ${smsClients.length} active SMS clients: ${smsClients.map(c => c.name).join(', ')}`);

      const results = [];
      
      // Sync each client sequentially to avoid overwhelming Mautic API
      for (const smsClient of smsClients) {
        try {
          const result = await this.syncSmsClient(smsClient);
          results.push({ clientId: smsClient.id, clientName: smsClient.name, ...result });
          
          // Wait between clients to avoid rate limiting
          await this.delay(2000);
        } catch (error) {
          logger.error(`Failed to sync SMS client ${smsClient.name}:`, error);
          results.push({ clientId: smsClient.id, clientName: smsClient.name, success: false, error: error.message });
        }
      }

      logger.info(`✅ Completed sync for ${results.length} SMS clients`);
      return { success: true, clients: results };
    } catch (error) {
      logger.error('Failed to sync all SMS clients:', error);
      throw error;
    }
  }

  /**
   * Sync a single SMS client
   * @param {Object} smsClient - SMS client from database
   */
  async syncSmsClient(smsClient) {
    try {
      logger.info(`\n📱 Syncing SMS client: ${smsClient.name}`);
      logger.info(`   URL: ${smsClient.mauticUrl}`);

      // Decrypt password
      const password = encryptionService.decrypt(smsClient.password);

      // Test connection first (optional - don't fail if it doesn't work)
      const connectionTest = await this.testMauticConnection({
        mauticUrl: smsClient.mauticUrl,
        username: smsClient.username,
        password
      });

      if (!connectionTest.success) {
        logger.warn(`Connection test warning for ${smsClient.name}: ${connectionTest.error}`);
        logger.info('Continuing with sync anyway...');
      }

      // Step 1: Fetch SMS campaigns from Mautic
      const smsCampaigns = await this.fetchSmsCampaigns({
        mauticUrl: smsClient.mauticUrl,
        username: smsClient.username,
        password
      });

      logger.info(`   📊 Found ${smsCampaigns.length} SMS campaigns in Mautic`);

      if (smsCampaigns.length === 0) {
        await prisma.smsClient.update({
          where: { id: smsClient.id },
          data: { lastSyncAt: new Date() }
        });
        return { success: true, campaigns: 0, stats: 0 };
      }

      // Step 2: Store/update SMS campaigns in database
      const storedCampaigns = await this.storeSmsCompaigns(smsClient, smsCampaigns);

      // Step 3: Sync stats for all campaigns (in batches)
      let totalStats = 0;
      for (const campaign of storedCampaigns) {
        try {
          logger.info(`   🔄 Syncing stats for campaign: ${campaign.name}`);
          const statsResult = await this.syncCampaignStats(smsClient, campaign, password);
          totalStats += statsResult.created + statsResult.updated;
          
          // Wait between campaigns to avoid rate limiting
          await this.delay(1000);
        } catch (error) {
          logger.error(`   ❌ Failed to sync stats for ${campaign.name}:`, error.message);
        }
      }

      // Update last sync time
      await prisma.smsClient.update({
        where: { id: smsClient.id },
        data: { lastSyncAt: new Date() }
      });

      logger.info(`✅ Sync complete for ${smsClient.name}: ${storedCampaigns.length} campaigns, ${totalStats} stats`);

      return {
        success: true,
        campaigns: storedCampaigns.length,
        stats: totalStats
      };
    } catch (error) {
      logger.error(`Failed to sync SMS client ${smsClient.name}:`, error);
      throw error;
    }
  }

  /**
   * Test Mautic API connection
   */
  async testMauticConnection({ mauticUrl, username, password }) {
    try {
      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      const response = await axios.get(`${mauticUrl.replace(/\/$/, '')}/api/users/self`, {
        headers: { Authorization: `Basic ${auth}` },
        timeout: 10000
      });
      
      return { success: true, user: response.data?.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Fetch SMS campaigns from Mautic
   */
  async fetchSmsCampaigns({ mauticUrl, username, password }) {
    try {
      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      const baseUrl = mauticUrl.replace(/\/$/, '');
      
      let allSmsCampaigns = [];
      let start = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const response = await axios.get(`${baseUrl}/api/smses`, {
          headers: { Authorization: `Basic ${auth}` },
          params: { start, limit, published: 1 },
          timeout: 30000
        });

        const smses = response.data?.smses || {};
        const smsArray = Object.values(smses);
        allSmsCampaigns = [...allSmsCampaigns, ...smsArray];

        logger.info(`   Fetched ${smsArray.length} SMS campaigns (${allSmsCampaigns.length} total)`);

        if (smsArray.length < limit) {
          hasMore = false;
        } else {
          start += limit;
        }
      }

      return allSmsCampaigns;
    } catch (error) {
      logger.error('Failed to fetch SMS campaigns:', error);
      throw error;
    }
  }

  /**
   * Store/update SMS campaigns in database
   * Automatically links campaigns to MauticClient using intelligent name matching
   */
  async storeSmsCompaigns(smsClient, smsCampaigns) {
    try {
      // Find the dedicated placeholder client for unmatched SMS campaigns.
      // We do NOT include this client in the matching candidates (to avoid accidental matches),
      // but we DO use it as a safe fallback bucket instead of leaving clientId NULL.
      const smsOnlyClient = await prisma.mauticClient.findFirst({
        where: { reportId: 'sms-only' },
        select: { id: true, name: true }
      });

      // Fetch all MauticClient records for matching
      const mauticClients = await prisma.mauticClient.findMany({
        where: {
          isActive: true,
          NOT: { reportId: 'sms-only' }
        },
        select: { id: true, name: true, reportId: true }
      });

      logger.info(`   🔍 Matching campaigns against ${mauticClients.length} Mautic clients...`);

      const storedCampaigns = [];
      const matchStats = { matched: 0, unmatched: 0 };

      for (const sms of smsCampaigns) {
        // Extract category info
        let category = { title: 'SMS', alias: 'sms' };
        if (sms.category) {
          category = {
            id: sms.category.id,
            title: sms.category.title || 'SMS',
            alias: sms.category.alias || 'sms'
          };
        }

        // Find best matching MauticClient using intelligent matching
        let matchedClientId = null;
        let bestMatch = null;
        let bestMatchScore = 999;

        for (const client of mauticClients) {
          const result = campaignGrouping.isClientMatch(client.name, sms.name);
          if (result.match && result.priority < bestMatchScore) {
            matchedClientId = client.id;
            bestMatch = { clientName: client.name, ...result };
            bestMatchScore = result.priority;
          }
        }

        if (matchedClientId) {
          matchStats.matched++;
          logger.info(`      ✅ "${sms.name}" → MauticClient: ${bestMatch.clientName} (${bestMatch.reason})`);
        } else {
          matchStats.unmatched++;
          if (smsOnlyClient?.id) {
            matchedClientId = smsOnlyClient.id;
            logger.info(`      ⚠️  "${sms.name}" → No MauticClient match (bucketed under ${smsOnlyClient.name || 'sms-only'})`);
          } else {
            logger.warn(`      ⚠️  "${sms.name}" → No MauticClient match and sms-only bucket not found (clientId will be NULL)`);
          }
        }

        // Upsert campaign with matched clientId.
        // IMPORTANT: allow clearing wrong previous clientId by setting sms-only (if available)
        // or NULL (if sms-only bucket is missing).
        const updateData = {
          name: sms.name,
          category: category,
          sentCount: parseInt(sms.sentCount || 0),
          smsClientId: smsClient.id,
          clientId: matchedClientId,
          updatedAt: new Date()
        };

        // Normalize origin URL once
        const normalizedOrigin = smsClient.mauticUrl.trim().replace(/\/$/, '').toLowerCase();

        // Use upsert by composite unique (mauticId + originMauticUrl)
        // so different Mautic instances can safely have the same mauticId.
        const stored = await prisma.mauticSms.upsert({
          where: {
            mauticId_origin_unique: {
              mauticId: sms.id,
              originMauticUrl: normalizedOrigin
            }
          },
          create: {
            mauticId: sms.id,
            name: sms.name,
            category: category,
            sentCount: parseInt(sms.sentCount || 0),
            smsClientId: smsClient.id,
            clientId: matchedClientId, // Automatically link to MauticClient (or null for SMS-only)
            originMauticUrl: normalizedOrigin,
            originUsername: smsClient.username,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          update: {
            ...updateData,
            originMauticUrl: normalizedOrigin,
            originUsername: smsClient.username
          }
        });

        storedCampaigns.push(stored);
      }

      logger.info(`   💾 Stored ${storedCampaigns.length} campaigns (${matchStats.matched} matched, ${matchStats.unmatched} unmatched)`);
      return storedCampaigns;
    } catch (error) {
      logger.error('Failed to store SMS campaigns:', error);
      throw error;
    }
  }

  /**
   * Sync stats (leads and replies) for a specific campaign
   * Strategy: Fetch sent events from lead_event_log, then enrich with replies
   */
  async syncCampaignStats(smsClient, campaign, password) {
    try {
      const auth = Buffer.from(`${smsClient.username}:${password}`).toString('base64');
      const baseUrl = smsClient.mauticUrl.replace(/\/$/, '');

      // Step 1: Fetch SMS sent events to get lead IDs
      const sentEvents = await this.fetchSmsSentEvents(baseUrl, auth, campaign.mauticId);
      logger.info(`      📤 Found ${sentEvents.length} sent events for campaign ${campaign.mauticId}`);

      if (sentEvents.length === 0) {
        // No sent events means campaign hasn't been sent yet
        return { created: 0, updated: 0 };
      }

      // Step 2: Fetch all SMS replies for this campaign
      const replies = await this.fetchSmsReplies(baseUrl, auth, campaign.mauticId);
      logger.info(`      💬 Found ${replies.length} replies`);

      // Step 3: Map replies by leadId
      const replyMap = new Map();
      replies.forEach(reply => {
        if (reply.lead_id) {
          replyMap.set(parseInt(reply.lead_id), {
            replyText: reply.message || reply.reply_text || null,
            repliedAt: reply.date_added ? new Date(reply.date_added) : null,
            replyCategory: this.categorizeReply(reply.message || reply.reply_text)
          });
        }
      });

      // Step 4: Store/update stats for each sent event
      let created = 0;
      let updated = 0;

      // ✅ Incremental behavior:
      // - Do not re-fetch contact details for leads we already have.
      // - Only update existing rows when we learn something new (mobile/reply fields).
      const existingStats = await prisma.mauticSmsStat.findMany({
        where: { smsId: campaign.id },
        select: {
          id: true,
          leadId: true,
          mobile: true,
          replyText: true,
          replyCategory: true,
          repliedAt: true
        }
      });
      const existingByLeadId = new Map(existingStats.map((s) => [s.leadId, s]));

      // Group sent events by lead ID to handle duplicates
      const leadEvents = new Map();
      sentEvents.forEach(event => {
        const leadId = parseInt(event.lead_id);
        if (!leadEvents.has(leadId) || new Date(event.date_added) > new Date(leadEvents.get(leadId).date_added)) {
          leadEvents.set(leadId, event);
        }
      });

      // Process each unique lead
      for (const [leadId, event] of leadEvents.entries()) {
        const reply = replyMap.get(leadId) || {};

        try {
          const existing = existingByLeadId.get(leadId);

          if (existing) {
            const updateData = {};

            // Only fetch lead details if we are missing mobile
            if (!existing.mobile) {
              const leadData = await this.fetchLead(baseUrl, auth, leadId);
              const mobile = leadData?.fields?.all?.mobile || leadData?.fields?.core?.mobile || null;
              if (mobile) {
                updateData.mobile = mobile;
              }
            }

            // Update reply fields only if we learned something new
            if (reply.replyText) {
              const existingRepliedAt = existing.repliedAt ? new Date(existing.repliedAt) : null;
              const incomingRepliedAt = reply.repliedAt ? new Date(reply.repliedAt) : null;
              const isNewerReply = incomingRepliedAt && (!existingRepliedAt || incomingRepliedAt > existingRepliedAt);

              if (!existing.replyText || isNewerReply) {
                updateData.replyText = reply.replyText;
                updateData.replyCategory = reply.replyCategory || existing.replyCategory;
                updateData.repliedAt = reply.repliedAt || existing.repliedAt;
              }
            }

            if (Object.keys(updateData).length > 0) {
              await prisma.mauticSmsStat.update({
                where: { id: existing.id },
                data: {
                  ...updateData,
                  isSynced: true,
                  lastSyncedAt: new Date(),
                  updatedAt: new Date()
                }
              });
              updated++;
            }
          } else {
            // Fetch lead details for NEW leads only
            const leadData = await this.fetchLead(baseUrl, auth, leadId);
            const mobile = leadData?.fields?.all?.mobile || leadData?.fields?.core?.mobile || null;

            await prisma.mauticSmsStat.create({
              data: {
                smsId: campaign.id,
                mauticSmsId: campaign.mauticId,
                leadId: leadId,
                dateSent: event.date_added ? new Date(event.date_added) : new Date(),
                isFailed: '0',
                mobile: mobile,
                messageText: campaign.message || null,
                replyText: reply.replyText || null,
                replyCategory: reply.replyCategory || null,
                repliedAt: reply.repliedAt || null,
                isSynced: true,
                lastSyncedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date()
              }
            });
            created++;
          }

          // Rate limiting - wait between lead fetches (only when we had to call contact API)
          if (!existing || (existing && !existing.mobile)) {
            await this.delay(100);
          }
        } catch (error) {
          logger.error(`      Failed to process lead ${leadId}:`, error.message);
        }
      }

      logger.info(`      ✅ Stats synced: ${created} created, ${updated} updated`);
      return { created, updated };
    } catch (error) {
      logger.error('Failed to sync campaign stats:', error);
      throw error;
    }
  }

  /**
   * Fetch SMS sent events from lead event log
   */
  async fetchSmsSentEvents(baseUrl, auth, smsCampaignId) {
    try {
      const sentEvents = [];
      let start = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const response = await axios.get(`${baseUrl}/api/stats/lead_event_log`, {
          headers: { Authorization: `Basic ${auth}` },
          params: {
            'where[0][col]': 'object',
            'where[0][expr]': 'eq',
            'where[0][val]': 'sms',
            'where[1][col]': 'object_id',
            'where[1][expr]': 'eq',
            'where[1][val]': smsCampaignId,
            'where[2][col]': 'action',
            'where[2][expr]': 'in',
            'where[2][val]': ['sent', 'delivered'],
            start,
            limit
          },
          timeout: 30000
        });

        const statsData = response.data?.stats || {};
        const events = Object.values(statsData);
        sentEvents.push(...events);

        if (events.length < limit) {
          hasMore = false;
        } else {
          start += limit;
        }

        await this.delay(100);
      }

      return sentEvents;
    } catch (error) {
      logger.error(`Failed to fetch sent events for campaign ${smsCampaignId}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch a single lead's details from Mautic
   */
  async fetchLead(baseUrl, auth, leadId) {
    try {
      const response = await axios.get(`${baseUrl}/api/contacts/${leadId}`, {
        headers: { Authorization: `Basic ${auth}` },
        timeout: 10000
      });

      return response.data?.contact || null;
    } catch (error) {
      logger.error(`Failed to fetch lead ${leadId}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch SMS replies from lead event log
   */
  async fetchSmsReplies(baseUrl, auth, smsCampaignId) {
    try {
      const replies = [];
      let start = 0;
      const limit = 100;
      let hasMore = true;

      // Fetch replies from stats/lead_event_log
      while (hasMore) {
        const response = await axios.get(`${baseUrl}/api/stats/lead_event_log`, {
          headers: { Authorization: `Basic ${auth}` },
          params: {
            'where[0][col]': 'object',
            'where[0][expr]': 'eq',
            'where[0][val]': 'sms',
            'where[1][col]': 'object_id',
            'where[1][expr]': 'eq',
            'where[1][val]': smsCampaignId,
            'where[2][col]': 'action',
            'where[2][expr]': 'eq',
            'where[2][val]': 'reply',
            start,
            limit
          },
          timeout: 30000
        });

        const statsData = response.data?.stats || {};
        const statsArray = Object.values(statsData);
        replies.push(...statsArray);

        if (statsArray.length < limit) {
          hasMore = false;
        } else {
          start += limit;
        }

        // Rate limiting
        await this.delay(100);
      }

      return replies;
    } catch (error) {
      logger.error(`Failed to fetch replies for campaign ${smsCampaignId}:`, error.message);
      return [];
    }
  }

  /**
   * Categorize reply text
   */
  categorizeReply(replyText) {
    if (!replyText) return null;
    
    const text = replyText.toLowerCase().trim();
    
    if (text.includes('stop') || text === 'stop') {
      return 'Stop';
    }
    if (text.includes('unsubscribe') || text.includes('unsub')) {
      return 'Unsubscribe';
    }
    
    return 'Other';
  }

  /**
   * Delay helper
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new SmsClientSyncService();
