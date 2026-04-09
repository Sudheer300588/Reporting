/**
 * Client Service
 * 
 * Centralized service for all client-related API calls.
 * Uses optimized endpoints with lazy loading and caching.
 */
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '';

// Simple in-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get from cache if not expired
 */
function getFromCache(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

/**
 * Set in cache
 */
function setInCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Clear cache (useful after mutations)
 */
export function clearClientCache() {
  cache.clear();
}

/**
 * Get all unified clients (lightweight - no campaign data)
 * Merges Mautic, DropCowboy, and SMS clients in backend
 */
export async function getUnifiedClients() {
  const cacheKey = 'unified-clients';
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`${BASE_URL}/api/clients/unified`);
    const data = response.data?.data || [];
    setInCache(cacheKey, data);
    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Get Mautic campaigns for a specific client (lazy-loaded)
 */
export async function getMauticCampaigns(clientId) {
  const cacheKey = `mautic-campaigns-${clientId}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`${BASE_URL}/api/clients/${clientId}/mautic/campaigns`);
    const data = response.data?.data || [];
    setInCache(cacheKey, data);
    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Get Mautic emails for a specific client (lazy-loaded)
 */
export async function getMauticEmails(clientId) {
  const cacheKey = `mautic-emails-${clientId}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`${BASE_URL}/api/clients/${clientId}/mautic/emails`);
    const data = response.data?.data || [];
    setInCache(cacheKey, data);
    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Get Mautic segments for a specific client (lazy-loaded)
 */
export async function getMauticSegments(clientId) {
  const cacheKey = `mautic-segments-${clientId}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`${BASE_URL}/api/clients/${clientId}/mautic/segments`);
    const data = response.data?.data || [];
    setInCache(cacheKey, data);
    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Get DropCowboy campaigns for a specific client (lazy-loaded)
 */
export async function getDropcowboyCampaigns(clientName) {
  const cacheKey = `dropcowboy-campaigns-${clientName}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  try {
    const encodedName = encodeURIComponent(clientName);
    const response = await axios.get(`${BASE_URL}/api/clients/${encodedName}/dropcowboy/campaigns`);
    const data = response.data?.data || [];
    setInCache(cacheKey, data);
    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Get SMS campaigns for a specific client (lazy-loaded)
 */
export async function getSmsCampaigns(clientId) {
  const cacheKey = `sms-campaigns-${clientId}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`${BASE_URL}/api/clients/${clientId}/sms/campaigns`);
    const data = response.data?.data || [];
    setInCache(cacheKey, data);
    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Get all data for a specific client (parallel fetch)
 * Only loads what's available based on client.services array
 */
export async function getClientData(client) {
  const promises = [];
  const result = {
    campaigns: [],
    emails: [],
    segments: [],
    dropcowboyCampaigns: [],
    smsCampaigns: []
  };

  if (!client || !client.services) {
    return result;
  }

  // Only fetch data for services this client has
  if (client.services.includes('mautic')) {
    promises.push(
      Promise.all([
        getMauticCampaigns(client.id),
        getMauticEmails(client.id),
        getMauticSegments(client.id)
      ]).then(([campaigns, emails, segments]) => {
        result.campaigns = campaigns;
        result.emails = emails;
        result.segments = segments;
      }).catch(error => {
      })
    );
  }

  if (client.services.includes('dropcowboy')) {
    promises.push(
      getDropcowboyCampaigns(client.name).then(campaigns => {
        result.dropcowboyCampaigns = campaigns;
      }).catch(error => {
      })
    );
  }

  if (client.services.includes('sms')) {
    promises.push(
      getSmsCampaigns(client.id).then(campaigns => {
        result.smsCampaigns = campaigns;
      }).catch(error => {
      })
    );
  }

  await Promise.all(promises);
  return result;
}

/**
 * Assign client to users
 */
export async function assignClient(clientId, assignData) {
  try {
    const response = await axios.post(`${BASE_URL}/api/clients/${clientId}/assign`, assignData);
    clearClientCache(); // Clear cache after mutation
    return response.data;
  } catch (error) {
    throw error;
  }
}

/**
 * Unassign client from user
 */
export async function unassignClient(clientId, userId, assignmentClientId = null) {
  try {
    const url = assignmentClientId 
      ? `${BASE_URL}/api/clients/${assignmentClientId}/unassign/${userId}`
      : `${BASE_URL}/api/clients/${clientId}/unassign/${userId}`;
    const response = await axios.delete(url);
    clearClientCache(); // Clear cache after mutation
    return response.data;
  } catch (error) {
    throw error;
  }
}

/**
 * Get managers list for assignment
 */
export async function getManagers() {
  try {
    const response = await axios.get(`${BASE_URL}/api/clients/assignment/managers`);
    return response.data.managers || response.data || [];
  } catch (error) {
    throw error;
  }
}

/**
 * Get employees for a specific manager
 */
export async function getEmployeesForManager(managerId) {
  try {
    const response = await axios.get(
      `${BASE_URL}/api/clients/assignment/managers/${managerId}/employees`
    );
    return response.data.employees || [];
  } catch (error) {
    throw error;
  }
}

export default {
  getUnifiedClients,
  getMauticCampaigns,
  getMauticEmails,
  getMauticSegments,
  getDropcowboyCampaigns,
  getSmsCampaigns,
  getClientData,
  assignClient,
  unassignClient,
  getManagers,
  getEmployeesForManager,
  clearClientCache
};
