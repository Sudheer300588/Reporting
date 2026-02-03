import cron from 'node-cron';
import mauticAPI from './mauticAPI.js';
import dataService from './dataService.js';
import smsService from './smsService.js';
import prisma from '../../../prisma/client.js';

class MauticSchedulerService {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
  }

  /**
   * Get current sync progress and recent sync logs for monitoring
   */
  async getSyncProgress() {
    try {
      const activeClients = await prisma.mauticClient.count({ where: { isActive: true } });
      const recentSyncs = await prisma.syncLog.findMany({
        where: { source: 'mautic' },
        orderBy: { syncStartedAt: 'desc' },
        take: 10
      });

      return {
        isRunning: this.isRunning,
        activeClients,
        recentSyncs
      };
    } catch (error) {
      console.error('Error fetching sync progress from DB:', error.message);
      throw error;
    }
  }

  /**
   * Start the scheduler
   */
  start() {
    const schedule = process.env.MAUTIC_SYNC_SCHEDULE || '0 3 * * *'; // Default: 3 AM daily

    if (this.cronJob) {
      console.log('⏰ Mautic scheduler already running');
      return;
    }

    console.log(`⏰ Starting Mautic sync scheduler: ${schedule}`);

    this.cronJob = cron.schedule(schedule, async () => {
      if (this.isRunning) {
        console.log('⏭️  Skipping Mautic sync - previous sync still running');
        return;
      }

      await this.syncAllClients();
    });

    console.log('✅ Mautic scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Mautic scheduler stopped');
    }
  }

  /**
   * Sync data for all active clients
   */
  async syncAllClients(options = {}) {
    if (this.isRunning) {
      console.log('⚠️  Mautic sync already in progress');
      return {
        success: false,
        message: 'Sync already in progress. Please wait for the current sync to complete.',
        error: 'SYNC_IN_PROGRESS'
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('🔄 Starting scheduled Mautic sync for all clients...');

      // Optionally force a full re-fetch by clearing lastSyncAt for active clients
      if (options.forceFull) {
        console.log('⚠️ forceFull requested: clearing lastSyncAt for active clients');
        try {
          await prisma.mauticClient.updateMany({ where: { isActive: true }, data: { lastSyncAt: null } });
        } catch (e) {
          console.warn('Failed to clear lastSyncAt for clients:', e.message);
        }
      }

      // Get all active clients
      const clients = await prisma.mauticClient.findMany({ where: { isActive: true } });

      if (clients.length === 0) {
        console.log('ℹ️  No active clients found');
        this.isRunning = false;
        return {
          success: false,
          message: 'No active Autovation Clients found. Please add a client first.',
          error: 'NO_CLIENTS'
        };
      }

      const results = {
        totalClients: clients.length,
        successful: 0,
        failed: 0,
        details: []
      };

      // ⚡ Sync clients in MASSIVE parallel batches for 1000x speed
      const CONCURRENT_SYNCS = parseInt(process.env.MAUTIC_CONCURRENT_SYNCS) || 20; // ⚡ Increased from 5 to 20
      console.log(`🚀 Processing ${clients.length} clients in ULTRA FAST batches of ${CONCURRENT_SYNCS}...`);

      // Process clients in batches
      for (let i = 0; i < clients.length; i += CONCURRENT_SYNCS) {
        const batch = clients.slice(i, i + CONCURRENT_SYNCS);
        const batchNumber = Math.floor(i / CONCURRENT_SYNCS) + 1;
        const totalBatches = Math.ceil(clients.length / CONCURRENT_SYNCS);

        console.log(`\n� Processing batch ${batchNumber}/${totalBatches} (${batch.length} clients)...`);

        // Sync batch in parallel
        const batchPromises = batch.map(async (client) => {
          try {
            console.log(`📊 [${client.name}] Starting sync...`);
            // Pass per-client option (forceFull respected earlier for global)
            const syncResult = await mauticAPI.syncAllData(client);

            if (syncResult.success) {
              console.log(`💾 [${client.name}] Saving data to database...`);

              // Save emails, campaigns, segments, and SMS campaigns
              // Email reports are already saved to DB during fetch
              const saveResults = await Promise.all([
                dataService.saveCampaigns(client.id, syncResult.data.campaigns),
                dataService.saveSegments(client.id, syncResult.data.segments),
                smsService.storeSmsCampaigns(client.id, syncResult.data.smses || []).catch(err => {
                  console.warn(`[${client.name}] SMS campaigns save failed (non-fatal):`, err.message);
                  return { created: 0, updated: 0, total: 0 };
                })
              ]);

              // Fetch SMS stats for each campaign (non-fatal)
              let smsSatsTotal = 0;
              for (const sms of (syncResult.data.smses || [])) {
                try {
                  console.log(`📞 Fetching stats for SMS campaign: ${sms.name} (ID: ${sms.mauticId || sms.id})`);
                  const smsRecord = await prisma.mauticSms.findUnique({
                    where: { clientId_mauticId: { clientId: client.id, mauticId: sms.mauticId || sms.id.toString() } }
                  });
                  if (smsRecord) {
                    const statsResult = await mauticAPI.fetchSmsStats(client, sms.mauticId || sms.id);
                    console.log(`📊 Stats result for ${sms.name}:`, { success: statsResult.success, totalFetched: statsResult.totalFetched });
                    if (statsResult && statsResult.stats && statsResult.stats.length > 0) {
                      // Normalize stat field names from Mautic API response
                      const normalizedStats = statsResult.stats.map(stat => ({
                        lead_id: stat.lead_id || stat.leadId || stat.id,
                        date_sent: stat.date_sent || stat.dateSent || stat.date_added,
                        is_failed: stat.is_failed || '0'
                      }));
                      const storeResult = await smsService.storeSmsStats(client.id, smsRecord.id, normalizedStats);
                      smsSatsTotal += storeResult.created;
                      console.log(`💾 Stored ${storeResult.created} SMS stats for ${sms.name}`);
                    } else {
                      console.log(`⚠️ No SMS stats found for ${sms.name}`);
                    }
                  }
                } catch (err) {
                  console.warn(`[${client.name}] SMS stats fetch failed (non-fatal):`, err.message);
                }
              }
              // For backwards compatibility, create a mock emailsResult object
              const emailsResult = {
                created: 0,
                updated: syncResult.data.emails?.length || 0,
                total: syncResult.data.emails?.length || 0
              };

              // Update last sync time
              await dataService.updateClientSyncTime(client.id);

              // Count total email reports currently in DB for this client
              const totalReportsInDb = await prisma.mauticEmailReport.count({
                where: { clientId: client.id }
              });

              // ✅ Unified, clean log with consistent numbering based on saveResults
              console.log(
                `✅ [${client.name}] Synced successfully - ` +
                `Emails: ${emailsResult?.total || 0}, ` +
                `Campaigns: ${saveResults[0]?.total || 0}, ` +
                `Segments: ${saveResults[1]?.total || 0}, ` +
                `SMS: ${saveResults[2]?.total || 0}, ` +
                `SMS Stats: ${smsSatsTotal || 0}, ` +
                `Email Reports: ${syncResult.data.emailReports.created} created, ` +
                `${syncResult.data.emailReports.skipped} skipped, ` +
                `totalInDb: ${totalReportsInDb}`
              );

              return {
                success: true,
                clientId: client.id,
                clientName: client.name,
                emails: emailsResult,
                campaigns: saveResults[0],
                segments: saveResults[1],
                sms: saveResults[2],
                emailReports: {
                  ...syncResult.data.emailReports,
                  totalInDb: totalReportsInDb
                }
              };
            } else {
              throw new Error(syncResult.error);
            }
          } catch (error) {
            console.error(`❌ [${client.name}] Failed:`, error.message);
            return {
              success: false,
              clientId: client.id,
              clientName: client.name,
              error: error.message
            };
          }
        });

        // Wait for batch to complete
        const batchResults = await Promise.allSettled(batchPromises);

        // Process results
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value) {
            const detail = result.value;
            if (detail.success) {
              results.successful++;
            } else {
              results.failed++;
            }
            results.details.push(detail);
          } else {
            results.failed++;
            results.details.push({
              success: false,
              error: result.reason?.message || 'Unknown error'
            });
          }
        });

        console.log(`✅ Batch ${batchNumber}/${totalBatches} completed (Success: ${results.successful}, Failed: ${results.failed})`);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✅ Mautic sync completed in ${duration}s`);
      console.log(`   Successful: ${results.successful}/${results.totalClients}`);
      console.log(`   Failed: ${results.failed}/${results.totalClients}`);

      this.isRunning = false;

      return {
        success: true,
        message: `Sync completed successfully! ${results.successful} of ${results.totalClients} clients synced.`,
        duration,
        results
      };
    } catch (error) {
      console.error('❌ Mautic sync error:', error);
      this.isRunning = false;

      return {
        success: false,
        message: `Sync failed: ${error.message}`,
        error: error.message || 'Unknown error occurred'
      };
    }
  }

  /**
   * Sync data for a specific client
   * @param {number} clientId - Client ID
   */
  async syncClient(clientId) {
    try {
      console.log(`🔄 Starting manual sync for client ${clientId}...`);

      const client = await prisma.mauticClient.findUnique({ where: { id: clientId } });

      if (!client) {
        throw new Error('Client not found');
      }

      if (!client.isActive) {
        throw new Error('Client is inactive');
      }

      const syncResult = await mauticAPI.syncAllData(client);

      if (!syncResult.success) {
        throw new Error(syncResult.error);
      }

      // Save data to database
      // syncAllData already saves emails to DB with correct readCount/sentCount/clickedCount
      // Here we save campaigns, segments, and SMS campaigns (emails skipped to avoid duplication)
      const [campaignsResult, segmentsResult, smsResult] = await Promise.all([
        dataService.saveCampaigns(client.id, syncResult.data.campaigns),
        dataService.saveSegments(client.id, syncResult.data.segments),
        smsService.storeSmsCampaigns(client.id, syncResult.data.smses || []).catch(err => {
          console.warn(`[${client.name}] SMS campaigns save failed (non-fatal):`, err.message);
          return { created: 0, updated: 0, total: 0 };
        })
      ]);

      // Fetch SMS stats for each campaign (non-fatal)
      let smsSatsTotal = 0;
      for (const sms of (syncResult.data.smses || [])) {
        try {
          console.log(`📞 Fetching stats for SMS campaign: ${sms.name} (ID: ${sms.mauticId || sms.id})`);
          const smsRecord = await prisma.mauticSms.findUnique({
            where: { clientId_mauticId: { clientId: client.id, mauticId: sms.mauticId || sms.id.toString() } }
          });
          if (smsRecord) {
            const statsResult = await mauticAPI.fetchSmsStats(client, sms.mauticId || sms.id);
            console.log(`📊 Stats result for ${sms.name}:`, { success: statsResult.success, totalFetched: statsResult.totalFetched });
            if (statsResult && statsResult.stats && statsResult.stats.length > 0) {
              // Normalize stat field names from Mautic API response
              const normalizedStats = statsResult.stats.map(stat => ({
                lead_id: stat.lead_id || stat.leadId || stat.id,
                date_sent: stat.date_sent || stat.dateSent || stat.date_added,
                is_failed: stat.is_failed || '0'
              }));
              const storeResult = await smsService.storeSmsStats(client.id, smsRecord.id, normalizedStats);
              smsSatsTotal += storeResult.created;
              console.log(`💾 Stored ${storeResult.created} SMS stats for ${sms.name}`);
            } else {
              console.log(`⚠️ No SMS stats found for ${sms.name}`);
            }
          }
        } catch (err) {
          console.warn(`SMS stats fetch failed (non-fatal):`, err.message);
        }
      }
      // For backwards compatibility, create a mock emailsResult object
      const emailsResult = {
        created: 0,
        updated: syncResult.data.emails?.length || 0,
        total: syncResult.data.emails?.length || 0
      };

      // Update last sync time
      await dataService.updateClientSyncTime(client.id);

      console.log(`✅ Client ${client.name} synced successfully`);

      // Also report total email reports in DB for this client
      const totalReportsInDb = await prisma.mauticEmailReport.count({ where: { clientId: client.id } });

      return {
        success: true,
        message: `${client.name} synced successfully!`,
        data: {
          clientName: client.name,
          emails: emailsResult,
          campaigns: campaignsResult,
          segments: segmentsResult,
          smsCampaigns: smsResult,
          smsSats: { created: smsSatsTotal },
          emailReports: {
            ...syncResult.data.emailReports,
            totalInDb: totalReportsInDb
          }
        }
      };
    } catch (error) {
      console.error('Error syncing client:', error);
      return {
        success: false,
        message: `Failed to sync ${clientId ? 'client' : 'clients'}: ${error.message}`,
        error: error.message || 'Unknown error occurred'
      };
    }
  }
}

export default MauticSchedulerService;