import logger from '../../../utils/logger.js';
import cron from 'node-cron';
import SftpService from './sftpService.js';
import DataService from './dataService.js';

class SchedulerService {
  constructor() {
    this.sftpService = new SftpService();
    this.dataService = new DataService();
    this.cronSchedule = process.env.CRON_SCHEDULE || '0 2 * * *'; // Default: 2 AM daily
    this.job = null;
  }

  async fetchAndProcessData() {
    try {
      logger.debug('Scheduled fetch started at:', new Date().toISOString());
      
      // Download files from SFTP
      const downloadResult = await this.sftpService.downloadAllFiles();
      
      if (!downloadResult.success) {
        throw new Error('Failed to download files from SFTP');
      }

      // Parse downloaded files
      const campaignData = await this.sftpService.parseLocalFiles();
      
      // Save and aggregate data
      const metrics = await this.dataService.saveCampaignData(campaignData);
      
      // Log the sync
      await this.dataService.logSync('success', {
        type: 'scheduled',
        filesDownloaded: downloadResult.filesDownloaded,
        campaignsProcessed: campaignData.length,
        totalRecords: campaignData.reduce((sum, c) => sum + c.recordCount, 0)
      });

      logger.debug('Scheduled fetch completed successfully');
      logger.debug(`   - Files downloaded: ${downloadResult.filesDownloaded}`);
      logger.debug(`   - Campaigns processed: ${campaignData.length}`);
      
      return {
        success: true,
        filesDownloaded: downloadResult.filesDownloaded,
        campaignsProcessed: campaignData.length,
        metrics
      };
    } catch (error) {
      logger.error('Scheduled fetch failed:', error);
      
      await this.dataService.logSync('failed', {
        type: 'scheduled',
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  start() {
    if (this.job) {
      logger.debug('WARNING: Scheduler is already running');
      return;
    }

    this.job = cron.schedule(this.cronSchedule, async () => {
      await this.fetchAndProcessData();
    });

    logger.debug(`Scheduler started with cron: ${this.cronSchedule}`);
    logger.debug('   Next run will be at the scheduled time');
  }

  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      logger.debug('Scheduler stopped');
    }
  }

  getStatus() {
    return {
      isRunning: this.job !== null,
      cronSchedule: this.cronSchedule,
      nextRun: this.job ? 'Scheduled' : 'Not scheduled'
    };
  }
}

export default SchedulerService;
