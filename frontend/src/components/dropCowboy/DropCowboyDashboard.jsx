import React, { useState, useEffect } from 'react';
import { Activity, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import RecordsTable from './RecordsTable';
import ErrorBoundary from './ErrorBoundary';
import { useSyncLogs, useManualFetch } from '../../hooks/dropCowboy/useDropCowboy';
import { useTimezone } from '../../contexts/TimezoneContext';

export default function DropCowboyDashboard({ clientCampaigns = null, clientName = null, accessibleClientIds = [] }) {
    const { formatShortDateTime } = useTimezone();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [recordsClientFilter, setRecordsClientFilter] = useState('all');
    const [dateFilters, setDateFilters] = useState({ startDate: '', endDate: '' });

    const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(t);
    }, [searchTerm]);

    const recordsFilters = React.useMemo(
        () => ({
            searchTerm: debouncedSearch,
            statusFilter,
            clientFilter: recordsClientFilter,
            dateFilters,
            accessibleClientIds,
        }),
        [debouncedSearch, statusFilter, recordsClientFilter, dateFilters, accessibleClientIds]
    );

    const { syncLogs, refetch: refetchSyncLogs } = useSyncLogs(10);
    const { triggerFetch, isFetching, error: fetchError } = useManualFetch();

    /** 🕒 Auto-refresh logs every 50 minutes */
    useEffect(() => {
        const interval = setInterval(() => {
            refetchSyncLogs();
        }, 50 * 60 * 1000);
        return () => clearInterval(interval);
    }, [refetchSyncLogs]);

    /** 🔄 Manual SFTP Fetch */
    const handleFetchNow = async () => {
        toast.info('Starting SFTP sync... This may take 30-60 seconds.', { autoClose: 3000 });
        const result = await triggerFetch();

        if (result.success) {
            await refetchSyncLogs();
            // Note: RecordsTable will auto-refresh its own data
            if (result.data?.warning) toast.warning(result.data.warning);
            else if (result.data?.filesDownloaded > 0)
                toast.success(`Fetched ${result.data.filesDownloaded} files!`);
            else toast.info('Sync completed - no new files.');
        } else {
            toast.error('Failed to fetch: ' + (result.error || 'Unknown error'));
        }
    };

    return (
        <ErrorBoundary>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                {/* Header */}
                <div className="mb-6 flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-gray-900">Ringless Voicemail Dashboard</h1>
                </div>

                {fetchError && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
                        <AlertCircle className="text-red-600 mr-3 flex-shrink-0 mt-0.5" size={18} />
                        <p className="text-sm text-red-800 leading-relaxed">{fetchError}</p>
                    </div>
                )}

                {/* Toolbar */}
                <div className="mb-6 flex items-center justify-between gap-4 bg-white p-3 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                        {syncLogs.length > 0 && (
                            <span>
                                Last sync: {formatShortDateTime(syncLogs[0].timestamp)}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={handleFetchNow}
                        disabled={isFetching}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm"
                    >
                        <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                        {isFetching ? 'Fetching...' : 'Fetch from SFTP'}
                    </button>
                </div>

                {/* Main content - RecordsTable handles its own loading/data fetching */}
                <div className="space-y-6">
                    <RecordsTable
                        campaigns={[]}
                        filters={recordsFilters}
                        accessibleClientIds={accessibleClientIds}
                    />
                </div>
            </div>
        </ErrorBoundary>
    );
}