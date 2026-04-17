/**
 * Drop Cowboy Dashboard Container Component
 * 
 * Clean, modular implementation of Drop Cowboy dashboard
 * Uses custom hooks and service layer for separation of concerns
 */

import React, { useState, useEffect } from 'react';
import { Activity, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import ErrorBoundary from './ErrorBoundary';
import { useMetrics, useSyncLogs, useManualFetch } from '../../hooks/dropCowboy/useDropCowboy';
import { useTimezone } from '../../contexts/TimezoneContext';
import ClientsTable from './ClientsTable';
import useViewLevel from '../../zustand/useViewLevel';

/**
 * Main Drop Cowboy Dashboard Component
 * Embeddable in the main app's Services page
 * 
 * @param {Array} clientCampaigns - Optional: Filter to specific campaign IDs for a client
 * @param {String} clientName - Optional: Display client name in header (lazy-loads only this client's campaigns)
 */
export default function ClientsDropCowboyDashboard({ clientCampaigns = null, clientName = null }) {
    const { formatShortDateTime } = useTimezone();
    const [refreshTick, setRefreshTick] = useState(0);

    // Use custom hooks for data fetching (only if no specific client is provided)
    const shouldUseBulkFetch = !clientName;
    const initialFilters = clientCampaigns ? { campaignIds: clientCampaigns } : {};
    const {
        loading: bulkLoading,
        error: bulkError,
        refetch: refetchBulkMetrics,
    } = useMetrics(initialFilters, { enabled: shouldUseBulkFetch });
    const { syncLogs, refetch: refetchSyncLogs } = useSyncLogs(10);
    const { triggerFetch, isFetching, error: fetchError } = useManualFetch();

    const { setDCSelectedClient, setDCViewLevel } = useViewLevel();

    // Set selected client and view context
    useEffect(() => {
        if (clientName) {
            setDCViewLevel('client');
        }
        setDCSelectedClient(clientName);
    }, [clientName, setDCSelectedClient, setDCViewLevel]);

    // Auto-refresh data every 50 minutes
    useEffect(() => {
        const interval = setInterval(() => {
            if (refetchBulkMetrics && shouldUseBulkFetch) {
                refetchBulkMetrics();
            }
            if (clientName) {
                setRefreshTick((prev) => prev + 1);
            }
            refetchSyncLogs();
        }, 50 * 60 * 1000);
        return () => clearInterval(interval);
    }, [clientName, refetchSyncLogs, refetchBulkMetrics, shouldUseBulkFetch]);

    // Handle manual SFTP fetch
    const handleFetchNow = async () => {
        toast.info('Starting SFTP sync... This may take 30-60 seconds.', { autoClose: 3000 });

        const result = await triggerFetch();

        if (result.success) {
            // Reload data after successful fetch
            if (clientName) {
                setRefreshTick((prev) => prev + 1);
            } else if (refetchBulkMetrics) {
                await refetchBulkMetrics();
            }
            await refetchSyncLogs();
            await refetchSyncLogs();

            if (result.data?.warning) {
                toast.warning(result.data.warning, { autoClose: 5000 });
            } else if (result.data?.filesDownloaded > 0) {
                toast.success(`Successfully fetched ${result.data.filesDownloaded} files from SFTP!`, { autoClose: 5000 });
            } else {
                toast.info('Sync completed - using existing data.', { autoClose: 3000 });
            }
        } else {
            toast.error('Failed to fetch data: ' + (result.error || 'Unknown error'), { autoClose: 5000 });
        }
    };

    return (
        <ErrorBoundary>
            <div className="py-6 sm:py-8">
                {/* Error Messages */}
                {(bulkError || fetchError) && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
                        <AlertCircle className="text-red-600 mr-3 flex-shrink-0 mt-0.5" size={18} />
                        <p className="text-sm text-red-800 leading-relaxed">
                            {bulkError || fetchError}
                        </p>
                    </div>
                )}

                {/* Minimal Action Bar */}
                <div className="mb-6 flex items-center justify-between gap-4 bg-white p-3 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex items-center gap-4">
                        {/* Last Sync Info - Compact */}
                        {syncLogs.length > 0 && syncLogs[0] && (
                            <div className="text-xs text-gray-500">
                                Last sync: {formatShortDateTime(syncLogs[0].timestamp)}
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleFetchNow}
                            disabled={isFetching}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                            <RefreshCw className={`w-2 h-2 ${isFetching ? 'animate-spin' : ''}`} />
                            {isFetching ? 'Fetching...' : 'Fetch from SFTP'}
                        </button>
                    </div>
                </div>

                {/* Loading State */}
                {(shouldUseBulkFetch && bulkLoading) ? (
                    <div className="flex items-center justify-center h-96">
                        <div className="text-center">
                            <Activity className="animate-spin mx-auto mb-4 text-blue-600" size={40} />
                            <p className="text-gray-600 text-sm font-medium">Loading dashboard...</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* All Records Table */}
                        <ClientsTable refreshTick={refreshTick} />
                    </div>
                )}
            </div>
        </ErrorBoundary>
    );
}