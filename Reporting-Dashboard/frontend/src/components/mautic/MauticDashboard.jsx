/**
 * Autovation  Dashboard  DashboardComponent
 * 
 * Main dashboard showing metrics and overview for Mautic integration
 */

import React, { useState } from 'react';
import { RefreshCw, AlertCircle, Mail, List, Target } from 'lucide-react';
import { toast } from 'react-toastify';
import { useDashboardMetrics, useClients, useSync } from '../../hooks/mautic';
import MetricsCards from './MetricsCards';
import ClientSelector from './ClientSelector';
import RealCampaignsSection from './RealCampaignsSection';
import CampaignsSection from './CampaignsSection'; // This shows Emails
import SegmentsSection from './SegmentsSection';

export default function MauticDashboard({ clientId = null, clientName = null }) {
  // If clientId is provided (from ClientDashboard), use it and lock it
  const [selectedClientId, setSelectedClientId] = useState(clientId);
  
  const [activeTab, setActiveTab] = useState('campaigns'); // 'campaigns', 'emails', 'segments'
  
  const { clients, loading: clientsLoading, refetch: refetchClients } = useClients();
  const { metrics, loading, error, refetch } = useDashboardMetrics(selectedClientId || clientId);
  const { syncAllClients, syncClient, isSyncing } = useSync();
  const [refreshKey, setRefreshKey] = useState(Date.now());
  
  // Hide client selector if clientId is provided (viewing single client)
  const isClientLocked = clientId !== null;

  const handleSync = async () => {
    // Show initial message with client count
    if (selectedClientId) {
      const confirmMessage = 'This will sync data from the selected client. Depending on the data size, this may take 1-2 minutes. Continue?';
      if (!window.confirm(confirmMessage)) {
        return;
      }
      toast.info('Starting Mautic sync... Please wait.', { autoClose: 3000 });
    } else {
      const activeClients = clients.filter(c => c.isActive).length;
      const estimatedMinutes = Math.ceil(activeClients / 5); // ~5 clients per minute with batching
      const confirmMessage = `This will sync ${activeClients} active client${activeClients !== 1 ? 's' : ''} in parallel batches.\n\nEstimated time: ${estimatedMinutes}-${estimatedMinutes + 2} minutes.\n\nContinue?`;
      if (!window.confirm(confirmMessage)) {
        return;
      }
      toast.info(`Syncing ${activeClients} clients... This may take ${estimatedMinutes}-${estimatedMinutes + 2} minutes.`, { autoClose: 5000 });
    }

    const result = selectedClientId
      ? await syncClient(selectedClientId)
      : await syncAllClients();
    
    if (result.success) {
      const message = result.data?.results 
        ? `Sync completed! ${result.data.results.successful}/${result.data.results.totalClients} clients synced successfully.`
        : result.message || 'Sync completed successfully!';
      toast.success(message, { autoClose: 5000 });
      refetch();
      refetchClients();
    } else {
      toast.error(result.error || result.message || 'Sync failed. Please try again.', { autoClose: 5000 });
    }
  };

  const handleClientChange = (clientId) => {
    setSelectedClientId(clientId);
  };

  const handleModalSuccess = () => {
    refetchClients();
    refetch();
  };

  // Listen to global sync-complete event (dispatched from Settings after sync)
  React.useEffect(() => {
    const handler = (evt) => {
      // Trigger refetch of dashboard data and clients
      refetchClients();
      refetch();
      // bump refresh key to signal child sections to refetch
      setRefreshKey(Date.now());
    };

    window.addEventListener('mautic:sync-complete', handler);
    return () => window.removeEventListener('mautic:sync-complete', handler);
  }, [refetchClients, refetch]);

  if (loading || clientsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-blue-600" size={32} />
        <span className="ml-3 text-gray-600">Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Autovation  Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Monitor your Autovation performance and email campaigns
        </p>
      </div>

      {/* No Clients Warning */}
      {clients.length === 0 && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <AlertCircle className="text-yellow-600 mx-auto mb-3" size={48} />
          <h3 className="text-lg font-semibold text-yellow-900 mb-2">No Autovation Clients Configured</h3>
          <p className="text-sm text-yellow-800 mb-4">
            You need to add at least one Mautic client to start syncing data.
          </p>
          {/* Client creation moved to Settings; open Settings to add clients */}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
          <AlertCircle className="text-red-600 mr-3 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-red-800 leading-relaxed">{error}</p>
        </div>
      )}

      {/* Controls */}
      <div className="mb-6 flex items-center justify-between gap-4 bg-white p-3 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center gap-4">
          {!isClientLocked && (
            <ClientSelector
              clients={clients}
              selectedClientId={selectedClientId}
              onChange={handleClientChange}
            />
          )}
          {isClientLocked && clientName && (
            <div className="px-4 py-2 bg-blue-100 text-blue-800 rounded-lg font-medium">
               Viewing: {clientName}
            </div>
          )}
        </div>
        
        <button
          onClick={handleSync}
          disabled={isSyncing || clients.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={clients.length === 0 ? 'Add a client first' : 'Sync data from Mautic (may take 1-3 minutes)'}
        >
          <RefreshCw className={isSyncing ? 'animate-spin' : ''} size={16} />
          {isSyncing ? 'Syncing... Please wait' : 'Sync Now'}
        </button>
      </div>

      {/* Clients management removed from dashboard (moved to Settings) */}

      {/* Metrics Cards - Show for selected client OR all clients */}
      {metrics && clients.length > 0 && (
        <>
          <MetricsCards metrics={metrics} />

          {/* Tabs Navigation */}
          <div className="bg-white rounded-lg shadow-sm mb-6 mt-6">
            <div className="border-b border-gray-200">
              <nav className="flex space-x-8 px-6" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('campaigns')}
                  className={`
                    flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                    ${activeTab === 'campaigns'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <Target className="w-4 h-4" />
                  <span>Campaigns</span>
                </button>

                <button
                  onClick={() => setActiveTab('emails')}
                  className={`
                    flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                    ${activeTab === 'emails'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <Mail className="w-4 h-4" />
                  <span>Emails</span>
                </button>

                <button
                  onClick={() => setActiveTab('segments')}
                  className={`
                    flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                    ${activeTab === 'segments'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <List className="w-4 h-4" />
                  <span>Segments</span>
                </button>
              </nav>
            </div>
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            {activeTab === 'campaigns' && <RealCampaignsSection clientId={selectedClientId} refreshKey={refreshKey} />}
            {activeTab === 'emails' && <CampaignsSection clientId={selectedClientId} refreshKey={refreshKey} />}
            {activeTab === 'segments' && <SegmentsSection clientId={selectedClientId} refreshKey={refreshKey} />}
          </div>
        </>
      )}

      {/* Client add/edit moved to Settings */}
    </div>
  );
}
