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
      console.log('Scheduled fetch started at:', new Date().toISOString());
      
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

      console.log('Scheduled fetch completed successfully');
      console.log(`   - Files downloaded: ${downloadResult.filesDownloaded}`);
      console.log(`   - Campaigns processed: ${campaignData.length}`);
      
      return {
        success: true,
        filesDownloaded: downloadResult.filesDownloaded,
        campaignsProcessed: campaignData.length,
        metrics
      };
    } catch (error) {
      console.error('Scheduled fetch failed:', error);
      
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
      console.log('WARNING: Scheduler is already running');
      return;
    }

    this.job = cron.schedule(this.cronSchedule, async () => {
      await this.fetchAndProcessData();
    });

    console.log(`Scheduler started with cron: ${this.cronSchedule}`);
    console.log('   Next run will be at the scheduled time');
  }

  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('Scheduler stopped');
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
