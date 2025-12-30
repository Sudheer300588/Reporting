import axios from "axios";

// Updated to use unified backend on port 3000
const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dev.hcddev.com";

const api = axios.create({
  baseURL: `${API_BASE_URL}/api/dropcowboy`,
  headers: {
    "Content-Type": "application/json",
  },
});

export const fetchMetrics = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.startDate) params.append("startDate", filters.startDate);
    if (filters.endDate) params.append("endDate", filters.endDate);
    if (filters.campaignName)
      params.append("campaignName", filters.campaignName);
    if (filters.campaignIds && Array.isArray(filters.campaignIds)) {
      // Send campaign IDs as comma-separated string
      params.append("campaignIds", filters.campaignIds.join(","));
    }

    const response = await api.get(`/metrics?${params.toString()}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching metrics:", error);
    throw error;
  }
};

export const triggerManualFetch = async () => {
  try {
    const response = await api.post("/fetch");
    return response.data;
  } catch (error) {
    console.error("Error triggering manual fetch:", error);
    throw error;
  }
};

export const fetchSyncLogs = async (limit = 20) => {
  try {
    const response = await api.get(`/sync-logs?limit=${limit}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching sync logs:", error);
    throw error;
  }
};

export const fetchCampaignDetails = async (campaignName) => {
  try {
    const response = await api.get(`/campaigns/${campaignName}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching campaign details:", error);
    throw error;
  }
};

export const fetchRecordings = async (forceRefresh = false) => {
  try {
    const params = forceRefresh ? "?refresh=true" : "";
    const response = await api.get(`/recordings${params}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching recordings:", error);
    throw error;
  }
};

export const fetchBrands = async (forceRefresh = false) => {
  try {
    const params = forceRefresh ? "?refresh=true" : "";
    const response = await api.get(`/brands${params}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching brands:", error);
    throw error;
  }
};

export const fetchPools = async (forceRefresh = false) => {
  try {
    const params = forceRefresh ? "?refresh=true" : "";
    const response = await api.get(`/pools${params}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching pools:", error);
    throw error;
  }
};

export const fetchAllDropCowboyData = async (forceRefresh = false) => {
  try {
    const params = forceRefresh ? "?refresh=true" : "";
    const response = await api.get(`/dropcowboy/all${params}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching Ringless Voicemail data:", error);
    throw error;
  }
};

export default api;
