/**
 * Ringless Voicemail Service
 * 
 * Centralized service layer for all Ringless Voicemail API interactions.
 * This service abstracts the API layer and provides clean methods for data operations.
 */

import api, {
  fetchMetrics as apiFetchMetrics, 
  triggerManualFetch as apiTriggerManualFetch,
  fetchSyncLogs as apiFetchSyncLogs,
  fetchCampaignDetails as apiFetchCampaignDetails
} from './api';

class DropCowboyService {
  /**
   * Fetch metrics with optional filters
   * @param {Object} filters - { startDate, endDate, campaignName }
   * @returns {Promise<Object>} Metrics data
   */
  async getMetrics(filters = {}) {
    try {
      const response = await apiFetchMetrics(filters);
      return {
        success: true,
        data: response.data,
        error: null
      };
    } catch (error) {
      console.error('Error fetching metrics:', error);
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || error.message || 'Failed to fetch metrics'
      };
    }
  }

  /**
   * Trigger manual SFTP fetch
   * @returns {Promise<Object>} Fetch result
   */
  async triggerFetch() {
    try {
      const response = await apiTriggerManualFetch();
      return {
        success: true,
        data: response.data,
        error: null
      };
    } catch (error) {
      console.error('Error triggering manual fetch:', error);
      
      // Handle 409 Conflict (sync already in progress)
      if (error.response?.status === 409) {
        return {
          success: false,
          data: null,
          isSyncing: true,
          message: error.response?.data?.message || 'Sync already in progress',
          error: error.response?.data?.message || 'Sync already in progress'
        };
      }
      
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || error.message || 'Failed to trigger fetch'
      };
    }
  }

  /**
   * Fetch sync logs
   * @param {number} limit - Number of logs to fetch
   * @returns {Promise<Object>} Sync logs
   */
  async getSyncLogs(limit = 10) {
    try {
      const response = await apiFetchSyncLogs(limit);
      return {
        success: true,
        data: response.data,
        error: null
      };
    } catch (error) {
      console.error('Error fetching sync logs:', error);
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || error.message || 'Failed to fetch sync logs'
      };
    }
  }

  /**
   * Fetch specific campaign details
   * @param {string} campaignName - Campaign name
   * @returns {Promise<Object>} Campaign details
   */
  async getCampaignDetails(campaignName) {
    try {
      const response = await apiFetchCampaignDetails(campaignName);
      return {
        success: true,
        data: response.data,
        error: null
      };
    } catch (error) {
      console.error('Error fetching campaign details:', error);
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || error.message || 'Failed to fetch campaign details'
      };
    }
  }

  /**
   * Get current sync status
   * @returns {Promise<Object>} Sync status
   */
  async getSyncStatus() {
    try {
      const response = await api.get('/sync-status');
      return {
        success: true,
        data: response.data.data,
        error: null
      };
    } catch (error) {
      console.error('Error fetching sync status:', error);
      return {
        success: false,
        data: { isSyncing: false },
        error: error.response?.data?.message || error.message || 'Failed to fetch sync status'
      };
    }
  }
}

// Export a singleton instance
export default new DropCowboyService();
