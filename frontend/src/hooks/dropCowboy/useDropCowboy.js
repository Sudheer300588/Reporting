
/**
 * Custom hooks for Ringless Voicemail data fetching
 * 
 * These hooks encapsulate data fetching logic and state management,
 * making components cleaner and more reusable.
 */

import { useState, useEffect, useCallback } from 'react';
import dropCowboyService from '../../services/dropCowboy/dropCowboyService';

/**
 * Hook for fetching and managing metrics data
 * @param {Object} initialFilters - Initial filter values
 * @returns {Object} { metrics, loading, error, refetch, setFilters }
 */
export function useMetrics(initialFilters = {}) {
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState(initialFilters);

    const fetchData = useCallback(async (activeFilters = filters) => {
        try {
            setLoading(true);
            setError(null);
            const result = await dropCowboyService.getMetrics(activeFilters);

            if (result.success) {
                setMetrics(result.data);
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError(err.message || 'Failed to fetch metrics');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const refetch = useCallback(() => {
        fetchData(filters);
    }, [fetchData, filters]);

    return {
        metrics,
        loading,
        error,
        refetch,
        setFilters,
        filters
    };
}

/**
 * Hook for fetching and managing sync logs
 * @param {number} limit - Number of logs to fetch
 * @returns {Object} { syncLogs, loading, error, refetch }
 */
export function useSyncLogs(limit = 10) {
    const [syncLogs, setSyncLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const result = await dropCowboyService.getSyncLogs(limit);

            if (result.success) {
                setSyncLogs(result.data || []);
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError(err.message || 'Failed to fetch sync logs');
        } finally {
            setLoading(false);
        }
    }, [limit]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const refetch = useCallback(() => {
        fetchData();
    }, [fetchData]);

    return {
        syncLogs,
        loading,
        error,
        refetch
    };
}

/**
 * Hook for triggering manual SFTP fetch
 * @returns {Object} { triggerFetch, isFetching, error, success }
 */
export function useManualFetch() {
    const [isFetching, setIsFetching] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    // Check sync status on mount and periodically
    useEffect(() => {
        const checkSyncStatus = async () => {
            try {
                const result = await dropCowboyService.getSyncStatus();
                if (result.success && result.data.isSyncing) {
                    setIsFetching(true);
                }
            } catch (err) {
                console.error('Failed to check sync status:', err);
            }
        };

        // Check immediately on mount
        checkSyncStatus();

        // Check every 3 seconds while fetching
        const interval = setInterval(() => {
            if (isFetching) {
                checkSyncStatus();
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [isFetching]);

    const triggerFetch = useCallback(async () => {
        try {
            setIsFetching(true);
            setError(null);
            setSuccess(false);

            const result = await dropCowboyService.triggerFetch();

            // Check if sync is already in progress (409 status)
            if (!result.success && result.isSyncing) {
                setError(result.message || 'Sync already in progress');
                return { success: false, error: result.message };
            }

            if (!result.success) {
                setError(result.error);
                setSuccess(false);
                return { success: false, error: result.error };
            }

            setSuccess(true);
            return { success: true, data: result.data };
        } catch (err) {
            const errorMsg = err.message || 'Failed to trigger fetch';
            setError(errorMsg);
            setSuccess(false);
            return { success: false, error: errorMsg };
        } finally {
            // Always reset fetching state after operation completes
            setTimeout(() => setIsFetching(false), 500); // Small delay to ensure UI updates smoothly
        }
    }, []);

    return {
        triggerFetch,
        isFetching,
        error,
        success
    };
}
