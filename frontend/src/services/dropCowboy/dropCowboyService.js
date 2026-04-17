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
  constructor() {
    this.clientCache = new Map();
    this.clientInflight = new Map();
  }

  buildQueryString(query = {}) {
    const params = new URLSearchParams();
    Object.entries(query)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      });
    return params.toString();
  }

  getClientCacheKey(path, query = {}) {
    return `${path}?${this.buildQueryString(query)}`;
  }

  clearClientCache() {
    this.clientCache.clear();
    this.clientInflight.clear();
  }

  async clientGet(path, query = {}, options = {}) {
    const { cacheTtlMs = 0, bypassCache = false } = options;
    const token = localStorage.getItem('token');
    const baseUrl = import.meta.env.VITE_API_URL || '';
    const queryString = this.buildQueryString(query);
    const url = `${baseUrl}/api/clients${path}${queryString ? `?${queryString}` : ''}`;
    const cacheKey = this.getClientCacheKey(path, query);

    if (!bypassCache && cacheTtlMs > 0) {
      const cached = this.clientCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.payload;
      }
    }

    if (this.clientInflight.has(cacheKey)) {
      return this.clientInflight.get(cacheKey);
    }

    const pending = (async () => {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || 'Request failed');
      }

      if (cacheTtlMs > 0) {
        this.clientCache.set(cacheKey, {
          payload,
          expiresAt: Date.now() + cacheTtlMs,
        });
      }

      return payload;
    })();

    this.clientInflight.set(cacheKey, pending);
    try {
      return await pending;
    } finally {
      this.clientInflight.delete(cacheKey);
    }
  }

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
      this.clearClientCache();
      return {
        success: true,
        data: response.data,
        error: null
      };
    } catch (error) {
      
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
      return {
        success: false,
        data: { isSyncing: false },
        error: error.response?.data?.message || error.message || 'Failed to fetch sync status'
      };
    }
  }

  /**
   * Get lightweight dashboard summary (aggregated stats only, no individual records)
   * @returns {Promise<Object>} Dashboard summary
   */
  async getDashboardSummary() {
    try {
      const response = await api.get('/dashboard-summary');
      return {
        success: true,
        data: response.data.data,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || error.message || 'Failed to fetch dashboard summary'
      };
    }
  }

  async getClientCampaigns(clientName, filters = {}) {
    try {
      const encodedName = encodeURIComponent(clientName);
      const response = await this.clientGet(`/${encodedName}/dropcowboy/campaigns`, {
        startDate: filters.startDate,
        endDate: filters.endDate,
      }, { cacheTtlMs: 60 * 1000, bypassCache: !!filters.noCache });
      return {
        success: true,
        data: response?.data || [],
        overall: response?.overall || null,
        error: null,
      };
    } catch (error) {
      console.error('Error fetching client campaigns:', error);
      return {
        success: false,
        data: [],
        overall: null,
        error: error.response?.data?.message || error.message || 'Failed to fetch client campaigns',
      };
    }
  }

  async getClientStats(clientName, filters = {}) {
    try {
      const encodedName = encodeURIComponent(clientName);
      const response = await this.clientGet(`/${encodedName}/dropcowboy/stats`, {
        startDate: filters.startDate,
        endDate: filters.endDate,
      }, { cacheTtlMs: 60 * 1000, bypassCache: !!filters.noCache });
      return {
        success: true,
        data: response?.data || null,
        error: null,
      };
    } catch (error) {
      console.error('Error fetching client DropCowboy stats:', error);
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || error.message || 'Failed to fetch client DropCowboy stats',
      };
    }
  }

  async getClientCampaignRecords(clientName, campaignId, filters = {}) {
    try {
      const encodedName = encodeURIComponent(clientName);
      const response = await this.clientGet(
        `/${encodedName}/dropcowboy/campaigns/${encodeURIComponent(campaignId)}/records`,
        {
          page: filters.page || 1,
          limit: filters.limit || 50,
          startDate: filters.startDate,
          endDate: filters.endDate,
          status: filters.status && filters.status !== 'all' ? filters.status : undefined,
        },
        { cacheTtlMs: 30 * 1000, bypassCache: !!filters.noCache }
      );
      return {
        success: true,
        data: response?.data || { records: [], metrics: null, pagination: null },
        error: null,
      };
    } catch (error) {
      console.error('Error fetching client campaign records:', error);
      return {
        success: false,
        data: { records: [], metrics: null, pagination: null },
        error: error.response?.data?.message || error.message || 'Failed to fetch client campaign records',
      };
    }
  }
}

// Export a singleton instance
export default new DropCowboyService();
