import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

export default function SmsClients() {
  const [smsClients, setSmsClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    mauticUrl: '',
    username: '',
    password: ''
  });
  const [syncing, setSyncing] = useState({});

  const baseUrl = import.meta.env.VITE_API_URL || '';

  useEffect(() => {
    fetchSmsClients();
  }, []);

  const fetchSmsClients = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${baseUrl}/api/mautic/sms-clients`);
      setSmsClients(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch SMS clients:', error);
      toast.error('Failed to load SMS clients');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingClient) {
        await axios.put(`${baseUrl}/api/mautic/sms-clients/${editingClient.id}`, formData);
        toast.success('SMS client updated successfully');
      } else {
        await axios.post(`${baseUrl}/api/mautic/sms-clients`, formData);
        toast.success('SMS client created successfully');
      }
      
      setShowModal(false);
      setFormData({ name: '', mauticUrl: '', username: '', password: '' });
      setEditingClient(null);
      fetchSmsClients();
    } catch (error) {
      console.error('Failed to save SMS client:', error);
      toast.error(error.response?.data?.message || 'Failed to save SMS client');
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      mauticUrl: client.mauticUrl,
      username: client.username,
      password: '' // Don't populate password for security
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this SMS client? All associated SMS campaigns will be removed.')) {
      return;
    }

    try {
      await axios.delete(`${baseUrl}/api/mautic/sms-clients/${id}`);
      toast.success('SMS client deleted successfully');
      fetchSmsClients();
    } catch (error) {
      console.error('Failed to delete SMS client:', error);
      toast.error('Failed to delete SMS client');
    }
  };

  const handleToggle = async (id) => {
    try {
      await axios.patch(`${baseUrl}/api/mautic/sms-clients/${id}/toggle`);
      toast.success('SMS client status updated');
      fetchSmsClients();
    } catch (error) {
      console.error('Failed to toggle SMS client:', error);
      toast.error('Failed to update status');
    }
  };

  const handleSync = async (id) => {
    try {
      setSyncing(prev => ({ ...prev, [id]: true }));
      await axios.post(`${baseUrl}/api/mautic/sms-clients/${id}/sync`);
      toast.success('SMS sync completed successfully');
      fetchSmsClients();
    } catch (error) {
      console.error('Failed to sync SMS client:', error);
      toast.error('Failed to sync SMS data');
    } finally {
      setSyncing(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingClient(null);
    setFormData({ name: '', mauticUrl: '', username: '', password: '' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading SMS clients...</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">📱 SMS Clients</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add SMS Client
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-4 px-6 font-semibold text-gray-700">Name</th>
              <th className="text-left py-4 px-6 font-semibold text-gray-700">Mautic URL</th>
              <th className="text-left py-4 px-6 font-semibold text-gray-700">Username</th>
              <th className="text-center py-4 px-6 font-semibold text-gray-700">SMS Count</th>
              <th className="text-center py-4 px-6 font-semibold text-gray-700">Status</th>
              <th className="text-center py-4 px-6 font-semibold text-gray-700">Last Sync</th>
              <th className="text-center py-4 px-6 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {smsClients.length === 0 ? (
              <tr>
                <td colSpan="7" className="py-8 text-center text-gray-500">
                  No SMS clients found. Create one to get started.
                </td>
              </tr>
            ) : (
              smsClients.map((client) => (
                <tr key={client.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-4 px-6 font-medium text-gray-800">{client.name}</td>
                  <td className="py-4 px-6 text-gray-600 text-sm">{client.mauticUrl}</td>
                  <td className="py-4 px-6 text-gray-600">{client.username}</td>
                  <td className="py-4 px-6 text-center">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      {client.smsCampaignsCount || 0}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-center">
                    <button
                      onClick={() => handleToggle(client.id)}
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        client.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {client.isActive ? '✓ Active' : '✗ Inactive'}
                    </button>
                  </td>
                  <td className="py-4 px-6 text-center text-sm text-gray-600">
                    {client.lastSyncAt
                      ? new Date(client.lastSyncAt).toLocaleString()
                      : 'Never'}
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleSync(client.id)}
                        disabled={syncing[client.id] || !client.isActive}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Sync SMS data"
                      >
                        {syncing[client.id] ? (
                          <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => handleEdit(client)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(client.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-2xl w-full mx-4">
            <h2 className="text-2xl font-bold mb-6">
              {editingClient ? 'Edit SMS Client' : 'Add SMS Client'}
            </h2>
            
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Client Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., JAE, Cortavo, etc."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mautic URL *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.mauticUrl}
                    onChange={(e) => setFormData({ ...formData, mauticUrl: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="https://jae.autovationpro.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="username"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password {editingClient ? '(leave blank to keep current)' : '*'}
                  </label>
                  <input
                    type="password"
                    required={!editingClient}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="mt-8 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingClient ? 'Update' : 'Create'} Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
