import axios from 'axios';

const API_BASE_URL = 'https://hcdteam.com:3001/api';

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const fetchMetrics = async (filters = {}) => {
    try {
        const params = new URLSearchParams();
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        if (filters.campaignName) params.append('campaignName', filters.campaignName);

        const response = await api.get(`/metrics?${params.toString()}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching metrics:', error);
        throw error;
    }
};

export const triggerManualFetch = async () => {
    try {
        const response = await api.post('/fetch');
        return response.data;
    } catch (error) {
        console.error('Error triggering manual fetch:', error);
        throw error;
    }
};

export const fetchSyncLogs = async (limit = 20) => {
    try {
        const response = await api.get(`/sync-logs?limit=${limit}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching sync logs:', error);
        throw error;
    }
};

export const fetchCampaignDetails = async (campaignName) => {
    try {
        const response = await api.get(`/campaigns/${campaignName}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching campaign details:', error);
        throw error;
    }
};

export const fetchRecordings = async (forceRefresh = false) => {
    try {
        const params = forceRefresh ? '?refresh=true' : '';
        const response = await api.get(`/recordings${params}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching recordings:', error);
        throw error;
    }
};

export const fetchBrands = async (forceRefresh = false) => {
    try {
        const params = forceRefresh ? '?refresh=true' : '';
        const response = await api.get(`/brands${params}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching brands:', error);
        throw error;
    }
};

export const fetchPools = async (forceRefresh = false) => {
    try {
        const params = forceRefresh ? '?refresh=true' : '';
        const response = await api.get(`/pools${params}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching pools:', error);
        throw error;
    }
};

export const fetchAllDropCowboyData = async (forceRefresh = false) => {
    try {
        const params = forceRefresh ? '?refresh=true' : '';
        const response = await api.get(`/dropcowboy/all${params}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching Ringless Voicemail data:', error);
        throw error;
    }
};

export default api;