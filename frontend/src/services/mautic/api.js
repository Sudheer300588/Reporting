/**
 * Mautic API Client
 *
 * Axios-based API client for Mautic module endpoints
 */

import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "";

const mauticAPI = axios.create({
  baseURL: `${baseURL}/api/mautic`,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 120000, // 2 minutes for large data operations
});

mauticAPI.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ============================================
// CLIENT MANAGEMENT
// ============================================

export const fetchClients = () => mauticAPI.get("/clients");

export const createClient = (clientData) =>
  mauticAPI.post("/clients", clientData);

export const updateClient = (clientId, clientData) =>
  mauticAPI.put(`/clients/${clientId}`, clientData);

// Soft-delete: toggle active state
export const deleteClient = (clientId) =>
  mauticAPI.patch(`/clients/${clientId}/toggle`);

// Hard-delete: permanently remove client and all associated data
export const hardDeleteClient = (clientId) =>
  mauticAPI.delete(`/clients/${clientId}/permanent`);

export const testConnection = (credentials) =>
  mauticAPI.post("/clients/test-connection", credentials);

// ============================================
// DASHBOARD & METRICS
// ============================================

export const fetchDashboardMetrics = (clientId = null) =>
  mauticAPI.get("/dashboard", { params: { clientId } });

export const fetchContacts = (params = {}) =>
  mauticAPI.get("/contacts", { params });

export const fetchEmails = (params = {}) =>
  mauticAPI.get("/emails", { params });

export const fetchSegments = (clientId) =>
  mauticAPI.get("/segments", { params: { clientId } });

export const fetchCampaigns = ({ clientId, page = 1, limit = 50 }) =>
  mauticAPI.get("/campaigns", { params: { clientId, page, limit } });

// ============================================
// SYNC OPERATIONS
// ============================================

export const syncAllClients = () => mauticAPI.post("/sync/all");

export const syncClient = (clientId) => mauticAPI.post(`/sync/${clientId}`);

export default mauticAPI;
