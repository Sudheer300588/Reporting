import { useState, useEffect } from 'react';
import { MessageSquare, Eye, EyeOff, RefreshCw, Pencil, Trash2, Plus, CheckCircle, XCircle, EyeIcon } from 'lucide-react';
import { toast } from 'react-toastify';
import axios from 'axios';
import SettingsSection from './SettingsSection';
import { useSettings } from './SettingsLayout';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../utils/permissions';

const SmsClientsSettings = () => {
  const { canAccessSetting } = useSettings();
  const { user } = useAuth();
  const { canCreateClients, canEditClients, canDeleteClients } = usePermissions(user);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [syncingClientId, setSyncingClientId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    mauticUrl: '',
    username: '',
    password: ''
  });
  const [visibleUsers, setVisibleUsers] = useState({});

  const toggleUser = (id) => {
    setVisibleUsers(prev => ({
      ...prev,
      [id]: !prev[id]     // toggle only this row
    }));
  };

  const fetchClients = async () => {
    try {
      setLoading(true);
      const baseUrl = import.meta.env.VITE_API_URL || "";
      const response = await axios.get(`${baseUrl}/api/mautic/sms-clients`);
      setClients(response.data.data || []);
    } catch (error) {
      toast.error('Failed to load SMS clients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccessSetting('sms-clients')) {
      fetchClients();
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingClient && !canEditClients()) return;
    if (!editingClient && !canCreateClients()) return;
    const toastId = toast.loading(editingClient ? '⚙️ Updating SMS client...' : '⚙️ Creating SMS client...');

    try {
      const baseUrl = import.meta.env.VITE_API_URL || "";
      if (editingClient) {
        await axios.put(`${baseUrl}/api/mautic/sms-clients/${editingClient.id}`, formData);
        toast.update(toastId, { render: '✅ SMS client updated successfully!', type: 'success', isLoading: false, autoClose: 3000 });
      } else {
        await axios.post(`${baseUrl}/api/mautic/sms-clients`, formData);
        toast.update(toastId, { render: '✅ SMS client created successfully!', type: 'success', isLoading: false, autoClose: 3000 });
      }

      setIsModalOpen(false);
      setEditingClient(null);
      setShowPassword(false);
      setFormData({ name: '', mauticUrl: '', username: '', password: '' });
      await fetchClients();
    } catch (error) {
      toast.update(toastId, {
        render: `❌ ${error.response?.data?.message || 'Failed to save SMS client'}`,
        type: 'error',
        isLoading: false,
        autoClose: 5000
      });
    }
  };

  const handleEdit = (client) => {
    if (!canEditClients()) return;
    setEditingClient(client);
    setFormData({
      name: client.name,
      mauticUrl: client.mauticUrl,
      username: client.username,
      password: '' // Leave blank - user can enter new password to update
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (clientId) => {
    if (!canDeleteClients()) return;
    if (!confirm('⚠️ Are you sure you want to delete this SMS client?\n\nThis will permanently remove:\n• The SMS client\n• All associated SMS campaigns\n• All SMS statistics\n\nThis action cannot be undone.')) {
      return;
    }

    const toastId = toast.loading('⚙️ Deleting SMS client and related data...');
    try {
      const baseUrl = import.meta.env.VITE_API_URL || "";
      const response = await axios.delete(`${baseUrl}/api/mautic/sms-clients/${clientId}`);
      
      const deleted = response.data?.deleted || {};
      const message = `✅ SMS client deleted successfully!\n• ${deleted.campaigns || 0} campaigns removed\n• ${deleted.stats || 0} stats removed`;
      
      toast.update(toastId, { 
        render: message, 
        type: 'success', 
        isLoading: false, 
        autoClose: 5000 
      });
      
      await fetchClients();
    } catch (error) {
      toast.update(toastId, {
        render: `❌ ${error.response?.data?.message || 'Failed to delete SMS client'}`,
        type: 'error',
        isLoading: false,
        autoClose: 5000
      });
    }
  };

  const handleSync = async (clientId) => {
    if (!confirm('🔄 Sync SMS campaigns from this client? This may take a moment.')) {
      return;
    }

    setSyncingClientId(clientId);
    const toastId = toast.loading('⚙️ Syncing SMS campaigns...');
    try {
      const baseUrl = import.meta.env.VITE_API_URL || "";
      await axios.post(`${baseUrl}/api/mautic/sms-clients/${clientId}/sync`);
      toast.update(toastId, { render: '✅ SMS campaigns synced successfully!', type: 'success', isLoading: false, autoClose: 3000 });
      await fetchClients();
    } catch (error) {
      toast.update(toastId, {
        render: `❌ ${error.response?.data?.message || 'Failed to sync SMS client'}`,
        type: 'error',
        isLoading: false,
        autoClose: 5000
      });
    } finally {
      setSyncingClientId(null);
    }
  };

  const handleSyncAll = async () => {
    if (!confirm('🔄 Sync all SMS clients? This may take a few moments.')) {
      return;
    }

    setSyncingClientId('all');
    const toastId = toast.loading(`⚙️ Syncing ${clients.length} SMS client(s)...`);

    try {
      const baseUrl = import.meta.env.VITE_API_URL || "";
      let successCount = 0;
      let failCount = 0;

      for (const client of clients) {
        try {
          await axios.post(`${baseUrl}/api/mautic/sms-clients/${client.id}/sync`);
          successCount++;
        } catch (error) {
          failCount++;
        }
      }

      if (failCount === 0) {
        toast.update(toastId, {
          render: `✅ All ${successCount} SMS clients synced successfully!`,
          type: 'success',
          isLoading: false,
          autoClose: 3000
        });
      } else {
        toast.update(toastId, {
          render: `⚠️ Synced ${successCount} clients, ${failCount} failed`,
          type: 'warning',
          isLoading: false,
          autoClose: 5000
        });
      }

      await fetchClients();
    } catch (error) {
      toast.update(toastId, {
        render: `❌ ${error.response?.data?.message || 'Failed to sync SMS clients'}`,
        type: 'error',
        isLoading: false,
        autoClose: 5000
      });
    } finally {
      setSyncingClientId(null);
    }
  };

  if (!canAccessSetting('sms-clients')) return null;

  return (
    <>
      <SettingsSection id="sms-clients" className="mb-16">
        <div className="card">
          {/* Summary Card */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                    <MessageSquare className="mr-2" size={20} />
                    SMS Clients
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Manage SMS clients for campaigns without prefix matching
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-purple-600">{clients.length}</div>
                <div className="text-sm text-gray-600">Total Clients</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Configure SMS clients to sync campaigns from your Mautic instances
              </div>
              <div className="flex items-center gap-3">
                {canCreateClients() && (
                  <button
                    onClick={() => {
                      setEditingClient(null);
                      setShowPassword(false);
                      setFormData({ name: '', mauticUrl: '', username: '', password: '' });
                      setIsModalOpen(true);
                    }}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Client
                  </button>
                )}
                {(canCreateClients() || canEditClients()) && (
                  <button
                    onClick={handleSyncAll}
                    disabled={clients.length === 0 || syncingClientId !== null}
                    className="btn btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Sync all SMS clients"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncingClientId !== null ? 'animate-spin' : ''}`} />
                    Sync
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center items-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : clients.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No SMS clients configured</p>
                <p className="text-sm text-gray-400 mt-1">Add your first SMS client to get started</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client URL</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {clients.map((client) => (
                      <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{client.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <a
                            href={client.mauticUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition"
                          >
                            Launch
                          </a>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <div className="text-sm font-bold capitalize text-gray-900 first-letter:uppercase flex justify-start items-center gap-2">
                            {visibleUsers[client.id] ? (
                              <>
                                {client.username}
                                <button
                                  className="text-sm text-blue-700 cursor-pointer flex items-center gap-2"
                                  onClick={() => toggleUser(client.id)}
                                >
                                  <EyeOff size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                {client.username.replace(/./g, '*')}
                                <button
                                  className="text-sm text-blue-700 cursor-pointer flex items-center gap-2"
                                  onClick={() => toggleUser(client.id)}
                                >
                                  <EyeIcon size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {client.isActive ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              <XCircle className="w-3 h-3" />
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {canEditClients() && (
                              <button
                                onClick={() => handleSync(client.id)}
                                disabled={syncingClientId === client.id}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="Sync SMS campaigns"
                              >
                                <RefreshCw className={`w-4 h-4 ${syncingClientId === client.id ? 'animate-spin' : ''}`} />
                              </button>
                            )}
                            {canEditClients() && (
                              <button
                                onClick={() => handleEdit(client)}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Edit client"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            {canDeleteClients() && (
                              <button
                                onClick={() => handleDelete(client.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete client"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                            {!canEditClients() && !canDeleteClients() && (
                              <span className="text-xs text-gray-400 italic">Read only</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </SettingsSection>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">
              {editingClient ? 'Edit SMS Client' : 'Add SMS Client'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., JAE, Cortavo, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mautic URL *
                </label>
                <input
                  type="url"
                  value={formData.mauticUrl}
                  onChange={(e) => setFormData({ ...formData, mauticUrl: e.target.value })}
                  placeholder="https://jae.autovationpro.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="username"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {editingClient ? '' : '*'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required={!editingClient}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                {editingClient && (
                  <p className="text-xs text-gray-500 mt-1">Leave blank to keep existing password</p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingClient(null);
                    setShowPassword(false);
                    setFormData({ name: '', mauticUrl: '', username: '', password: '' });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                >
                  {editingClient ? 'Update Client' : 'Create Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default SmsClientsSettings;
