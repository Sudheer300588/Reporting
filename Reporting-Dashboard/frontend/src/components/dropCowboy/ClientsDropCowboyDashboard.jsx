/**
 * Drop Cowboy Dashboard Container Component
 * 
 * Clean, modular implementation of Drop Cowboy dashboard
 * Uses custom hooks and service layer for separation of concerns
 */

import React, { useState, useEffect } from 'react';
import { Activity, AlertCircle, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'react-toastify';
import ErrorBoundary from './ErrorBoundary';
import { useMetrics, useSyncLogs, useManualFetch } from '../../hooks/dropCowboy/useDropCowboy';
import { extractUniqueClients } from '../../utils/dropCowboy/helpers';
import ClientsTable from './ClientsTable';
import useViewLevel from '../../zustand/useViewLevel';

/**
 * Main Drop Cowboy Dashboard Component
 * Embeddable in the main app's Services page
 * 
 * @param {Array} clientCampaigns - Optional: Filter to specific campaign IDs for a client
 * @param {String} clientName - Optional: Display client name in header
 */
export default function ClientsDropCowboyDashboard({ clientCampaigns = null, clientName = null }) {
    const [clientFilter, setClientFilter] = useState(clientName || 'All');
    const [clientOptions, setClientOptions] = useState(['All']);

    // Use custom hooks for data fetching - pass campaign filter if provided
    const initialFilters = clientCampaigns ? { campaignIds: clientCampaigns } : {};
    const { metrics, loading, error, refetch: refetchMetrics, setFilters, filters } = useMetrics(initialFilters);
    const { syncLogs, refetch: refetchSyncLogs } = useSyncLogs(10);
    const { triggerFetch, isFetching, error: fetchError } = useManualFetch();

    const { dropcowboy, setDCCampaigns, setDCSelectedClient, setDCMetrics } = useViewLevel();
    const { savedMetrics } = dropcowboy;

    // Extract unique clients when metrics change
    useEffect(() => {
        if (metrics?.campaigns) {
            const clients = extractUniqueClients(metrics.campaigns);
            setClientOptions(['All', ...clients]);

            // if coming in from a client page, auto-select that client
            if (clientName && clients.includes(clientName)) {
                setClientFilter(clientName);
            }
        }
        
        // Filter campaigns by clientName if provided
        const filteredCampaigns = clientName && metrics?.campaigns
            ? metrics.campaigns.filter(c => c.client === clientName)
            : metrics?.campaigns;
        
        setDCCampaigns(filteredCampaigns);
        setDCMetrics(metrics);
        setDCSelectedClient(clientName);
    }, [metrics, clientName]);

    // Auto-refresh data every 50 minutes
    useEffect(() => {
        const interval = setInterval(() => {
            refetchMetrics();
            refetchSyncLogs();
        }, 50 * 60 * 1000);
        return () => clearInterval(interval);
    }, [refetchMetrics, refetchSyncLogs]);

    // Handle manual SFTP fetch
    const handleFetchNow = async () => {
        toast.info('Starting SFTP sync... This may take 30-60 seconds.', { autoClose: 3000 });

        const result = await triggerFetch();

        if (result.success) {
            // Reload data after successful fetch
            await refetchMetrics();
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
                {(error || fetchError) && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
                        <AlertCircle className="text-red-600 mr-3 flex-shrink-0 mt-0.5" size={18} />
                        <p className="text-sm text-red-800 leading-relaxed">
                            {error || fetchError}
                        </p>
                    </div>
                )}

                {/* Minimal Action Bar */}
                <div className="mb-6 flex items-center justify-between gap-4 bg-white p-3 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex items-center gap-4">
                        {/* Last Sync Info - Compact */}
                        {syncLogs.length > 0 && syncLogs[0] && (
                            <div className="text-xs text-gray-500">
                                Last sync: {format(parseISO(syncLogs[0].timestamp), 'MMM dd, h:mm a')}
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
                {(savedMetrics?.length === 0) ? (
                    <div className="flex items-center justify-center h-96">
                        <div className="text-center">
                            <Activity className="animate-spin mx-auto mb-4 text-blue-600" size={40} />
                            <p className="text-gray-600 text-sm font-medium">Loading dashboard...</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* All Records Table */}
                        <ClientsTable />
                    </div>
                )}
            </div>
        </ErrorBoundary>
    );
}