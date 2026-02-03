import { useState, useEffect } from 'react';
import { MessageSquare, CheckCircle, XCircle } from 'lucide-react';
import axios from 'axios';

const SmsSection = ({ clientId, refreshKey, accessibleClientIds }) => {
  const [smsCampaigns, setSmsCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSmsCampaigns = async () => {
      try {
        setLoading(true);
        setError(null);
        const baseUrl = import.meta.env.VITE_API_URL || "";
        
        if (clientId) {
          // Fetch for specific client
          const response = await axios.get(`${baseUrl}/api/mautic/clients/${clientId}/sms`);
          setSmsCampaigns(response.data.data || []);
        } else if (accessibleClientIds && accessibleClientIds.length > 0) {
          // Fetch for all accessible clients
          const requests = accessibleClientIds.map(id =>
            axios.get(`${baseUrl}/api/mautic/clients/${id}/sms`).catch(() => ({ data: { data: [] } }))
          );
          const responses = await Promise.all(requests);
          const allSms = responses.flatMap(r => r.data.data || []);
          setSmsCampaigns(allSms);
        } else {
          setSmsCampaigns([]);
        }
      } catch (err) {
        console.error('Error fetching SMS campaigns:', err);
        setError(err.message || 'Failed to load SMS campaigns');
      } finally {
        setLoading(false);
      }
    };

    fetchSmsCampaigns();
  }, [clientId, refreshKey, accessibleClientIds]);

  const totalSent = smsCampaigns.reduce((sum, sms) => sum + (sms.sentCount || 0), 0);
  const activeCampaigns = smsCampaigns.filter(sms => (sms.sentCount || 0) > 0).length;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <p className="font-medium">Error loading SMS campaigns</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600 mb-1">Total Campaigns</p>
              <p className="text-2xl font-bold text-blue-900">{smsCampaigns.length}</p>
            </div>
            <MessageSquare className="w-8 h-8 text-blue-500 opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-600 mb-1">Total Sent</p>
              <p className="text-2xl font-bold text-green-900">{totalSent.toLocaleString()}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500 opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-600 mb-1">Active Campaigns</p>
              <p className="text-2xl font-bold text-purple-900">{activeCampaigns}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-purple-500 opacity-50" />
          </div>
        </div>
      </div>

      {/* SMS Campaigns Table */}
      {smsCampaigns.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No SMS campaigns found</p>
          <p className="text-sm text-gray-400 mt-1">Create SMS campaigns in Mautic to see them here</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sent
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {smsCampaigns.map((sms) => (
                <tr key={sms.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center">
                      <MessageSquare className="w-5 h-5 text-blue-500 mr-3 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-900">{sms.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {sms.category?.title || sms.category?.alias || 'SMS'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-gray-900">
                      {(sms.sentCount || 0).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(sms.sentCount || 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        <XCircle className="w-3 h-3" />
                        Not Sent
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SmsSection;
