
/**
 * Mautic Custom Hooks
 * 
 * React hooks for Mautic data fetching and state management
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import mauticService from '../../services/mautic/mauticService';

/**
 * Hook for fetching dashboard metrics
 * @param {number|null} clientId - Client ID (optional)
 * @returns {Object} { metrics, loading, error, refetch }
 */
export function useDashboardMetrics(clientId = null) {
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchMetrics = useCallback(async () => {
        setLoading(true);
        setError(null);

        const result = await mauticService.getDashboardMetrics(clientId);

        if (result.success) {
            setMetrics(result.data);
        } else {
            setError(result.error);
        }

        setLoading(false);
    }, [clientId]);

    useEffect(() => {
        fetchMetrics();
    }, [fetchMetrics]);

    return { metrics, loading, error, refetch: fetchMetrics };
}

/**
 * Hook for fetching clients
 * @returns {Object} { clients, loading, error, refetch }
 */
export function useClients() {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchClients = useCallback(async () => {
        setLoading(true);
        setError(null);

        const result = await mauticService.getClients();

        if (result.success) {
            setClients(result.data);
        } else {
            setError(result.error);
        }

        setLoading(false);
    }, []);

    useEffect(() => {
        fetchClients();
    }, [fetchClients]);

    return { clients, loading, error, refetch: fetchClients };
}

/**
 * Hook for managing client operations
 * @returns {Object} Client management functions
 */
export function useClientManagement() {
    const [isCreating, setIsCreating] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [error, setError] = useState(null);

    const createClient = useCallback(async (clientData) => {
        setIsCreating(true);
        setError(null);

        const result = await mauticService.createClient(clientData);

        setIsCreating(false);
        return result;
    }, []);

    const updateClient = useCallback(async (clientId, clientData) => {
        setIsUpdating(true);
        setError(null);

        const result = await mauticService.updateClient(clientId, clientData);

        setIsUpdating(false);
        return result;
    }, []);

    const deleteClient = useCallback(async (clientId) => {
        setIsDeleting(true);
        setError(null);

        const result = await mauticService.deleteClient(clientId);

        setIsDeleting(false);
        return result;
    }, []);

    const testConnection = useCallback(async (credentials) => {
        setIsTesting(true);
        setError(null);

        const result = await mauticService.testConnection(credentials);

        setIsTesting(false);
        return result;
    }, []);

    return {
        createClient,
        updateClient,
        deleteClient,
        testConnection,
        isCreating,
        isUpdating,
        isDeleting,
        isTesting,
        error
    };
}

/**
 * Hook for fetching contacts with pagination
 * @param {Object} params - { clientId, page, limit, search }
 * @returns {Object} { contacts, pagination, loading, error, refetch }
 */
export function useContacts(params = {}) {
    const [contacts, setContacts] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchContacts = useCallback(async () => {
        setLoading(true);
        setError(null);

        const result = await mauticService.getContacts(params);

        if (result.success) {
            setContacts(result.data.contacts);
            setPagination(result.data.pagination);
        } else {
            setError(result.error);
        }

        setLoading(false);
    }, [JSON.stringify(params)]);

    useEffect(() => {
        fetchContacts();
    }, [fetchContacts]);

    return { contacts, pagination, loading, error, refetch: fetchContacts };
}

/**
 * Hook for fetching emails with pagination
 * @param {Object} params - { clientId, page, limit }
 * @returns {Object} { emails, pagination, loading, error, refetch }
 */
export function useEmails(params = {}) {
    const [emails, setEmails] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchEmails = useCallback(async () => {
        setLoading(true);
        setError(null);

        const result = await mauticService.getEmails(params);

        if (result.success) {
            setEmails(result.data.emails);
            setPagination(result.data.pagination);
        } else {
            setError(result.error);
        }

        setLoading(false);
    }, [JSON.stringify(params)]);

    useEffect(() => {
        fetchEmails();
    }, [fetchEmails]);

    return { emails, pagination, loading, error, refetch: fetchEmails };
}

/**
 * Hook for fetching segments with pagination
 * @param {Object} params - { clientId, page, limit }
 * @returns {Object} { segments, pagination, loading, error, refetch }
 */
export function useSegments(params = {}) {
    const [segments, setSegments] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchSegments = useCallback(async () => {
        setLoading(true);
        setError(null);

        const result = await mauticService.getSegments(params.clientId);

        if (result.success) {
            setSegments(result.data);
            // Backend doesn't paginate segments yet, so create mock pagination
            const total = result.data.length;
            const page = params.page || 1;
            const limit = params.limit || 20;
            const start = (page - 1) * limit;
            const end = start + limit;

            setSegments(result.data.slice(start, end));
            setPagination({
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            });
        } else {
            setError(result.error);
        }

        setLoading(false);
    }, [JSON.stringify(params)]);

    useEffect(() => {
        fetchSegments();
    }, [fetchSegments]);

    return { segments, pagination, loading, error, refetch: fetchSegments };
}

/**
 * Hook for fetching campaigns with pagination
 * @param {Object} params - { clientId, page, limit }
 * @returns {Object} { campaigns, pagination, loading, error, refetch }
 */
export function useCampaigns(params = {}) {
    const [campaigns, setCampaigns] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchCampaigns = useCallback(async () => {
        setLoading(true);
        setError(null);

        const result = await mauticService.getCampaigns({
            clientId: params.clientId,
            page: params.page || 1,
            limit: params.limit || 20
        });

        if (result.success) {
            setCampaigns(result.data);
            setPagination(result.pagination);
        } else {
            setError(result.error);
        }

        setLoading(false);
    }, [JSON.stringify(params)]);

    useEffect(() => {
        fetchCampaigns();
    }, [fetchCampaigns]);

    return { campaigns, pagination, loading, error, refetch: fetchCampaigns };
}

/**
 * Hook for syncing data
 * @returns {Object} Sync functions and state
 */
export function useSync() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const syncRef = useRef(false); // Track if sync is running

    // Check sync status on mount and periodically
    useEffect(() => {
        const checkSyncStatus = async () => {
            try {
                const result = await mauticService.getSyncStatus();
                if (result.success && result.data.isSyncing) {
                    setIsSyncing(true);
                    syncRef.current = true;
                } else if (syncRef.current && !result.data.isSyncing) {
                    // Sync completed since last check
                    setIsSyncing(false);
                    syncRef.current = false;
                }
            } catch (err) {
                console.error('Failed to check sync status:', err);
            }
        };

        // Check immediately on mount
        checkSyncStatus();

        // Check every 3 seconds while syncing
        const interval = setInterval(() => {
            if (isSyncing || syncRef.current) {
                checkSyncStatus();
            }
        }, 3000);

        // Cleanup on unmount
        return () => {
            clearInterval(interval);
            syncRef.current = false;
        };
    }, [isSyncing]);

    const syncAllClients = useCallback(async () => {
        try {
            setIsSyncing(true);
            syncRef.current = true;
            setError(null);
            setSuccess(false);

            const result = await mauticService.syncAllClients();

            if (result.success) {
                setSuccess(true);
            } else {
                setError(result.error || 'Sync failed');
            }

            return result;
        } catch (err) {
            const errorMsg = err.message || 'Failed to sync';
            setError(errorMsg);
            return { success: false, error: errorMsg };
        } finally {
            if (syncRef.current) { // Only update state if component is still mounted
                // Small delay to ensure smooth UI transition
                setTimeout(() => {
                    setIsSyncing(false);
                    syncRef.current = false;
                }, 500);
            }
        }
    }, []);

    const syncClient = useCallback(async (clientId) => {
        try {
            setIsSyncing(true);
            syncRef.current = true;
            setError(null);
            setSuccess(false);

            const result = await mauticService.syncClient(clientId);

            if (result.success) {
                setSuccess(true);
            } else {
                setError(result.error || 'Sync failed');
            }

            return result;
        } catch (err) {
            const errorMsg = err.message || 'Failed to sync';
            setError(errorMsg);
            return { success: false, error: errorMsg };
        } finally {
            if (syncRef.current) { // Only update state if component is still mounted
                // Small delay to ensure smooth UI transition
                setTimeout(() => {
                    setIsSyncing(false);
                    syncRef.current = false;
                }, 500);
            }
        }
    }, []);

    return {
        syncAllClients,
        syncClient,
        isSyncing,
        error,
        success
    };
}
