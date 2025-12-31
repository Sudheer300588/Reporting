/**
 * Ringless Voicemail Dashboard Container Component
 * 
 * Clean, modular implementation of Ringless Voicemail dashboard
 * Uses custom hooks and service layer for separation of concerns
 */


import React, { useState, useEffect } from 'react';
import { Activity, AlertCircle, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'react-toastify';
import MetricsCards from './MetricsCards';
import RecordsTable from './RecordsTable';
import ErrorBoundary from './ErrorBoundary';
import { useMetrics, useSyncLogs, useManualFetch } from '../../hooks/dropCowboy/useDropCowboy';
import { extractUniqueClients } from '../../utils/dropCowboy/helpers';

/**
 * Main Ringless Voicemail Dashboard Component
 * Embeddable in the main app's Services page
 * 
 * @param {Array} clientCampaigns - Optional: Filter to specific campaign IDs for a client
 * @param {String} clientName - Optional: Display client name in header
 */
export default function DropCowboyDashboard({ clientCampaigns = null, clientName = null }) {
    const [selectedClient, setSelectedClient] = useState('All');
    const [clientOptions, setClientOptions] = useState(['All']);
    // Records table filters (lifted from RecordsTable)
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [recordsClientFilter, setRecordsClientFilter] = useState('all');
    const [dateFilters, setDateFilters] = useState({ startDate: '', endDate: '' });

    // Debounced search to avoid rapid-fire fetches while typing
    const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(t);
    }, [searchTerm]);

    // Memoize filters object so child doesn't receive a new object each render
    const recordsFilters = React.useMemo(() => ({
        searchTerm: debouncedSearch,
        statusFilter,
        clientFilter: recordsClientFilter,
        dateFilters
    }), [debouncedSearch, statusFilter, recordsClientFilter, dateFilters]);

    // Records table meta (updated by RecordsTable via onMetaChange)
    const [recordsMeta, setRecordsMeta] = useState({
        totalRecords: 0,
        currentPage: 1,
        totalPages: 1,
        currentRecordsLength: 0,
        loadingPage: false,
        fetchMessage: ''
    });

    // Use custom hooks for data fetching - pass campaign filter if provided
    const initialFilters = clientCampaigns ? { campaignIds: clientCampaigns } : {};
    const { metrics, loading, error, refetch: refetchMetrics, setFilters: _setFilters, filters: _filters } = useMetrics(initialFilters);
    const { syncLogs, refetch: refetchSyncLogs } = useSyncLogs(10);
    const { triggerFetch, isFetching, error: fetchError } = useManualFetch();

    // Extract unique clients when metrics change
    useEffect(() => {
        if (metrics?.campaigns) {
            const clients = extractUniqueClients(metrics.campaigns);
            setClientOptions(clients);
        }
    }, [metrics]);

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

    // (no-op) date filter handling for metrics uses `setFilters` from useMetrics when needed

    // Filter campaigns by client (for metrics/cards and campaigns list)
    const filteredCampaigns = metrics?.campaigns?.filter(
        c => selectedClient === 'All' || c.client === selectedClient
    ) || [];

    return (
        <ErrorBoundary>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                {/* Page Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">Ringless Voicemail Dashboard</h1>
                </div>

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
                            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                            {isFetching ? 'Fetching...' : 'Fetch from SFTP'}
                        </button>
                    </div>
                </div>

                                

                                {/* Loading State */}
                {loading && !metrics ? (
                    <div className="flex items-center justify-center h-96">
                        <div className="text-center">
                            <Activity className="animate-spin mx-auto mb-4 text-blue-600" size={40} />
                            <p className="text-gray-600 text-sm font-medium">Loading dashboard...</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Metrics Cards */}

                                                {/* All Records Table */}
                                                                        <RecordsTable
                                                                            campaigns={filteredCampaigns}
                                                                            filters={recordsFilters}
                                                                            onMetaChange={(meta) => setRecordsMeta(meta)}
                                                                        />
                    </div>
                )}
            </div>
        </ErrorBoundary>
    );
}