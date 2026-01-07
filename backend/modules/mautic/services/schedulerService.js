import logger from '../../../utils/logger.js';
import cron from 'node-cron';
import mauticAPI from './mauticAPI.js';
import dataService from './dataService.js';
import prisma from '../../../prisma/client.js';

class MauticSchedulerService {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
    this.syncProgress = {
      isActive: false,
      startTime: null,
      totalClients: 0,
      completedClients: 0,
      currentBatch: 0,
      totalBatches: 0,
      clients: {}
    };
  }

  getSyncProgress() {
    const elapsedSeconds = this.syncProgress.startTime 
      ? Math.floor((Date.now() - this.syncProgress.startTime) / 1000)
      : 0;
    
    return {
      ...this.syncProgress,
      elapsedSeconds,
      clientList: Object.values(this.syncProgress.clients).sort((a, b) => {
        const statusOrder = { syncing: 0, pending: 1, completed: 2, failed: 3 };
        return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
      })
    };
  }

  resetProgress() {
    this.syncProgress = {
      isActive: false,
      startTime: null,
      totalClients: 0,
      completedClients: 0,
      currentBatch: 0,
      totalBatches: 0,
      clients: {}
    };
  }

  updateClientProgress(clientId, clientName, status, details = {}) {
    this.syncProgress.clients[clientId] = {
      clientId,
      clientName,
      status,
      startTime: this.syncProgress.clients[clientId]?.startTime || (status === 'syncing' ? Date.now() : null),
      endTime: ['completed', 'failed'].includes(status) ? Date.now() : null,
      ...details
    };
    
    if (['completed', 'failed'].includes(status)) {
      this.syncProgress.completedClients = Object.values(this.syncProgress.clients)
        .filter(c => ['completed', 'failed'].includes(c.status)).length;
    }
  }

  start() {
    const schedule = process.env.MAUTIC_SYNC_SCHEDULE || '0 3 * * *';

    if (this.cronJob) {
      logger.debug('⏰ Mautic scheduler already running');
      return;
    }

    logger.debug(`⏰ Starting Mautic sync scheduler: ${schedule}`);

    this.cronJob = cron.schedule(schedule, async () => {
      if (this.isRunning) {
        logger.debug('⏭️  Skipping Mautic sync - previous sync still running');
        return;
      }

      await this.syncAllClients();
    });

    logger.debug('✅ Mautic scheduler started');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.debug('🛑 Mautic scheduler stopped');
    }
  }

  async syncAllClients(options = {}) {
    if (this.isRunning) {
      logger.debug('⚠️  Mautic sync already in progress');
      return {
        success: false,
        message: 'Sync already in progress. Please wait for the current sync to complete.',
        error: 'SYNC_IN_PROGRESS'
      };
    }

    this.isRunning = true;
    this.resetProgress();
    this.syncProgress.isActive = true;
    this.syncProgress.startTime = Date.now();

    try {
      logger.debug('🔄 Starting scheduled Mautic sync for all clients...');

      if (options.forceFull) {
        logger.debug('⚠️ forceFull requested: clearing lastSyncAt for active clients');
        try {
          await prisma.mauticClient.updateMany({ where: { isActive: true }, data: { lastSyncAt: null } });
        } catch (e) {
          logger.warn('Failed to clear lastSyncAt for clients:', e.message);
        }
      }

      const clients = await prisma.mauticClient.findMany({ 
        where: { isActive: true },
        orderBy: { lastSyncAt: 'desc' }
      });

      if (clients.length === 0) {
        logger.debug('ℹ️  No active clients found');
        this.isRunning = false;
        this.syncProgress.isActive = false;
        return {
          success: false,
          message: 'No active Autovation Clients found. Please add a client first.',
          error: 'NO_CLIENTS'
        };
      }

      this.syncProgress.totalClients = clients.length;
      
      clients.forEach(client => {
        this.updateClientProgress(client.id, client.name, 'pending', {
          lastSyncAt: client.lastSyncAt
        });
      });

      const results = {
        totalClients: clients.length,
        successful: 0,
        failed: 0,
        details: []
      };

      const CONCURRENT_SYNCS = parseInt(process.env.MAUTIC_CONCURRENT_SYNCS) || 5;
      const totalBatches = Math.ceil(clients.length / CONCURRENT_SYNCS);
      this.syncProgress.totalBatches = totalBatches;
      
      logger.debug(`📦 Processing ${clients.length} clients in batches of ${CONCURRENT_SYNCS}...`);

      for (let i = 0; i < clients.length; i += CONCURRENT_SYNCS) {
        const batch = clients.slice(i, i + CONCURRENT_SYNCS);
        const batchNumber = Math.floor(i / CONCURRENT_SYNCS) + 1;
        this.syncProgress.currentBatch = batchNumber;

        logger.debug(`\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} clients)...`);

        const batchPromises = batch.map(async (client) => {
          try {
            this.updateClientProgress(client.id, client.name, 'syncing', {
              phase: 'fetching',
              message: 'Fetching data from Mautic...'
            });
            
            logger.debug(`📊 [${client.name}] Starting sync...`);
            const syncResult = await mauticAPI.syncAllData(client, (progress) => {
              this.updateClientProgress(client.id, client.name, 'syncing', {
                phase: progress.phase,
                message: progress.message,
                recordsProcessed: progress.recordsProcessed,
                totalRecords: progress.totalRecords
              });
            });

            if (syncResult.success) {
              this.updateClientProgress(client.id, client.name, 'syncing', {
                phase: 'saving',
                message: 'Saving data to database...'
              });
              
              logger.debug(`💾 [${client.name}] Saving data to database...`);

              const saveResults = await Promise.all([
                dataService.saveEmails(client.id, syncResult.data.emails),
                dataService.saveCampaigns(client.id, syncResult.data.campaigns),
                dataService.saveSegments(client.id, syncResult.data.segments)
              ]);

              await dataService.updateClientSyncTime(client.id);

              const totalReportsInDb = await prisma.mauticEmailReport.count({ where: { clientId: client.id } });

              logger.debug(`✅ [${client.name}] Synced successfully - Emails: ${saveResults[0].total}, Campaigns: ${saveResults[1].total}, Segments: ${saveResults[2].total}, Email Reports: ${syncResult.data.emailReports.created} created, ${syncResult.data.emailReports.skipped} skipped, totalInDb: ${totalReportsInDb}`);

              this.updateClientProgress(client.id, client.name, 'completed', {
                phase: 'done',
                message: 'Sync completed successfully',
                emails: saveResults[0].total,
                campaigns: saveResults[1].total,
                segments: saveResults[2].total,
                emailReports: syncResult.data.emailReports.created,
                totalReportsInDb
              });

              return {
                success: true,
                clientId: client.id,
                clientName: client.name,
                emails: saveResults[0],
                campaigns: saveResults[1],
                segments: saveResults[2],
                emailReports: {
                  ...syncResult.data.emailReports,
                  totalInDb: totalReportsInDb
                }
              };
            } else {
              throw new Error(syncResult.error);
            }
          } catch (error) {
            logger.error(`❌ [${client.name}] Failed:`, error.message);
            
            this.updateClientProgress(client.id, client.name, 'failed', {
              phase: 'error',
              message: error.message,
              error: error.message
            });
            
            return {
              success: false,
              clientId: client.id,
              clientName: client.name,
              error: error.message
            };
          }
        });

        const batchResults = await Promise.allSettled(batchPromises);

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

        logger.debug(`✅ Batch ${batchNumber}/${totalBatches} completed (Success: ${results.successful}, Failed: ${results.failed})`);
      }

      const duration = ((Date.now() - this.syncProgress.startTime) / 1000).toFixed(2);
      logger.debug(`\n✅ Mautic sync completed in ${duration}s`);
      logger.debug(`   Successful: ${results.successful}/${results.totalClients}`);
      logger.debug(`   Failed: ${results.failed}/${results.totalClients}`);

      return {
        success: true,
        message: `Sync completed successfully! ${results.successful} of ${results.totalClients} clients synced.`,
        duration,
        results
      };
    } catch (error) {
      logger.error('❌ Mautic sync error:', error);

      return {
        success: false,
        message: `Sync failed: ${error.message}`,
        error: error.message || 'Unknown error occurred'
      };
    } finally {
      this.isRunning = false;
      this.syncProgress.isActive = false;
      
      // Schedule cleanup after 5 minutes to allow UI to show final state
      // This prevents memory leaks from accumulating client progress data
      setTimeout(() => {
        if (!this.syncProgress.isActive) {
          logger.debug('🧹 Cleaning up sync progress state');
          this.syncProgress.clients = {};
          this.syncProgress.completedClients = 0;
          this.syncProgress.totalClients = 0;
        }
      }, 5 * 60 * 1000);
    }
  }

  async syncClient(clientId) {
    try {
      logger.debug(`🔄 Starting manual sync for client ${clientId}...`);

      const client = await prisma.mauticClient.findUnique({ where: { id: clientId } });

      if (!client) {
        throw new Error('Client not found');
      }

      if (!client.isActive) {
        throw new Error('Client is inactive');
      }

      this.updateClientProgress(client.id, client.name, 'syncing', {
        phase: 'fetching',
        message: 'Fetching data from Mautic...'
      });

      const syncResult = await mauticAPI.syncAllData(client, (progress) => {
        this.updateClientProgress(client.id, client.name, 'syncing', {
          phase: progress.phase,
          message: progress.message,
          recordsProcessed: progress.recordsProcessed,
          totalRecords: progress.totalRecords
        });
      });

      if (!syncResult.success) {
        this.updateClientProgress(client.id, client.name, 'failed', {
          phase: 'error',
          message: syncResult.error
        });
        throw new Error(syncResult.error);
      }

      this.updateClientProgress(client.id, client.name, 'syncing', {
        phase: 'saving',
        message: 'Saving data to database...'
      });

      const [emailsResult, campaignsResult, segmentsResult] = await Promise.all([
        dataService.saveEmails(client.id, syncResult.data.emails),
        dataService.saveCampaigns(client.id, syncResult.data.campaigns),
        dataService.saveSegments(client.id, syncResult.data.segments)
      ]);

      await dataService.updateClientSyncTime(client.id);

      const totalReportsInDb = await prisma.mauticEmailReport.count({ where: { clientId: client.id } });

      this.updateClientProgress(client.id, client.name, 'completed', {
        phase: 'done',
        message: 'Sync completed successfully',
        emails: emailsResult.total,
        campaigns: campaignsResult.total,
        segments: segmentsResult.total,
        emailReports: syncResult.data.emailReports.created,
        totalReportsInDb
      });

      logger.debug(`✅ Client ${client.name} synced successfully`);

      return {
        success: true,
        message: `${client.name} synced successfully!`,
        data: {
          clientName: client.name,
          emails: emailsResult,
          campaigns: campaignsResult,
          segments: segmentsResult,
          emailReports: {
            ...syncResult.data.emailReports,
            totalInDb: totalReportsInDb
          }
        }
      };
    } catch (error) {
      logger.error('Error syncing client:', error);
      return {
        success: false,
        message: `Failed to sync ${clientId ? 'client' : 'clients'}: ${error.message}`,
        error: error.message || 'Unknown error occurred'
      };
    }
  }
}

export default MauticSchedulerService;
