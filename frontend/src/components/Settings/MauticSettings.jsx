import { useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { toast } from 'react-toastify';
import { useClients, useSync } from '../../hooks/mautic';
import ClientsTable from '../mautic/ClientsTable';
import AddClientModal from '../mautic/AddClientModal';
import SettingsSection from './SettingsSection';
import { useSettings } from './SettingsLayout';

const MauticSettings = () => {
  const { canAccessSetting } = useSettings();
  const { clients, loading: mauticLoading, refetch: refetchClients } = useClients();
  const [isMauticModalOpen, setIsMauticModalOpen] = useState(false);
  const [editingMauticClient, setEditingMauticClient] = useState(null);
  const { syncAllClients, isSyncing } = useSync();

  const handleSyncClients = async () => {
    const toastId = toast.loading('Starting Mautic sync...');
    try {
      const result = await syncAllClients();

      if (result.success) {
        const message = result.data?.results
          ? `Sync completed: ${result.data.results.successful}/${result.data.results.totalClients} successful`
          : result.message || 'Sync completed successfully';
        toast.update(toastId, { render: message, type: 'success', isLoading: false, autoClose: 5000 });
        
        try {
          window.dispatchEvent(new CustomEvent('mautic:sync-complete', { detail: result }));
        } catch (e) {
          console.warn('Failed to dispatch sync event', e);
        }

        await refetchClients();
      } else if (result.isSyncing) {
        toast.update(toastId, { render: result.message || 'Sync already in progress', type: 'info', isLoading: false, autoClose: 4000 });
      } else {
        toast.update(toastId, { render: result.error || 'Sync failed', type: 'error', isLoading: false, autoClose: 5000 });
      }
    } catch (err) {
      toast.update(toastId, { render: err?.message || 'Failed to start sync', type: 'error', isLoading: false, autoClose: 5000 });
    }
  };

  if (!canAccessSetting('mautic')) return null;

  return (
    <SettingsSection id="mautic" className="mb-16">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <SettingsIcon className="mr-2" size={20} />
          Autovation Clients
        </h2>

        <div className="mb-4 text-sm text-gray-600">
          Manage Autovation (Mautic) clients used to sync data. You can add, edit or manage clients here.
        </div>

        <div className="mb-4 flex items-center justify-between">
          <div />
          <div className="flex gap-2">
            <button
              onClick={() => { setEditingMauticClient(null); setIsMauticModalOpen(true); }}
              className="btn btn-primary"
            >
              Add Client
            </button>
            <button
              onClick={handleSyncClients}
              className="btn btn-secondary flex items-center"
              disabled={isSyncing}
            >
              {isSyncing ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              ) : null}
              Sync
            </button>
          </div>
        </div>

        <div>
          <ClientsTable
            clients={clients}
            onEdit={(c) => { setEditingMauticClient(c); setIsMauticModalOpen(true); }}
            onRefresh={refetchClients}
          />
        </div>
      </div>

      <AddClientModal
        isOpen={isMauticModalOpen}
        onClose={() => { setIsMauticModalOpen(false); setEditingMauticClient(null); }}
        editClient={editingMauticClient}
        onSuccess={refetchClients}
      />
    </SettingsSection>
  );
};

export default MauticSettings;
