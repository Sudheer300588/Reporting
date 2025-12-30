/**
 * Mautic Service
 * 
 * Centralized service layer for all Mautic API interactions.
 * This service abstracts the API layer and provides clean methods for data operations.
 */

import mauticAPI, {
  fetchClients as apiFetchClients,
  createClient as apiCreateClient,
  updateClient as apiUpdateClient,
  deleteClient as apiDeleteClient,
  hardDeleteClient as apiHardDeleteClient,
  testConnection as apiTestConnection,
  fetchDashboardMetrics as apiFetchDashboardMetrics,
  fetchContacts as apiFetchContacts,
  fetchEmails as apiFetchEmails,
  fetchSegments as apiFetchSegments,
  fetchCampaigns as apiFetchCampaigns,
  syncAllClients as apiSyncAllClients,
  syncClient as apiSyncClient
} from './api';

class MauticService {
  /**
   * Get all clients
   * @returns {Promise<Object>} Clients data
   */
  async getClients() {
    try {
      const response = await apiFetchClients();
      return {
        success: true,
        data: response.data.data,
        error: null
      };
    } catch (error) {
      console.error('Error fetching clients:', error);
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || error.message || 'Failed to fetch clients'
      };
    }
  }

  /**
   * Create a new client
   * @param {Object} clientData - { name, mauticUrl, username, password }
   * @returns {Promise<Object>} Result
   */
  async createClient(clientData) {
    try {
      const response = await apiCreateClient(clientData);
      return {
        success: true,
        data: response.data.data,
        message: response.data.message,
        error: null
      };
    } catch (error) {
      console.error('Error creating client:', error);
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || error.message || 'Failed to create client'
      };
    }
  }

  /**
   * Update a client
   * @param {number} clientId - Client ID
   * @param {Object} clientData - Updated fields
   * @returns {Promise<Object>} Result
   */
  async updateClient(clientId, clientData) {
    try {
      const response = await apiUpdateClient(clientId, clientData);
      return {
        success: true,
        data: response.data.data,
        message: response.data.message,
        error: null
      };
    } catch (error) {
      console.error('Error updating client:', error);
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || error.message || 'Failed to update client'
      };
    }
  }

  /**
   * Delete a client
   * @param {number} clientId - Client ID
   * @returns {Promise<Object>} Result
   */
  async deleteClient(clientId) {
    try {
      console.log('[mauticService] deleteClient called with id:', clientId);
      const response = await apiDeleteClient(clientId);
      return {
        success: true,
        message: response.data.message,
        error: null
      };
    } catch (error) {
      console.error('Error deleting client:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to delete client'
      };
    }
  }

  /**
   * Permanently delete a client and all associated data
   * @param {number} clientId - Client ID
   * @returns {Promise<Object>} Result
   */
  async hardDeleteClient(clientId) {
    try {
      console.log('[mauticService] hardDeleteClient called with id:', clientId);
      const response = await apiHardDeleteClient(clientId);
      return {
        success: true,
        message: response.data.message,
        error: null
      };
    } catch (error) {
      console.error('Error permanently deleting client:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to permanently delete client'
      };
    }
  }

  /**
   * Test Mautic connection
   * @param {Object} credentials - { mauticUrl, username, password }
   * @returns {Promise<Object>} Test result
   */
  async testConnection(credentials) {
    try {
      const response = await apiTestConnection(credentials);
      return {
        success: response.data.success,
        message: response.data.message,
        error: null
      };
    } catch (error) {
      console.error('Error testing connection:', error);
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Connection test failed',
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Get dashboard metrics
   * @param {number|null} clientId - Client ID (optional)
   * @returns {Promise<Object>} Dashboard metrics
   */
  async getDashboardMetrics(clientId = null) {
    try {
      const response = await apiFetchDashboardMetrics(clientId);
      return {
        success: true,
        data: response.data.data,
        error: null
      };
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error);
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || error.message || 'Failed to fetch dashboard metrics'
      };
    }
  }

  /**
   * Get contacts with pagination
   * @param {Object} params - { clientId, page, limit, search }
   * @returns {Promise<Object>} Contacts data
   */
  async getContacts(params = {}) {
    try {
      const response = await apiFetchContacts(params);
      return {
        success: true,
        data: response.data.data,
        error: null
      };
    } catch (error) {
      console.error('Error fetching contacts:', error);
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || error.message || 'Failed to fetch contacts'
      };
    }
  }

  /**
   * Get emails with pagination
   * @param {Object} params - { clientId, page, limit }
   * @returns {Promise<Object>} Emails data
   */
  async getEmails(params = {}) {
    try {
      const response = await apiFetchEmails(params);
      return {
        success: true,
        data: response.data.data,
        error: null
      };
    } catch (error) {
      console.error('Error fetching emails:', error);
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || error.message || 'Failed to fetch emails'
      };
    }
  }

  /**
   * Get segments
   * @param {number|null} clientId - Client ID (optional)
   * @returns {Promise<Object>} Segments data
   */
  async getSegments(clientId = null) {
    try {
      const response = await apiFetchSegments(clientId);
      return {
        success: true,
        data: response.data.data,
        error: null
      };
    } catch (error) {
      console.error('Error fetching segments:', error);
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || error.message || 'Failed to fetch segments'
      };
    }
  }

  /**
   * Get campaigns with pagination
   * @param {Object} params - { clientId, page, limit }
   * @returns {Promise<Object>} Campaigns data
   */
  async getCampaigns(params = {}) {
    try {
      const response = await apiFetchCampaigns(params);
      return {
        success: true,
        data: response.data.data.campaigns,
        pagination: response.data.data.pagination,
        error: null
      };
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      return {
        success: false,
        data: null,
        pagination: null,
        error: error.response?.data?.message || error.message || 'Failed to fetch campaigns'
      };
    }
  }

  /**
   * Sync all clients
   * @returns {Promise<Object>} Sync result
   */
  async syncAllClients() {
    try {
      const response = await apiSyncAllClients();
      return {
        success: response.data.success,
        data: response.data.results,
        message: response.data.message,
        error: null
      };
    } catch (error) {
      console.error('Error syncing all clients:', error);
      
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
        error: error.response?.data?.message || error.message || 'Failed to sync clients'
      };
    }
  }

  /**
   * Sync specific client
   * @param {number} clientId - Client ID
   * @returns {Promise<Object>} Sync result
   */
  async syncClient(clientId) {
    try {
      const response = await apiSyncClient(clientId);
      return {
        success: response.data.success,
        data: response.data.data,
        message: response.data.message,
        error: null
      };
    } catch (error) {
      console.error('Error syncing client:', error);
      
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
        error: error.response?.data?.message || error.message || 'Failed to sync client'
      };
    }
  }

  /**
   * Get current sync status
   * @returns {Promise<Object>} Sync status
   */
  async getSyncStatus() {
    try {
      const response = await mauticAPI.get('/sync/status');
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

export default new MauticService();
