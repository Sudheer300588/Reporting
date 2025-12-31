
import { toast } from 'react-toastify';
import { useMetrics, useSyncLogs, useManualFetch } from '../../hooks/dropCowboy/useDropCowboy';

import React, { useState, useEffect, useMemo } from "react";
import { AlertCircle, RefreshCw, Activity } from 'lucide-react';
import useViewLevel from "../../zustand/useViewLevel";
import ErrorBoundary from './ErrorBoundary.jsx';
import MetricsCards from './MetricsCards.jsx';
import { format, parseISO } from 'date-fns';


const DropCowboyServiceStats = ({ selectedClient }) => {
    // Use custom hooks for data fetching
    const { metrics, loading, error, refetch: refetchMetrics } = useMetrics({});
    const { syncLogs, refetch: refetchSyncLogs } = useSyncLogs(10);
    const { triggerFetch, isFetching, error: fetchError } = useManualFetch();

    const { dropcowboy, setDCCampaigns, setDCMetrics } = useViewLevel();
    const { campaigns, savedMetrics } = dropcowboy;
    const [allRecords, setAllRecords] = useState([]);

    useEffect(() => {
        setDCCampaigns(metrics?.campaigns);
        setDCMetrics(metrics);
    }, [metrics]);

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

    // If campaigns prop is passed, use it as a fallback initial load
    useEffect(() => {
        if (campaigns && campaigns.length > 0) {
            const records = campaigns.flatMap((campaign) => {
                const clientName = campaign.client || "Unknown";
                const segment = campaign.campaignName || "";

                return campaign.records.map((record) => ({
                    ...record,
                    client: clientName,
                    segment: segment.trim(),
                    status: record.status?.trim()?.toLowerCase() || "other",
                }));
            });

            setAllRecords(records);
            
        }
    }, [campaigns]);

    // 🔹 Filters applied to metrics (no status filter)
    const filteredRecordsForMetrics = useMemo(() => {
        let records = allRecords.filter((r) => r.client === selectedClient.name);

        return records;
    }, [allRecords, selectedClient]);

    const metricsStats = useMemo(() => {
        const totalSent = filteredRecordsForMetrics.length;
        const successfulDeliveries = filteredRecordsForMetrics.filter(
            (r) => r.status === "success"
        ).length;
        const failedSends = filteredRecordsForMetrics.filter(
            (r) => r.status === "failure"
        ).length;
        const otherStatus = filteredRecordsForMetrics.filter(
            (r) => !["success", "failure"].includes(r.status)
        ).length;

        return {
            overall: {
                totalSent,
                successfulDeliveries,
                failedSends,
                otherStatus,
                averageSuccessRate:
                    totalSent > 0 ? (successfulDeliveries / totalSent) * 100 : 0,
            },
        };
    }, [filteredRecordsForMetrics]);

    if (!metricsStats || !metricsStats.overall) {
        return (
            <div className="flex gap-4 overflow-x-auto py-1">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="bg-white rounded-xl border border-gray-200/60 p-5 animate-pulse min-w-[220px] flex-shrink-0">
                        <div className="h-3 bg-gray-200 rounded w-1/2 mb-3"></div>
                        <div className="h-7 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div className="h-2 bg-gray-200 rounded w-1/3"></div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <ErrorBoundary>
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
            <div className="mb-1 flex items-center justify-between gap-4 bg-white py-1 px-2 rounded-lg shadow-sm border border-gray-200">
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
            {savedMetrics?.length === 0  ? (
                <div className="flex items-center justify-center">
                    <div className="text-center">
                        <Activity className="animate-spin mx-auto mb-4 text-blue-600" size={40} />
                        <p className="text-gray-600 text-sm font-medium">Loading dashboard...</p>
                    </div>
                </div>
            ) : (
                <MetricsCards metrics={metricsStats} />
            )}
        </ErrorBoundary>
    )
}

export default DropCowboyServiceStats